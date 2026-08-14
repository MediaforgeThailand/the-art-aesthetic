"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Clock3,
  Package,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import {
  comparePromoCategories,
  PRICE_GROUP_ORDER,
  PRICE_GROUPS,
  PROMO_ENDING_SOON_DAYS,
  SALES_ASSISTANT_URL,
  sortPriceGroups,
} from "@/lib/constants";
import {
  formatDate,
  formatDateBangkok,
  formatNumber,
  todayISO,
} from "@/lib/format";
import { MEMO_COMPANY } from "@/lib/influ-constants";
import type { PriceGroup, PromoPackageWithItems } from "@/lib/types";

type Pkg = PromoPackageWithItems;

/* ---------- สถานะช่วงเวลาของโปร ----------
   ไม่มีวันหมดเขต = ขายต่อเนื่อง (active) — คนละความหมายกับหมดเขตแล้ว */
type PromoState = "upcoming" | "active" | "ending" | "expired";

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / 86400000
  );
}

function promoState(p: Pkg, today: string): PromoState {
  if (p.starts_on && today < p.starts_on) return "upcoming";
  if (!p.ends_on) return "active";
  if (today > p.ends_on) return "expired";
  return daysBetween(today, p.ends_on) <= PROMO_ENDING_SOON_DAYS
    ? "ending"
    : "active";
}

/** ส่วนลดเทียบราคาเต็ม — null = คิดไม่ได้ (ไม่มีราคาเต็ม) หรือไม่ได้ลดจริง
    ข้อมูลจาก POS มีบางแพ็กเกจที่ราคาขายสูงกว่าผลรวมราคาเต็ม (3 รายการ) — กรณีนั้นไม่โชว์ป้ายลด */
function discountPct(p: Pkg): number | null {
  if (!p.full_price || p.full_price <= 0) return null;
  const pct = Math.round((1 - p.sale_price / p.full_price) * 100);
  return pct >= 1 ? pct : null;
}

/** ราคาแบบในเมนู เช่น "12,500.-" */
function baht(n: number | null | undefined): string {
  return n === null || n === undefined ? "-" : `${formatNumber(n)}.-`;
}

/** วันที่แบบสั้นสำหรับป้าย เช่น "31 ธ.ค. 69" */
function shortThaiDate(iso: string): string {
  return formatDate(iso).replace(/ (\d{4})$/, (_, y) => ` ${y.slice(2)}`);
}

/** จำนวนหน่วยแบบอ่านง่าย เช่น "5 ครั้ง", "300 ช็อต" */
function qtyLabel(p: Pkg): string {
  if (p.base_qty === null) return "";
  return `${formatNumber(p.base_qty)} ${p.base_unit ?? ""}`.trim();
}

/** สรุปว่าแพ็กเกจนี้ได้อะไรบ้าง — ใช้เป็นบรรทัดรองบนแถวแพ็กเกจรวม */
function contentSummary(p: Pkg): string {
  return [...p.items]
    .sort((a, b) => a.position - b.position)
    .map((i) => `${formatNumber(i.qty)}× ${i.item_name}`)
    .join(" + ");
}

/* ---------- แถวบนหน้าเว็บ ----------
   หัตถการที่ขายเป็น "ครั้ง" → รวมทุกแพ็กเกจของหัตถการนั้นเป็นแถวเดียว
   แล้วกาง 1 ครั้ง / คอร์ส 5 / คอร์ส 10 เป็นคอลัมน์แบบเมนู PDF
   ที่เหลือ (ยูนิต/ซีซี/ช็อต/แพ็กเกจรวมหลายหัตถการ) → 1 แพ็กเกจ = 1 แถว */
type Row = {
  key: string;
  name: string;
  /** บรรทัดรองใต้ชื่อ — ประกอบด้วยอะไรบ้าง (แพ็กเกจรวม) หรือหน่วยของหัตถการ */
  sub: string | null;
  category: string;
  groups: PriceGroup[];
  /** ราคาปกติที่โชว์คอลัมน์แรก (ต่อครั้งสำหรับแถวคอร์ส / ราคาเต็มสำหรับแถวแพ็กเกจ) */
  fullPrice: number | null;
  /** true = แถวหัตถการที่ขายเป็นครั้ง → ราคาปกติเป็น "ต่อครั้ง" ไม่ใช่ราคาเหมาทั้งแพ็กเกจ */
  perSession: boolean;
  /** ราคาโปรหลัก = 1 ครั้ง (แถวคอร์ส) หรือแพ็กเกจนั้นเอง */
  main: Pkg | null;
  course5: Pkg | null;
  course10: Pkg | null;
  /** ตัวเลือกอื่นที่ไม่เข้าคอลัมน์ เช่น 1 แถม 1, คอร์ส 8/12 ครั้ง */
  extras: Pkg[];
  /** ทุกแพ็กเกจในแถวนี้ — ใช้ในโมดัลรายละเอียด */
  all: Pkg[];
  sort: number;
  search: string;
  bestPct: number | null;
  hasPromoKind: boolean;
  endingSoon: boolean;
  hasExpired: boolean;
};

