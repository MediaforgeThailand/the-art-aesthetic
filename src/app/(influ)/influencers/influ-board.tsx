"use client";

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Ban,
  BellRing,
  CalendarClock,
  Check,
  ChevronsLeft,
  ChevronsRight,
  FileSignature,
  Hash,
  MessageCircleQuestion,
  Phone,
  Repeat,
  RotateCcw,
  Timer,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  menuBox,
  useAnchoredMenu,
  type MenuBox,
} from "@/components/anchored-menu";
import { Badge } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";
import {
  type CaseHashtag,
  contractEndDate,
  INFLU_SIZE_GROUP_ORDER,
  INFLU_SIZE_GROUPS,
  INFLU_STAGE,
  INFLU_STAGES,
  INFLU_TIERS,
  MEMO_SUBSTEPS,
  memoStepOf,
  roundLabel,
  sizeGroupFromFollowers,
} from "@/lib/influ-constants";
import type { InfluencerRow, InfluSizeGroup, InfluTaskRow } from "@/lib/types";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  AssigneeStack,
  type CaseAssignee,
  type InfluPerson,
} from "./assignees";
import { type InfluLinkLite, SourceLinkQuickButton } from "./influ-links";

/** แถว influencer สำหรับหน้า list — ตัด procedure_history ออก
    (jsonb เก็บลายเซน base64 ก้อนใหญ่ ~10-30KB/รายการ หน้า list ไม่ได้ใช้ เลยไม่ต้อง fetch) */
export type InfluencerListRow = Omit<InfluencerRow, "procedure_history">;

export function influName(i: InfluencerListRow): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

export type InfluTaskLite = Pick<
  InfluTaskRow,
  | "influencer_id"
  | "due_date"
  | "done"
  | "done_at"
  | "is_custom"
  // section — แยกงานรอง (รูปติดตามผล หมวด 4) ออกจากตัวเตือน (ผู้ใช้ 2026-08-29)
  | "section"
>;

/** สถิติ follow up ต่อ influ: งานเกินกำหนด, กำหนดถัดไป, follow ล่าสุด */
export type InfluStats = {
  overdue: number;
  nextDue: string | null;
  lastDone: string | null;
  pending: number;
};

/** วันที่ตามปฏิทินไทยของ timestamptz (YYYY-MM-DD) —
    กัน done_at ช่วง 00:00-07:00 น. ที่ .slice(0,10) แบบ UTC จะเพี้ยนไปเป็นวันก่อนหน้า */
export const thaiDateISO = (timestamp: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(timestamp)
  );

const dayDiff = (dateISO: string, today: string) =>
  Math.round(
    (new Date(dateISO).getTime() - new Date(today).getTime()) / 86400000
  );

/** กลุ่มขนาดที่การ์ดอยู่จริง — override ที่ลากไว้ชนะ, ไม่มีก็จัดอัตโนมัติจาก followers */
export const effectiveSizeGroup = (i: InfluencerListRow): InfluSizeGroup =>
  i.size_group ?? sizeGroupFromFollowers(i.followers);

/** สถานะรวมของ influencer หนึ่งคน — ใช้กับตัวกรอง "ยกเว้น" และโทนการ์ด
    (ปฏิเสธชนะทุกสถานะ · จบงาน · ที่เหลือ = กำลังดำเนินการ)
    สถานะ "รอตอบรับ" ถูกถอดทิ้งที่ 0086 — ทุกเคสบนบอร์ดคือคนที่ตอบรับแล้ว
    (งานก่อนตอบรับอยู่บอร์ด Hunting ตั้งแต่ 0081) */
export type InfluStatusKey = "accepted" | "done" | "declined";
export const influStatusOf = (i: InfluencerListRow): InfluStatusKey =>
  i.declined_at !== null ? "declined" : i.completed ? "done" : "accepted";

/* ---------- เคสที่ถึง Memo แล้วแต่ยังไม่ได้ลงคิวหมอ ----------
   คิวหมอลง 2 ฝั่ง (กติกาจากผู้ใช้ 2026-08-03): ฝั่งระบบโรงพยาบาลลงคิวก่อน = ยืนยันว่า
   influ เข้ามาจริง แล้ว influ manager ถึงมาลงคิวในปฏิทินฝั่งนี้เพื่อดูภาพรวมตาราง
   ⇒ "มีคิว kind=service ในปฏิทิน" คือหลักฐานว่านัดหมอเรียบร้อย
   ⇒ influencers.service_date (เคาะไว้ตั้งแต่ขั้นรายละเอียดเคส) เป็นแค่วันที่คุยกันไว้ ยังไม่นับว่านัดแล้ว

   **เริ่มเตือนเมื่อ Memo อนุมัติแล้วเท่านั้น (stage 2)** — เดิมเริ่มตั้งแต่ขั้น Memo (1.0)
   ทำให้เคสเกือบทั้งบอร์ดติดป้าย "รอลงคิวหมอ" ทั้งที่ยังไม่ผ่านอนุมัติ จะลงคิวไม่ได้อยู่แล้ว
   (audit 2026-09-03: 27 จาก 29 เคสที่เปิดอยู่ติดป้ายนี้ = สัญญาณที่ไม่มีความหมาย)
   ตัดที่ขั้น "สัญญา + รับบริการ" เพราะเลยขั้นนั้น = ผ่านวันรับบริการมาแล้ว ไม่มีอะไรต้องตามนัด */
export const needsDoctorBooking = (
  i: InfluencerListRow,
  bookedIds: ReadonlySet<string>
): boolean =>
  i.stage === INFLU_STAGE.contractService &&
  !i.completed &&
  i.declined_at === null &&
  !bookedIds.has(i.id);

/** ป้าย "ยังไม่ได้ลงคิวหมอ" — text เด่นพอประมาณ ไม่เรืองแสง (ผู้ใช้ 2026-08-19:
    "ทำให้เด่นน้อยกว่านี้ ไม่ต้องมี glow แค่ text เด่นประมาณนึงพอ" — glow เดิมแย่งสายตา
    จาก StageTracker ที่ทำให้เด่นขึ้นแทน; ปุ่มกรอง "รอลงคิวหมอ" บนแถบเครื่องมือยังเรืองแสงอยู่)
    มีวันที่คุยไว้แล้ว (service_date) = รอลงคิวอย่างเดียว · ไม่มีเลย = ยังไม่ได้เคาะวันกับ influ */
export function NoDoctorBookingBadge({
  serviceDate,
}: {
  serviceDate: string | null;
}) {
  return (
    <span
      title={
        serviceDate
          ? `คุยวันไว้แล้ว (${formatDate(serviceDate)}) แต่ยังไม่มีคิวในปฏิทิน — ลงคิวฝั่งโรงพยาบาลแล้วมาเพิ่มคิวในปฏิทินให้ครบ`
          : "ยังไม่ได้เคาะวันกับ influ และยังไม่มีคิวในปฏิทิน — ตามให้ยืนยันวันเข้ารับบริการ"
      }
      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"
    >
      <CalendarClock size={11} />
      {serviceDate ? "ยังไม่ได้ลงคิวหมอ" : "ยังไม่เคาะวัน · ไม่มีคิวหมอ"}
    </span>
  );
}

