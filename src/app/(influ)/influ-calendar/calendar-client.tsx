"use client";

// ปฏิทินคิว Influ — redesign 2026-08-29 ตามภาพอ้างอิงที่ผู้ใช้ส่ง (หน้าตาชุดเดียวกับปฏิทิน Wellness)
//   1) ทั้งบล็อกปฏิทินเป็น "แผ่นไล่เฉดแบรนด์" — ตัวเลขวันเป็นพระเอก อ่านง่ายทั้งมือถือ/คอม
//      วันที่เลือก = ช่องขาวตัวหนังสือสีแบรนด์ · วันที่มีคิว = ป้ายตัวเลขจำนวนคิวเกาะมุมเลขวัน
//   2) ใต้ปฏิทิน (จอเล็ก) / คอลัมน์ขวา (จอ ≥lg) = การ์ดคิวรายวัน — แถบวันที่ไล่เฉดซ้ายมือ
//      + รายการคิวของวันนั้นเรียงตามเวลาอยู่ขวามือ กดแถว = โมดัลรายละเอียด
//   3) โหมดสัปดาห์ = แผ่นปฏิทินเหลือแถวเดียว (การ์ดข้างล่างยังเป็นของ "วันที่เลือก" วันเดียว)
//   4) จอ ≥lg เพิ่มชิปคิวในช่องวัน (ตามความสูงช่องจริง) — กวาดตาเห็นทั้งเดือนโดยไม่ต้องกดทีละวัน
// **state ของหน้ามีตัวเดียวคือ "วันที่เลือก"** — เดือน/สัปดาห์ที่โชว์คำนวณจากมัน จึงไม่มีทางเกิด
// สภาพ "เลื่อนเดือนแล้วรายการข้างล่างเป็นของอีกเดือน"
// แผงข้างลอยทับจอ (DaySidebar เดิม) ถูกถอดออก — รายละเอียด/ฟอร์มใช้ Modal ของระบบแทน
//
// ปรับตามผู้ใช้ 2026-08-29:
//   · คอลัมน์ขวา/ใต้ปฏิทิน = **การ์ดของวันที่เลือกใบเดียว** (ถอด "คิวถัดไป" และลิสต์ 7 วัน
//     ของโหมดสัปดาห์ออก — อยากดูวันไหนกดวันนั้นบนปฏิทิน)
//   · แสดงเฉพาะ "คิวที่ลงในปฏิทินจริง" — การซ้อน influencers.service_date แบบอ่านอย่างเดียว
//     (ชิป/แถว "จากเคส") ถูกถอดออกทั้งหมด
//   · แถวคิวโชว์แค่ เวลา · ชื่อคนที่มา · แพทย์ (ชื่อหัตถการไปดูในโมดัลรายละเอียด)
//   · เตือนเคสที่ "มาทำแล้วแต่เอกสารยังไม่เซน" — ดู unsignedContract

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Badge,
  Button,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { formatDate, todayISO } from "@/lib/format";
import {
  calendarTimeLabel,
  INFLU_CALENDAR_KIND_ORDER,
  INFLU_CALENDAR_KINDS,
  shortTime,
} from "@/lib/influ-constants";
import { logInflu } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type {
  DoctorRow,
  InfluCalendarEventRow,
  InfluCalendarKind,
  InfluencerRow,
} from "@/lib/types";
import { DoctorNameChip, DoctorSelect } from "../influencers/doctor-select";

/* ---------- types ที่หน้า server ส่งลงมา ---------- */

/** คิวบนปฏิทิน + ชื่อ influencer ที่ join มา (คิวเก่าอาจผูกกับคนที่ถูก archive แล้ว)
    `contract_file_path` มาด้วยเพื่อเตือนเคสที่มาทำแล้วแต่ยังไม่เซนสัญญา (unsignedContract) */
export type CalendarEvent = InfluCalendarEventRow & {
  influencer: Pick<
    InfluencerRow,
    "id" | "first_name" | "last_name" | "nickname" | "contract_file_path"
  > | null;
};

/** influencer สำหรับตัวเลือกในฟอร์มเพิ่ม/แก้คิว (doctor_name ใช้เติมแพทย์ให้อัตโนมัติ) */
export type CalendarInflu = Pick<
  InfluencerRow,
  "id" | "first_name" | "last_name" | "nickname" | "round_no" | "doctor_name"
>;

/* ---------- helper ระดับโมดูล ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** สร้าง YYYY-MM-DD จากปี/เดือน(0-based)/วัน — ไม่แปลง timezone จึงไม่มีวันเพี้ยน */
const isoOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/* ชื่อเดือน/วันแบบตายตัว — ไม่ใช้ toLocaleDateString กับหัวข้อ กัน SSR/CSR ได้คนละคำ */
const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const THAI_WEEKDAYS_FULL = [
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
  "อาทิตย์",
];

/* สัปดาห์เริ่มวันจันทร์ — อาทิตย์อยู่คอลัมน์ท้ายและเป็นโทนแดง */
const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

/** Date จาก YYYY-MM-DD แบบ local — ห้าม new Date(iso) ตรงๆ (parse เป็น UTC วันเพี้ยนได้) */
const dateOf = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** ดัชนีคอลัมน์แบบจันทร์ = 0 … อาทิตย์ = 6 */
const mondayIndex = (iso: string) => (dateOf(iso).getDay() + 6) % 7;

/** join ชื่อ influ มาด้วยทุกครั้งที่ insert/update — state ฝั่งจอต้องมีชื่อไว้แสดงบนชิป */
const EVENT_SELECT =
  "*, influencer:influencers(id, first_name, last_name, nickname, contract_file_path)";

const nameOf = (
  i: Pick<InfluencerRow, "first_name" | "last_name" | "nickname"> | null
): string => {
  if (!i) return "";
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
};

/** ชื่อสั้นสำหรับชิปในช่องวัน — ใช้ชื่อเล่นก่อน (ช่องแคบ ชื่อเต็มอ่านไม่ทัน) */
const nickOf = (
  i: Pick<InfluencerRow, "first_name" | "last_name" | "nickname"> | null
): string => {
  if (!i) return "";
  return i.nickname?.trim() || i.first_name?.trim() || "";
};

/** เรียงคิวในหนึ่งวัน — เริ่มก่อนอยู่บนสุด เริ่มทีหลังไล่ลงล่าง
    คิวที่ยังไม่เคาะเวลา (ทั้งวัน) ไปอยู่ล่างสุด เพราะยังไม่รู้ว่าแทรกช่วงไหน */
