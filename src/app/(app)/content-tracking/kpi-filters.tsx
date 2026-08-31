"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Input, Modal } from "@/components/ui";
import { CONTENT_FORMATS } from "@/lib/constants";
import type { ContentCategoryRow, ContentFormat } from "@/lib/types";
import {
  type KpiEvent,
  WORK_STATE_ORDER,
  WORK_STATES,
  type WorkState,
  workStateOf,
} from "./kpi-utils";

/**
 * ตัวกรองของแดชบอร์ด KPI — **ปุ่มเดียวเปิดแผงรวม** (ผู้ใช้ 2026-08-29)
 *
 * แพตเทิร์นเดียวกับตัวกรองของ Hunting/Follow Up: type + ค่าเริ่มต้น + ตัวตัดสินแถวเดียว
 * (`matchKpiEvent`) + ชิปสรุปที่ปลดทีละอันได้ + ตัวนับ — รวมไว้ไฟล์เดียวเพราะ
 * tracking-client ยาวมากแล้ว และหน้าอื่นหยิบไปใช้ต่อได้
 *
 * **5 กลุ่มเท่านั้น อย่าเพิ่มพร่ำเพรื่อ** (กติกาเดียวกับ Hunting): ช่วงเวลา · การโพส ·
 * สถานะงาน · ประเภทชิ้นงาน · หมวดเนื้อหา
 *
 * แผงเป็น `Modal` ของระบบ (= bottom sheet บนมือถือ) ไม่ใช่ `useAnchoredMenu` เพราะเนื้อใน
 * ยาวเกินเมนูลอย และ Modal ล็อค scroll พื้นหลัง/ปิดด้วย Esc ให้อยู่แล้ว
 */

/* ---------- ชนิดข้อมูล ---------- */

export type KpiRange = "mtd" | "month" | "7d" | "14d" | "30d" | "custom";
export type KpiPosted = "all" | "posted" | "unposted";
/** "none" = ยังไม่ระบุ (ใช้ทั้งฟอร์แมตและหมวด) */
export type KpiFormatKey = ContentFormat | "none";

export type KpiFilters = {
  range: KpiRange;
  /** ใช้เมื่อ range === "custom" — เป็น "วันที่ของเดือนที่กำลังดู" (1-based) */
  fromDay: number;
  toDay: number;
  posted: KpiPosted;
  /** ว่าง = ทุกสถานะ (เลือกแล้ว = เห็นเฉพาะผลงานฐาน "ส่งงาน" เพราะฐานอื่นไม่มีคิวตรวจ) */
  states: WorkState[];
  /** ว่าง = ทุกประเภท */
  formats: KpiFormatKey[];
  /** ว่าง = ทุกหมวด — เก็บเป็น category id, "none" = ยังไม่ระบุหมวด */
  categories: string[];
};

/**
 * ค่าเริ่มต้น = **วันที่ 1 ถึงวันนี้** (คำสั่งผู้ใช้ 2026-08-29) — เดือนปัจจุบันจึงเห็น
 * ตัวเลขเท่าเดิมเป๊ะ (วันหลังวันนี้ยังไม่มีผลงานอยู่แล้ว) ส่วนเดือนที่ผ่านมา = ทั้งเดือน
 */
export const DEFAULT_KPI_FILTERS: KpiFilters = {
  range: "mtd",
  fromDay: 1,
  toDay: 31,
  posted: "all",
  states: [],
  formats: [],
  categories: [],
};

export const KPI_RANGE_ORDER: KpiRange[] = [
  "mtd",
  "month",
  "7d",
  "14d",
  "30d",
  "custom",
];

const RANGE_LABEL: Record<KpiRange, string> = {
  mtd: "วันที่ 1 – วันนี้",
  month: "ทั้งเดือน",
  "7d": "7 วันล่าสุด",
  "14d": "14 วันล่าสุด",
  "30d": "30 วันล่าสุด",
  custom: "เลือกช่วงเอง",
};

const POSTED_LABEL: Record<KpiPosted, string> = {
  all: "ทั้งหมด",
  posted: "โพสแล้ว",
  unposted: "ยังไม่โพส",
};

