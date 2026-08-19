import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canViewInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  DashboardClient,
  type DashCostItem,
  type DashInflu,
  type DashTask,
} from "./dashboard-client";

export const metadata: Metadata = {
  title: "Influ Dashboard",
};

export default async function InfluDashboardPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    access,
    { data: influencers, error },
    { data: items, error: itemsError },
    { data: tasks, error: tasksError },
    { data: prospects },
  ] = await Promise.all([
      getAccess(),
      // เฉพาะเคสใน pipeline (archive = ข้อมูลนำเข้าเก่า ไม่นับในแดชบอร์ด)
      supabase
        .from("influencers")
        .select(
          "id, first_name, last_name, nickname, followers, tier, stage, completed, declined_at, service_date, doctor_name, procedure_text, contract_start, contract_months, followup_mode, created_at"
        )
        .eq("archived", false),
      // รายการต้นทุน — join ฝั่ง client กับลิสต์ influ ข้างบน (ของเคส archive ถูกทิ้งไปเอง)
      supabase
        .from("influ_procedure_items")
        .select("id, influencer_id, price, is_supported"),
      // งาน follow-up (stage 6) — นับข้อค้างตามโหมดของแต่ละเคส
      supabase.from("influ_tasks").select("influencer_id, done, is_custom"),
      // บอร์ด Hunting (0081) — การ์ด "รอตอบรับ" เดิมนับ stage 1 ซึ่งย้ายออกไปแล้ว
      supabase.from("influ_prospects").select("status"),
    ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <DashboardClient
        influencers={(influencers ?? []) as DashInflu[]}
        items={(items ?? []) as DashCostItem[]}
        tasks={(tasks ?? []) as DashTask[]}
        prospectStatuses={(prospects ?? []).map((p) => p.status)}
        // error ของ query ต้นทุน/follow-up ต้องแจ้งด้วย ไม่งั้นการ์ดขึ้น ฿0 เหมือน
        // "ยังไม่มีใครกรอกต้นทุน" ทั้งที่จริงคือโหลดข้อมูลไม่สำเร็จ
        loadError={
          error?.message ??
          (itemsError ? `โหลดต้นทุนไม่สำเร็จ: ${itemsError.message}` : null) ??
          (tasksError ? `โหลดงาน follow-up ไม่สำเร็จ: ${tasksError.message}` : null)
        }
      />
    </PageContainer>
  );
}
