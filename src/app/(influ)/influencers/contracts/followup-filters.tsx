"use client";

/**
 * ตัวกรองของหน้า Follow Up — ปุ่มเดียว กดแล้วขึ้นเมนูรวมตัวกรองทั้งหมด
 * (ผู้ใช้ 2026-08-29: "ทำให้ตัวการติดตามมีปุ่มรวม filter แล้วกดปุ่มก็มี filter setting
 *  popup ตรงปุ่มให้กดเลือกได้")
 *
 * กติกาเดียวกับ hunting-filters:
 * - เมนูลอยผ่าน useAnchoredMenu + portal z-[60] เสมอ (ห้ามเขียน listener เอง —
 *   คีย์บอร์ดมือถือยิง resize แล้วเมนูจะหุบก่อนกดเลือกได้)
 * - ตัวกรองที่เปิดอยู่ต้องเห็นเป็น "ชิปสรุป" ข้างปุ่มเสมอ + ปิดทีละอันได้
 * - helper ที่อ่านเวลาปัจจุบันอยู่ระดับโมดูล (กฎ react-hooks/purity)
 * - ไม่จำค่าใน localStorage — เปิดหน้ามาต้องเห็นทุกเคสที่ยังอยู่ในสัญญา
 */

import { SlidersHorizontal, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FilterSheet } from "@/components/filter-sheet";
import {
  menuBox,
  useAnchoredMenu,
  type MenuBox,
} from "@/components/anchored-menu";
import { Select } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INFLU_POST_PLATFORM_ORDER,
  INFLU_POST_PLATFORMS,
} from "@/lib/influ-constants";
import type { InfluPostPlatform } from "@/lib/types";
import {
  TRACK_STATUS_ORDER,
  TRACK_STATUSES,
  type TrackRow,
  type TrackStatus,
} from "./followup-utils";

/* ---------- ชนิดข้อมูล + ค่าเริ่มต้น ---------- */

export type StartRange = "all" | "30d" | "90d" | "180d" | "custom";
export type ContractLife = "all" | "ending" | "expired" | "active";

export type FollowFilters = {
  /** ว่าง = ทุกสถานะ */
  statuses: TrackStatus[];
  /** "all" | "mine" | user id */
  owner: string;
  /** ช่วงวันเริ่มนับสัญญา */
  start: StartRange;
  startFrom: string;
  startTo: string;
  /** วันเดียว (yyyy-mm-dd) — ตั้งจากการกดช่องใน heatmap */
  day: string;
  /** ช่องทางที่ "ตั้งเป้าไว้" */
  platforms: InfluPostPlatform[];
  life: ContractLife;
};

export const DEFAULT_FOLLOW_FILTERS: FollowFilters = {
  statuses: [],
  owner: "all",
  start: "all",
  startFrom: "",
  startTo: "",
  day: "",
  platforms: [],
  life: "all",
};

const START_LABELS: Record<StartRange, string> = {
  all: "ทั้งหมด",
  "30d": "30 วันล่าสุด",
  "90d": "90 วันล่าสุด",
  "180d": "6 เดือนล่าสุด",
  custom: "กำหนดเอง",
};

const LIFE_LABELS: Record<ContractLife, string> = {
  all: "ทั้งหมด",
  active: "ยังไม่หมดอายุ",
  ending: "ใกล้หมด (≤30 วัน)",
  expired: "หมดอายุแล้ว",
};

/* ---------- helper เวลา (module-level — เรียก Date.now() ได้ตามกฎ purity) ---------- */

const DAY_MS = 86_400_000;
const BKK_OFFSET = 7 * 3600 * 1000;

