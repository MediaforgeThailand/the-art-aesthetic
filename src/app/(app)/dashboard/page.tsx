import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { todayISO } from "@/lib/format";
import {
  cutoffFor,
  EMPTY_SALES_SUMMARY,
  isPeriodKey,
  type MonthlySalesPoint,
  type PeriodKey,
  previousWindow,
  type SalesDashSummary,
  type SalesTotals,
} from "@/lib/report-utils";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminRecordRow,
  SalesTargetRow,
  StaffKpiRow,
} from "@/lib/types";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "แดชบอร์ดผู้บริหาร",
};

/** PostgREST ตัดผลลัพธ์ที่ ~1,000 แถว — ดึงแบบแบ่งหน้าจนครบเสมอ */
async function fetchAllRows<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await page(offset, offset + pageSize - 1);
    if (error) throw new Error(`โหลด${label}ไม่สำเร็จ: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const access = await getAccess();
  if (!hasPermission(access, "data")) return <AccessNotice />;

  const { period: rawPeriod } = await searchParams;
  const period: PeriodKey = isPeriodKey(rawPeriod) ? rawPeriod : "mtd";

  const supabase = await createClient();

  const today = todayISO();
  const cutoff = cutoffFor(period);
  const prevWin = previousWindow(cutoff, today);

  // เทรนด์รายเดือนโชว์สูงสุด 12 เดือน — เริ่มวันแรกของเดือนเมื่อ 11 เดือนก่อน
  const now = new Date(`${today}T00:00:00`);
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const trendStartISO = `${trendStart.getFullYear()}-${pad(
    trendStart.getMonth() + 1
  )}-${pad(trendStart.getDate())}`;

  const [
    summaryResult,
    prevTotalsResult,
    monthlyResult,
    adminRecords,
    targetsResult,
    kpisResult,
    { count: pendingCount },
    { data: demoTask },
    { data: demoSales },
    { data: lastSync },
  ] = await Promise.all([
    // ยอดขาย aggregate ใน SQL — ไม่โหลดรายบรรทัด (ข้อมูลจริงหลายหมื่นแถว)
    supabase.rpc("sales_dash_summary", { p_from: cutoff, p_to: today }),
    supabase.rpc("sales_totals", { p_from: prevWin.from, p_to: prevWin.to }),
    supabase.rpc("sales_monthly_series", { p_from: trendStartISO }),
    fetchAllRows<AdminRecordRow>(
      (from, to) =>
        supabase
          .from("admin_records")
          .select("*")
          .gte("record_date", trendStartISO)
          .order("record_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      "ข้อมูลทีมแอดมิน"
    ),
    // เป้าแผนก = แถวที่ branch เป็น null เท่านั้น (แถวรายสาขาไม่ใช่เป้ารวม)
    supabase
      .from("sales_targets")
      .select("*")
      .is("branch", null)
      .order("month", { ascending: true }),
    supabase.from("staff_kpis").select("*").order("month", { ascending: true }),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("completed", false)
      .is("deleted_at", null), // ไม่นับงานในถังขยะ
    supabase.from("tasks").select("id").eq("description", "demo").limit(1),
    supabase.from("sales_records").select("id").eq("note", "demo").limit(1),
    supabase
      .from("sheet_sync_runs")
      .select("finished_at")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (summaryResult.error) {
    throw new Error(`โหลดสรุปยอดขายไม่สำเร็จ: ${summaryResult.error.message}`);
  }
  if (monthlyResult.error) {
    throw new Error(
      `โหลดยอดขายรายเดือนไม่สำเร็จ: ${monthlyResult.error.message}`
    );
  }
  // เป้า/เป้า KPI โหลดพลาดต้อง throw — ถ้าปล่อยผ่านหน้าจะแสดงเหมือน "ยังไม่ตั้งเป้า" ซึ่งชวนเข้าใจผิด
  if (targetsResult.error) {
    throw new Error(`โหลดเป้าการขายไม่สำเร็จ: ${targetsResult.error.message}`);
  }
  if (kpisResult.error) {
    throw new Error(`โหลดเป้า KPI รายคนไม่สำเร็จ: ${kpisResult.error.message}`);
  }

  const summary =
    (summaryResult.data as unknown as SalesDashSummary | null) ??
    EMPTY_SALES_SUMMARY;
  const prevTotals = (prevTotalsResult.data as unknown as SalesTotals | null) ?? {
    total: 0,
    lines: 0,
    bills: 0,
  };
  const monthly =
    (monthlyResult.data as unknown as MonthlySalesPoint[] | null) ?? [];

  const salesDemo = (demoSales ?? []).length > 0;
  const adminDemo = adminRecords.some((r) => r.note === "demo");
  const tasksDemo = (demoTask ?? []).length > 0;

  return (
    <PageContainer>
      <DashboardClient
        period={period}
        cutoff={cutoff}
        summary={summary}
        prevTotals={prevTotals}
        monthly={monthly}
        adminRecords={adminRecords}
        targets={(targetsResult.data ?? []) as SalesTargetRow[]}
        kpis={(kpisResult.data ?? []) as StaffKpiRow[]}
        pendingTasks={pendingCount ?? 0}
        salesDemo={salesDemo}
        adminDemo={adminDemo}
        tasksDemo={tasksDemo}
        lastSyncAt={lastSync?.finished_at ?? null}
      />
    </PageContainer>
  );
}
