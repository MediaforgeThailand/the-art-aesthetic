import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import type { MonthlySalesPoint } from "@/lib/report-utils";
import { createClient } from "@/lib/supabase/server";
import type { SalesTargetRow } from "@/lib/types";
import { TargetsClient } from "./targets-client";

export const metadata: Metadata = {
  title: "เป้าหมาย vs ยอดจริง",
};

export default async function TargetsReportPage() {
  const supabase = await createClient();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startISO = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
    start.getDate()
  )}`;

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, monthlyResult, targetsResult, { data: demoSales }] =
    await Promise.all([
      getAccess(),
      // ยอดจริงรายเดือน aggregate ใน SQL — ไม่โหลดรายบรรทัด (ข้อมูลจริงหลายหมื่นแถว)
      supabase.rpc("sales_monthly_series", { p_from: startISO }),
      // เป้ารวมทั้งแผนก (branch = null)
      supabase
        .from("sales_targets")
        .select("*")
        .is("branch", null)
        .gte("month", startISO)
        .order("month", { ascending: true }),
      supabase.from("sales_records").select("id").eq("note", "demo").limit(1),
    ]);

  if (!hasPermission(access, "data")) return <AccessNotice />;

  if (monthlyResult.error) {
    throw new Error(`โหลดข้อมูลยอดขายไม่สำเร็จ: ${monthlyResult.error.message}`);
  }
  if (targetsResult.error) {
    throw new Error(`โหลดข้อมูลเป้าไม่สำเร็จ: ${targetsResult.error.message}`);
  }

  const monthly =
    (monthlyResult.data as unknown as MonthlySalesPoint[] | null) ?? [];
  const targets = (targetsResult.data ?? []) as SalesTargetRow[];

  const demo =
    targets.some((t) => t.note === "demo") || (demoSales ?? []).length > 0;

  return (
    <PageContainer>
      <TargetsClient
        actuals={monthly.map((m) => ({ month: m.month, amount: m.total }))}
        targets={targets.map((t) => ({
          month: t.month.slice(0, 7),
          amount: t.target_amount,
        }))}
        demo={demo}
      />
    </PageContainer>
  );
}
