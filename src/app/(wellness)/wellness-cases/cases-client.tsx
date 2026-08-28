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
 * ภาพรวมเคสของ Admin — ลิสต์จัดกลุ่มตามขั้นของ flow
 * (รอผลแลบ → ผลพร้อม·รอนัด → นัดแล้ว → ปิดเคส)
 *
 * **หน้านี้ไม่มีปุ่มลงมือทำ** โดยตั้งใจ — เป็นหน้า "ดูว่าค้างตรงไหน" แล้วกดเข้าไป
 * ทำงานที่หน้าเคส/หน้าขั้นนั้น (เพิ่มการ์ด = /wellness-register, ลงคิว = /wellness-booking)
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-3 py-4 sm:px-6 sm:py-6">
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
              placeholder="ค้นหา ชื่อ / เบอร์ / หัตถการ"
              className="glass w-full rounded-full border border-white/60 py-2 pl-9 pr-4 text-base text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-300 sm:text-sm"
            />
          </div>
          <span className="text-xs text-stone-400 sm:ml-auto">
            ทั้งหมด {customers.length} การ์ด
          </span>
        </div>

        {/* ค้นหาแล้วไม่เจอ — ข้อมูลยังอยู่ครบ อย่าปล่อยหน้าโล่งให้เข้าใจผิด */}
        {q && filtered.length === 0 && customers.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
            ไม่พบการ์ดที่ตรงกับ “{search}” — การ์ดทั้งหมด {customers.length}{" "}
            ใบยังอยู่ครบ
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
          {groups.map(({ key, meta, items }) => (
            <section key={key} className="glass overflow-hidden rounded-xl">
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-white/60 px-4 py-3">
                <span
                  className={`h-2.5 w-2.5 shrink-0 self-center rounded-full ${meta.dot}`}
                  aria-hidden
                />
                <h2 className="text-sm font-semibold text-stone-800">
                  {meta.label}
                </h2>
                <span className="text-xs text-stone-400">{items.length} ใบ</span>
                <span className="basis-full text-xs text-stone-400 sm:basis-auto sm:before:mx-1 sm:before:content-['·']">
                  {meta.hint}
                </span>
              </header>

              {items.length === 0 ? (
                <p className="px-4 py-4 text-xs text-stone-400">
                  ยังไม่มีการ์ดในขั้นนี้
                </p>
              ) : (
                <ul className="divide-y divide-white/60">
                  {items.map((c) => {
                    const appt = nextApptByCustomer.get(c.id);
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/wellness/${c.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/60 active:scale-[0.995]"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-semibold text-brand-800">
                            {(c.first_name || "?").charAt(0)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-medium text-stone-800">
                                {wellnessCustomerName(c)}
                              </span>
                              <WellnessStatusChip status={key} />
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                              {c.phone && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone size={11} className="text-stone-400" />
                                  {c.phone}
                                </span>
                              )}
                              {c.procedure_text && (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <Stethoscope
                                    size={11}
                                    className="shrink-0 text-stone-400"
                                  />
                                  <span className="truncate">
                                    {c.procedure_text}
                                  </span>
                                </span>
                              )}
                              {appt && (
                                <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                                  <CalendarClock size={11} />
                                  {formatDate(appt.appt_date)} ·{" "}
                                  {apptRangeLabel(
                                    appt.start_time,
                                    appt.duration_hours
                                  )}
                                </span>
                              )}
                              <span className="text-stone-400">
                                สร้าง {formatDate(c.created_at)}
                              </span>
                            </span>
                          </span>
                          <ChevronRight
                            size={16}
                            className="shrink-0 text-stone-300"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>

        {customers.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl px-4 py-8 text-center">
            <UserRound size={36} className="text-stone-300" />
            <p className="text-sm font-medium text-stone-600">
              ยังไม่มีการ์ดลูกค้าในระบบ
            </p>
            <p className="text-xs text-stone-400">
              ทีม BC เป็นผู้สร้างการ์ดที่หน้า “ทะเบียนลูกค้า” หลังลูกค้าตรวจเลือด
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
