import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
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

  const { data: kpiData } = await kpisPromise;
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
