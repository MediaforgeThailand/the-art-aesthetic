"use client";

import { Goal, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DemoBadge, DemoBanner } from "@/components/demo-badge";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatCurrency, formatMonthKey, todayISO } from "@/lib/format";
import { AXIS_TICK, compactBaht, TOOLTIP_STYLE } from "@/lib/report-utils";

interface MonthRow {
  month: string;
  actual: number;
  target: number | null;
  pct: number | null;
}

function achievementClass(pct: number | null): string {
  if (pct === null) return "text-stone-400";
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 80) return "text-amber-600";
  return "text-rose-600";
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  demo,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  demo: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={19} />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-stone-500">
            {label}
            {demo && <DemoBadge />}
          </p>
          <p className="truncate text-xl font-semibold tabular-nums text-stone-900">
            {value}
          </p>
          {sub && <p className="text-xs text-stone-400">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

export function TargetsClient({
  actuals,
  targets,
  demo,
}: {
  actuals: { month: string; amount: number }[];
  targets: { month: string; amount: number }[];
  demo: boolean;
}) {
  const rows = useMemo<MonthRow[]>(() => {
    const targetMap = new Map(targets.map((t) => [t.month, t.amount]));
    const months = new Set([
      ...actuals.map((a) => a.month),
      ...targets.map((t) => t.month),
    ]);
    const actualMap = new Map(actuals.map((a) => [a.month, a.amount]));
    return [...months]
      .sort()
      .map((month) => {
        const actual = actualMap.get(month) ?? 0;
        const target = targetMap.get(month) ?? null;
        return {
          month,
          actual,
          target,
          pct: target && target > 0 ? (actual / target) * 100 : null,
        };
      });
  }, [actuals, targets]);

  const todayStr = todayISO(); // เวลาไทย — ไม่ใช้ toISOString (UTC) เดี๋ยวเดือนเพี้ยนช่วงหัวค่ำ-เที่ยงคืน
  const currentMonth = todayStr.slice(0, 7);
  const current = rows.find((r) => r.month === currentMonth) ?? null;

  // เดือนอนาคตยังไม่มียอดจริง ถ้าเอาเป้ามาบวกจะกด % รวมให้ต่ำเกินจริงทันทีที่ทีมตั้งเป้าล่วงหน้า
  const withTarget = rows.filter(
    (r) => r.target !== null && r.month <= currentMonth
  );
  const totalActual = withTarget.reduce((s, r) => s + r.actual, 0);
  // เดือนปัจจุบันยังไม่จบ — คิดเป้าตามสัดส่วนวันที่ผ่านไป ให้ % รวมเทียบยุติธรรม
  const totalTarget = withTarget.reduce((s, r) => {
    if (r.month === currentMonth && r.target) {
      const [y, m] = currentMonth.split("-").map(Number);
      const dim = new Date(y, m, 0).getDate();
      return s + r.target * (Number(todayStr.slice(8, 10)) / dim);
    }
    return s + (r.target ?? 0);
  }, 0);
  const overallPct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : null;
  // นับเฉพาะเดือนที่จบแล้ว (ก่อนเดือนปัจจุบันตามเวลาไทย) — เดือนที่ยังไม่จบแทบจะยังไม่ถึงเป้าเสมอ
  // ถ้านับรวมจะกดอัตราสำเร็จต่ำเกินจริง (แดชบอร์ดหลักก็นับแบบเดียวกัน)
  const finishedWithTarget = withTarget.filter((r) => r.month < currentMonth);
  const monthsHit = finishedWithTarget.filter(
    (r) => r.pct !== null && r.pct >= 100
  ).length;

  const chartData = rows.map((r) => ({
    month: r.month,
    actual: r.actual,
    target: r.target,
  }));

  return (
    <>
      <PageHeader
        title="เป้าหมาย vs ยอดจริง"
        description="เทียบยอดขายจริงกับเป้ารายเดือนของแผนก"
      />

      {demo && <DemoBanner onWhat="ข้อมูลเป้าและยอดขาย" />}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Goal size={40} strokeWidth={1.5} />}
            title="ยังไม่มีข้อมูลเป้าหมาย"
            description="ข้อมูลเป้ารายเดือนจะมาจากไฟล์ของทีม (ดูใบขอข้อมูล DATA-REQUEST.md)"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Goal,
                label: `เดือนนี้ (${formatMonthKey(currentMonth)})`,
                value: current
                  ? `${formatCurrency(current.actual)}${
                      current.target ? ` / ${formatCurrency(current.target)}` : ""
                    }`
                  : "-",
                sub:
                  current?.pct !== null && current?.pct !== undefined
                    ? `ทำได้ ${current.pct.toFixed(0)}% ของเป้า`
                    : "ยังไม่ตั้งเป้าเดือนนี้",
              },
              {
                icon: TrendingUp,
                label: "รวมทุกเดือนที่มีเป้า",
                value: overallPct !== null ? `${overallPct.toFixed(0)}%` : "-",
                sub: `${formatCurrency(totalActual)} จากเป้า ${formatCurrency(totalTarget)}`,
              },
              {
                icon: Trophy,
                label: "เดือนที่ทำได้ตามเป้า",
                value: `${monthsHit} / ${finishedWithTarget.length} เดือน`,
                sub: "นับเฉพาะเดือนที่จบแล้วและตั้งเป้าไว้",
              },
            ].map((kpi, i) => (
              <div
                key={kpi.label}
                className="animate-fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <KpiCard
                  icon={kpi.icon}
                  label={kpi.label}
                  value={kpi.value}
                  sub={kpi.sub}
                  demo={demo}
                />
              </div>
            ))}
          </div>

          {/* กราฟ */}
          <Card className="p-5 animate-fade-in-up">
            <div className="mb-4 flex items-center gap-2">
              <Goal size={16} className="text-brand-600" />
              <h2 className="text-sm font-semibold text-stone-900">
                ยอดจริง (แท่ง) เทียบเป้า (เส้น) รายเดือน
              </h2>
              {demo && <DemoBadge />}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e7e5e4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v) => formatMonthKey(String(v))}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => compactBaht(Number(v))}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: "#faf6f3" }}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(label) => formatMonthKey(String(label))}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Bar
                    dataKey="actual"
                    name="ยอดจริง"
                    fill="#a96a58"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="เป้า"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* ตารางรายเดือน */}
          <Card className="overflow-hidden animate-fade-in-up">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium text-stone-500">
                    <th className="px-5 py-3">เดือน</th>
                    <th className="px-4 py-3 text-right">เป้า</th>
                    <th className="px-4 py-3 text-right">ยอดจริง</th>
                    <th className="px-4 py-3 text-right">ส่วนต่าง</th>
                    <th className="px-5 py-3">% ทำได้</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {[...rows].reverse().map((r) => {
                    const diff = r.target !== null ? r.actual - r.target : null;
                    return (
                      <tr
                        key={r.month}
                        className="transition-colors hover:bg-brand-50/40"
                      >
                        <td className="px-5 py-3 font-medium text-stone-800">
                          {formatMonthKey(r.month)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                          {r.target !== null ? formatCurrency(r.target) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-stone-900">
                          {formatCurrency(r.actual)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${
                            diff === null
                              ? "text-stone-400"
                              : diff >= 0
                                ? "text-emerald-600"
                                : "text-rose-600"
                          }`}
                        >
                          {diff === null
                            ? "-"
                            : `${diff >= 0 ? "+" : ""}${formatCurrency(diff)}`}
                        </td>
                        <td className="px-5 py-3">
                          {r.pct === null ? (
                            <span className="text-stone-300">ไม่ได้ตั้งเป้า</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-28 overflow-hidden rounded-full bg-stone-100">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    r.pct >= 100
                                      ? "bg-emerald-500"
                                      : r.pct >= 80
                                        ? "bg-amber-400"
                                        : "bg-rose-400"
                                  }`}
                                  style={{ width: `${Math.min(r.pct, 100)}%` }}
                                />
                              </div>
                              <span
                                className={`w-12 text-right text-xs font-semibold tabular-nums ${achievementClass(r.pct)}`}
                              >
                                {r.pct.toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