const sortEvents = (a: CalendarEvent, b: CalendarEvent) => {
  if (a.start_time && !b.start_time) return -1;
  if (!a.start_time && b.start_time) return 1;
  if (a.start_time && b.start_time && a.start_time !== b.start_time)
    return a.start_time.localeCompare(b.start_time);
  return a.title.localeCompare(b.title, "th");
};

/** คิว "มาทำแล้วแต่เอกสารยังไม่เซน" — เกิดนานๆ ครั้ง แต่ทีมต้องรู้ให้ทัน (ผู้ใช้ 2026-08-29)
    เกณฑ์: คิว "รับบริการ" ที่ถึงวันแล้ว (วันนี้/เลยมาแล้ว) แต่เคสยังไม่มีไฟล์สัญญาที่เซน
    — คิวในอนาคตยังไม่ผิดปกติ (มักเซนกันวันเข้ารับบริการ) จึงไม่นับ
    เกณฑ์ "เซนแล้ว" = influencers.contract_file_path มีค่า (ตัวเดียวกับที่ทำให้เคส
    เริ่มนับสัญญา — ดูขั้น "สัญญา + วันรับบริการ" ใน /influencers/[id]) */
const unsignedContract = (e: CalendarEvent, today: string) =>
  e.kind === "service" &&
  e.influencer !== null &&
  !e.influencer.contract_file_path &&
  e.event_date <= today;

/** ช่องวันทั้งหมดของเดือนที่ครอบวัน anchor (เติมช่องว่างหน้า/หลังให้ครบสัปดาห์ เริ่มวันจันทร์)
    — null = ช่องว่างนอกเดือน */
