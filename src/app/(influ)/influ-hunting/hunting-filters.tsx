"use client";

/**
 * ตัวกรองของบอร์ด Hunting — ปุ่มเดียว กดแล้วขึ้นเมนูรวมตัวกรองทั้งหมด
 * (ผู้ใช้ 2026-08-20: "ทำ filter ให้ละเอียดกว่านี้ แต่เป็นปุ่ม Filter กดเสร็จแล้ว
 *  ขึ้น menu filter ทั้งหมดมาให้เลือก ... อย่าฟุ้งเอามาเยอะไป")
 *
 * แทนชิป 3 อันเดิมบนแถบเครื่องมือ (รายชื่อของฉัน / ถึงกำหนดตาม / ปฏิเสธ) ด้วย
 * 7 กลุ่มที่ใช้จริงบนบอร์ดล่า: สถานะ · ผู้รับผิดชอบ · การตามงาน · วันที่สร้าง ·
 * ช่องทาง · ระดับผู้ติดตาม · ดาวความน่าสนใจ
 *
 * กติกาที่ต้องรักษา:
 * - เมนูลอยผ่าน useAnchoredMenu + portal z-[60] เสมอ (ห้ามเขียน listener เอง —
 *   คีย์บอร์ดมือถือยิง resize แล้วเมนูจะหุบก่อนกดเลือกได้)
 * - ตัวกรองที่เปิดอยู่ต้องเห็นเป็น "ชิปสรุป" ข้างปุ่มเสมอ + ปิดทีละอันได้
 *   (บทเรียน my-tasks: ตัวกรองซ่อนงานหมดแล้วผู้ใช้ไม่รู้ว่าซ่อนอยู่ = คิดว่าข้อมูลหาย)
 * - statuses ว่าง = ค่าเริ่มต้น "4 สถานะที่ยังเดินอยู่" (ปฏิเสธซ่อน) — เลือกเองเมื่อไหร่
 *   กลุ่มที่แสดงจะตามที่เลือกเป๊ะ (huntStatusGroups)
 */

import { SlidersHorizontal, Star, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FilterSheet } from "@/components/filter-sheet";
import {
  menuBox,
  useAnchoredMenu,
  type MenuBox,
} from "@/components/anchored-menu";
import { Select } from "@/components/ui";
import {
  INFLU_CHANNEL_PLATFORMS,
  INFLU_PROSPECT_ACTIVE,
  INFLU_PROSPECT_COLUMNS,
  INFLU_PROSPECT_STATUS_ORDER,
  INFLU_PROSPECT_STATUSES,
  INFLU_TIER_ORDER,
  INFLU_TIERS,
  tierFromFollowers,
} from "@/lib/influ-constants";
import type {
  InfluProspectRow,
  InfluProspectStatus,
  InfluTier,
} from "@/lib/types";
import { followupOverdue } from "./prospect-panel";

/* ---------- ชนิดข้อมูล + ค่าเริ่มต้น ---------- */

export type HuntCreatedRange = "all" | "7d" | "30d" | "90d" | "custom";
export type HuntFollowupFilter = "all" | "overdue" | "scheduled" | "none";

export type HuntFilters = {
  /** ว่าง = 4 สถานะที่ยังเดินอยู่ (ปฏิเสธซ่อน) */
  statuses: InfluProspectStatus[];
  /** "all" | "mine" | user id */
  owner: string;
  followup: HuntFollowupFilter;
  created: HuntCreatedRange;
  /** ใช้เมื่อ created === "custom" (yyyy-mm-dd) */
  createdFrom: string;
  createdTo: string;
  /** ชื่อแพลตฟอร์ม (เทียบแบบไม่สนตัวพิมพ์ — platform เป็น text อิสระ) */
  platforms: string[];
  tiers: InfluTier[];
  /** 0 = ไม่กรอง, 1-5 = ดาวตั้งแต่ N ขึ้นไป */
  minRating: number;
};

export const DEFAULT_HUNT_FILTERS: HuntFilters = {
  statuses: [],
  owner: "all",
  followup: "all",
  created: "all",
  createdFrom: "",
  createdTo: "",
  platforms: [],
  tiers: [],
  minRating: 0,
};

const CREATED_LABELS: Record<HuntCreatedRange, string> = {
  all: "ทั้งหมด",
  "7d": "7 วันล่าสุด",
  "30d": "30 วันล่าสุด",
  "90d": "90 วันล่าสุด",
  custom: "กำหนดเอง",
};

const FOLLOWUP_LABELS: Record<HuntFollowupFilter, string> = {
  all: "ทั้งหมด",
  overdue: "ถึงกำหนดตามแล้ว",
  scheduled: "มีนัดตามแล้ว",
  none: "ยังไม่ตั้งนัดตาม",
};

