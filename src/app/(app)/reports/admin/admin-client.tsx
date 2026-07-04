"use client";

import {
  Banknote,
  CalendarCheck,
  MessageCircle,
  Percent,
  Share2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DemoBadge, DemoBanner } from "@/components/demo-badge";
import { PersonKpiBar } from "@/components/report-viz";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  todayISO,
} from "@/lib/format";
import {
  AXIS_TICK,
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
import type { AdminRecordRow, StaffKpiRow } from "@/lib/types";

function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  demo,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  demo: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
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
        </div>
      </div>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  demo,
}: {
  icon: LucideIcon;
  title: string;
  demo: boolean;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon size={16} className="text-brand-600" />
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      {demo && <DemoBadge />}
    </div>
  );
}

export function AdminClient({
  records,
  kpis,
  demo,
}: {
  records: AdminRecordRow[];
  kpis: StaffKpiRow[];
  demo: boolean;
}) {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const today = todayISO();

  const cutoff = useMemo(() => cutoffFor(period), [period]);
  const filtered = useMemo(
    () => records.filter((r) => r.record_date >= cutoff),
    [records, cutoff]
  );

  const totals = useMemo(() => {
    let leads = 0;
    let bookings = 0;
    let closed = 0;
    for (const r of filtered) {
      leads += r.new_leads;
      bookings += r.bookings;
      closed += r.closed_amount;
    }
    return {
      leads,
      bookings,
      closed,
      conversion: leads > 0 ? (bookings / leads) * 100 : 0,
    };
  }, [filtered]);

  /* กราฟรายวัน: ทักใหม่ vs จองนัด */
  const dailyData = useMemo(() => {
    const map = new Map<string, { leads: number; bookings: number }>();
    for (const r of filtered) {
      const cur = map.get(r.record_date) ?? { leads: 0, bookings: 0 };
      cur.leads += r.new_leads;
      cur.bookings += r.bookings;
      map.set(r.record_date, cur);
    }
    return [...map.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  /* แยกตามช่องทาง */
  const channelData = useMemo(() => {
    const map = new Map<string, { leads: number; bookings: number }>();
    for (const r of filtered) {
      const key = r.channel?.trim() || "ไม่ระบุ";
      const cur = map.get(key) ?? { leads: 0, bookings: 0 };
      cur.leads += r.new_leads;
      cur.bookings += r.bookings;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.leads - a.leads);
  }, [filtered]);

  /* รายคน */
  const adminStats = useMemo(() => {
    const map = new Map<
      string,
      { leads: number; chats: number; bookings: number; closed: number }
    >();
    for (const r of filtered) {
      const key = r.admin_name?.trim() || "ไม่ระบุ";
      const cur =
        map.get(key) ?? { leads: 0, chats: 0, bookings: 0, closed: 0 };
      cur.leads += r.new_leads;
      cur.chats += r.chats_handled;
      cur.bookings += r.bookings;
      cur.closed += r.closed_amount;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        ...v,
        conversion: v.leads > 0 ? (v.bookings / v.leads) * 100 : 0,
        target: sumTargetsForPeriod(
          kpis.filter((k) => k.person_name === name),
          cutoff,
          today
        ),
      }))
      .sort((a, b) => b.closed - a.closed);
  }, [filtered, kpis, cutoff, today]);

  const kpiMax = Math.max(
    1,
    ...adminStats.map((s) => Math.max(s.closed, s.target))
  );

  return (
    <>
      <PageHeader
        title="ผลงานทีมแอดมิน"
        description="ลูกค้าทักใหม่ · อัตราปิดนัด · ยอดปิดการขาย จากข้อมูลรายวันของทีมแอดมิน"
        action={
          <div className="inline-flex rounded-lg border border-brand-100 bg-white p-1 shadow-sm">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriod(option.key)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
                  period === option.key
                    ? PERIOD_BUTTON_ACTIVE
                    : PERIOD_BUTTON_IDLE
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {demo && <DemoBanner onWhat="ข้อมูลทีมแอดมิน" />}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageCircle size={40} strokeWidth={1.5} />}
            title="ไม่มีข้อมูลทีมแอดมินในช่วงเวลาที่เลือก"
            description="ข้อมูลส่วนนี้จะมาจากไฟล์สรุปแชท/จองนัดรายวันของทีม DA"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                icon: UsersRound,
                iconClass: "bg-brand-50 text-brand-600",
                label: `ลูกค้าทักใหม่ (${PERIOD_LABEL[period]})`,
                value: formatNumber(totals.leads),
              },
              {
                icon: CalendarCheck,
                iconClass: "bg-sky-50 text-sky-600",
                label: "จองนัดได้",
                value: formatNumber(totals.bookings),
              },
              {
                icon: Percent,
                iconClass: "bg-amber-50 text-amber-600",
                label: "อัตราทักเป็นนัด",
                value: `${totals.conversion.toFixed(1)}%`,
              },
              {
                icon: Banknote,
                iconClass: "bg-emerald-50 text-emerald-600",
                label: "ยอดปิดการขาย",
                value: formatCurrency(totals.closed),
              },
            ].map((kpi, i) => (
              <div
                key={kpi.label}
                className="animate-fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <KpiCard
                  icon={kpi.icon}
                  iconClass={kpi.iconClass}
                  label={kpi.label}
                  value={kpi.value}
                  demo={demo}
                />
              </div>
            ))}
          </div>

          {/* เทียบ KPI รายคน */}
          <Card className="p-5 animate-fade-in-up">
            <SectionTitle
              icon={Banknote}
              title="ยอดปิดการขายเทียบเป้า KPI รายคน"
              demo={demo}
            />
            <div className="space-y-1">
              {adminStats.map((s) => (
                <PersonKpiBar
                  key={s.name}
                  name={s.name}
                  actual={s.closed}
                  target={s.target}
                  max={kpiMax}
                  barGradient={TEAM_COLORS.admin.grad}
                  subLeft={`ทักใหม่ ${formatNumber(s.leads)} · จอง ${formatNumber(s.bookings)} ดีล · conversion ${s.conversion.toFixed(1)}%`}
                />
              ))}
            </div>
          </Card>

          {/* กราฟรายวัน */}
          <Card className="p-5 animate-fade-in-up">
            <SectionTitle
              icon={MessageCircle}
              title="ลูกค้าทักใหม่ vs จองนัด (รายวัน)"
              demo={demo}
            />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#cd9a86" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#cd9a86" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gBookings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e7e5e4"
                    vertical={false}
                  />
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
                  <Area
                    type="monotone"
                    dataKey="leads"
                    name="ทักใหม่"
                    stroke="#a96a58"
                    strokeWidth={2}
                    fill="url(#gLeads)"
                  />
                  <Area
                    type="monotone"
                    dataKey="bookings"
                    name="จองนัด"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    fill="url(#gBookings)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* ช่องทาง + รายคน */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 animate-fade-in-up">
              <SectionTitle
                icon={Share2}
                title="แยกตามช่องทาง"
                demo={demo}
              />
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={channelData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e7e5e4"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={84}
                      tick={{ fontSize: 12, fill: "#57534e" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#faf6f3" }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => formatNumber(Number(value))}
                    />
                    <Bar
                      dataKey="leads"
                      name="ทักใหม่"
                      fill="#cd9a86"
                      maxBarSize={16}
                    />
                    <Bar
                      dataKey="bookings"
                      name="จองนัด"
                      fill="#0ea5e9"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={16}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="overflow-hidden animate-fade-in-up">
              <div className="px-5 pt-5">
                <SectionTitle
                  icon={UsersRound}
                  title="ผลงานรายคน"
                  demo={demo}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                      <th className="px-5 py-2.5 font-medium">แอดมิน</th>
                      <th className="px-3 py-2.5 text-right font-medium">ทัก</th>
                      <th className="px-3 py-2.5 text-right font-medium">นัด</th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        อัตรานัด
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium">
                        ยอดปิด
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {adminStats.map((a) => (
                      <tr
                        key={a.name}
                        className="transition-colors hover:bg-brand-50/40"
                      >
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-[10px] font-semibold text-cream">
                              {a.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium text-stone-800">
                              {a.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-stone-600">
                          {formatNumber(a.leads)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sky-600">
                          {formatNumber(a.bookings)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-stone-700">
                          {a.conversion.toFixed(0)}%
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium tabular-nums text-stone-900">
                          {formatCurrency(a.closed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
