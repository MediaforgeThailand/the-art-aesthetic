"use client";

/**
 * ตัวกรอก "โปรแกรมที่รับ" แบบเพิ่มทีละรายการ (Influencer Cost)
 * — พิมพ์ค้นหาจาก Price List กลาง (price_items) หรือเพิ่มชื่อใหม่เองได้
 * — เลือกจาก Price List = ราคาอ้างอิงตามเมนู ใส่ให้อัตโนมัติและล็อกไว้ (ห้ามกรอกเอง —
 *   กติกาผู้ใช้ 2026-08-06; ราคาเปลี่ยนให้ลบแล้วเลือกใหม่) / พิมพ์เอง = กรอกต้นทุนที่ช่อง ฿
 * — ติ๊ก "แบรนด์ support" ได้ทุกรายการ (ต้นทุนรายการนั้นนับเป็น 0)
 * — ทุกการแก้ไข sync ข้อความสรุปกลับ influencers.procedure_text เพื่อให้ช่องก๊อป Memo /
 *   การ์ดบอร์ด / ปฏิทิน แสดงรูปแบบเดิม (คั่นด้วย " / ")
 * ใช้ทั้งใน Stage 2 (หน้าเดินงาน) — ส่วนหน้า /influ-cost ใช้เฉพาะ SupportToggle + CostPriceInput
 */

import { Gift, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  itemEffectiveCost,
  PROCEDURE_NAME_MAX,
  procedureSummaryText,
  shortenProgramName,
} from "@/lib/influ-constants";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { InfluProcedureItemRow } from "@/lib/types";

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
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-all active:scale-[0.95] disabled:cursor-default disabled:opacity-60 ${
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

/* ---------- ตัวกรอกหลัก (Stage 2) ---------- */

export function ProcedureItemsEditor({
  influencerId,
  items,
  setItems,
  catalog,
  readOnly,
}: {
  influencerId: string;
  items: InfluProcedureItemRow[];
  setItems: React.Dispatch<React.SetStateAction<InfluProcedureItemRow[]>>;
  catalog: PriceCatalogEntry[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 40);
    // ค้นทั้งชื่อจริงและคำเรียกปากเปล่า (search_aliases) — เช่น "botox korea" ต้องเจอ Hutox
    return catalog
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.search_aliases ?? "").toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [catalog, query]);

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
    refPrice: number | null = null
  ) => {
    const clean = shortenProgramName(name, priceItemId ? 60 : PROCEDURE_NAME_MAX);
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
                ) : item.price_item_id ? (
                  /* ผูกกับ Price List = ราคาอ้างอิงจากเมนูกลาง ล็อกไว้ ห้ามกรอกเอง */
                  <span
                    title="ราคาอ้างอิงจาก Price List — แก้เองไม่ได้ (ถ้าราคาเปลี่ยนให้ลบแล้วเลือกใหม่)"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-2 py-1.5 text-sm tabular-nums text-brand-800"
                  >
                    {formatCurrency(Number(item.price) || 0)}
                    <span className="text-[10px] font-medium uppercase tracking-wide text-brand-400">
                      Price List
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
                    className="cursor-pointer rounded-md p-1 text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90"
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

      {/* ช่องเพิ่มรายการ — พิมพ์ค้นหา + dropdown จาก Price List */}
      {!readOnly && (
        <div className="relative mt-2.5">
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
                  if (query.trim()) void addItem(query, null);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="พิมพ์ชื่อโปรแกรม เช่น Ultraformer III 300 shot..."
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
                    จาก Price List กลาง — เลือกแล้วใส่ราคาให้อัตโนมัติ
                  </p>
                  {filtered.map((c) => {
                    const refPrice = catalogPriceOf(c);
                    const q = query.trim().toLowerCase();
                    // เจอเพราะคำเรียกปากเปล่า (ไม่ใช่ชื่อจริง) — โชว์ alias ให้รู้ว่าทำไมขึ้นมา
                    const aliasHit =
                      q !== "" &&
                      !!c.search_aliases &&
                      !c.name.toLowerCase().includes(q);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onPointerDown={() => void addItem(c.name, c.id, refPrice)}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-left text-sm text-stone-700 transition-colors hover:bg-brand-50 sm:py-2"
                        title={c.name}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{c.name}</span>
                          {aliasHit && (
                            <span className="block truncate text-[10px] text-stone-400">
                              ({c.search_aliases})
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-brand-600">
                          {refPrice !== null ? formatCurrency(refPrice) : "฿0"}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : (
                <p className="px-3 py-2.5 text-xs text-stone-400">
                  ไม่พบใน Price List — กดปุ่มด้านล่างเพื่อเพิ่มเป็นโปรแกรมใหม่
                </p>
              )}
              {query.trim() !== "" && (
                <button
                  type="button"
                  onPointerDown={() => void addItem(query, null)}
                  className="sticky bottom-0 flex w-full cursor-pointer items-center gap-1.5 border-t border-stone-100 bg-white px-3 py-3 text-left text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                >
                  <Plus size={14} />
                  เพิ่ม &quot;{shortenProgramName(query, PROCEDURE_NAME_MAX)}
                  &quot; เป็นโปรแกรมใหม่
                </button>
              )}
            </div>
          )}
          <p className="mt-1 text-[11px] text-stone-400">
            เลือกจาก Price List = ราคาอ้างอิงตามเมนูอัตโนมัติ แก้เองไม่ได้ ·
            พิมพ์แล้วกด Enter = โปรแกรมนอกเมนู กรอกต้นทุนเองที่ช่อง ฿ (ติ๊ก
            Support เมื่อแบรนด์ส่งของมาให้ = ไม่คิดต้นทุน)
          </p>
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
