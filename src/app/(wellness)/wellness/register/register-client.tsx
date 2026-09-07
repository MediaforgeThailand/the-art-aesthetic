"use client";

import {
  CalendarClock,
  Pencil,
  Phone,
  Plus,
  Search,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { CustomerFormModal } from "@/components/wellness/customer-form";
import { WellnessStatusChip } from "@/components/wellness/stage-tracker";
import type {
  WellnessAppointmentRow,
  WellnessCustomerRow,
} from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import {
  WELLNESS_STATUS,
  apptRangeLabel,
  wellnessCustomerName,
  wellnessStatusOf,
} from "@/lib/wellness-constants";

export type RegisterApptLite = Pick<
  WellnessAppointmentRow,
  "customer_id" | "appt_date" | "start_time" | "duration_hours"
>;

/**
 * หน้าทำงานของทีม BC — **ทะเบียนลูกค้า** (Stage 1 ของ flow)
 *
 * ทำได้อย่างเดียวคือเพิ่ม/แก้การ์ด ส่วนความคืบหน้าของขั้นอื่น (ผลแลบ/คิวนัด)
 * แสดงเป็น "สถานะอ่านอย่างเดียว" เท่านั้น — ห้ามเอาปุ่มของ Lab/Admin มาไว้ที่นี่
 */
export function RegisterClient({
  customers: customersProp,
  scheduledAppts,
  uid,
}: {
  customers: WellnessCustomerRow[];
  scheduledAppts: RegisterApptLite[];
  uid: string | null;
}) {
  // props → state แบบ adjust-during-render (ทุก mutation จบด้วย router.refresh())
  const [state, setState] = useState({
    base: customersProp,
    customers: customersProp,
  });
  if (state.base !== customersProp) {
    setState({ base: customersProp, customers: customersProp });
  }
  const customers = state.customers;

  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<
    { mode: "create" } | { mode: "edit"; customer: WellnessCustomerRow } | null
  >(null);

  // นัดถัดไปของแต่ละคน — server เรียงวัน+เวลามาแล้ว ตัวแรกที่เจอคือคิวใกล้สุด
  const nextApptByCustomer = useMemo(() => {
    const map = new Map<string, RegisterApptLite>();
    for (const a of scheduledAppts) {
      if (!map.has(a.customer_id)) map.set(a.customer_id, a);
    }
    return map;
  }, [scheduledAppts]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.phone} ${c.procedure_text} ${c.note}`
          .toLowerCase()
          .includes(q)
      )
    : customers;

  const active = filtered.filter((c) => !c.completed_at);
  const closed = filtered.filter((c) => c.completed_at);

  function upsert(row: WellnessCustomerRow) {
    setState((s) => ({
      ...s,
      customers: s.customers.some((c) => c.id === row.id)
        ? s.customers.map((c) => (c.id === row.id ? row : c))
        : [row, ...s.customers],
    }));
  }

  function renderRow(c: WellnessCustomerRow) {
    const appt = nextApptByCustomer.get(c.id);
    const status = wellnessStatusOf(c, !!appt);
    return (
      <li
        key={c.id}
        className="flex items-start gap-3 rounded-2xl bg-white/95 px-3.5 py-3.5 shadow-sm ring-1 ring-stone-200/70"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-base font-semibold text-brand-800">
          {(c.first_name || "?").charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[15px] font-semibold text-stone-800">
              {wellnessCustomerName(c)}
            </span>
            <WellnessStatusChip status={status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone-500">
            {c.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={13} className="text-stone-400" />
                {c.phone}
              </span>
            )}
            {c.procedure_text && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Stethoscope size={13} className="shrink-0 text-stone-400" />
                <span className="truncate">{c.procedure_text}</span>
              </span>
            )}
            {appt && (
              <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                <CalendarClock size={13} />
                {formatDate(appt.appt_date)} ·{" "}
                {apptRangeLabel(appt.start_time, appt.duration_hours)}
              </span>
            )}
            <span className="text-stone-400">
              สร้าง {formatDate(c.created_at)}
            </span>
          </div>
          {!c.completed_at && (
            <p className="mt-1 text-xs text-stone-400">
              ขั้นตอนตอนนี้: {WELLNESS_STATUS[status].hint}
            </p>
          )}
        </div>
        {!c.completed_at && (
          <button
            type="button"
            onClick={() => setFormFor({ mode: "edit", customer: c })}
            title="แก้ไขข้อมูลลูกค้า"
            aria-label={`แก้ไขข้อมูลของ ${wellnessCustomerName(c)}`}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 sm:h-8 sm:w-8"
          >
            <Pencil size={15} />
          </button>
        )}
      </li>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs sm:flex-1">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา"
              className="w-full rounded-full border border-stone-200/80 bg-white/90 py-2.5 pl-10 pr-4 text-base text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <Button
            onClick={() => setFormFor({ mode: "create" })}
            className="sm:ml-auto max-sm:min-h-11"
          >
            <Plus size={16} /> เพิ่มการ์ดลูกค้า
          </Button>
        </div>

        {q && filtered.length === 0 && customers.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[15px] text-amber-800">
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
          <section>
            <header className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
              <h2 className="text-base font-semibold text-stone-800">
                เคสที่กำลังดำเนินการ
              </h2>
              <span className="text-[13px] text-stone-400">{active.length} ใบ</span>
            </header>
            {active.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <UserRound size={32} className="text-stone-300" />
                <p className="text-sm text-stone-500">
                  ยังไม่มีการ์ดที่กำลังดำเนินการ
                </p>
                <p className="text-[13px] text-stone-400">
                  กด “เพิ่มการ์ดลูกค้า” หลังลูกค้าศัลยกรรมตรวจเลือดเสร็จ
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">{active.map(renderRow)}</ul>
            )}
          </section>

          {closed.length > 0 && (
            <section>
              <header className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
                <h2 className="text-base font-semibold text-stone-800">
                  ปิดเคสแล้ว
                </h2>
                <span className="text-[13px] text-stone-400">{closed.length} ใบ</span>
              </header>
              <ul className="space-y-2.5">{closed.map(renderRow)}</ul>
            </section>
          )}
        </div>
      </div>

      {formFor && (
        <CustomerFormModal
          customer={formFor.mode === "edit" ? formFor.customer : null}
          uid={uid}
          onClose={() => setFormFor(null)}
          onSaved={upsert}
        />
      )}
    </div>
  );
}