export const KPI_POSTED_ORDER: KpiPosted[] = ["all", "posted", "unposted"];

/* ---------- ช่วงวัน ---------- */

/** ข้อมูลของเดือนที่กำลังดู — มาจาก `computeKpiMonth` */
export type KpiRangeCtx = {
  daysInMonth: number;
  elapsedDays: number;
};

/** ช่วงวันที่ตัวกรองแปลออกมาแล้ว (วันที่ของเดือน 1-based, รวมปลายทั้งสองข้าง) */
export type KpiDayRange = { from: number; to: number };

/**
 * แปลง preset เป็นช่วงวันจริงของเดือนที่ดูอยู่
 *
 * "วันสุดท้าย" = วันนี้ (เดือนปัจจุบัน) หรือวันสิ้นเดือน (เดือนที่ผ่านมา) — **เดือนอนาคต
 * `elapsedDays` เป็น 0 ต้องตกไปใช้ทั้งเดือน** ไม่งั้น mtd กลายเป็นช่วงว่างแล้วหน้าดูเหมือนพัง
 */
export function resolveKpiRange(f: KpiFilters, ctx: KpiRangeCtx): KpiDayRange {
  const clamp = (n: number) => Math.min(ctx.daysInMonth, Math.max(1, n));
  const last =
    ctx.elapsedDays > 0
      ? Math.min(ctx.elapsedDays, ctx.daysInMonth)
      : ctx.daysInMonth;
  switch (f.range) {
    case "month":
      return { from: 1, to: ctx.daysInMonth };
    case "7d":
      return { from: clamp(last - 6), to: clamp(last) };
    case "14d":
      return { from: clamp(last - 13), to: clamp(last) };
    case "30d":
      return { from: clamp(last - 29), to: clamp(last) };
    case "custom": {
      const a = clamp(f.fromDay);
      const b = clamp(f.toDay);
      return a <= b ? { from: a, to: b } : { from: b, to: a };
    }
    default:
      return { from: 1, to: clamp(last) };
  }
}

/** ช่วงนี้กินทั้งเดือนหรือเปล่า — ใช้ตัดสินว่าจะหรี่ช่องปฏิทินนอกช่วงไหม */
export function isFullMonthRange(r: KpiDayRange, daysInMonth: number): boolean {
  return r.from <= 1 && r.to >= daysInMonth;
}

/* ---------- ตัวตัดสิน ---------- */

/**
 * event นี้ผ่านตัวกรองไหม — **ตัวตัดสินแถวเดียวของทั้งหน้า** (ทุก memo ต้องเรียกตัวนี้
 * ห้ามเขียนเงื่อนไขซ้ำเอง ไม่งั้นตัวเลขบนแผงขวากับปฏิทินจะไม่ตรงกัน)
 *
 * ฟอร์แมต/หมวด อ่านจากช่องดิบของการ์ด (`content_format`/`content_category_id`) ให้ตรงกับ
 * ปุ่มเตือน "ระบุประเภทไม่ครบ" — ไม่ใช้ `kpiFormatOf` ที่เดาฟอร์แมตของ Brief ให้
 */
export function matchKpiEvent(
  e: KpiEvent,
  f: KpiFilters,
  range: KpiDayRange
): boolean {
  const day = e.dayIndex + 1;
  if (day < range.from || day > range.to) return false;
  if (f.posted === "posted" && e.t.posted_at === null) return false;
  if (f.posted === "unposted" && e.t.posted_at !== null) return false;
  if (f.states.length > 0) {
    // สถานะการตรวจมีความหมายเฉพาะผลงานที่เจ้าของส่งตรวจเอง — ฐาน brief/posted ไม่มีคิวตรวจ
    if (e.basis !== "work") return false;
    if (!f.states.includes(workStateOf(e.t))) return false;
  }
  if (f.formats.length > 0 && !f.formats.includes(e.t.content_format ?? "none"))
    return false;
  if (
    f.categories.length > 0 &&
    !f.categories.includes(e.t.content_category_id ?? "none")
  )
    return false;
  return true;
}

