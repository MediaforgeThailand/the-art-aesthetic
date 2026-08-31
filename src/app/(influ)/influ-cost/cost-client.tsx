"use client";

/**
 * Influencer Cost — สรุปต้นทุนค่าบริการของ influencer รายโปรแกรม
 * — แยก "กำลังจะมา / ยังไม่เคาะวัน / ใช้บริการแล้ว" ตามการเดิน stage ของเคส
 * — แก้ต้นทุน + ติ๊ก "แบรนด์ support" ได้ตรงจากหน้านี้ (รายการ support นับเป็น ฿0)
 * — รายการถูกเพิ่ม/ลบจากแท็บ "รายละเอียดเคส" ของแต่ละเคส (/influencers/[id])
 *
 * เลย์เอาต์ (redesign 2026-08-20 ตามผู้ใช้ "filter เละเทะ ใช้งานยาก ดูไม่สวย"):
 * ไม่มี PageHeader (ชื่อหน้าอยู่บนแถบเมนูของระบบแล้ว) → การ์ดสรุป 4 ใบที่ *กดเป็น
 * ตัวกรองสถานะได้* (แทน dropdown "สถานะ" เดิม) → แถบเครื่องมือแถวเดียว (ค้นหา +
 * ชิปงานค้าง + ปุ่มตัวกรองที่พับ support/ช่วงวัน/เคสเก่าไว้ข้างใน) → ลิสต์เป็นตาราง
 * จัดกลุ่มตามสถานะแบบเดียวกับ Hunting/my-tasks (คอลัมน์ตรงกันทุกแถว อ่านราคาไล่ลง
 * แนวดิ่งได้ — ของเดิมเป็นการ์ด 2 คอลัมน์ที่ราคา/ปุ่ม support ลอยไปคนละที่ทุกแถว)
 *
 * มือถือ (2026-08-30): แถบเครื่องมือเหลือ [ค้นหา][ปุ่มตัวกรอง] — ตัวกรองรองทั้งหมด
 * (รวมชิป "ยังไม่กรอกต้นทุน") ย้ายเข้า `FilterSheet` กลางของระบบ แทน bottom sheet ที่
 * หน้านี้เคยเขียน portal เองซึ่งไม่มีเพดานความสูง/ไม่ล็อค scroll (ตัวกรองยาวแล้วปุ่มตกใต้ fold)
 * ตัวกรองที่เปิดค้างอยู่ถูกสรุปเป็น ActiveFilterChips ใต้แถบ — กดกากบาทปลดทีละอันได้
 */

import {
  ArrowUpRight,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Gift,
  Lock,
  Search,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSyncedState } from "@/lib/use-synced-state";
import {
  DateRangeInputs,
  FilterChip,
  FilterSection,
  FilterSummary,
  InfluFilterButton,
  useInfluFilters,
  type FilterSummaryChip,
} from "@/components/influ-filter-panel";
import { Badge, Card, EmptyState, Select } from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import {
  COST_USAGE_META,
  COST_USAGE_ORDER,
  type CostUsage,
  costUsageOf,
  itemEffectiveCost,
  roundLabel,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluProcedureItemRow } from "@/lib/types";
import {
  CostPriceInput,
  SupportToggle,
} from "../influencers/procedure-items-editor";

/** ข้อมูลเคสที่ join มากับรายการต้นทุน */
export type CostInflu = {
  id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  /** รอบที่เท่าไหร่ของคนนี้ — ต้นทุนแยกรายรอบ ชื่อซ้ำกันได้ต้องบอกรอบกำกับ */
  round_no: number;
  service_date: string | null;
  stage: number;
  /** วันเริ่มนับสัญญา — ตั้งแต่ 0092 นี่คือตัวชี้ว่าเคส "ใช้บริการแล้ว" (ดู costUsageOf) */
  contract_start: string | null;
  completed: boolean;
  archived: boolean;
  declined_at: string | null;
};

export type CostItem = InfluProcedureItemRow & { influencer: CostInflu | null };

