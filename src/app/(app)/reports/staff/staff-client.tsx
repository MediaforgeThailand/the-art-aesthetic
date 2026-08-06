"use client";

import {
  Banknote,
  Goal,
  Loader2,
  Receipt,
  ShoppingBag,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DemoBadge, DemoBanner } from "@/components/demo-badge";
import {
  bahtWithBills,
  HeroCard,
  PersonKpiBar,
  SectionTitle,
  TargetProgress,
} from "@/components/report-viz";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatCurrency, formatNumber, todayISO } from "@/lib/format";
import {
  achievementTone,
  PERIOD_BUTTON_ACTIVE,
  PERIOD_BUTTON_IDLE,
  PERIOD_LABEL,
  PERIOD_OPTIONS,
  type PeriodKey,
  type SalesDashSummary,
  type StaffDetail,
  sumTargetsForPeriod,
  TEAM_COLORS,
} from "@/lib/report-utils";
import { createClient } from "@/lib/supabase/client";
import type { StaffKpiRow } from "@/lib/types";

interface StaffStat {
  name: string;
  count: number;
  total: number;
  avg: number;
  share: number;
  target: number;
}

export function StaffClient({
  period,
  cutoff,
  summary,
  kpis,
  salesDemo,
}: {
  period: PeriodKey;
  cutoff: string;
  summary: SalesDashSummary;
  kpis: StaffKpiRow[];
  salesDemo: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const today = todayISO();

  // เปลี่ยนช่วงเวลา = ให้ server aggregate ใหม่ (ไม่โหลดรายบรรทัดมา filter ฝั่งนี้)
  const setPeriod = (key: PeriodKey) => {
    setSelected(null);
    setDetail(null);
    startTransition(() => {
      router.replace(`/reports/staff?period=${key}`, { scroll: false });
    });
  };

  const totalAmount = summary.total;
  const totalBills = summary.bills;

  const staffStats = useMemo<StaffStat[]>(() => {
    return summary.by_person
      .map((p) => ({
        name: p.name,
        count: p.bills,
        total: p.total,
        avg: p.bills > 0 ? p.total / p.bills : 0,
        share: totalAmount > 0 ? (p.total / totalAmount) * 100 : 0,
        target: sumTargetsForPeriod(
          kpis.filter((k) => k.person_name === p.name),
          cutoff,
          today
        ),
      }))
      .sort((a, b) => b.total - a.total);
  }, [summary.by_person, totalAmount, kpis, cutoff, today]);

  const bucketSize = totalBills > 0 ? totalAmount / totalBills : 0;
  const teamTarget = staffStats.reduce((s, x) => s + x.target, 0);
  const kpiMax = Math.max(
    1,
    ...staffStats.map((s) => Math.max(s.total, s.target))
  );

  /* งานของคนที่เลือก: แยกตามหมวด + top บริการ — ดึงจาก RPC ตอนคลิก */
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    const supabase = createClient();
    supabase
      .rpc("sales_staff_detail", {
        p_name: selected,
        p_from: cutoff,
        p_to: today,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setDetailLoading(false);
        if (error) {
          setDetail(null);
          return;
        }
        setDetail((data as unknown as StaffDetail | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, cutoff, today]);

  return (
    <>
      <PageHeader
        title="ผลงานพนักงานขาย / หมอ"
        description="วัดยอดขายรายบุคคลจากข้อมูลการขาย — คลิกชื่อเพื่อดูรายละเอียด"
        action={
          <div className="flex max-w-full flex-wrap gap-1 rounded-lg border border-brand-100 bg-white p-1 shadow-sm">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriod(option.key)}
                className={`shrink-0 cursor-pointer rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.97] sm:py-1.5 ${
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

      {salesDemo && <DemoBanner onWhat="ข้อมูลยอดขาย" />}

      {summary.lines === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={40} strokeWidth={1.5} />}
            title="ไม่มีข้อมูลยอดขายในช่วงเวลาที่เลือก"
            description="ลองเปลี่ยนช่วงเวลา — ข้อมูลยอดขายซิงก์มาจากไฟล์ของทีม DA"
          />
        </Card>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-200 ${
            isPending ? "opacity-60" : ""
          }`}
        >
          {/* HERO */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroCard
              icon={Banknote}
              label="ยอด Income รวม"
              value={formatCurrency(totalAmount)}
              sub={PERIOD_LABEL[period]}
              demo={salesDemo}
            />
            <HeroCard
              icon={Receipt}
              label="ยอดบิลรวม"
              value={`${formatNumber(totalBills)} บิล`}
              sub={PERIOD_LABEL[period]}
              demo={salesDemo}
              delay={60}
            />
            <HeroCard
              icon={ShoppingBag}
              label="Bucket size เฉลี่ย"
              value={formatCurrency(bucketSize)}
              sub={`ต่อบิล · ${PERIOD_LABEL[period]}`}
              demo={salesDemo}
              delay={120}
            />
            <HeroCard
              icon={Goal}
              label="ทำได้เทียบเป้าทีม"
              value={
                teamTarget > 0
                  ? `${((totalAmount / teamTarget) * 100).toFixed(0)}%`
                  : "—"
              }
              iconClass="bg-emerald-50 text-emerald-600"
              demo={salesDemo}
              delay={180}
            >
              {teamTarget > 0 && (
                <TargetProgress actual={totalAmount} target={teamTarget} compact />
              )}
            </HeroCard>
          </div>

          {/* เทียบ KPI รายคน */}
          <Card className="p-5 animate-fade-in-up">
            <SectionTitle
              icon={UserRound}
              title="ผลงานเทียบเป้า KPI รายคน — คลิกชื่อเพื่อดูรายละเอียด"
              demo={salesDemo}
              right={
                <span className="text-xs tabular-nums text-stone-400">
                  รวม {bahtWithBills(totalAmount, totalBills)}
                </span>
              }
            />
            <div className="space-y-1">
              {staffStats.map((s) => (
                <PersonKpiBar
                  key={s.name}
                  name={s.name}
                  actual={s.total}
                  target={s.target}
                  max={kpiMax}
                  barGradient={TEAM_COLORS.sales.grad}
                  subLeft={`Bucket ${formatCurrency(s.avg)} · ${formatNumber(s.count)} บิล · ${s.share.toFixed(1)}% ของทีม`}
                  onClick={() => setSelected(selected === s.name ? null : s.name)}
                  active={selected === s.name}
                />
              ))}
            </div>
          </Card>

          {/* ตารางรายคน */}
          <Card className="overflow-hidden animate-fade-in-up">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium text-stone-500">
                    <th className="px-5 py-3">พนักงาน</th>
                    <th className="px-4 py-3 text-right">บิล</th>
                    <th className="px-4 py-3 text-right">ยอดรวม</th>
                    <th className="px-4 py-3 text-right">Bucket size เฉลี่ย</th>
                    <th className="px-4 py-3 text-right">เป้า KPI</th>
                    <th className="px-4 py-3 text-right">เทียบเป้า</th>
                    <th className="px-5 py-3">สัดส่วนยอดขาย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {staffStats.map((s) => {
                    const active = selected === s.name;
                    return (
                      <tr
                        key={s.name}
                        onClick={() => setSelected(active ? null : s.name)}
                        className={`cursor-pointer transition-colors ${
                          active ? "bg-brand-50" : "hover:bg-brand-50/40"
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-xs font-semibold text-cream">
                              {s.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium text-stone-800">
                              {s.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                          {formatNumber(s.count)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-stone-900">
                          {formatCurrency(s.total)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                          {formatCurrency(s.avg)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                          {s.target > 0 ? formatCurrency(s.target) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {s.target > 0 ? (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${achievementTone((s.total / s.target) * 100).chip}`}
                            >
                              {((s.total / s.target) * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-xs text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
                                style={{ width: `${s.share}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-xs font-medium tabular-nums text-stone-700">
                              {s.share.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* รายละเอียดคนที่เลือก */}
          {selected && (
            <Card className="p-5 animate-fade-in">
              <div className="mb-4 flex items-center gap-2">
                <UserRound size={16} className="text-brand-600" />
                <h2 className="text-sm font-semibold text-stone-900">
                  รายละเอียดของ {selected} ({PERIOD_LABEL[period]})
                </h2>
                {salesDemo && <DemoBadge />}
                {detailLoading && (
                  <Loader2 size={14} className="animate-spin text-brand-500" />
                )}
              </div>
              {detail && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium text-stone-500">
                      ยอดตามหมวดหมู่
                    </p>
                    <ul className="space-y-2">
                      {detail.categories.map((c) => (
                        <li key={c.name} className="flex items-center gap-2">
                          <Badge className="bg-brand-50 text-brand-700">
                            {c.name}
                          </Badge>
                          <span className="ml-auto text-sm font-medium tabular-nums text-stone-800">
                            {formatCurrency(c.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-stone-500">
                      Top 5 บริการที่ทำ
                    </p>
                    <ul className="space-y-2">
                      {detail.top_items.map((item) => (
                        <li
                          key={item.name}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate text-stone-700">
                            {item.name}
                          </span>
                          <span className="text-xs text-stone-400">
                            {formatNumber(item.lines)} ครั้ง
                          </span>
                          <span className="w-24 text-right font-medium tabular-nums text-stone-800">
                            {formatCurrency(item.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
