"use client";

/**
 * Influ Dashboard — ภาพรวมงาน Influencer ทั้งโมดูลในหน้าเดียว
 * — สถานะ pipeline (Hunting กำลังตาม / กำลังดำเนินการ / จบงาน / ปฏิเสธ)
 * — สรุปต้นทุนค่าบริการ (Influencer Cost) ใช้แล้ว vs กำลังจะมา
 * — คิวเข้ารับบริการ 14 วันข้างหน้า · สัญญาใกล้หมดอายุ · follow-up ค้าง
 * — กราฟจำนวนเคส + ต้นทุนย้อนหลัง 6 เดือน (ตามวันเข้ารับบริการ)
 * นับเฉพาะเคสใน pipeline (archived ไม่นับ) — ต้นทุน/คิวไม่นับเคสที่ปฏิเสธ
 */

import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Crosshair,
  FileSignature,
  Gift,
  ListChecks,
  Sparkles,
  UserX,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HeroCard } from "@/components/report-viz";
import { Badge, Card, EmptyState } from "@/components/ui";
import {
  formatCurrency,
  formatDate,
  formatMonthKey,
  formatNumber,
  todayISO,
} from "@/lib/format";
import {
  contractEndDate,
  costUsageOf,
  INFLU_PROSPECT_ACTIVE,
  INFLU_TIER_ORDER,
  INFLU_TIERS,
  itemEffectiveCost,
} from "@/lib/influ-constants";
import { AXIS_TICK, compactBaht, TEAM_COLORS, TOOLTIP_STYLE } from "@/lib/report-utils";
import type {
  InfluFollowupMode,
  InfluProspectStatus,
  InfluTier,
} from "@/lib/types";

export type DashInflu = {
  id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  followers: number | null;
  tier: InfluTier | null;
  stage: number;
  completed: boolean;
  declined_at: string | null;
  service_date: string | null;
  doctor_name: string | null;
  procedure_text: string | null;
  contract_start: string | null;
  contract_months: number;
  followup_mode: InfluFollowupMode;
  created_at: string;
};

export type DashCostItem = {
  id: string;
  influencer_id: string;
  price: number;
  is_supported: boolean;
};

export type DashTask = {
  influencer_id: string;
  done: boolean;
  is_custom: boolean;
};

function influName(i: DashInflu): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

/** จำนวนวันจากวันนี้ (เวลาไทย) ถึงวันที่เป้าหมาย — ติดลบ = ผ่านมาแล้ว */
function daysFromToday(dateIso: string, todayIso: string): number {
  return Math.round(
    (new Date(dateIso).getTime() - new Date(todayIso).getTime()) / 86400000
  );
}

/** เดือน (YYYY-MM) ย้อนหลัง n เดือนรวมเดือนนี้ ตามเวลาไทย */
function recentMonthKeys(todayIso: string, n: number): string[] {
  const [y, m] = todayIso.slice(0, 7).split("-").map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return keys;
}