/** จำนวน "กลุ่ม" ที่ไม่ใช่ค่าเริ่มต้น — เลขบนปุ่มตัวกรอง */
export function kpiFilterCount(f: KpiFilters): number {
  let n = 0;
  if (f.range !== DEFAULT_KPI_FILTERS.range) n += 1;
  if (f.posted !== "all") n += 1;
  if (f.states.length > 0) n += 1;
  if (f.formats.length > 0) n += 1;
  if (f.categories.length > 0) n += 1;
  return n;
}

/* ---------- ชิปสรุป ---------- */

export type KpiFilterChip = { key: string; label: string; next: KpiFilters };

/**
 * ชิปของตัวกรองที่เปิดอยู่ — **ต้องโชว์ข้างปุ่มเสมอ กดกากบาทปลดทีละอันได้**
 * (บทเรียนจาก my-tasks/Hunting: ตัวกรองที่ซ่อนในแผงทำให้คนคิดว่าข้อมูลหาย)
 */
export function kpiFilterChips(
  f: KpiFilters,
  opts: { range: KpiDayRange; categoryName: (id: string) => string }
): KpiFilterChip[] {
  const out: KpiFilterChip[] = [];
  if (f.range !== DEFAULT_KPI_FILTERS.range)
    out.push({
      key: "range",
      label:
        f.range === "month"
          ? "ทั้งเดือน"
          : `วันที่ ${opts.range.from}–${opts.range.to}`,
      next: { ...f, range: DEFAULT_KPI_FILTERS.range },
    });
  if (f.posted !== "all")
    out.push({
      key: "posted",
      label: POSTED_LABEL[f.posted],
      next: { ...f, posted: "all" },
    });
  for (const s of f.states)
    out.push({
      key: `state:${s}`,
      label: WORK_STATES[s].short,
      next: { ...f, states: f.states.filter((x) => x !== s) },
    });
  for (const k of f.formats)
    out.push({
      key: `format:${k}`,
      label: k === "none" ? "ยังไม่ระบุประเภท" : CONTENT_FORMATS[k].label,
      next: { ...f, formats: f.formats.filter((x) => x !== k) },
    });
  for (const c of f.categories)
    out.push({
      key: `cat:${c}`,
      label: c === "none" ? "ยังไม่ระบุหมวด" : opts.categoryName(c),
      next: { ...f, categories: f.categories.filter((x) => x !== c) },
    });
  return out;
}

/* ---------- UI ---------- */

const toggle = <T,>(list: T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** ชิปเลือกในแผง — สูง 44px บนจอเล็กตามกติกาเป้านิ้ว */
function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm transition-colors sm:min-h-9 ${
        on
          ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
          : "border-stone-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-stone-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** ชิปสรุปตัวกรองที่เปิดอยู่ (กดกากบาท = ปลดอันนั้น) */
export function KpiActiveChips({
  chips,
  onChange,
}: {
  chips: KpiFilterChip[];
  onChange: (next: KpiFilters) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.next)}
          title="เอาตัวกรองนี้ออก"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 sm:min-h-8"
        >
          {c.label}
          <X size={12} />
        </button>
      ))}
    </>
  );
}