function daysAgoBangkok(days: number): string {
  return new Date(Date.now() + BKK_OFFSET - days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function startRange(f: FollowFilters): { from: string | null; to: string | null } {
  switch (f.start) {
    case "30d":
      return { from: daysAgoBangkok(29), to: null };
    case "90d":
      return { from: daysAgoBangkok(89), to: null };
    case "180d":
      return { from: daysAgoBangkok(179), to: null };
    case "custom":
      return { from: f.startFrom || null, to: f.startTo || null };
    default:
      return { from: null, to: null };
  }
}

/* ---------- logic (pure) ---------- */

export function followFilterCount(f: FollowFilters): number {
  return (
    (f.statuses.length ? 1 : 0) +
    (f.owner !== "all" ? 1 : 0) +
    (f.start !== "all" ? 1 : 0) +
    (f.day !== "" ? 1 : 0) +
    (f.platforms.length ? 1 : 0) +
    (f.life !== "all" ? 1 : 0)
  );
}

/** กลุ่มสถานะที่ต้อง render ในลิสต์ — ไม่เลือก = ทุกสถานะ */
export function followStatusGroups(f: FollowFilters): TrackStatus[] {
  return f.statuses.length
    ? TRACK_STATUS_ORDER.filter((s) => f.statuses.includes(s))
    : TRACK_STATUS_ORDER;
}

export function matchFollowFilters(
  r: TrackRow,
  f: FollowFilters,
  meId: string | null
): boolean {
  if (f.statuses.length && !f.statuses.includes(r.status)) return false;

  if (f.owner !== "all") {
    const want = f.owner === "mine" ? meId : f.owner;
    const owner = r.influ.owner_id ?? r.influ.created_by;
    if (!want || owner !== want) return false;
  }

  if (f.day && r.start !== f.day) return false;

  const { from, to } = startRange(f);
  if (from && r.start < from) return false;
  if (to && r.start > to) return false;

  if (f.platforms.length && !f.platforms.some((p) => (r.quotas[p] ?? 0) > 0))
    return false;

  if (f.life === "expired" && !r.expired) return false;
  if (f.life === "active" && r.expired) return false;
  if (f.life === "ending" && (r.expired || r.daysLeft > 30)) return false;

  return true;
}

/** ชิปสรุปตัวกรองที่เปิดอยู่ — next = ค่าตัวกรองหลังกดปิดชิปนั้น */
export function followFilterChips(
  f: FollowFilters,
  peopleById: Map<string, string>
): { key: string; label: string; next: FollowFilters }[] {
  const out: { key: string; label: string; next: FollowFilters }[] = [];

  if (f.statuses.length) {
    const labels = TRACK_STATUS_ORDER.filter((s) => f.statuses.includes(s)).map(
      (s) => TRACK_STATUSES[s].label
    );
    out.push({
      key: "statuses",
      label:
        labels.length > 2
          ? `สถานะ ${labels.length} แบบ`
          : `สถานะ: ${labels.join(", ")}`,
      next: { ...f, statuses: [] },
    });
  }
  if (f.owner !== "all") {
    out.push({
      key: "owner",
      label:
        f.owner === "mine"
          ? "เคสของฉัน"
          : `ผู้รับผิดชอบ: ${peopleById.get(f.owner) ?? "ไม่ทราบชื่อ"}`,
      next: { ...f, owner: "all" },
    });
  }
  if (f.day) {
    out.push({
      key: "day",
      label: `เข้ามาวันที่ ${formatDate(f.day)}`,
      next: { ...f, day: "" },
    });
  }
  if (f.start !== "all") {
    const { from, to } = startRange(f);
    out.push({
      key: "start",
      label:
        f.start === "custom"
          ? `เริ่มสัญญา ${from ?? "…"} – ${to ?? "…"}`
          : `เริ่มสัญญา ${START_LABELS[f.start]}`,
      next: { ...f, start: "all", startFrom: "", startTo: "" },
    });
  }
  if (f.platforms.length) {
    const labels = f.platforms.map((p) => INFLU_POST_PLATFORMS[p].label);
    out.push({
      key: "platforms",
      label:
        labels.length > 2
          ? `ช่องทาง ${labels.length} แบบ`
          : `ตั้งเป้า: ${labels.join(", ")}`,
      next: { ...f, platforms: [] },
    });
  }
  if (f.life !== "all") {
    out.push({
      key: "life",
      label: LIFE_LABELS[f.life],
      next: { ...f, life: "all" },
    });
  }
  return out;
}

/* ---------- UI ---------- */

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-stone-100 px-3 py-2.5 first:border-t-0">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {title}
      </p>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors active:scale-[0.97] max-sm:min-h-11 max-sm:px-3 max-sm:text-sm ${
        active
          ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- เนื้อในของตัวกรอง — ใช้ร่วม 2 ที่ ----------
   จอ ≥sm = เมนู popup ยึดปุ่ม · จอเล็ก = แผ่นเลื่อนขึ้นจากขอบล่าง (FilterSheet)
   ตามคำสั่งผู้ใช้ 2026-08-30 (แพตเทิร์นเดียวกับบอร์ด Hunting) */
function FollowFilterBody({
  filters,
  onChange,
  people,
  meId,
  statusCounts,
}: {
  filters: FollowFilters;
  onChange: (f: FollowFilters) => void;
  people: { id: string; name: string }[];
  meId: string | null;
  statusCounts: Record<TrackStatus, number>;
}) {
  const set = (patch: Partial<FollowFilters>) =>
    onChange({ ...filters, ...patch });
  return (
    <>
      <Section title="สถานะการติดตาม">
        <div className="flex flex-wrap gap-1.5">
          {TRACK_STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={filters.statuses.includes(s)}
              onClick={() =>
                set({ statuses: toggle(filters.statuses, s) })
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${TRACK_STATUSES[s].dot}`}
              />
              {TRACK_STATUSES[s].label}
              <span className="tabular-nums text-stone-400">
                {statusCounts[s] ?? 0}
              </span>
            </FilterChip>
          ))}
        </div>
        {filters.statuses.length === 0 && (
          <p className="mt-1.5 text-[11px] text-stone-400">
            ไม่เลือก = แสดงทุกสถานะ
          </p>
        )}
      </Section>

      <Section title="ผู้รับผิดชอบ">
        <Select
          value={filters.owner}
          onChange={(e) => set({ owner: e.target.value })}
          aria-label="กรองตามผู้รับผิดชอบ"
        >
          <option value="all">ทุกคน</option>
          {meId && <option value="mine">เคสของฉัน</option>}
          {people
            .filter((p) => p.id !== meId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </Section>

      <Section title="วันเริ่มนับสัญญา (วันที่ influ เข้ามา)">
        <div className="flex flex-wrap gap-1.5">
          {(
            ["all", "30d", "90d", "180d", "custom"] as StartRange[]
          ).map((k) => (
            <FilterChip
              key={k}
              active={filters.start === k}
              onClick={() => set({ start: k })}
            >
              {START_LABELS[k]}
            </FilterChip>
          ))}
        </div>
        {filters.start === "custom" && (
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="date"
              value={filters.startFrom}
              onChange={(e) => set({ startFrom: e.target.value })}
              aria-label="เริ่มสัญญาตั้งแต่วันที่"
              className="min-w-0 flex-1 rounded-lg border border-stone-300/80 bg-white px-2 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm"
            />
            <span className="shrink-0 text-xs text-stone-400">ถึง</span>
            <input
              type="date"
              value={filters.startTo}
              onChange={(e) => set({ startTo: e.target.value })}
              aria-label="เริ่มสัญญาถึงวันที่"
              className="min-w-0 flex-1 rounded-lg border border-stone-300/80 bg-white px-2 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm"
            />
          </div>
        )}
        {filters.day && (
          <p className="mt-1.5 text-[11px] text-brand-600">
            เลือกวันเดียวจากปฏิทินอยู่: {formatDate(filters.day)} —{" "}
            <button
              type="button"
              onClick={() => set({ day: "" })}
              className="cursor-pointer underline underline-offset-2"
            >
              ล้าง
            </button>
          </p>
        )}
      </Section>

      <Section title="ช่องทางที่ตั้งเป้าไว้">
        <div className="flex flex-wrap gap-1.5">
          {INFLU_POST_PLATFORM_ORDER.filter((p) => p !== "other").map(
            (p) => (
              <FilterChip
                key={p}
                active={filters.platforms.includes(p)}
                onClick={() =>
                  set({ platforms: toggle(filters.platforms, p) })
                }
              >
                {INFLU_POST_PLATFORMS[p].label}
              </FilterChip>
            )
          )}
        </div>
      </Section>

      <Section title="อายุสัญญา">
        <div className="flex flex-wrap gap-1.5">
          {(
            ["all", "active", "ending", "expired"] as ContractLife[]
          ).map((k) => (
            <FilterChip
              key={k}
              active={filters.life === k}
              onClick={() => set({ life: k })}
            >
              {LIFE_LABELS[k]}
            </FilterChip>
          ))}
        </div>
      </Section>
    </>
  );
}

export function FollowFilterButton({
  filters,
  onChange,
  people,
  meId,
  statusCounts,
  resultCount,
}: {
  filters: FollowFilters;
  onChange: (f: FollowFilters) => void;
  people: { id: string; name: string }[];
  meId: string | null;
  statusCounts: Record<TrackStatus, number>;
  /** จำนวนเคสหลังกรอง — โชว์บนปุ่มปิดแผ่นของจอเล็ก */
  resultCount: number;
}) {
  /* **state ของ popup (≥sm) กับแผ่นของจอเล็กต้องแยกกัน** — เหตุผลเดียวกับ HuntFilterButton:
     FilterSheet ปิดตัวเองที่ ≥sm (จะลาก popup ปิดตาม) และ useAnchoredMenu นับการแตะในแผ่น
     ว่าเป็น "แตะนอกเมนู" (คนละ portal) แล้วหุบแผ่นก่อนที่ click จะถึงชิป */
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const place = (a: HTMLElement) =>
    setBox(menuBox(a, { width: 344, maxHeight: 520 }));
  useAnchoredMenu({
    open,
    anchorRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: place,
  });

  const count = followFilterCount(filters);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => {
          // อ่านความกว้างตอน "กด" ไม่ใช่ตอน render — กัน hydration mismatch
          if (window.matchMedia("(max-width: 639.98px)").matches) {
            setSheetOpen((v) => !v);
            return;
          }
          const a = anchorRef.current;
          if (a) place(a);
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open || sheetOpen}
        className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors active:scale-[0.97] max-sm:min-h-11 ${
          count > 0
            ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
            : "border-stone-200 bg-white/70 text-stone-600 hover:border-stone-300"
        }`}
      >
        <SlidersHorizontal size={15} />
        ตัวกรอง
        {count > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-semibold tabular-nums text-white">
            {count}
          </span>
        )}
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label="ตัวกรองหน้า Follow Up"
            style={{
              position: "fixed",
              left: box.x,
              top: box.y,
              width: box.width,
              maxHeight: box.height,
            }}
            className="z-[60] overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white shadow-xl animate-scale-in max-sm:hidden"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white/95 px-3 py-2 backdrop-blur">
              <p className="text-sm font-semibold text-stone-700">ตัวกรอง</p>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange(DEFAULT_FOLLOW_FILTERS)}
                    className="cursor-pointer rounded-lg px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-50 hover:text-brand-700 max-sm:min-h-11 max-sm:text-sm"
                  >
                    ล้างทั้งหมด
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิดตัวกรอง"
                  className="flex cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600 max-sm:h-11 max-sm:w-11 sm:h-7 sm:w-7"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <FollowFilterBody
              filters={filters}
              onChange={onChange}
              people={people}
              meId={meId}
              statusCounts={statusCounts}
            />
          </div>,
          document.body
        )}

      {/* จอเล็ก: แผ่นเลื่อนขึ้นจากขอบล่าง (FilterSheet ซ่อนตัวเองที่ ≥sm) */}
      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClear={() => onChange(DEFAULT_FOLLOW_FILTERS)}
        clearDisabled={count === 0}
        resultCount={resultCount}
        resultNoun="เคส"
      >
        <FollowFilterBody
          filters={filters}
          onChange={onChange}
          people={people}
          meId={meId}
          statusCounts={statusCounts}
        />
      </FilterSheet>
    </>
  );
}
