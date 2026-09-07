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

import { FilterChip, FilterSection } from "@/influ/components/influ-filter-panel";
import { Select } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INFLU_POST_PLATFORM_ORDER,
  INFLU_POST_PLATFORMS,
} from "@/influ/lib/influ-constants";
import type { InfluPostPlatform } from "@/lib/types";
import {
  TRACK_STATUS_ORDER,
  TRACK_STATUSES,
  type TrackRow,
  type TrackStatus,
} from "./followup-utils";

/* ---------- ชนิดข้อมูล + ค่าเริ่มต้น ---------- */

type StartRange = "all" | "30d" | "90d" | "180d" | "custom";
type ContractLife = "all" | "ending" | "expired" | "active";

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

/** ค่าโรงงาน — เริ่มที่ "เคสของฉัน" ตามกติกาทุกหน้า (ผู้ใช้ 2026-08-29) */
export const DEFAULT_FOLLOW_FILTERS: FollowFilters = {
  statuses: [],
  owner: "mine",
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
    // ผู้รับผิดชอบจริงอยู่ที่ influ_assignees (0099/0104) ไม่ใช่ owner_id ซึ่งแปลว่า "ผู้สร้าง"
    // — ผู้ติดตาม (follower) ที่ไม่ได้สร้างการ์ดเคยไม่เห็นเคสของตัวเองเลยในหน้านี้
    const want = f.owner === "mine" ? meId : f.owner;
    if (!want) return false;
    const mine = r.assignees.some((a) => a.userId === want);
    // "เคสของฉัน" รวมเคสที่ยังไม่มีผู้รับผิดชอบเลยเสมอ (กติกาเดียวกับบอร์ด —
    // งานไม่มีเจ้าภาพต้องเห็นเพื่อไปรับ ไม่ใช่หายไปจากทุกคน)
    if (!mine && !(f.owner === "mine" && r.assignees.length === 0)) return false;
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
          ? "เคสของฉัน + ยังไม่มีผู้รับผิดชอบ"
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

/** เนื้อในแผงตัวกรองหน้า Follow Up — shell ใช้ InfluFilterButton ของกลาง */
export function FollowFilterSections({
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
            <FilterSection title="สถานะการติดตาม">
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
            </FilterSection>

            <FilterSection title="ผู้รับผิดชอบ">
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
            </FilterSection>

            <FilterSection title="วันเริ่มนับสัญญา (วันที่ influ เข้ามา)">
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
            </FilterSection>

            <FilterSection title="ช่องทางที่ตั้งเป้าไว้">
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
            </FilterSection>

            <FilterSection title="อายุสัญญา">
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
            </FilterSection>
    </>
  );
}
