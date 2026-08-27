"use client";

/**
 * ตัวกรอก "โปรแกรมที่รับ" แบบเพิ่มทีละรายการ (Influencer Cost)
 * — พิมพ์ค้นหาจาก Price List กลาง (price_items) หรือเพิ่มชื่อใหม่เองได้
 * — เลือกจาก Price List = ราคาอ้างอิงตามเมนู ใส่ให้อัตโนมัติและล็อกไว้ (ห้ามกรอกเอง —
 *   กติกาผู้ใช้ 2026-08-06; ราคาเปลี่ยนให้ลบแล้วเลือกใหม่) / พิมพ์เอง = กรอกต้นทุนที่ช่อง ฿
 * — ติ๊ก "แบรนด์ support" ได้ทุกรายการ (ต้นทุนรายการนั้นนับเป็น 0)
 * — ทุกการแก้ไข sync ข้อความสรุปกลับ influencers.procedure_text เพื่อให้ช่องก๊อป Memo /
 *   การ์ดบอร์ด / ปฏิทิน แสดงรูปแบบเดิม (คั่นด้วย " / ")
 * ใช้ทั้งในแท็บรายละเอียดเคส (หน้าเดินงาน) — ส่วนหน้า /influ-cost ใช้เฉพาะ SupportToggle + CostPriceInput
 */

import { Gift, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PRODUCT_TEAM,
  INFLU_PRODUCT_TEAM_ORDER,
  INFLU_PRODUCT_TEAMS,
  itemEffectiveCost,
  PROCEDURE_NAME_MAX,
  procedureSummaryText,
  shortenProgramName,
} from "@/lib/influ-constants";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluProcedureItemRow,
  InfluProductTeam,
  InfluServiceRow,
} from "@/lib/types";

/** ตัวเลือกจาก Price List กลาง (ส่งมาจาก server — id + ชื่อ + ราคาไว้โชว์ใน dropdown
    + search_aliases = คำเรียกปากเปล่า เช่น "Botox Korea" → Hutox ให้ค้นหาเจอ) */
export type PriceCatalogEntry = {
  id: string;
  name: string;
  price_normal: string | null;
  promos: { price?: string | null }[] | null;
  search_aliases: string | null;
};

/** ราคาอ้างอิงของโปรแกรมใน Price List — ราคาปกติก่อน ไม่มีค่อยใช้ราคาโปรแรก
    (ราคาเก็บเป็น text เช่น "39,000" / "18,900 / กล่อง" — ตัดหน่วยท้ายทิ้ง; คืน null = ไม่รู้ราคา) */
