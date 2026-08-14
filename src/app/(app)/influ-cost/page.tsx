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
  const [access, { data: items, error }] = await Promise.all([
    getAccess(),
    // รายการต้นทุนทั้งหมด join ข้อมูลเคส — ตารางโตช้า (หลักร้อยแถว) ดึงทั้งชุดแล้วกรองฝั่ง client
    supabase
      .from("influ_procedure_items")
      .select(
        "*, influencer:influencers(id, first_name, last_name, nickname, service_date, stage, completed, archived, declined_at)"
      )
      .order("created_at", { ascending: false }),
  ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <CostClient
        items={(items ?? []) as unknown as CostItem[]}
        canEdit={canEditInflu(access)}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
