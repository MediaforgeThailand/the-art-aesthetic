import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { SalesTargetRow } from "@/lib/types";
import { TargetsClient } from "./targets-client";

export const metadata: Metadata = {
  title: "เป้าหมาย vs ยอดจริง",
};

export default async function TargetsReportPage() {
  const access = await getAccess();
  if (!hasPermission(access, "data")) return <AccessNotice />;

  const supabase = await createClient();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startISO = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
    start.getDate()
  )}`;

  // เป้ารวมทั้งแผนก (branch = null) ยิงขนานกับลูปยอดขาย
  const targetsPromise = supabase
    .from("sales_targets")
    .select("*")
    .is("branch", null)
    .gte("month", startISO)
    .order("month", { ascending: true });

  const pageSize = 1000;
  const sales: { record_date: string; amount: number; note: string | null }[] =
    [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("sales_records")
      .select("record_date, amount, note")
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

  const { data: targetData, error: targetsError } = await targetsPromise;
  if (targetsError) {
    throw new Error(`โหลดข้อมูลเป้าไม่สำเร็จ: ${targetsError.message}`);
  }

  const targets = (targetData ?? []) as SalesTargetRow[];

  // รวมยอดจริงเป็นรายเดือน
  const actualByMonth = new Map<string, number>();
  for (const r of sales) {
    const key = r.record_date.slice(0, 7);
    actualByMonth.set(key, (actualByMonth.get(key) ?? 0) + r.amount);
  }

  const demo =
    targets.some((t) => t.note === "demo") ||
    sales.some((r) => r.note === "demo");

  return (
    <PageContainer>
      <TargetsClient
        actuals={[...actualByMonth.entries()].map(([month, amount]) => ({
          month,
          amount,
        }))}
        targets={targets.map((t) => ({
          month: t.month.slice(0, 7),
          amount: t.target_amount,
        }))}
        demo={demo}
      />
    </PageContainer>
  );
}
