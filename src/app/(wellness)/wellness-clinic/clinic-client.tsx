"use client";

import { CalendarDays, Clock, Search, Stethoscope, X } from "lucide-react";
import { useState } from "react";
import {
  LabFileOpenLink,
  type LabFileLite,
} from "@/components/wellness/lab-files";
import type {
  WellnessAppointmentRow,
  WellnessCustomerRow,
} from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import {
  WELLNESS_APPT_STATUS,
  apptRangeLabel,
  isWellnessDoctorDay,
  wellnessCustomerName,
} from "@/lib/wellness-constants";

/** รูปเดียวกับที่ CALENDAR_APPT_SELECT ดึงมา (คิว + ข้อมูลลูกค้า + ไฟล์ผลแลบ) */
export type ClinicAppt = WellnessAppointmentRow & {
  customer:
    | (Pick<
        WellnessCustomerRow,
        | "id"
        | "first_name"
        | "last_name"
        | "phone"
        | "procedure_text"
        | "lab_confirmed_at"
        | "completed_at"
      > & { lab_files: LabFileLite[] })
    | null;
};

/** การ์ดคิว 1 คิว — เวลา + คนไข้ + ผลเลือดที่เปิดอ่านได้ทันที */
function ApptCard({ appt, muted }: { appt: ClinicAppt; muted?: boolean }) {
  const meta = WELLNESS_APPT_STATUS[appt.status];
  const files = appt.customer?.lab_files ?? [];
  return (
    <li
      className={`rounded-xl border border-white/70 bg-white/60 px-4 py-3 ${
        muted ? "opacity-75" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Clock size={14} className="text-brand-500" />
          {apptRangeLabel(appt.start_time, appt.duration_hours)}
        </span>
        <span className="text-sm text-stone-700">
          {appt.customer
            ? wellnessCustomerName(appt.customer)
            : "(การ์ดลูกค้าถูกลบ)"}
        </span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
        {appt.customer?.procedure_text && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Stethoscope size={11} className="shrink-0 text-stone-400" />
            <span className="truncate">{appt.customer.procedure_text}</span>
          </span>
        )}
        {appt.note && <span className="text-stone-500">“{appt.note}”</span>}
      </div>

      <div className="mt-2 border-t border-white/70 pt-2">
        <p className="text-[11px] font-medium text-stone-500">
          ผลตรวจเลือด ({files.length} ไฟล์)
          {appt.customer && !appt.customer.lab_confirmed_at && (
            <span className="ml-1 text-amber-700">· ทีม Lab ยังไม่ยืนยันผล</span>
          )}
        </p>
        {files.length === 0 ? (
          <p className="mt-1 text-xs text-stone-400">ยังไม่มีไฟล์ผลตรวจ</p>
        ) : (
          <ul className="mt-0.5 divide-y divide-white/70">
            {files.map((f) => (
              <LabFileOpenLink key={f.id} file={f} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/** กล่องกลุ่มคิว 1 กลุ่ม (วันนี้ / กำลังจะถึง / ที่ผ่านมา) */
function ApptGroup({
  title,
  hint,
  items,
  emptyText,
  muted,
  groupByDate,
}: {
  title: string;
  hint?: string;
  items: ClinicAppt[];
  emptyText: string;
  muted?: boolean;
  groupByDate?: boolean;
}) {
  const days = groupByDate
    ? Array.from(new Set(items.map((a) => a.appt_date)))
    : [];
  return (
    <section className="glass overflow-hidden rounded-xl">
      <header className="flex flex-wrap items-baseline gap-x-2 border-b border-white/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
        <span className="text-xs text-stone-400">{items.length} คิว</span>
        {hint && (
          <span className="basis-full text-xs text-stone-400 sm:basis-auto sm:before:mx-1 sm:before:content-['·']">
            {hint}
          </span>
        )}
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-xs text-stone-400">{emptyText}</p>
      ) : groupByDate ? (
        <div className="space-y-3 px-3 py-3">
          {days.map((d) => (
            <div key={d}>
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-stone-600">
                <CalendarDays size={12} className="text-stone-400" />
                {formatDate(d)}
                {isWellnessDoctorDay(d) ? (
                  <span className="text-[11px] text-brand-600">
                    · วันแพทย์เข้า
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-600">
                    · ไม่ใช่วันแพทย์เข้าปกติ
                  </span>
                )}
              </p>
              <ul className="space-y-2">
                {items
                  .filter((a) => a.appt_date === d)
                  .map((a) => (
                    <ApptCard key={a.id} appt={a} muted={muted} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2 px-3 py-3">
          {items.map((a) => (
            <ApptCard key={a.id} appt={a} muted={muted} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * หน้าทำงานของแพทย์ — **คิวตรวจ** (Stage 4 ของ flow)
 *
 * อ่านอย่างเดียวทั้งหน้า: ดูว่าวันนี้ต้องตรวจใคร แล้วกดเปิดผลเลือดของคนนั้นได้เลย
 * (ปฏิทินทั้งเดือนอยู่อีกเมนูหนึ่ง — ที่นี่ตอบคำถามเดียวคือ "วันนี้ตรวจใครบ้าง")
 */
export function ClinicClient({
  appointments,
  today,
}: {
  appointments: ClinicAppt[];
  /** วันนี้ตามเวลาไทย — คำนวณจาก server เพื่อให้ SSR/CSR ตรงกัน */
  today: string;
}) {
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const matched = q
    ? appointments.filter((a) =>
        `${a.customer?.first_name ?? ""} ${a.customer?.last_name ?? ""} ${
          a.customer?.procedure_text ?? ""
        }`
          .toLowerCase()
          .includes(q)
      )
    : appointments;

  const live = matched.filter((a) => a.status !== "cancelled");
  const todayList = live.filter((a) => a.appt_date === today);
  const upcoming = live.filter(
    (a) => a.appt_date > today && a.status === "scheduled"
  );
  // ที่ผ่านมา: วันล่าสุดขึ้นก่อน แต่ในวันเดียวกันยังไล่ตามเวลาเหมือนตารางจริง
  const past = live
    .filter((a) => a.appt_date < today)
    .sort((a, b) =>
      a.appt_date === b.appt_date
        ? a.start_time.localeCompare(b.start_time)
        : b.appt_date.localeCompare(a.appt_date)
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อคนไข้"
              className="glass w-full rounded-full border border-white/60 py-2 pl-9 pr-4 text-base text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-300 sm:text-sm"
            />
          </div>
          <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 sm:ml-auto">
            วันนี้ {todayList.length} คิว · {formatDate(today)}
          </span>
        </div>

        {q && matched.length === 0 && appointments.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
            ไม่พบคิวที่ตรงกับ “{search}”
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-11"
            >
              <X size={12} /> ล้างคำค้น
            </button>
          </div>
        )}

        <div className="space-y-4">
          <ApptGroup
            title="คิววันนี้"
            hint="กดชื่อไฟล์เพื่อเปิดผลเลือดของคนไข้"
            items={todayList}
            emptyText="วันนี้ไม่มีคิวตรวจ"
          />
          <ApptGroup
            title="คิวที่จะถึง"
            items={upcoming}
            emptyText="ยังไม่มีคิวในวันถัดไป"
            groupByDate
          />
          {past.length > 0 && (
            <ApptGroup
              title="ตรวจไปแล้ว (30 วันล่าสุด)"
              items={past}
              emptyText="ไม่มี"
              muted
              groupByDate
            />
          )}
        </div>
      </div>
    </div>
  );
}
