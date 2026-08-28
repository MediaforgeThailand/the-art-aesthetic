"use client";

import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Pencil,
  Phone,
  RotateCcw,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  ConfirmDialog,
  Input,
  Label,
  Modal,
  PageContainer,
  Select,
  Textarea,
} from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import type {
  WellnessAppointmentRow,
  WellnessApptStatus,
  WellnessCustomerRow,
  WellnessLabFileRow,
} from "@/lib/database.types";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  WELLNESS_APPT_STATUS,
  WELLNESS_DURATION_OPTIONS,
  WELLNESS_OVERLAP_MESSAGE as OVERLAP_MESSAGE,
  WELLNESS_STATUS,
  apptRangeLabel,
  isWellnessDoctorDay,
  todayBangkokISO,
  wellnessCustomerName,
  wellnessStatusOf,
} from "@/lib/wellness-constants";
import { LabFilesCard } from "./lab-files";

function sortAppts(list: WellnessAppointmentRow[]): WellnessAppointmentRow[] {
  return [...list].sort((a, b) =>
    a.appt_date === b.appt_date
      ? a.start_time.localeCompare(b.start_time)
      : a.appt_date.localeCompare(b.appt_date)
  );
}

/** ฟอร์มแก้ข้อมูลลูกค้า — mount ใหม่ทุกครั้งที่เปิด (parent render แบบมีเงื่อนไข) */
function EditCustomerModal({
  customer,
  onSave,
  onClose,
}: {
  customer: WellnessCustomerRow;
  onSave: (patch: Partial<WellnessCustomerRow>) => Promise<string | null>;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(customer.first_name);
  const [lastName, setLastName] = useState(customer.last_name);
  const [phone, setPhone] = useState(customer.phone);
  const [procedure, setProcedure] = useState(customer.procedure_text);
  const [note, setNote] = useState(customer.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!firstName.trim()) {
      setError("กรอกชื่อลูกค้าก่อน");
      return;
    }
    setSaving(true);
    const err = await onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      procedure_text: procedure.trim(),
      note: note.trim(),
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="แก้ไขข้อมูลลูกค้า">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>ชื่อ *</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="ชื่อ"
            />
          </div>
          <div>
            <Label>นามสกุล</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="นามสกุล"
            />
          </div>
        </div>
        <div>
          <Label>เบอร์โทร</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
            inputMode="tel"
          />
        </div>
        <div>
          <Label>หัตถการที่ทำ</Label>
          <Input
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            placeholder="เช่น เสริมจมูก + ตา 2 ชั้น"
          />
        </div>
        <div>
          <Label>หมายเหตุ</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="ข้อมูลเพิ่มเติม (ถ้ามี)"
          />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            บันทึก
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** ฟอร์มลงคิวนัด (Admin) — เลือกวัน + เวลาเริ่ม + ระยะเวลา 1/2/3 ชม. */
function ApptFormModal({
  onCreate,
  onClose,
}: {
  onCreate: (input: {
    date: string;
    time: string;
    duration: number;
    note: string;
  }) => Promise<string | null>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayBangkokISO());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState<number>(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!date || !time) {
      setError("เลือกวันและเวลาก่อน");
      return;
    }
    setSaving(true);
    const err = await onCreate({ date, time, duration, note: note.trim() });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="ลงคิวนัดฟังผล + ปรึกษาแพทย์">
      <div className="space-y-3">
        <div>
          <Label>วันนัด *</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {date && !isWellnessDoctorDay(date) && (
            <p className="mt-1 text-xs text-amber-700">
              แพทย์ Wellness เข้าเฉพาะ <b>วันอังคาร</b> และ <b>วันเสาร์</b> —
              วันที่เลือกไม่ตรงวันแพทย์เข้า (ลงได้ถ้าเป็นเคสพิเศษ)
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>เวลาเริ่ม *</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div>
            <Label>ระยะเวลา</Label>
            <Select
              value={String(duration)}
              onChange={(e) => setDuration(Number(e.target.value))}
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
          <Label>หมายเหตุคิว</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น ขอคุยเรื่องวิตามินเพิ่ม"
          />
        </div>
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            บันทึกคิว
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * หน้าเดินงานการ์ดลูกค้า Wellness — BC แก้ข้อมูล · Lab อัพไฟล์+ยืนยัน · Admin ลงคิว/ปิดเคส
 * แพทย์ (view-only) เปิดดูได้ทุกส่วนแต่ไม่มีปุ่มแก้
 */
export function WellnessDetailClient({
  customer: customerProp,
  labFiles: labFilesProp,
  appointments: appointmentsProp,
  uid,
  canBc,
  canLab,
  canAdmin,
}: {
  customer: WellnessCustomerRow;
  labFiles: WellnessLabFileRow[];
  appointments: WellnessAppointmentRow[];
  uid: string | null;
  canBc: boolean;
  canLab: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();

  // reconcile props → state แบบ adjust-during-render (mutation ทุกตัวจบด้วย router.refresh()
  // — payload ใหม่จาก server ชนะ optimistic เสมอ)
  const [state, setState] = useState({
    base: { customerProp, labFilesProp, appointmentsProp },
    customer: customerProp,
    labFiles: labFilesProp,
    appointments: appointmentsProp,
  });
  if (
    state.base.customerProp !== customerProp ||
    state.base.labFilesProp !== labFilesProp ||
    state.base.appointmentsProp !== appointmentsProp
  ) {
    setState({
      base: { customerProp, labFilesProp, appointmentsProp },
      customer: customerProp,
      labFiles: labFilesProp,
      appointments: appointmentsProp,
    });
  }
  const { customer, labFiles, appointments } = state;

  const [editOpen, setEditOpen] = useState(false);
  const [apptFormOpen, setApptFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const completed = !!customer.completed_at;
  const hasScheduled = appointments.some((a) => a.status === "scheduled");
  const status = wellnessStatusOf(customer, hasScheduled);
  const statusMeta = WELLNESS_STATUS[status];

  const supabase = createClient();

  async function patchCustomer(
    patch: Partial<WellnessCustomerRow>
  ): Promise<string | null> {
    const prev = state.customer;
    setState((s) => ({ ...s, customer: { ...s.customer, ...patch } }));
    const { error } = await supabase
      .from("wellness_customers")
      .update(patch)
      .eq("id", customer.id);
    if (error) {
      setState((s) => ({ ...s, customer: prev }));
      return error.message;
    }
    router.refresh();
    return null;
  }

  async function confirmLab() {
    if (labFiles.length === 0) return;
    const err = await patchCustomer({
      lab_confirmed_at: new Date().toISOString(),
      lab_confirmed_by: uid,
    });
    if (err) setBanner(err);
  }

  async function unconfirmLab() {
    const err = await patchCustomer({
      lab_confirmed_at: null,
      lab_confirmed_by: null,
    });
    if (err) setBanner(err);
  }

  async function createAppt(input: {
    date: string;
    time: string;
    duration: number;
    note: string;
  }): Promise<string | null> {
    const { data, error } = await supabase
      .from("wellness_appointments")
      .insert({
        customer_id: customer.id,
        appt_date: input.date,
        start_time: input.time,
        duration_hours: input.duration,
        note: input.note,
        created_by: uid,
      })
      .select("*")
      .single();
    if (error || !data) {
      if (error?.code === "23P01") return OVERLAP_MESSAGE;
      return error?.message ?? "บันทึกคิวไม่สำเร็จ";
    }
    setState((s) => ({ ...s, appointments: sortAppts([...s.appointments, data]) }));
    router.refresh();
    return null;
  }

  async function setApptStatus(id: string, next: WellnessApptStatus) {
    const prev = state.appointments;
    setState((s) => ({
      ...s,
      appointments: s.appointments.map((a) =>
        a.id === id ? { ...a, status: next } : a
      ),
    }));
    const { error } = await supabase
      .from("wellness_appointments")
      .update({ status: next })
      .eq("id", id);
    if (error) {
      setState((s) => ({ ...s, appointments: prev }));
      // กลับมาเป็น "นัดไว้" อีกครั้งก็เข้า exclusion constraint ใหม่ — ชนกับคิวอื่นได้
      setBanner(error.code === "23P01" ? OVERLAP_MESSAGE : error.message);
      return;
    }
    router.refresh();
  }

  async function toggleCompleted() {
    const err = await patchCustomer({
      completed_at: completed ? null : new Date().toISOString(),
    });
    if (err) setBanner(err);
  }

  async function deleteCustomer() {
    setDeleteOpen(false);
    const paths = labFiles.map((f) => f.file_path);
    const { error } = await supabase
      .from("wellness_customers")
      .delete()
      .eq("id", customer.id);
    if (error) {
      setBanner(error.message);
      return;
    }
    if (paths.length > 0) {
      // ไฟล์จริงใน storage ลบแบบ best effort (แถว DB cascade ไปแล้ว)
      void supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .remove(paths)
        .then(() => undefined)
        .catch(() => undefined);
    }
    router.push("/wellness");
    router.refresh();
  }

  const labConfirmed = !!customer.lab_confirmed_at;

  return (
    <PageContainer>
      <div className="mx-auto max-w-5xl space-y-4 animate-fade-in">
        {/* หัวหน้า: ปุ่มกลับ + ชื่อ + สถานะ */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/wellness"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-stone-500 transition-colors hover:bg-white/70 hover:text-brand-700 max-sm:min-h-11"
          >
            <ChevronLeft size={16} /> การ์ดลูกค้า
          </Link>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.badge}`}
          >
            {statusMeta.label}
          </span>
          <span className="text-xs text-stone-400">{statusMeta.hint}</span>
        </div>

        {banner && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm text-rose-700">
            <span>{banner}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="shrink-0 cursor-pointer text-xs underline"
            >
              ปิด
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ซ้าย: ข้อมูลลูกค้า + ไฟล์แลบ */}
          <div className="space-y-4">
            <section className="glass overflow-hidden rounded-xl">
              <header className="flex items-center gap-2 border-b border-white/60 px-4 py-3">
                <User size={16} className="text-brand-500" />
                <h1 className="text-base font-semibold text-stone-800">
                  {wellnessCustomerName(customer)}
                </h1>
                {(canBc || canAdmin) && !completed && (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    title="แก้ไขข้อมูลลูกค้า"
                    aria-label="แก้ไขข้อมูลลูกค้า"
                    className="ml-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 sm:h-8 sm:w-8"
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </header>
              <dl className="space-y-2.5 px-4 py-3.5 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="w-24 shrink-0 text-xs text-stone-400">
                    เบอร์โทร
                  </dt>
                  <dd className="min-w-0">
                    {customer.phone ? (
                      <a
                        href={`tel:${customer.phone.replace(/[^0-9+]/g, "")}`}
                        className="inline-flex items-center gap-1.5 font-medium text-brand-700 underline-offset-2 hover:underline"
                      >
                        <Phone size={13} /> {customer.phone}
                      </a>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-start gap-2">
                  <dt className="w-24 shrink-0 text-xs text-stone-400">
                    หัตถการที่ทำ
                  </dt>
                  <dd className="min-w-0 text-stone-700">
                    {customer.procedure_text || (
                      <span className="text-stone-400">—</span>
                    )}
                  </dd>
                </div>
                {customer.note && (
                  <div className="flex items-start gap-2">
                    <dt className="w-24 shrink-0 text-xs text-stone-400">
                      หมายเหตุ
                    </dt>
                    <dd className="min-w-0 whitespace-pre-wrap text-stone-600">
                      {customer.note}
                    </dd>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <dt className="w-24 shrink-0 text-xs text-stone-400">
                    สร้างการ์ด
                  </dt>
                  <dd className="text-xs text-stone-500">
                    {formatDateTime(customer.created_at)}
                  </dd>
                </div>
                {completed && (
                  <div className="flex items-center gap-2">
                    <dt className="w-24 shrink-0 text-xs text-stone-400">
                      ปิดเคสเมื่อ
                    </dt>
                    <dd className="text-xs text-emerald-700">
                      {formatDateTime(customer.completed_at!)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <LabFilesCard
              customerId={customer.id}
              files={labFiles}
              canLab={canLab}
              uid={uid}
              readOnly={completed}
              onAdded={(rows) =>
                setState((s) => ({ ...s, labFiles: [...s.labFiles, ...rows] }))
              }
              onRemoved={(fileId) =>
                setState((s) => ({
                  ...s,
                  labFiles: s.labFiles.filter((f) => f.id !== fileId),
                }))
              }
            />

            {/* การ์ดยืนยันผลแลบ — จุดส่งไม้จาก Lab → Admin */}
            <section
              className={`overflow-hidden rounded-xl border px-4 py-3.5 ${
                labConfirmed
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "glass border-transparent"
              }`}
            >
              {labConfirmed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 size={17} className="shrink-0 text-emerald-600" />
                  <p className="min-w-0 flex-1 text-sm text-emerald-800">
                    ยืนยันผลแลบครบแล้ว —{" "}
                    <span className="text-xs text-emerald-700">
                      {formatDateTime(customer.lab_confirmed_at!)} · ส่งต่อให้
                      Admin โทรนัดคิว
                    </span>
                  </p>
                  {canLab && !completed && (
                    <button
                      type="button"
                      onClick={() => void unconfirmLab()}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-500 transition-colors hover:bg-white/70 hover:text-stone-700 max-sm:min-h-11"
                    >
                      <RotateCcw size={12} /> ยกเลิกการยืนยัน
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="min-w-0 flex-1 text-sm text-stone-600">
                    {labFiles.length === 0
                      ? "อัพไฟล์ผลตรวจอย่างน้อย 1 ไฟล์ก่อน จึงจะยืนยันผลแลบได้"
                      : "ตรวจไฟล์ครบแล้ว? ยืนยันเพื่อส่งต่อให้ Admin นัดคิวลูกค้า"}
                  </p>
                  {canLab && !completed && (
                    <Button
                      onClick={() => void confirmLab()}
                      disabled={labFiles.length === 0}
                    >
                      <CheckCircle2 size={15} /> ยืนยันผลแลบครบ
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* ขวา: คิวนัด + โซนจัดการเคส */}
          <div className="space-y-4">
            <section className="glass overflow-hidden rounded-xl">
              <header className="flex flex-wrap items-center gap-2 border-b border-white/60 px-4 py-3">
                <ClipboardList size={16} className="text-brand-500" />
                <h2 className="text-sm font-semibold text-stone-800">
                  คิวนัดฟังผล + ปรึกษาแพทย์
                </h2>
                {canAdmin && !completed && (
                  <button
                    type="button"
                    onClick={() => setApptFormOpen(true)}
                    className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-11"
                  >
                    <CalendarPlus size={13} /> ลงคิวนัด
                  </button>
                )}
              </header>

              {appointments.length === 0 ? (
                <p className="px-4 py-5 text-xs text-stone-400">
                  ยังไม่มีคิวนัด
                  {canAdmin && !completed
                    ? " — กด “ลงคิวนัด” หลังโทรตกลงเวลากับลูกค้าแล้ว"
                    : labConfirmed
                      ? " — รอ Admin โทรนัดลูกค้า"
                      : ""}
                </p>
              ) : (
                <ul className="divide-y divide-white/60">
                  {appointments.map((a) => {
                    const meta = WELLNESS_APPT_STATUS[a.status];
                    return (
                      <li key={a.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-stone-800">
                            {formatDate(a.appt_date)}
                          </span>
                          <span className="text-sm text-stone-600">
                            {apptRangeLabel(a.start_time, a.duration_hours)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        {a.note && (
                          <p className="mt-1 text-xs text-stone-500">{a.note}</p>
                        )}
                        {canAdmin && !completed && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {a.status === "scheduled" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void setApptStatus(a.id, "done")}
                                  className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 max-sm:min-h-11"
                                >
                                  มาแล้ว · เสร็จ
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void setApptStatus(a.id, "cancelled")
                                  }
                                  className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-50 max-sm:min-h-11"
                                >
                                  ยกเลิกคิว
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void setApptStatus(a.id, "scheduled")
                                }
                                className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-50 max-sm:min-h-11"
                              >
                                <RotateCcw size={11} className="mr-1 inline" />
                                กลับเป็นนัดไว้
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* โซนจัดการเคส (Admin) */}
            {canAdmin && (
              <section className="glass overflow-hidden rounded-xl px-4 py-3.5">
                <h2 className="text-sm font-semibold text-stone-800">
                  จัดการเคส
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  {completed
                    ? "เคสนี้ปิดแล้ว — เปิดใหม่ได้ถ้าลูกค้ากลับมาใช้บริการต่อ"
                    : "ลูกค้าฟังผล + ปรึกษาแพทย์เรียบร้อย = ปิดเคสเพื่อเก็บเป็นประวัติ"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={completed ? "ghost" : "primary"}
                    onClick={() => void toggleCompleted()}
                  >
                    {completed ? (
                      <>
                        <RotateCcw size={14} /> เปิดเคสอีกครั้ง
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> ปิดเคส
                      </>
                    )}
                  </Button>
                  <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={14} /> ลบการ์ด
                  </Button>
                </div>
              </section>
            )}

            <Link
              href="/wellness-calendar"
              className="inline-flex items-center gap-1.5 text-xs text-stone-500 underline-offset-2 hover:text-brand-700 hover:underline"
            >
              <ArrowLeft size={12} className="rotate-180" />
              ดูปฏิทินคิวแพทย์ทั้งหมด
            </Link>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditCustomerModal
          customer={customer}
          onSave={patchCustomer}
          onClose={() => setEditOpen(false)}
        />
      )}
      {apptFormOpen && (
        <ApptFormModal
          onCreate={createAppt}
          onClose={() => setApptFormOpen(false)}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        title="ลบการ์ดลูกค้า"
        message={`ลบการ์ดของ "${wellnessCustomerName(customer)}" ถาวร? ไฟล์ผลแลบทั้งหมด (${labFiles.length} ไฟล์) และคิวนัดจะถูกลบไปด้วย กู้คืนไม่ได้`}
        confirmLabel="ลบการ์ด"
        onConfirm={() => void deleteCustomer()}
        onClose={() => setDeleteOpen(false)}
      />
    </PageContainer>
  );
}