type SupportFilter = "all" | "supported" | "unsupported";

/** คอลัมน์ตารางรายการ — ใช้ชุดเดียวทั้งหัวตารางและทุกแถว (เพิ่ม/ลดต้องแก้พร้อมกัน)
    จอ <sm ไม่ใช้กริดนี้ (แถวกลายเป็น flex-wrap) จะได้ไม่ต้องเลื่อนแนวนอนอ่านชื่อ */
const GRID_COLS = "minmax(160px,1fr) 96px 160px 96px";

/** "ยังไม่กรอกต้นทุน" = ไม่ support + ราคา 0 + ไม่ได้ผูก Price List/โปร (0090)
    (แถวที่ผูก Price List/โปร ราคาอ้างอิงจากเมนูและล็อกไว้ — เป็น 0 ก็คือของแถมราคา 0 จริง) */
const isUnpriced = (r: CostItem) =>
  !r.is_supported &&
  Number(r.price) === 0 &&
  !r.price_item_id &&
  !r.promo_package_id;

function influName(i: CostInflu): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

type Group = {
  influ: CostInflu;
  usage: CostUsage;
  items: CostItem[];
  effective: number;
  saved: number;
  unpriced: number;
};

/* ---------- การ์ดสรุปด้านบน (3 ใบขวากดเป็นตัวกรองสถานะได้) ---------- */

