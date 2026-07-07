"use client";

import {
  Banknote,
  BarChart3,
  ClipboardList,
  Goal,
  MessageCircle,
  PieChart,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  TrendingUp,
  Trophy,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DemoBanner } from "@/components/demo-badge";
import {
  DeltaChip,
  HeroCard,
  MiniStat,
  PersonKpiBar,
  SectionTitle,
  TargetProgress,
} from "@/components/report-viz";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  formatCurrency,
  formatDate,
  formatMonthKey,
  formatNumber,
  todayISO,
} from "@/lib/format";
import {
  AXIS_TICK,
  compactBaht,
  cutoffFor,
  PERIOD_BUTTON_ACTIVE,
  PERIOD_BUTTON_IDLE,
  PERIOD_LABEL,
  PERIOD_OPTIONS,
  type PeriodKey,
  sumTargetsForPeriod,
  TEAM_COLORS,
  TOOLTIP_STYLE,
} from "@/lib/report-utils";
import type {
  AdminRecordRow,
  SalesRecordRow,
  SalesTargetRow,
  StaffKpiRow,
} from "@/lib/types";
import { CategoryDonutChart } from "./charts";

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** ช่วงก่อนหน้าที่ยาวเท่ากัน สำหรับชิปเปรียบเทียบ */
function previousWindow(
  cutoffISO: string,
  todayStr: string
): { from: string; to: string } {
  const cutoff = new Date(cutoffISO);
  const today = new Date(todayStr);
  const days = Math.round((today.getTime() - cutoff.getTime()) / 86400000) + 1;
  const from = new Date(cutoff);
  from.setDate(from.getDate() - days);
  const to = new Date(cutoff);
  to.setDate(to.getDate() - 1);
  return { from: isoLocal(from), to: isoLocal(to) };
}

/* ---------- section แบ่งรายงาน — คนละโทนสีให้เห็นชัดว่าเปลี่ยนเรื่อง ---------- */

