"use client";

import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  FlaskConical,
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
  Modal,
  PageContainer,
} from "@/components/ui";
import {
  BookingFields,
  newBookingDraft,
  type BookingDraft,
} from "@/components/wellness/booking-fields";
import { CustomerFormModal } from "@/components/wellness/customer-form";
import { LabFilesCard } from "@/components/wellness/lab-files";
import {
  WellnessStageTracker,
  WellnessStatusChip,
} from "@/components/wellness/stage-tracker";
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
  WELLNESS_STATUS,
  apptErrorMessage,
  apptRangeLabel,
  wellnessCustomerName,
  wellnessStatusOf,
} from "@/lib/wellness-constants";

function sortAppts(list: WellnessAppointmentRow[]): WellnessAppointmentRow[] {
  return [...list].sort((a, b) =>
    a.appt_date === b.appt_date
      ? a.start_time.localeCompare(b.start_time)
      : a.appt_date.localeCompare(b.appt_date)
  );
}

/** ฟอร์มลงคิว (Admin) — ช่องกรอกใช้ชุดกลาง BookingFields เหมือนหน้าลงคิว/ปฏิทิน */
function ApptFormModal({
  onCreate,
  onClose,
}: {
  onCreate: (draft: BookingDraft) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BookingDraft>(() => newBookingDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!draft.date || !draft.time) {
      setError("เลือกวันและเวลาก่อน");
      return;
    }
    setSaving(true);
    const err = await onCreate(draft);
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
        <BookingFields
          idPrefix="case-appt"
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
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

/** บรรทัดสรุปสถานะของขั้นที่ "ไม่ใช่งานของบทบาทนี้" — บอกความคืบหน้าโดยไม่โชว์ปุ่มของคนอื่น */
function StatusLine({
  icon,
  label,
  value,
  tone = "quiet",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "quiet" | "ok" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-stone-600";
  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-xl px-4 py-3">
      <span className="shrink-0 text-brand-500">{icon}</span>
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <span className={`text-sm ${toneClass}`}>{value}</span>
    </div>
  );
}

/**
 * หน้าเคส 1 ใบ — **แสดงเฉพาะส่วนที่บทบาทของผู้เปิดทำได้**
 *
 * กติกาผู้ใช้ 2026-08-28: ห้ามเอาปุ่มของทุกบทบาทมารวมในหน้าเดียว —
 * ขั้นที่ไม่ใช่งานของเรา แสดงเป็นบรรทัดสถานะอ่านอย่างเดียวเท่านั้น
 * (งานประจำวันทำจบที่หน้าของแต่ละขั้นอยู่แล้ว หน้านี้ไว้ดูเคสเป็นใบๆ)
 */
export function WellnessDetailClient({
  customer: customerProp,
  labFiles: labFilesProp,
  appointments: appointmentsProp,
  uid,
  canBc,
  canLab,
  canAdmin,
  canDoctor,
  backHref,
  backLabel,
}: {
  customer: WellnessCustomerRow;
  labFiles: WellnessLabFileRow[];
  appointments: WellnessAppointmentRow[];
  uid: string | null;
  canBc: boolean;
  canLab: boolean;
  canAdmin: boolean;
  canDoctor: boolean;
  backHref: string;
  backLabel: string;
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
  const labConfirmed = !!customer.lab_confirmed_at;
  const hasScheduled = appointments.some((a) => a.status === "scheduled");
  const status = wellnessStatusOf(customer, hasScheduled);
  const nextAppt = sortAppts(
    appointments.filter((a) => a.status === "scheduled")
  )[0];

  // เห็นรายละเอียดของขั้นนั้นไหม (ไม่ใช่ "แก้ได้ไหม")
  const seeLabFiles = canLab || canAdmin || canDoctor;
  const seeAppointments = canAdmin || canDoctor;
  const seePhone = canBc || canAdmin || canDoctor;

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

  async function createAppt(draft: BookingDraft): Promise<string | null> {
    const { data, error } = await supabase
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
    if (error || !data) return apptErrorMessage(error);
    setState((s) => ({
      ...s,
      appointments: sortAppts([...s.appointments, data]),
    }));
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
      setBanner(apptErrorMessage(error, "อัพเดตคิวไม่สำเร็จ"));
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
    router.push(backHref);
    router.refresh();
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-4 animate-fade-in">
        {/* หัวหน้า: ปุ่มกลับ + ชื่อ + สถานะ + เส้นบอกขั้น */}
        <div className="space-y-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-stone-500 transition-colors hover:bg-white/70 hover:text-brand-700 max-sm:min-h-11"
          >
            <ChevronLeft size={16} /> {backLabel}
          </Link>

          <section className="glass rounded-xl px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <User size={17} className="shrink-0 text-brand-500" />
              <h1 className="text-base font-semibold text-stone-800">
                {wellnessCustomerName(customer)}
              </h1>
              <WellnessStatusChip status={status} />
              {canBc && !completed && (
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
            </div>
            <WellnessStageTracker status={status} className="mt-4" />
            <p className="mt-3 text-center text-[13px] text-stone-500">
              {WELLNESS_STATUS[status].hint}
            </p>
          </section>
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

        {/* ---------- ข้อมูลลูกค้า (ทุกบทบาทเห็น — เบอร์โทรเฉพาะคนที่ต้องใช้) ---------- */}
        <section className="glass overflow-hidden rounded-xl">
          <header className="flex items-center gap-2 border-b border-white/60 px-4 py-3">
            <h2 className="text-base font-semibold text-stone-800">
              ข้อมูลลูกค้า
            </h2>
          </header>
          <dl className="space-y-2.5 px-4 py-3.5 text-sm">
            {seePhone && (
              <div className="flex items-center gap-2">
                <dt className="w-24 shrink-0 text-[13px] text-stone-400">
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
            )}
            <div className="flex items-start gap-2">
              <dt className="w-24 shrink-0 text-[13px] text-stone-400">
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
                <dt className="w-24 shrink-0 text-[13px] text-stone-400">
                  หมายเหตุ
                </dt>
                <dd className="min-w-0 whitespace-pre-wrap text-stone-600">
                  {customer.note}
                </dd>
              </div>
            )}
            <div className="flex items-center gap-2">
              <dt className="w-24 shrink-0 text-[13px] text-stone-400">
                สร้างการ์ด
              </dt>
              <dd className="text-[13px] text-stone-500">
                {formatDateTime(customer.created_at)}
              </dd>
            </div>
            {completed && (
              <div className="flex items-center gap-2">
                <dt className="w-24 shrink-0 text-[13px] text-stone-400">
                  ปิดเคสเมื่อ
                </dt>
                <dd className="text-xs text-emerald-700">
                  {formatDateTime(customer.completed_at)}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* ---------- ขั้น 2: ผลแลบ ---------- */}
        {seeLabFiles ? (
          <>
            <LabFilesCard
              customerId={customer.id}
              files={labFiles}
              canEdit={canLab && !completed}
              uid={uid}
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

            {/* จุดส่งไม้จาก Lab → Admin (ปุ่มเฉพาะทีม Lab) */}
            <section
              className={`overflow-hidden rounded-xl border px-4 py-3.5 ${
                labConfirmed
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "glass border-transparent"
              }`}
            >
              {labConfirmed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2
                    size={17}
                    className="shrink-0 text-emerald-600"
                  />
                  <p className="min-w-0 flex-1 text-sm text-emerald-800">
                    ยืนยันผลแลบครบแล้ว —{" "}
                    <span className="text-xs text-emerald-700">
                      {formatDateTime(customer.lab_confirmed_at)}
                    </span>
                  </p>
                  {canLab && !completed && (
                    <button
                      type="button"
                      onClick={() => void unconfirmLab()}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-stone-500 transition-colors hover:bg-white/70 hover:text-stone-700 max-sm:min-h-11"
                    >
                      <RotateCcw size={12} /> ยกเลิกการยืนยัน
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="min-w-0 flex-1 text-sm text-stone-600">
                    {canLab
                      ? labFiles.length === 0
                        ? "อัพไฟล์ผลตรวจอย่างน้อย 1 ไฟล์ก่อน จึงจะยืนยันผลแลบได้"
                        : "ตรวจไฟล์ครบแล้ว? ยืนยันเพื่อส่งต่อให้ Admin นัดคิวลูกค้า"
                      : "ทีม Lab ยังไม่ยืนยันผล"}
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
          </>
        ) : (
          <StatusLine
            icon={<FlaskConical size={16} />}
            label="ผลแลบ:"
            value={
              labConfirmed
                ? `ยืนยันแล้ว ${formatDate(customer.lab_confirmed_at)} · ${labFiles.length} ไฟล์`
                : `รอทีม Lab อัพผล (ตอนนี้ ${labFiles.length} ไฟล์)`
            }
            tone={labConfirmed ? "ok" : "warn"}
          />
        )}

        {/* ---------- ขั้น 3: คิวนัด ---------- */}
        {seeAppointments ? (
          <section className="glass overflow-hidden rounded-xl">
            <header className="flex flex-wrap items-center gap-2 border-b border-white/60 px-4 py-3">
              <ClipboardList size={16} className="text-brand-500" />
              <h2 className="text-base font-semibold text-stone-800">
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
              <p className="px-4 py-5 text-[13px] text-stone-400">
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
                        <span className="text-[15px] font-semibold text-stone-800">
                          {formatDate(a.appt_date)}
                        </span>
                        <span className="text-sm text-stone-600">
                          {apptRangeLabel(a.start_time, a.duration_hours)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {a.note && (
                        <p className="mt-1 text-[13px] text-stone-500">{a.note}</p>
                      )}
                      {canAdmin && !completed && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {a.status === "scheduled" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void setApptStatus(a.id, "done")}
                                className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 max-sm:min-h-11"
                              >
                                มาแล้ว · เสร็จ
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void setApptStatus(a.id, "cancelled")
                                }
                                className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-50 max-sm:min-h-11"
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
                              className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-50 max-sm:min-h-11"
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
        ) : (
          <StatusLine
            icon={<CalendarClock size={16} />}
            label="คิวพบแพทย์:"
            value={
              nextAppt
                ? `${formatDate(nextAppt.appt_date)} · ${apptRangeLabel(
                    nextAppt.start_time,
                    nextAppt.duration_hours
                  )}`
                : labConfirmed
                  ? "รอ Admin โทรนัด"
                  : "ยังไม่ถึงขั้นนัด"
            }
            tone={nextAppt ? "ok" : "quiet"}
          />
        )}

        {/* ---------- ขั้น 4: จัดการเคส (Admin เท่านั้น) ---------- */}
        {canAdmin && (
          <section className="glass overflow-hidden rounded-xl px-4 py-3.5">
            <h2 className="text-base font-semibold text-stone-800">จัดการเคส</h2>
            <p className="mt-1 text-[13px] text-stone-500">
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
      </div>

      {editOpen && (
        <CustomerFormModal
          customer={customer}
          uid={uid}
          onClose={() => setEditOpen(false)}
          onSaved={(row) => setState((s) => ({ ...s, customer: row }))}
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