function SummaryTile({
  icon: Icon,
  iconClass = "bg-brand-50 text-brand-600",
  label,
  value,
  sub,
  active,
  onClick,
  delay,
  children,
}: {
  icon: typeof Wallet;
  iconClass?: string;
  label: string;
  value: string;
  sub?: string;
  active?: boolean;
  /** ไม่ส่ง = การ์ดอ่านอย่างเดียว (ใบ "ต้นทุนรวม") */
  onClick?: () => void;
  delay?: number;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon size={16} />
        </span>
        <span className="min-w-0 truncate text-xs font-medium text-stone-500">
          {label}
        </span>
      </div>
      <p className="text-[22px] font-bold leading-tight tabular-nums text-stone-900 sm:text-[26px]">
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-stone-400">{sub}</p>}
      {children}
    </>
  );
  return (
    <Card
      className={`animate-fade-in-up p-4 ${active ? "ring-2 ring-brand-300" : ""}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          title={active ? "กดอีกครั้งเพื่อดูทุกสถานะ" : `ดูเฉพาะ "${label}"`}
          className="w-full cursor-pointer text-left transition-transform active:scale-[0.98]"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </Card>
  );
}

/* ---------- ตัวกรองของหน้านี้ ----------
   ผู้ใช้ 2026-08-29: ทุกหน้าเหลือ "ปุ่มตัวกรองปุ่มเดียว" ที่กดแล้วแผงลอยขึ้นมา
   (ของเดิมกระจายเป็น dropdown inline + bottom sheet คนละชุด) */

export type CostFilters = {
  /** "all" | "mine" | uid — ผู้รับผิดชอบเคส (influ_assignees) */
  owner: string;
  usage: "all" | CostUsage;
  support: SupportFilter;
  unpricedOnly: boolean;
  dateFrom: string;
  dateTo: string;
  /** true = รวมเคสเก่าที่นำเข้า (archive) + เคสที่ปฏิเสธ */
  includeOld: boolean;
};

/** ค่าโรงงาน — เริ่มที่ "เคสของฉัน" ตามกติกาทุกหน้า */
export const DEFAULT_COST_FILTERS: CostFilters = {
  owner: "mine",
  usage: "all",
  support: "all",
  unpricedOnly: false,
  dateFrom: "",
  dateTo: "",
  includeOld: false,
};

function costFilterCount(f: CostFilters): number {
  return (
    (f.owner !== "all" ? 1 : 0) +
    (f.usage !== "all" ? 1 : 0) +
    (f.support !== "all" ? 1 : 0) +
    (f.unpricedOnly ? 1 : 0) +
    (f.dateFrom || f.dateTo ? 1 : 0) +
    (f.includeOld ? 1 : 0)
  );
}

function costFilterChips(
  f: CostFilters,
  peopleById: Map<string, string>,
  unpricedCount: number
): FilterSummaryChip<CostFilters>[] {
  const out: FilterSummaryChip<CostFilters>[] = [];
  if (f.owner !== "all")
    out.push({
      key: "owner",
      label:
        f.owner === "mine"
          ? "เคสของฉัน"
          : `ผู้รับผิดชอบ: ${peopleById.get(f.owner) ?? "ไม่ทราบชื่อ"}`,
      next: { ...f, owner: "all" },
    });
  if (f.usage !== "all")
    out.push({
      key: "usage",
      label: COST_USAGE_META[f.usage].label,
      next: { ...f, usage: "all" },
    });
  if (f.support !== "all")
    out.push({
      key: "support",
      label: f.support === "supported" ? "แบรนด์ส่งของ" : "ไม่ได้ของ support",
      next: { ...f, support: "all" },
    });
  if (f.unpricedOnly)
    out.push({
      key: "unpriced",
      label: `ยังไม่กรอกต้นทุน (${unpricedCount})`,
      next: { ...f, unpricedOnly: false },
    });
  if (f.dateFrom || f.dateTo)
    out.push({
      key: "date",
      label: `วันรับบริการ ${f.dateFrom || "…"} – ${f.dateTo || "…"}`,
      next: { ...f, dateFrom: "", dateTo: "" },
    });
  if (f.includeOld)
    out.push({
      key: "old",
      label: "รวมเคสเก่า / ปฏิเสธ",
      next: { ...f, includeOld: false },
    });
  return out;
}

function CostFilterSections({
  filters,
  onChange,
  people,
  meId,
  unpricedCount,
  usageCount,
}: {
  filters: CostFilters;
  onChange: (f: CostFilters) => void;
  people: { id: string; name: string }[];
  meId: string | null;
  unpricedCount: number;
  usageCount: (u: CostUsage) => number;
}) {
  const set = (patch: Partial<CostFilters>) => onChange({ ...filters, ...patch });
  return (
    <>
      <FilterSection
        title="ผู้รับผิดชอบ"
        hint="ค่าเริ่มต้นคือ “เคสของฉัน” — กดบันทึกเป็นค่าเริ่มต้นด้านล่างถ้าอยากเห็นทั้งทีมทุกครั้ง"
      >
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

      <FilterSection title="สถานะการใช้บริการ">
        <div className="flex flex-wrap gap-1.5">
          {COST_USAGE_ORDER.map((u) => (
            <FilterChip
              key={u}
              active={filters.usage === u}
              onClick={() => set({ usage: filters.usage === u ? "all" : u })}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${COST_USAGE_META[u].dot}`} />
              {COST_USAGE_META[u].label}
              <span className="tabular-nums text-stone-400">{usageCount(u)}</span>
            </FilterChip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="ต้นทุน">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={filters.unpricedOnly}
            onClick={() => set({ unpricedOnly: !filters.unpricedOnly })}
            title="รายการที่ทีมยังไม่ได้กรอกต้นทุน (ไม่นับของที่ผูก Price List หรือแบรนด์ support)"
          >
            ยังไม่กรอกต้นทุน
            <span className="tabular-nums text-stone-400">{unpricedCount}</span>
          </FilterChip>
        </div>
      </FilterSection>

      <FilterSection title="แบรนด์ support">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "ทั้งหมด"],
              ["supported", "ได้ของ"],
              ["unsupported", "ไม่ได้"],
            ] as [SupportFilter, string][]
          ).map(([v, label]) => (
            <FilterChip
              key={v}
              active={filters.support === v}
              onClick={() => set({ support: v })}
            >
              {label}
            </FilterChip>
          ))}
        </div>
      </FilterSection>

      <FilterSection
        title="ช่วงวันรับบริการ"
        hint="เคสที่ยังไม่เคาะวันจะไม่เข้าช่วงที่เลือก"
      >
        <DateRangeInputs
          from={filters.dateFrom}
          to={filters.dateTo}
          onFrom={(dateFrom) => set({ dateFrom })}
          onTo={(dateTo) => set({ dateTo })}
          labelFrom="วันรับบริการ ตั้งแต่"
          labelTo="วันรับบริการ ถึง"
        />
      </FilterSection>

      <FilterSection title="ข้อมูลเก่า">
        <FilterChip
          active={filters.includeOld}
          onClick={() => set({ includeOld: !filters.includeOld })}
          title="รวมข้อมูลเก่าที่นำเข้า (archive) และเคสที่ปฏิเสธ"
        >
          รวมเคสเก่า / ปฏิเสธ
        </FilterChip>
      </FilterSection>
    </>
  );
}

