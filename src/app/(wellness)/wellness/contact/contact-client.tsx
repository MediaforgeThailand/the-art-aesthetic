"use client";

import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  FileText,
  Phone,
  RotateCcw,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import {
  BookingFields,
  newBookingDraft,
  type BookingDraft,
} from "@/components/wellness/booking-fields";
import type {
  WellnessAppointmentRow,
  WellnessApptStatus,
  WellnessCustomerRow,
} from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  WELLNESS_APPT_STATUS,
  apptErrorMessage,
  apptRangeLabel,
  wellnessCustomerName,
} from "@/lib/wellness-constants";

export type ContactCustomer = WellnessCustomerRow & {
  lab_files: { id: string }[];
  appointments: WellnessAppointmentRow[];
};

function sortAppts(list: WellnessAppointmentRow[]): WellnessAppointmentRow[] {
  return [...list].sort((a, b) =>
    a.appt_date === b.appt_date
      ? a.start_time.localeCompare(b.start_time)
      : a.appt_date.localeCompare(b.appt_date)
  );
}

/** คิวที่ยังนัดอยู่ของลูกค้าคนนี้ (ใกล้สุดก่อน) */
function scheduledOf(c: ContactCustomer): WellnessAppointmentRow | null {
  return sortAppts(c.appointments.filter((a) => a.status === "scheduled"))[0] ?? null;
}

/** ชื่อ + หัตถการ + จำนวนไฟล์ผลแลบ (component ระดับโมดูล — ประกาศในตัว client
    จะถูกสร้างใหม่ทุก render และ remount แถวทิ้ง) */
function CustomerLine({ c }: { c: ContactCustomer }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-base font-semibold text-stone-800">
        {wellnessCustomerName(c)}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone-500">
        {c.procedure_text && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Stethoscope size={13} className="shrink-0 text-stone-400" />
            <span className="truncate">{c.procedure_text}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-stone-400">
          <FileText size={13} /> ผลแลบ {c.lab_files.length} ไฟล์
        </span>
      </p>
      {c.note && (
        <p className="mt-1 truncate text-[13px] text-stone-400">{c.note}</p>
      )}
    </div>
  );
}

/** ปุ่มโทร — งานหลักของหน้านี้คือ "โทร" จึงทำให้กดง่ายที่สุดบนมือถือ
    (จอเล็ก = เต็มความกว้างครึ่งแถว ตัวเลขใหญ่พอกดขณะถือโทรศัพท์) */
