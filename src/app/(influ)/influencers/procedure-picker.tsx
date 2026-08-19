"use client";

/**
 * ตัวเลือก "หัตถการที่รับ" ตอน **สร้างนัดใหม่ (เคส)** — เก็บไว้ใน memory ก่อน
 * (ยังไม่มี influencer_id ให้บันทึก) แล้วค่อย insert เข้า influ_procedure_items ทีเดียวหลังสร้างเคส
 *
 * ต่างจาก ProcedureItemsEditor ที่เขียน DB ทันทีทุกการแก้ (ใช้ใน Stage 2 ของเคสที่มีอยู่แล้ว)
 * — แต่ใช้เมนู/กติกาชื่อ-ราคาชุดเดียวกัน: เลือกจาก Price List = ได้ราคาอ้างอิงมาด้วย,
 *   พิมพ์เอง = ราคา 0 รอไปกรอกที่หน้า Influencer Cost
 *
 * ตั้งแต่ 0080: เลือก product team ก่อน แล้วช่องค้นหาแสดงเฉพาะเมนูของทีมนั้น
 * (aesthetics = price_items + influ_services ที่ทีมเพิ่มเอง / ทีมอื่น = influ_services ล้วน)
 * พิมพ์ชื่อใหม่ = ลงทะเบียนเข้าเมนูของทีมนั้นทันที (ค้นเจอครั้งหน้า) แม้จะยังไม่กดสร้างเคสก็ตาม
 */

