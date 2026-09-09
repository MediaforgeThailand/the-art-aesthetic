import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import {
  ASSIGNMENT_STATUS_LABEL,
  AVAILABILITY_LABEL,
  type AssignmentStatus,
  type Availability,
} from "@/lib/queue/types";

/** ชิ้นส่วนหน้าตาที่ใช้ซ้ำหลายหน้า — ไม่มี state จึงเป็น server component ได้ */

/* สีสถานะใช้ความหมายเดียวกันทุกจุดในระบบ:
   เหลือง = รอ BC กดรับ, เขียว = เรียบร้อย, แดง = แอดมินต้องจัดการ, เทา = ปิดไปแล้ว */
const STATUS_TONE: Record<AssignmentStatus, { chip: string; dot: string }> = {
  assigned: { chip: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  acknowledged: { chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  reassigned: { chip: "bg-stone-100 text-stone-500", dot: "bg-stone-400" },
  pending_manual_assignment: { chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  cancelled: { chip: "bg-stone-100 text-stone-500", dot: "bg-stone-400" },
  voided: { chip: "bg-stone-100 text-stone-500", dot: "bg-stone-400" },
};

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <Badge className={`shrink-0 whitespace-nowrap ${tone.chip}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {ASSIGNMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

const AVAILABILITY_TONE: Record<Availability, string> = {
  available: "bg-emerald-500",
  busy: "bg-amber-500",
  paused: "bg-stone-400",
  offline: "bg-stone-300",
};

export function AvailabilityDot({
  availability,
  withLabel = false,
}: {
  availability: Availability;
  withLabel?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${AVAILABILITY_TONE[availability]}`}
        aria-hidden
      />
      {withLabel && AVAILABILITY_LABEL[availability]}
    </span>
  );
}

/** ป้ายอันดับ + น้ำหนักคิว — น้ำหนักคือจำนวนคิวต่อรอบ ไม่ใช่คะแนน */
export function RankBadge({
  rank,
  weight,
}: {
  rank: number | null;
  weight: number;
}) {
  return (
    <Badge className="bg-brand-50 text-brand-700">
      {rank ? `อันดับ ${rank}` : "ยังไม่จัดอันดับ"} · x{weight}
    </Badge>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-stone-900";
  return (
    <div className="glass-soft rounded-xl px-3 py-2.5">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-stone-400">{label}</p>
      <p className="mt-0.5 break-words text-sm text-stone-800">{value || "—"}</p>
    </div>
  );
}
