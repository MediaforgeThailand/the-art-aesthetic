"use client";

// ปฏิทินคิวแพทย์ Wellness — ตารางเดือน (จันทร์เริ่มสัปดาห์ อาทิตย์ท้ายแถวสีแดง)
// กดวัน = แผงข้างขวา list → detail (ข้อมูลลูกค้า + ไฟล์ผลแลบ) → ฟอร์มลงคิว (admin)
// การลงคิว/ย้ายกลับเป็น "นัดไว้" ดัก 23P01 จาก exclusion constraint = คิวชนกัน
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Input, Label, PageContainer, Select } from "@/components/ui";
import type {
  WellnessAppointmentRow,
  WellnessApptStatus,
  WellnessCustomerRow,
  WellnessLabFileRow,
} from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  CALENDAR_APPT_SELECT,
  WELLNESS_APPT_STATUS,
  WELLNESS_DURATION_OPTIONS,
  WELLNESS_OVERLAP_MESSAGE,
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
  { label: "จ.", doctor: false, sunday: false },
  { label: "อ.", doctor: true, sunday: false },
  { label: "พ.", doctor: false, sunday: false },
  { label: "พฤ.", doctor: false, sunday: false },
  { label: "ศ.", doctor: false, sunday: false },
  { label: "ส.", doctor: true, sunday: false },
  { label: "อา.", doctor: false, sunday: true },
];