/** รูปโปรไฟล์บนการ์ด — โชว์รูปจริง (photo_path → signed URL มี cache ใน useSignedUrl)
    ไม่มีรูป/โหลดไม่ได้ = ตัวอักษรแรกแบบเดิม (ผู้ใช้ 2026-08-19: การ์ดไม่เคยโชว์รูปเลย
    ทั้งที่เคสมี photo_path — เดิม render แค่ initial ตัวเดียว) */
function InfluCardAvatar({
  influ: i,
  declined,
}: {
  influ: InfluencerListRow;
  declined: boolean;
}) {
  const { url } = useSignedUrl(i.photo_path);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed URL ชั่วคราว ใช้ next/image ไม่ได้
      <img
        src={url}
        alt=""
        className={`h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-stone-200 ${
          declined ? "opacity-60 grayscale" : ""
        }`}
      />
    );
  }
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        declined ? "bg-stone-100 text-stone-400" : "bg-brand-100 text-brand-700"
      }`}
    >
      {i.first_name.charAt(0)}
    </span>
  );
}

export const INFLU_STATUS_META: Record<InfluStatusKey, { label: string }> = {
  accepted: { label: "กำลังดำเนินการ" },
  done: { label: "จบงานแล้ว" },
  declined: { label: "ปฏิเสธ" },
};

/** ลำดับการ์ดในคอลัมน์ — board_position ที่ลากไว้ชนะ; ยังไม่เคยลาก = ใหม่ก่อน
    (fallback ต้องเป็นสูตรเดียวกันทุกที่ เพื่อให้ midpoint ตอนลากคำนวณถูก) */
export const boardPos = (i: InfluencerListRow): number =>
  i.board_position ?? -Date.parse(i.created_at) / 1000;

/** ยอดผู้ติดตามแบบย่อ — 12,300 → 12K · 1,500,000 → 1.5M */
function compactFollowers(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 || Number.isInteger(m) ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return formatNumber(n);
}

/* ---------- ชิปเตือนบนการ์ด ----------
   กติกาสีหลัง redesign 2026-08-14 (ผู้ใช้สั่ง "minimal · ดูง่าย"): การ์ดเป็นโทนกลาง (stone)
   สีจะโผล่เฉพาะเรื่องที่ต้อง "ลงมือทำ" เท่านั้น — amber = ใกล้ถึง/ต้องตาม · rose = เลยกำหนดแล้ว
   ห้ามเพิ่มชิปสีเพื่อบอกสถานะปกติ (ตอบรับแล้ว/อยู่ขั้นไหน) อีก — ข้อมูลนั้นอยู่ที่ StageTracker แล้ว */

const CHIP_QUIET = "border border-stone-200 bg-stone-50 text-stone-500";
/** ทำเสร็จไปแล้ว (เช่นส่ง Memo แล้ว) — เขียวอ่อนแบบเดียวกับพื้นการ์ดเคสที่จบงาน */
const CHIP_DONE = "border border-emerald-200 bg-emerald-50 text-emerald-700";
const CHIP_WARN = "border border-amber-200 bg-amber-50 text-amber-700";
const CHIP_LATE = "border border-rose-200 bg-rose-50 font-semibold text-rose-600";

/** ชิป countdown แจ้งเตือน follow up — เลยกำหนด/วันนี้ = rose · ภายใน 7 วัน = amber · 8-14 วัน = เงียบ */
function FollowupCountdownChip({
  daysUntil,
  overdueCount,
}: {
  daysUntil: number;
  overdueCount: number;
}) {
  if (daysUntil < 0) {
    return (
      <Badge className={`${CHIP_LATE} animate-fade-in`}>
        <BellRing size={11} /> เกินกำหนด {Math.abs(daysUntil)} วัน
        {overdueCount > 1 && ` (${overdueCount} งาน)`}
      </Badge>
    );
  }
  if (daysUntil === 0) {
    return (
      <Badge className={CHIP_LATE}>
        <BellRing size={11} /> Follow up วันนี้
      </Badge>
    );
  }
  if (daysUntil <= 7) {
    return (
      <Badge className={CHIP_WARN}>
        <Timer size={11} /> Follow up อีก {daysUntil} วัน
      </Badge>
    );
  }
  if (daysUntil <= 14) {
    return (
      <Badge className={CHIP_QUIET}>
        <Timer size={11} /> อีก {daysUntil} วัน
      </Badge>
    );
  }
  return null;
}

/** ชิปอายุสัญญา — เงียบเป็นปกติ, เหลืองเมื่อเหลือ ≤30 วัน, แดงเมื่อหมดแล้ว */
function ContractChip({
  contractStart,
  months,
  today,
}: {
  contractStart: string;
  months: number;
  today: string;
}) {
  const end = contractEndDate(contractStart, months);
  const daysLeft = dayDiff(end, today);
  return (
    <span title={`สัญญาถึง ${formatDate(end)}`}>
      {daysLeft < 0 ? (
        <Badge className={CHIP_LATE}>
          <FileSignature size={11} /> สัญญาหมดแล้ว
        </Badge>
      ) : (
        <Badge className={daysLeft <= 30 ? CHIP_WARN : CHIP_QUIET}>
          <FileSignature size={11} /> สัญญาเหลือ {formatNumber(daysLeft)} วัน
        </Badge>
      )}
    </span>
  );
}

/* ---------- แถบ stage แบบแอปส่งของ (แตกขั้น Memo เป็น 1 / 1.1 / 1.2 — 0104) ----------
   ผู้ใช้ 2026-09-01: การ์ดต้องเห็น 5 จุด — 1. ส่งเรื่อง Memo · 1.1 ทำเอกสาร · 1.2 อัพไฟล์ ·
   2. สัญญา/รับบริการ · 3. Follow Up และเคสที่อยู่ Follow Up กดแล้วพาไปหน้ารวม
   /influencers/contracts ได้เลย. เลข stage ใน DB ยังเป็น 1/2 เท่าเดิม — จุดบนเส้นเป็น
   "มุมมอง" จาก memoStepOf() + contract_start (กติกา 0092: ห้ามเทียบเลข stage ดิบ)
   ปรับ contrast 2026-08-19 (ผู้ใช้: "ขั้นที่ถึงมองไม่ค่อยชัด") — ขั้นปัจจุบัน = จุด brand-600→700
   เข้ม + ชื่อขั้นเป็น pill ทึบตัวขาว (จบงาน = pill เขียว) แลกกับป้ายคิวหมอที่เลิกเรืองแสง */
const TRACK_NODES: { key: string; num: string; title: string }[] = [
  ...MEMO_SUBSTEPS.map((s, idx) => ({
    key: s.key,
    num: idx === 0 ? "1" : s.key,
    title: s.title,
  })),
  {
    key: "2",
    num: "2",
    title: `2. ${
      INFLU_STAGES.find((s) => s.step === INFLU_STAGE.contractService)?.title ??
      "เซนสัญญา + วันรับบริการ"
    }`,
  },
  { key: "3", num: "3", title: "3. Follow Up" },
];

/** จุดที่เคสอยู่บนเส้น (index ใน TRACK_NODES) — "เข้าสู่การติดตามแล้ว" ตัดสินด้วย
    contract_start ไม่ใช่เลข stage (กติกา 0092) */
const trackIndexOf = (i: InfluencerListRow): number => {
  if (i.contract_start !== null) return TRACK_NODES.length - 1;
  if (i.stage >= INFLU_STAGE.contractService) return 3;
  const step = memoStepOf(i);
  return step === "1.0" ? 0 : step === "1.1" ? 1 : 2;
};

function StageTracker({ influ: i }: { influ: InfluencerListRow }) {
  const router = useRouter();
  const declined = i.declined_at !== null;
  const completed = i.completed;
  const total = TRACK_NODES.length;
  const current = trackIndexOf(i);
  const label = declined
    ? "ปฏิเสธแล้ว"
    : completed
      ? "จบงานแล้ว"
      : TRACK_NODES[current].title;
  // อยู่จุด Follow Up (ยังไม่ปิดงาน/ปฏิเสธ) = จุดกับ pill กดไปหน้ารวม Follow Up ได้
  const followupLink = !declined && !completed && current === total - 1;

  return (
    <div className="mt-3">
      <div className="flex items-start gap-1">
        {TRACK_NODES.map((n, idx) => {
          const done = !declined && (completed || idx < current);
          const here = !completed && !declined && idx === current;
          const clickable = followupLink && idx === total - 1;
          // ขั้นปัจจุบันต้อง contrast ชัด (ผู้ใช้ 2026-08-19: "มองไม่ค่อยชัด") —
          // จุดใหญ่สีเข้ม brand-600→700 + วงรอบ ไม่กลืนกับจุดที่ผ่านแล้ว
          const dot = (
            <span
              className={`flex shrink-0 items-center justify-center rounded-full ${
                here
                  ? "h-5 w-5 bg-gradient-to-b from-brand-600 to-brand-700 shadow-sm ring-4 ring-brand-200"
                  : done
                    ? "h-3.5 w-3.5 bg-brand-500 text-white"
                    : "h-3.5 w-3.5 border-[1.5px] border-stone-300 bg-white"
              }`}
            >
              {here ? (
                <span className="h-2 w-2 rounded-full bg-white" />
              ) : done ? (
                <Check size={9} strokeWidth={4} />
              ) : null}
            </span>
          );
          // ทุกจุดสูงเท่ากัน (h-5) แล้วค่อยวางเลขขั้นใต้จุด — จุดทุกขนาดอยู่แนวเดียวกัน
          const column = (
            <>
              <span className="flex h-5 items-center">{dot}</span>
              <span
                className={`text-[9px] leading-none tabular-nums ${
                  here
                    ? "font-bold text-brand-700"
                    : done
                      ? "text-brand-500"
                      : "text-stone-400"
                }`}
              >
                {n.num}
              </span>
            </>
          );
          return (
            <Fragment key={n.key}>
              {idx > 0 && (
                <span
                  className={`mt-[9px] h-0.5 flex-1 rounded-full ${
                    done || here ? "bg-brand-400" : "bg-stone-200"
                  }`}
                />
              )}
              {clickable ? (
                <button
                  type="button"
                  title={`${n.title} — เปิดหน้ารวม Follow Up`}
                  aria-label="เปิดหน้ารวม Follow Up"
                  onClick={(e) => {
                    // การ์ดทั้งใบกดเปิดหน้าเคส + เป็น sortable — กันอีเวนต์ทะลุทุกทาง
                    e.stopPropagation();
                    e.preventDefault();
                    router.push("/influencers/contracts");
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex shrink-0 flex-col items-center gap-1"
                >
                  {column}
                </button>
              ) : (
                <span
                  title={n.title}
                  className="flex shrink-0 flex-col items-center gap-1"
                >
                  {column}
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
      <p className="mt-2 flex items-center justify-between gap-2 text-xs">
        {/* ชื่อขั้นปัจจุบันเป็น pill ทึบตัวหนังสือขาว — อ่านออกทันทีว่าอยู่ขั้นไหน
            (เดิมเป็น text stone จางกลืนกับการ์ด); ปฏิเสธ = ข้อความจางตามเดิม */}
        {declined ? (
          <span
            title={
              i.declined_at
                ? `ปฏิเสธเมื่อ ${formatDate(thaiDateISO(i.declined_at))}`
                : undefined
            }
            className="truncate text-stone-400"
          >
            {label}
          </span>
        ) : followupLink ? (
          <button
            type="button"
            title="เปิดหน้ารวม Follow Up"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              router.push("/influencers/contracts");
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="inline-flex min-w-0 items-center gap-1 rounded-full bg-gradient-to-b from-brand-600 to-brand-700 px-2.5 py-1 shadow-sm active:scale-[0.97]"
          >
            <span className="truncate text-[11px] font-semibold leading-none text-white">
              {label}
            </span>
            <ChevronsRight size={11} className="shrink-0 text-white" />
          </button>
        ) : (
          <span
            className={`inline-flex min-w-0 items-center rounded-full px-2.5 py-1 shadow-sm ${
              completed
                ? "bg-emerald-600"
                : "bg-gradient-to-b from-brand-600 to-brand-700"
            }`}
          >
            <span className="truncate text-[11px] font-semibold leading-none text-white">
              {label}
            </span>
          </span>
        )}
        <span className="shrink-0 tabular-nums text-stone-400">
          {completed ? total : current + 1}/{total}
        </span>
      </p>
    </div>
  );
}

/* ---------- เนื้อการ์ด ----------
   redesign 2026-08-14 (ผู้ใช้: "minimal · ดูง่าย · stage แบบแอปส่งของ")
   · พื้นการ์ดบอกสถานะแบบเบาๆ: กำลังทำ = ขาว · จบงาน = เขียวอ่อน · ปฏิเสธ = จาง+เส้นประ
     (โทน "รอตอบรับ" ถูกถอดที่ 0086 — ทุกเคสบนบอร์ดตอบรับแล้ว งานก่อนหน้าอยู่บอร์ด Hunting)
   · "อยู่ขั้นไหน / จบงาน / ปฏิเสธ" ไม่ทำเป็นชิปแล้ว — อ่านจาก StageTracker แถวล่างที่เดียว
   · แถวชิปกลางการ์ดเหลือเฉพาะเรื่องที่ต้องลงมือทำ (ยังไม่ลงคิวหมอ · follow up · อายุสัญญา)
   · tier ย้ายไปเป็นข้อความเงียบๆ ข้างยอดผู้ติดตาม (เดิมเป็นชิปสีคนละสีต่อ tier) */

/* ---------- ชั้น "โปรไฟล์" บนการ์ด (รอบงานของคนเดียวกัน) ----------
   ผู้ใช้ 2026-09-03: "ควรแยกการ์ด จะเป็น Influ Profile >> Case 1, Case 2, Case 3"
   บอร์ดเป็นการ์ดต่อ "รอบ" อยู่แล้ว สิ่งที่ขาดคือตัวบอกว่าการ์ดใบนี้เป็นรอบไหนของใคร
   และรอบอื่นอยู่ไหน — ชิปนี้จึงโชว์ "รอบ N/M" เสมอเมื่อคนนั้นมีมากกว่า 1 รอบ
   แล้วกดเปิดรายชื่อรอบทั้งหมด (รวมรอบที่ตัวกรองซ่อนอยู่ ซึ่งต้องบอกให้รู้ ไม่ใช่หายเงียบ) */
function RoundsChip({
  influ: i,
  rounds,
  visibleIds,
}: {
  influ: InfluencerListRow;
  rounds: InfluencerListRow[];
  /** id ของเคสที่แสดงอยู่บนบอร์ดตอนนี้ — ที่ไม่อยู่ในนี้คือถูกตัวกรองซ่อน */
  visibleIds?: ReadonlySet<string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const place = (a: HTMLElement) => setBox(menuBox(a, { width: 232, maxHeight: 300 }));
  useAnchoredMenu({
    open,
    anchorRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: place,
  });

  const label = roundLabel(i.round_no, rounds.length);
  if (!label) return null;
  if (rounds.length <= 1) {
    return <span className="font-medium text-stone-500">{label}</span>;
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title={`คนนี้มี ${rounds.length} รอบ — กดเพื่อดูรอบอื่น`}
        aria-label={`${label} — กดเพื่อดูรอบอื่นของคนนี้`}
        onClick={(e) => {
          // การ์ดกดแล้วเปิดหน้าเคส — แตะชิปต้องไม่ทะลุไป
          e.stopPropagation();
          e.preventDefault();
          const a = anchorRef.current;
          if (a) place(a);
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-brand-200 bg-brand-50/80 px-1.5 py-px font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
      >
        <Repeat size={10} />
        {label}
      </button>
      {open &&
        box &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: box.x,
              top: box.y,
              width: box.width,
              maxHeight: box.height,
            }}
            onClick={(e) => e.stopPropagation()}
            className="z-[60] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl animate-scale-in"
          >
            <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
              รอบงานของคนนี้
            </p>
            {rounds.map((r) => {
              const hidden = visibleIds ? !visibleIds.has(r.id) : false;
              const status =
                r.declined_at !== null
                  ? "ปฏิเสธ"
                  : r.completed
                    ? "จบงาน"
                    : (INFLU_STAGES.find((st) => st.step === r.stage)?.short ??
                      "กำลังทำ");
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/influencers/${r.id}`);
                  }}
                  className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-50/70 max-sm:min-h-11 ${
                    r.id === i.id ? "bg-brand-50" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-stone-800">
                      รอบ {r.round_no}
                      {r.id === i.id ? " (การ์ดนี้)" : ""}
                    </span>
                    <span className="block text-[11px] text-stone-500">
                      {status}
                      {hidden ? " · ถูกตัวกรองซ่อนอยู่" : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

export function InfluCardContent({
  influ: i,
  stats,
  today,
  overlay = false,
  links,
  hashtags,
  assignees,
  peopleById,
  rounds,
  visibleIds,
  deleting = false,
  needsBooking = false,
  onDelete,
  onToggleDeclined,
}: {
  influ: InfluencerListRow;
  stats: InfluStats | undefined;
  today: string;
  /** true = การ์ดลอยใน DragOverlay ระหว่างลาก */
  overlay?: boolean;
  /** ผู้รับผิดชอบเคส (0095) — การ์ดแสดง "รูป" ของคนเหล่านี้แทนชื่อผู้สร้างแบบเดิม
      (`owner_id` = ผู้สร้างการ์ด ยังเก็บอยู่ ดูได้ที่หน้าเคส) */
  assignees?: CaseAssignee[];
  peopleById?: Map<string, InfluPerson>;
  /** ลิงก์ไฟล์ source — มี = โชว์ปุ่มเปิด Google Drive บนการ์ด */
  links?: InfluLinkLite[];
  /** แฮชแท็กบังคับของเคส (0093) — undefined = หน้าที่เรียกไม่ได้ส่งมา (ไม่โชว์แถวนี้) */
  hashtags?: CaseHashtag[];
  /** ทุกรอบของ "คนเดียวกัน" (person_id) เรียงตามเลขรอบ — ที่มาของชิป "รอบ N/M" */
  rounds?: InfluencerListRow[];
  /** เคสที่แสดงอยู่บนบอร์ดตอนนี้ — ใช้บอกในชิปว่ารอบไหนถูกตัวกรองซ่อน */
  visibleIds?: ReadonlySet<string>;
  deleting?: boolean;
  /** ถึง Memo แล้วแต่ยังไม่มีคิวหมอในปฏิทิน — ติดป้ายเรืองแสง (ดู needsDoctorBooking) */
  needsBooking?: boolean;
  onDelete?: (influ: InfluencerListRow) => void;
  /** mark/ยกเลิก "ปฏิเสธ" — ไม่ส่ง = ไม่มีปุ่ม (เช่นการ์ดใน overlay) */
  onToggleDeclined?: (influ: InfluencerListRow) => void;
}) {
  const declined = i.declined_at !== null;
  // ตั้งแต่ 0092 ไม่มีขั้น "ตามงาน" แล้ว — เคสที่เริ่มนับสัญญา (contract_start) คือเคสที่
  // เข้าสู่การติดตามที่หน้า Follow Up ⇒ ใช้ค่านี้แทนการเทียบเลข stage
  const inFollowup = i.contract_start !== null;
  const nextDueDays =
    !i.completed && inFollowup && stats?.nextDue
      ? dayDiff(stats.nextDue, today)
      : null;
  const daysSinceDone =
    stats?.lastDone != null
      ? Math.max(0, -dayDiff(thaiDateISO(stats.lastDone), today))
      : null;
  const showFollowedChip =
    !i.completed &&
    inFollowup &&
    (nextDueDays === null || nextDueDays > 14) &&
    daysSinceDone !== null;
  const movedManually =
    i.size_group !== null && i.size_group !== sizeGroupFromFollowers(i.followers);

  const tone = declined
    ? "border border-dashed border-stone-300 bg-stone-50/70 opacity-75"
    : i.completed
      ? "border border-emerald-200/80 bg-emerald-50/60"
      : "border border-stone-200 bg-white/90";

  /** ส่ง Memo ไปขออนุมัติแล้ว (ติ๊กในหน้าเคส) — ติ๊กถูกเล็กๆ กันทีมส่งซ้ำ */
  const memoSent = i.docs_sent_at !== null;
  /** เคส "รอปรึกษา" ที่ยังไม่ได้เติมหัตถการ — บอกว่าทำไมการ์ดนี้ยังไม่มีโปรแกรม */
  const consultPending =
    i.consult_only && !i.completed && (i.procedure_text ?? "") === "";

  /* แถวชิปโผล่เฉพาะตอนมีอะไรให้ทำจริง — ไม่มีก็ไม่กินที่ */
  const hasChips =
    needsBooking ||
    consultPending ||
    memoSent ||
    (!i.completed && nextDueDays !== null) ||
    showFollowedChip ||
    i.contract_start !== null ||
    movedManually;

  return (
    <div
      className={`rounded-xl p-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md ${tone} ${
        overlay ? "rotate-1 shadow-2xl ring-2 ring-brand-300" : ""
      }`}
    >
      {/* แถวบน: avatar + ชื่อ + ยอดผู้ติดตาม/tier/เบอร์ + ปุ่มลบ */}
      <div className="flex items-start gap-2.5">
        <InfluCardAvatar influ={i} declined={declined} />
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-medium ${
              declined ? "text-stone-400" : "text-stone-900"
            }`}
          >
            {influName(i)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
            {/* รหัส Influ ID — เงียบๆ แต่มาก่อนเพื่อน เพราะทีมใช้อ้างอิงเวลาคุยกัน */}
            {i.influ_code && (
              <span className="font-medium tabular-nums text-stone-500">
                {i.influ_code}
              </span>
            )}
            {/* รอบงาน — มีหลายรอบ = ชิปกดได้ (ไปรอบอื่นของคนเดียวกัน), รอบเดียว = ไม่โชว์อะไร */}
            <RoundsChip
              influ={i}
              rounds={rounds ?? [i]}
              visibleIds={visibleIds}
            />
            {i.followers !== null && (
              <span className="inline-flex items-center gap-1 font-medium text-stone-500">
                <UsersRound size={11} /> {compactFollowers(i.followers)}
              </span>
            )}
            {i.tier && <span>{INFLU_TIERS[i.tier].label}</span>}
            {i.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={11} /> {i.phone}
              </span>
            )}
          </p>
          {/* ผู้รับผิดชอบ = รูปโปรไฟล์ (ชี้เมาส์/แตะเพื่อดูชื่อ + ขอบเขตงาน) */}
          {peopleById && (
            <span className="mt-1.5 flex items-center">
              <AssigneeStack
                assignees={assignees ?? []}
                peopleById={peopleById}
                size={22}
              />
            </span>
          )}
        </div>
        <div className="-mr-1.5 -mt-1.5 flex shrink-0 items-center">
          <SourceLinkQuickButton links={links} compact />
          {onToggleDeclined && (
            <button
              type="button"
              title={
                declined
                  ? "ยกเลิกสถานะปฏิเสธ — เอากลับมาติดต่อใหม่"
                  : "ทำเครื่องหมายว่าปฏิเสธ (ไม่ร่วมงาน)"
              }
              aria-label={
                declined
                  ? `ยกเลิกสถานะปฏิเสธของ ${influName(i)}`
                  : `ทำเครื่องหมายว่า ${influName(i)} ปฏิเสธ`
              }
              onClick={(e) => {
                e.stopPropagation();
                onToggleDeclined(i);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors active:scale-90 sm:h-7 sm:w-7 ${
                declined
                  ? "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                  : "text-stone-300 hover:bg-rose-50 hover:text-rose-500"
              }`}
            >
              {declined ? <RotateCcw size={16} /> : <Ban size={16} />}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              title="ลบ Influencer"
              aria-label={`ลบ ${influName(i)}`}
              disabled={deleting}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(i);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-90 disabled:opacity-40 sm:h-7 sm:w-7"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ชิปเตือน — เรียงตามความรีบ: ยังไม่ลงคิวหมอ → follow up → อายุสัญญา */}
      {hasChips && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {needsBooking && <NoDoctorBookingBadge serviceDate={i.service_date} />}
          {consultPending && (
            <span title="เปิดเคสไว้ก่อนโดยยังไม่ระบุหัตถการ — รอปรึกษาแพทย์แล้วกลับมาเพิ่มที่แท็บรายละเอียดเคส">
              <Badge className={CHIP_WARN}>
                <MessageCircleQuestion size={11} /> รอปรึกษา
              </Badge>
            </span>
          )}
          {memoSent && (
            <span
              title={`ส่ง Memo ขออนุมัติแล้วเมื่อ ${formatDate(thaiDateISO(i.docs_sent_at!))}`}
            >
              <Badge className={CHIP_DONE}>
                <Check size={11} strokeWidth={3} /> ส่ง Memo แล้ว
              </Badge>
            </span>
          )}
          {!i.completed && nextDueDays !== null && (
            <FollowupCountdownChip
              daysUntil={nextDueDays}
              overdueCount={stats?.overdue ?? 0}
            />
          )}
          {showFollowedChip && (
            <Badge className={CHIP_QUIET}>
              <Check size={11} /> follow แล้ว ·{" "}
              {daysSinceDone === 0 ? "วันนี้" : `${daysSinceDone} วันก่อน`}
            </Badge>
          )}
          {i.contract_start && (
            <ContractChip
              contractStart={i.contract_start}
              months={i.contract_months}
              today={today}
            />
          )}
          {movedManually && (
            <span title="การ์ดถูกลากย้ายกลุ่มเอง ไม่ตรงกับกลุ่มอัตโนมัติจากยอดผู้ติดตาม — ลากกลับกลุ่มเดิมเพื่อให้จัดอัตโนมัติอีกครั้ง">
              <Badge className={CHIP_QUIET}>ย้ายกลุ่มเอง</Badge>
            </span>
          )}
        </div>
      )}

      {/* แฮชแท็กบังคับของเคส (0093) — influ ต้องติดชุดนี้ในโพส ทีมจึงต้องเห็นบนการ์ด
          แท็กที่ยังขาดข้อมูลขึ้นเป็นชิปเหลืองพร้อมบอกว่าต้องไปเติมที่ไหน */}
      {hashtags && hashtags.length > 0 && !declined && (
        <CardHashtags tags={hashtags} />
      )}

      <StageTracker influ={i} />
    </div>
  );
}

