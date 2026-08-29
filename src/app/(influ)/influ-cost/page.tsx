import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canEditInflu, canViewInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { CostClient, type CostItem } from "./cost-client";

export const metadata: Metadata = {
  title: "Influencer Cost",
};

export default async function InfluCostPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data: items, error }, { data: assignees }, { data: profiles }] =
    await Promise.all([
      getAccess(),
    // รายการต้นทุนทั้งหมด join ข้อมูลเคส — ตารางโตช้า (หลักร้อยแถว) ดึงทั้งชุดแล้วกรองฝั่ง client
      supabase
        .from("influ_procedure_items")
        .select(
          "*, influencer:influencers(id, first_name, last_name, nickname, round_no, service_date, stage, contract_start, completed, archived, declined_at)"
        )
        .order("created_at", { ascending: false }),
      // ผู้รับผิดชอบของทุกเคส (0095) — ตัวกรอง "เคสของฉัน"
      supabase.from("influ_assignees").select("influencer_id, user_id"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <CostClient
        items={(items ?? []) as unknown as CostItem[]}
        assignees={assignees ?? []}
        people={(profiles ?? []).map((p) => ({
          id: p.id,
          name: p.full_name || p.email || "ไม่ทราบชื่อ",
        }))}
        meId={access.uid}
        canEdit={canEditInflu(access)}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