function cheapest(list: Pkg[]): Pkg | null {
  return list.length === 0
    ? null
    : list.reduce((a, b) => (b.sale_price < a.sale_price ? b : a));
}

function buildRows(packages: Pkg[], today: string): Row[] {
  // หัตถการเดียว + ขายเป็นครั้ง = จับกลุ่มได้ (1/5/10 ครั้งของหัตถการเดียวกัน)
  const sessions = new Map<string, Pkg[]>();
  const standalone: Pkg[] = [];
  for (const p of packages) {
    if (p.base_item_sku && p.base_unit === "ครั้ง") {
      const list = sessions.get(p.base_item_sku);
      if (list) list.push(p);
      else sessions.set(p.base_item_sku, [p]);
    } else {
      standalone.push(p);
    }
  }

  const finish = (r: Omit<Row, "bestPct" | "hasPromoKind" | "endingSoon" | "hasExpired">): Row => {
    const states = r.all.map((p) => promoState(p, today));
    const live = r.all.filter((_, i) => states[i] !== "expired");
    const pcts = live.map(discountPct).filter((n): n is number => n !== null);
    return {
      ...r,
      bestPct: pcts.length ? Math.max(...pcts) : null,
      hasPromoKind: r.all.some((p) => p.kind === "promo"),
      endingSoon: states.some((s) => s === "ending"),
      hasExpired: states.some((s) => s === "expired"),
    };
  };

  const rows: Row[] = [];

  for (const [sku, list] of sessions) {
    // ระบบ POS มีหลาย SKU ที่เป็นข้อเสนอเดียวกันเป๊ะ (เช่น "Aura White 5 ครั้ง" กับ
    // "Promotion IV Drip - Aura White 5 ครั้ง" ราคา 4,500 เท่ากัน) — ลูกค้าเห็นเป็นตัวเลือกซ้ำ
    // จึงยุบเหลืออันเดียวต่อ (จำนวนครั้ง, ราคา) โดยเลือกอันที่หมดเขตช้าสุดไว้
    const seen = new Map<string, Pkg>();
    for (const p of list) {
      const key = `${p.base_qty}|${p.sale_price}`;
      const cur = seen.get(key);
      if (!cur || (p.ends_on ?? "9999") > (cur.ends_on ?? "9999")) seen.set(key, p);
    }
    const sorted = [...seen.values()].sort(
      (a, b) => (a.base_qty ?? 0) - (b.base_qty ?? 0)
    );
    const single = cheapest(sorted.filter((p) => p.base_qty === 1));
    const c5 = cheapest(sorted.filter((p) => p.base_qty === 5));
    const c10 = cheapest(sorted.filter((p) => p.base_qty === 10));
    const used = new Set([single?.id, c5?.id, c10?.id]);
    const first = sorted[0];
    rows.push(
      finish({
        key: `item:${sku}`,
        name: first.base_item_name ?? first.name,
        sub: null,
        // หมวดของแถว = หมวดที่พบบ่อยสุดในกลุ่ม (ปกติเหมือนกันหมดอยู่แล้ว)
        category: first.category,
        groups: sortPriceGroups([
          ...new Set(sorted.flatMap((p) => p.groups)),
        ] as PriceGroup[]),
        fullPrice: first.base_unit_price,
        perSession: true,
        main: single,
        course5: c5,
        course10: c10,
        extras: sorted.filter((p) => !used.has(p.id)),
        all: sorted,
        sort: Math.min(...sorted.map((p) => p.sort)),
        // ค้นหาจากชื่อ "ทุก" SKU รวมอันที่ยุบทิ้ง — ทีมขายจำชื่อในระบบ POS ได้ ต้องค้นเจอ
        search: [
          first.base_item_name ?? "",
          first.category,
          ...list.map((p) => p.name),
          ...list.flatMap((p) => p.items.map((i) => i.item_name)),
        ]
          .join(" ")
          .toLowerCase(),
      })
    );
  }

  for (const p of standalone) {
    const multi = p.items.length > 1;
    rows.push(
      finish({
        key: `pkg:${p.id}`,
        name: p.name,
        sub: multi
          ? contentSummary(p)
          : p.base_qty && p.base_unit
            ? `${qtyLabel(p)}`
            : null,
        category: p.category,
        groups: sortPriceGroups(p.groups),
        fullPrice: p.full_price,
        perSession: false,
        main: p,
        course5: null,
        course10: null,
        extras: [],
        all: [p],
        sort: p.sort,
        search: [p.name, p.category, ...p.items.map((i) => i.item_name)]
          .join(" ")
          .toLowerCase(),
      })
    );
  }

  return rows.sort((a, b) => a.sort - b.sort);
}

