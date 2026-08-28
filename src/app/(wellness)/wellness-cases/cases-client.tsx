"use client";

import {
  CalendarClock,
  ChevronRight,
  Phone,
  Search,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { WellnessStatusChip } from "@/components/wellness/stage-tracker";
import type {
  WellnessAppointmentRow,
  WellnessCustomerRow,
} from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import {
  WELLNESS_STATUS,
  WELLNESS_STATUS_ORDER,
  apptRangeLabel,
  wellnessCustomerName,
  wellnessStatusOf,
  type WellnessStatusKey,
} from "@/lib/wellness-constants";

export type ScheduledApptLite = Pick<
  WellnessAppointmentRow,
  "customer_id" | "appt_date" | "start_time" | "duration_hours"
>;

/**
 * ภาพรวมเคสของ Admin — การ์ดลูกค้าจัดกลุ่มตามขั้นของ flow
 *
 * **หน้านี้ไม่มีปุ่มลงมือทำ** โดยตั้งใจ — เป็นหน้า "ดูว่าค้างตรงไหน" แล้วกดเข้าไป
 * ทำงานที่หน้าเคส/หน้าขั้นนั้น (เพิ่มการ์ด = /wellness-register, โทร = /wellness-contact)
 *
 * ดีไซน์ (ผู้ใช้ 2026-08-28: "fonts เล็กจนอ่านยาก · แต่ละบรรทัดดูไม่มีมิติ · เว้นว่างเยอะ"):
 * แถว = **การ์ดขาวมีเงา+ขอบ** ไม่ใช่บรรทัดในตารางแบน, ตัวหนังสือหลัก 15px/เมตา 13px,
 * และ **ซ่อนกลุ่มที่ไม่มีเคส** (เหลือชิปสรุปด้านบนแทน) เพื่อไม่ให้หน้าโล่งเป็นช่วงๆ
 */
export function WellnessCasesClient({
  customers,
  scheduledAppts,
}: {
  customers: WellnessCustomerRow[];
  scheduledAppts: ScheduledApptLite[];
}) {
  const [search, setSearch] = useState("");

  // นัดถัดไปของแต่ละคน — server เรียง วัน+เวลา มาแล้ว ตัวแรกที่เจอคือคิวใกล้สุด
  const nextApptByCustomer = useMemo(() => {
    const map = new Map<string, ScheduledApptLite>();
    for (const a of scheduledAppts) {
      if (!map.has(a.customer_id)) map.set(a.customer_id, a);
    }
    return map;
  }, [scheduledAppts]);

  const statusOf = (c: WellnessCustomerRow): WellnessStatusKey =>
    wellnessStatusOf(c, nextApptByCustomer.has(c.id));

  const q = search.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.phone} ${c.procedure_text} ${c.note}`
          .toLowerCase()
          .includes(q)
      )
    : customers;

  const groups = WELLNESS_STATUS_ORDER.map((key) => ({
    key,
    meta: WELLNESS_STATUS[key],
    items: filtered.filter((c) => statusOf(c) === key),
  }));
  const shown = groups.filter((g) => g.items.length > 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 sm:px-6 sm:pt-6">
        {/* แถบค้นหา */}
        <div className="relative mb-3">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อ / เบอร์ / หัตถการ"
            className="w-full rounded-full border border-stone-200/80 bg-white/90 py-2.5 pl-10 pr-4 text-base text-stone-700 shadow-sm placeholder:text-stone-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {/* ชิปสรุปทุกขั้น — เห็นภาพรวมครบแม้กลุ่มที่ว่างจะถูกซ่อน */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {groups.map(({ key, meta, items }) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-white/80 px-3 py-1.5 text-[13px] ${
                items.length === 0 ? "text-stone-400" : "text-stone-600"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${meta.dot} ${
                  items.length === 0 ? "opacity-40" : ""
                }`}
                aria-hidden
              />
              {meta.label}
              <b className="font-semibold text-stone-800">{items.length}</b>
            </span>
          ))}
        </div>

        {/* ค้นหาแล้วไม่เจอ — ข้อมูลยังอยู่ครบ อย่าปล่อยหน้าโล่งให้เข้าใจผิด */}
        {q && filtered.length === 0 && customers.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[15px] text-amber-800">
            ไม่พบการ์ดที่ตรงกับ “{search}” — การ์ดทั้งหมด {customers.length}{" "}
            ใบยังอยู่ครบ
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-[13px] font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-11"
            >
              <X size={13} /> ล้างคำค้น
            </button>
          </div>
        )}

        <div className="space-y-6">
          {shown.map(({ key, meta, items }) => (
            <section key={key}>
              <header className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
                <span
                  className={`h-2.5 w-2.5 shrink-0 self-center rounded-full ${meta.dot}`}
                  aria-hidden
                />
                <h2 className="text-base font-semibold text-stone-800">
                  {meta.label}
                </h2>
                <span className="text-[13px] text-stone-400">
                  {items.length} ใบ
                </span>
                <span className="basis-full text-[13px] text-stone-400">
                  {meta.hint}
                </span>
              </header>

              <ul className="space-y-2.5">
                {items.map((c) => {
                  const appt = nextApptByCustomer.get(c.id);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/wellness/${c.id}`}
                        className="flex items-center gap-3 rounded-2xl bg-white/95 px-3.5 py-3.5 shadow-sm ring-1 ring-stone-200/70 transition-all duration-200 hover:shadow-md hover:ring-brand-300 active:scale-[0.99]"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-base font-semibold text-brand-800">
                          {(c.first_name || "?").charAt(0)}
                        </span>

                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-[15px] font-semibold text-stone-800">
                              {wellnessCustomerName(c)}
                            </span>
                            <WellnessStatusChip status={key} />
                          </span>

                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone-500">
                            {c.phone && (
                              <span className="inline-flex items-center gap-1.5">
                                <Phone size={13} className="text-stone-400" />
                                {c.phone}
                              </span>
                            )}
                            {c.procedure_text && (
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <Stethoscope
                                  size={13}
                                  className="shrink-0 text-stone-400"
                                />
                                <span className="truncate">
                                  {c.procedure_text}
                                </span>
                              </span>
                            )}
                          </span>

                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400">
                            {appt && (
                              <span className="inline-flex items-center gap-1.5 font-medium text-brand-700">
                                <CalendarClock size={13} />
                                {formatDate(appt.appt_date)} ·{" "}
                                {apptRangeLabel(
                                  appt.start_time,
                                  appt.duration_hours
                                )}
                              </span>
                            )}
                            <span>สร้าง {formatDate(c.created_at)}</span>
                          </span>
                        </span>

                        <ChevronRight
                          size={18}
                          className="shrink-0 text-stone-300"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {customers.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-white/70 px-4 py-10 text-center shadow-sm ring-1 ring-stone-200/70">
            <UserRound size={38} className="text-stone-300" />
            <p className="text-[15px] font-medium text-stone-600">
              ยังไม่มีการ์ดลูกค้าในระบบ
            </p>
            <p className="text-[13px] text-stone-400">
              ทีม BC เป็นผู้สร้างการ์ดที่หน้า “ทะเบียนลูกค้า” หลังลูกค้าตรวจเลือด
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
