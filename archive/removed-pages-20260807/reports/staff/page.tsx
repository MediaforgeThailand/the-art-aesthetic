import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { todayISO } from "@/lib/format";
import {
  cutoffFor,
  EMPTY_SALES_SUMMARY,
  isPeriodKey,
  type PeriodKey,
  type SalesDashSummary,
} from "@/lib/report-utils";
import { createClient } from "@/lib/supabase/server";
import type { StaffKpiRow } from "@/lib/types";
import { StaffClient } from "./staff-client";

export const metadata: Metadata = {
  title: "ผลงานพนักงานขาย",
};

export default async function StaffReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: rawPeriod } = await searchParams;
  const period: PeriodKey = isPeriodKey(rawPeriod) ? rawPeriod : "6m";

  const supabase = await createClient();
  const today = todayISO();
  const cutoff = cutoffFor(period);

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, summaryResult, kpisResult, { data: demoSales }] =
    await Promise.all([
      getAccess(),
      // aggregate ใน SQL — ข้อมูลจริงเป็นรายบรรทัดหลายหมื่นแถว ไม่โหลดมาทั้งก้อน
      supabase.rpc("sales_dash_summary", { p_from: cutoff, p_to: today }),
      supabase
        .from("staff_kpis")
        .select("*")
        .eq("team", "sales")
        .order("month", { ascending: true }),
      supabase.from("sales_records").select("id").eq("note", "demo").limit(1),
    ]);
  if (!hasPermission(access, "data")) return <AccessNotice />;

  if (summaryResult.error) {
    throw new Error(`โหลดข้อมูลยอดขายไม่สำเร็จ: ${summaryResult.error.message}`);
  }
  // เป้า KPI โหลดพลาดต้อง throw — ถ้าปล่อยผ่านหน้าจะแสดงเหมือน "ยังไม่ตั้งเป้า" ซึ่งชวนเข้าใจผิด
  if (kpisResult.error) {
    throw new Error(`โหลดเป้า KPI ไม่สำเร็จ: ${kpisResult.error.message}`);
  }

  const summary =
    (summaryResult.data as unknown as SalesDashSummary | null) ??
    EMPTY_SALES_SUMMARY;

  return (
    <PageContainer>
      <StaffClient
        period={period}
        cutoff={cutoff}
        summary={summary}
        kpis={(kpisResult.data ?? []) as StaffKpiRow[]}
        salesDemo={(demoSales ?? []).length > 0}
      />
    </PageContainer>
  );
}