/* ---------- ชิ้นส่วนเล็ก ---------- */

function DiscountBadge({ pct, big = false }: { pct: number; big?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 font-bold text-cream shadow-sm ${
        big ? "px-2.5 py-1 text-[13px]" : "px-1.5 py-0.5 text-[11px]"
      }`}
    >
      -{pct}%
    </span>
  );
}

function StateChip({ state, end }: { state: PromoState; end: string | null }) {
  if (state === "expired")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
        <AlertTriangle size={11} />
        หมดเขตแล้ว {end && shortThaiDate(end)}
      </span>
    );
  if (state === "ending")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        <Clock3 size={11} />
        ใกล้หมดเขต {end && shortThaiDate(end)}
      </span>
    );
  if (state === "upcoming")
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
        ยังไม่เริ่ม
      </span>
    );
  return end ? (
    <span className="whitespace-nowrap text-[11px] text-stone-400">
      ถึง {shortThaiDate(end)}
    </span>
  ) : null;
}

/** ช่องราคาในตาราง — ราคาโปรตัวใหญ่ + ป้าย % + วันหมดเขต */
function PriceCell({
  pkg,
  today,
  emphasise = false,
}: {
  pkg: Pkg | null;
  today: string;
  emphasise?: boolean;
}) {
  if (!pkg)
    return <span className="text-base font-medium text-stone-300">-</span>;
  const state = promoState(pkg, today);
  const pct = state === "expired" ? null : discountPct(pkg);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        {pct !== null && <DiscountBadge pct={pct} />}
        <span
          className={`tabular-nums font-bold ${
            state === "expired"
              ? "text-stone-400 line-through"
              : emphasise
                ? "text-lg text-brand-600"
                : "text-[15px] text-stone-900"
          }`}
        >
          {baht(pkg.sale_price)}
        </span>
      </div>
      <StateChip state={state} end={pkg.ends_on} />
    </div>
  );
}

/* ---------- หน้าเว็บ ---------- */

/** ปุ่มกลับแอปขาย — โผล่เฉพาะตอนเปิดมาจาก Sales Assistant (`?from=sales`)
 *  ลูกค้าที่เปิดลิงก์แชร์/QR ไม่เห็นปุ่มนี้
 *
 *  ทำไมลอยมุมซ้ายล่าง: แถบค้นหา/แท็บด้านบนเป็น sticky เต็มความกว้างอยู่แล้ว
 *  วางปุ่มลอยไว้ข้างบนจะทับแท็บ ส่วนถ้าวางไว้ในหัวเรื่องเฉย ๆ พอเซลล์เลื่อนดู
 *  ตารางยาว ๆ ปุ่มจะหายไปจากจอ ต้องเลื่อนกลับขึ้นบนสุดถึงจะกดกลับได้
 *
 *  ทำไมเช็ค referrer: ถ้ามาจากแอปขายจริง history.back() ดีกว่าลิงก์ตรง เพราะแอปขาย
 *  เก็บ state ไว้ในหน่วยความจำ (หัตถการที่เปิดค้าง/ตะกร้า) — กลับด้วย history
 *  ได้หน้าเดิมทั้งดุ้น ส่วนกรณีอื่น (เปิดลิงก์ตรง ๆ, แท็บใหม่) history.back()
 *  จะพาไปเว็บที่ไม่เกี่ยวหรือไม่ไปไหนเลย จึงต้อง fallback เป็นลิงก์เต็ม
 */
function BackToSalesButton() {
  const salesOrigin = new URL(SALES_ASSISTANT_URL).origin;

  return (
    <a
      href={SALES_ASSISTANT_URL}
      onClick={(e) => {
        if (
          window.history.length > 1 &&
          document.referrer.startsWith(salesOrigin)
        ) {
          e.preventDefault();
          window.history.back();
        }
      }}
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      className="fixed left-4 z-30 inline-flex items-center gap-2 rounded-full bg-brand-700 py-2.5 pl-3 pr-4 text-sm font-semibold text-cream shadow-lg shadow-brand-900/30 transition-transform hover:bg-brand-800 active:scale-95"
    >
      <ArrowLeft size={16} />
      กลับแอปขาย
    </a>
  );
}

type SpecialFilter = "promo" | "ending" | "deal" | "expired";

export function PriceListClient({
  packages,
  loadError,
  fromSales,
}: {
  packages: Pkg[];
  loadError: string | null;
  /** เปิดมาจากแอป Sales Assistant — โชว์ปุ่มกลับ */
  fromSales: boolean;
}) {
  const today = todayISO();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<PriceGroup | "all">("all");
  const [special, setSpecial] = useState<SpecialFilter | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const listRef = useRef<HTMLElement | null>(null);

  // popup เปิดอยู่: Esc ปิด + ล็อค scroll พื้นหลัง
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  const updatedAt = useMemo(() => {
    let max = "";
    for (const p of packages) if (p.updated_at > max) max = p.updated_at;
    // updated_at เป็น timestamptz — ต้องตรึงโซนไทย ไม่งั้น SSR/CSR แสดงคนละวัน (hydration mismatch)
    return max ? formatDateBangkok(max) : "-";
  }, [packages]);

  const rows = useMemo(() => buildRows(packages, today), [packages, today]);

  const stats = useMemo(
    () => ({
      promos: packages.length,
      ending: rows.filter((r) => r.endingSoon).length,
      expired: rows.filter((r) => r.hasExpired).length,
      best: rows.reduce((m, r) => Math.max(m, r.bestPct ?? 0), 0),
    }),
    [packages, rows]
  );

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q === "" ? rows : rows.filter((r) => r.search.includes(q));
  }, [rows, search]);

  // จำนวนบนแท็บ — นับหลังค้นหา (แพ็กเกจที่ติดหลายกลุ่มถูกนับทุกกลุ่ม ผลรวมจึงเกินจำนวนแถวจริงได้)
  const groupCounts = useMemo(() => {
    const c = { injection: 0, treatment: 0, device: 0 } as Record<
      PriceGroup,
      number
    >;
    for (const r of searched)
      for (const g of PRICE_GROUP_ORDER) if (r.groups.includes(g)) c[g]++;
    return c;
  }, [searched]);

  const filtered = useMemo(() => {
    let list = group === "all" ? searched : searched.filter((r) => r.groups.includes(group));
    if (special === "promo") list = list.filter((r) => r.hasPromoKind);
    if (special === "ending") list = list.filter((r) => r.endingSoon);
    if (special === "deal") list = list.filter((r) => (r.bestPct ?? 0) >= 50);
    if (special === "expired") list = list.filter((r) => r.hasExpired);
    return list;
  }, [searched, group, special]);

  const categories = useMemo(() => {
    const seen = new Map<string, Row[]>();
    for (const r of filtered) {
      const list = seen.get(r.category);
      if (list) list.push(r);
      else seen.set(r.category, [r]);
    }
    return [...seen.entries()].sort((a, b) =>
      comparePromoCategories(a[0], b[0])
    );
  }, [filtered]);

  // สลับแท็บ/ตัวกรอง = ลิสต์เปลี่ยนทั้งชุด — เลื่อนกลับไปหัวลิสต์ให้ไม่งงว่าอยู่ตรงไหน
  const scrollToList = () => {
    const el = listRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 150;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
  };
  const selectGroup = (next: PriceGroup | "all") => {
    setGroup(next);
    scrollToList();
  };
  const toggleSpecial = (next: SpecialFilter) => {
    setSpecial((cur) => (cur === next ? null : next));
    scrollToList();
  };

  const scrollTo = (cat: string) =>
    sectionRefs.current[cat]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

  return (
    // เผื่อที่ล่างเพิ่มตอนมีปุ่มลอย ไม่ให้ปุ่มบังแถวสุดท้ายของตาราง
    <div className={fromSales ? "min-h-screen pb-28" : "min-h-screen pb-16"}>
      {fromSales && <BackToSalesButton />}

      {/* หัวแบรนด์ */}
      <header className="bg-gradient-to-b from-brand-600 via-brand-500 to-brand-400 px-4 pb-14 pt-8 text-center text-cream">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3">
          <LogoMark className="h-14 w-14 shadow-lg" />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide sm:text-4xl">
              PRICE LIST
            </h1>
            <p className="mt-0.5 text-sm font-medium uppercase tracking-[0.28em] opacity-90">
              & Promotion
            </p>
          </div>
          <p className="text-xs opacity-90">
            The ART Aesthetic — Plastic Surgery Hospital
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] backdrop-blur">
              <Clock3 size={12} />
              อัปเดตล่าสุด {updatedAt}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] backdrop-blur">
              <Sparkles size={12} />
              {/* นับ "ตัวเลือก" = จำนวนแพ็กเกจที่ซื้อได้จริง ซึ่งมากกว่าจำนวนแถวบนหน้า
                  เพราะ 1 แถวรวมทั้ง 1 ครั้ง / คอร์ส 5 / คอร์ส 10 ของหัตถการเดียวกัน */}
              โปรที่ขายอยู่ {formatNumber(stats.promos)} ตัวเลือก
            </span>
            {stats.best > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold backdrop-blur">
                ลดสูงสุด {stats.best}%
              </span>
            )}
          </div>
        </div>
      </header>

      {/* แถบค้นหา + ตัวกรอง (sticky) */}
      <div className="sticky top-0 z-20 -mt-7 px-3 sm:px-6">
        <div className="glass mx-auto max-w-6xl rounded-2xl px-3 py-3 shadow-lg">
          {/* แท็บ 3 กลุ่มใหญ่ — แพ็กเกจที่มีหลายหัตถการโผล่ในทุกกลุ่มที่ติดไว้ */}
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {(["all", ...PRICE_GROUP_ORDER] as const).map((key) => {
              const active = group === key;
              const label = key === "all" ? "ทั้งหมด" : PRICE_GROUPS[key].label;
              const count = key === "all" ? searched.length : groupCounts[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectGroup(key)}
                  aria-pressed={active}
                  className={`flex cursor-pointer items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-semibold transition-all active:scale-[0.97] max-sm:min-h-11 ${
                    active
                      ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                      : "border border-stone-200/80 bg-white/70 text-stone-600 hover:bg-brand-50 hover:text-brand-700"
                  }`}
                >
                  {label}
                  <span
                    className={`text-[10px] font-medium tabular-nums ${
                      active ? "opacity-80" : "text-stone-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาโปร เช่น Botox, Filler, Pico, Ultraformer..."
              className="w-full rounded-xl border border-stone-200/80 bg-white/90 py-2.5 pl-9 pr-9 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm"
            />
            {search !== "" && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* ตัวกรองพิเศษ */}
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                ["promo", `โปรช่วงนี้`, "bg-brand-600 text-cream"],
                ["ending", `ใกล้หมดเขต ${stats.ending}`, "bg-amber-500 text-white"],
                ["deal", "ลด 50% ขึ้นไป", "bg-emerald-600 text-white"],
                ...(stats.expired > 0
                  ? ([["expired", `หมดเขตแล้ว ${stats.expired}`, "bg-rose-600 text-white"]] as const)
                  : []),
              ] as [SpecialFilter, string, string][]
            ).map(([key, label, activeClass]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSpecial(key)}
                aria-pressed={special === key}
                className={`shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors max-sm:min-h-9 ${
                  special === key
                    ? activeClass
                    : "border border-stone-200 bg-white/70 text-stone-600 hover:bg-brand-50"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="w-px shrink-0 bg-stone-200" />
            {categories.map(([cat, list]) => (
              <button
                key={cat}
                type="button"
                onClick={() => scrollTo(cat)}
                title={cat}
                className="shrink-0 cursor-pointer rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 max-sm:min-h-9"
              >
                {cat}
                <span className="ml-1 text-[10px] text-stone-400">
                  {list.length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError && (
        <p className="mx-auto mt-6 max-w-6xl px-4 text-center text-sm text-rose-600">
          โหลดข้อมูลไม่สำเร็จ: {loadError} — ลองรีเฟรชหน้าอีกครั้ง
        </p>
      )}

      {/* เตือนเมื่อมีโปรที่เลยวันหมดเขตแล้วแต่ยังไม่ถูกถอดออกจากระบบ */}
      {stats.expired > 0 && (
        <div className="mx-auto mt-5 max-w-6xl px-3 sm:px-6">
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2.5 text-[13px] text-rose-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
              มี {stats.expired} รายการที่<b>เลยวันหมดเขตแล้ว</b> —
              ราคาที่แสดงอาจไม่ใช่ราคาปัจจุบัน กรุณาสอบถามเจ้าหน้าที่ก่อนใช้บริการ
            </p>
          </div>
        </div>
      )}

      {!loadError && filtered.length === 0 && (
        <p className="mx-auto mt-10 max-w-6xl px-4 text-center text-sm text-stone-500">
          ไม่พบโปรที่ตรงกับที่เลือก — ลองล้างตัวกรองหรือค้นด้วยชื่อหัตถการ
        </p>
      )}

      {/* รายการตามหมวด */}
      <main
        ref={listRef}
        className="mx-auto mt-6 max-w-6xl space-y-7 px-3 sm:px-6"
      >
        {categories.map(([cat, list]) => (
          <section
            key={cat}
            ref={(el) => {
              sectionRefs.current[cat] = el;
            }}
            className="scroll-mt-40"
          >
            <div className="mb-2 flex items-baseline gap-2 border-b-2 border-brand-200 px-1 pb-1.5">
              <h2 className="font-display text-lg font-bold text-brand-800">
                {cat}
              </h2>
              <p className="text-xs text-stone-500">{list.length} รายการ</p>
            </div>

            {/* จอใหญ่: ตารางแบบเมนู PDF — คอลัมน์คอร์สโผล่เฉพาะหมวดที่มีคอร์สจริง
                (แพ็กเกจรวมหลายหัตถการไม่มีคอร์ส 5/10 เลย ถ้าโชว์จะเป็นช่อง "-" ทั้งแถบ) */}
            <SectionTable
              rows={list}
              today={today}
              onOpen={(r) => setSelected(r)}
            />

            {/* มือถือ: การ์ดต่อรายการ */}
            <div className="space-y-2 md:hidden">
              {list.map((r) => (
                <MobileCard
                  key={r.key}
                  row={r}
                  today={today}
                  onOpen={() => setSelected(r)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="mx-auto mt-10 max-w-6xl px-4 text-center text-[11px] leading-5 text-stone-500">
        <p>*เงื่อนไขเป็นไปตามที่คลินิกกำหนด ราคาอาจเปลี่ยนแปลงตามช่วงโปรโมชัน</p>
        <p className="mt-1">
          {MEMO_COMPANY.name} · {MEMO_COMPANY.address} · {MEMO_COMPANY.phone}
        </p>
      </footer>

      {selected && (
        <DetailModal
          row={selected}
          today={today}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ---------- ตารางของหมวด (จอใหญ่) ---------- */

function SectionTable({
  rows,
  today,
  onOpen,
}: {
  rows: Row[];
  today: string;
  onOpen: (row: Row) => void;
}) {
  const has5 = rows.some((r) => r.course5);
  const has10 = rows.some((r) => r.course10);
  const cols = 3 + (has5 ? 1 : 0) + (has10 ? 1 : 0);
  return (
    <div className="glass hidden overflow-hidden rounded-xl md:block">
      <div className="overflow-x-auto">
        <table
          className={`w-full border-collapse text-sm ${
            cols >= 5 ? "min-w-[720px]" : "min-w-[560px]"
          }`}
        >
          <thead>
            <tr className="bg-gradient-to-r from-brand-500 to-brand-400 text-cream">
              <th className="border-b border-r border-brand-300/50 px-3 py-2.5 text-left text-[13px] font-semibold">
                รายการ
              </th>
              <th className="w-[15%] border-b border-r border-brand-300/50 px-3 py-2.5 text-right text-[13px] font-semibold">
                ราคาปกติ
              </th>
              <th
                className={`border-b border-brand-300/50 px-3 py-2.5 text-right text-[13px] font-semibold ${
                  has5 || has10 ? "w-[19%] border-r" : "w-[26%]"
                }`}
              >
                ราคาโปร
              </th>
              {has5 && (
                <th
                  className={`w-[17%] border-b border-brand-300/50 px-3 py-2.5 text-right text-[13px] font-semibold ${
                    has10 ? "border-r" : ""
                  }`}
                >
                  คอร์ส 5 ครั้ง
                </th>
              )}
              {has10 && (
                <th className="w-[17%] border-b border-brand-300/50 px-3 py-2.5 text-right text-[13px] font-semibold">
                  คอร์ส 10 ครั้ง
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <DeskRow
                key={r.key}
                row={r}
                today={today}
                striped={i % 2 === 1}
                showCourse5={has5}
                showCourse10={has10}
                onOpen={() => onOpen(r)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeskRow({
  row,
  today,
  striped,
  showCourse5,
  showCourse10,
  onOpen,
}: {
  row: Row;
  today: string;
  striped: boolean;
  showCourse5: boolean;
  showCourse10: boolean;
  onOpen: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer transition-colors hover:bg-brand-50/60 ${
        striped ? "bg-cream-soft/40" : "bg-white/70"
      }`}
    >
      <td className="border-b border-r border-stone-200 px-3 py-2.5 align-top">
        <div className="flex items-start gap-1.5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium leading-5 text-stone-800">
              {row.name}
            </p>
            {row.sub && (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-500">
                {row.sub}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {row.groups.length > 1 &&
                row.groups.map((g) => (
                  <span
                    key={g}
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRICE_GROUPS[g].chip}`}
                  >
                    {PRICE_GROUPS[g].label}
                  </span>
                ))}
              {row.extras.map((p) => {
                const state = promoState(p, today);
                if (state === "expired") return null;
                const pct = discountPct(p);
                return (
                  <span
                    key={p.id}
                    title={p.name}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700"
                  >
                    {qtyLabel(p) || p.name} {baht(p.sale_price)}
                    {pct !== null && (
                      <b className="text-brand-600">-{pct}%</b>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
          <ChevronRight size={13} className="ml-auto mt-1 shrink-0 text-stone-300" />
        </div>
      </td>
      <td className="border-b border-r border-stone-200 px-3 py-2.5 text-right align-top">
        <span
          className={`tabular-nums text-[13px] ${
            row.main && discountPct(row.main) !== null
              ? "text-stone-400 line-through"
              : "font-semibold text-stone-700"
          }`}
        >
          {baht(row.fullPrice)}
        </span>
        {row.perSession && row.fullPrice !== null && (
          <span className="block text-[10px] text-stone-400">ต่อครั้ง</span>
        )}
      </td>
      <td
        className={`border-b border-stone-200 px-3 py-2.5 align-top ${
          showCourse5 || showCourse10 ? "border-r" : ""
        }`}
      >
        <PriceCell pkg={row.main} today={today} emphasise />
      </td>
      {showCourse5 && (
        <td
          className={`border-b border-stone-200 px-3 py-2.5 align-top ${
            showCourse10 ? "border-r" : ""
          }`}
        >
          <PriceCell pkg={row.course5} today={today} />
        </td>
      )}
      {showCourse10 && (
        <td className="border-b border-stone-200 px-3 py-2.5 align-top">
          <PriceCell pkg={row.course10} today={today} />
        </td>
      )}
    </tr>
  );
}

/* ---------- การ์ด (มือถือ) ---------- */

function MobileCard({
  row,
  today,
  onOpen,
}: {
  row: Row;
  today: string;
  onOpen: () => void;
}) {
  const main = row.main;
  const state = main ? promoState(main, today) : null;
  const pct = main && state !== "expired" ? discountPct(main) : null;
  const courses = [row.course5, row.course10, ...row.extras].filter(
    (p): p is Pkg => p !== null && promoState(p, today) !== "expired"
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`ดูรายละเอียด ${row.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="glass cursor-pointer rounded-xl px-3 py-3 transition-colors active:scale-[0.99]"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5 text-stone-800">
            {row.name}
          </p>
          {row.sub && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-500">
              {row.sub}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="mt-0.5 shrink-0 text-stone-300" />
      </div>

      {/* ราคาโปรตัวใหญ่ + ราคาปกติขีดฆ่า */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {main ? (
          <>
            <span
              className={`tabular-nums text-xl font-extrabold ${
                state === "expired"
                  ? "text-stone-400 line-through"
                  : "text-brand-600"
              }`}
            >
              {baht(main.sale_price)}
            </span>
            {pct !== null && (
              <>
                <span className="tabular-nums text-xs text-stone-400 line-through">
                  {baht(row.fullPrice)}
                </span>
                <DiscountBadge pct={pct} big />
              </>
            )}
          </>
        ) : (
          <span className="text-sm text-stone-500">
            ราคาปกติ {baht(row.fullPrice)}
          </span>
        )}
      </div>

      {/* คอร์ส/ตัวเลือกอื่น */}
      {courses.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {courses.map((p) => {
            const cPct = discountPct(p);
            return (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-800"
              >
                {qtyLabel(p) || "แพ็กเกจ"} {baht(p.sale_price)}
                {cPct !== null && <b className="text-brand-600">-{cPct}%</b>}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {row.groups.map((g) => (
          <span
            key={g}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRICE_GROUPS[g].chip}`}
          >
            {PRICE_GROUPS[g].label}
          </span>
        ))}
        {main && <StateChip state={promoState(main, today)} end={main.ends_on} />}
      </div>
    </div>
  );
}

/* ---------- โมดัลรายละเอียด: "โปรนี้ได้อะไรบ้าง" ---------- */

function DetailModal({
  row,
  today,
  onClose,
}: {
  row: Row;
  today: string;
  onClose: () => void;
}) {
  // เรียงให้ตัวเลือกเล็กสุดอยู่บน (1 ครั้ง → คอร์ส 5 → คอร์ส 10) แพ็กเกจรวมมีตัวเดียวอยู่แล้ว
  const list = [...row.all].sort(
    (a, b) => (a.base_qty ?? 0) - (b.base_qty ?? 0) || a.sale_price - b.sale_price
  );
  const expired = list.filter((p) => promoState(p, today) === "expired");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-brand-900/40 backdrop-blur-sm animate-fade-in sm:items-start sm:p-6 sm:pt-14"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={row.name}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-fade-in-up sm:rounded-2xl sm:animate-scale-in"
      >
        <div className="flex items-center gap-2 border-b border-stone-100 bg-gradient-to-r from-brand-50 to-cream-soft px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-white/80 active:scale-95"
          >
            <ArrowLeft size={16} />
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={onClose}
            title="ปิด"
            aria-label="ปิด"
            className="ml-auto cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-white/80 hover:text-stone-700 active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xs font-medium text-brand-600">{row.category}</p>
            {row.groups.map((g) => (
              <span
                key={g}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRICE_GROUPS[g].chip}`}
              >
                {PRICE_GROUPS[g].label}
              </span>
            ))}
          </div>
          <h2 className="mt-0.5 font-display text-xl font-bold leading-snug text-stone-900">
            {row.name}
          </h2>
          {row.fullPrice !== null && (
            <p className="mt-1 text-[13px] text-stone-500">
              ราคาปกติ {baht(row.fullPrice)}
              {row.perSession && " ต่อครั้ง"}
            </p>
          )}

          {expired.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>
                {expired.length === list.length
                  ? "โปรนี้หมดเขตแล้ว"
                  : `มี ${expired.length} ตัวเลือกที่หมดเขตแล้ว`}{" "}
                — กรุณาสอบถามเจ้าหน้าที่เพื่อยืนยันราคาปัจจุบัน
              </p>
            </div>
          )}

          {/* ตัวเลือกทั้งหมดของรายการนี้ + ได้อะไรบ้าง */}
          <div className="mt-4 space-y-3">
            {list.map((p) => {
              const state = promoState(p, today);
              const pct = state === "expired" ? null : discountPct(p);
              return (
                <div
                  key={p.id}
                  className={`overflow-hidden rounded-xl border ${
                    state === "expired"
                      ? "border-stone-200 bg-stone-50/70"
                      : "border-brand-200 bg-gradient-to-b from-brand-50/60 to-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-200/80 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-5 text-stone-800">
                        {p.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-stone-500">
                          {p.starts_on && p.ends_on
                            ? `${shortThaiDate(p.starts_on)} – ${shortThaiDate(p.ends_on)}`
                            : p.ends_on
                              ? `ถึง ${shortThaiDate(p.ends_on)}`
                              : "ไม่ระบุวันหมดเขต"}
                        </span>
                        {/* ช่วงเวลาเต็มพิมพ์ไว้ข้างบนแล้ว — ป้ายซ้ำ "ถึง …" ของสถานะปกติจึงไม่ต้องโชว์ */}
                        {state !== "active" && (
                          <StateChip state={state} end={p.ends_on} />
                        )}
                      </div>
                    </div>
                    {/* จอแคบให้ราคาลงบรรทัดของตัวเอง ไม่งั้นชื่อโปรถูกบีบเหลือ 3-4 บรรทัด */}
                    <div className="flex basis-full items-center justify-end gap-2 sm:basis-auto">
                      {pct !== null && (
                        <>
                          <span className="tabular-nums text-xs text-stone-400 line-through">
                            {baht(p.full_price)}
                          </span>
                          <DiscountBadge pct={pct} big />
                        </>
                      )}
                      <span
                        className={`tabular-nums text-lg font-extrabold ${
                          state === "expired"
                            ? "text-stone-400 line-through"
                            : "text-brand-600"
                        }`}
                      >
                        {baht(p.sale_price)}
                      </span>
                    </div>
                  </div>

                  <div className="px-3 py-2.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-brand-700">
                      <Package size={13} />
                      ได้อะไรบ้าง
                    </p>
                    <ul className="space-y-1">
                      {[...p.items]
                        .sort((a, b) => a.position - b.position)
                        .map((it) => (
                          <li
                            key={it.id}
                            className="flex items-baseline justify-between gap-3 text-[13px] leading-6"
                          >
                            <span className="min-w-0 text-stone-700">
                              <b className="mr-1 tabular-nums text-brand-700">
                                {formatNumber(it.qty)}
                                {it.unit ? ` ${it.unit}` : "×"}
                              </b>
                              {it.item_name}
                            </span>
                            {it.unit_price ? (
                              <span className="shrink-0 whitespace-nowrap tabular-nums text-[11px] text-stone-400">
                                ปกติ {baht(it.unit_price * it.qty)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      {p.items.length === 0 && (
                        <li className="text-[13px] text-stone-400">
                          ไม่มีรายละเอียดในระบบ — สอบถามเจ้าหน้าที่
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-[11px] text-stone-400">
            *เงื่อนไขเป็นไปตามที่คลินิกกำหนด สอบถามเพิ่มเติม {MEMO_COMPANY.phone}
          </p>
        </div>

        <div className="border-t border-stone-100 px-4 py-3 pb-safe-3 sm:pb-3">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 py-2.5 text-sm font-medium text-cream shadow-sm transition-all hover:from-brand-600 hover:to-brand-700 active:scale-[0.98]"
          >
            <ArrowLeft size={16} />
            ย้อนกลับไปหน้า Price List
          </button>
        </div>
      </div>
    </div>
  );
}