/** แถวแฮชแท็กบนการ์ด — ตัวเล็ก โทนเงียบ (แท็กที่ครบ) + เหลืองเมื่อยังขาดข้อมูล */
function CardHashtags({ tags }: { tags: CaseHashtag[] }) {
  const ready = tags.filter((t) => t.tag !== null);
  const missing = tags.filter((t) => t.tag === null);
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-stone-100 pt-2.5">
      <Hash size={11} className="shrink-0 text-stone-300" />
      {ready.map((t) => (
        <span
          key={`${t.key}-${t.tag}`}
          title={t.source ? `${t.label}: ${t.source}` : t.label}
          className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600"
        >
          {t.tag}
        </span>
      ))}
      {/* แท็กที่ขาดยุบเป็นชิปเดียว — เคสส่วนใหญ่ขาดพร้อมกันหลายอัน (เช่นตอนทะเบียนหมอ
          ยังไม่ได้กรอกเลขใบ ปว.) ถ้าลิสต์ทีละอันการ์ดจะเต็มไปด้วยชิปเหลืองจนอ่านอย่างอื่นไม่ออก
          รายละเอียดว่าขาดอะไร/ต้องไปเติมที่ไหน อยู่ในหน้าเคส (HashtagBlock) */}
      {missing.length > 0 && (
        <span
          title={missing
            .map((t) => t.missingHint ?? `ยังไม่มีแท็ก${t.label}`)
            .join("\n")}
          className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200"
        >
          แท็กไม่ครบ {missing.length}
        </span>
      )}
    </div>
  );
}