const SECTION_TONES = {
  brand: {
    wrap: "border-brand-100/70 bg-brand-50/30",
    bar: "from-brand-400 to-brand-600",
    iconBg: "bg-brand-100 text-brand-700",
  },
  violet: {
    wrap: "border-violet-100/70 bg-violet-50/30",
    bar: "from-violet-400 to-violet-600",
    iconBg: "bg-violet-100 text-violet-700",
  },
  sky: {
    wrap: "border-sky-100/70 bg-sky-50/30",
    bar: "from-sky-400 to-sky-600",
    iconBg: "bg-sky-100 text-sky-700",
  },
  emerald: {
    wrap: "border-emerald-100/70 bg-emerald-50/30",
    bar: "from-emerald-400 to-emerald-600",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  stone: {
    wrap: "border-stone-200/70 bg-stone-50/30",
    bar: "from-stone-300 to-stone-500",
    iconBg: "bg-stone-200 text-stone-600",
  },
} as const;

function Section({
  icon: Icon,
  title,
  desc,
  tone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: keyof typeof SECTION_TONES;
  children: React.ReactNode;
}) {
  const t = SECTION_TONES[tone];
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${t.wrap}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`h-11 w-1.5 shrink-0 rounded-full bg-gradient-to-b ${t.bar}`} />
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.iconBg}`}
        >
          <Icon size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold leading-tight text-stone-900">
            {title}
          </h2>
          <p className="text-xs text-stone-500">{desc}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function DashboardClient({
  sales,
  adminRecords,
  targets,
  kpis,
  pendingTasks,
  salesDemo,
  adminDemo,
  tasksDemo,
}: {
  sales: SalesRecordRow[];
  adminRecords: AdminRecordRow[];
  targets: SalesTargetRow[];
  kpis: StaffKpiRow[];
  pendingTasks: number;
  salesDemo: boolean;
  adminDemo: boolean;
  tasksDemo: boolean;
}) {
  // default = วันที่ 1 ของเดือนนี้ถึงวันนี้ (เวลาไทย)
  const [period, setPeriod] = useState<PeriodKey>("mtd");
  const today = todayISO();
  const cutoff = useMemo(() => cutoffFor(period), [period]);

  /* ---------- ตัวเลขหลักช่วงที่เลือก ---------- */

  const inPeriod = useMemo(
    () => sales.filter((r) => r.record_date >= cutoff),
    [sales, cutoff]
  );
  const adminInPeriod = useMemo(
    () => adminRecords.filter((r) => r.record_date >= cutoff),
    [adminRecords, cutoff]
  );

  const prevWin = useMemo(() => previousWindow(cutoff, today), [cutoff, today]);
  // ข้อมูลโหลดย้อนหลัง 12 เดือน — ช่วงเทียบที่เลยไปก่อนหน้านั้นให้ซ่อนชิปแทนการเทียบข้อมูลที่ถูกตัด
  const prevCovered = useMemo(() => {
    const n = new Date(today);
    const loadStart = isoLocal(new Date(n.getFullYear(), n.getMonth() - 11, 1));
    return prevWin.from >= loadStart;
  }, [prevWin, today]);

  const prevRows = useMemo(
    () =>
      sales.filter(
        (r) => r.record_date >= prevWin.from && r.record_date <= prevWin.to
      ),
    [sales, prevWin]
  );
  const prevSalesTotal = prevRows.reduce((s, r) => s + r.amount, 0);
  const prevBills = prevRows.length;

  const periodTotal = inPeriod.reduce((s, r) => s + r.amount, 0);
  const periodBills = inPeriod.length;
  const bucketSize = periodBills > 0 ? periodTotal / periodBills : 0;
  const prevBucket = prevBills > 0 ? prevSalesTotal / prevBills : 0;

  /* ---------- เป้าการขายช่วงที่เลือก (prorate เดือนที่ยังไม่จบ) ---------- */

  const periodTarget = useMemo(
    () => sumTargetsForPeriod(targets, cutoff, today),
    [targets, cutoff, today]
  );

  /* ---------- ผลงานรายคน: ทีมขาย ---------- */

  const salesByPerson = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    // เริ่มจากทุกคนที่มีเป้า KPI ในช่วง — คนที่ยอดเป็นศูนย์ต้องยังโผล่ (และเป้านับรวมทีม)
    const cutoffMonth = cutoff.slice(0, 7);
    const curMonth = today.slice(0, 7);
    for (const k of kpis) {
      const m = k.month.slice(0, 7);
      if (k.team === "sales" && m >= cutoffMonth && m <= curMonth) {
        if (!map.has(k.person_name)) map.set(k.person_name, { total: 0, count: 0 });
      }
    }
    for (const r of inPeriod) {
      const name = r.staff_name?.trim() || "ไม่ระบุ";
      const cur = map.get(name) ?? { total: 0, count: 0 };
      cur.total += r.amount;
      cur.count += 1;
      map.set(name, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        total: v.total,
        count: v.count,
        bucket: v.count > 0 ? v.total / v.count : 0,
        target: sumTargetsForPeriod(
          kpis.filter((k) => k.team === "sales" && k.person_name === name),
          cutoff,
          today
        ),
      }))
      .sort((a, b) => b.total - a.total);
  }, [inPeriod, kpis, cutoff, today]);

  /* ---------- ผลงานรายคน: ทีมแอดมิน ---------- */

  const adminByPerson = useMemo(() => {
    const map = new Map<
      string,
      { closed: number; bookings: number; leads: number }
    >();
    const cutoffMonth = cutoff.slice(0, 7);
    const curMonth = today.slice(0, 7);
    for (const k of kpis) {
      const m = k.month.slice(0, 7);
      if (k.team === "admin" && m >= cutoffMonth && m <= curMonth) {
        if (!map.has(k.person_name)) {
          map.set(k.person_name, { closed: 0, bookings: 0, leads: 0 });
        }
      }
    }
    for (const r of adminInPeriod) {
      const name = r.admin_name?.trim() || "ไม่ระบุ";
      const cur = map.get(name) ?? { closed: 0, bookings: 0, leads: 0 };
      cur.closed += r.closed_amount;
      cur.bookings += r.bookings;
      cur.leads += r.new_leads;
      map.set(name, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        ...v,
        perDeal: v.bookings > 0 ? v.closed / v.bookings : 0,
        target: sumTargetsForPeriod(
          kpis.filter((k) => k.team === "admin" && k.person_name === name),
          cutoff,
          today
        ),
      }))
      .sort((a, b) => b.closed - a.closed);
  }, [adminInPeriod, kpis, cutoff, today]);

  const adminTotals = useMemo(() => {
    let closed = 0;
    let leads = 0;
    let bookings = 0;
    for (const r of adminInPeriod) {
      closed += r.closed_amount;
      leads += r.new_leads;
      bookings += r.bookings;
    }
    return { closed, leads, bookings };
  }, [adminInPeriod]);

  const salesTeamTarget = salesByPerson.reduce((s, p) => s + p.target, 0);
  const salesMax = Math.max(
    1,
    ...salesByPerson.map((p) => Math.max(p.total, p.target))
  );
  const adminMax = Math.max(
    1,
    ...adminByPerson.map((p) => Math.max(p.closed, p.target))
  );

  /* ---------- เทรนด์รายเดือน ---------- */

  const trendData = useMemo(() => {
    const monthsBack = period === "12m" ? 12 : 6;
    const now = new Date(today);
    const rows: {
      month: string;
      income: number;
      closed: number;
      target: number | null;
    }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      rows.push({
        month: key,
        income: sales
          .filter((r) => r.record_date.slice(0, 7) === key)
          .reduce((s, r) => s + r.amount, 0),
        closed: adminRecords
          .filter((r) => r.record_date.slice(0, 7) === key)
          .reduce((s, r) => s + r.closed_amount, 0),
        target:
          targets.find((t) => t.month.slice(0, 7) === key)?.target_amount ??
          null,
      });
    }
    return rows;
  }, [sales, adminRecords, targets, period, today]);

  /* ---------- แอดมินรายวัน: ทักใหม่ vs จองนัด ---------- */

  const dailyAdmin = useMemo(() => {
    const map = new Map<string, { leads: number; bookings: number }>();
    for (const r of adminInPeriod) {
      const cur = map.get(r.record_date) ?? { leads: 0, bookings: 0 };
      cur.leads += r.new_leads;
      cur.bookings += r.bookings;
      map.set(r.record_date, cur);
    }
    return [...map.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [adminInPeriod]);

  /* ---------- เป้าหมาย vs ยอดจริง (สรุปรายเดือน) ---------- */

  const targetStats = useMemo(() => {
    const withTarget = trendData.filter(
      (r) => r.target !== null && r.month <= today.slice(0, 7)
    );
    const hit = withTarget.filter(
      (r) => r.month < today.slice(0, 7) && r.income >= (r.target ?? 0)
    ).length;
    const finished = withTarget.filter((r) => r.month < today.slice(0, 7)).length;
    return { hit, finished };
  }, [trendData, today]);

  /* ---------- สัดส่วนหมวดหมู่ + สาขา + Top 5 ---------- */

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of inPeriod) {
      const c = r.category?.trim() || "ไม่ระบุ";
      map.set(c, (map.get(c) ?? 0) + r.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [inPeriod]);

  const byBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of inPeriod) {
      const b = r.branch?.trim() || "ไม่ระบุ";
      map.set(b, (map.get(b) ?? 0) + r.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [inPeriod]);

  const topItems = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of inPeriod) {
      const item = r.item_name?.trim() || "ไม่ระบุ";
      const cur = map.get(item) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += r.amount;
      map.set(item, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [inPeriod]);

  /* ---------- render ---------- */

  if (sales.length === 0) {
    return (
      <div>
        <PageHeader
          title="แดชบอร์ดผู้บริหาร"
          description="รายงานทุกส่วนในหน้าเดียว"
        />
        <Card>
          <EmptyState
            icon={<BarChart3 size={40} />}
            title="ยังไม่มีข้อมูลยอดขาย"
            description="ข้อมูลยอดขายจะซิงก์มาจากไฟล์ของทีม DA โดยอัตโนมัติ"
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="แดชบอร์ดผู้บริหาร"
        description="รายงานทุกส่วนในหน้าเดียว — เลื่อนลงเพื่อดูครบทุก section ตัวกรองด้านล่างใช้ร่วมกันทั้งหน้า"
      />

      {(salesDemo || adminDemo || tasksDemo) && (
        <DemoBanner onWhat="ข้อมูลยอดขายและผลงานทีม" />
      )}

      {/* ---------- ตัวกรองรวม: กล่องกระจกลอย sticky ตาม scroll ---------- */}
      <div className="sticky top-2 z-30 mb-6">
        <div className="glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 shadow-[0_10px_32px_rgba(94,58,49,0.16)]">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-700">
            <SlidersHorizontal size={15} className="text-brand-600" />
            ช่วงเวลา
          </span>
          <div className="flex flex-wrap gap-1">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriod(option.key)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
                  period === option.key ? PERIOD_BUTTON_ACTIVE : PERIOD_BUTTON_IDLE
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs tabular-nums text-stone-400">
            {PERIOD_LABEL[period]} · {formatDate(cutoff)} – {formatDate(today)}
          </span>
        </div>
      </div>

      <div className="space-y-8">
        {/* ================= 1) ภาพรวมยอดขาย ================= */}
        <Section
          icon={Banknote}
          title="ภาพรวมยอดขาย"
          desc="Income รวม บิล Bucket size และองค์ประกอบรายได้ของแผนก Aesthetic"
          tone="brand"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroCard
              icon={Banknote}
              label="ยอด Income รวม"
              value={formatCurrency(periodTotal)}
              delta={
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-medium tabular-nums text-stone-500">
                    ({formatNumber(periodBills)} บิล)
                  </span>
                  <DeltaChip
                    current={periodTotal}
                    previous={prevCovered ? prevSalesTotal : 0}
                  />
                </span>
              }
              sub={PERIOD_LABEL[period]}
              demo={salesDemo}
            />
            <HeroCard
              icon={ShoppingBag}
              label="Bucket size เฉลี่ย"
              value={formatCurrency(bucketSize)}
              delta={
                <DeltaChip
                  current={bucketSize}
                  previous={prevCovered ? prevBucket : 0}
                />
              }
              sub={`ต่อบิล · ${PERIOD_LABEL[period]}`}
              demo={salesDemo}
              delay={60}
            />
            <HeroCard
              icon={MessageCircle}
              label="ยอดปิดจากแชท (แอดมิน)"
              value={formatCurrency(adminTotals.closed)}
              iconClass="bg-sky-50 text-sky-600"
              sub={
                adminTotals.leads > 0
                  ? `ทักใหม่ ${formatNumber(adminTotals.leads)} · conversion ${((adminTotals.bookings / adminTotals.leads) * 100).toFixed(1)}%`
                  : PERIOD_LABEL[period]
              }
              demo={adminDemo}
              delay={120}
            />
            <HeroCard
              icon={Goal}
              label="เทียบเป้าการขาย"
              value={
                periodTarget > 0
                  ? `${((periodTotal / periodTarget) * 100).toFixed(0)}%`
                  : "—"
              }
              sub={
                periodTarget > 0
                  ? undefined
                  : "ยังไม่กำหนดเป้าในช่วงนี้"
              }
              iconClass="bg-emerald-50 text-emerald-600"
              demo={salesDemo}
              delay={180}
            >
              {periodTarget > 0 && (
                <TargetProgress actual={periodTotal} target={periodTarget} compact />
              )}
            </HeroCard>
          </div>

          <Card className="p-5">
            <SectionTitle
              icon={TrendingUp}
              title={`แนวโน้มรายเดือน — Income ทีมขาย เทียบยอดปิดแชท (${period === "12m" ? "12" : "6"} เดือนล่าสุด)`}
              demo={salesDemo || adminDemo}
            />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trendData}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonthKey}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => compactBaht(Number(v))}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(l) => formatMonthKey(String(l))}
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      String(name),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="income"
                    name="Income ทีมขาย"
                    fill={TEAM_COLORS.sales.main}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={34}
                  />
                  <Bar
                    dataKey="closed"
                    name="ยอดปิดจากแชท (แอดมิน)"
                    fill={TEAM_COLORS.admin.soft}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={34}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-5">
              <SectionTitle icon={PieChart} title="สัดส่วนยอดขายตามหมวดหมู่" demo={salesDemo} />
              <CategoryDonutChart data={byCategory} />
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Store} title="ยอดขายรายสาขา" demo={salesDemo} />
              <div className="space-y-3 pt-1">
                {byBranch.map((b) => {
                  const maxBranch = byBranch[0]?.value ?? 1;
                  const share = periodTotal > 0 ? (b.value / periodTotal) * 100 : 0;
                  return (
                    <div key={b.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-stone-700">{b.name}</span>
                        <span className="tabular-nums text-stone-800">
                          {formatCurrency(b.value)}
                          <span className="ml-1.5 text-xs text-stone-400">
                            {share.toFixed(1)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-200/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
                          style={{ width: `${(b.value / maxBranch) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Trophy} title="Top 5 บริการทำรายได้" demo={salesDemo} />
              <ul className="space-y-2.5">
                {topItems.map((item, i) => (
                  <li key={item.name} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        i === 0 ? "bg-brand-500 text-cream" : "bg-brand-50 text-brand-700"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-stone-700">
                      {item.name}
                    </span>
                    <span className="text-xs tabular-nums text-stone-400">
                      {formatNumber(item.count)} ครั้ง
                    </span>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums text-stone-900">
                      {formatCurrency(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Section>

        {/* ================= 2) ผลงานทีมขาย ================= */}
        <Section
          icon={UsersRound}
          title="ผลงานทีมขาย / หมอ"
          desc="ยอดขายรายคนเทียบเป้า KPI พร้อม Bucket size และจำนวนบิลของแต่ละคน"
          tone="violet"
        >
          <Card className="p-5">
            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat
                label="Income รวมทีม"
                value={formatCurrency(periodTotal)}
                sub={`${formatNumber(periodBills)} บิล`}
              />
              <MiniStat
                label="Bucket size เฉลี่ย"
                value={formatCurrency(bucketSize)}
                sub="ต่อบิล"
              />
              <MiniStat
                label="ทำได้เทียบเป้าทีม"
                value={
                  salesTeamTarget > 0
                    ? `${((periodTotal / salesTeamTarget) * 100).toFixed(0)}%`
                    : "—"
                }
                sub={
                  salesTeamTarget > 0
                    ? `เป้า ${compactBaht(salesTeamTarget)}`
                    : undefined
                }
              />
            </div>
            <div className="space-y-1">
              {salesByPerson.map((p) => (
                <PersonKpiBar
                  key={p.name}
                  name={p.name}
                  actual={p.total}
                  target={p.target}
                  max={salesMax}
                  barGradient={TEAM_COLORS.sales.grad}
                  subLeft={`Bucket ${formatCurrency(p.bucket)} · ${formatNumber(p.count)} บิล`}
                />
              ))}
            </div>
          </Card>
        </Section>

        {/* ================= 3) ผลงานทีมแอดมิน ================= */}
        <Section
          icon={MessageCircle}
          title="ผลงานทีมแอดมิน"
          desc="ลูกค้าทักใหม่ จองนัด conversion และยอดปิดจากแชทเทียบเป้า KPI รายคน"
          tone="sky"
        >
          <Card className="p-5">
            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat
                label="ลูกค้าทักใหม่"
                value={formatNumber(adminTotals.leads)}
                sub={PERIOD_LABEL[period]}
              />
              <MiniStat
                label="จองนัดสำเร็จ"
                value={formatNumber(adminTotals.bookings)}
                sub={
                  adminTotals.leads > 0
                    ? `conversion ${((adminTotals.bookings / adminTotals.leads) * 100).toFixed(1)}%`
                    : undefined
                }
              />
              <MiniStat
                label="เฉลี่ยต่อดีล"
                value={formatCurrency(
                  adminTotals.bookings > 0
                    ? adminTotals.closed / adminTotals.bookings
                    : 0
                )}
                sub="ยอดปิด ÷ จำนวนจอง"
              />
            </div>
            <div className="space-y-1">
              {adminByPerson.map((p) => (
                <PersonKpiBar
                  key={p.name}
                  name={p.name}
                  actual={p.closed}
                  target={p.target}
                  max={adminMax}
                  barGradient={TEAM_COLORS.admin.grad}
                  subLeft={`จอง ${formatNumber(p.bookings)} ดีล · เฉลี่ย ${formatCurrency(p.perDeal)}/ดีล`}
                />
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle
              icon={MessageCircle}
              title="ลูกค้าทักใหม่ vs จองนัด (รายวัน)"
              demo={adminDemo}
              iconClass="text-sky-600"
            />
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyAdmin} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#cd9a86" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#cd9a86" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="dashBookings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatDate(String(v))}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(label) => formatDate(String(label))}
                    formatter={(value) => formatNumber(Number(value))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    name="ทักใหม่"
                    stroke="#a96a58"
                    strokeWidth={2}
                    fill="url(#dashLeads)"
                  />
                  <Area
                    type="monotone"
                    dataKey="bookings"
                    name="จองนัด"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    fill="url(#dashBookings)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Section>

        {/* ================= 4) เป้าหมาย vs ยอดจริง ================= */}
        <Section
          icon={Goal}
          title="เป้าหมาย vs ยอดจริง"
          desc="ยอดขายจริงเทียบเป้ารายเดือนของแผนก — เดือนปัจจุบันเทียบแบบ prorate ตามวันที่ผ่านไป"
          tone="emerald"
        >
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2">
              <SectionTitle
                icon={Goal}
                title={`ยอดจริงเทียบเส้นเป้ารายเดือน (${period === "12m" ? "12" : "6"} เดือนล่าสุด)`}
                demo={salesDemo}
                iconClass="text-emerald-600"
              />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={trendData}
                    margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonthKey}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => compactBaht(Number(v))}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(l) => formatMonthKey(String(l))}
                      formatter={(value, name) => [
                        formatCurrency(Number(value)),
                        String(name),
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="income"
                      name="ยอดขายจริง"
                      fill="#34d399"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={34}
                    />
                    <Line
                      dataKey="target"
                      name="เป้ารายเดือน"
                      stroke="#57534e"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#57534e" }}
                      type="monotone"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="space-y-4">
              <HeroCard
                icon={Goal}
                label="ทำได้เทียบเป้า (ช่วงที่เลือก)"
                value={
                  periodTarget > 0
                    ? `${((periodTotal / periodTarget) * 100).toFixed(0)}%`
                    : "—"
                }
                iconClass="bg-emerald-50 text-emerald-600"
                demo={salesDemo}
              >
                {periodTarget > 0 && (
                  <TargetProgress actual={periodTotal} target={periodTarget} compact />
                )}
              </HeroCard>
              <HeroCard
                icon={Trophy}
                label="เดือนที่ทำได้ตามเป้า"
                value={`${targetStats.hit} / ${targetStats.finished} เดือน`}
                sub="นับเฉพาะเดือนที่จบแล้วและตั้งเป้าไว้"
                iconClass="bg-emerald-50 text-emerald-600"
                demo={salesDemo}
                delay={60}
              />
            </div>
          </div>
        </Section>

        {/* ================= 5) งานของทีม ================= */}
        <Section
          icon={ClipboardList}
          title="งานของทีม"
          desc="สถานะงานภายในแผนกจากบอร์ดงาน"
          tone="stone"
        >
          <Card className="p-5">
            <p className="text-3xl font-bold tabular-nums text-stone-900">
              {formatNumber(pendingTasks)}
              <span className="ml-2 text-sm font-normal text-stone-500">
                งานที่ยังไม่เสร็จ
              </span>
            </p>
            <Link
              href="/tasks"
              className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              เปิดบอร์ดงาน →
            </Link>
          </Card>
        </Section>
      </div>
    </div>
  );
}
