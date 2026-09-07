"use client";

/**
 * Section แรกของหน้า Follow Up — ปฏิทิน heatmap + สรุปการติดตาม
 *
 * แทนกล่อง stats 4 ใบเดิม (ผู้ใช้ 2026-08-29: "กินพื้นที่เยอะมากแต่ละกล่องแสดงแค่ 1 data
 * ทำใหม่ให้เน้นทำเป็นตาราง heatmap ที่มีประโยชน์ เช่น เป็นตารางปฏิทินขนาดย่อม
 * เพื่อให้เห็นว่า influ ที่เข้ามา (คือวันที่สัญญาถูกอัพโหลดเริ่มนับสัญญา)
 * แล้ว case ของวันไหนที่มีการติดตามส่วนที่เรา force แล้วบ้าง")
 *
 * ⇒ 1 ช่อง = 1 วันตาม `contract_start` · สีของช่อง = ความคืบหน้าเป้าโพสคลิป
 *   (ส่วนที่ force) ของเคสที่เข้ามาวันนั้น · กดช่อง = กรองลิสต์ด้านล่างเหลือวันนั้น
 */

import { CalendarRange, Target } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import {
  cellsByDate,
  HEAT_CELL,
  HEAT_LEGEND,
  heatLevelOf,
  monthGrids,
  monthLabel,
  TRACK_STATUS_ORDER,
  TRACK_STATUSES,
  type TrackRow,
  type TrackStatus,
} from "./followup-utils";

const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

const HEATMAP_RANGES: { key: number; label: string }[] = [
  { key: 3, label: "3 เดือน" },
  { key: 6, label: "6 เดือน" },
  { key: 12, label: "12 เดือน" },
];

