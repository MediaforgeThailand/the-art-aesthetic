"use client";

import { AlertTriangle, BadgeCheck, CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  initialsOf,
  type PersonStatus,
  personName,
  type ProfileLite,
} from "./kpi-utils";

/* ---------- รูปโปรไฟล์ ---------- */

/**
 * รูปโปรไฟล์คนในทีม — เขียนไว้ในโมดูลนี้แทนที่จะ import `AssigneeAvatar` จาก tasks/task-card
 * (ไฟล์นั้นลาก dnd-kit + แผงงานทั้งก้อนเข้ามาใน bundle ของหน้า KPI ซึ่งไม่ได้ใช้เลย)
 */
export function PersonAvatar({
  profile,
  size = 8,
}: {
  profile: ProfileLite | undefined | null;
  size?: 6 | 8 | 10;
}) {
  // hook ต้องถูกเรียกทุก render — ส่ง null เมื่อไม่มีรูป (useSignedUrl รองรับ)
  const { url } = useSignedUrl(profile?.avatar_path ?? null);
  const dim = size === 10 ? "h-10 w-10" : size === 6 ? "h-6 w-6" : "h-8 w-8";
  const text = size === 10 ? "text-sm" : size === 6 ? "text-[10px]" : "text-xs";
  const name = personName(profile);
  if (profile?.avatar_path && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        title={name}
        className={`${dim} shrink-0 rounded-full object-cover shadow-sm`}
      />
    );
  }
  return (
    <span
      title={name}
      className={`flex ${dim} ${text} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-200 to-brand-400 font-bold text-white shadow-sm`}
    >
      {initialsOf(profile)}
    </span>
  );
}

/* ---------- แถบความคืบหน้า ---------- */

/** แถบ progress พร้อม "ขีดเป้าถึงวันนี้" (pace tick) — ขีดโชว์เฉพาะเดือนปัจจุบัน */
export function PaceBar({
  done,
  target,
  tickPct,
  tone,
  className = "h-2",
}: {
  done: number;
  target: number;
  tickPct: number | null;
  tone: "met" | "behind" | "ontrack";
  className?: string;
}) {
  const pct = target <= 0 ? 0 : Math.min(100, Math.round((done / target) * 100));
  const fill =
    tone === "met"
      ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
      : tone === "behind"
        ? "bg-gradient-to-r from-rose-400 to-rose-500"
        : "bg-gradient-to-r from-brand-400 to-brand-500";
  return (
    <div
      className={`relative overflow-hidden rounded-full bg-stone-100 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all ${fill}`}
        style={{ width: `${pct}%` }}
      />
      {tickPct !== null && tickPct > 0 && tickPct < 100 && (
        <div
          className="absolute inset-y-0 w-0.5 bg-stone-500/60"
          style={{ left: `${tickPct}%` }}
          title="เป้าที่ควรถึงวันนี้"
        />
      )}
    </div>
  );
}

/* ---------- ป้ายสถานะรายคน ---------- */

export function StatusPill({
  status,
  behindRules,
  isCurrentMonth,
}: {
  status: PersonStatus;
  behindRules: number;
  isCurrentMonth: boolean;
}) {
  if (status === "done")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
        <BadgeCheck size={12} />
        ครบเป้า
      </span>
    );
  if (status === "behind")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
        <AlertTriangle size={12} />
        {isCurrentMonth ? "ตามหลัง" : "ไม่ครบเป้า"} {behindRules} กติกา
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
      ตามเป้า
    </span>
  );
}

/* ---------- กล่องตัวเลขเล็ก ---------- */

export function StatBox({
  label,
  value,
  unit,
  sub,
  tone = "text-stone-800",
}: {
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-stone-400">{unit}</span>
        )}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}

/* ---------- สลับหน้า ปฏิทินรายคน ↔ ภาพรวมทีม ---------- */

/**
 * แถบสลับ 2 มุมมองของระบบ KPI — หน้าเดียวกันคนละมุมมอง จึงอยู่เป็นแท็บบนหัวหน้า
 * ไม่ใช่เมนูแยกในแถบซ้าย (`/content-tracking/overview` เป็น subroute จึงไฮไลต์
 * เมนู "KPI คอนเทนต์" ให้เองอยู่แล้วโดยไม่ต้องแก้ sidebar)
 */
export function KpiViewTabs({ active }: { active: "calendar" | "overview" }) {
  const tabs = [
    {
      href: "/content-tracking",
      key: "calendar" as const,
      label: "ปฏิทินรายคน",
      icon: CalendarDays,
    },
    {
      href: "/content-tracking/overview",
      key: "overview" as const,
      label: "ภาพรวมทีม",
      icon: Users,
    },
  ];
  return (
    <div className="flex shrink-0 rounded-full border border-stone-200 bg-white/70 p-0.5">
      {tabs.map((t) => {
        const Icon = t.icon;
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors sm:min-h-8 ${
              on
                ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Icon size={14} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