import { Plus, Search, Stethoscope, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import {
  DEFAULT_PRODUCT_TEAM,
  INFLU_PRODUCT_TEAMS,
  PROCEDURE_NAME_MAX,
  shortenProgramName,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluProductTeam, InfluServiceRow } from "@/lib/types";
import {
  buildServiceOptions,
  type PriceCatalogEntry,
  registerService,
  TeamPicker,
} from "./procedure-items-editor";

/** หัตถการที่เลือกไว้ (ยังไม่ลง DB) */
export type PickedProcedure = {
  name: string;
  priceItemId: string | null;
  price: number;
  /** หัตถการนี้เป็นของ product team ไหน (0080) */
  team: InfluProductTeam;
};

export function ProcedurePicker({
  picked,
  onChange,
  catalog,
  services,
  onServiceCreated,
  disabled = false,
}: {
  picked: PickedProcedure[];
  onChange: (next: PickedProcedure[]) => void;
  catalog: PriceCatalogEntry[];
  /** ทะเบียนหัตถการที่ทีมเพิ่มเอง (ทุก product team) — influ_services */
  services: InfluServiceRow[];
  /** พิมพ์ชื่อใหม่ = ลงทะเบียนเข้าเมนูทีมทันที — แจ้งกลับให้ parent เขียน log/อัปเดตลิสต์ */
  onServiceCreated?: (service: InfluServiceRow) => void;
  disabled?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<InfluProductTeam>(DEFAULT_PRODUCT_TEAM);
  // รายการที่เพิ่งลงทะเบียนใหม่ใน session นี้ — โผล่ในช่องค้นหาทันทีไม่ต้องรอ refresh
  const [extraServices, setExtraServices] = useState<InfluServiceRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(
    () => buildServiceOptions(catalog, [...services, ...extraServices], team),
    [catalog, services, extraServices, team]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 30);
    // ค้นทั้งชื่อจริงและคำเรียกปากเปล่า (search_aliases) — "botox korea" ต้องเจอ Hutox
    return options
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.aliases ?? "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [options, query]);

  const add = (name: string, priceItemId: string | null, price: number) => {
    const clean = shortenProgramName(
      name,
      priceItemId ? 60 : PROCEDURE_NAME_MAX
    );
    if (!clean) return;
    if (picked.some((p) => p.name === clean && p.team === team)) {
      setQuery("");
      return;
    }
    onChange([...picked, { name: clean, priceItemId, price, team }]);
    setQuery("");
    inputRef.current?.focus();
  };

  /** พิมพ์ชื่อใหม่ = ลงทะเบียนเข้าเมนูของทีมนี้ก่อน (ค้นเจอครั้งหน้า) แล้วค่อยหยิบเข้าลิสต์ */
  const addNewToTeam = async (name: string) => {
    const clean = shortenProgramName(name, PROCEDURE_NAME_MAX);
    if (!clean) return;
    setErr(null);
    const { service, error } = await registerService(supabase, team, clean);
    if (error) {
      setErr(`เพิ่มเข้าเมนูทีมไม่สำเร็จ: ${error}`);
      return;
    }
    if (service) {
      const known = [...services, ...extraServices].some(
        (sv) => sv.id === service.id
      );
      if (!known) {
        setExtraServices((prev) => [...prev, service]);
        onServiceCreated?.(service);
      }
    }
    add(clean, null, Number(service?.default_price) || 0);
  };

  return (
    <div>
      {picked.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {picked.map((p) => (
            <li
              key={`${p.team}:${p.name}`}
              className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white/70 px-3 py-2"
            >
              <Stethoscope size={14} className="shrink-0 text-brand-400" />
              {p.team !== "aesthetics" && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${INFLU_PRODUCT_TEAMS[p.team].chip}`}
                >
                  {INFLU_PRODUCT_TEAMS[p.team].label}
                </span>
              )}
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
                onClick={() =>
                  onChange(
                    picked.filter((x) => !(x.name === p.name && x.team === p.team))
                  )
                }
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90 sm:h-7 sm:w-7"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* เลือก product team ก่อน — ช่องค้นหาด้านล่างแสดงเฉพาะเมนูของทีมนี้ */}
      <div className="mb-2">
        <TeamPicker
          team={team}
          disabled={disabled}
          onChange={(t) => {
            setTeam(t);
            setQuery("");
          }}
        />
      </div>

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
          placeholder={
            team === "aesthetics"
              ? "ค้นหาหัตถการจาก Price List หรือพิมพ์ชื่อเอง..."
              : `ค้นหา/เพิ่มหัตถการของทีม ${INFLU_PRODUCT_TEAMS[team].label}...`
          }
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
              add(first.name, first.priceItemId, first.refPrice ?? 0);
            } else {
              void addNewToTeam(q);
            }
          }}
          className="w-full rounded-lg border border-stone-300/80 bg-white/80 py-2 pl-9 pr-3 text-base text-stone-900 placeholder:text-stone-400 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50 sm:text-sm"
        />
        {open && !disabled && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
            {filtered.map((c) => (
              <button
                key={c.key}
                type="button"
                // ต้องเป็น onPointerDown ไม่ใช่ onMouseDown — บนจอสัมผัส mousedown เป็นอีเวนต์
                // จำลองที่มาหลัง blur ลิสต์ถูกปิดไปก่อน = แตะเลือกไม่ติด
                onPointerDown={(e) => {
                  e.preventDefault();
                  add(c.name, c.priceItemId, c.refPrice ?? 0);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-brand-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-stone-800">
                    {c.name}
                  </span>
                  {c.aliases && (
                    <span className="block truncate text-[11px] text-stone-400">
                      {c.aliases}
                    </span>
                  )}
                </span>
                {c.refPrice !== null && (
                  <span className="shrink-0 text-xs tabular-nums text-stone-400">
                    {formatCurrency(c.refPrice)}
                  </span>
                )}
              </button>
            ))}
            {query.trim() !== "" && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  void addNewToTeam(query);
                }}
                className="flex w-full cursor-pointer items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm text-brand-700 transition-colors hover:bg-brand-50"
              >
                <Plus size={14} />
                เพิ่ม &quot;{query.trim()}&quot; เข้าเมนูทีม{" "}
                {INFLU_PRODUCT_TEAMS[team].label}
              </button>
            )}
            {filtered.length === 0 && query.trim() === "" && (
              <p className="px-3 py-2.5 text-sm text-stone-400">
                ยังไม่มีเมนูของทีมนี้ — พิมพ์ชื่อหัตถการแล้วกด Enter เพื่อเพิ่ม
              </p>
            )}
          </div>
        )}
      </div>
      {err && (
        <p className="mt-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 animate-fade-in">
          {err}
        </p>
      )}
      <p className="mt-1.5 text-xs text-stone-400">
        เลือกทีมก่อนแล้วค้นหาเมนูของทีมนั้น · เลือกจากเมนู = ได้ราคาอ้างอิงเป็นต้นทุนตั้งต้น
        · พิมพ์ชื่อใหม่ = เพิ่มเข้าเมนูของทีมให้ค้นเจอครั้งหน้า (ต้นทุน ฿0
        ไปกรอกทีหลังที่หน้า Influencer Cost)
      </p>
    </div>
  );
}
