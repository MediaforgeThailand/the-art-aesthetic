"use client";

// ปฏิทินคิวแพทย์ Wellness — **มือถือเป็นตัวตั้ง** (คำสั่งผู้ใช้ 2026-08-28):
// ตารางเดือนแบบกะทัดรัดอยู่บน (ตัวเลขวัน + จุดเล็กบอกว่าวันนั้นมีคิว)
// แล้ว "การ์ดคิวของวันที่เลือก" ไหลอยู่ข้างล่างในหน้าเดียวกัน — ไม่มีแผงลอยทับจออีก
// จอ ≥lg แถวเดียวกันนี้กลายเป็น 2 คอลัมน์ (ปฏิทินซ้าย · คิวของวันขวา)
//
// การลงคิว/ย้ายกลับเป็น "นัดไว้" ดัก 23P01 จาก exclusion constraint = คิวชนกัน
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Phone,
  Plus,
  Stethoscope,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Input, Label, Modal } from "@/components/ui";
import {
  BookingFields,
  newBookingDraft,
  type BookingDraft,
} from "@/components/wellness/booking-fields";
import { LabFileOpenLink } from "@/components/wellness/lab-files";
import type {
  WellnessAppointmentRow,
  WellnessApptStatus,
  WellnessCustomerRow,
  WellnessLabFileRow,
} from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  CALENDAR_APPT_SELECT,
  WELLNESS_APPT_STATUS,
  apptErrorMessage,
  apptRangeLabel,
  formatTimeShort,
  isWellnessDoctorDay,
  todayBangkokISO,
  wellnessCustomerName,
} from "@/lib/wellness-constants";

export type CalendarLabFile = Pick<
  WellnessLabFileRow,
  "id" | "file_path" | "file_name" | "created_at"
>;

export type CalendarCustomer = Pick<
  WellnessCustomerRow,
  | "id"
  | "first_name"
  | "last_name"
  | "phone"
  | "procedure_text"
  | "lab_confirmed_at"
  | "completed_at"
> & { lab_files: CalendarLabFile[] };

export type CalendarAppt = WellnessAppointmentRow & {
  customer: CalendarCustomer | null;
};

/** ลูกค้าสำหรับฟอร์มลงคิว (list ทุกการ์ด — สถานะช่วย admin เลือกคนที่ผลพร้อม) */
export type BookableCustomer = Pick<
  WellnessCustomerRow,
  "id" | "first_name" | "last_name" | "phone" | "lab_confirmed_at" | "completed_at"
>;

/* ============================================================
   ตัวช่วยปฏิทิน (module-level — ไม่ใช้ toLocaleDateString กัน SSR/CSR เพี้ยน)
   ============================================================ */

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

// หัวคอลัมน์ — จันทร์เริ่ม, อ./ส. = วันแพทย์เข้า (เน้น brand), อาทิตย์ท้ายแถวสีแดง
const WEEKDAY_HEADS: { label: string; doctor: boolean; sunday: boolean }[] = [
  { label: "จ", doctor: false, sunday: false },
  { label: "อ", doctor: true, sunday: false },
  { label: "พ", doctor: false, sunday: false },
  { label: "พฤ", doctor: false, sunday: false },
  { label: "ศ", doctor: false, sunday: false },
  { label: "ส", doctor: true, sunday: false },
  { label: "อา", doctor: false, sunday: true },
];