export function FollowupHeatmap({
  rows,
  today,
  months,
  onMonthsChange,
  selectedDay,
  onSelectDay,
  statusFilter,
  onToggleStatus,
}: {
  /** ทุกเคสที่เริ่มนับสัญญาแล้ว — ไม่ผูกกับตัวกรองของลิสต์ (ภาพรวมต้องนิ่ง) */
  rows: TrackRow[];
  today: string;
  months: number;
  onMonthsChange: (m: number) => void;
  /** วันที่ถูกเลือกอยู่ (ตัวกรอง day) — "" = ไม่ได้เลือก */
  selectedDay: string;
  onSelectDay: (day: string) => void;
  /** สถานะที่กรองอยู่ (จากตัวกรองรวม) — แถวสรุปกดสลับได้ */
  statusFilter: TrackStatus[];
  onToggleStatus: (s: TrackStatus) => void;
}) {
  const cells = useMemo(() => cellsByDate(rows), [rows]);
  const grids = useMemo(
    () => monthGrids(today.slice(0, 7), months),
    [today, months]
  );

  /* จอเล็กเรียงเดือนแนวนอนแบบ snap (1 เดือน = 1 หน้า) แทนการซ้อนลงมาจนสูงหลายจอ
     — เปิดมาต้องอยู่ที่ "เดือนล่าสุด" ซึ่ง monthGrids วางไว้ท้ายสุด ไม่ใช่เดือนเก่าสุด
     จอ ≥sm กางเป็น flex-wrap ไม่มี scroll แนวนอน คำสั่งนี้จึงไม่มีผลกับเดสก์ท็อป */
  const monthsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = monthsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [grids]);

  const totals = useMemo(() => {
    const byStatus = {
      overdue: 0,
      noquota: 0,
      ontrack: 0,
      complete: 0,
      expired: 0,
    } as Record<TrackStatus, number>;
    let quota = 0;
    let met = 0;
    let expected = 0;
    for (const r of rows) {
      byStatus[r.status] += 1;
      quota += r.quotaTotal;
      met += r.metCount;
      expected += r.expectedByNow;
    }
    return { byStatus, quota, met, expected };
  }, [rows]);

  const pct = totals.quota > 0 ? (totals.met / totals.quota) * 100 : 0;
  const expectedPct =
    totals.quota > 0 ? (totals.expected / totals.quota) * 100 : 0;

  return (
    <section className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
      {/* ---------- ปฏิทิน heatmap ---------- */}
      <div className="glass min-w-0 rounded-2xl p-4 animate-fade-in-up">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
            <CalendarRange size={15} className="text-brand-500" />
            วันที่ influ เข้ามา (เริ่มนับสัญญา)
          </h2>
          <p className="min-w-0 flex-1 text-xs text-stone-400">
            สีของช่อง = ความคืบหน้าการลงคลิปตามเป้า · กดช่องเพื่อดูเฉพาะเคสวันนั้น
            {/* บอกวิธีดูเดือนอื่นเฉพาะจอเล็ก — ที่นั่นเดือนเรียงแนวนอนไม่ได้กางให้เห็นครบ */}
            <span className="sm:hidden"> · ปัดซ้าย-ขวาเพื่อดูเดือนอื่น</span>
          </p>
          {/* จอเล็ก: ปุ่มช่วงเดือนกินเต็มแถวและแบ่งกันคนละส่วน — เป้านิ้วกว้างพอกดไม่พลาด */}
          <div className="flex gap-1 rounded-full bg-stone-100/80 p-1 max-sm:w-full">
            {HEATMAP_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onMonthsChange(r.key)}
                className={`cursor-pointer rounded-full px-3 py-1 font-medium transition-all active:scale-[0.97] max-sm:min-h-11 max-sm:flex-1 max-sm:text-sm sm:text-xs ${
                  months === r.key
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                    : "text-stone-500 hover:bg-white/70 hover:text-stone-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={monthsRef}
          className="flex gap-x-5 gap-y-4 max-sm:snap-x max-sm:snap-mandatory max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:pb-1 sm:flex-wrap"
        >
          {grids.map((g) => (
            <div
              key={g.key}
              // จอเล็ก: 1 เดือนกว้างเต็มการ์ด = 1 หน้า snap (ช่องวันจึงยังกว้าง ~46px กดง่าย)
              className="min-w-0 max-sm:w-full max-sm:shrink-0 max-sm:snap-start sm:w-auto"
            >
              <p className="mb-1 text-[11px] font-medium text-stone-500">
                {monthLabel(g)}
              </p>
              <div className="grid grid-cols-7 gap-[3px]">
                {WEEKDAYS.map((w, idx) => (
                  <span
                    key={w}
                    className={`text-center text-[9px] leading-4 ${
                      idx === 6 ? "text-rose-400" : "text-stone-300"
                    }`}
                  >
                    {w}
                  </span>
                ))}
                {g.days.map((date, idx) => {
                  if (date === null)
                    return (
                      <span
                        key={`pad-${g.key}-${idx}`}
                        className="aspect-square w-full sm:aspect-auto sm:h-7"
                      />
                    );
                  const day = Number(date.slice(8));
                  const cell = cells.get(date);
                  // วันที่ไม่มี influ เข้ามา = ช่องเปล่า ไม่ต้องเป็นปุ่ม
                  // (กด/โฟกัสไปก็ไม่มีอะไรให้ดู — ปฏิทินนี้เต็มไปด้วยวันว่าง)
                  if (!cell)
                    return (
                      <span
                        key={date}
                        className={`flex aspect-square w-full items-center justify-center rounded-md tabular-nums max-sm:text-xs sm:aspect-auto sm:h-7 sm:w-7 sm:text-[10px] ${HEAT_CELL.empty} ${
                          date === today ? "ring-1 ring-stone-400" : ""
                        }`}
                      >
                        {day}
                      </span>
                    );
                  const count = cell.rows.length;
                  const selected = date === selectedDay;
                  const met = cell.rows.reduce((s, r) => s + r.metCount, 0);
                  const quota = cell.rows.reduce((s, r) => s + r.quotaTotal, 0);
                  const title = `${formatDate(date)} — ${count} เคสเข้ามา · ลงคลิปแล้ว ${met}/${quota} โพส${
                    cell.unset > 0 ? ` · ยังไม่ตั้งเป้า ${cell.unset} เคส` : ""
                  }`;
                  return (
                    <button
                      key={date}
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={selected}
                      onClick={() => onSelectDay(selected ? "" : date)}
                      className={`flex aspect-square w-full cursor-pointer items-center justify-center rounded-md font-medium tabular-nums transition-all hover:scale-110 hover:shadow-sm max-sm:text-xs sm:aspect-auto sm:h-7 sm:w-7 sm:text-[10px] ${HEAT_CELL[heatLevelOf(cell)]} ${
                        selected
                          ? "ring-2 ring-brand-500 ring-offset-1"
                          : date === today
                            ? "ring-1 ring-stone-400"
                            : ""
                      }`}
                    >
                      <span className="flex flex-col items-center leading-none">
                        <span>{day}</span>
                        {count > 1 && (
                          <span className="opacity-80 max-sm:text-[10px] sm:text-[8px]">
                            ×{count}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-brand-100/60 pt-2.5">
          <span className="text-[11px] text-stone-400">ความคืบหน้าคลิป:</span>
          {HEAT_LEGEND.map((l) => (
            <span
              key={l.level}
              className="inline-flex items-center gap-1 text-[11px] text-stone-500"
            >
              <span className={`h-3 w-3 rounded ${HEAT_CELL[l.level]}`} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- สรุปการติดตาม (แทนกล่อง 4 ใบเดิม) ---------- */}
      <div className="glass rounded-2xl p-4 animate-fade-in-up">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Target size={15} className="text-brand-500" />
          คลิปตามสัญญา (ส่วนที่ต้องตาม)
        </h2>

        <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-900">
          {formatNumber(totals.met)}
          <span className="text-base font-normal text-stone-400">
            {" "}
            / {formatNumber(totals.quota)} โพส
          </span>
        </p>
        <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-stone-200/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
          {totals.quota > 0 && (
            <span
              title={`เป้าที่ควรได้ ณ วันนี้ ${formatNumber(totals.expected)} โพส`}
              className="absolute top-0 h-full w-0.5 bg-stone-600/70"
              style={{ left: `${Math.min(100, expectedPct)}%` }}
            />
          )}
        </div>
        <p className="mt-1 text-[11px] text-stone-400">
          ขีดเข้ม = เป้าที่ควรได้ ณ วันนี้ ({formatNumber(totals.expected)} โพส)
        </p>

        <div className="mt-3 space-y-1 border-t border-brand-100/60 pt-2.5">
          {TRACK_STATUS_ORDER.map((s) => {
            const meta = TRACK_STATUSES[s];
            const active = statusFilter.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onToggleStatus(s)}
                title={meta.hint}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors active:scale-[0.98] max-sm:min-h-11 ${
                  active ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-white/70"
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                <span
                  className={`min-w-0 flex-1 truncate max-sm:text-sm sm:text-xs ${
                    active ? "font-medium text-brand-700" : "text-stone-600"
                  }`}
                >
                  {meta.label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-800">
                  {formatNumber(totals.byStatus[s])}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2 border-t border-brand-100/60 pt-2 text-[11px] text-stone-400">
          รวม {formatNumber(rows.length)} เคสที่เริ่มนับสัญญาแล้ว ·
          เช็คพอยต์รูปผลลัพธ์ยังบันทึกได้ในแผงติดตาม แต่ไม่ถูกนับเป็นตัวบังคับ
        </p>
      </div>
    </section>
  );
}