function PhoneButton({ phone }: { phone: string }) {
  if (!phone) {
    return (
      <span className="text-[13px] text-stone-400">ไม่มีเบอร์โทรในระบบ</span>
    );
  }
  return (
    <a
      href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[15px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 sm:flex-none"
    >
      <Phone size={16} /> {phone}
    </a>
  );
}

/**
 * หน้าทำงานของ Admin — **โทรนัด + ลงคิว** (Stage 3 ของ flow)
 *
 * 3 กองงานเรียงตามลำดับที่ต้องลงมือ: รอโทรนัด → นัดแล้ว → ฟังผลแล้วรอปิดเคส
 * ไม่มีการอัพไฟล์ผลแลบหรือแก้ทะเบียนลูกค้าในหน้านี้ (คนละบทบาท คนละหน้า)
 */
export function ContactClient({
  customers: customersProp,
  uid,
}: {
  customers: ContactCustomer[];
  uid: string | null;
}) {
  const router = useRouter();

  const [state, setState] = useState({
    base: customersProp,
    customers: customersProp,
  });
  if (state.base !== customersProp) {
    setState({ base: customersProp, customers: customersProp });
  }
  const customers = state.customers;

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [booking, setBooking] = useState<{
    customerId: string;
    draft: BookingDraft;
    saving: boolean;
    error: string | null;
  } | null>(null);

  const q = search.trim().toLowerCase();
  const matched = q
    ? customers.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.phone} ${c.procedure_text}`
          .toLowerCase()
          .includes(q)
      )
    : customers;

  // รอโทรนัด = ผลพร้อม + ยังไม่มีคิวที่นัดไว้ + ยังไม่เคยมาพบแพทย์
  // (เคยมาแล้ว = ไปกอง "รอปิดเคส" ไม่ใช่วนกลับมาให้โทรนัดใหม่)
  const toCall = matched.filter(
    (c) =>
      c.lab_confirmed_at &&
      !scheduledOf(c) &&
      !c.appointments.some((a) => a.status === "done")
  );
  const booked = matched
    .filter((c) => scheduledOf(c))
    .sort((a, b) => {
      const x = scheduledOf(a)!;
      const y = scheduledOf(b)!;
      return x.appt_date === y.appt_date
        ? x.start_time.localeCompare(y.start_time)
        : x.appt_date.localeCompare(y.appt_date);
    });
  const toClose = matched.filter(
    (c) =>
      !scheduledOf(c) && c.appointments.some((a) => a.status === "done")
  );
  const waitingLab = matched.filter((c) => !c.lab_confirmed_at).length;

  function patchLocal(id: string, patch: Partial<ContactCustomer>) {
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  async function createAppt(customer: ContactCustomer) {
    if (!booking || booking.customerId !== customer.id || booking.saving) return;
    const { draft } = booking;
    if (!draft.date || !draft.time) {
      setBooking({ ...booking, error: "เลือกวันและเวลาก่อน" });
      return;
    }
    setBooking({ ...booking, saving: true, error: null });
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("wellness_appointments")
      .insert({
        customer_id: customer.id,
        appt_date: draft.date,
        start_time: draft.time,
        duration_hours: draft.duration,
        note: draft.note.trim(),
        created_by: uid,
      })
      .select("*")
      .single();
    if (err || !data) {
      setBooking((b) =>
        b ? { ...b, saving: false, error: apptErrorMessage(err) } : b
      );
      return;
    }
    patchLocal(customer.id, {
      appointments: sortAppts([...customer.appointments, data]),
    });
    setBooking(null);
    router.refresh();
  }

  async function setApptStatus(
    customer: ContactCustomer,
    apptId: string,
    next: WellnessApptStatus
  ) {
    if (busyId) return;
    setBusyId(customer.id);
    setError(null);
    const prev = customer.appointments;
    patchLocal(customer.id, {
      appointments: customer.appointments.map((a) =>
        a.id === apptId ? { ...a, status: next } : a
      ),
    });
    const supabase = createClient();
    const { error: err } = await supabase
      .from("wellness_appointments")
      .update({ status: next })
      .eq("id", apptId);
    setBusyId(null);
    if (err) {
      patchLocal(customer.id, { appointments: prev });
      // กลับมาเป็น "นัดไว้" อีกครั้งก็เข้า exclusion constraint ใหม่ — ชนกับคิวอื่นได้
      setError(apptErrorMessage(err, "อัพเดตคิวไม่สำเร็จ"));
      return;
    }
    router.refresh();
  }

  async function closeCase(customer: ContactCustomer) {
    if (busyId) return;
    setBusyId(customer.id);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("wellness_customers")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", customer.id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    // ปิดเคสแล้วหลุดจากคิวนี้ทันที (หน้านี้ดึงเฉพาะเคสที่ยังไม่ปิด)
    setState((s) => ({
      ...s,
      customers: s.customers.filter((c) => c.id !== customer.id),
    }));
    router.refresh();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
        {/* ช่องค้นหาเต็มความกว้างก่อน แล้วชิป/ลิงก์ค่อยไหลลงแถวถัดไปบนมือถือ
            (เดิมอัดแถวเดียวกัน ทำให้ช่องค้นหาโดนบีบจนอ่านคำในช่องไม่ออก) */}
        <div className="relative mb-2.5">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อ / เบอร์โทร"
            className="w-full rounded-full border border-stone-200/80 bg-white/90 py-2.5 pl-10 pr-4 text-base text-stone-700 shadow-sm placeholder:text-stone-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[13px] font-medium text-sky-800">
            รอโทรนัด {toCall.length} ราย
          </span>
          <Link
            href="/wellness/calendar"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <CalendarClock size={14} /> ดูปฏิทินก่อนนัด
          </Link>
        </div>

        {error && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-[15px] text-rose-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 cursor-pointer text-xs underline"
            >
              ปิด
            </button>
          </div>
        )}

        {q && matched.length === 0 && customers.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[15px] text-amber-800">
            ไม่พบชื่อที่ตรงกับ “{search}” — เคสทั้งหมด {customers.length}{" "}
            รายยังอยู่ครบ
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-11"
            >
              <X size={12} /> ล้างคำค้น
            </button>
          </div>
        )}

        <div className="space-y-6">
          {/* ---------- 1) รอโทรนัด ---------- */}
          <section>
            <header className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
              <span
                className="h-2.5 w-2.5 shrink-0 self-center rounded-full bg-sky-400"
                aria-hidden
              />
              <h2 className="text-base font-semibold text-stone-800">
                รอโทรนัด
              </h2>
              <span className="text-[13px] text-stone-400">{toCall.length} ราย</span>
              <span className="basis-full text-[13px] text-stone-400 sm:basis-auto sm:before:mx-1 sm:before:content-['·']">
                ผลเลือดพร้อมแล้ว — โทรตกลงเวลา แล้วกดลงคิว
              </span>
            </header>
            {toCall.length === 0 ? (
              <p className="rounded-2xl bg-white/70 px-4 py-5 text-[13px] text-stone-400 ring-1 ring-stone-200/60">
                ไม่มีใครรอโทรนัดตอนนี้
                {waitingLab > 0 &&
                  ` — ยังรอผลแลบอีก ${waitingLab} ราย (ทีม Lab กำลังทำ)`}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {toCall.map((c) => {
                  const open = booking?.customerId === c.id;
                  return (
                    <li key={c.id} className="rounded-2xl bg-white/95 px-3.5 py-3.5 shadow-sm ring-1 ring-stone-200/70">
                      <CustomerLine c={c} />
                      {/* ปุ่มโทร + ลงคิว อยู่แถวของตัวเองเต็มความกว้างบนมือถือ
                          (เดิมยัดอยู่แถวเดียวกับชื่อ → ชื่อโดนบีบจนอ่านไม่ออก) */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <PhoneButton phone={c.phone} />
                        <Button
                          variant={open ? "secondary" : "primary"}
                          className="min-h-11 flex-1 sm:flex-none"
                          onClick={() =>
                            setBooking(
                              open
                                ? null
                                : {
                                    customerId: c.id,
                                    draft: newBookingDraft(),
                                    saving: false,
                                    error: null,
                                  }
                            )
                          }
                        >
                          <CalendarPlus size={16} />
                          {open ? "ปิดฟอร์ม" : "ลงคิว"}
                        </Button>
                      </div>

                      {open && booking && (
                        <div className="mt-3 rounded-xl border border-brand-200/70 bg-white/60 p-3">
                          <BookingFields
                            idPrefix={`bk-${c.id}`}
                            draft={booking.draft}
                            onChange={(patch) =>
                              setBooking((b) =>
                                b
                                  ? { ...b, draft: { ...b.draft, ...patch } }
                                  : b
                              )
                            }
                          />
                          {booking.error && (
                            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                              {booking.error}
                            </p>
                          )}
                          <div className="mt-3 flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => setBooking(null)}
                            >
                              ยกเลิก
                            </Button>
                            <Button
                              onClick={() => void createAppt(c)}
                              loading={booking.saving}
                            >
                              บันทึกคิว
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------- 2) นัดแล้ว ---------- */}
          <section>
            <header className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
              <span
                className="h-2.5 w-2.5 shrink-0 self-center rounded-full bg-brand-400"
                aria-hidden
              />
              <h2 className="text-base font-semibold text-stone-800">
                นัดแล้ว · รอถึงวันนัด
              </h2>
              <span className="text-[13px] text-stone-400">{booked.length} ราย</span>
            </header>
            {booked.length === 0 ? (
              <p className="rounded-2xl bg-white/70 px-4 py-5 text-[13px] text-stone-400 ring-1 ring-stone-200/60">
                ยังไม่มีคิวที่นัดไว้
              </p>
            ) : (
              <ul className="space-y-2.5">
                {booked.map((c) => {
                  const appt = scheduledOf(c)!;
                  return (
                    <li key={c.id} className="rounded-2xl bg-white/95 px-3.5 py-3.5 shadow-sm ring-1 ring-stone-200/70">
                      <CustomerLine c={c} />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <PhoneButton phone={c.phone} />
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50/60 px-3 py-2.5 ring-1 ring-brand-100">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800">
                          <CalendarClock size={14} />
                          {formatDate(appt.appt_date)} ·{" "}
                          {apptRangeLabel(appt.start_time, appt.duration_hours)}
                        </span>
                        {appt.note && (
                          <span className="min-w-0 truncate text-[13px] text-stone-500">
                            {appt.note}
                          </span>
                        )}
                        <span className="flex flex-wrap gap-1.5 sm:ml-auto">
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() =>
                              void setApptStatus(c, appt.id, "done")
                            }
                            className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 max-sm:min-h-11"
                          >
                            มาแล้ว · เสร็จ
                          </button>
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() =>
                              void setApptStatus(c, appt.id, "cancelled")
                            }
                            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-50 disabled:opacity-50 max-sm:min-h-11"
                          >
                            ยกเลิกคิว
                          </button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------- 3) ฟังผลแล้ว รอปิดเคส ---------- */}
          {toClose.length > 0 && (
            <section>
              <header className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
                <span
                  className="h-2.5 w-2.5 shrink-0 self-center rounded-full bg-emerald-400"
                  aria-hidden
                />
                <h2 className="text-base font-semibold text-stone-800">
                  ฟังผลแล้ว · รอปิดเคส
                </h2>
                <span className="text-[13px] text-stone-400">
                  {toClose.length} ราย
                </span>
              </header>
              <ul className="space-y-2.5">
                {toClose.map((c) => {
                  const last = sortAppts(
                    c.appointments.filter((a) => a.status === "done")
                  ).slice(-1)[0];
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 px-3.5 py-3.5 shadow-sm ring-1 ring-stone-200/70"
                    >
                      <CustomerLine c={c} />
                      {last && (
                        <span className="text-[13px] text-stone-500">
                          เข้าพบแพทย์ {formatDate(last.appt_date)} ·{" "}
                          {WELLNESS_APPT_STATUS[last.status].label}
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        disabled={busyId === c.id}
                        onClick={() => void closeCase(c)}
                      >
                        <CheckCircle2 size={14} /> ปิดเคส
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ยกเลิกคิวไปแล้วแต่ยังไม่ได้นัดใหม่ = กลับไปกอง "รอโทรนัด" อัตโนมัติ */}
          <p className="px-1 text-xs text-stone-400">
            <RotateCcw size={11} className="mr-1 inline" />
            ยกเลิกคิวแล้วเคสจะกลับไปอยู่กอง “รอโทรนัด” ให้โทรนัดใหม่ได้เลย
          </p>
        </div>
      </div>
    </div>
  );
}
