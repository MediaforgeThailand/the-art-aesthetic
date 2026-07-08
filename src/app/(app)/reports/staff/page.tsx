import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { SalesRecordRow, StaffKpiRow } from "@/lib/types";
import { StaffClient } from "./staff-client";

export const metadata: Metadata = {
  title: "ผลงานพนักงานขาย",
};

export default async function StaffReportPage() {
  const access = await getAccess();
  if (!hasPermission(access, "data")) return <AccessNotice />;

  const supabase = await createClient();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startISO = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
    start.getDate()
  )}`;

  const kpisPromise = supabase
    .from("staff_kpis")
    .select("*")
    .eq("team", "sales")
    .order("month", { ascending: true });

  // ดึงแบบแบ่งหน้ากัน PostgREST ตัดที่ 1,000 แถว
  const pageSize = 1000;
  const sales: SalesRecordRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("sales_records")
      .select("*")
      .gte("record_date", startISO)
      .order("record_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`โหลดข้อมูลยอดขายไม่สำเร็จ: ${error.message}`);
    }
    sales.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const { data: kpiData, error: kpiError } = await kpisPromise;
  // เป้า KPI โหลดพลาดต้อง throw — ถ้าปล่อยผ่านหน้าจะแสดงเหมือน "ยังไม่ตั้งเป้า" ซึ่งชวนเข้าใจผิด
  if (kpiError) {
    throw new Error(`โหลดเป้า KPI ไม่สำเร็จ: ${kpiError.message}`);
  }
  const salesDemo = sales.some((r) => r.note === "demo");

  return (
    <PageContainer>
      <StaffClient
        sales={sales}
        kpis={(kpiData ?? []) as StaffKpiRow[]}
        salesDemo={salesDemo}
      />
    </PageContainer>
  );
}
