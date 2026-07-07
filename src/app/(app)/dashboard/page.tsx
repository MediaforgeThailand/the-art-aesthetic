import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminRecordRow,
  SalesRecordRow,
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

export default async function DashboardPage() {
  const supabase = await createClient();

  // วันแรกของเดือนเมื่อ 11 เดือนก่อน → ครอบคลุมข้อมูลย้อนหลัง 12 เดือน
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startISO = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
    start.getDate()
  )}`;

  const [
    sales,
    adminRecords,
    targetsResult,
    kpisResult,
    { count: pendingCount },
    { data: demoTask },
  ] = await Promise.all([
    fetchAllRows<SalesRecordRow>(
      (from, to) =>
        supabase
          .from("sales_records")
          .select("*")
          .gte("record_date", startISO)
          .order("record_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      "ข้อมูลยอดขาย"
    ),
    fetchAllRows<AdminRecordRow>(
      (from, to) =>
        supabase
          .from("admin_records")
          .select("*")
          .gte("record_date", startISO)
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
      .eq("completed", false),
    supabase.from("tasks").select("id").eq("description", "demo").limit(1),
  ]);

  // เป้า/เป้า KPI โหลดพลาดต้อง throw — ถ้าปล่อยผ่านหน้าจะแสดงเหมือน "ยังไม่ตั้งเป้า" ซึ่งชวนเข้าใจผิด
  if (targetsResult.error) {
    throw new Error(`โหลดเป้าการขายไม่สำเร็จ: ${targetsResult.error.message}`);
  }
  if (kpisResult.error) {
    throw new Error(`โหลดเป้า KPI รายคนไม่สำเร็จ: ${kpisResult.error.message}`);
  }

  const salesDemo = sales.some((r) => r.note === "demo");
  const adminDemo = adminRecords.some((r) => r.note === "demo");
  const tasksDemo = (demoTask ?? []).length > 0;

  return (
    <PageContainer>
      <DashboardClient
        sales={sales}
        adminRecords={adminRecords}
        targets={(targetsResult.data ?? []) as SalesTargetRow[]}
        kpis={(kpisResult.data ?? []) as StaffKpiRow[]}
        pendingTasks={pendingCount ?? 0}
        salesDemo={salesDemo}
        adminDemo={adminDemo}
        tasksDemo={tasksDemo}
      />
    </PageContainer>
  );
}