/* ---------- helper เวลา (module-level — เรียก Date.now() ได้ตามกฎ purity) ---------- */

const DAY_MS = 86_400_000;
const BKK_OFFSET = 7 * 3600 * 1000;

/** timestamptz → วัน yyyy-mm-dd เวลาไทย (วิธีเดียวกับ todayBangkok ใน prospect-panel) */
function bangkokDay(iso: string): string {
  return new Date(new Date(iso).getTime() + BKK_OFFSET)
    .toISOString()
    .slice(0, 10);
}

function daysAgoBangkok(days: number): string {
  return new Date(Date.now() + BKK_OFFSET - days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** ช่วงวันที่สร้างที่ใช้จริง (null = ไม่จำกัดด้านนั้น) */
function createdRange(f: HuntFilters): {
  from: string | null;
  to: string | null;
} {
  switch (f.created) {
    case "7d":
      return { from: daysAgoBangkok(6), to: null };
    case "30d":
      return { from: daysAgoBangkok(29), to: null };
    case "90d":
      return { from: daysAgoBangkok(89), to: null };
    case "custom":
      return { from: f.createdFrom || null, to: f.createdTo || null };
    default:
      return { from: null, to: null };
  }
}

/* ---------- logic (pure) ---------- */

/** จำนวนกลุ่มตัวกรองที่เปิดอยู่ — ใช้เป็นเลขบนปุ่ม */
export function huntFilterCount(f: HuntFilters): number {
  return (
    (f.statuses.length ? 1 : 0) +
    (f.owner !== "all" ? 1 : 0) +
    (f.followup !== "all" ? 1 : 0) +
    (f.created !== "all" ? 1 : 0) +
    (f.platforms.length ? 1 : 0) +
    (f.tiers.length ? 1 : 0) +
    (f.minRating > 0 ? 1 : 0)
  );
}

/** กลุ่มที่ต้อง render บนบอร์ด — ไม่เลือกสถานะ = 4 สถานะที่ยังเดินอยู่ */
export function huntStatusGroups(f: HuntFilters): InfluProspectStatus[] {
  return f.statuses.length
    ? INFLU_PROSPECT_STATUS_ORDER.filter((s) => f.statuses.includes(s))
    : INFLU_PROSPECT_COLUMNS;
}

/** ผู้รับผิดชอบของรายชื่อ = เจ้าของ ไม่มีก็คนสร้าง (ตรงกับ ownerNameOf บนแถว) */
function ownerIdOf(p: InfluProspectRow): string | null {
  return p.owner_id ?? p.created_by;
}

export function matchHuntFilters(
  p: InfluProspectRow,
  f: HuntFilters,
  meId: string | null
): boolean {
  if (f.statuses.length && !f.statuses.includes(p.status)) return false;

  if (f.owner !== "all") {
    const want = f.owner === "mine" ? meId : f.owner;
    if (!want || ownerIdOf(p) !== want) return false;
  }

  if (f.followup !== "all") {
    const active = INFLU_PROSPECT_ACTIVE.includes(p.status);
    if (
      f.followup === "overdue" &&
      !(active && followupOverdue(p.next_followup_on))
    )
      return false;
    if (f.followup === "scheduled" && !(active && p.next_followup_on !== null))
      return false;
    if (f.followup === "none" && !(active && p.next_followup_on === null))
      return false;
  }

  const { from, to } = createdRange(f);
  if (from || to) {
    const day = bangkokDay(p.created_at);
    if (from && day < from) return false;
    if (to && day > to) return false;
  }

  if (f.platforms.length) {
    const want = new Set(f.platforms.map((s) => s.trim().toLowerCase()));
    if (!p.channels.some((c) => want.has(c.platform.trim().toLowerCase())))
      return false;
  }

  if (f.tiers.length) {
    const tier = p.followers != null ? tierFromFollowers(p.followers) : null;
    if (!tier || !f.tiers.includes(tier)) return false;
  }

  if (f.minRating > 0 && p.rating < f.minRating) return false;

  return true;
}

/** ชิปสรุปตัวกรองที่เปิดอยู่ — next = ค่าตัวกรองหลังกดปิดชิปนั้น */
export function huntFilterChips(
  f: HuntFilters,
  peopleById: Map<string, string>
): { key: string; label: string; next: HuntFilters }[] {
  const out: { key: string; label: string; next: HuntFilters }[] = [];

  if (f.statuses.length) {
    const labels = INFLU_PROSPECT_STATUS_ORDER.filter((s) =>
      f.statuses.includes(s)
    ).map((s) => INFLU_PROSPECT_STATUSES[s].label);
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
          ? "รายชื่อของฉัน"
          : `ผู้รับผิดชอบ: ${peopleById.get(f.owner) ?? "ไม่ทราบชื่อ"}`,
      next: { ...f, owner: "all" },
    });
  }
  if (f.followup !== "all") {
    out.push({
      key: "followup",
      label: FOLLOWUP_LABELS[f.followup],
      next: { ...f, followup: "all" },
    });
  }
  if (f.created !== "all") {
    const { from, to } = createdRange(f);
    out.push({
      key: "created",
      label:
        f.created === "custom"
          ? `สร้าง ${from ?? "…"} – ${to ?? "…"}`
          : `สร้าง ${CREATED_LABELS[f.created]}`,
      next: { ...f, created: "all", createdFrom: "", createdTo: "" },
    });
  }
  if (f.platforms.length) {
    out.push({
      key: "platforms",
      label:
        f.platforms.length > 2
          ? `ช่องทาง ${f.platforms.length} แบบ`
          : `ช่องทาง: ${f.platforms.join(", ")}`,
      next: { ...f, platforms: [] },
    });
  }
  if (f.tiers.length) {
    const labels = INFLU_TIER_ORDER.filter((t) => f.tiers.includes(t)).map(
      (t) => INFLU_TIERS[t].label
    );
    out.push({
      key: "tiers",
      label:
        labels.length > 2
          ? `ระดับ ${labels.length} แบบ`
          : `ระดับ: ${labels.join(", ")}`,
      next: { ...f, tiers: [] },
    });
  }
  if (f.minRating > 0) {
    out.push({
      key: "rating",
      label: `ดาว ${f.minRating} ขึ้นไป`,
      next: { ...f, minRating: 0 },
    });
  }
  return out;
}

