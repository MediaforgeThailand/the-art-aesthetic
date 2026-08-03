import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { AdminRecordRow, StaffKpiRow } from "@/lib/types";
import { AdminClient } from "./admin-client";

export const metadata: Metadata = {
  title: "ผลงานทีมแอดมิน",
};

export default async function AdminReportPage() {
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
    .eq("team", "admin")
    .order("month", { ascending: true });

  // ดึง records แบบแบ่งหน้า (PostgREST ตัดที่ ~1,000 แถว)
  const fetchRecords = async (): Promise<AdminRecordRow[]> => {
    const pageSize = 1000;
    const records: AdminRecordRow[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("admin_records")
        .select("*")
        .gte("record_date", startISO)
        .order("record_date", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(`โหลดข้อมูลทีมแอดมินไม่สำเร็จ: ${error.message}`);
      }
      records.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return records;
  };

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, records, { data: kpiData, error: kpiError }] =
    await Promise.all([getAccess(), fetchRecords(), kpisPromise]);
  if (!hasPermission(access, "data")) return <AccessNotice />;
  // เป้า KPI โหลดพลาดต้อง throw — ถ้าปล่อยผ่านหน้าจะแสดงเหมือน "ยังไม่ตั้งเป้า" ซึ่งชวนเข้าใจผิด
  if (kpiError) {
    throw new Error(`โหลดเป้า KPI ไม่สำเร็จ: ${kpiError.message}`);
  }
  const demo = records.some((r) => r.note === "demo");

  return (
    <PageContainer>
      <AdminClient
        records={records}
        kpis={(kpiData ?? []) as StaffKpiRow[]}
        demo={demo}
      />
    </PageContainer>
  );
}