function monthCells(anchorISO: string): (string | null)[] {
  const [y, m] = anchorISO.split("-").map(Number);
  const lead = mondayIndex(isoOf(y, m - 1, 1));
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(isoOf(y, m - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** "2026-08-29" → "สิงหาคม 2569" */
const monthTitleOf = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
};

/** "2026-08-29" → "เสาร์ที่ 29 สิงหาคม 2569" */
const thaiDayTitle = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${THAI_WEEKDAYS_FULL[mondayIndex(iso)]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
};

/** เลื่อนวันแบบ ISO */
function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** ขยับเดือนโดยคงวันที่เดิมไว้ (เดือนปลายทางสั้นกว่า = ตกมาวันสุดท้ายของเดือนนั้น)
    — วันที่เลือกเป็น state ตัวเดียวของหน้า เดือนที่โชว์คำนวณจากมัน */
function shiftMonth(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const daysInTarget = new Date(y, m + delta, 0).getDate();
  const dt = new Date(y, m - 1 + delta, Math.min(d, daysInTarget));
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** 7 วันของสัปดาห์ (จันทร์–อาทิตย์) ที่ครอบวัน anchor */
function weekDaysOf(anchorISO: string): string[] {
  const monday = addDaysISO(anchorISO, -mondayIndex(anchorISO));
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

/** หัวช่วงสัปดาห์ เช่น "17 – 23 สิงหาคม 2569" (คร่อมเดือน = "28 ก.ค. – 3 ส.ค. 2569") */
function weekLabel(days: string[]): string {
  const [ay, am, ad] = days[0].split("-").map(Number);
  const [by, bm, bd] = days[6].split("-").map(Number);
  if (ay === by && am === bm) return `${ad} – ${bd} ${monthTitleOf(days[6])}`;
  const shortM = (m: number) => THAI_MONTHS[m - 1].slice(0, 3);
  return `${ad} ${shortM(am)} – ${bd} ${shortM(bm)} ${by + 543}`;
}

/* ---------- ฟอร์มคิว ---------- */

type FormState = {
  /** null = เพิ่มใหม่, มีค่า = แก้ไขคิวเดิม */
  id: string | null;
  kind: InfluCalendarKind;
  influencerId: string;
  title: string;
  doctor: string;
  date: string;
  start: string;
  end: string;
  location: string;
  note: string;
};

const emptyForm = (dateISO: string): FormState => ({
  id: null,
  kind: "service",
  influencerId: "",
  title: "",
  doctor: "",
  date: dateISO,
  start: "",
  end: "",
  location: "",
  note: "",
});

const formOf = (e: CalendarEvent): FormState => ({
  id: e.id,
  kind: e.kind,
  influencerId: e.influencer_id ?? "",
  title: e.title,
  doctor: e.doctor_name ?? "",
  date: e.event_date,
  start: shortTime(e.start_time) ?? "",
  end: shortTime(e.end_time) ?? "",
  location: e.location ?? "",
  note: e.note ?? "",
});

/* ---------- ชุดตัวกรอง (ชิปประเภท + แพทย์) ----------
   ใช้ร่วม 2 ที่: แถว inline ใต้ toolbar (จอ ≥sm) และ bottom sheet บนมือถือ —
   แยกเป็น component ระดับโมดูล กัน logic ตัวกรองแตกเป็นสองสำเนา */

function FilterControls({
  hiddenKinds,
  onToggleKind,
  doctorOptions,
  doctorFilter,
  onDoctorFilter,
}: {
  hiddenKinds: Set<InfluCalendarKind>;
  onToggleKind: (kind: InfluCalendarKind) => void;
  doctorOptions: string[];
  doctorFilter: string;
  onDoctorFilter: (name: string) => void;
}) {
  return (
    <>
      {INFLU_CALENDAR_KIND_ORDER.map((k) => {
        const meta = INFLU_CALENDAR_KINDS[k];
        const off = hiddenKinds.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggleKind(k)}
            title={off ? "แสดงประเภทนี้" : "ซ่อนประเภทนี้"}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-95 max-sm:min-h-11 ${
              off
                ? "border-stone-200 bg-white/50 text-stone-400"
                : `${meta.chip} shadow-sm`
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${off ? "bg-stone-300" : meta.dot}`}
            />
            {meta.short}
          </button>
        );
      })}
      {doctorOptions.length > 0 && (
        <Select
          aria-label="กรองตามแพทย์"
          value={doctorFilter}
          onChange={(e) => onDoctorFilter(e.target.value)}
          className="w-auto min-w-[10rem] py-1.5 max-sm:w-full"
        >
          <option value="">แพทย์: ทั้งหมด</option>
          {doctorOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      )}
    </>
  );
}

/* ---------- การ์ดคิวรายวัน (แถบวันที่ไล่เฉดซ้าย + รายการคิวขวา) ----------
   แถวคิวโชว์แค่ เวลา · ชื่อคนที่มา · แพทย์ (คำสั่งผู้ใช้ 2026-08-29) —
   ชื่อหัตถการ/สถานที่/หมายเหตุ อยู่ในโมดัลรายละเอียด */

function DayCard({
  dateISO,
  events,
  today,
  doctors,
  canEdit,
  onOpen,
  onToggleDone,
  onAdd,
}: {
  dateISO: string;
  events: CalendarEvent[];
  today: string;
  doctors: DoctorRow[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  /** ติ๊ก "เสร็จแล้ว" จากลิสต์ได้เลย ไม่ต้องเปิดโมดัล (พฤติกรรมเดิมของแผงข้าง) */
  onToggleDone: (event: CalendarEvent) => void;
  /** ปุ่มเพิ่มคิวของวันนั้น (โชว์ตอนวันนั้นยังว่าง) */
  onAdd?: () => void;
}) {
  const dayNum = Number(dateISO.slice(8));
  const isToday = dateISO === today;

  return (
    <article className="flex overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-white/70">
      <span
        className={`flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-3 text-cream sm:w-16 ${
          isToday
            ? "bg-gradient-to-b from-brand-600 to-brand-700"
            : "bg-gradient-to-b from-brand-500 to-brand-600"
        }`}
      >
        <span className="text-[11px] font-medium opacity-90">
          {WEEKDAYS[mondayIndex(dateISO)]}
        </span>
        <span className="font-display text-2xl font-semibold leading-none">
          {dayNum}
        </span>
        {isToday && <span className="text-[9px] opacity-90">วันนี้</span>}
      </span>

      <div className="min-w-0 flex-1 divide-y divide-stone-100">
        {events.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-4">
            <p className="text-sm text-stone-400">ยังไม่มีคิวในวันนี้</p>
            {canEdit && onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-11"
              >
                <Plus size={13} /> เพิ่มคิว
              </button>
            )}
          </div>
        ) : (
          events.map((ev) => {
            const label = nameOf(ev.influencer) || ev.title;
            const warn = unsignedContract(ev, today);
            return (
              // แถวคิว = 2 ปุ่มเรียงกัน (ห้ามซ้อน button ใน button) — ปุ่มหลักเปิดรายละเอียด
              // ปุ่มขวาติ๊กเสร็จ/ยังไม่เสร็จได้จากลิสต์เลย
              <div key={ev.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => onOpen(ev.id)}
                  aria-label={`ดูรายละเอียดคิว ${calendarTimeLabel(
                    ev.start_time,
                    ev.end_time
                  )} ${label}`}
                  className={`flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-3 pl-3.5 text-left transition-colors hover:bg-brand-50/60 max-sm:min-h-14 ${
                    ev.done ? "opacity-55" : ""
                  }`}
                >
                  <span className="flex w-[5.25rem] shrink-0 flex-col">
                    <span className="text-[13px] font-semibold text-stone-800 tabular-nums">
                      {calendarTimeLabel(ev.start_time, ev.end_time)}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {INFLU_CALENDAR_KINDS[ev.kind].short}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          INFLU_CALENDAR_KINDS[ev.kind].dot
                        }`}
                      />
                      <span
                        className={`truncate text-[15px] font-medium text-stone-800 ${
                          ev.done ? "line-through" : ""
                        }`}
                      >
                        {label}
                      </span>
                    </span>
                    {(ev.doctor_name || warn) && (
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {ev.doctor_name && (
                          <DoctorNameChip
                            name={ev.doctor_name}
                            doctors={doctors}
                          />
                        )}
                        {warn && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                            <AlertTriangle size={11} /> ยังไม่เซนสัญญา
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onToggleDone(ev)}
                    title={
                      ev.done
                        ? "ทำเครื่องหมายว่ายังไม่เสร็จ"
                        : "ทำเครื่องหมายว่าเสร็จแล้ว"
                    }
                    aria-label={`${ev.done ? "ยกเลิกสถานะเสร็จ" : "ทำเครื่องหมายว่าเสร็จ"}: ${label}`}
                    className="flex w-12 shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-brand-50/60 active:scale-90"
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        ev.done
                          ? "border-emerald-400 bg-emerald-400 text-white"
                          : "border-stone-300 bg-white hover:border-brand-400"
                      }`}
                    >
                      {ev.done && <Check size={12} />}
                    </span>
                  </button>
                ) : (
                  <span className="flex w-12 shrink-0 items-center justify-center">
                    <span
                      title={ev.done ? "เสร็จแล้ว" : "ยังไม่เสร็จ"}
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        ev.done
                          ? "border-emerald-300 bg-emerald-100 text-emerald-600"
                          : "border-stone-200 bg-stone-50"
                      }`}
                    >
                      {ev.done && <Check size={12} />}
                    </span>
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}

/* ---------- โมดัลรายละเอียดคิว ---------- */

function EventDetailModal({
  event,
  today,
  doctors,
  canEdit,
  error,
  onEdit,
  onDelete,
  onToggleDone,
  onClose,
}: {
  event: CalendarEvent;
  today: string;
  doctors: DoctorRow[];
  canEdit: boolean;
  error: string | null;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onToggleDone: () => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = INFLU_CALENDAR_KINDS[event.kind];
  const unsigned = unsignedContract(event, today);

  return (
    <Modal open onClose={onClose} title={thaiDayTitle(event.event_date)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={`border ${meta.chip}`}>{meta.label}</Badge>
          {event.done && (
            <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-700">
              <Check size={11} /> เสร็จแล้ว
            </Badge>
          )}
        </div>

        <h3
          className={`text-base font-semibold text-stone-900 ${
            event.done ? "line-through opacity-60" : ""
          }`}
        >
          {event.title}
        </h3>

        <dl className="space-y-2.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-xs text-stone-400">เวลา</dt>
            <dd className="flex items-center gap-1 font-medium text-stone-700 tabular-nums">
              <Clock3 size={13} className="text-stone-400" />
              {calendarTimeLabel(event.start_time, event.end_time)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-xs text-stone-400">Influencer</dt>
            <dd className="min-w-0 flex-1">
              {event.influencer ? (
                <Link
                  href={`/influencers/${event.influencer.id}`}
                  className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800"
                >
                  {nameOf(event.influencer)}
                  <ExternalLink size={11} />
                </Link>
              ) : (
                <span className="text-stone-400">ไม่ระบุ (คิวทั่วไป)</span>
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-xs text-stone-400">แพทย์</dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1 text-stone-700">
              {event.doctor_name ? (
                <DoctorNameChip name={event.doctor_name} doctors={doctors} />
              ) : (
                <>
                  <Stethoscope size={13} className="shrink-0 text-stone-400" />
                  <span className="text-stone-400">ยังไม่ระบุ</span>
                </>
              )}
            </dd>
          </div>
          {event.location && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-xs text-stone-400">สถานที่</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-1 text-stone-700">
                <MapPin size={13} className="shrink-0 text-stone-400" />
                {event.location}
              </dd>
            </div>
          )}
          {event.note && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-xs text-stone-400">หมายเหตุ</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap text-stone-600">
                {event.note}
              </dd>
            </div>
          )}
        </dl>

        {/* เตือน "มาทำแล้วแต่เอกสารยังไม่เซน" — เกิดนานๆ ครั้ง แต่ปล่อยไว้แล้วเคสค้าง
            (อัพไฟล์สัญญา = ระบบเริ่มนับสัญญา + สร้าง checklist ให้เอง) */}
        {unsigned && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle size={14} className="shrink-0" />
              เคสนี้ยังไม่มีไฟล์สัญญาที่เซน
            </p>
            <p className="mt-1 text-xs text-amber-700">
              คิวรับบริการถึงวันแล้ว ({formatDate(event.event_date)})
              แต่ยังไม่ได้อัพไฟล์สัญญาที่เซนในหน้าเคส —
              เคสจะยังไม่เริ่มนับสัญญาและไม่ขึ้นในหน้า Follow Up
            </p>
            {event.influencer && (
              <Link
                href={`/influencers/${event.influencer.id}`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-11"
              >
                เปิดเคสไปอัพไฟล์สัญญา <ExternalLink size={12} />
              </Link>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={onToggleDone}
            >
              <Check size={14} />
              {event.done ? "ยังไม่เสร็จ" : "เสร็จแล้ว"}
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={onEdit}
            >
              <Pencil size={14} /> แก้ไข
            </Button>
            <Button
              variant="danger"
              className="px-3 py-1.5 text-xs"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} /> ลบ
            </Button>
          </div>
        )}

        {confirmDelete && (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 animate-fade-in">
            ลบคิวนี้ออกจากปฏิทิน?
            <Button
              variant="secondary"
              className="px-2.5 py-1 text-xs"
              onClick={() => setConfirmDelete(false)}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              className="px-2.5 py-1 text-xs"
              onClick={async () => {
                setConfirmDelete(false);
                await onDelete();
              }}
            >
              ยืนยันลบ
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- โมดัลเพิ่ม/แก้คิว ---------- */

function EventFormModal({
  initial,
  influencers,
  doctors,
  saving,
  error,
  onSave,
  onClose,
}: {
  initial: FormState;
  influencers: CalendarInflu[];
  doctors: DoctorRow[];
  saving: boolean;
  error: string | null;
  onSave: (form: FormState) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  /** เลือก influencer แล้วเติมแพทย์ของเคสนั้นให้อัตโนมัติ (ถ้ายังไม่ได้กรอกเอง) */
  const pickInfluencer = (id: string) => {
    const influ = influencers.find((i) => i.id === id);
    setForm((f) => ({
      ...f,
      influencerId: id,
      doctor: f.doctor.trim() === "" ? (influ?.doctor_name ?? "") : f.doctor,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.date) {
      setFormError("กรุณาเลือกวันที่");
      return;
    }
    // กรอกเฉพาะเวลาสิ้นสุดจะบันทึกได้แต่ไม่ถูกแสดงที่ไหนเลย (calendarTimeLabel คืน "ทั้งวัน"
    // เมื่อไม่มีเวลาเริ่ม) — บอกให้กรอกเวลาเริ่มก่อน ดีกว่าปล่อยให้ค่าหายเงียบๆ
    if (form.end && !form.start) {
      setFormError("กรุณากรอกเวลาเริ่มด้วย (หรือลบเวลาสิ้นสุดออกถ้าเป็นคิวทั้งวัน)");
      return;
    }
    if (form.start && form.end && form.end <= form.start) {
      setFormError("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
      return;
    }
    const ok = await onSave(form);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? "แก้ไขคิว" : "เพิ่มคิว Influ"}
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="cal-influ">Influencer</Label>
          <Select
            id="cal-influ"
            value={form.influencerId}
            onChange={(e) => pickInfluencer(e.target.value)}
          >
            <option value="">— ไม่ระบุ (คิวทั่วไป) —</option>
            {/* คนเดิมเข้ามาหลายรอบมีหลายเคส — บอกรอบกำกับ ให้คิวผูกกับเคสรอบที่ถูก
                (ป้าย "รอลงคิวหมอ" เช็คคิว service ต่อเคส ผูกผิดรอบ = ป้ายไม่ดับ) */}
            {influencers.map((i) => (
              <option key={i.id} value={i.id}>
                {nameOf(i)}
                {i.round_no > 1 ? ` · รอบ ${i.round_no}` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cal-kind">ประเภทคิว</Label>
          <Select
            id="cal-kind"
            value={form.kind}
            onChange={(e) => patch({ kind: e.target.value as InfluCalendarKind })}
          >
            {INFLU_CALENDAR_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {INFLU_CALENDAR_KINDS[k].label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cal-title">รายละเอียดคิว</Label>
          <Input
            id="cal-title"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={INFLU_CALENDAR_KINDS[form.kind].label}
          />
        </div>

        <div>
          <Label htmlFor="cal-doctor">แพทย์ที่รับเคส</Label>
          <DoctorSelect
            id="cal-doctor"
            doctors={doctors}
            value={form.doctor}
            onChange={(name) => patch({ doctor: name })}
          />
          <p className="mt-1 text-xs text-stone-400">
            เลือก influencer แล้วระบบเติมแพทย์จากเคสให้อัตโนมัติ — แก้เป็นคนอื่นได้
            (เพิ่มหมอใหม่ที่เมนู &quot;จัดการหมอ&quot; บนแถบเมนูด้านบน)
          </p>
        </div>

        <div>
          <Label htmlFor="cal-date">วันที่</Label>
          <Input
            id="cal-date"
            type="date"
            value={form.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cal-start">เวลาเริ่ม</Label>
            <Input
              id="cal-start"
              type="time"
              value={form.start}
              onChange={(e) => patch({ start: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="cal-end">ถึงเวลา</Label>
            <Input
              id="cal-end"
              type="time"
              value={form.end}
              onChange={(e) => patch({ end: e.target.value })}
            />
          </div>
        </div>
        <p className="-mt-1 text-xs text-stone-400">
          ไม่กรอกเวลา = คิวทั้งวัน (ยังไม่เคาะเวลา)
        </p>

        <div>
          <Label htmlFor="cal-location">สถานที่ / ช่องทาง</Label>
          <Input
            id="cal-location"
            value={form.location}
            onChange={(e) => patch({ location: e.target.value })}
            placeholder="เช่น สตูดิโอชั้น 4, คลินิกชั้น 2"
          />
        </div>

        <div>
          <Label htmlFor="cal-note">หมายเหตุ</Label>
          <Textarea
            id="cal-note"
            rows={2}
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="รายละเอียดเพิ่มเติม เช่น ทีมที่ดูแล, สิ่งที่ต้องเตรียม"
          />
        </div>

        {(formError || error) && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {formError ?? error}
          </p>
        )}

        <div className="flex justify-end gap-2 pb-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" loading={saving}>
            {form.id ? "บันทึก" : "เพิ่มคิว"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- หน้าหลัก ---------- */

export function CalendarClient({
  events: initialEvents,
  influencers,
  doctors,
  userId,
  userName,
  canEdit,
  loadError,
}: {
  events: CalendarEvent[];
  influencers: CalendarInflu[];
  doctors: DoctorRow[];
  userId: string | null;
  userName: string | null;
  /** ระดับ "ดูเฉยๆ" = เปิดปฏิทินดูได้ แต่เพิ่ม/แก้/ลบ/ติ๊กเสร็จไม่ได้ */
  canEdit: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const actor = useMemo(
    () => ({ id: userId, name: userName }),
    [userId, userName]
  );
  const today = todayISO();

  const [events, setEvents] = useState(initialEvents);
  /** มุมมอง: รายเดือน (ค่าเริ่มต้น) / รายสัปดาห์ — แผ่นปฏิทินเหลือแถวเดียวและ agenda โชว์ครบ 7 วัน */
  const [view, setView] = useState<"month" | "week">("month");
  /** **state เดียวของหน้า** — เดือน/สัปดาห์ที่โชว์คำนวณจากวันที่เลือกนี้ */
  const [selected, setSelected] = useState(today);
  /** id ของคิวที่กำลังเปิดรายละเอียด (null = ปิด) */
  const [detail, setDetail] = useState<string | null>(null);
  /** ฟอร์มที่เปิดอยู่ (null = ปิด) — เก็บทั้งก้อนเพื่อ prefill ตอนแก้/สร้างจากเคส */
  const [formState, setFormState] = useState<FormState | null>(null);
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  // ประเภทที่ถูกซ่อน (กดชิปในแถวตัวกรอง — แถวนี้พับเก็บอยู่หลังปุ่ม "ตัวกรอง")
  const [hiddenKinds, setHiddenKinds] = useState<Set<InfluCalendarKind>>(
    () => new Set()
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** รายชื่อแพทย์สำหรับตัวกรองด้านบน — ทะเบียนหมอ (active) + ชื่อที่เคยใช้ในคิว/เคสเดิม */
  const doctorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of doctors) if (d.active) set.add(d.name);
    for (const e of events) if (e.doctor_name) set.add(e.doctor_name);
    for (const i of influencers) if (i.doctor_name) set.add(i.doctor_name);
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }, [doctors, events, influencers]);

  /* ---- กรองคิวตามคำค้น + ประเภท + แพทย์ ---- */
  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (hiddenKinds.has(e.kind)) return false;
      if (doctorFilter && e.doctor_name !== doctorFilter) return false;
      if (q === "") return true;
      return (
        e.title.toLowerCase().includes(q) ||
        nameOf(e.influencer).toLowerCase().includes(q) ||
        (e.doctor_name ?? "").toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [events, search, hiddenKinds, doctorFilter]);

  /** คิวของแต่ละวัน เรียงตามเวลา — ปฏิทินแสดงเฉพาะคิวที่ถูกลงในปฏิทินจริง
      (การซ้อน influencers.service_date แบบอ่านอย่างเดียวถูกถอดออก 2026-08-29) */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visibleEvents) {
      const list = map.get(e.event_date);
      if (list) list.push(e);
      else map.set(e.event_date, [e]);
    }
    for (const list of map.values()) list.sort(sortEvents);
    return map;
  }, [visibleEvents]);

  const eventsOf = (iso: string) => eventsByDate.get(iso) ?? [];

  /** คิวที่ "มาทำแล้วแต่ยังไม่เซนสัญญา" — คิดจากคิวทั้งหมด ไม่ผูกตัวกรอง
      (สัญญาณเตือนต้องเห็นครบเสมอ กติกาเดียวกับป้าย "รอลงคิวหมอ" บนบอร์ดเคส) */
  const unsignedQueues = useMemo(
    () =>
      events
        .filter((e) => unsignedContract(e, today))
        .sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [events, today]
  );

  const monthMode = view === "month";
  const cells = useMemo(() => monthCells(selected), [selected]);
  /** จำนวนแถวสัปดาห์ของเดือนที่ดูอยู่ (4–6) — คุมความสูงแถวตอนกางเต็มจอ */
  const rowCount = cells.length / 7;
  /** 7 วันของสัปดาห์ที่กำลังดู (โหมดสัปดาห์) */
  const weekDays = useMemo(() => weekDaysOf(selected), [selected]);
  /** ช่องที่กริดจะวาด — โหมดสัปดาห์เหลือแถวเดียว (ประกาศเป็นตัวแปรเดียวกัน ไม่ map จาก
      union ของ array 2 ชนิด ซึ่ง TypeScript เรียก .map ไม่ได้) */
  const gridCells: (string | null)[] = view === "week" ? weekDays : cells;

  /* จอ ≥lg แผ่นปฏิทินสูงพอดีจอ (หน้าไม่มี scroll — กติกาผู้ใช้ 2026-08-20) ช่องวันจึงเตี้ยลง
     ตามจอจริง — วัดความสูงกริดแล้วคิดว่าช่องหนึ่งใส่ชิปได้กี่แถว (เกินโควตา = "+N") */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [chipCapacity, setChipCapacity] = useState(2);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const cellH = el.clientHeight / (view === "week" ? 1 : rowCount);
      // 40 = แถวเลขวัน + ช่องไฟ, 20 = ชิปหนึ่งบรรทัด (text-[11px] py-0.5 + gap)
      setChipCapacity(Math.min(4, Math.max(0, Math.floor((cellH - 40) / 20))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, rowCount]);

  /** เลื่อนก่อนหน้า/ถัดไป — โหมดเดือนขยับทีละเดือน โหมดสัปดาห์ขยับทีละ 7 วัน */
  const goStep = (delta: number) =>
    setSelected((d) => (view === "week" ? addDaysISO(d, delta * 7) : shiftMonth(d, delta)));

  const openForm = (preset: Partial<FormState> = {}) => {
    setActionError(null);
    setDetail(null);
    setFormState({ ...emptyForm(selected), ...preset });
  };

  /* Esc ปิดตัวกรอง — จำเป็นกับ bottom sheet บนมือถือ (จอใหญ่ก็ได้ประโยชน์เดียวกัน) */
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  const toggleKind = (kind: InfluCalendarKind) =>
    setHiddenKinds((cur) => {
      const next = new Set(cur);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  /* ---- บันทึกคิว (เพิ่ม/แก้) ---- */
  const saveEvent = async (form: FormState): Promise<boolean> => {
    if (!canEdit) return false;
    setSaving(true);
    setActionError(null);
    const payload = {
      influencer_id: form.influencerId || null,
      title: form.title.trim() || INFLU_CALENDAR_KINDS[form.kind].label,
      kind: form.kind,
      doctor_name: form.doctor.trim() || null,
      event_date: form.date,
      start_time: form.start || null,
      end_time: form.end || null,
      location: form.location.trim() || null,
      note: form.note.trim() || null,
    };

    if (form.id) {
      const { data, error } = await supabase
        .from("influ_calendar_events")
        .update(payload)
        .eq("id", form.id)
        .select(EVENT_SELECT)
        .single();
      setSaving(false);
      if (error || !data) {
        setActionError(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
        return false;
      }
      const saved = data as unknown as CalendarEvent;
      setEvents((cur) => cur.map((e) => (e.id === saved.id ? saved : e)));
      logInflu(supabase, actor, {
        action: "update",
        entity: "calendar_event",
        entityId: saved.id,
        influencerId: saved.influencer_id,
        influencerName: nameOf(saved.influencer) || null,
        summary: `แก้คิว "${saved.title}" (${INFLU_CALENDAR_KINDS[saved.kind].label}) วันที่ ${formatDate(saved.event_date)}`,
      });
      router.refresh();
      // ย้ายคิวไปวันอื่น = ตามไปเลือกวันนั้นให้เห็นผลทันที
      setSelected(saved.event_date);
      return true;
    }

    const { data, error } = await supabase
      .from("influ_calendar_events")
      .insert({ ...payload, created_by: userId })
      .select(EVENT_SELECT)
      .single();
    setSaving(false);
    if (error || !data) {
      setActionError(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return false;
    }
    const saved = data as unknown as CalendarEvent;
    setEvents((cur) => [...cur, saved]);
    logInflu(supabase, actor, {
      action: "create",
      entity: "calendar_event",
      entityId: saved.id,
      influencerId: saved.influencer_id,
      influencerName: nameOf(saved.influencer) || null,
      summary: `เพิ่มคิว "${saved.title}" (${INFLU_CALENDAR_KINDS[saved.kind].label}) วันที่ ${formatDate(saved.event_date)}`,
    });
    router.refresh();
    setSelected(saved.event_date);
    return true;
  };

  const deleteEvent = async (id: string) => {
    if (!canEdit) return;
    const prev = events;
    const removed = events.find((e) => e.id === id) ?? null;
    setActionError(null);
    setEvents((cur) => cur.filter((e) => e.id !== id)); // optimistic
    const { error } = await supabase
      .from("influ_calendar_events")
      .delete()
      .eq("id", id);
    if (error) {
      setEvents(prev);
      setActionError(`ลบไม่สำเร็จ: ${error.message}`);
      return;
    }
    setDetail(null);
    if (removed) {
      logInflu(supabase, actor, {
        action: "delete",
        entity: "calendar_event",
        entityId: removed.id,
        influencerId: removed.influencer_id,
        influencerName: nameOf(removed.influencer) || null,
        summary: `ลบคิว "${removed.title}" วันที่ ${formatDate(removed.event_date)}`,
      });
    }
    router.refresh();
  };

  const toggleDone = async (target: CalendarEvent) => {
    if (!canEdit) return;
    const next = !target.done;
    const prev = events;
    setActionError(null);
    setEvents((cur) =>
      cur.map((e) => (e.id === target.id ? { ...e, done: next } : e))
    );
    const { error } = await supabase
      .from("influ_calendar_events")
      .update({ done: next })
      .eq("id", target.id);
    if (error) {
      setEvents(prev);
      setActionError(`บันทึกสถานะไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  /** มีตัวกรองใดถูกปรับจากค่าเริ่มต้นไหม — โชว์จุดบนปุ่ม "ตัวกรอง" กันลืมว่าซ่อนของอยู่ */
  const filterActive = hiddenKinds.size > 0 || doctorFilter !== "";

  const detailEvent = detail
    ? (events.find((e) => e.id === detail) ?? null)
    : null;

  const selectedEvents = eventsOf(selected);

  return (
    <>
      {loadError && (
        <div className="mb-3 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}
      {actionError && (
        <div className="mb-3 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {actionError}
        </div>
      )}
      {/* เตือนเคสที่มาทำแล้วแต่เอกสารยังไม่เซน — เกิดนานๆ ครั้ง จึงไม่ค่อยโผล่
          กดชิปแล้วเด้งไปที่คิวนั้นเลย (เลือกวัน + เปิดโมดัลรายละเอียด) */}
      {unsignedQueues.length > 0 && (
        <div className="mb-2.5 shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 animate-fade-in">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
            <AlertTriangle size={15} className="shrink-0" />
            มีคิวรับบริการที่ถึงวันแล้วแต่เคสยังไม่มีไฟล์สัญญาที่เซน{" "}
            {unsignedQueues.length} คิว
          </p>
          {/* จำกัดความสูง — จอ ≥lg หน้านี้ห้ามมี scroll แนวตั้ง (แบนเนอร์โตไม่ได้) */}
          <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {unsignedQueues.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setSelected(e.event_date);
                  setDetail(e.id);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-10"
              >
                {nameOf(e.influencer) || e.title}
                <span className="text-amber-600 tabular-nums">
                  {formatDate(e.event_date)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!canEdit && (
        <div className="mb-3 shrink-0 rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-600">
          บัญชีนี้เป็นระดับ &ldquo;Viewer&rdquo; — เปิดดูคิวได้ทั้งหมด แต่เพิ่ม/แก้/ลบคิวไม่ได้
        </div>
      )}

      {/* ---- แถบเครื่องมือแถวเดียว: เดือน|สัปดาห์ · ค้นหา · ตัวกรอง
           (การเลื่อนเดือน/ปุ่ม "วันนี้" ย้ายไปอยู่บนแผ่นปฏิทินตามภาพอ้างอิง) ---- */}
      <div className="mb-2.5 flex shrink-0 items-center gap-2 animate-fade-in-up lg:mb-2">
        <div className="flex shrink-0 rounded-full border border-stone-200 bg-white/70 p-0.5">
          {(
            [
              { key: "month", label: "เดือน" },
              { key: "week", label: "สัปดาห์" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`cursor-pointer rounded-full px-3.5 py-1 text-sm font-medium transition-all max-sm:min-h-10 lg:px-3 lg:py-0.5 lg:text-xs ${
                view === v.key
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                  : "text-stone-500 hover:text-brand-700"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา"
            className="py-1.5 pl-9 lg:py-1"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-label="ตัวกรองปฏิทิน"
          title="ตัวกรอง: ประเภทคิว / แพทย์"
          className={`relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors active:scale-95 sm:h-9 sm:w-9 lg:h-8 lg:w-8 ${
            filtersOpen
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-stone-200 bg-white/70 text-stone-500 hover:text-brand-700"
          }`}
        >
          <SlidersHorizontal size={16} />
          {filterActive && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
          )}
        </button>
        {canEdit && (
          <Button
            onClick={() => openForm()}
            className="shrink-0 px-3 py-1.5 max-sm:min-h-11 lg:py-1"
          >
            <Plus size={16} />
            <span className="max-sm:sr-only">เพิ่มคิว</span>
          </Button>
        )}
      </div>

      {/* ---- แถวตัวกรอง inline — เฉพาะจอ ≥sm (มือถือใช้ bottom sheet ด้านล่างแทน) ---- */}
      {filtersOpen && (
        <div className="mb-2.5 hidden shrink-0 flex-wrap items-center gap-1.5 animate-fade-in sm:flex">
          <FilterControls
            hiddenKinds={hiddenKinds}
            onToggleKind={toggleKind}
            doctorOptions={doctorOptions}
            doctorFilter={doctorFilter}
            onDoctorFilter={setDoctorFilter}
          />
        </div>
      )}

      {/* ---- ปฏิทิน (ซ้าย) + การ์ดคิวรายวัน (ขวา บนจอ ≥lg / ใต้ปฏิทินบนจอเล็ก) ----
           ≥lg ทั้งสองคอลัมน์สูงเท่าจอ — คอลัมน์ขวาเลื่อนในตัวเอง หน้าไม่ scroll */}
      <div className="min-w-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ---------------- แผ่นปฏิทินไล่เฉด ---------------- */}
        {/* เฉดเข้มกว่าปฏิทิน Wellness หนึ่งขั้น (500→700) — ช่องนี้มีตัวเลขเล็กเต็มไปหมด
            เฉด 400 ที่หัวแผ่นทำให้ตัวเลข cream อ่านไม่ออก (contrast ~2:1) */}
        <section
          className={`flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-1.5 pb-2.5 pt-2 text-cream shadow-[0_12px_36px_rgba(94,58,49,0.22)] animate-fade-in-up sm:px-3 sm:pb-3 ${
            // เดือน = กางเต็มความสูงจอ (ตารางทั้งเดือนควรใช้พื้นที่ให้คุ้ม)
            // สัปดาห์ = แถวเดียว ปล่อยให้สูงเท่าเนื้อหา ไม่งั้นได้แผ่นไล่เฉดว่างครึ่งจอ
            monthMode ? "lg:min-h-0" : "lg:self-start"
          }`}
        >
          <header className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => goStep(-1)}
              aria-label={view === "week" ? "สัปดาห์ก่อนหน้า" : "เดือนก่อนหน้า"}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95 lg:h-9 lg:w-9"
            >
              <ChevronLeft size={22} />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-center text-xl font-semibold tracking-wide sm:text-2xl lg:text-xl">
              {view === "week" ? weekLabel(weekDays) : monthTitleOf(selected)}
            </h2>
            <button
              type="button"
              onClick={() => goStep(1)}
              aria-label={view === "week" ? "สัปดาห์ถัดไป" : "เดือนถัดไป"}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95 lg:h-9 lg:w-9"
            >
              <ChevronRight size={22} />
            </button>
          </header>

          <div className="mb-1 flex shrink-0 justify-center">
            <button
              type="button"
              onClick={() => setSelected(today)}
              className="cursor-pointer rounded-full bg-white/20 px-3.5 py-1 text-xs font-medium text-cream transition-colors hover:bg-white/30 max-sm:min-h-9"
            >
              วันนี้
            </button>
          </div>

          {/* หัวคอลัมน์วัน — อาทิตย์อยู่ท้ายและจางลงเล็กน้อย */}
          <div className="grid shrink-0 grid-cols-7">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className="py-1 text-center">
                <span
                  className={`text-[11px] font-semibold sm:text-xs ${
                    i === 6 ? "text-rose-100" : "text-cream"
                  }`}
                >
                  {w}
                </span>
              </div>
            ))}
          </div>

          {/* ช่องวัน — ตัวเลขเป็นพระเอก, มีคิว = ป้ายตัวเลขจำนวนคิวเกาะมุมขวาบน */}
          <div
            ref={gridRef}
            className={`grid min-w-0 grid-cols-7 gap-x-0.5 gap-y-1 sm:gap-x-1 ${
              monthMode
                ? `lg:min-h-0 lg:flex-1 ${
                    // แถวสัปดาห์แบ่งความสูงเท่ากันตอนกางเต็มจอ (ต้องเป็นคลาส literal ให้ Tailwind เจอ)
                    rowCount <= 4
                      ? "lg:grid-rows-4"
                      : rowCount === 5
                        ? "lg:grid-rows-5"
                        : "lg:grid-rows-6"
                  }`
                : ""
            }`}
          >
            {gridCells.map((iso, idx) => {
              if (iso === null)
                return (
                  <div
                    key={`blank-${idx}`}
                    className={`h-14 ${monthMode ? "lg:h-auto" : "lg:h-24"}`}
                  />
                );
              const evs = eventsOf(iso);
              const isSelected = iso === selected;
              const isToday = iso === today;
              const sunday = idx % 7 === 6;
              const shown = evs.slice(0, chipCapacity);
              const hidden = evs.length - shown.length;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  aria-label={`เปิดคิววันที่ ${formatDate(iso)}`}
                  aria-current={isSelected ? "date" : undefined}
                  title={`${thaiDayTitle(iso)} — ${evs.length} คิว`}
                  className={`flex h-14 min-w-0 cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-xl px-0.5 py-1 transition-all active:scale-95 lg:px-1 ${
                    monthMode ? "lg:h-auto lg:min-h-0" : "lg:h-24"
                  } ${
                    isSelected
                      ? "bg-white/15 ring-1 ring-inset ring-white/70"
                      : "hover:bg-white/10"
                  }`}
                >
                  <span className="relative shrink-0">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-all sm:text-[15px] lg:h-8 lg:w-8 lg:text-sm ${
                        isSelected
                          ? "bg-white text-brand-700 shadow-md"
                          : isToday
                            ? "bg-white/35 text-cream"
                            : sunday
                              ? "text-rose-100"
                              : "text-cream"
                      }`}
                    >
                      {Number(iso.slice(8))}
                    </span>
                    {evs.length > 0 && (
                      <span
                        className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none shadow-sm ${
                          isSelected
                            ? "bg-brand-700 text-white"
                            : "bg-white text-brand-700"
                        }`}
                      >
                        {evs.length}
                      </span>
                    )}
                  </span>

                  {/* ชิปคิวในช่อง — โชว์เท่าที่ความสูงช่องรับไหว (จอเล็กช่องเตี้ย = ไม่มีชิป) */}
                  {chipCapacity > 0 && (
                    <span className="hidden w-full min-w-0 flex-col gap-0.5 lg:flex">
                      {shown.map((ev) => (
                        <span
                          key={ev.id}
                          className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight text-brand-900 ${
                            ev.done
                              ? "bg-white/50 line-through opacity-70"
                              : "bg-white/90"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              INFLU_CALENDAR_KINDS[ev.kind].dot
                            }`}
                          />
                          <span className="shrink-0 font-semibold tabular-nums">
                            {shortTime(ev.start_time) ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {nickOf(ev.influencer) || ev.title}
                          </span>
                          {/* เตือนเคสที่มาทำแล้วแต่ยังไม่มีไฟล์สัญญา */}
                          {unsignedContract(ev, today) && (
                            <AlertTriangle
                              size={10}
                              className="shrink-0 text-amber-600"
                            />
                          )}
                        </span>
                      ))}
                      {hidden > 0 && (
                        <span className="px-1 text-left text-[10px] font-medium leading-tight text-cream/80">
                          +{hidden} คิว
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------------- การ์ดคิวของ "วันที่เลือก" ----------------
            ผู้ใช้ 2026-08-29: ให้เหลือการ์ดของวันที่เลือกใบเดียว (เดิมมี "คิวถัดไป" อีก 4 ใบ
            และโหมดสัปดาห์กาง 7 ใบ) — อยากดูวันอื่นให้กดวันบนปฏิทิน ทั้ง 2 โหมดจึงใช้ก้อนนี้ร่วมกัน */}
        <section className="mt-4 space-y-2.5 lg:mt-0 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 px-1">
            <h3 className="text-sm font-semibold tracking-wide text-brand-700">
              {selected === today ? "วันนี้" : "วันที่เลือก"}
            </h3>
            <span className="text-xs text-stone-500">
              {thaiDayTitle(selected)}
            </span>
            <span className="text-xs text-stone-400">
              · {selectedEvents.length} คิว
            </span>
            {/* ทางลัดเพิ่มคิวของวันที่เลือก — ปุ่มบน toolbar อยู่สุดหน้าจอ พอเลื่อนลงมา
                อ่านการ์ดคิวบนมือถือแล้วมันหลุดจอไปแล้ว */}
            {canEdit && (
              <button
                type="button"
                onClick={() => openForm()}
                className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-10"
              >
                <Plus size={13} /> เพิ่มคิว
              </button>
            )}
          </div>

          <DayCard
            dateISO={selected}
            events={selectedEvents}
            today={today}
            doctors={doctors}
            canEdit={canEdit}
            onOpen={setDetail}
            onToggleDone={(e) => void toggleDone(e)}
            onAdd={() => openForm()}
          />
        </section>
      </div>

      {/* มือถือ: ตัวกรองเป็น bottom sheet เด้งจากขอบล่าง (ผู้ใช้ 2026-08-20 — แถว inline
          กินจอเกิน) ใช้ FilterControls ชุดเดียวกับแถว ≥sm; portal ปลอดภัยกับ SSR เพราะ
          filtersOpen เริ่ม false — สไตล์ลอกจาก Modal (rounded-t-2xl + pb-safe) ให้เข้าชุด */}
      {filtersOpen &&
        createPortal(
          <div className="sm:hidden">
            <button
              type="button"
              aria-label="ปิดตัวกรอง"
              onClick={() => setFiltersOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-brand-900/30 backdrop-blur-sm animate-fade-in"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="ตัวกรองปฏิทิน"
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-white/70 bg-white/95 shadow-2xl animate-slide-in-up"
            >
              <div className="flex items-center justify-between border-b border-brand-100/70 px-5 py-3">
                <h2 className="text-base font-semibold text-stone-900">
                  ตัวกรองปฏิทิน
                </h2>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="ปิดตัวกรอง"
                  className="-mr-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-5 py-4 pb-safe-4">
                <FilterControls
                  hiddenKinds={hiddenKinds}
                  onToggleKind={toggleKind}
                  doctorOptions={doctorOptions}
                  doctorFilter={doctorFilter}
                  onDoctorFilter={setDoctorFilter}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {detailEvent && (
        <EventDetailModal
          key={detailEvent.id}
          event={detailEvent}
          today={today}
          doctors={doctors}
          canEdit={canEdit}
          error={actionError}
          onEdit={() => {
            setDetail(null);
            setFormState(formOf(detailEvent));
          }}
          onDelete={() => deleteEvent(detailEvent.id)}
          onToggleDone={() => void toggleDone(detailEvent)}
          onClose={() => setDetail(null)}
        />
      )}

      {formState && (
        <EventFormModal
          key={formState.id ?? `new-${formState.date}`}
          initial={formState}
          influencers={influencers}
          doctors={doctors}
          saving={saving}
          error={actionError}
          onSave={saveEvent}
          onClose={() => setFormState(null)}
        />
      )}
    </>
  );
}
