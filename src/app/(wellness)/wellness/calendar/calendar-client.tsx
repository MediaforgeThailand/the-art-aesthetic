"use client";

// ปฏิทินคิวแพทย์ Wellness — **มือถือเป็นตัวตั้ง ตามภาพอ้างอิงที่ผู้ใช้ส่ง (2026-08-28)**:
//   1) ทั้งบล็อกปฏิทินเป็น "แผ่นไล่เฉดแบรนด์" ตัวเลขวันเป็นสีอ่อนอยู่บนแผ่นนั้น
//      วันที่เลือก = สี่เหลี่ยมมนสีขาวตัวหนังสือสีแบรนด์ · วันที่มีคิว = จุดขาวใต้ตัวเลข
//   2) ใต้ปฏิทินเป็น "การ์ดต่อวัน" — ซ้ายมือเป็นแถบวันที่ไล่เฉด (ชื่อวัน + เลขวัน)
//      ขวามือเป็นรายการเวลาของวันนั้นเรียงกัน กดแถวไหน = เปิดรายละเอียดคิวนั้น
//   3) ปุ่ม "ลงคิวในวันที่เลือก" เต็มความกว้างใต้ปฏิทิน (admin, จอเล็ก) — เคยเป็น
//      ปุ่มลอยกลางล่างตามภาพอ้างอิง แต่มันไปทับชื่อลูกค้าในการ์ดคิว จึงเลิกใช้
// จอ ≥lg แถวเดียวกันนี้กลายเป็น 2 คอลัมน์ (ปฏิทินซ้าย · การ์ดคิวขวา)
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

type CalendarLabFile = Pick<
  WellnessLabFileRow,
  "id" | "file_path" | "file_name" | "created_at"
>;

type CalendarCustomer = Pick<
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