function monthTitleOf(anchorIso: string): string {
  const [y, m] = anchorIso.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

function addMonths(anchorIso: string, delta: number): string {
  const [y, m] = anchorIso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

/** ช่องของเดือน — จันทร์คอลัมน์แรก, null = ช่องว่างหัว/ท้ายเดือน */
function monthCells(anchorIso: string): (string | null)[] {
  const [y, m] = anchorIso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = anchorIso.slice(0, 7);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(`${prefix}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** "2026-09-01" → "อังคารที่ 1 กันยายน 2569" */
function thaiDayTitle(dayIso: string): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const weekday = (new Date(`${dayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${THAI_WEEKDAYS_FULL[weekday]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** ชิปคิวบนช่องวัน — แท่งสีทึบตามสถานะ */
const APPT_CHIP_SOLID: Record<WellnessApptStatus, string> = {
  scheduled: "bg-brand-500 text-white",
  done: "bg-emerald-500 text-white",
  cancelled: "bg-stone-200 text-stone-500 line-through",
};

const APPT_DOT: Record<WellnessApptStatus, string> = {
  scheduled: "bg-brand-500",
  done: "bg-emerald-500",
  cancelled: "bg-stone-300",
};

function sortByTime(list: CalendarAppt[]): CalendarAppt[] {
  return [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/* ============================================================
   ไฟล์ผลแลบ 1 แถวในแผงข้าง (แยก component เพราะ useSignedUrl เป็น hook ต่อ path)
   ============================================================ */

function LabFileLink({ file }: { file: CalendarLabFile }) {
  const { url, failed } = useSignedUrl(file.file_path);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <FileText size={15} className="shrink-0 text-brand-500" />
      <span className="min-w-0 flex-1 truncate text-xs text-stone-700">
        {file.file_name}
      </span>
      {failed ? (
        <span className="shrink-0 text-[11px] text-rose-500">เปิดไม่ได้</span>
      ) : (
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!url}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 max-sm:min-h-11 ${
            url ? "" : "pointer-events-none opacity-50"
          }`}
        >
          <ExternalLink size={11} /> เปิดดู
        </a>
      )}
    </li>
  );
}

/* ============================================================
   ฟอร์มลงคิวในแผงข้าง (admin) — วันมาจากช่องที่กด เวลากรอกเอง เลือก 1/2/3 ชม.
   ============================================================ */

function BookingForm({
  day,
  customers,
  onCreate,
  onDone,
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
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState<number>(1);
  const [note, setNote] = useState("");
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
    if (!customerId || !time || saving) return;
    setSaving(true);
    setError(null);
    const msg = await onCreate({
      customer_id: customerId,
      appt_date: day,
      start_time: time,
      duration_hours: duration,
      note: note.trim(),
    });
    setSaving(false);
    if (msg) {
      setError(msg);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      {!isWellnessDoctorDay(day) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          แพทย์ Wellness เข้าเฉพาะ <b>วันอังคาร</b> และ <b>วันเสาร์</b> —
          วันนี้ไม่ตรงวันแพทย์เข้า (ลงได้ถ้าเป็นเคสพิเศษ)
        </p>
      )}

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
                  ไม่พบลูกค้า — สร้างการ์ดได้ที่หน้า “การ์ดลูกค้า”
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cal-book-time">เวลาเริ่ม</Label>
          <Input
            id="cal-book-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="cal-book-duration">ระยะเวลา</Label>
          <Select
            id="cal-book-duration"
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1"
          >
            {WELLNESS_DURATION_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} ชั่วโมง
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="cal-book-note">หมายเหตุ (ไม่บังคับ)</Label>
        <Input
          id="cal-book-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น ลูกค้าขอเลื่อนได้ / มากับญาติ"
          className="mt-1"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <Button
        onClick={() => void submit()}
        loading={saving}
        disabled={!customerId || !time}
        className="w-full"
      >
        ลงคิว {formatTimeShort(time)} ({duration} ชม.)
      </Button>
    </div>
  );
}

/* ============================================================
   แผงข้างของวัน — list → detail → form (portal ไป body ตามกติกา Modal/แผงลอย)
   ============================================================ */

type PanelMode = { kind: "list" } | { kind: "detail"; id: string } | { kind: "form" };

function DaySidebar({
  day,
  appts,
  customers,
  canAdmin,
  onClose,
  onCreate,
  onSetStatus,
}: {
  day: string;
  appts: CalendarAppt[];
  customers: BookableCustomer[];
  canAdmin: boolean;
  onClose: () => void;
  onCreate: (input: {
    customer_id: string;
    appt_date: string;
    start_time: string;
    duration_hours: number;
    note: string;
  }) => Promise<string | null>;
  onSetStatus: (id: string, next: WellnessApptStatus) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<PanelMode>({ kind: "list" });
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function changeStatus(id: string, next: WellnessApptStatus) {
    if (statusBusy) return;
    setStatusBusy(true);
    setStatusError(null);
    const msg = await onSetStatus(id, next);
    setStatusBusy(false);
    if (msg) setStatusError(msg);
  }

  const detailAppt =
    mode.kind === "detail" ? (appts.find((a) => a.id === mode.id) ?? null) : null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-stone-900/25 animate-fade-in"
        onClick={onClose}
      />
      <aside className="glass fixed inset-y-0 right-0 z-50 flex w-full max-w-[26rem] flex-col shadow-2xl animate-slide-in-right">
        <header className="flex items-center gap-2 border-b border-white/60 px-4 py-3 max-sm:pt-safe">
          {mode.kind !== "list" && (
            <button
              type="button"
              onClick={() => {
                setStatusError(null);
                setMode({ kind: "list" });
              }}
              aria-label="กลับไปรายการคิวของวัน"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-white/70 hover:text-stone-700 sm:h-8 sm:w-8"
            >
              <ArrowLeft size={17} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-stone-800">
              {mode.kind === "form" ? "ลงคิวนัด" : thaiDayTitle(day)}
            </h2>
            <p className="text-[11px] text-stone-400">
              {mode.kind === "form"
                ? thaiDayTitle(day)
                : isWellnessDoctorDay(day)
                  ? "วันแพทย์ Wellness เข้า"
                  : "ไม่ใช่วันแพทย์เข้า (อ. / ส.)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแผง"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white/70 hover:text-stone-600 sm:h-8 sm:w-8"
          >
            <X size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-safe-4">
          {mode.kind === "form" ? (
            <BookingForm
              day={day}
              customers={customers}
              onCreate={onCreate}
              onDone={() => setMode({ kind: "list" })}
            />
          ) : mode.kind === "detail" ? (
            !detailAppt ? (
              <p className="text-xs text-stone-400">ไม่พบคิวนี้แล้ว</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-stone-800">
                    {apptRangeLabel(detailAppt.start_time, detailAppt.duration_hours)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${WELLNESS_APPT_STATUS[detailAppt.status].badge}`}
                  >
                    {WELLNESS_APPT_STATUS[detailAppt.status].label}
                  </span>
                </div>

                {detailAppt.note && (
                  <p className="rounded-lg bg-white/60 px-3 py-2 text-xs text-stone-600">
                    {detailAppt.note}
                  </p>
                )}

                {statusError && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {statusError}
                  </p>
                )}

                {canAdmin && (
                  <div className="flex flex-wrap gap-2">
                    {detailAppt.status === "scheduled" ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => void changeStatus(detailAppt.id, "done")}
                          disabled={statusBusy}
                          className="border border-emerald-200 text-emerald-700"
                        >
                          มาแล้ว · เสร็จ
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void changeStatus(detailAppt.id, "cancelled")
                          }
                          disabled={statusBusy}
                          className="border border-stone-200 text-stone-500"
                        >
                          ยกเลิกคิว
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void changeStatus(detailAppt.id, "scheduled")
                        }
                        disabled={statusBusy}
                        className="border border-brand-200 text-brand-700"
                      >
                        กลับเป็นนัดไว้
                      </Button>
                    )}
                  </div>
                )}

                {detailAppt.customer ? (
                  <section className="rounded-xl border border-white/70 bg-white/55 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-stone-800">
                          {wellnessCustomerName(detailAppt.customer)}
                        </h3>
                        {detailAppt.customer.phone ? (
                          <a
                            href={`tel:${detailAppt.customer.phone.replace(/[^0-9+]/g, "")}`}
                            className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
                          >
                            {detailAppt.customer.phone}
                          </a>
                        ) : (
                          <p className="text-xs text-stone-400">ไม่มีเบอร์โทร</p>
                        )}
                      </div>
                      {detailAppt.customer.lab_confirmed_at ? (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                          ผลแลบยืนยันแล้ว
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                          ผลแลบยังไม่ยืนยัน
                        </span>
                      )}
                    </div>
                    {detailAppt.customer.procedure_text && (
                      <p className="mt-2 text-xs text-stone-600">
                        <span className="text-stone-400">หัตถการที่ทำ: </span>
                        {detailAppt.customer.procedure_text}
                      </p>
                    )}

                    <div className="mt-3 border-t border-white/70 pt-2">
                      <p className="text-[11px] font-medium text-stone-500">
                        ผลตรวจเลือด ({detailAppt.customer.lab_files.length} ไฟล์)
                      </p>
                      {detailAppt.customer.lab_files.length === 0 ? (
                        <p className="mt-1 text-xs text-stone-400">
                          ยังไม่มีไฟล์ผลตรวจ
                        </p>
                      ) : (
                        <ul className="mt-1 divide-y divide-white/70">
                          {detailAppt.customer.lab_files.map((f) => (
                            <LabFileLink key={f.id} file={f} />
                          ))}
                        </ul>
                      )}
                    </div>

                    <Link
                      href={`/wellness/${detailAppt.customer.id}`}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-11"
                    >
                      เปิดการ์ดลูกค้า <ExternalLink size={12} />
                    </Link>
                  </section>
                ) : (
                  <p className="text-xs text-stone-400">
                    การ์ดลูกค้าของคิวนี้ถูกลบไปแล้ว
                  </p>
                )}

                <p className="text-[11px] text-stone-400">
                  ลงคิวเมื่อ {formatDateTime(detailAppt.created_at)}
                </p>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {statusError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {statusError}
                </p>
              )}
              {appts.length === 0 ? (
                <p className="rounded-lg bg-white/50 px-3 py-5 text-center text-xs text-stone-400">
                  ยังไม่มีคิวในวันนี้
                </p>
              ) : (
                <ul className="space-y-2">
                  {appts.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusError(null);
                          setMode({ kind: "detail", id: a.id });
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 text-left transition-colors hover:border-brand-300 max-sm:min-h-11"
                      >
                        <span
                          className={`h-9 w-1.5 shrink-0 rounded-full ${APPT_DOT[a.status]}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-stone-800">
                            {apptRangeLabel(a.start_time, a.duration_hours)}
                          </span>
                          <span className="block truncate text-xs text-stone-500">
                            {a.customer
                              ? wellnessCustomerName(a.customer)
                              : "(การ์ดถูกลบ)"}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${WELLNESS_APPT_STATUS[a.status].badge}`}
                        >
                          {WELLNESS_APPT_STATUS[a.status].label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {canAdmin && (
                <Button
                  variant="ghost"
                  onClick={() => setMode({ kind: "form" })}
                  className="w-full border border-dashed border-brand-300 text-brand-700"
                >
                  <Plus size={15} /> ลงคิวนัดในวันนี้
                </Button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body
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
  const [anchor, setAnchor] = useState(() => `${today.slice(0, 7)}-01`);
  const [panel, setPanel] = useState<{ day: string; seq: number } | null>(null);

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

  const cells = monthCells(anchor);

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
    if (error || !data) {
      if (error?.code === "23P01") return WELLNESS_OVERLAP_MESSAGE;
      return error?.message ?? "ลงคิวไม่สำเร็จ";
    }
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
      return error.code === "23P01" ? WELLNESS_OVERLAP_MESSAGE : error.message;
    }
    router.refresh();
    return null;
  }

  const panelAppts = panel ? (apptsByDay.get(panel.day) ?? []) : [];

  return (
    <PageContainer>
      <div className="space-y-3">
        {/* แถบบน: วันนี้ ‹ › ชื่อเดือน + คำใบ้วันแพทย์เข้า */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(`${today.slice(0, 7)}-01`)}
            className="cursor-pointer rounded-lg border border-stone-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 max-sm:min-h-11"
          >
            วันนี้
          </button>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setAnchor((a) => addMonths(a, -1))}
              aria-label="เดือนก่อนหน้า"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-white/70 hover:text-stone-700 sm:h-8 sm:w-8"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => setAnchor((a) => addMonths(a, 1))}
              aria-label="เดือนถัดไป"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-white/70 hover:text-stone-700 sm:h-8 sm:w-8"
            >
              <ChevronRight size={17} />
            </button>
          </div>
          <h1 className="text-lg font-semibold text-stone-800">
            {monthTitleOf(anchor)}
          </h1>
          <span className="ml-auto rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700">
            แพทย์เข้า: อังคาร · เสาร์
          </span>
        </div>

        {/* ตารางเดือน */}
        <div className="overflow-hidden rounded-xl border border-stone-200/70">
          <div className="grid grid-cols-7 gap-px bg-stone-200/60">
            {WEEKDAY_HEADS.map((h) => (
              <div
                key={h.label}
                className={`bg-white/75 py-2 text-center text-xs font-semibold ${
                  h.sunday
                    ? "text-rose-500"
                    : h.doctor
                      ? "text-brand-700"
                      : "text-stone-500"
                }`}
              >
                {h.label}
                {h.doctor && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-400 align-middle" />
                )}
              </div>
            ))}
            {cells.map((day, i) =>
              day === null ? (
                <div key={`blank-${i}`} className="min-h-[64px] bg-white/35 sm:min-h-[116px]" />
              ) : (
                <button
                  key={day}
                  type="button"
                  aria-label={`เปิดคิววันที่ ${day}`}
                  onClick={() =>
                    setPanel((p) => ({ day, seq: (p?.seq ?? 0) + 1 }))
                  }
                  className={`min-h-[64px] cursor-pointer p-1 text-left align-top transition-colors hover:bg-brand-50 sm:min-h-[116px] sm:p-1.5 ${
                    isWellnessDoctorDay(day) ? "bg-brand-50/60" : "bg-white/75"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs sm:h-5 sm:w-5 sm:text-[11px] ${
                      day === today
                        ? "bg-brand-600 font-semibold text-white"
                        : i % 7 === 6
                          ? "text-rose-500"
                          : "text-stone-600"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </span>

                  {/* ≥sm: ชิปคิว 3 อันแรก + "+N คิว" */}
                  <span className="mt-0.5 hidden space-y-0.5 sm:block">
                    {(apptsByDay.get(day) ?? []).slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium ${APPT_CHIP_SOLID[a.status]}`}
                        title={`${apptRangeLabel(a.start_time, a.duration_hours)} — ${
                          a.customer ? wellnessCustomerName(a.customer) : "(การ์ดถูกลบ)"
                        }`}
                      >
                        <b>{formatTimeShort(a.start_time)}</b>{" "}
                        {a.customer?.first_name ?? "?"}
                      </span>
                    ))}
                    {(apptsByDay.get(day)?.length ?? 0) > 3 && (
                      <span className="block text-[10px] text-stone-500">
                        +{(apptsByDay.get(day)?.length ?? 0) - 3} คิว
                      </span>
                    )}
                  </span>

                  {/* จอเล็ก: จุดสีตามสถานะ (สูงสุด 4) */}
                  <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {(apptsByDay.get(day) ?? []).slice(0, 4).map((a) => (
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
        </div>

        {/* คำอธิบายสีสถานะ */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-500">
          {(Object.keys(WELLNESS_APPT_STATUS) as WellnessApptStatus[]).map(
            (k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${APPT_DOT[k]}`} />
                {WELLNESS_APPT_STATUS[k].label}
              </span>
            )
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-brand-300 bg-brand-50" />
            วันแพทย์เข้า (อ. / ส.)
          </span>
        </div>
      </div>

      {panel && (
        <DaySidebar
          key={`${panel.day}#${panel.seq}`}
          day={panel.day}
          appts={panelAppts}
          customers={customers}
          canAdmin={canAdmin}
          onClose={() => setPanel(null)}
          onCreate={createAppt}
          onSetStatus={setApptStatus}
        />
      )}
    </PageContainer>
  );
}