export function DashboardClient({
  influencers,
  items,
  tasks,
  prospectStatuses,
  loadError,
}: {
  influencers: DashInflu[];
  items: DashCostItem[];
  tasks: DashTask[];
  /** สถานะรายชื่อบนบอร์ด Hunting (0081) — นับการ์ด "กำลังตามอยู่" */
  prospectStatuses: InfluProspectStatus[];
  loadError: string | null;
}) {
  const today = todayISO();

  // รายชื่อที่ยังตามอยู่บนบอร์ด Hunting (แทนการ์ด "รอตอบรับ" เดิมที่นับ stage 1
  // ซึ่งย้ายออกจากบอร์ดเคสไปแล้วใน 0081 — นับจากเคสจะเป็น 0 ตลอดกาล)
  const huntingActive = prospectStatuses.filter((s) =>
    INFLU_PROSPECT_ACTIVE.includes(s)
  ).length;

  const stats = useMemo(() => {
    const byId = new Map(influencers.map((i) => [i.id, i]));
    const active = influencers.filter((i) => i.declined_at === null);

    // ---- pipeline ---- (ขั้น "ติดต่อ · รอตอบรับ" ย้ายไปบอร์ด Hunting แล้ว — 0081)
    const inProgress = active.filter(
      (i) => !i.completed
    ).length;
    const done = active.filter((i) => i.completed).length;
    const declined = influencers.length - active.length;

    // ---- ต้นทุน (ไม่นับเคสปฏิเสธ — เขาไม่มารับบริการ) ----
    const cost = { total: 0, used: 0, upcoming: 0, unscheduled: 0, saved: 0 };
    const costByInflu = new Map<string, number>();
    for (const it of items) {
      const inf = byId.get(it.influencer_id);
      if (!inf || inf.declined_at !== null) continue;
      const eff = itemEffectiveCost(it);
      cost.total += eff;
      cost[costUsageOf(inf)] += eff;
      if (it.is_supported) cost.saved += Number(it.price) || 0;
      costByInflu.set(inf.id, (costByInflu.get(inf.id) ?? 0) + eff);
    }

    // ---- คิวเข้ารับบริการ 14 วันข้างหน้า ----
    const upcoming14 = active
      .filter((i) => {
        if (!i.service_date) return false;
        const d = daysFromToday(i.service_date, today);
        return d >= 0 && d <= 14;
      })
      .sort((a, b) =>
        (a.service_date ?? "").localeCompare(b.service_date ?? "")
      );

    // ---- สัญญาใกล้หมดอายุ (ภายใน 30 วัน) ----
    const contracts = active
      .filter((i) => i.contract_start)
      .map((i) => ({
        influ: i,
        end: contractEndDate(i.contract_start as string, i.contract_months),
      }))
      .map((c) => ({ ...c, daysLeft: daysFromToday(c.end, today) }))
      .filter((c) => c.daysLeft >= 0 && c.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // ---- follow-up ค้าง (ขั้นตามงาน ยังไม่ปิดงาน) — นับเฉพาะข้อของโหมดที่ใช้อยู่ ----
    const taskLeft = new Map<string, number>();
    for (const t of tasks) {
      const inf = byId.get(t.influencer_id);
      if (!inf || t.done) continue;
      if (t.is_custom !== (inf.followup_mode === "custom")) continue;
      taskLeft.set(t.influencer_id, (taskLeft.get(t.influencer_id) ?? 0) + 1);
    }
    const followupPending = active
      // 0092: ไม่มีขั้นตามงานแล้ว — เคสที่เริ่มนับสัญญา = เคสที่อยู่ระหว่างติดตาม
      .filter((i) => !i.completed && i.contract_start !== null)
      .map((i) => ({ influ: i, left: taskLeft.get(i.id) ?? 0 }))
      .filter((f) => f.left > 0)
      .sort((a, b) => b.left - a.left)
      .slice(0, 8);

    // ---- แบ่งตาม Tier ----
    const tierCounts = INFLU_TIER_ORDER.map((tier) => ({
      tier,
      count: active.filter((i) => i.tier === tier).length,
    }));
    const tierMax = Math.max(1, ...tierCounts.map((t) => t.count));

    // ---- กราฟ 6 เดือน: จำนวนเคส + ต้นทุน ตามวันเข้ารับบริการ ----
    const monthKeys = recentMonthKeys(today, 6);
    const monthly = monthKeys.map((key) => {
      const inMonth = active.filter(
        (i) => i.service_date && i.service_date.slice(0, 7) === key
      );
      return {
        month: key,
        cases: inMonth.length,
        cost: inMonth.reduce((s, i) => s + (costByInflu.get(i.id) ?? 0), 0),
      };
    });

    return {
      total: active.length,
      inProgress,
      done,
      declined,
      cost,
      upcoming14,
      contracts,
      followupPending,
      tierCounts,
      tierMax,
      monthly,
    };
  }, [influencers, items, tasks, today]);

  return (
    <div>
      {loadError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </p>
      )}

      {/* ---- สถานะ pipeline ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <HeroCard
          icon={Sparkles}
          label="Influ ใน pipeline"
          value={formatNumber(stats.total)}
          sub="ไม่นับข้อมูลเก่า (archive)"
        />
        <HeroCard
          icon={Crosshair}
          iconClass="bg-amber-50 text-amber-600"
          label="Hunting · กำลังตาม"
          value={formatNumber(huntingActive)}
          sub="ยังไม่ตอบรับ — บอร์ด Hunting"
          delay={40}
        />
        <HeroCard
          icon={ListChecks}
          iconClass="bg-sky-50 text-sky-600"
          label="กำลังดำเนินการ"
          value={formatNumber(stats.inProgress)}
          sub="ตอบรับแล้ว ยังไม่ปิดงาน"
          delay={80}
        />
        <HeroCard
          icon={CheckCircle2}
          iconClass="bg-emerald-50 text-emerald-600"
          label="จบงานแล้ว"
          value={formatNumber(stats.done)}
          delay={120}
        />
        <HeroCard
          icon={UserX}
          iconClass="bg-rose-50 text-rose-500"
          label="ปฏิเสธ"
          value={formatNumber(stats.declined)}
          delay={160}
        />
      </div>

      {/* ---- ต้นทุน (Influencer Cost) ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroCard
          icon={Wallet}
          label="ต้นทุนรวม"
          value={formatCurrency(stats.cost.total)}
          sub="รายการ support ของแบรนด์นับเป็น ฿0"
        />
        <HeroCard
          icon={CheckCircle2}
          iconClass="bg-emerald-50 text-emerald-600"
          label="ใช้บริการแล้ว"
          value={formatCurrency(stats.cost.used)}
          sub="เคสที่ผ่านขั้นรับบริการแล้ว"
          delay={40}
        />
        <HeroCard
          icon={CalendarClock}
          iconClass="bg-sky-50 text-sky-600"
          label="กำลังจะมา"
          value={formatCurrency(stats.cost.upcoming)}
          sub={
            stats.cost.unscheduled > 0
              ? `+ ยังไม่เคาะวัน ${formatCurrency(stats.cost.unscheduled)}`
              : undefined
          }
          delay={80}
        />
        <HeroCard
          icon={Gift}
          iconClass="bg-pink-50 text-pink-600"
          label="แบรนด์ Support ประหยัด"
          value={formatCurrency(stats.cost.saved)}
          delay={120}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- คิวเข้ารับบริการ 14 วันข้างหน้า ---- */}
        <Card className="p-5 animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-stone-900">
              คิวเข้ารับบริการ 14 วันข้างหน้า
            </h2>
            <span className="text-xs text-stone-400">
              {stats.upcoming14.length} เคส
            </span>
            <Link
              href="/influ-calendar"
              className="ml-auto text-xs text-brand-600 hover:underline"
            >
              เปิดปฏิทิน
            </Link>
          </div>
          {stats.upcoming14.length === 0 ? (
            <p className="py-6 text-center text-xs text-stone-400">
              ไม่มีคิวในช่วง 14 วันนี้
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {stats.upcoming14.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/influencers/${i.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 transition-colors hover:bg-white/60"
                  >
                    <span className="w-20 shrink-0 text-xs font-medium tabular-nums text-brand-700">
                      {formatDate(i.service_date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-stone-800">
                        {influName(i)}
                      </span>
                      {(i.procedure_text || i.doctor_name) && (
                        <span className="block truncate text-[11px] text-stone-400">
                          {[i.procedure_text, i.doctor_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </span>
                    <ArrowUpRight size={13} className="text-stone-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- สัญญาใกล้หมดอายุ ---- */}
        <Card className="p-5 animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2">
            <FileSignature size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-stone-900">
              สัญญาใกล้หมดอายุ (30 วัน)
            </h2>
            <span className="text-xs text-stone-400">
              {stats.contracts.length} เคส
            </span>
            <Link
              href="/influencers/contracts"
              className="ml-auto text-xs text-brand-600 hover:underline"
            >
              ไปหน้า Follow Up
            </Link>
          </div>
          {stats.contracts.length === 0 ? (
            <p className="py-6 text-center text-xs text-stone-400">
              ไม่มีสัญญาที่จะหมดใน 30 วันนี้
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {stats.contracts.map(({ influ, end, daysLeft }) => (
                <li key={influ.id}>
                  <Link
                    href={`/influencers/${influ.id}`}
                    className="flex items-center gap-3 py-2 transition-colors hover:bg-white/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                      {influName(influ)}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      หมด {formatDate(end)}
                    </span>
                    <Badge
                      className={
                        daysLeft <= 7
                          ? "border border-rose-200 bg-rose-50 text-rose-600"
                          : "border border-amber-200 bg-amber-50 text-amber-700"
                      }
                    >
                      เหลือ {daysLeft} วัน
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- follow-up ค้าง ---- */}
        <Card className="p-5 animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-stone-900">
              Follow-up ค้าง (ขั้นตามงาน)
            </h2>
            <span className="text-xs text-stone-400">
              {stats.followupPending.length} เคส
            </span>
          </div>
          {stats.followupPending.length === 0 ? (
            <p className="py-6 text-center text-xs text-stone-400">
              ไม่มีเคสค้าง follow-up 🎉
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {stats.followupPending.map(({ influ, left }) => (
                <li key={influ.id}>
                  <Link
                    href={`/influencers/${influ.id}`}
                    className="flex items-center gap-3 py-2 transition-colors hover:bg-white/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                      {influName(influ)}
                    </span>
                    <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                      เหลือ {left} ข้อ
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- แบ่งตาม Tier ---- */}
        <Card className="p-5 animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-stone-900">
              แบ่งตามระดับ (Tier)
            </h2>
            <span className="text-xs text-stone-400">ไม่นับเคสปฏิเสธ</span>
          </div>
          <ul className="space-y-2.5">
            {stats.tierCounts.map(({ tier, count }) => (
              <li key={tier} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-stone-500">
                  {INFLU_TIERS[tier].label}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200/60">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
                    style={{ width: `${(count / stats.tierMax) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right text-xs font-semibold tabular-nums text-stone-700">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ---- กราฟ 6 เดือน ---- */}
      <Card className="mt-5 p-5 animate-fade-in-up">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Wallet size={16} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-stone-900">
            เคสและต้นทุนย้อนหลัง 6 เดือน
          </h2>
          <span className="text-xs text-stone-400">
            ตามวันเข้ารับบริการ — เดือนที่ยังไม่เคาะวันไม่ถูกนับ
          </span>
        </div>
        {stats.monthly.every((m) => m.cases === 0) ? (
          <EmptyState
            icon={<CalendarClock size={36} />}
            title="ยังไม่มีเคสที่มีวันเข้ารับบริการในช่วง 6 เดือนนี้"
          />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.monthly}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
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
                  width={52}
                />
                <Tooltip
                  cursor={{ fill: "#faf6f3" }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => formatMonthKey(String(label))}
                  formatter={(value, name) =>
                    name === "cost"
                      ? [formatCurrency(Number(value)), "ต้นทุน"]
                      : [formatNumber(Number(value)), "จำนวนเคส"]
                  }
                />
                <Bar
                  dataKey="cost"
                  fill={TEAM_COLORS.sales.main}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[11px] text-stone-400">
          จำนวนเคสต่อเดือน:{" "}
          {stats.monthly
            .map((m) => `${formatMonthKey(m.month)} = ${m.cases}`)
            .join(" · ")}
        </p>
      </Card>
    </div>
  );
}