// หัวคอลัมน์ — จันทร์เริ่ม (อ./ส. = วันแพทย์ Wellness เข้า)
const WEEKDAY_HEADS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function monthTitleOf(dayIso: string): string {
  const [y, m] = dayIso.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** ดัชนีวันในสัปดาห์แบบจันทร์=0 */
function mondayIndex(dayIso: string): number {
  return (new Date(`${dayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** ช่องของเดือนที่วันนั้นอยู่ — จันทร์คอลัมน์แรก, null = ช่องว่างหัว/ท้ายเดือน */
function monthCells(dayIso: string): (string | null)[] {
  const [y, m] = dayIso.split("-").map(Number);
  const lead = mondayIndex(`${dayIso.slice(0, 7)}-01`);
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
  return `${THAI_WEEKDAYS_FULL[mondayIndex(dayIso)]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** จุดสถานะใต้ตัวเลขวัน — บนแผ่นไล่เฉดใช้โทนขาว/อ่อนให้เห็นชัด */
const DOT_ON_GRADIENT: Record<WellnessApptStatus, string> = {
  scheduled: "bg-white",
  done: "bg-emerald-200",
  cancelled: "bg-white/40",
};

/** จุดบนพื้นขาว (ช่องวันที่ถูกเลือก = พื้นขาว ตัวหนังสือสีแบรนด์) */
const DOT_ON_WHITE: Record<WellnessApptStatus, string> = {
  scheduled: "bg-brand-500",
  done: "bg-emerald-500",
  cancelled: "bg-stone-300",
};

function sortByTime(list: CalendarAppt[]): CalendarAppt[] {
  return [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/* ============================================================
   การ์ดคิวต่อวัน — แถบวันที่ไล่เฉดด้านซ้าย + รายการเวลาด้านขวา (ตามภาพอ้างอิง)
   ============================================================ */

function DayCard({
  day,
  appts,
  onOpen,
  onPickDay,
  emptyAction,
}: {
  day: string;
  appts: CalendarAppt[];
  onOpen: (id: string) => void;
  /** กดแถบวันที่ = เลือกวันนั้นบนปฏิทิน (ใช้กับการ์ด "คิวถัดไป") */
  onPickDay?: () => void;
  /** ปุ่มที่จะโชว์เมื่อวันนั้นไม่มีคิว (เช่นปุ่มลงคิวของ admin) */
  emptyAction?: React.ReactNode;
}) {
  const dayNum = Number(day.slice(8));
  const badge = (
    <span className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 bg-gradient-to-b from-brand-500 to-brand-600 px-2 py-3 text-cream">
      <span className="text-[11px] font-medium uppercase tracking-wide opacity-90">
        {WEEKDAY_HEADS[mondayIndex(day)]}
      </span>
      <span className="font-display text-2xl font-semibold leading-none">
        {dayNum}
      </span>
      {isWellnessDoctorDay(day) && (
        <span className="text-[9px] opacity-80">วันแพทย์</span>
      )}
    </span>
  );

  return (
    <article className="flex overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-white/70">
      {onPickDay ? (
        <button
          type="button"
          onClick={onPickDay}
          aria-label={`เลือก${thaiDayTitle(day)}`}
          className="flex cursor-pointer transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          {badge}
        </button>
      ) : (
        badge
      )}

      <div className="min-w-0 flex-1 divide-y divide-stone-100">
        {appts.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-4">
            <p className="text-sm text-stone-400">ยังไม่มีคิวในวันนี้</p>
            {emptyAction}
          </div>
        ) : (
          appts.map((a) => {
            const meta = WELLNESS_APPT_STATUS[a.status];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpen(a.id)}
                aria-label={`ดูรายละเอียดคิว ${formatTimeShort(a.start_time)} ${
                  a.customer ? wellnessCustomerName(a.customer) : ""
                }`}
                className="flex w-full cursor-pointer items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-brand-50/60 active:scale-[0.995]"
              >
                <span className="flex w-[4.5rem] shrink-0 flex-col">
                  <span className="text-sm font-semibold text-stone-800">
                    {formatTimeShort(a.start_time)}
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {a.duration_hours} ชม.
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium text-stone-800">
                      {a.customer
                        ? wellnessCustomerName(a.customer)
                        : "(การ์ดลูกค้าถูกลบ)"}
                    </span>
                    {a.status !== "scheduled" && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
                      >
                        {meta.label}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-stone-400">
                    {a.customer?.procedure_text || a.note || "ฟังผล + ปรึกษาแพทย์"}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </article>
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
  // **เลือกได้เฉพาะคนที่ทีม Lab ยืนยันผลแล้ว** (ผู้ใช้ 2026-08-29) — ลงคิวก่อนมีผลเลือด
  // ไม่มีประโยชน์กับหมอ; server ก็กรองมาแล้วชั้นหนึ่ง ตรงนี้กันพลาดซ้ำ
  const bookable = customers.filter(
    (c) => c.lab_confirmed_at && !c.completed_at
  );
  const filtered = (
    q
      ? bookable.filter((c) =>
          `${c.first_name} ${c.last_name} ${c.phone}`.toLowerCase().includes(q)
        )
      : bookable
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
              <p className="mt-1.5 text-xs text-stone-500">
                แสดงเฉพาะลูกค้าที่ <b>ทีม Lab ยืนยันผลเลือดแล้ว</b> เท่านั้น
              </p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-stone-200/70 bg-white/70 p-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-[13px] text-stone-400">
                    {query
                      ? "ไม่พบชื่อนี้ในกลุ่มที่ผลเลือดพร้อมแล้ว"
                      : "ยังไม่มีใครที่ผลเลือดพร้อม — รอทีม Lab กดยืนยันผลก่อน"}
                  </li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setCustomerId(c.id)}
                        aria-label={`เลือกลูกค้า ${wellnessCustomerName(c)}`}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-brand-50 max-sm:min-h-11"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] text-stone-700">
                            {wellnessCustomerName(c)}
                          </span>
                          <span className="block text-xs text-stone-400">
                            {c.phone || "ไม่มีเบอร์"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                          ผลพร้อม
                        </span>
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

  // การ์ด "คิวถัดไป" — วันถัดจากที่เลือกซึ่งมีคิวจริง (สูงสุด 4 ใบ) เหมือนภาพอ้างอิงที่มีหลายการ์ด
  const nextDays = useMemo(
    () =>
      Array.from(apptsByDay.keys())
        .filter((d) => d > selected)
        .sort()
        .slice(0, 4),
    [apptsByDay, selected]
  );

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
      <div className="mx-auto w-full max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-6 lg:px-6 lg:py-5">
        {/* ---------------- แผ่นปฏิทินไล่เฉด — จอเล็ก "กลืน" ลงมาจากขอบบนจอเลย
             (ไม่มีแถบบน/ขอบ/มุมมนด้านบน — ตามภาพอ้างอิงใบ 2 ของผู้ใช้ 2026-08-28)
             ≥lg กลับเป็นการ์ดมุมมนปกติในเลย์เอาต์ 2 คอลัมน์ ---------------- */}
        <section className="overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600 px-2 pb-5 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-cream shadow-[0_12px_36px_rgba(94,58,49,0.22)] sm:px-4 lg:rounded-3xl lg:pb-4 lg:pt-3">
          <header className="flex items-center gap-1 px-1">
            <button
              type="button"
              onClick={() => setSelected((d) => shiftMonth(d, -1))}
              aria-label="เดือนก่อนหน้า"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95"
            >
              <ChevronLeft size={22} />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-center text-xl font-semibold tracking-wide sm:text-2xl">
              {monthTitleOf(selected)}
            </h1>
            <button
              type="button"
              onClick={() => setSelected((d) => shiftMonth(d, 1))}
              aria-label="เดือนถัดไป"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95"
            >
              <ChevronRight size={22} />
            </button>
          </header>

          <div className="mb-1.5 flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelected(today)}
              className="cursor-pointer rounded-full bg-white/20 px-3 py-1 font-medium text-cream transition-colors hover:bg-white/30 max-sm:min-h-9"
            >
              วันนี้
            </button>
            {/* ป้ายวันแพทย์เข้า — ต้องเด่นพอให้ admin รู้ทันทีว่าลงคิวได้วันไหน
                (ผู้ใช้ 2026-08-29: "ตัววันอังคารกับเสาร์ที่หมอเข้ายังเด่นไม่พอ") */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-semibold text-brand-700 shadow-sm">
              <Stethoscope size={13} /> วันแพทย์เข้า: อังคาร · เสาร์
            </span>
          </div>

          {/* หัวคอลัมน์วัน — อ./ส. เน้นเป็นชิปขาวให้ตรงกับช่องวันแพทย์ด้านล่าง */}
          <div className="grid grid-cols-7">
            {WEEKDAY_HEADS.map((label, i) => {
              const doctorCol = i === 1 || i === 5; // จันทร์=0 → อังคาร, เสาร์
              return (
                <div key={label} className="py-1 text-center">
                  <span
                    className={`inline-flex min-w-7 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                      doctorCol
                        ? "bg-white/85 text-brand-700"
                        : i === 6
                          ? "text-cream/60"
                          : "text-cream/80"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ช่องวัน — ตัวเลขบนแผ่นไล่เฉด, วันที่เลือก = สี่เหลี่ยมขาว */}
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) =>
              day === null ? (
                <div key={`blank-${i}`} className="h-12" />
              ) : (
                <button
                  key={day}
                  type="button"
                  aria-label={`เปิดคิววันที่ ${day}`}
                  aria-current={day === selected ? "date" : undefined}
                  onClick={() => setSelected(day)}
                  className="flex h-12 cursor-pointer items-center justify-center active:scale-95"
                >
                  <span
                    className={`flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-sm transition-all ${
                      day === selected
                        ? "bg-white font-semibold text-brand-700 shadow-md"
                        : isWellnessDoctorDay(day)
                          ? // วันแพทย์เข้า = กรอบขาวชัดๆ (วันนี้ที่เป็นวันแพทย์ได้พื้นทึบขึ้น)
                            `font-semibold text-cream ring-1 ring-white/70 hover:bg-white/25 ${
                              day === today ? "bg-white/35" : "bg-white/10"
                            }`
                          : day === today
                            ? "bg-white/25 font-semibold text-cream"
                            : "text-cream/70 hover:bg-white/15"
                    }`}
                  >
                    <span className="leading-none">{Number(day.slice(8))}</span>
                    <span className="flex h-1.5 items-center gap-0.5">
                      {(apptsByDay.get(day) ?? []).slice(0, 3).map((a) => (
                        <span
                          key={a.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            day === selected
                              ? DOT_ON_WHITE[a.status]
                              : DOT_ON_GRADIENT[a.status]
                          }`}
                        />
                      ))}
                    </span>
                  </span>
                </button>
              )
            )}
          </div>
        </section>

        {/* ---------------- การ์ดคิวของวัน ---------------- */}
        <section className="mt-5 space-y-3 px-3 sm:px-6 lg:mt-0 lg:px-0">
          {/* ปุ่มลงคิวของมือถือ — วางไว้ใต้ปฏิทินตรงๆ ไม่ใช้ปุ่มลอย
              (ปุ่มลอยเคยทับชื่อลูกค้าในการ์ดคิว = อ่านไม่ออก) */}
          {canAdmin && (
            <Button
              onClick={() => setBookingOpen(true)}
              className="min-h-12 w-full text-[15px] lg:hidden"
            >
              <Plus size={18} /> ลงคิวในวันที่เลือก
            </Button>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2 px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
              {selected === today ? "วันนี้" : "วันที่เลือก"}
            </h2>
            <span className="text-xs text-stone-500">
              {thaiDayTitle(selected)}
            </span>
            <span className="text-xs text-stone-400">
              · {dayAppts.length} คิว
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

          <DayCard
            day={selected}
            appts={dayAppts}
            onOpen={setDetailId}
          />

          {nextDays.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-1 pt-2">
                <CalendarDays size={13} className="text-stone-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  คิวถัดไป
                </h3>
              </div>
              {nextDays.map((d) => (
                <DayCard
                  key={d}
                  day={d}
                  appts={apptsByDay.get(d) ?? []}
                  onOpen={setDetailId}
                  onPickDay={() => setSelected(d)}
                />
              ))}
            </>
          )}

                  </section>
      </div>


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
