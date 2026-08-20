"use client";

import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Pencil,
  Search,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Trash2,
  UserPlus,
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

/** คิวบนปฏิทิน + ชื่อ influencer ที่ join มา (คิวเก่าอาจผูกกับคนที่ถูก archive แล้ว) */
export type CalendarEvent = InfluCalendarEventRow & {
  influencer: Pick<
    InfluencerRow,
    "id" | "first_name" | "last_name" | "nickname"
  > | null;
};

/** influencer สำหรับตัวเลือกในฟอร์ม + วันเข้ารับบริการที่ซ้อนบนปฏิทิน */
export type CalendarInflu = Pick<
  InfluencerRow,
  | "id"
  | "first_name"
  | "last_name"
  | "nickname"
  | "round_no"
  | "service_date"
  | "doctor_name"
  | "stage"
  | "completed"
  | "declined_at"
  | "procedure_text"
>;

/* ---------- helper ระดับโมดูล ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** สร้าง YYYY-MM-DD จากปี/เดือน(0-based)/วัน — ไม่แปลง timezone จึงไม่มีวันเพี้ยน */
const isoOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/* สัปดาห์เริ่มวันจันทร์แบบ TimeTree (redesign 2026-08-20) — อาทิตย์อยู่ท้ายและเป็นสีแดง */
const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

/** Date จาก YYYY-MM-DD แบบ local — ห้าม new Date(iso) ตรงๆ (parse เป็น UTC วันเพี้ยนได้) */
const dateOf = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** ดัชนีคอลัมน์แบบจันทร์ = 0 … อาทิตย์ = 6 */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** join ชื่อ influ มาด้วยทุกครั้งที่ insert/update — state ฝั่งจอต้องมีชื่อไว้แสดงบนชิป */
const EVENT_SELECT =
  "*, influencer:influencers(id, first_name, last_name, nickname)";

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

/** ช่องวันทั้งหมดของเดือน (เติมช่องว่างหน้า/หลังให้ครบสัปดาห์ เริ่มวันจันทร์)
    — null = ช่องว่างนอกเดือน */
function monthCells(year: number, month: number): (number | null)[] {
  const firstWeekday = mondayIndex(new Date(year, month, 1));
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });

/** เลื่อนวันแบบ ISO */
function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** 7 วันของสัปดาห์ (จันทร์–อาทิตย์) ที่ครอบวัน anchor */
function weekDaysOf(anchorISO: string): string[] {
  const monday = addDaysISO(anchorISO, -mondayIndex(dateOf(anchorISO)));
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

/** หัวช่วงสัปดาห์ เช่น "17 – 23 สิงหาคม 2569" (คร่อมเดือน = "28 ก.ค. – 3 ส.ค. 2569") */
function weekLabel(days: string[]): string {
  const a = dateOf(days[0]);
  const b = dateOf(days[6]);
  if (a.getMonth() === b.getMonth())
    return `${a.getDate()} – ${b.getDate()} ${monthLabel(b.getFullYear(), b.getMonth())}`;
  const short = (d: Date) =>
    d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return `${short(a)} – ${b.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`;
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

/* ---------- ชิปคิวในช่องวัน ---------- */

/** แท่งสีทึบแบบ TimeTree — เวลาเข้มชัด + ชื่อ influ (รายละเอียดเต็มอยู่ใน tooltip/แผงข้าง) */
function EventChip({ event }: { event: CalendarEvent }) {
  const meta = INFLU_CALENDAR_KINDS[event.kind];
  const who = nickOf(event.influencer) || event.title;
  return (
    <span
      title={`${calendarTimeLabel(event.start_time, event.end_time)} · ${meta.label}${
        nameOf(event.influencer) ? ` · ${nameOf(event.influencer)}` : ""
      }${event.doctor_name ? ` · ${event.doctor_name}` : ""}`}
      // ≥lg ตัวใหญ่ขึ้น (ผู้ใช้ 2026-08-20 รอบสาม: ชิปคิวต้องเด่นกว่าเลขวัน) — เวลาตัวหนานำหน้า
      className={`flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-tight text-white shadow-sm lg:text-xs ${meta.solid} ${
        event.done ? "opacity-45 line-through" : ""
      }`}
    >
      <span className="shrink-0 font-bold tabular-nums">
        {shortTime(event.start_time) ?? "ทั้งวัน"}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{who}</span>
    </span>
  );
}

/* ---------- ชุดตัวกรอง (ชิปประเภท + วันรับบริการจากเคส + แพทย์) ----------
   ใช้ร่วม 2 ที่: แถว inline ใต้ toolbar (จอ ≥sm) และ bottom sheet บนมือถือ —
   แยกเป็น component ระดับโมดูล กัน logic ตัวกรองแตกเป็นสองสำเนา */

function FilterControls({
  hiddenKinds,
  onToggleKind,
  showServiceDates,
  onToggleServiceDates,
  doctorOptions,
  doctorFilter,
  onDoctorFilter,
}: {
  hiddenKinds: Set<InfluCalendarKind>;
  onToggleKind: (kind: InfluCalendarKind) => void;
  showServiceDates: boolean;
  onToggleServiceDates: () => void;
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
      <button
        type="button"
        onClick={onToggleServiceDates}
        title="สลับการแสดงวันเข้ารับบริการที่มาจากเคสในบอร์ดเคสดำเนินงาน"
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-all active:scale-95 max-sm:min-h-11 ${
          showServiceDates
            ? "border-brand-300 bg-white/70 text-brand-700"
            : "border-stone-200 bg-white/50 text-stone-400"
        }`}
      >
        <Sparkles size={12} />
        วันรับบริการจากเคส
      </button>
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

/* ---------- แผงข้างขวา: รายชื่อคิวของวันที่เลือก → รายละเอียด → ฟอร์ม ---------- */

function DaySidebar({
  dateISO,
  events,
  services,
  influencers,
  doctors,
  focusEventId,
  canEdit,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
  onToggleDone,
}: {
  dateISO: string;
  events: CalendarEvent[];
  services: CalendarInflu[];
  influencers: CalendarInflu[];
  doctors: DoctorRow[];
  /** เปิดแผงมาที่รายละเอียดคิวนี้เลย (กดจากลิสต์ "คิวที่กำลังจะถึง") */
  focusEventId: string | null;
  /** ระดับ "ดูเฉยๆ" = ไม่มีปุ่มเพิ่ม/แก้/ลบ/ติ๊กเสร็จเลย */
  canEdit: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (form: FormState) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  onToggleDone: (event: CalendarEvent) => void;
}) {
  // state ทั้งก้อนรีเซ็ตเองเมื่อเปลี่ยนวัน — ตัวเรียกใส่ key ให้ remount
  const [mode, setMode] = useState<"list" | "detail" | "form">(
    focusEventId ? "detail" : "list"
  );
  const [activeEventId, setActiveEventId] = useState<string | null>(focusEventId);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(dateISO));
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeEvent = events.find((e) => e.id === activeEventId) ?? null;
  const activeService = services.find((s) => s.id === activeServiceId) ?? null;
  // คิวที่เปิดดูอยู่ถูกลบไป (หรือถูกตัวกรองซ่อน) — ตกกลับมาที่รายการวันนั้น
  const view =
    mode === "detail" && !activeEvent && !activeService ? "list" : mode;

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const openList = () => {
    setMode("list");
    setActiveEventId(null);
    setActiveServiceId(null);
    setConfirmDelete(false);
  };

  const openDetail = (eventId: string) => {
    setActiveEventId(eventId);
    setActiveServiceId(null);
    setConfirmDelete(false);
    setMode("detail");
  };

  const openServiceDetail = (influId: string) => {
    setActiveServiceId(influId);
    setActiveEventId(null);
    setMode("detail");
  };

  /** เปิดฟอร์ม — ไม่ส่ง preset = เพิ่มคิวใหม่เปล่าๆ ของวันนี้ */
  const openForm = (preset?: Partial<FormState>) => {
    setForm({ ...emptyForm(dateISO), ...preset });
    setFormError(null);
    setMode("form");
  };

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
    const editingId = form.id;
    const ok = await onSave(form);
    if (!ok) return;
    // แก้คิวเดิมแล้วยังอยู่วันเดิม = กลับไปหน้ารายละเอียดของคิวนั้น, เพิ่มใหม่ = กลับไปลิสต์
    if (editingId && form.date === dateISO) openDetail(editingId);
    else openList();
  };

  const dayCount = events.length + services.length;

  return (
    <aside
      aria-label={`คิววันที่ ${formatDate(dateISO)}`}
      // แผงลอยทับปฏิทิน — เปิดเฉพาะตอนกดเลือกวัน (ปฏิทินจึงกินพื้นที่เต็มความกว้างตลอด)
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[27rem] flex-col border-white/70 bg-white/95 max-sm:pt-safe max-sm:pb-safe shadow-[0_0_60px_rgba(94,58,49,0.25)] backdrop-blur-2xl animate-slide-in-right sm:inset-y-3 sm:right-3 sm:rounded-2xl sm:border"
    >
      {/* ---- หัวแผง ---- */}
      <div className="flex items-center gap-2 border-b border-brand-100/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-stone-900">
            {formatDate(dateISO)}
          </p>
          <p className="text-xs text-stone-400">
            {dayCount > 0 ? `${dayCount} รายการ` : "ยังไม่มีคิว"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดแผง"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 sm:h-8 sm:w-8"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* error ของการลบ/ติ๊กเสร็จต้องขึ้นในแผงด้วย — บนมือถือแผงนี้เป็น overlay เต็มจอ
            ทับแบนเนอร์ระดับหน้าไว้ ผู้ใช้เลยเห็นเหมือนกดแล้วไม่มีอะไรเกิดขึ้น
            (โหมดฟอร์มมีบรรทัด error ของตัวเองอยู่แล้ว จึงไม่ต้องซ้ำ) */}
        {view !== "form" && error && (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 animate-fade-in">
            {error}
          </p>
        )}
        {/* ---------- โหมด: รายชื่อคิวของวันนั้น ---------- */}
        {view === "list" && (
          <>
            {events.length === 0 && services.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">
                ยังไม่มีคิวในวันนี้
                {canEdit && (
                  <>
                    <br />
                    <span className="text-xs">กดปุ่มด้านล่างเพื่อเพิ่ม Influ</span>
                  </>
                )}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((e) => {
                  const meta = INFLU_CALENDAR_KINDS[e.kind];
                  const who = nameOf(e.influencer);
                  return (
                    <li
                      key={e.id}
                      className={`flex items-start gap-2 rounded-lg border border-l-4 border-stone-200 bg-white/80 p-2 transition-colors hover:border-brand-200 ${meta.edge}`}
                    >
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => onToggleDone(e)}
                          title={
                            e.done
                              ? "ทำเครื่องหมายว่ายังไม่เสร็จ"
                              : "ทำเครื่องหมายว่าเสร็จแล้ว"
                          }
                          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center active:scale-90 max-sm:-m-3 max-sm:-mt-2.5 max-sm:h-11 max-sm:w-11"
                        >
                          {/* กล่องที่มองเห็นคงขนาดเดิม — ตัวปุ่มขยายเป็นเป้านิ้ว 44px บนจอเล็ก */}
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                              e.done
                                ? "border-emerald-400 bg-emerald-400 text-white"
                                : "border-stone-300 bg-white hover:border-brand-400"
                            }`}
                          >
                            {e.done && <Check size={12} />}
                          </span>
                        </button>
                      ) : (
                        // ดูเฉยๆ — ยังต้องเห็นว่าคิวไหนเสร็จแล้ว แต่กดเปลี่ยนไม่ได้
                        <span
                          title={e.done ? "เสร็จแล้ว" : "ยังไม่เสร็จ"}
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            e.done
                              ? "border-emerald-300 bg-emerald-100 text-emerald-600"
                              : "border-stone-200 bg-stone-50"
                          }`}
                        >
                          {e.done && <Check size={12} />}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openDetail(e.id)}
                        title={`ดูรายละเอียดคิว: ${who || e.title}`}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <span
                          className={`flex items-center gap-1.5 text-sm font-medium text-stone-800 ${
                            e.done ? "line-through opacity-60" : ""
                          }`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
                          />
                          <span className="truncate">{who || e.title}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
                          <span className="font-semibold tabular-nums">
                            {calendarTimeLabel(e.start_time, e.end_time)}
                          </span>
                          <span>· {meta.short}</span>
                          {e.doctor_name && (
                            <DoctorNameChip name={e.doctor_name} doctors={doctors} />
                          )}
                        </span>
                      </button>
                      <ChevronRight
                        size={16}
                        className="mt-1.5 shrink-0 text-stone-300"
                      />
                    </li>
                  );
                })}
              </ul>
            )}

            {/* วันเข้ารับบริการที่มาจากเคสใน pipeline (ยังไม่ได้ตั้งเป็นคิวในปฏิทิน) */}
            {services.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold text-brand-700">
                  จากเคสในบอร์ดเคสดำเนินงาน (ยังไม่ได้ตั้งคิว)
                </p>
                <ul className="space-y-1.5">
                  {services.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => openServiceDetail(s.id)}
                        title={`ดูรายละเอียดเคส: ${nameOf(s)}`}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                      >
                        <Sparkles size={13} className="shrink-0 text-brand-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-stone-800">
                            {nameOf(s)}
                          </span>
                          {(s.procedure_text || s.doctor_name) && (
                            <span className="block truncate text-xs text-stone-500">
                              {[s.procedure_text, s.doctor_name]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-stone-300" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ---------- โหมด: รายละเอียดคิว ---------- */}
        {view === "detail" && activeEvent && (
          <div className="animate-fade-in">
            <button
              type="button"
              onClick={openList}
              className="mb-3 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-stone-500 transition-colors hover:text-brand-700"
            >
              <ArrowLeft size={13} /> กลับไปรายการของวันนี้
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                className={`border ${INFLU_CALENDAR_KINDS[activeEvent.kind].chip}`}
              >
                {INFLU_CALENDAR_KINDS[activeEvent.kind].label}
              </Badge>
              {activeEvent.done && (
                <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-700">
                  <Check size={11} /> เสร็จแล้ว
                </Badge>
              )}
            </div>

            <h3
              className={`mt-2 text-base font-semibold text-stone-900 ${
                activeEvent.done ? "line-through opacity-60" : ""
              }`}
            >
              {activeEvent.title}
            </h3>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-xs text-stone-400">เวลา</dt>
                <dd className="flex items-center gap-1 font-medium text-stone-700 tabular-nums">
                  <Clock3 size={13} className="text-stone-400" />
                  {calendarTimeLabel(activeEvent.start_time, activeEvent.end_time)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-xs text-stone-400">Influencer</dt>
                <dd className="min-w-0 flex-1">
                  {activeEvent.influencer ? (
                    <Link
                      href={`/influencers/${activeEvent.influencer.id}`}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800"
                    >
                      {nameOf(activeEvent.influencer)}
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
                  {activeEvent.doctor_name ? (
                    <DoctorNameChip
                      name={activeEvent.doctor_name}
                      doctors={doctors}
                    />
                  ) : (
                    <>
                      <Stethoscope size={13} className="shrink-0 text-stone-400" />
                      <span className="text-stone-400">ยังไม่ระบุ</span>
                    </>
                  )}
                </dd>
              </div>
              {activeEvent.location && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs text-stone-400">สถานที่</dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-1 text-stone-700">
                    <MapPin size={13} className="shrink-0 text-stone-400" />
                    {activeEvent.location}
                  </dd>
                </div>
              )}
              {activeEvent.note && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs text-stone-400">หมายเหตุ</dt>
                  <dd className="min-w-0 flex-1 whitespace-pre-wrap text-stone-600">
                    {activeEvent.note}
                  </dd>
                </div>
              )}
            </dl>

            {canEdit && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => onToggleDone(activeEvent)}
                >
                  <Check size={14} />
                  {activeEvent.done ? "ยังไม่เสร็จ" : "เสร็จแล้ว"}
                </Button>
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => {
                    setForm(formOf(activeEvent));
                    setFormError(null);
                    setMode("form");
                  }}
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
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 animate-fade-in">
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
                    await onDelete(activeEvent.id);
                    openList();
                  }}
                >
                  ยืนยันลบ
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ---------- โหมด: รายละเอียดวันรับบริการที่มาจากเคส (อ่านอย่างเดียว) ---------- */}
        {view === "detail" && activeService && (
          <div className="animate-fade-in">
            <button
              type="button"
              onClick={openList}
              className="mb-3 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-stone-500 transition-colors hover:text-brand-700"
            >
              <ArrowLeft size={13} /> กลับไปรายการของวันนี้
            </button>

            <Badge className="border border-dashed border-brand-300 bg-white/70 text-brand-700">
              <Sparkles size={11} /> วันรับบริการจากเคส
            </Badge>
            <h3 className="mt-2 text-base font-semibold text-stone-900">
              {nameOf(activeService)}
            </h3>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-xs text-stone-400">หัตถการ</dt>
                <dd className="min-w-0 flex-1 text-stone-700">
                  {activeService.procedure_text || (
                    <span className="text-stone-400">ยังไม่ระบุ</span>
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-xs text-stone-400">แพทย์</dt>
                <dd className="flex min-w-0 flex-1 items-center gap-1 text-stone-700">
                  {activeService.doctor_name ? (
                    <DoctorNameChip
                      name={activeService.doctor_name}
                      doctors={doctors}
                    />
                  ) : (
                    <>
                      <Stethoscope size={13} className="shrink-0 text-stone-400" />
                      <span className="text-stone-400">ยังไม่ระบุ</span>
                    </>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  className="px-3 py-1.5 text-xs"
                  onClick={() =>
                    openForm({
                      kind: "service",
                      influencerId: activeService.id,
                      doctor: activeService.doctor_name ?? "",
                      title: activeService.procedure_text ?? "",
                    })
                  }
                >
                  <CalendarPlus size={14} /> สร้างคิวจากเคสนี้
                </Button>
              )}
              <Link
                href={`/influencers/${activeService.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                เปิดเคส <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        )}

        {/* ---------- โหมด: ฟอร์มเพิ่ม/แก้คิว ---------- */}
        {view === "form" && (
          <form onSubmit={submit} className="space-y-3 animate-fade-in">
            <button
              type="button"
              onClick={() =>
                form.id && activeEventId ? openDetail(activeEventId) : openList()
              }
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-stone-500 transition-colors hover:text-brand-700"
            >
              <ArrowLeft size={13} /> {form.id ? "กลับไปรายละเอียด" : "กลับไปรายการ"}
            </button>

            <p className="text-sm font-semibold text-stone-800">
              {form.id ? "แก้ไขคิว" : "เพิ่มคิว Influ"}
            </p>

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
                onChange={(e) =>
                  patch({ kind: e.target.value as InfluCalendarKind })
                }
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
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  form.id && activeEventId ? openDetail(activeEventId) : openList()
                }
              >
                ยกเลิก
              </Button>
              <Button type="submit" loading={saving}>
                {form.id ? "บันทึก" : "เพิ่มคิว"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* ---- ปุ่มเพิ่ม influ ประจำวันนั้น (ซ่อนตอนอยู่ในฟอร์ม/ระดับดูเฉยๆ) ---- */}
      {view !== "form" && canEdit && (
        <div className="border-t border-brand-100/70 px-4 py-3 pb-safe-3 sm:pb-3">
          <Button className="w-full" onClick={() => openForm()}>
            <UserPlus size={16} />
            เพิ่ม Influ ในวันนี้
          </Button>
        </div>
      )}
    </aside>
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
  /** มุมมองแบบ TimeTree: รายเดือน (ค่าเริ่มต้น) / รายสัปดาห์ */
  const [view, setView] = useState<"month" | "week">("month");
  /** วันอ้างอิงของมุมมอง — โหมดเดือนใช้ ปี/เดือน ของวันนี้, โหมดสัปดาห์ใช้สัปดาห์ที่ครอบวันนี้ */
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);
  /** มือถือ: แผงข้างเป็น overlay จึงเปิดเฉพาะตอนกดวัน (จอ ≥lg แสดงตลอด) */
  const [panelOpen, setPanelOpen] = useState(false);
  /** นับครั้งที่เปิดแผง — ใช้เป็น key ให้แผงรีเซ็ตโหมดทุกครั้งที่กดวัน/กดคิว */
  const [panelSeq, setPanelSeq] = useState(0);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  // ประเภทที่ถูกซ่อน (กดชิปในแถวตัวกรอง — แถวนี้พับเก็บอยู่หลังปุ่ม "ตัวกรอง")
  const [hiddenKinds, setHiddenKinds] = useState<Set<InfluCalendarKind>>(
    () => new Set()
  );
  const [showServiceDates, setShowServiceDates] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const cursor = useMemo(() => {
    const [y, m] = anchor.split("-").map(Number);
    return { year: y, month: m - 1 };
  }, [anchor]);

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

  /* ---- วันเข้ารับบริการจากเคส (ซ้อนแบบอ่านอย่างเดียว)
         ข้ามคนที่มีคิวประเภท "รับบริการ" ในวันเดียวกันอยู่แล้ว — กันแสดงซ้ำ ---- */
  const servicesByDate = useMemo(() => {
    const map = new Map<string, CalendarInflu[]>();
    if (!showServiceDates) return map;
    const q = search.trim().toLowerCase();
    for (const i of influencers) {
      if (!i.service_date || i.declined_at) continue;
      if (doctorFilter && i.doctor_name !== doctorFilter) continue;
      if (
        q !== "" &&
        !nameOf(i).toLowerCase().includes(q) &&
        !(i.doctor_name ?? "").toLowerCase().includes(q)
      )
        continue;
      // เทียบกับคิวที่ "มองเห็นอยู่จริง" ไม่ใช่ events ดิบ — ไม่งั้นพอซ่อนชนิด "รับบริการ"
      // หรือกรองแพทย์ (ชื่อแพทย์ในคิวแก้แยกจากในเคสได้) คิวจะหายจากกริดแต่ยังกดทับ
      // ไม่ให้ชิปวันรับบริการโผล่ = เคสนั้นหายไปทั้งคู่
      const dup = visibleEvents.some(
        (e) =>
          e.influencer_id === i.id &&
          e.event_date === i.service_date &&
          e.kind === "service"
      );
      if (dup) continue;
      const list = map.get(i.service_date);
      if (list) list.push(i);
      else map.set(i.service_date, [i]);
    }
    return map;
  }, [influencers, visibleEvents, showServiceDates, search, doctorFilter]);

  const cells = useMemo(
    () => monthCells(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  );

  /** จำนวนแถวสัปดาห์ของเดือนที่ดูอยู่ (4–6) — ใช้ทั้งคลาส lg:grid-rows-N และการวัดความสูงช่อง */
  const rowCount = cells.length / 7;

  /* จอ ≥lg ปฏิทินสูงพอดีจอ ไม่มี scroll ทั้งหน้า (คำสั่งผู้ใช้ 2026-08-20) — ช่องวันเตี้ยลง
     ตามจอจริง จึงวัดความสูงกริดแล้วคิดว่าช่องหนึ่งใส่ชิปได้กี่แถว (เกินโควตา = แถว "+N คิว")
     จอเล็ก/กลางช่องยังมี min-height เดิม ค่าที่วัดได้ชนเพดาน 4 = จำนวนชิปเท่าพฤติกรรมเดิมพอดี */
  const monthGridRef = useRef<HTMLDivElement | null>(null);
  const [chipCapacity, setChipCapacity] = useState(4);
  useEffect(() => {
    if (view !== "month") return;
    const el = monthGridRef.current;
    if (!el) return;
    const measure = () => {
      const cellH = el.clientHeight / rowCount;
      // 26 = แถวเลขวัน (≥lg ย่อเหลือ h-5) + ช่องไฟ, 27 = ชิป text-xs py-1 + ช่องไฟ (ดู EventChip)
      setChipCapacity(Math.min(4, Math.max(1, Math.floor((cellH - 26) / 27))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, rowCount]);

  /** 7 วันของสัปดาห์ที่กำลังดู (โหมดสัปดาห์) */
  const weekDays = useMemo(() => weekDaysOf(anchor), [anchor]);

  /** เลื่อนก่อนหน้า/ถัดไป — โหมดเดือนขยับทีละเดือน โหมดสัปดาห์ขยับทีละ 7 วัน */
  const goStep = (delta: number) =>
    setAnchor((a) => {
      if (view === "week") return addDaysISO(a, delta * 7);
      const [y, m] = a.split("-").map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return isoOf(d.getFullYear(), d.getMonth(), 1);
    });

  const goToday = () => setAnchor(today);

  /** เลือกวัน → เปิดแผงลอยทับปฏิทิน; ส่ง eventId มาด้วยเพื่อเปิดรายละเอียดเลย */
  const openDate = (dateISO: string, eventId: string | null = null) => {
    setAnchor(dateISO);
    setSelectedDay(dateISO);
    setFocusEventId(eventId);
    setPanelSeq((n) => n + 1);
    setPanelOpen(true);
    setActionError(null);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setFocusEventId(null);
  };

  /* Esc ปิดแผงลอย — dropdown เลือกแพทย์ดัก Esc ไว้ตั้งแต่ capture phase แล้ว
     (stopPropagation) ตัวฟังนี้จึงไม่ไปปิดแผงทั้งบานตอนแค่อยากปิดเมนู */
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

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
      // ย้ายคิวไปวันอื่น = ตามไปเปิดวันนั้นให้เห็นผลทันที
      if (saved.event_date !== selectedDay) openDate(saved.event_date, saved.id);
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
    if (saved.event_date !== selectedDay) openDate(saved.event_date);
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

  /** มีตัวกรองใดถูกปรับจากค่าเริ่มต้นไหม — โชว์จุดแดงบนปุ่ม "ตัวกรอง" กันลืมว่าซ่อนของอยู่ */
  const filterActive =
    hiddenKinds.size > 0 || doctorFilter !== "" || !showServiceDates;

  return (
    <>
      {loadError && (
        <div className="mb-4 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}
      {actionError && (
        <div className="mb-4 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {actionError}
        </div>
      )}
      {!canEdit && (
        <div className="mb-4 shrink-0 rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-600">
          บัญชีนี้เป็นระดับ &ldquo;Viewer&rdquo; — เปิดดูคิวได้ทั้งหมด แต่เพิ่ม/แก้/ลบคิวไม่ได้
        </div>
      )}

      {/* ---- แถบเครื่องมือแบบ TimeTree: วันนี้ · ‹ › · ชื่อเดือน · เดือน/สัปดาห์ · ค้นหา · ตัวกรอง
           จอเล็กยุบเหลือ 2 แถวกะทัดรัด (ผู้ใช้ 2026-08-20: toolbar เดิมกินจอมือถือเกือบ 20%) ---- */}
      {/* ≥lg ย่อทุกชิ้น + ชิดบน (ผู้ใช้ 2026-08-20 รอบสาม: header กินพื้นที่ปฏิทินบนคอม) */}
      <div className="mb-3 flex shrink-0 flex-col gap-2 animate-fade-in-up sm:flex-row sm:flex-wrap sm:items-center lg:mb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="secondary"
            onClick={goToday}
            className="shrink-0 px-3 py-1.5 max-sm:min-h-11 lg:py-1"
          >
            วันนี้
          </Button>
          <div className="flex shrink-0 items-center rounded-lg border border-stone-200 bg-white/70 p-0.5">
            <button
              type="button"
              onClick={() => goStep(-1)}
              aria-label={view === "week" ? "สัปดาห์ก่อนหน้า" : "เดือนก่อนหน้า"}
              className="flex h-10 w-11 cursor-pointer items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 sm:h-8 sm:w-8 lg:h-6 lg:w-7"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => goStep(1)}
              aria-label={view === "week" ? "สัปดาห์ถัดไป" : "เดือนถัดไป"}
              className="flex h-10 w-11 cursor-pointer items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 sm:h-8 sm:w-8 lg:h-6 lg:w-7"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <h2 className="min-w-0 truncate text-lg font-bold text-stone-900 sm:text-xl lg:text-base">
            {view === "week"
              ? weekLabel(weekDays)
              : monthLabel(cursor.year, cursor.month)}
          </h2>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {/* สลับมุมมอง เดือน/สัปดาห์ (segmented pill) */}
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
          <div className="relative min-w-0 flex-1 sm:w-48 sm:flex-none md:w-56">
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
            title="ตัวกรอง: ประเภทคิว / แพทย์ / วันรับบริการจากเคส"
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
        </div>
      </div>

      {/* ---- แถวตัวกรอง inline — เฉพาะจอ ≥sm (มือถือใช้ bottom sheet ด้านล่างแทน) ---- */}
      {filtersOpen && (
        <div className="mb-3 hidden shrink-0 flex-wrap items-center gap-1.5 animate-fade-in sm:flex">
          <FilterControls
            hiddenKinds={hiddenKinds}
            onToggleKind={toggleKind}
            showServiceDates={showServiceDates}
            onToggleServiceDates={() => setShowServiceDates((v) => !v)}
            doctorOptions={doctorOptions}
            doctorFilter={doctorFilter}
            onDoctorFilter={setDoctorFilter}
          />
        </div>
      )}

      {/* ---- ปฏิทิน (เต็มความกว้าง — แผงข้างเป็นแผงลอยทับ ไม่กินพื้นที่)
           จอ ≥lg: กางสูงเต็มพื้นที่ที่เหลือ (หน้าไม่มี scroll — ดู container ใน page.tsx) ---- */}
      <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        {view === "month" && (
          // ไม่มีกรอบ Card ครอบแล้ว (ผู้ใช้ 2026-08-20 รอบสาม: กรอบ+padding ทำให้ใช้พื้นที่
          // ไม่คุ้ม) — กริดมีเส้นขอบมนของตัวเองอยู่แล้ว ให้กินพื้นที่เต็มความกว้าง/สูง
          <div className="animate-fade-in-up lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <div className="grid shrink-0 grid-cols-7">
              {WEEKDAYS.map((w, idx) => (
                <div
                  key={w}
                  className={`pb-1.5 text-center text-xs font-semibold sm:text-sm lg:pb-1 lg:text-xs ${
                    idx === 6 ? "text-rose-500" : "text-stone-500"
                  }`}
                >
                  {w}
                </div>
              ))}
            </div>
            <div
              ref={monthGridRef}
              className={`grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-stone-200/70 bg-stone-200/70 lg:min-h-0 lg:flex-1 ${
                // แถวสัปดาห์แบ่งความสูงเท่ากันเมื่อกริดถูกกางเต็มจอ (ต้องเป็นคลาส literal ให้ Tailwind เจอ)
                rowCount <= 4
                  ? "lg:grid-rows-4"
                  : rowCount === 5
                    ? "lg:grid-rows-5"
                    : "lg:grid-rows-6"
              }`}
            >
              {cells.map((day, idx) => {
                if (day === null)
                  return (
                    <div
                      key={`blank-${idx}`}
                      className="min-h-[92px] bg-white/40 sm:min-h-[168px] lg:min-h-0"
                    />
                  );
                const iso = isoOf(cursor.year, cursor.month, day);
                const dayEvents = eventsByDate.get(iso) ?? [];
                const dayServices = servicesByDate.get(iso) ?? [];
                // โควตาชิปต่อช่องตามความสูงจริง — ถ้าเกินให้เสียหนึ่งบรรทัดเป็น "+N คิว"
                const totalChips = dayEvents.length + dayServices.length;
                const budget =
                  totalChips > chipCapacity
                    ? Math.max(1, chipCapacity - 1)
                    : chipCapacity;
                const evShown = dayEvents.slice(0, budget);
                const svShown = dayServices.slice(0, budget - evShown.length);
                const hiddenChips =
                  totalChips - evShown.length - svShown.length;
                const isToday = iso === today;
                const isSelected = iso === selectedDay && panelOpen;
                const sunday = idx % 7 === 6;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => openDate(iso)}
                    title={`ดู/เพิ่มคิววันที่ ${formatDate(iso)}`}
                    className={`flex min-h-[92px] cursor-pointer flex-col gap-1 p-1 text-left transition-colors sm:min-h-[168px] sm:gap-1.5 sm:p-1.5 lg:min-h-0 lg:overflow-hidden ${
                      isSelected
                        ? "bg-brand-50 ring-2 ring-inset ring-brand-400"
                        : isToday
                          ? "bg-stone-50/90"
                          : "bg-white/85"
                    } hover:bg-brand-50/80`}
                  >
                    {/* เลขวันกลางช่องแบบ TimeTree — วันนี้เป็นวงกลมทึบ, อาทิตย์สีแดง
                        ≥lg เลขเล็กลง (ผู้ใช้ 2026-08-20 รอบสาม) คืนพื้นที่ให้ชิปคิว */}
                    <span className="flex justify-center">
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums sm:h-7 sm:min-w-7 sm:text-sm lg:h-5 lg:min-w-5 lg:text-[11px] ${
                          isToday
                            ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                            : sunday
                              ? "text-rose-500"
                              : "text-stone-700"
                        }`}
                      >
                        {day}
                      </span>
                    </span>

                    {/* จอเล็ก: แท่งสีจิ๋วพร้อมชื่อ (แบบ TimeTree บนมือถือ) */}
                    <span className="flex w-full min-w-0 flex-col gap-0.5 sm:hidden">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`w-full truncate rounded-sm px-1 py-px text-[10px] font-medium leading-3.5 text-white ${
                            INFLU_CALENDAR_KINDS[e.kind].solid
                          } ${e.done ? "opacity-40" : ""}`}
                        >
                          {nickOf(e.influencer) || e.title}
                        </span>
                      ))}
                      {dayServices.slice(0, 1).map((s) => (
                        <span
                          key={s.id}
                          className="w-full truncate rounded-sm border border-dashed border-brand-400 px-1 py-px text-[10px] font-medium leading-3.5 text-brand-600"
                        >
                          {nickOf(s)}
                        </span>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] leading-none text-stone-400">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </span>

                    {/* จอใหญ่: ชิปคิวตามโควตาความสูงช่อง (เรียงตามเวลาเริ่ม — เริ่มก่อนอยู่บน) */}
                    <span className="hidden w-full min-w-0 flex-col gap-1 sm:flex">
                      {evShown.map((e) => (
                        <EventChip key={e.id} event={e} />
                      ))}
                      {svShown.map((s) => (
                        <span
                          key={s.id}
                          title={`วันรับบริการจากเคส (ยังไม่เคาะเวลา — สร้างคิวจริงได้ในแผงข้าง): ${nameOf(s)}${
                            s.doctor_name ? ` · ${s.doctor_name}` : ""
                          }`}
                          className="flex w-full items-center gap-1 rounded-md border border-dashed border-brand-300 px-1.5 py-1 text-[11px] leading-tight text-brand-600 lg:text-xs"
                        >
                          {/* ป้าย "จากเคส" อยู่ตำแหน่งเดียวกับเวลาบนชิปคิวจริง —
                              บอกตรงๆ ว่าใบนี้ยังไม่มีเวลานัด (service_date เป็นแค่วัน) */}
                          <span className="shrink-0 text-[10px] font-semibold lg:text-[11px]">
                            จากเคส
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {nickOf(s)}
                          </span>
                        </span>
                      ))}
                      {hiddenChips > 0 && (
                        <span className="px-1 text-[11px] font-medium leading-tight text-stone-400">
                          +{hiddenChips} คิว
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- มุมมองสัปดาห์: จอใหญ่เป็น 7 คอลัมน์ / จอเล็กเป็นลิสต์ไล่วัน (อ่านชื่อ+เวลาชัด) ---- */}
        {view === "week" && (
          <div className="animate-fade-in-up lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            {/* จอ ≥sm: คอลัมน์ต่อวัน โชว์คิวครบทุกใบ — ≥lg สูงเต็มพื้นที่ (แถวเดียวกาง 1fr) */}
            <div className="hidden grid-cols-7 gap-px overflow-hidden rounded-lg border border-stone-200/70 bg-stone-200/70 sm:grid lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)]">
              {weekDays.map((iso, idx) => {
                const dayEvents = eventsByDate.get(iso) ?? [];
                const dayServices = servicesByDate.get(iso) ?? [];
                const isToday = iso === today;
                const isSelected = iso === selectedDay && panelOpen;
                const d = dateOf(iso);
                return (
                  <div
                    key={iso}
                    className={`flex min-h-[420px] flex-col lg:min-h-0 ${
                      isSelected
                        ? "bg-brand-50 ring-2 ring-inset ring-brand-400"
                        : isToday
                          ? "bg-stone-50/90"
                          : "bg-white/85"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openDate(iso)}
                      title={`ดู/เพิ่มคิววันที่ ${formatDate(iso)}`}
                      className="flex cursor-pointer flex-col items-center gap-0.5 border-b border-stone-100 py-2 transition-colors hover:bg-brand-50/80"
                    >
                      <span
                        className={`text-xs font-semibold ${
                          idx === 6 ? "text-rose-500" : "text-stone-500"
                        }`}
                      >
                        {WEEKDAYS[idx]}
                      </span>
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${
                          isToday
                            ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                            : idx === 6
                              ? "text-rose-500"
                              : "text-stone-700"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                    </button>
                    {/* ≥lg คิวเยอะกว่าความสูงคอลัมน์ = เลื่อนในคอลัมน์เอง (หน้ารวมไม่ scroll) */}
                    <div className="flex flex-1 flex-col gap-1 p-1.5 lg:min-h-0 lg:overflow-y-auto">
                      {dayEvents.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => openDate(iso, e.id)}
                          className="w-full cursor-pointer text-left transition-transform active:scale-[0.98]"
                        >
                          <EventChip event={e} />
                        </button>
                      ))}
                      {dayServices.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => openDate(iso)}
                          title={`วันรับบริการจากเคส (ยังไม่เคาะเวลา — สร้างคิวจริงได้ในแผงข้าง): ${nameOf(s)}${
                            s.doctor_name ? ` · ${s.doctor_name}` : ""
                          }`}
                          className="flex w-full cursor-pointer items-center gap-1 rounded-md border border-dashed border-brand-300 px-1.5 py-1 text-left text-[11px] leading-tight text-brand-600 transition-colors hover:bg-brand-50 lg:text-xs"
                        >
                          <span className="shrink-0 text-[10px] font-semibold lg:text-[11px]">
                            จากเคส
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {nickOf(s)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* จอเล็ก: agenda ไล่ทีละวัน — เวลาตัวหนา + แถบสีตามประเภท */}
            <div className="divide-y divide-stone-100 sm:hidden">
              {weekDays.map((iso, idx) => {
                const dayEvents = eventsByDate.get(iso) ?? [];
                const dayServices = servicesByDate.get(iso) ?? [];
                const isToday = iso === today;
                const d = dateOf(iso);
                return (
                  <div key={iso} className="py-1.5">
                    <button
                      type="button"
                      onClick={() => openDate(iso)}
                      className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-1 text-left"
                    >
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                          isToday
                            ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                            : idx === 6
                              ? "text-rose-500"
                              : "text-stone-700"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          idx === 6 ? "text-rose-500" : "text-stone-500"
                        }`}
                      >
                        {WEEKDAYS[idx]}
                        {isToday && (
                          <span className="ml-1.5 text-brand-600">· วันนี้</span>
                        )}
                      </span>
                      {dayEvents.length + dayServices.length > 0 && (
                        <span className="ml-auto text-xs text-stone-400">
                          {dayEvents.length + dayServices.length} รายการ
                        </span>
                      )}
                    </button>
                    {dayEvents.map((e) => {
                      const meta = INFLU_CALENDAR_KINDS[e.kind];
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => openDate(iso, e.id)}
                          className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 pl-3 text-left transition-colors hover:bg-brand-50/60 ${
                            e.done ? "opacity-50" : ""
                          }`}
                        >
                          <span
                            className={`w-1.5 self-stretch rounded-full ${meta.solid}`}
                          />
                          <span className="w-12 shrink-0 text-sm font-bold text-stone-800 tabular-nums">
                            {shortTime(e.start_time) ?? "ทั้งวัน"}
                          </span>
                          <span
                            className={`min-w-0 flex-1 truncate text-sm font-medium text-stone-800 ${
                              e.done ? "line-through" : ""
                            }`}
                          >
                            {nickOf(e.influencer) || e.title}
                          </span>
                          <span className="shrink-0 text-xs text-stone-400">
                            {meta.short}
                          </span>
                        </button>
                      );
                    })}
                    {dayServices.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openDate(iso)}
                        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 pl-3 text-left transition-colors hover:bg-brand-50/60"
                      >
                        <span className="w-1.5 self-stretch rounded-full border border-dashed border-brand-400" />
                        <span className="w-12 shrink-0 text-xs text-stone-400">
                          จากเคส
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-700">
                          {nickOf(s)}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
                  showServiceDates={showServiceDates}
                  onToggleServiceDates={() => setShowServiceDates((v) => !v)}
                  doctorOptions={doctorOptions}
                  doctorFilter={doctorFilter}
                  onDoctorFilter={setDoctorFilter}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* แผงข้าง — เปิดเฉพาะตอนกดเลือกวัน แล้วลอยทับปฏิทิน (กดฉากหลัง/Esc เพื่อปิด)
          portal ออกไป body ตามกติกาเดียวกับ Modal: parent ที่มี backdrop-filter/transform
          จะทำให้ position:fixed ของแผงไปยึดกับกล่องนั้นแทนทั้งจอ
          (ปลอดภัยกับ SSR เพราะ panelOpen เริ่มเป็น false — portal เกิดหลัง hydrate เสมอ) */}
      {panelOpen &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="ปิดแผงคิว"
              onClick={closePanel}
              className="fixed inset-0 z-40 cursor-default bg-stone-900/15 backdrop-blur-[2px] animate-fade-in"
            />
            <DaySidebar
              key={`${selectedDay}#${panelSeq}`}
              dateISO={selectedDay}
              events={eventsByDate.get(selectedDay) ?? []}
              services={servicesByDate.get(selectedDay) ?? []}
              influencers={influencers}
              doctors={doctors}
              focusEventId={focusEventId}
              canEdit={canEdit}
              saving={saving}
              error={actionError}
              onClose={closePanel}
              onSave={saveEvent}
              onDelete={deleteEvent}
              onToggleDone={toggleDone}
            />
          </>,
          document.body
        )}
    </>
  );
}
