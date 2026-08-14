"use client";

/**
 * ตัวเลือก "หัตถการที่รับ" ตอน **สร้างการ์ดใหม่** — เก็บไว้ใน memory ก่อน
 * (ยังไม่มี influencer_id ให้บันทึก) แล้วค่อย insert เข้า influ_procedure_items ทีเดียวหลังสร้างเคส
 *
 * ต่างจาก ProcedureItemsEditor ที่เขียน DB ทันทีทุกการแก้ (ใช้ใน Stage 2 ของเคสที่มีอยู่แล้ว)
 * — แต่ใช้ catalog/กติกาชื่อ-ราคาชุดเดียวกัน: เลือกจาก Price List = ได้ราคาอ้างอิงมาด้วย,
 *   พิมพ์เอง = ราคา 0 รอไปกรอกที่หน้า Influencer Cost
 */

import { Plus, Search, Stethoscope, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { PROCEDURE_NAME_MAX, shortenProgramName } from "@/lib/influ-constants";
import { catalogPriceOf, type PriceCatalogEntry } from "./procedure-items-editor";

/** หัตถการที่เลือกไว้ (ยังไม่ลง DB) */
export type PickedProcedure = {
  name: string;
  priceItemId: string | null;
  price: number;
};

export function ProcedurePicker({
  picked,
  onChange,
  catalog,
  disabled = false,
}: {
  picked: PickedProcedure[];
  onChange: (next: PickedProcedure[]) => void;
  catalog: PriceCatalogEntry[];
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 30);
    // ค้นทั้งชื่อจริงและคำเรียกปากเปล่า (search_aliases) — "botox korea" ต้องเจอ Hutox
    return catalog
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.search_aliases ?? "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [catalog, query]);

  const add = (name: string, priceItemId: string | null, price: number) => {
    const clean = shortenProgramName(
      name,
      priceItemId ? 60 : PROCEDURE_NAME_MAX
    );
    if (!clean) return;
    if (picked.some((p) => p.name === clean)) {
      setQuery("");
      return;
    }
    onChange([...picked, { name: clean, priceItemId, price }]);
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div>
      {picked.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {picked.map((p) => (
            <li
              key={p.name}
              className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white/70 px-3 py-2"
            >
              <Stethoscope size={14} className="shrink-0 text-brand-400" />
              <span className="min-w-0 flex-1 break-words text-sm text-stone-800">
                {p.name}
              </span>
              {p.price > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-stone-400">
                  {formatCurrency(p.price)}
                </span>
              )}
              <button
                type="button"
                disabled={disabled}
                aria-label={`เอา ${p.name} ออก`}
                onClick={() => onChange(picked.filter((x) => x.name !== p.name))}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90 sm:h-7 sm:w-7"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={query}
          placeholder="ค้นหาหัตถการจาก Price List หรือพิมพ์ชื่อเอง..."
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // ปิดลิสต์ตอน blur ต้องหน่วง ไม่งั้นแตะเลือกไม่ทัน (ดูกติกา onPointerDown ข้างล่าง)
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const first = filtered[0];
            const q = query.trim();
            if (!q) return;
            // ตรงกับตัวเลือกแรกพอดี = หยิบตัวนั้น (ได้ราคาอ้างอิงมาด้วย)
            if (first && first.name.toLowerCase() === q.toLowerCase()) {
              add(first.name, first.id, catalogPriceOf(first) ?? 0);
            } else {
              add(q, null, 0);
            }
          }}
          className="w-full rounded-lg border border-stone-300/80 bg-white/80 py-2 pl-9 pr-3 text-base text-stone-900 placeholder:text-stone-400 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50 sm:text-sm"
        />
        {open && !disabled && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
            {filtered.map((c) => {
              const price = catalogPriceOf(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  // ต้องเป็น onPointerDown ไม่ใช่ onMouseDown — บนจอสัมผัส mousedown เป็นอีเวนต์
                  // จำลองที่มาหลัง blur ลิสต์ถูกปิดไปก่อน = แตะเลือกไม่ติด
                  onPointerDown={(e) => {
                    e.preventDefault();
                    add(c.name, c.id, price ?? 0);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-brand-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-stone-800">
                      {c.name}
                    </span>
                    {c.search_aliases && (
                      <span className="block truncate text-[11px] text-stone-400">
                        {c.search_aliases}
                      </span>
                    )}
                  </span>
                  {price !== null && (
                    <span className="shrink-0 text-xs tabular-nums text-stone-400">
                      {formatCurrency(price)}
                    </span>
                  )}
                </button>
              );
            })}
            {query.trim() !== "" && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  add(query, null, 0);
                }}
                className="flex w-full cursor-pointer items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm text-brand-700 transition-colors hover:bg-brand-50"
              >
                <Plus size={14} />
                เพิ่ม &quot;{query.trim()}&quot; เป็นหัตถการใหม่ (ไม่มีใน Price
                List)
              </button>
            )}
            {filtered.length === 0 && query.trim() === "" && (
              <p className="px-3 py-2.5 text-sm text-stone-400">
                ยังไม่มีรายการใน Price List
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-stone-400">
        เลือกจาก Price List = ได้ราคาอ้างอิงเป็นต้นทุนตั้งต้น · พิมพ์เอง =
        ต้นทุน ฿0 ไปกรอกทีหลังที่หน้า Influencer Cost
      </p>
    </div>
  );
}