/** รวมช่องทางที่มีในข้อมูลจริงเข้ากับตัวเลือกมาตรฐาน (platform เป็น text อิสระ) */
export function platformOptionsOf(items: InfluProspectRow[]): string[] {
  const seen = new Map<string, string>();
  for (const preset of INFLU_CHANNEL_PLATFORMS)
    seen.set(preset.toLowerCase(), preset);
  for (const p of items)
    for (const c of p.channels) {
      const name = c.platform.trim();
      if (name && !seen.has(name.toLowerCase()))
        seen.set(name.toLowerCase(), name);
    }
  return [...seen.values()];
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
   จอ ≥sm = เมนู popup ยึดปุ่ม (useAnchoredMenu) · จอเล็ก = แผ่นเลื่อนขึ้นจากขอบล่าง
   (FilterSheet) ตามคำสั่งผู้ใช้ 2026-08-30 — แยกออกมาเป็น component เดียวกัน
   ไม่งั้นตัวกรองแตกเป็นสองสำเนาแล้วหลุดกันแน่ */
function HuntFilterBody({
  filters,
  onChange,
  people,
  meId,
  platformOptions,
  statusCounts,
  overdueCount,
}: {
  filters: HuntFilters;
  onChange: (f: HuntFilters) => void;
  people: { id: string; name: string }[];
  meId: string | null;
  platformOptions: string[];
  statusCounts: Record<InfluProspectStatus, number>;
  overdueCount: number;
}) {
  const set = (patch: Partial<HuntFilters>) => onChange({ ...filters, ...patch });
  return (
    <>
      {/* สถานะ — ว่าง = 4 สถานะที่ยังเดินอยู่ (ปฏิเสธซ่อนตามค่าเริ่มต้นเดิม) */}
      <Section title="สถานะ">
        <div className="flex flex-wrap gap-1.5">
          {INFLU_PROSPECT_STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={filters.statuses.includes(s)}
              onClick={() => set({ statuses: toggle(filters.statuses, s) })}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${INFLU_PROSPECT_STATUSES[s].dot}`}
              />
              {INFLU_PROSPECT_STATUSES[s].label}
              <span className="tabular-nums text-stone-400">
                {statusCounts[s] ?? 0}
              </span>
            </FilterChip>
          ))}
        </div>
        {filters.statuses.length === 0 && (
          <p className="mt-1.5 text-[11px] text-stone-400">
            ไม่เลือก = แสดง 4 สถานะที่ยังเดินอยู่ (ซ่อนที่ปฏิเสธ)
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
          {meId && <option value="mine">รายชื่อของฉัน</option>}
          {people
            .filter((p) => p.id !== meId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </Section>

      <Section title="การตามงาน">
        <div className="flex flex-wrap gap-1.5">
          {(
            ["all", "overdue", "scheduled", "none"] as HuntFollowupFilter[]
          ).map((k) => (
            <FilterChip
              key={k}
              active={filters.followup === k}
              onClick={() => set({ followup: k })}
            >
              {FOLLOWUP_LABELS[k]}
              {k === "overdue" && overdueCount > 0 && (
                <span className="tabular-nums text-stone-400">
                  {overdueCount}
                </span>
              )}
            </FilterChip>
          ))}
        </div>
      </Section>

      <Section title="วันที่สร้างรายชื่อ">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "7d", "30d", "90d", "custom"] as HuntCreatedRange[]).map(
            (k) => (
              <FilterChip
                key={k}
                active={filters.created === k}
                onClick={() => set({ created: k })}
              >
                {CREATED_LABELS[k]}
              </FilterChip>
            )
          )}
        </div>
        {filters.created === "custom" && (
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="date"
              value={filters.createdFrom}
              onChange={(e) => set({ createdFrom: e.target.value })}
              aria-label="สร้างตั้งแต่วันที่"
              className="min-w-0 flex-1 rounded-lg border border-stone-300/80 bg-white px-2 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm"
            />
            <span className="shrink-0 text-xs text-stone-400">ถึง</span>
            <input
              type="date"
              value={filters.createdTo}
              onChange={(e) => set({ createdTo: e.target.value })}
              aria-label="สร้างถึงวันที่"
              className="min-w-0 flex-1 rounded-lg border border-stone-300/80 bg-white px-2 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm"
            />
          </div>
        )}
      </Section>

      <Section title="ช่องทาง">
        <div className="flex flex-wrap gap-1.5">
          {platformOptions.map((name) => (
            <FilterChip
              key={name}
              active={filters.platforms.includes(name)}
              onClick={() =>
                set({ platforms: toggle(filters.platforms, name) })
              }
            >
              {name}
            </FilterChip>
          ))}
        </div>
      </Section>

      <Section title="ระดับผู้ติดตาม">
        <div className="flex flex-wrap gap-1.5">
          {INFLU_TIER_ORDER.map((t) => (
            <FilterChip
              key={t}
              active={filters.tiers.includes(t)}
              onClick={() => set({ tiers: toggle(filters.tiers, t) })}
            >
              {INFLU_TIERS[t].label}
              <span className="text-[10px] text-stone-400">
                {INFLU_TIERS[t].range}
              </span>
            </FilterChip>
          ))}
        </div>
      </Section>

      <Section title="ดาวความน่าสนใจ">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={filters.minRating === 0}
            onClick={() => set({ minRating: 0 })}
          >
            ทั้งหมด
          </FilterChip>
          {[1, 2, 3, 4, 5].map((n) => (
            <FilterChip
              key={n}
              active={filters.minRating === n}
              onClick={() => set({ minRating: n })}
            >
              <Star size={11} className="fill-amber-400 text-amber-400" />
              {n} ขึ้นไป
            </FilterChip>
          ))}
        </div>
      </Section>
    </>
  );
}

export function HuntFilterButton({
  filters,
  onChange,
  people,
  meId,
  platformOptions,
  statusCounts,
  overdueCount,
  resultCount,
}: {
  filters: HuntFilters;
  onChange: (f: HuntFilters) => void;
  people: { id: string; name: string }[];
  meId: string | null;
  platformOptions: string[];
  statusCounts: Record<InfluProspectStatus, number>;
  overdueCount: number;
  /** จำนวนรายชื่อหลังกรอง — โชว์บนปุ่มปิดแผ่นของจอเล็ก */
  resultCount: number;
}) {
  /* **state ของเมนู popup (≥sm) กับแผ่นของจอเล็กต้องแยกกันเด็ดขาด** — ใช้ตัวเดียวกันแล้วพังทั้งคู่:
     (1) FilterSheet ปิดตัวเองทันทีเมื่อจอ ≥sm ⇒ popup ของเดสก์ท็อปถูกปิดในเฟรมเดียวกับที่เพิ่งเปิด
     (2) useAnchoredMenu ปิดเมนูเมื่อ pointerdown นอก menuRef ⇒ แตะชิปในแผ่น (คนละ portal)
         ถูกนับเป็น "แตะข้างนอก" แผ่นหุบก่อน click จะยิงถึงชิป */
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

  const count = huntFilterCount(filters);

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
            aria-label="ตัวกรองบอร์ด Hunting"
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
                    onClick={() => onChange(DEFAULT_HUNT_FILTERS)}
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

            <HuntFilterBody
              filters={filters}
              onChange={onChange}
              people={people}
              meId={meId}
              platformOptions={platformOptions}
              statusCounts={statusCounts}
              overdueCount={overdueCount}
            />
          </div>,
          document.body
        )}

      {/* จอเล็ก: แผ่นเลื่อนขึ้นจากขอบล่าง (FilterSheet ซ่อนตัวเองที่ ≥sm) */}
      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClear={() => onChange(DEFAULT_HUNT_FILTERS)}
        clearDisabled={count === 0}
        resultCount={resultCount}
        resultNoun="รายชื่อ"
      >
        <HuntFilterBody
          filters={filters}
          onChange={onChange}
          people={people}
          meId={meId}
          platformOptions={platformOptions}
          statusCounts={statusCounts}
          overdueCount={overdueCount}
        />
      </FilterSheet>
    </>
  );
}
