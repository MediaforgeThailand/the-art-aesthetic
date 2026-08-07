"use client";

/**
 * ชุด component สำหรับรายงาน/แดชบอร์ดระดับนำเสนอผู้บริหาร
 * ใช้ร่วมกันทั้ง /dashboard, /influ-dashboard, /influ-cost เพื่อให้ภาษาภาพตรงกันทุกหน้า
 */

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { DemoBadge } from "@/components/demo-badge";
import { Card } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { achievementTone } from "@/lib/report-utils";

/* ---------- ชิปเทียบช่วงก่อนหน้า (เขียวขึ้น / แดงลง) ---------- */

export function DeltaChip({
  current,
  previous,
  suffix = "จากช่วงก่อน",
}: {
  current: number;
  previous: number;
  suffix?: string;
}) {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        up
          ? "bg-emerald-50 text-emerald-700"
          : down
            ? "bg-rose-50 text-rose-600"
            : "bg-stone-100 text-stone-500"
      }`}
      title={suffix}
    >
      <Icon size={12} strokeWidth={2.5} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/* ---------- การ์ดตัวเลขหลัก (hero) ---------- */

export function HeroCard({
  icon: Icon,
  iconClass = "bg-brand-50 text-brand-600",
  label,
  value,
  sub,
  delta,
  demo = false,
  delay = 0,
  children,
}: {
  icon: LucideIcon;
  iconClass?: string;
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
  demo?: boolean;
  delay?: number;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className="p-5 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[13px] text-stone-500">
            {label}
            {demo && <DemoBadge />}
          </p>
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
          >
            <Icon size={18} />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <p className="text-[26px] font-bold leading-tight tabular-nums text-stone-900">
            {value}
          </p>
          {delta}
        </div>
        {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
        {children}
      </div>
    </Card>
  );
}

/* ---------- แถบความคืบหน้าเทียบเป้า ---------- */

export function TargetProgress({
  actual,
  target,
  compact = false,
}: {
  actual: number;
  target: number;
  compact?: boolean;
}) {
  const pct = target > 0 ? (actual / target) * 100 : 0;
  const tone = achievementTone(pct);
  return (
    <div className={compact ? "mt-1.5" : "mt-2"}>
      <div className="flex items-center justify-between text-xs">
        <span className={`font-semibold tabular-nums ${tone.text}`}>
          {pct.toFixed(0)}% ของเป้า
        </span>
        <span className="tabular-nums text-stone-400">
          เป้า {formatCurrency(target)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200/70">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${tone.bar}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ---------- bullet bar รายคน: ทำได้เทียบเป้า KPI ----------
   หลัก viz: แถบพื้น (track) ยาวเท่าค่ามากสุดในกลุ่ม, ขีดตั้ง = เป้า KPI,
   แถบสี = ยอดจริง, ชิป % = achievement ตามเกณฑ์สีเดียวกันทั้งระบบ */

export function PersonKpiBar({
  name,
  actual,
  target,
  max,
  barGradient,
  subLeft,
  onClick,
  active = false,
}: {
  name: string;
  actual: number;
  target: number;
  /** ค่ามากสุดของกลุ่ม (สเกลร่วมกันทุกแถวเพื่อเทียบกันได้) */
  max: number;
  /** tailwind gradient ของทีม เช่น "from-brand-400 to-brand-600" */
  barGradient: string;
  /** ข้อความรอง เช่น bucket size + จำนวนบิล */
  subLeft?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const pct = target > 0 ? (actual / target) * 100 : 0;
  const tone = achievementTone(pct);
  const fillPct = max > 0 ? (actual / max) * 100 : 0;
  const targetPct = max > 0 ? (target / max) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
        onClick ? "cursor-pointer" : "cursor-default"
      } ${active ? "bg-brand-50/70" : onClick ? "hover:bg-white/60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b text-[11px] font-semibold text-white ${barGradient}`}
          >
            {name.replace(/^คุณ/, "").charAt(0)}
          </span>
          <span className="truncate text-sm font-medium text-stone-800">
            {name}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className="text-sm font-semibold tabular-nums text-stone-900">
            {formatCurrency(actual)}
          </span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
              target > 0
                ? tone.chip
                : "border border-stone-200 bg-stone-100 text-stone-400"
            }`}
            title={target > 0 ? undefined : "ยังไม่กำหนดเป้า KPI"}
          >
            {target > 0 ? `${pct.toFixed(0)}%` : "—"}
          </span>
        </span>
      </div>
      <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-stone-200/60">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-700`}
          style={{ width: `${Math.min(fillPct, 100)}%` }}
        />
        {target > 0 && targetPct <= 100 && (
          <div
            title={`เป้า ${formatCurrency(target)}`}
            className="absolute top-[-2px] h-[calc(100%+4px)] w-[2.5px] rounded bg-stone-600/80"
            style={{ left: `${targetPct}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-stone-400">
        <span>{subLeft}</span>
        <span className="tabular-nums">
          เป้า {target > 0 ? formatCurrency(target) : "ยังไม่กำหนด"}
        </span>
      </div>
    </button>
  );
}

/* ---------- หัวข้อ section ---------- */

export function SectionTitle({
  icon: Icon,
  title,
  demo = false,
  right,
  iconClass = "text-brand-600",
}: {
  icon: LucideIcon;
  title: string;
  demo?: boolean;
  right?: React.ReactNode;
  iconClass?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon size={16} className={iconClass} />
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      {demo && <DemoBadge />}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/* ---------- สถิติย่อยเรียงแถว (ใช้ในการ์ดทีม) ---------- */

export function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-white/60 px-3 py-2">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className="text-base font-semibold tabular-nums text-stone-900">
        {value}
      </p>
      {sub && <p className="text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}