/* ---------- แถวรายการ 1 บรรทัด ---------- */

function ItemRow({
  item,
  canEdit,
  onCommitPrice,
  onToggleSupport,
}: {
  item: CostItem;
  canEdit: boolean;
  onCommitPrice: (id: string, price: number) => void;
  onToggleSupport: (id: string) => void;
}) {
  const price = Number(item.price) || 0;
  return (
    <div
      style={{ gridTemplateColumns: GRID_COLS }}
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 transition-colors hover:bg-brand-50/30 sm:grid sm:gap-3 sm:px-4 sm:py-1.5"
    >
      <span
        className="w-full min-w-0 truncate text-sm text-stone-700 sm:w-auto"
        title={`${item.name} — เพิ่มเมื่อ ${formatDate(item.created_at)}`}
      >
        {item.name}
      </span>
      {/* ที่มาราคา — บอกว่าตัวเลขข้างๆ มาจากไหน (ล็อกจาก Price List / ทีมกรอกเอง) */}
      <span className="text-[11px]">
        {isUnpriced(item) ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            ยังไม่กรอก
          </span>
        ) : item.is_supported ? (
          <span className="rounded-full bg-pink-50 px-2 py-0.5 font-medium text-pink-600">
            แบรนด์ส่งของ
          </span>
        ) : item.price_item_id ? (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
            Price List
          </span>
        ) : item.promo_package_id ? (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
            โปร Price List
          </span>
        ) : (
          <span className="text-stone-400">กรอกเอง</span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 justify-end sm:flex-none">
        {item.is_supported ? (
          <span className="text-sm tabular-nums text-pink-600">
            {price > 0 && (
              <span className="mr-1.5 text-stone-300 line-through">
                {formatCurrency(price)}
              </span>
            )}
            ฿0
          </span>
        ) : item.price_item_id || item.promo_package_id ? (
          /* ผูกกับ Price List/โปร = ราคาอ้างอิงจากเมนูกลาง ล็อกไว้ ห้ามกรอกเอง */
          <span
            title="ราคาอ้างอิงจาก Price List — แก้เองไม่ได้ (เปลี่ยนรายการได้ที่แท็บรายละเอียดเคสของเคสนั้น)"
            className="inline-flex items-center gap-1 text-sm tabular-nums text-stone-700"
          >
            <Lock size={11} className="text-stone-300" />
            {formatCurrency(price)}
          </span>
        ) : (
          <CostPriceInput
            value={price}
            disabled={!canEdit}
            onCommit={(n) => onCommitPrice(item.id, n)}
            className="w-full justify-between sm:w-40"
          />
        )}
      </div>
      <div className="flex justify-end">
        <SupportToggle
          on={item.is_supported}
          disabled={!canEdit}
          onToggle={() => onToggleSupport(item.id)}
          compact
        />
      </div>
    </div>
  );
}

/* ---------- หน้าหลัก ---------- */

export function CostClient({
  items,
  assignees,
  people,
  meId,
  canEdit,
  loadError,
}: {
  items: CostItem[];
  /** ผู้รับผิดชอบของทุกเคส (0095) — ตัวกรอง "เคสของฉัน" ของหน้านี้ */
  assignees: { influencer_id: string; user_id: string }[];
  people: { id: string; name: string }[];
  meId: string | null;
  /** ระดับ "ดูเฉยๆ" = แก้ราคา/ติ๊ก support ไม่ได้ (ตัวเลขยังเห็นครบ) */
  canEdit: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // local copy — แก้ราคา/ติ๊ก support แบบ optimistic แล้วค่อย refresh เบื้องหลัง
  // ต้องรับค่าใหม่จาก props ด้วย ไม่งั้น router.refresh() ที่เรียกหลังบันทึกไม่มีผลอะไรเลย
  // (ของที่คนอื่นแก้ไม่ขึ้น และรายการที่ถูกลบในแท็บรายละเอียดเคส ยังค้างเป็นแถวผี)
  const [rows, setRows] = useSyncedState<CostItem[]>(items);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  /* ตัวกรองทั้งหมดอยู่ในปุ่มเดียว + บันทึกค่าเริ่มต้นของตัวเองได้ (กติกาทุกหน้าในระบบ) */
  const filterApi = useInfluFilters<CostFilters>({
    page: "cost",
    userId: meId,
    factory: DEFAULT_COST_FILTERS,
  });
  const { filters } = filterApi;
  const setFilters = filterApi.setFilters;

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people]
  );

  /** ผู้รับผิดชอบต่อเคส (0095) — ตัวกรอง "เคสของฉัน" ของหน้านี้ */
  const ownersByCase = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of assignees) {
      const cur = m.get(a.influencer_id);
      if (cur) cur.push(a.user_id);
      else m.set(a.influencer_id, [a.user_id]);
    }
    return m;
  }, [assignees]);

  const commitPrice = (id: string, price: number) => {
    setErr(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, price } : r)));
    void supabase
      .from("influ_procedure_items")
      .update({ price })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setErr(`บันทึกราคาไม่สำเร็จ: ${error.message}`);
        else router.refresh();
      });
  };

  const toggleSupport = (id: string) => {
    const cur = rows.find((r) => r.id === id);
    if (!cur) return;
    setErr(null);
    const nextVal = !cur.is_supported;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_supported: nextVal } : r))
    );
    void supabase
      .from("influ_procedure_items")
      .update({ is_supported: nextVal })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setErr(`บันทึกสถานะ support ไม่สำเร็จ: ${error.message}`);
        else router.refresh();
      });
  };

  /** ชุดข้อมูลหลังกรองทุกอย่างยกเว้นสถานะการใช้ — ใช้ทั้งการ์ดสรุปและลิสต์ */
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const inf = r.influencer;
      if (!inf) return false;
      if (!filters.includeOld && (inf.archived || inf.declined_at !== null))
        return false;
      if (filters.owner !== "all") {
        const want = filters.owner === "mine" ? meId : filters.owner;
        if (!want || !(ownersByCase.get(inf.id) ?? []).includes(want))
          return false;
      }
      if (filters.support === "supported" && !r.is_supported) return false;
      if (filters.support === "unsupported" && r.is_supported) return false;
      if (filters.unpricedOnly && !isUnpriced(r)) return false;
      if (filters.dateFrom || filters.dateTo) {
        // กรองช่วงวันเข้ารับบริการ — เคสที่ยังไม่เคาะวันไม่เข้าช่วง
        if (!inf.service_date) return false;
        if (filters.dateFrom && inf.service_date < filters.dateFrom) return false;
        if (filters.dateTo && inf.service_date > filters.dateTo) return false;
      }
      if (q) {
        const hay = `${influName(inf)} ${r.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filters, meId, ownersByCase]);

  // สรุปยอดแยกตามสถานะการใช้ (จาก base — ไม่ผูกกับตัวกรองสถานะ ตัวเลขบนการ์ดจึงนิ่ง
  // แม้กำลังกดการ์ดใบใดใบหนึ่งอยู่ ทำให้เทียบยอดข้ามสถานะได้ตลอด)
  const sums = useMemo(() => {
    const s = {
      total: 0,
      used: 0,
      upcoming: 0,
      unscheduled: 0,
      saved: 0,
      supportedCount: 0,
      unpricedCount: 0,
      cases: { used: 0, upcoming: 0, unscheduled: 0 } as Record<
        CostUsage,
        number
      >,
      influIds: new Set<string>(),
    };
    const seenCase = new Set<string>();
    for (const r of base) {
      if (!r.influencer) continue;
      const usage = costUsageOf(r.influencer);
      const eff = itemEffectiveCost(r);
      s.total += eff;
      s[usage] += eff;
      if (r.is_supported) {
        s.saved += Number(r.price) || 0;
        s.supportedCount += 1;
      } else if (isUnpriced(r)) {
        s.unpricedCount += 1;
      }
      s.influIds.add(r.influencer.id);
      if (!seenCase.has(r.influencer.id)) {
        seenCase.add(r.influencer.id);
        s.cases[usage] += 1;
      }
    }
    return s;
  }, [base]);

  // จัดกลุ่มตามเคส แล้วแยกเป็น section ตามสถานะการใช้
  const sections = useMemo(() => {
    const byInflu = new Map<string, Group>();
    for (const r of base) {
      const inf = r.influencer;
      if (!inf) continue;
      const usage = costUsageOf(inf);
      if (filters.usage !== "all" && usage !== filters.usage) continue;
      let g = byInflu.get(inf.id);
      if (!g) {
        g = {
          influ: inf,
          usage,
          items: [],
          effective: 0,
          saved: 0,
          unpriced: 0,
        };
        byInflu.set(inf.id, g);
      }
      g.items.push(r);
      g.effective += itemEffectiveCost(r);
      if (r.is_supported) g.saved += Number(r.price) || 0;
      else if (isUnpriced(r)) g.unpriced += 1;
    }
    const groups = [...byInflu.values()];
    for (const g of groups)
      g.items.sort(
        (a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1)
      );
    return COST_USAGE_ORDER.map((usage) => {
      const list = groups.filter((g) => g.usage === usage);
      // กำลังจะมา = วันใกล้สุดก่อน · ใช้แล้ว = ล่าสุดก่อน · ยังไม่เคาะวัน = รายการเพิ่มล่าสุดก่อน
      if (usage === "upcoming")
        list.sort((a, b) =>
          (a.influ.service_date ?? "").localeCompare(b.influ.service_date ?? "")
        );
      else if (usage === "used")
        list.sort((a, b) =>
          (b.influ.service_date ?? "").localeCompare(a.influ.service_date ?? "")
        );
      else
        list.sort((a, b) => {
          const la = a.items.reduce(
            (m, i) => (i.created_at > m ? i.created_at : m),
            ""
          );
          const lb = b.items.reduce(
            (m, i) => (i.created_at > m ? i.created_at : m),
            ""
          );
          return lb.localeCompare(la);
        });
      return { usage, groups: list };
    }).filter((s) => s.groups.length > 0);
  }, [base, filters.usage]);

  /** จำนวนรายการที่เหลือหลังกรอง — โชว์บนปุ่มปิดแผ่น ให้เห็นผลก่อนกดกลับไปดูลิสต์ */
  const shownCount = useMemo(
    () =>
      sections.reduce(
        (n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0),
        0
      ),
    [sections]
  );

  const clearFilters = () => {
    setSearch("");
    setFilters(DEFAULT_COST_FILTERS);
  };

  const filterChips = useMemo(
    () => costFilterChips(filters, peopleById, sums.unpricedCount),
    [filters, peopleById, sums.unpricedCount]
  );

  const usageTile = (
    u: CostUsage,
    icon: typeof Wallet,
    iconClass: string,
    delay: number
  ) => (
    <SummaryTile
      icon={icon}
      iconClass={iconClass}
      label={COST_USAGE_META[u].label}
      value={formatCurrency(sums[u])}
      sub={`${sums.cases[u]} เคส`}
      active={filters.usage === u}
      onClick={() =>
        setFilters((cur) => ({ ...cur, usage: cur.usage === u ? "all" : u }))
      }
      delay={delay}
    />
  );

  return (
    <div>
      {loadError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </p>
      )}
      {err && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}

      {/* การ์ดสรุป — 3 ใบขวากดเพื่อดูเฉพาะสถานะนั้น (แทน dropdown "สถานะ" เดิม) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          icon={Wallet}
          label="ต้นทุนรวม"
          value={formatCurrency(sums.total)}
          sub={`${base.length} รายการ · ${sums.influIds.size} เคส`}
        >
          {sums.saved > 0 && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-600">
              <Gift size={11} />
              ประหยัด {formatCurrency(sums.saved)}
            </p>
          )}
        </SummaryTile>
        {usageTile("upcoming", CalendarClock, "bg-sky-50 text-sky-600", 40)}
        {usageTile("unscheduled", CalendarOff, "bg-stone-100 text-stone-500", 80)}
        {usageTile("used", CheckCircle2, "bg-emerald-50 text-emerald-600", 120)}
      </div>

      {/* แถบเครื่องมือแถวเดียว — ตัวกรองรองถูกพับเก็บไว้ในปุ่มขวาสุด
          จอเล็กเหลือ [ค้นหา][ปุ่มตัวกรอง] เท่านั้น (ชิป/ปุ่มที่เหลือย้ายเข้าแผ่น) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:w-64 sm:flex-none">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ influ / โปรแกรม"
            className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-500 focus:border-brand-400 focus:outline-none sm:text-sm"
          />
        </div>
        <InfluFilterButton
          api={filterApi}
          count={costFilterCount(filters)}
          factory={DEFAULT_COST_FILTERS}
          resultCount={shownCount}
        >
          <CostFilterSections
            filters={filters}
            onChange={setFilters}
            people={people}
            meId={meId}
            unpricedCount={sums.unpricedCount}
            usageCount={(u) => sums.cases[u]}
          />
        </InfluFilterButton>
        <span className="ml-auto text-xs text-stone-400">
          {formatNumber(base.length)} รายการ
        </span>
      </div>

      {/* ชิปสรุปตัวกรองที่เปิดอยู่ — ต้องเห็นเสมอว่ากำลังกรองอะไร */}
      <FilterSummary
        chips={filterChips}
        onChange={setFilters}
        onClear={clearFilters}
      />

      {/* ลิสต์แยก section ตามสถานะการใช้ */}
      {sections.length === 0 ? (
        rows.length > 0 ? (
          /* กันทางตัน: ตัวกรองซ่อนทุกอย่าง = ต้องบอกว่าข้อมูลยังอยู่ + ปุ่มกดกลับ */
          <p className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            ตัวกรองซ่อนรายการทั้งหมดอยู่ — ข้อมูลยังอยู่ครบ
            <button
              type="button"
              onClick={clearFilters}
              className="cursor-pointer rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-white max-sm:min-h-11"
            >
              แสดงทั้งหมด
            </button>
          </p>
        ) : (
          <EmptyState
            icon={<Wallet size={40} />}
            title="ยังไม่มีรายการต้นทุน"
            description={'เพิ่มโปรแกรมของแต่ละเคสได้ที่แท็บ "รายละเอียดเคส" ในหน้าเคสดำเนินงาน'}
          />
        )
      ) : (
        <div className="space-y-4">
          {sections.map(({ usage, groups }) => {
            const meta = COST_USAGE_META[usage];
            const subtotal = groups.reduce((s, g) => s + g.effective, 0);
            const itemCount = groups.reduce((s, g) => s + g.items.length, 0);
            return (
              <section key={usage} className="flex animate-fade-in-up">
                {/* แถบสีซ้าย = สถานะของกลุ่ม (แพตเทิร์นเดียวกับ Hunting / my-tasks) */}
                <div className={`w-1.5 shrink-0 rounded-l-xl ${meta.dot}`} />
                <div className="glass min-w-0 flex-1 overflow-x-auto rounded-l-none rounded-r-xl">
                  <div className="sm:min-w-[580px]">
                    {/* หัวกลุ่ม — จอ ≥sm ใช้กริดชุดเดียวกับแถวรายการ ยอดรวมจะได้ตรง
                        คอลัมน์ "ต้นทุน" พอดี (ไม่ลอยไปชิดขอบขวาคนละแนวกับตัวเลข) */}
                    <div
                      style={{ gridTemplateColumns: GRID_COLS }}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 sm:grid sm:gap-3 sm:px-4"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:col-span-2">
                        <h2 className="text-sm font-semibold text-stone-900">
                          {meta.label}
                        </h2>
                        <span className="text-xs text-stone-400">
                          {groups.length} เคส · {itemCount} รายการ
                        </span>
                      </div>
                      <span className="ml-auto text-sm font-semibold tabular-nums text-stone-800 sm:ml-0 sm:text-right">
                        {formatCurrency(subtotal)}
                      </span>
                      <span className="hidden sm:block" />
                    </div>
                    {/* หัวตาราง — จอเล็กไม่โชว์ (แถวเป็น flex-wrap ไม่ตรงคอลัมน์) */}
                    <div
                      style={{ gridTemplateColumns: GRID_COLS }}
                      className="hidden gap-3 border-y border-brand-100/60 bg-white/40 px-4 py-1.5 text-[11px] font-medium text-stone-400 sm:grid"
                    >
                      <span>โปรแกรม / หัตถการ</span>
                      <span>ที่มาราคา</span>
                      <span className="text-right">ต้นทุน</span>
                      <span className="text-right">Support</span>
                    </div>
                    {groups.map((g) => (
                      <div
                        key={g.influ.id}
                        className="border-b border-brand-100/50 last:border-b-0"
                      >
                        {/* หัวเคส — กริดเดียวกับแถวรายการ ยอดรวมของเคสตรงคอลัมน์ต้นทุน */}
                        <div
                          style={{ gridTemplateColumns: GRID_COLS }}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-brand-50/40 px-3 py-2 sm:grid sm:gap-3 sm:px-4"
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:col-span-2">
                          <Link
                            href={`/influencers/${g.influ.id}`}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-stone-900 transition-colors hover:text-brand-700"
                          >
                            {influName(g.influ)}
                            <ArrowUpRight size={13} className="text-stone-300" />
                          </Link>
                          {/* คนเดิมเข้ามาหลายรอบ — ต้นทุนแยกเคสต่อรอบ บอกรอบกำกับกันสับสน */}
                          {roundLabel(g.influ.round_no) && (
                            <Badge className="border border-stone-200 bg-white/70 text-stone-500">
                              {roundLabel(g.influ.round_no)}
                            </Badge>
                          )}
                          {g.influ.archived && (
                            <Badge className="border border-stone-200 bg-stone-100 text-stone-500">
                              ข้อมูลเก่า
                            </Badge>
                          )}
                          {g.influ.declined_at && (
                            <Badge className="border border-rose-200 bg-rose-50 text-rose-600">
                              ปฏิเสธแล้ว
                            </Badge>
                          )}
                          <span className="text-xs text-stone-400">
                            {g.influ.service_date
                              ? formatDate(g.influ.service_date)
                              : "ยังไม่เคาะวัน"}
                          </span>
                            <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                              {g.unpriced > 0 && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                  ยังไม่กรอก {g.unpriced}
                                </span>
                              )}
                              {g.saved > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-600">
                                  <Gift size={11} />
                                  {formatCurrency(g.saved)}
                                </span>
                              )}
                            </span>
                          </div>
                          <span className="ml-auto text-sm font-semibold tabular-nums text-stone-800 sm:ml-0 sm:text-right">
                            {formatCurrency(g.effective)}
                          </span>
                          <span className="hidden sm:block" />
                        </div>
                        {g.items.map((item) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            canEdit={canEdit}
                            onCommitPrice={commitPrice}
                            onToggleSupport={toggleSupport}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

    </div>
  );
}