export function catalogPriceOf(entry: PriceCatalogEntry): number | null {
  const raw = entry.price_normal?.trim() || entry.promos?.[0]?.price || "";
  const n = Number(String(raw).split("/")[0].replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** โปรที่ขึ้นหน้า /price-list (promo_packages — 0090): ราคาเป็น numeric ตรงๆ ไม่ใช่ text
    ต้องโผล่ในช่องค้นหาด้วย เพราะโปรที่ขายจริงหลายตัวไม่มีคู่ใน price_items เลย
    (เช่น "Botox Hutox (100 Unit)/Pro" 9,900 — price_items มีแต่ตัวปกติ 11,900) */
export type PromoCatalogEntry = {
  id: string;
  name: string;
  sale_price: number;
  full_price: number | null;
};

/* ---------- เมนูหัตถการตาม product team (migration 0080) ----------
   aesthetics = price_items (เมนูหลัก) + influ_services ที่ทีมเพิ่มเอง
   ทีมอื่น    = influ_services ของทีมนั้นล้วน (ยังไม่มีเมนูกลาง) */

/** ตัวเลือก 1 รายการในช่องค้นหา — มาจาก Price List / โปรหน้า price-list / ทะเบียนที่ทีมเพิ่มเอง */
export type ServiceOption = {
  key: string;
  name: string;
  team: InfluProductTeam;
  /** มาจาก price_items → ราคาอ้างอิงถูกล็อก (กติกา Price List เดิม) */
  priceItemId: string | null;
  /** มาจาก promo_packages (โปรบนหน้า /price-list — 0090) → ล็อกราคาเหมือนกัน */
  promoPackageId: string | null;
  refPrice: number | null;
  /** ราคาเต็มของโปร (มีเฉพาะโปรที่ลดจริง) — ไว้ขีดฆ่าใน dropdown ให้เห็นว่าเป็นราคาโปร */
  fullPrice: number | null;
  aliases: string | null;
};

/** รวมเมนูของทีมที่เลือก — price_items + โปร promo_packages เฉพาะทีม aesthetics
    + influ_services ของทีมนั้น */
export function buildServiceOptions(
  catalog: PriceCatalogEntry[],
  promos: PromoCatalogEntry[],
  services: InfluServiceRow[],
  team: InfluProductTeam
): ServiceOption[] {
  const opts: ServiceOption[] = [];
  if (team === "aesthetics") {
    for (const c of catalog) {
      opts.push({
        key: `pi:${c.id}`,
        name: c.name,
        team,
        priceItemId: c.id,
        promoPackageId: null,
        refPrice: catalogPriceOf(c),
        fullPrice: null,
        aliases: c.search_aliases,
      });
    }
    for (const p of promos) {
      const sale = Number(p.sale_price);
      const full = p.full_price !== null ? Number(p.full_price) : null;
      // ชื่อซ้ำเป๊ะกับ price_items และราคาไม่ได้ถูกกว่า = แถวเดียวกับเมนูกลาง ข้ามไป
      // (ถ้าโปรถูกกว่า ให้โชว์คู่กัน — คนเลือกเห็นทั้งราคากลางและราคาโปร)
      const dup = opts.find(
        (o) =>
          o.priceItemId !== null &&
          o.name.trim().toLowerCase() === p.name.trim().toLowerCase()
      );
      if (dup && (dup.refPrice === null || sale >= dup.refPrice)) continue;
      opts.push({
        key: `pk:${p.id}`,
        name: p.name,
        team,
        priceItemId: null,
        promoPackageId: p.id,
        refPrice: Number.isFinite(sale) && sale > 0 ? sale : null,
        // ขีดฆ่าเฉพาะโปรที่ลดจริง — sale เท่ากับ full ไม่ต้องแปะป้ายโปรหลอก
        fullPrice: full !== null && Number.isFinite(full) && full > sale ? full : null,
        aliases: null,
      });
    }
  }
  for (const sv of services) {
    if (sv.team !== team || !sv.active) continue;
    // ชื่อซ้ำกับ Price List (ทีมเคยพิมพ์เพิ่มก่อนเมนูกลางจะมี) — ให้เมนูกลางชนะ
    if (
      team === "aesthetics" &&
      opts.some((o) => o.name.toLowerCase() === sv.name.toLowerCase())
    )
      continue;
    opts.push({
      key: `svc:${sv.id}`,
      name: sv.name,
      team,
      priceItemId: null,
      promoPackageId: null,
      refPrice:
        sv.default_price !== null && Number(sv.default_price) > 0
          ? Number(sv.default_price)
          : null,
      fullPrice: null,
      aliases: null,
    });
  }
  return opts.sort((a, b) => a.name.localeCompare(b.name, "th"));
}

/** ลงทะเบียนหัตถการใหม่เข้าเมนูของทีม (พิมพ์เองในช่องค้นหา = เพิ่มเข้าเมนูให้ค้นเจอครั้งหน้า)
    ชื่อซ้ำในทีมเดียวกัน (23505) = ใช้แถวเดิม ไม่ถือเป็น error */
export async function registerService(
  supabase: ReturnType<typeof createClient>,
  team: InfluProductTeam,
  name: string
): Promise<{ service: InfluServiceRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("influ_services")
    .insert({ team, name })
    .select("*")
    .single();
  if (!error && data) return { service: data as InfluServiceRow, error: null };
  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("influ_services")
      .select("*")
      .eq("team", team)
      .ilike("name", name)
      .maybeSingle();
    if (existing) return { service: existing as InfluServiceRow, error: null };
  }
  return {
    service: null,
    error: error?.message ?? "เพิ่มเข้าเมนูไม่สำเร็จ",
  };
}

/** แถวชิปเลือก product team — ใช้ทั้งในแท็บรายละเอียดเคสและตอนสร้างนัดใหม่ */
export function TeamPicker({
  team,
  onChange,
  disabled,
}: {
  team: InfluProductTeam;
  onChange: (t: InfluProductTeam) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {INFLU_PRODUCT_TEAM_ORDER.map((t) => (
        <button
          key={t}
          type="button"
          disabled={disabled}
          onClick={() => onChange(t)}
          className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97] disabled:cursor-default disabled:opacity-60 max-sm:min-h-11 ${
            team === t
              ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
              : "border border-stone-200 bg-white/60 text-stone-500 hover:bg-white"
          }`}
        >
          {INFLU_PRODUCT_TEAMS[t].label}
        </button>
      ))}
    </div>
  );
}

/* ---------- ชิ้นส่วนย่อยที่หน้า /influ-cost ใช้ร่วม ---------- */

/** ปุ่มติ๊ก "แบรนด์ support ของ" — เปิดแล้วต้นทุนรายการนี้นับเป็น 0 */
export function SupportToggle({
  on,
  disabled,
  onToggle,
  compact = false,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={
        on
          ? "แบรนด์สินค้า support ของ — ต้นทุนรายการนี้นับเป็น ฿0 (กดเพื่อยกเลิก)"
          : "ติ๊กเมื่อแบรนด์สินค้า support ของ (ส่งของมาให้) — ต้นทุนรายการนี้จะนับเป็น ฿0"
      }
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-all active:scale-[0.95] max-sm:min-h-11 disabled:cursor-default disabled:opacity-60 ${
        on
          ? "border-pink-300 bg-pink-100 text-pink-700"
          : "border-stone-200 bg-white/70 text-stone-400 hover:border-pink-200 hover:text-pink-500"
      }`}
    >
      <Gift size={12} />
      {on ? (compact ? "Support" : "Support แบรนด์") : "Support"}
    </button>
  );
}

/** ช่องกรอกต้นทุน (บาท) — commit ตอน blur/Enter; 0 = ยังไม่กรอก แสดงว่าง
    uncontrolled (defaultValue) — ค่าใน DB เปลี่ยนจากที่อื่นให้เปลี่ยน key เพื่อ remount */
export function CostPriceInput({
  value,
  disabled,
  onCommit,
  className = "",
}: {
  value: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
  className?: string;
}) {
  // ช่องนี้เป็น uncontrolled (commit ตอน blur) — defaultValue จึงไม่อัปเดตเมื่อ props เปลี่ยน
  // ถ้าคนอื่นแก้ราคาแล้วหน้า refresh ค่าใหม่มาถึง prop แต่ใน DOM ยังเป็นค่าเก่า พอผู้ใช้
  // แค่คลิกเข้าแล้วคลิกออก (focus+blur) จะ commit ค่าเก่าทับค่าใหม่เงียบๆ
  // → sync ค่าลง DOM เอง แต่ข้ามตอนที่ช่องกำลังถูกโฟกัส (ไม่แย่งสิ่งที่ผู้ใช้พิมพ์ค้างไว้)
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    el.value = value === 0 ? "" : String(value);
  }, [value]);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white/80 px-2 py-1 ${
        disabled ? "opacity-60" : "focus-within:border-brand-400"
      } ${className}`}
    >
      <span className="text-[11px] text-stone-400">฿</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step="any"
        disabled={disabled}
        defaultValue={value === 0 ? "" : value}
        placeholder="0"
        onBlur={(e) => {
          const n = Number(e.target.value);
          const next = Number.isFinite(n) && n > 0 ? n : 0;
          if (next !== value) onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-20 bg-transparent py-1 text-right text-base tabular-nums text-stone-800 outline-none placeholder:text-stone-300 sm:py-0 sm:text-sm"
      />
    </span>
  );
}

/* ---------- ตัวกรอกหลัก (แท็บรายละเอียดเคส) ---------- */

export function ProcedureItemsEditor({
  influencerId,
  items,
  setItems,
  catalog,
  promos,
  services,
  readOnly,
}: {
  influencerId: string;
  items: InfluProcedureItemRow[];
  setItems: React.Dispatch<React.SetStateAction<InfluProcedureItemRow[]>>;
  catalog: PriceCatalogEntry[];
  /** โปรที่ขึ้นหน้า /price-list (promo_packages) — ต้องค้นเจอในช่องนี้ด้วย (0090) */
  promos: PromoCatalogEntry[];
  /** ทะเบียนหัตถการที่ทีมเพิ่มเอง (ทุก product team) — มาจาก influ_services */
  services: InfluServiceRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // ทีมที่กำลังเลือกหัตถการอยู่ — ช่องค้นหาแสดงเฉพาะเมนูของทีมนี้ (0080)
  const [team, setTeam] = useState<InfluProductTeam>(DEFAULT_PRODUCT_TEAM);
  // สำเนาทะเบียนในเครื่อง — รายการที่เพิ่งพิมพ์เพิ่มต้องโผล่ในช่องค้นหาทันทีไม่ต้องรอ refresh
  const [svcList, setSvcList] = useState<InfluServiceRow[]>(services);

  const options = useMemo(
    () => buildServiceOptions(catalog, promos, svcList, team),
    [catalog, promos, svcList, team]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 40);
    // ค้นทั้งชื่อจริงและคำเรียกปากเปล่า (search_aliases) — เช่น "botox korea" ต้องเจอ Hutox
    return options
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.aliases ?? "").toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [options, query]);

  /** sync ข้อความสรุปกลับ procedure_text — ให้ Memo/บอร์ด/ปฏิทินเห็นรูปแบบเดิม (best effort)
      แล้ว refresh ให้หน้าภาพรวม/Memo ในหน้าเดียวกันเห็นค่าล่าสุด (state ในฟอร์มนี้ไม่โดนทับ) */
  const syncText = (next: InfluProcedureItemRow[]) => {
    void supabase
      .from("influencers")
      .update({ procedure_text: procedureSummaryText(next) || null })
      .eq("id", influencerId)
      .then(({ error }) => {
        if (error) setErr(`อัพเดทข้อความสรุปไม่สำเร็จ: ${error.message}`);
        else router.refresh();
      });
  };

  /** เพิ่มรายการ — เลือกจาก Price List = ใส่ราคาอ้างอิงให้เลย (ห้ามกรอกเอง),
      พิมพ์เอง (ไม่มีใน Price List) = ราคา 0 รอกรอกที่ช่อง ฿ */
  const addItem = async (
    name: string,
    priceItemId: string | null,
    refPrice: number | null = null,
    promoPackageId: string | null = null
  ) => {
    const clean = shortenProgramName(
      name,
      priceItemId || promoPackageId ? 60 : PROCEDURE_NAME_MAX
    );
    if (!clean || adding) return;
    setAdding(true);
    setErr(null);
    const nextPos = Math.max(0, ...items.map((i) => i.position)) + 1;
    const { data, error } = await supabase
      .from("influ_procedure_items")
      .insert({
        influencer_id: influencerId,
        name: clean,
        price: refPrice ?? 0,
        price_item_id: priceItemId,
        promo_package_id: promoPackageId,
        product_team: team,
        position: nextPos,
      })
      .select("*")
      .single();
    setAdding(false);
    if (error || !data) {
      setErr(`เพิ่มรายการไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    const next = [...items, data as InfluProcedureItemRow];
    setItems(next);
    syncText(next);
    setQuery("");
    inputRef.current?.focus();
  };

  /** พิมพ์ชื่อใหม่ที่ไม่มีในเมนู = เพิ่มเข้าเมนูของทีมนี้ด้วย (ครั้งหน้าพิมพ์ค้นหาเจอเลย
      — กติกาผู้ใช้ 2026-08-19) แล้วค่อยผูกเป็นรายการของเคส */
  const addNewToTeam = async (name: string) => {
    const clean = shortenProgramName(name, PROCEDURE_NAME_MAX);
    if (!clean || adding) return;
    const { service, error } = await registerService(supabase, team, clean);
    if (error) {
      setErr(`เพิ่มเข้าเมนูทีมไม่สำเร็จ: ${error}`);
      return;
    }
    if (service && !svcList.some((sv) => sv.id === service.id)) {
      setSvcList((prev) => [...prev, service]);
    }
    await addItem(clean, null, service?.default_price ?? null);
  };

  /** คืนชื่อที่บันทึกจริง — ช่องชื่อเป็น uncontrolled ต้องเขียนค่านี้กลับลง input ตอน blur
      (ชื่อว่าง = ไม่บันทึก คืนชื่อเดิม — จะลบรายการให้ใช้ปุ่ม X) */
  const commitName = (id: string, name: string): string => {
    const cur = items.find((i) => i.id === id);
    if (!cur) return name;
    const clean = name.trim();
    if (!clean || clean === cur.name) return cur.name;
    setErr(null);
    const next = items.map((i) => (i.id === id ? { ...i, name: clean } : i));
    setItems(next);
    void supabase
      .from("influ_procedure_items")
      .update({ name: clean })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setErr(`บันทึกชื่อไม่สำเร็จ: ${error.message}`);
        else syncText(next);
      });
    return clean;
  };

  const commitPrice = (id: string, price: number) => {
    setErr(null);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, price } : i)));
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
    const cur = items.find((i) => i.id === id);
    if (!cur) return;
    setErr(null);
    const nextVal = !cur.is_supported;
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, is_supported: nextVal } : i))
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

  const removeItem = (id: string) => {
    setErr(null);
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    void supabase
      .from("influ_procedure_items")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) setErr(`ลบรายการไม่สำเร็จ: ${error.message}`);
        else syncText(next);
      });
  };

  const total = items.reduce((s, i) => s + itemEffectiveCost(i), 0);
  const saved = items.reduce(
    (s, i) => s + (i.is_supported ? Number(i.price) || 0 : 0),
    0
  );

  return (
    <div>
      {/* รายการที่เพิ่มแล้ว */}
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border px-3 py-2 transition-colors ${
                item.is_supported
                  ? "border-pink-200 bg-pink-50/60"
                  : "border-stone-200 bg-white/70"
              }`}
            >
              {item.product_team !== "aesthetics" && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${INFLU_PRODUCT_TEAMS[item.product_team].chip}`}
                >
                  {INFLU_PRODUCT_TEAMS[item.product_team].label}
                </span>
              )}
              {readOnly ? (
                <span className="min-w-0 flex-1 break-words text-sm text-stone-800">
                  {item.name}
                </span>
              ) : (
                <input
                  defaultValue={item.name}
                  maxLength={PROCEDURE_NAME_MAX}
                  onBlur={(e) => {
                    e.target.value = commitName(item.id, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  className="min-w-[150px] flex-1 bg-transparent py-1.5 text-base text-stone-800 outline-none focus:rounded-md focus:bg-white/80 focus:px-1 sm:py-0 sm:text-sm"
                />
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {item.is_supported ? (
                  <span className="text-xs tabular-nums text-pink-600">
                    {Number(item.price) > 0 && (
                      <span className="mr-1 text-stone-300 line-through">
                        {formatCurrency(Number(item.price))}
                      </span>
                    )}
                    ฿0
                  </span>
                ) : item.price_item_id || item.promo_package_id ? (
                  /* ผูกกับ Price List / โปรหน้า price-list = ราคาล็อกไว้ ห้ามกรอกเอง */
                  <span
                    title="ราคาอ้างอิงจาก Price List — แก้เองไม่ได้ (ถ้าราคาเปลี่ยนให้ลบแล้วเลือกใหม่)"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-2 py-1.5 text-sm tabular-nums text-brand-800"
                  >
                    {formatCurrency(Number(item.price) || 0)}
                    <span className="text-[10px] font-medium uppercase tracking-wide text-brand-400">
                      {item.promo_package_id ? "โปร Price List" : "Price List"}
                    </span>
                  </span>
                ) : (
                  <CostPriceInput
                    value={Number(item.price) || 0}
                    disabled={readOnly}
                    onCommit={(n) => commitPrice(item.id, n)}
                  />
                )}
                <SupportToggle
                  on={item.is_supported}
                  disabled={readOnly}
                  onToggle={() => toggleSupport(item.id)}
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    title="ลบรายการนี้"
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90 sm:h-7 sm:w-7"
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white/50 px-3 py-3 text-center text-xs text-stone-400">
          ยังไม่มีโปรแกรม — พิมพ์ค้นหาจาก Price List ด้านล่างแล้วกดเพิ่มทีละรายการ
        </p>
      )}

      {/* สรุปต้นทุน */}
      {items.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          รวมต้นทุน{" "}
          <span className="font-semibold tabular-nums text-stone-800">
            {formatCurrency(total)}
          </span>{" "}
          · {items.length} รายการ
          {saved > 0 && (
            <span className="text-pink-600">
              {" "}
              · แบรนด์ support ประหยัด {formatCurrency(saved)}
            </span>
          )}
          <span className="text-stone-400"> — ราคา 0 = ยังไม่กรอกต้นทุน</span>
        </p>
      )}

      {/* ช่องเพิ่มรายการ — เลือก product team ก่อน แล้วพิมพ์ค้นหาเมนูของทีมนั้น (0080) */}
      {!readOnly && (
        <div className="mt-2.5">
          <div className="mb-2">
            <TeamPicker
              team={team}
              onChange={(t) => {
                setTeam(t);
                setQuery("");
              }}
            />
          </div>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-stone-300/80 bg-white/80 px-3 py-2 transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <Search size={15} className="shrink-0 text-stone-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (query.trim()) void addNewToTeam(query);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder={
                team === "aesthetics"
                  ? "พิมพ์ชื่อโปรแกรม เช่น Ultraformer III 300 shot..."
                  : `ค้นหา/เพิ่มหัตถการของทีม ${INFLU_PRODUCT_TEAMS[team].label}...`
              }
              maxLength={PROCEDURE_NAME_MAX}
              className="w-full bg-transparent text-base text-stone-900 outline-none placeholder:text-stone-400 sm:text-sm"
            />
          </div>
          {open && (
            <div
              // กัน blur ของ input ก่อนตัวเลือกจะทำงาน — ต้องดักที่ pointerdown ไม่ใช่ mousedown
              // เพราะบนจอสัมผัส mousedown เป็นอีเวนต์จำลองที่มาหลัง blur ไปแล้ว
              // (ลิสต์ถูก unmount ก่อน = แตะเลือกโปรแกรมไม่ติดบนมือถือ)
              onPointerDown={(e) => e.preventDefault()}
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white shadow-xl animate-fade-in"
            >
              {filtered.length > 0 ? (
                <>
                  <p className="sticky top-0 border-b border-stone-100 bg-stone-50/95 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                    {team === "aesthetics"
                      ? "เมนูทีม Aesthetics (Price List + ที่ทีมเพิ่มเอง)"
                      : `เมนูทีม ${INFLU_PRODUCT_TEAMS[team].label} (ที่ทีมเพิ่มกันเอง)`}
                  </p>
                  {filtered.map((c) => {
                    const q = query.trim().toLowerCase();
                    // เจอเพราะคำเรียกปากเปล่า (ไม่ใช่ชื่อจริง) — โชว์ alias ให้รู้ว่าทำไมขึ้นมา
                    const aliasHit =
                      q !== "" && !!c.aliases && !c.name.toLowerCase().includes(q);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onPointerDown={() =>
                          void addItem(c.name, c.priceItemId, c.refPrice, c.promoPackageId)
                        }
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-left text-sm text-stone-700 transition-colors hover:bg-brand-50 sm:py-2"
                        title={c.name}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{c.name}</span>
                          {aliasHit && (
                            <span className="block truncate text-[10px] text-stone-400">
                              ({c.aliases})
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-brand-600">
                          {c.fullPrice !== null && (
                            <span className="mr-1 font-normal text-stone-300 line-through">
                              {formatCurrency(c.fullPrice)}
                            </span>
                          )}
                          {c.refPrice !== null ? formatCurrency(c.refPrice) : "฿0"}
                          {c.promoPackageId !== null && (
                            <span className="ml-1 rounded bg-pink-100 px-1 py-0.5 text-[10px] font-medium text-pink-600">
                              โปร
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : (
                <p className="px-3 py-2.5 text-xs text-stone-400">
                  ไม่พบในเมนูของทีมนี้ — กดปุ่มด้านล่างเพื่อเพิ่มเป็นหัตถการใหม่
                </p>
              )}
              {query.trim() !== "" && (
                <button
                  type="button"
                  onPointerDown={() => void addNewToTeam(query)}
                  className="sticky bottom-0 flex w-full cursor-pointer items-center gap-1.5 border-t border-stone-100 bg-white px-3 py-3 text-left text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                >
                  <Plus size={14} />
                  เพิ่ม &quot;{shortenProgramName(query, PROCEDURE_NAME_MAX)}
                  &quot; เข้าเมนูทีม {INFLU_PRODUCT_TEAMS[team].label}
                </button>
              )}
            </div>
          )}
          <p className="mt-1 text-[11px] text-stone-400">
            {team === "aesthetics"
              ? "เลือกจาก Price List = ราคาอ้างอิงตามเมนูอัตโนมัติ แก้เองไม่ได้"
              : `เมนูของทีม ${INFLU_PRODUCT_TEAMS[team].label} มาจากที่ทีมเพิ่มกันเอง`}{" "}
            · พิมพ์ชื่อใหม่แล้วกด Enter = เพิ่มเข้าเมนูของทีมนี้ให้ค้นเจอครั้งหน้า
            (ติ๊ก Support เมื่อแบรนด์ส่งของมาให้ = ไม่คิดต้นทุน)
          </p>
        </div>
        </div>
      )}

      {err && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}
    </div>
  );
}