/** ปุ่ม "ตัวกรอง" + แผงรวมทุกกลุ่ม */
export function KpiFilterButton({
  filters,
  onChange,
  categories,
  daysInMonth,
  range,
  resultCount,
}: {
  filters: KpiFilters;
  onChange: (next: KpiFilters) => void;
  categories: ContentCategoryRow[];
  daysInMonth: number;
  range: KpiDayRange;
  /** จำนวนผลงานที่เหลือหลังกรอง — โชว์บนปุ่มปิดแผง */
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const count = kpiFilterCount(filters);
  const catOptions = categories.filter(
    (c) => c.active || filters.categories.includes(c.id)
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="ตัวกรอง KPI"
        className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors sm:min-h-9 ${
          count > 0
            ? "border-brand-400 bg-brand-50 text-brand-700"
            : "border-stone-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:text-brand-700"
        }`}
      >
        <SlidersHorizontal size={15} />
        ตัวกรอง
        {count > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-bold tabular-nums text-white">
            {count}
          </span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="ตัวกรอง KPI">
        <div className="space-y-4">
          <Group title="ช่วงเวลา (ในเดือนที่ดูอยู่)">
            {KPI_RANGE_ORDER.map((r) => (
              <Chip
                key={r}
                on={filters.range === r}
                onClick={() =>
                  onChange({
                    ...filters,
                    range: r,
                    // เปิดโหมดเลือกเองครั้งแรก = เริ่มจากช่วงที่กำลังดูอยู่ ไม่ใช่ 1–31
                    fromDay: r === "custom" ? range.from : filters.fromDay,
                    toDay: r === "custom" ? range.to : filters.toDay,
                  })
                }
              >
                {RANGE_LABEL[r]}
              </Chip>
            ))}
            {filters.range === "custom" && (
              <div className="mt-1 flex w-full items-center gap-2">
                <span className="text-xs text-stone-500">วันที่</span>
                <Input
                  type="number"
                  min={1}
                  max={daysInMonth}
                  value={filters.fromDay}
                  onChange={(e) =>
                    onChange({ ...filters, fromDay: Number(e.target.value) })
                  }
                  className="w-20"
                  aria-label="วันเริ่มต้น"
                />
                <span className="text-xs text-stone-500">ถึง</span>
                <Input
                  type="number"
                  min={1}
                  max={daysInMonth}
                  value={filters.toDay}
                  onChange={(e) =>
                    onChange({ ...filters, toDay: Number(e.target.value) })
                  }
                  className="w-20"
                  aria-label="วันสิ้นสุด"
                />
              </div>
            )}
          </Group>

          <Group title="การโพส">
            {KPI_POSTED_ORDER.map((p) => (
              <Chip
                key={p}
                on={filters.posted === p}
                onClick={() => onChange({ ...filters, posted: p })}
              >
                {POSTED_LABEL[p]}
              </Chip>
            ))}
          </Group>

          <Group title="สถานะงาน (เฉพาะผลงานที่ส่งตรวจเอง)">
            {WORK_STATE_ORDER.map((s) => (
              <Chip
                key={s}
                on={filters.states.includes(s)}
                onClick={() =>
                  onChange({ ...filters, states: toggle(filters.states, s) })
                }
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${WORK_STATES[s].dot}`}
                />
                {WORK_STATES[s].label}
              </Chip>
            ))}
          </Group>

          <Group title="ประเภทชิ้นงาน">
            {(["image", "video", "none"] as const).map((k) => (
              <Chip
                key={k}
                on={filters.formats.includes(k)}
                onClick={() =>
                  onChange({ ...filters, formats: toggle(filters.formats, k) })
                }
              >
                {k === "none" ? "ยังไม่ระบุ" : CONTENT_FORMATS[k].label}
              </Chip>
            ))}
          </Group>

          <Group title="หมวดเนื้อหา">
            {catOptions.map((c) => (
              <Chip
                key={c.id}
                on={filters.categories.includes(c.id)}
                onClick={() =>
                  onChange({
                    ...filters,
                    categories: toggle(filters.categories, c.id),
                  })
                }
              >
                {c.name}
              </Chip>
            ))}
            <Chip
              on={filters.categories.includes("none")}
              onClick={() =>
                onChange({
                  ...filters,
                  categories: toggle(filters.categories, "none"),
                })
              }
            >
              ยังไม่ระบุ
            </Chip>
          </Group>
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-stone-100 pt-3">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_KPI_FILTERS)}
            disabled={count === 0}
            className="min-h-11 cursor-pointer rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-100 disabled:cursor-default disabled:text-stone-300 disabled:hover:bg-transparent sm:min-h-9"
          >
            ล้างตัวกรอง
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto min-h-11 cursor-pointer rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-sm font-semibold text-white shadow-sm active:scale-[0.97] sm:min-h-9"
          >
            ดูผลลัพธ์ {resultCount} ชิ้น
          </button>
        </div>
      </Modal>
    </>
  );
}
