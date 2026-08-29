"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui";
import { CONTENT_KPI_BASES } from "@/lib/constants";
import type { ContentKpiBasis } from "@/lib/types";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  initialsOf,
  type PersonStatus,
  personName,
  type PostBacklogGroup,
  type PostStat,
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

/**
 * กล่องตัวเลขสรุป — ส่ง `onClick` มาเมื่อกล่องนั้น "ดูเพิ่มเติมได้"
 * (ผู้ใช้ 2026-08-29: ขอให้กดที่ตัวเลขแล้วเปิดป๊อปอัพรายละเอียดในหน้าเดิม)
 * กล่องที่กดได้มีลูกศร + บรรทัด "ดูรายละเอียด" กำกับ ไม่ต้องเดาว่าอันไหนกดได้
 */
export function StatBox({
  label,
  value,
  unit,
  sub,
  tone = "text-stone-800",
  onClick,
  detailLabel = "ดูรายละเอียด",
}: {
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  tone?: string;
  onClick?: () => void;
  detailLabel?: string;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1 text-[11px] text-stone-500">
        {label}
        {onClick && <ChevronRight size={12} className="text-brand-400" />}
      </p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-stone-400">{unit}</span>
        )}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>}
      {onClick && (
        <p className="mt-1 text-[10px] font-semibold text-brand-600">
          {detailLabel}
        </p>
      )}
    </>
  );
  if (!onClick)
    return (
      <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
        {body}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-stone-200/70 bg-white/70 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      {body}
    </button>
  );
}

/* ---------- ชิปฐานการนับ KPI (migration 0095) ---------- */

/** ป้ายบอกว่าผลงานชิ้นนี้/กติกาแถวนี้นับจากอะไร (ส่งงาน · Brief · โพส) */
export function BasisChip({
  basis,
  full = false,
}: {
  basis: ContentKpiBasis;
  full?: boolean;
}) {
  const meta = CONTENT_KPI_BASES[basis];
  return (
    <span
      title={meta.desc}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold ${meta.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {full ? meta.label : meta.short}
    </span>
  );
}

/* ---------- ป๊อปอัพ "ใครดองงานโพสไว้บ้าง" ---------- */

/** วันค้าง → โทนสี (เกิน 7 วัน = แดง, เกิน 2 วัน = เหลืองเข้ม — เกณฑ์เดียวกับคิวรอโพสใน /tasks) */
function ageTone(days: number): string {
  if (days >= 7) return "text-rose-600";
  if (days > 2) return "text-amber-700";
  return "text-stone-600";
}

/**
 * รายละเอียดคิวโพสที่ค้าง — เปิดจากกล่องสถิติ "โพสแล้ว x/y" ทั้งหน้าภาพรวมและหน้าปฏิทิน
 * ตอบคำถามของผู้ใช้ตรงๆ: ใครดองงานโพสไว้กี่ชิ้น และรวมแล้วกี่วัน (นับจากวันที่อนุมัติครบ)
 */
export function PostBacklogModal({
  open,
  onClose,
  groups,
  total,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  groups: PostBacklogGroup[];
  total: PostStat;
  /** ขอบเขตที่กำลังดู เช่น "ทั้งทีม" หรือชื่อคน */
  scopeLabel: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title="งานที่ดองไว้ยังไม่ได้โพส" wide>
      <p className="mb-3 text-xs leading-5 text-stone-500">
        {scopeLabel} · งานที่ผู้ตรวจอนุมัติครบแล้วแต่ยังไม่กด &quot;โพสแล้ว&quot;
        — นับวันค้างจากวันที่อนุมัติครบถึงวันนี้ (คิวสด ไม่ผูกกับเดือนที่เลือก)
        <br />
        เจ้าของคิว = ผู้สั่ง Brief ถ้าการ์ดมาจาก Brief · ไม่งั้นเป็นผู้รับผิดชอบการ์ดเอง
      </p>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-stone-200/70 bg-white/70 px-3 py-2">
          <p className="text-[10px] text-stone-500">ดองไว้</p>
          <p className="text-lg font-bold tabular-nums text-stone-800">
            {total.backlog}
            <span className="ml-1 text-[11px] font-normal text-stone-400">
              ชิ้น
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-stone-200/70 bg-white/70 px-3 py-2">
          <p className="text-[10px] text-stone-500">วันค้างรวม</p>
          <p className="text-lg font-bold tabular-nums text-stone-800">
            {total.backlogDays}
            <span className="ml-1 text-[11px] font-normal text-stone-400">
              วัน
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-stone-200/70 bg-white/70 px-3 py-2">
          <p className="text-[10px] text-stone-500">ค้างนานสุด</p>
          <p
            className={`text-lg font-bold tabular-nums ${ageTone(total.oldestDays)}`}
          >
            {total.oldestDays}
            <span className="ml-1 text-[11px] font-normal text-stone-400">
              วัน
            </span>
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <Send size={32} strokeWidth={1.5} className="text-emerald-300" />
          <p className="text-sm font-medium text-stone-600">ไม่มีงานค้างโพส</p>
          <p className="text-xs text-stone-400">
            งานที่อนุมัติแล้วถูกกด &quot;โพสแล้ว&quot; ครบทุกชิ้น
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.ownerId ?? "none"}
              className="rounded-xl border border-stone-200/70 bg-white/70 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {g.ownerId === null ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-500">
                    <AlertTriangle size={14} />
                  </span>
                ) : (
                  <PersonAvatar profile={g.profile} size={8} />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
                  {g.ownerId === null
                    ? "ไม่รู้ว่าใครต้องโพส"
                    : personName(g.profile)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-stone-600">
                  ดองไว้{" "}
                  <span className="font-bold text-stone-800">
                    {g.stat.backlog}
                  </span>{" "}
                  ชิ้น · รวม{" "}
                  <span className={`font-bold ${ageTone(g.stat.oldestDays)}`}>
                    {g.stat.backlogDays}
                  </span>{" "}
                  วัน · นานสุด{" "}
                  <span className={`font-bold ${ageTone(g.stat.oldestDays)}`}>
                    {g.stat.oldestDays}
                  </span>{" "}
                  วัน
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {g.stat.items.map((item) => (
                  <li
                    key={item.t.id}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-brand-50/60"
                  >
                    <span
                      className={`w-14 shrink-0 text-right text-xs font-bold tabular-nums ${ageTone(item.days)}`}
                    >
                      {item.days} วัน
                    </span>
                    <Link
                      href={`/tasks?task=${item.t.id}`}
                      className="inline-flex min-w-0 flex-1 items-center gap-1 text-xs text-stone-700 hover:text-brand-600 hover:underline"
                    >
                      <span className="line-clamp-1">{item.t.title}</span>
                      <ExternalLink size={11} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
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