/* ---------- การ์ดแบบลากได้ ---------- */

function SortableInfluCard({
  influ,
  stats,
  links,
  hashtags,
  assignees,
  peopleById,
  rounds,
  visibleIds,
  today,
  deleting,
  needsBooking,
  canEdit,
  canDelete,
  dragEnabled,
  onClick,
  onDelete,
  onToggleDeclined,
}: {
  influ: InfluencerListRow;
  stats: InfluStats | undefined;
  links: InfluLinkLite[] | undefined;
  /** แฮชแท็กบังคับของเคสนี้ (0093) — undefined = หน้าที่ไม่ได้ส่งมา (ไม่โชว์แถวนี้) */
  hashtags?: CaseHashtag[];
  assignees?: CaseAssignee[];
  peopleById?: Map<string, InfluPerson>;
  /** ทุกรอบของคนเดียวกัน — ชิป "รอบ N/M" บนการ์ด */
  rounds?: InfluencerListRow[];
  visibleIds?: ReadonlySet<string>;
  today: string;
  deleting: boolean;
  needsBooking: boolean;
  /** ระดับ "ดูเฉยๆ" = ลากการ์ด/กดปุ่มบนการ์ดไม่ได้ (เปิดดูได้อย่างเดียว) */
  canEdit: boolean;
  canDelete: boolean;
  /** ลากวางเปิดอยู่ไหม — จอเล็กปิดถาวร (ท่าลากทับท่าปาดเปลี่ยนกลุ่ม) */
  dragEnabled: boolean;
  onClick: () => void;
  onDelete: (influ: InfluencerListRow) => void;
  onToggleDeclined: (influ: InfluencerListRow) => void;
}) {
  const draggable = canEdit && dragEnabled;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: influ.id,
      data: { type: "influ" },
      disabled: !draggable,
    });

  // ลากไม่ได้ (จอเล็ก/ระดับดูเฉยๆ) = การ์ดเป็นปุ่ม "เปิดเคส" ธรรมดา ห้ามสืบทอด
  // attributes ของ dnd-kit เพราะมันแปะ aria-disabled="true" ทั้งที่การ์ดยังกดเปิดได้
  // (screen reader อ่านว่ากดไม่ได้ และ Playwright ก็รอ "element is enabled" จนหมดเวลา)
  const dndProps = draggable
    ? { ...attributes, ...listeners }
    : { role: "button" as const, tabIndex: 0 };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...dndProps}
      onClick={onClick}
      onKeyDown={(e) => {
        // ส่งต่อให้ dnd-kit KeyboardSensor ก่อน (Space = ยก/วางการ์ด) แล้วค่อยจัดการ Enter เอง
        if (draggable) (listeners?.onKeyDown as React.KeyboardEventHandler | undefined)?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`เปิดหน้าเดินงานของ ${influName(influ)}`}
      className={`touch-manipulation cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <InfluCardContent
        influ={influ}
        stats={stats}
        links={links}
        hashtags={hashtags}
        assignees={assignees}
        peopleById={peopleById}
        rounds={rounds}
        visibleIds={visibleIds}
        today={today}
        deleting={deleting}
        needsBooking={needsBooking}
        // ไม่ส่ง handler = ปุ่มนั้นไม่ render เลย (ดูเงื่อนไขใน InfluCardContent)
        onDelete={canDelete ? onDelete : undefined}
        onToggleDeclined={canEdit ? onToggleDeclined : undefined}
      />
    </div>
  );
}

/* ---------- คอลัมน์กลุ่มขนาด ---------- */

function BoardColumn({
  group,
  influs,
  statsByInflu,
  linksByInflu,
  hashtagsByInflu,
  assigneesByInflu,
  peopleById,
  roundsByPerson,
  visibleIds,
  bookingAlertIds,
  today,
  highlight,
  deletingId,
  canEdit,
  canDelete,
  dragEnabled,
  onCardClick,
  onDelete,
  onToggleDeclined,
}: {
  group: InfluSizeGroup;
  influs: InfluencerListRow[];
  statsByInflu: Map<string, InfluStats>;
  linksByInflu?: Map<string, InfluLinkLite[]>;
  /** แฮชแท็กบังคับต่อเคส (0093) — คำนวณที่ influencers-client แล้วส่งลงมาเป็น Map */
  hashtagsByInflu?: Map<string, CaseHashtag[]>;
  assigneesByInflu?: Map<string, CaseAssignee[]>;
  peopleById?: Map<string, InfluPerson>;
  /** ทุกรอบของแต่ละคน (person_id → เคสทุกรอบ) — ชิป "รอบ N/M" บนการ์ด */
  roundsByPerson?: Map<string, InfluencerListRow[]>;
  visibleIds?: ReadonlySet<string>;
  bookingAlertIds: ReadonlySet<string>;
  today: string;
  highlight: boolean;
  deletingId: string | null;
  canEdit: boolean;
  canDelete: (influ: InfluencerListRow) => boolean;
  /** ลากวางเปิดอยู่ไหม (จอ ≥md เท่านั้น) */
  dragEnabled: boolean;
  onCardClick: (influ: InfluencerListRow) => void;
  onDelete: (influ: InfluencerListRow) => void;
  onToggleDeclined: (influ: InfluencerListRow) => void;
}) {
  const meta = INFLU_SIZE_GROUPS[group];
  const { setNodeRef } = useDroppable({
    id: `col:${group}`,
    data: { type: "col", group },
  });

  return (
    <div
      className={`flex min-w-0 flex-col rounded-xl transition-colors duration-200 max-md:w-full max-md:shrink-0 max-md:snap-center max-md:snap-always ${
        highlight
          ? "border border-brand-300/60 bg-brand-100/50 ring-2 ring-brand-300 backdrop-blur-md"
          : "glass-soft"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pb-1.5 pt-3.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
        <span className={`text-sm font-semibold ${meta.headerText}`}>
          {meta.label}
        </span>
        <span className="truncate text-xs text-stone-400">{meta.range}</span>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-500 shadow-sm">
          {influs.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="space-y-2.5 px-3 pb-3 pt-1 max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-y-contain md:min-h-[140px]"
      >
        <SortableContext
          items={influs.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {influs.length === 0 && (
            <div
              className={`flex items-center justify-center rounded-lg border-2 border-dashed py-12 text-xs transition-colors duration-200 ${
                highlight
                  ? "border-brand-300 text-brand-500"
                  : "border-stone-200 text-stone-300"
              }`}
            >
              {/* จอเล็กไม่มีลากวาง — "วางการ์ดที่นี่" จึงชวนทำในสิ่งที่ทำไม่ได้ */}
              <span className="md:hidden">ไม่มีเคสในกลุ่มนี้</span>
              <span className="hidden md:inline">
                {canEdit ? "วางการ์ดที่นี่" : "ไม่มีเคสในกลุ่มนี้"}
              </span>
            </div>
          )}
          {influs.map((i) => (
            <SortableInfluCard
              key={i.id}
              influ={i}
              stats={statsByInflu.get(i.id)}
              links={linksByInflu?.get(i.id)}
              hashtags={hashtagsByInflu?.get(i.id)}
              assignees={assigneesByInflu?.get(i.id)}
              peopleById={peopleById}
              rounds={roundsByPerson?.get(i.person_id)}
              visibleIds={visibleIds}
              today={today}
              deleting={deletingId === i.id}
              needsBooking={bookingAlertIds.has(i.id)}
              canEdit={canEdit}
              canDelete={canDelete(i)}
              dragEnabled={dragEnabled}
              onClick={() => onCardClick(i)}
              onDelete={onDelete}
              onToggleDeclined={onToggleDeclined}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

/* ---------- บอร์ดกลุ่มขนาด (เล็ก / กลาง / ใหญ่) ----------
   จอ ≥md = 3 คอลัมน์ ลากวางได้เหมือนเดิม
   จอ <md = **1 กลุ่ม = 1 หน้าเต็มจอ ปาดซ้าย/ขวาเปลี่ยนกลุ่ม** (ผู้ใช้ 2026-08-30)
   ใช้ CSS scroll-snap แบบ mandatory = "บังคับมุมกล้อง" ปล่อยนิ้วแล้วต้องลงล็อก
   ที่กลุ่มใดกลุ่มหนึ่งเสมอ (แพตเทิร์นเดียวกับบอร์ด Task บนมือถือ) */

export function InfluBoard({
  items,
  statsByInflu,
  linksByInflu,
  hashtagsByInflu,
  assigneesByInflu,
  peopleById,
  roundsByPerson,
  bookingAlertIds,
  today,
  deletingId,
  canEdit,
  canDelete,
  onOpen,
  onDelete,
  onToggleDeclined,
  onMove,
}: {
  /** รายชื่อหลังกรอง (ค้นหา/stage/ยกเว้น) แล้ว — บอร์ดจัดกลุ่ม+เรียงเอง */
  items: InfluencerListRow[];
  statsByInflu: Map<string, InfluStats>;
  /** ลิงก์ไฟล์ source ต่อ influencer — ปุ่มเปิดเร็วบนการ์ด (ไม่ส่ง = ไม่มีปุ่ม) */
  linksByInflu?: Map<string, InfluLinkLite[]>;
  /** แฮชแท็กบังคับต่อเคส (0093) — คำนวณที่ influencers-client แล้วส่งลงมาเป็น Map */
  hashtagsByInflu?: Map<string, CaseHashtag[]>;
  /** ผู้รับผิดชอบต่อเคส (0095) — กองรูปบนการ์ด */
  assigneesByInflu?: Map<string, CaseAssignee[]>;
  /** บัญชีตาม uid — ที่มาของรูป/ชื่อในกองรูป */
  peopleById?: Map<string, InfluPerson>;
  /** ทุกรอบของแต่ละคน (รวมรอบที่ตัวกรองซ่อนอยู่) — ชิป "รอบ N/M" บนการ์ด */
  roundsByPerson?: Map<string, InfluencerListRow[]>;
  /** id ของเคสที่ต้องติดป้ายเรืองแสง "ยังไม่ได้ลงคิวหมอ" */
  bookingAlertIds: ReadonlySet<string>;
  today: string;
  deletingId: string | null;
  /** hunter ขึ้นไป — ลากการ์ด/กดปุ่มบนการ์ดได้ (ระดับ "ดูเฉยๆ" = false) */
  canEdit: boolean;
  /** ลบเคสนี้ได้ไหม (ผู้ดูแล = ทุกเคส, hunter = เฉพาะเคสของตัวเอง) */
  canDelete: (influ: InfluencerListRow) => boolean;
  onOpen: (influ: InfluencerListRow) => void;
  onDelete: (influ: InfluencerListRow) => void;
  /** mark/ยกเลิกสถานะ "ปฏิเสธ" จากปุ่มบนการ์ด */
  onToggleDeclined: (influ: InfluencerListRow) => void;
  /** ลากวางเสร็จ — ย้ายกลุ่ม/เรียงลำดับ (prev/next = เพื่อนบ้านใหม่ในคอลัมน์ปลายทาง) */
  onMove: (
    id: string,
    group: InfluSizeGroup,
    prevId: string | null,
    nextId: string | null
  ) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [order, setOrder] = useState<Record<InfluSizeGroup, string[]> | null>(
    null
  );
  const [overGroup, setOverGroup] = useState<InfluSizeGroup | null>(null);
  const suppressClickRef = useRef(false);

  /* ---- pager ของจอเล็ก ---- */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [page, setPage] = useState(0);

  // อ่านหน้าปัจจุบันจาก scrollLeft จริง (ไม่ใช่ state ที่เราสั่งเอง)
  // — ปาดนิ้วเองกับกดชิปชื่อกลุ่มจึงตรงกันเสมอ
  const syncPage = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setPage((cur) => (cur === i ? cur : i));
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const goToPage = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const target = Math.min(Math.max(i, 0), INFLU_SIZE_GROUP_ORDER.length - 1);
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
    setPage(target);
  };

  // ลากวางเปิดเฉพาะจอ ≥md — จอเล็กท่าลากการ์ดทับท่าปาดเปลี่ยนกลุ่มเสมอ
  // (ย้ายกลุ่มเอง/เรียงลำดับ ทำบนจอใหญ่; เป็นค่า behavior ไม่ใช่ markup จึงตั้งหลัง mount ได้)
  const [dragEnabled, setDragEnabled] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setDragEnabled(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Space = ยก/วางการ์ดด้วยคีย์บอร์ด — เว้น Enter ไว้สำหรับเปิดหน้าเดินงาน
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const itemById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  /** ตำแหน่งของ "คน" = ตำแหน่งที่ดีที่สุดในบรรดารอบของเขา — ทำให้ทุกรอบของคนเดียวกัน
      เกาะกลุ่มกันในคอลัมน์ (ลากรอบไหนก็พาทั้งกลุ่มขยับ ซึ่งเป็นสิ่งที่ต้องการ) */
  const baseOrder = useMemo(() => {
    const anchor = new Map<string, number>();
    for (const i of items) {
      const cur = anchor.get(i.person_id);
      const pos = boardPos(i);
      if (cur === undefined || pos < cur) anchor.set(i.person_id, pos);
    }
    const m: Record<InfluSizeGroup, string[]> = { s: [], m: [], l: [] };
    const sorted = [...items].sort(
      (a, b) =>
        (anchor.get(a.person_id) ?? 0) - (anchor.get(b.person_id) ?? 0) ||
        (a.person_id < b.person_id ? -1 : a.person_id > b.person_id ? 1 : 0) ||
        a.round_no - b.round_no
    );
    for (const i of sorted) m[effectiveSizeGroup(i)].push(i.id);
    return m;
  }, [items]);

  /** เคสที่กำลังแสดงอยู่ — ชิป "รอบ N/M" ใช้บอกว่ารอบไหนถูกตัวกรองซ่อน */
  const visibleIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const currentOrder = order ?? baseOrder;

  const findGroup = (
    id: string,
    o: Record<InfluSizeGroup, string[]>
  ): InfluSizeGroup | null =>
    INFLU_SIZE_GROUP_ORDER.find((g) => o[g].includes(id)) ?? null;

  const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : rectIntersection(args);
  };

  const releaseClickSuppression = () => {
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleDragStart = (event: DragStartEvent) => {
    suppressClickRef.current = true;
    setActiveId(String(event.active.id));
    setOrder(baseOrder);
  };

  const resolveOverGroup = (
    over: DragOverEvent["over"]
  ): InfluSizeGroup | null => {
    if (!over) return null;
    const data = over.data.current;
    if (data?.type === "influ") {
      return findGroup(String(over.id), order ?? baseOrder);
    }
    if (data?.type === "col") return (data.group as InfluSizeGroup) ?? null;
    return null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const activeInflu = String(event.active.id);
    const target = resolveOverGroup(event.over);
    setOverGroup(target);
    if (!target) return;

    setOrder((prev) => {
      const o = prev ?? baseOrder;
      const source = findGroup(activeInflu, o);
      if (!source || source === target) return prev;
      const dst = [...o[target]];
      let insertAt = dst.length;
      if (event.over?.data.current?.type === "influ") {
        const idx = dst.indexOf(String(event.over.id));
        if (idx >= 0) insertAt = idx;
      }
      dst.splice(insertAt, 0, activeInflu);
      return {
        ...o,
        [source]: o[source].filter((id) => id !== activeInflu),
        [target]: dst,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    releaseClickSuppression();
    const o = order ?? baseOrder;
    const id = String(active.id);
    setActiveId(null);
    setOverGroup(null);
    setOrder(null);

    const container = findGroup(id, o);
    if (!container) return;

    let arr = o[container];
    if (over && over.data.current?.type === "influ") {
      const overId = String(over.id);
      if (findGroup(overId, o) === container && overId !== id) {
        arr = arrayMove(arr, arr.indexOf(id), arr.indexOf(overId));
      }
    }

    // ไม่มีอะไรเปลี่ยน (คอลัมน์เดิม ลำดับเดิม) — ไม่ต้องยิง DB
    if (baseOrder[container].join("\n") === arr.join("\n")) return;

    const idx = arr.indexOf(id);
    onMove(
      id,
      container,
      idx > 0 ? arr[idx - 1] : null,
      idx < arr.length - 1 ? arr[idx + 1] : null
    );
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverGroup(null);
    setOrder(null);
    // ยกเลิกด้วย Esc: ปุ่มเมาส์อาจยังกดค้าง — กัน click ที่จะตามมาหลังปล่อย
    window.addEventListener("pointerup", releaseClickSuppression, {
      once: true,
    });
    window.setTimeout(releaseClickSuppression, 350);
  };

  const handleCardClick = (influ: InfluencerListRow) => {
    if (suppressClickRef.current) return;
    onOpen(influ);
  };

  const activeInflu = activeId ? itemById.get(activeId) : undefined;

  const columns = INFLU_SIZE_GROUP_ORDER.map((g) => ({
    group: g,
    influs: currentOrder[g]
      .map((id) => itemById.get(id))
      .filter((i): i is InfluencerListRow => i !== undefined),
  }));

  return (
    <div className="max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col">
      {/* จอเล็ก: แถบสลับกลุ่ม + คำใบ้ว่าปาดได้
          — บอร์ดปาดข้างไม่มีอะไรบอกเลยว่ามีกลุ่มอื่นรออยู่นอกจอ ชิปนี้จึงทำ 2 หน้าที่:
            บอกว่ามี 3 กลุ่ม (พร้อมจำนวนเคส) + กดข้ามไปกลุ่มไหนก็ได้โดยไม่ต้องปาด */}
      <div className="mb-2 shrink-0 md:hidden">
        <div className="flex items-center gap-1">
          {columns.map((c, i) => {
            const meta = INFLU_SIZE_GROUPS[c.group];
            const active = i === page;
            return (
              <button
                key={c.group}
                type="button"
                onClick={() => goToPage(i)}
                aria-current={active}
                aria-label={`ดูกลุ่ม${meta.label} ${c.influs.length} เคส`}
                className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2 text-sm transition-all active:scale-[0.97] ${
                  active
                    ? "border-brand-200 bg-white font-semibold text-stone-800 shadow-sm"
                    : "border-transparent bg-white/45 text-stone-500"
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                <span className="truncate">{meta.label}</span>
                <span className="shrink-0 text-xs text-stone-500">
                  {c.influs.length}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-stone-500">
          <ChevronsLeft size={12} className="animate-swipe-nudge-left" />
          ปาดซ้าย–ขวาเพื่อสลับกลุ่ม
          <ChevronsRight size={12} className="animate-swipe-nudge" />
        </p>
      </div>

      <DndContext
        id="influ-board-dnd"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* ราง: <md = ปาดข้างทีละหน้า (snap) · ≥md = กริด 3 คอลัมน์เหมือนเดิม
            **ห้ามใส่ gap บนจอเล็ก** — หน้าปัจจุบันคำนวณจาก scrollLeft / clientWidth */}
        <div
          ref={trackRef}
          onScroll={syncPage}
          className="flex animate-fade-in-up [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-md:min-h-0 max-md:flex-1 max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:overflow-y-hidden max-md:overscroll-x-contain md:grid md:grid-cols-3 md:items-start md:gap-4"
        >
          {columns.map(({ group: g, influs }) => (
            <BoardColumn
              key={g}
              group={g}
              influs={influs}
              statsByInflu={statsByInflu}
              linksByInflu={linksByInflu}
              hashtagsByInflu={hashtagsByInflu}
              assigneesByInflu={assigneesByInflu}
              peopleById={peopleById}
              roundsByPerson={roundsByPerson}
              visibleIds={visibleIds}
              bookingAlertIds={bookingAlertIds}
              today={today}
              highlight={activeId !== null && overGroup === g}
              deletingId={deletingId}
              canEdit={canEdit}
              canDelete={canDelete}
              dragEnabled={dragEnabled}
              onCardClick={handleCardClick}
              onDelete={onDelete}
              onToggleDeclined={onToggleDeclined}
            />
          ))}
        </div>

        <DragOverlay>
          {activeInflu && (
            <InfluCardContent
              influ={activeInflu}
              stats={statsByInflu.get(activeInflu.id)}
              assignees={assigneesByInflu?.get(activeInflu.id)}
              peopleById={peopleById}
              rounds={roundsByPerson?.get(activeInflu.person_id)}
              today={today}
              needsBooking={bookingAlertIds.has(activeInflu.id)}
              overlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