function monthTitleOf(dayIso: string): string {
  const [y, m] = dayIso.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** ช่องของเดือนที่วันนี้อยู่ — จันทร์คอลัมน์แรก, null = ช่องว่างหัว/ท้ายเดือน */
function monthCells(dayIso: string): (string | null)[] {
  const [y, m] = dayIso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = dayIso.slice(0, 7);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(`${prefix}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** ขยับเดือนโดยคงวันที่เดิมไว้ (สิ้นเดือนสั้นกว่า = ตกมาวันสุดท้ายของเดือนนั้น)
    — state ของหน้านี้มีตัวเดียวคือ "วันที่เลือก" เดือนที่โชว์คำนวณจากมัน
    จึงไม่มีทางเกิดสภาพ "เลื่อนเดือนแล้วรายการข้างล่างเป็นของอีกเดือน" */
function shiftMonth(dayIso: string, delta: number): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const daysInTarget = new Date(Date.UTC(y, m + delta, 0)).getUTCDate();
  const day = Math.min(d, daysInTarget);
  const target = new Date(Date.UTC(y, m - 1 + delta, day));
  return target.toISOString().slice(0, 10);
}

/** "2026-09-01" → "อังคารที่ 1 กันยายน 2569" */
function thaiDayTitle(dayIso: string): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const weekday = (new Date(`${dayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${THAI_WEEKDAYS_FULL[weekday]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

const APPT_DOT: Record<WellnessApptStatus, string> = {
  scheduled: "bg-brand-500",
  done: "bg-emerald-500",
  cancelled: "bg-stone-300",
};

/** แถบสีท้ายการ์ดคิว (ดีไซน์ตามภาพอ้างอิงของผู้ใช้ — เส้นหนาใต้การ์ด) */
const APPT_ACCENT: Record<WellnessApptStatus, string> = {
  scheduled: "bg-gradient-to-r from-brand-500 to-brand-300",
  done: "bg-gradient-to-r from-emerald-500 to-emerald-300",
  cancelled: "bg-stone-200",
};

function sortByTime(list: CalendarAppt[]): CalendarAppt[] {
  return [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/* ============================================================
   การ์ดคิว 1 ใบในลิสต์ของวัน
   ============================================================ */

function ApptCard({
  appt,
  onOpen,
}: {
  appt: CalendarAppt;
  onOpen: () => void;
}) {
  const meta = WELLNESS_APPT_STATUS[appt.status];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`ดูรายละเอียดคิว ${formatTimeShort(appt.start_time)} ${
          appt.customer ? wellnessCustomerName(appt.customer) : ""
        }`}
        className="w-full cursor-pointer overflow-hidden rounded-xl border border-white/70 bg-white/85 text-left shadow-sm transition-all duration-200 hover:border-brand-200 hover:shadow-md active:scale-[0.99]"
      >
        <span className="block px-3.5 py-3">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
              {appt.customer
                ? wellnessCustomerName(appt.customer)
                : "(การ์ดลูกค้าถูกลบ)"}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
            >
              {meta.label}
            </span>
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-700">
              <Clock size={14} className="text-brand-500" />
              {apptRangeLabel(appt.start_time, appt.duration_hours)}
            </span>
            {appt.customer?.procedure_text && (
              <span className="ml-auto min-w-0 max-w-[55%] truncate text-xs text-stone-400">
                {appt.customer.procedure_text}
              </span>
            )}
          </span>

          {appt.note && (
            <span className="mt-1 block truncate text-xs text-stone-400">
              {appt.note}
            </span>
          )}
        </span>
        <span className={`block h-1 w-full ${APPT_ACCENT[appt.status]}`} />
      </button>
    </li>
  );
}

/* ============================================================
   โมดัลรายละเอียดคิว (bottom sheet บนมือถือ ตาม Modal ของระบบ)
   ============================================================ */

function ApptDetailModal({
  appt,
  canAdmin,
  onSetStatus,
  onClose,
}: {
  appt: CalendarAppt;
  canAdmin: boolean;
  onSetStatus: (id: string, next: WellnessApptStatus) => Promise<string | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = WELLNESS_APPT_STATUS[appt.status];

  async function changeStatus(next: WellnessApptStatus) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const msg = await onSetStatus(appt.id, next);
    setBusy(false);
    if (msg) {
      setError(msg);
      return;
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={thaiDayTitle(appt.appt_date)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-base font-semibold text-stone-800">
            <Clock size={16} className="text-brand-500" />
            {apptRangeLabel(appt.start_time, appt.duration_hours)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.badge}`}
          >
            {meta.label}
          </span>
        </div>

        {appt.note && (
          <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-stone-600">
            {appt.note}
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        {canAdmin && (
          <div className="flex flex-wrap gap-2">
            {appt.status === "scheduled" ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => void changeStatus("done")}
                  disabled={busy}
                  className="border border-emerald-200 text-emerald-700"
                >
                  มาแล้ว · เสร็จ
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void changeStatus("cancelled")}
                  disabled={busy}
                  className="border border-stone-200 text-stone-500"
                >
                  ยกเลิกคิว
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                onClick={() => void changeStatus("scheduled")}
                disabled={busy}
                className="border border-brand-200 text-brand-700"
              >
                กลับเป็นนัดไว้
              </Button>
            )}
          </div>
        )}

        {appt.customer ? (
          <section className="rounded-xl border border-white/70 bg-white/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-stone-800">
                  {wellnessCustomerName(appt.customer)}
                </h3>
                {appt.customer.phone ? (
                  <a
                    href={`tel:${appt.customer.phone.replace(/[^0-9+]/g, "")}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
                  >
                    <Phone size={11} /> {appt.customer.phone}
                  </a>
                ) : (
                  <p className="text-xs text-stone-400">ไม่มีเบอร์โทร</p>
                )}
              </div>
              {appt.customer.lab_confirmed_at ? (
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                  ผลแลบยืนยันแล้ว
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                  ผลแลบยังไม่ยืนยัน
                </span>
              )}
            </div>

            {appt.customer.procedure_text && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-stone-600">
                <Stethoscope size={12} className="shrink-0 text-stone-400" />
                {appt.customer.procedure_text}
              </p>
            )}

            <div className="mt-3 border-t border-white/70 pt-2">
              <p className="text-[11px] font-medium text-stone-500">
                ผลตรวจเลือด ({appt.customer.lab_files.length} ไฟล์)
              </p>
              {appt.customer.lab_files.length === 0 ? (
                <p className="mt-1 text-xs text-stone-400">ยังไม่มีไฟล์ผลตรวจ</p>
              ) : (
                <ul className="mt-1 divide-y divide-white/70">
                  {appt.customer.lab_files.map((f) => (
                    <LabFileOpenLink key={f.id} file={f} />
                  ))}
                </ul>
              )}
            </div>

            <Link
              href={`/wellness/${appt.customer.id}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-11"
            >
              เปิดการ์ดลูกค้า <ExternalLink size={12} />
            </Link>
          </section>
        ) : (
          <p className="text-xs text-stone-400">การ์ดลูกค้าของคิวนี้ถูกลบไปแล้ว</p>
        )}

        <p className="text-[11px] text-stone-400">
          ลงคิวเมื่อ {formatDateTime(appt.created_at)}
        </p>
      </div>
    </Modal>
  );
}

/* ============================================================
   โมดัลลงคิว (admin) — วันมาจากช่องที่กด เวลาใช้ช่องกลาง BookingFields
   ============================================================ */

function BookingModal({
  day,
  customers,
  onCreate,
  onClose,
}: {
  day: string;
  customers: BookableCustomer[];
  onCreate: (input: {
    customer_id: string;
    appt_date: string;
    start_time: string;
    duration_hours: number;
    note: string;
  }) => Promise<string | null>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookingDraft>(() => newBookingDraft(day));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = customers.find((c) => c.id === customerId) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = (
    q
      ? customers.filter((c) =>
          `${c.first_name} ${c.last_name} ${c.phone}`.toLowerCase().includes(q)
        )
      : customers
  ).slice(0, 30);

  async function submit() {
    if (!customerId || !draft.time || saving) return;
    setSaving(true);
    setError(null);
    const msg = await onCreate({
      customer_id: customerId,
      appt_date: day,
      start_time: draft.time,
      duration_hours: draft.duration,
      note: draft.note.trim(),
    });
    setSaving(false);
    if (msg) {
      setError(msg);
      return;
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`ลงคิว — ${thaiDayTitle(day)}`}>
      <div className="space-y-4">
        <div>
          <Label>ลูกค้า</Label>
          {selected ? (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50/70 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-stone-800">
                  {wellnessCustomerName(selected)}
                </span>
                <span className="block text-xs text-stone-500">
                  {selected.phone || "ไม่มีเบอร์"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setCustomerId(null)}
                aria-label="เปลี่ยนลูกค้า"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white hover:text-stone-600 sm:h-8 sm:w-8"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาชื่อ / เบอร์โทร"
                className="mt-1"
              />
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-stone-200/70 bg-white/70 p-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-stone-400">
                    ไม่พบลูกค้า — ทีม BC สร้างการ์ดที่หน้า “ทะเบียนลูกค้า”
                  </li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setCustomerId(c.id)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-50 max-sm:min-h-11"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-stone-700">
                            {wellnessCustomerName(c)}
                          </span>
                          <span className="block text-[11px] text-stone-400">
                            {c.phone || "ไม่มีเบอร์"}
                          </span>
                        </span>
                        {c.completed_at ? (
                          <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] text-stone-500">
                            ปิดเคสแล้ว
                          </span>
                        ) : c.lab_confirmed_at ? (
                          <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
                            ผลพร้อม
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                            รอผลแลบ
                          </span>
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>

        <BookingFields
          idPrefix="cal-book"
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          lockedDate
        />

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <Button
          onClick={() => void submit()}
          loading={saving}
          disabled={!customerId || !draft.time}
          className="w-full"
        >
          ลงคิว {formatTimeShort(draft.time)} ({draft.duration} ชม.)
        </Button>
      </div>
    </Modal>
  );
}

/* ============================================================
   หน้าปฏิทินหลัก
   ============================================================ */

export function WellnessCalendarClient({
  appointments,
  customers,
  uid,
  canAdmin,
}: {
  appointments: CalendarAppt[];
  customers: BookableCustomer[];
  uid: string | null;
  canAdmin: boolean;
}) {
  const router = useRouter();

  // props → state แบบ adjust-during-render (server ชนะหลัง router.refresh())
  const [state, setState] = useState({ base: appointments, appointments });
  if (state.base !== appointments) {
    setState({ base: appointments, appointments });
  }

  const today = todayBangkokISO();
  // **state เดียวของหน้านี้คือ "วันที่เลือก"** — เดือนที่โชว์คำนวณจากมัน
  // (เลื่อนเดือน = ขยับวันที่เลือกไปเดือนนั้น ลิสต์ข้างล่างจึงตรงกับปฏิทินเสมอ)
  const [selected, setSelected] = useState(today);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  const apptsByDay = useMemo(() => {
    const map = new Map<string, CalendarAppt[]>();
    for (const a of state.appointments) {
      const list = map.get(a.appt_date);
      if (list) list.push(a);
      else map.set(a.appt_date, [a]);
    }
    for (const [k, list] of map) map.set(k, sortByTime(list));
    return map;
  }, [state.appointments]);

  const cells = monthCells(selected);
  const dayAppts = apptsByDay.get(selected) ?? [];
  const detailAppt = detailId
    ? (state.appointments.find((a) => a.id === detailId) ?? null)
    : null;

  async function createAppt(input: {
    customer_id: string;
    appt_date: string;
    start_time: string;
    duration_hours: number;
    note: string;
  }): Promise<string | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("wellness_appointments")
      .insert({ ...input, created_by: uid })
      .select(CALENDAR_APPT_SELECT)
      .single();
    if (error || !data) return apptErrorMessage(error, "ลงคิวไม่สำเร็จ");
    setState((s) => ({
      ...s,
      appointments: [...s.appointments, data as unknown as CalendarAppt],
    }));
    router.refresh();
    return null;
  }

  async function setApptStatus(
    id: string,
    next: WellnessApptStatus
  ): Promise<string | null> {
    const prev = state.appointments;
    setState((s) => ({
      ...s,
      appointments: s.appointments.map((a) =>
        a.id === id ? { ...a, status: next } : a
      ),
    }));
    const supabase = createClient();
    const { error } = await supabase
      .from("wellness_appointments")
      .update({ status: next })
      .eq("id", id);
    if (error) {
      setState((s) => ({ ...s, appointments: prev }));
      // ย้ายกลับเป็น "นัดไว้" ก็เข้า exclusion index อีกครั้ง — ชนคิวอื่นได้
      return apptErrorMessage(error, "อัพเดตคิวไม่สำเร็จ");
    }
    router.refresh();
    return null;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-6 sm:py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5">
        {/* ---------------- ปฏิทินเดือน ---------------- */}
        <section className="glass overflow-hidden rounded-2xl">
          {/* แถบหัวโทนแบรนด์: ‹ เดือน ปี › + ปุ่มวันนี้ (ดีไซน์ตามภาพอ้างอิง) */}
          <header className="flex items-center gap-1 bg-gradient-to-b from-brand-500 to-brand-600 px-2 py-2.5 text-cream">
            <button
              type="button"
              onClick={() => setSelected((d) => shiftMonth(d, -1))}
              aria-label="เดือนก่อนหน้า"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95 sm:h-9 sm:w-9"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold tracking-wide">
              {monthTitleOf(selected)}
            </h1>
            <button
              type="button"
              onClick={() => setSelected((d) => shiftMonth(d, 1))}
              aria-label="เดือนถัดไป"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95 sm:h-9 sm:w-9"
            >
              <ChevronRight size={20} />
            </button>
          </header>

          <div className="flex flex-wrap items-center gap-2 border-b border-white/60 px-3 py-2">
            <button
              type="button"
              onClick={() => setSelected(today)}
              className="cursor-pointer rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-11"
            >
              วันนี้
            </button>
            <span className="text-[11px] text-stone-400">
              จุดใต้ตัวเลข = วันที่มีคิว
            </span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-brand-700">
              แพทย์เข้า: อ. · ส.
            </span>
          </div>

          {/* หัวคอลัมน์วัน */}
          <div className="grid grid-cols-7 px-1 pt-2">
            {WEEKDAY_HEADS.map((h) => (
              <div
                key={h.label}
                className={`py-1 text-center text-[11px] font-semibold ${
                  h.sunday
                    ? "text-rose-400"
                    : h.doctor
                      ? "text-brand-600"
                      : "text-stone-400"
                }`}
              >
                {h.label}
              </div>
            ))}
          </div>

          {/* ช่องวัน — ตัวเลข + จุดบอกจำนวนคิว (สูงสุด 3 จุด) */}
          <div className="grid grid-cols-7 gap-y-0.5 px-1 pb-3">
            {cells.map((day, i) =>
              day === null ? (
                <div key={`blank-${i}`} className="h-12 sm:h-14" />
              ) : (
                <button
                  key={day}
                  type="button"
                  aria-label={`เปิดคิววันที่ ${day}`}
                  aria-current={day === selected ? "date" : undefined}
                  onClick={() => setSelected(day)}
                  className={`flex h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl transition-colors active:scale-95 sm:h-14 ${
                    day === selected
                      ? ""
                      : isWellnessDoctorDay(day)
                        ? "hover:bg-brand-50"
                        : "hover:bg-white/70"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                      day === selected
                        ? "bg-gradient-to-b from-brand-500 to-brand-600 font-semibold text-cream shadow-sm"
                        : day === today
                          ? "border border-brand-300 font-semibold text-brand-700"
                          : i % 7 === 6
                            ? "text-rose-400"
                            : isWellnessDoctorDay(day)
                              ? "font-medium text-brand-700"
                              : "text-stone-600"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {(apptsByDay.get(day) ?? []).slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={`h-1.5 w-1.5 rounded-full ${APPT_DOT[a.status]}`}
                      />
                    ))}
                  </span>
                </button>
              )
            )}
          </div>
        </section>

        {/* ---------------- คิวของวันที่เลือก ---------------- */}
        <section className="mt-4 lg:mt-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
              {selected === today ? "วันนี้" : "วันที่เลือก"}
            </h2>
            <span className="text-xs text-stone-500">
              {thaiDayTitle(selected)}
            </span>
            {canAdmin && (
              <button
                type="button"
                onClick={() => setBookingOpen(true)}
                className="ml-auto hidden cursor-pointer items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 lg:inline-flex"
              >
                <Plus size={13} /> ลงคิว
              </button>
            )}
          </div>
          <p className="mt-0.5 px-1 text-xs text-stone-400">
            {dayAppts.length} คิว
            {!isWellnessDoctorDay(selected) && " · ไม่ใช่วันแพทย์เข้าปกติ"}
          </p>

          {dayAppts.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-200 bg-white/50 px-4 py-8 text-center">
              <CalendarDays size={28} className="text-stone-300" />
              <p className="text-sm text-stone-500">ยังไม่มีคิวในวันที่เลือก</p>
              {canAdmin && (
                <Button variant="secondary" onClick={() => setBookingOpen(true)}>
                  <Plus size={14} /> ลงคิวในวันที่เลือก
                </Button>
              )}
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5 pb-24 lg:pb-2">
              {dayAppts.map((a) => (
                <ApptCard
                  key={a.id}
                  appt={a}
                  onOpen={() => setDetailId(a.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ปุ่มลอยเพิ่มคิว — จอเล็กเท่านั้น (จอใหญ่มีปุ่มบนหัวลิสต์แล้ว) */}
      {canAdmin && (
        <button
          type="button"
          onClick={() => setBookingOpen(true)}
          aria-label="ลงคิวนัดในวันที่เลือก"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-lg transition-all duration-200 hover:shadow-xl active:scale-95 lg:hidden"
        >
          <Plus size={26} />
        </button>
      )}

      {detailAppt && (
        <ApptDetailModal
          key={detailAppt.id}
          appt={detailAppt}
          canAdmin={canAdmin}
          onSetStatus={setApptStatus}
          onClose={() => setDetailId(null)}
        />
      )}

      {bookingOpen && (
        <BookingModal
          key={selected}
          day={selected}
          customers={customers}
          onCreate={createAppt}
          onClose={() => setBookingOpen(false)}
        />
      )}
    </div>
  );
}
