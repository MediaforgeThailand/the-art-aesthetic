"use client";

/**
 * ตัวเลือก "หัตถการที่รับ" ตอน **สร้างนัดใหม่ (เคส)** — เก็บไว้ใน memory ก่อน
 * (ยังไม่มี influencer_id ให้บันทึก) แล้วค่อย insert เข้า influ_procedure_items ทีเดียวหลังสร้างเคส
 *
 * ต่างจาก ProcedureItemsEditor ที่เขียน DB ทันทีทุกการแก้ (ใช้ในแท็บรายละเอียดเคสของเคสที่มีอยู่แล้ว)
 * — แต่ใช้เมนู/กติกาชื่อ-ราคาชุดเดียวกัน: เลือกจาก Price List = ได้ราคาอ้างอิงมาด้วย,
 *   พิมพ์เอง = ราคา 0 รอไปกรอกที่หน้า Influencer Cost
 *
 * ตั้งแต่ 0080: เลือก product team ก่อน แล้วช่องค้นหาแสดงเฉพาะเมนูของทีมนั้น
 * (aesthetics = price_items + influ_services ที่ทีมเพิ่มเอง / ทีมอื่น = influ_services ล้วน)
 * พิมพ์ชื่อใหม่ = ลงทะเบียนเข้าเมนูของทีมนั้นทันที (ค้นเจอครั้งหน้า) แม้จะยังไม่กดสร้างเคสก็ตาม
 */

import { Stethoscope, X } from "lucide-react";
import { useMemo, useState } from "react";
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
  type PriceCatalogEntry,
  type PromoCatalogEntry,
  ProcedureDropdown,
  registerService,
  TeamPicker,
} from "./procedure-items-editor";

/** หัตถการที่เลือกไว้ (ยังไม่ลง DB) */
export type PickedProcedure = {
  name: string;
  priceItemId: string | null;
  /** เลือกจากโปรหน้า /price-list (promo_packages — 0090) */
  promoPackageId: string | null;
  price: number;
  /** หัตถการนี้เป็นของ product team ไหน (0080) */
  team: InfluProductTeam;
};

export function ProcedurePicker({
  picked,
  onChange,
  catalog,
  promos,
  services,
  onServiceCreated,
  disabled = false,
}: {
  picked: PickedProcedure[];
  onChange: (next: PickedProcedure[]) => void;
  catalog: PriceCatalogEntry[];
  /** โปรที่ขึ้นหน้า /price-list — ค้นเจอในช่องนี้ด้วย (0090) */
  promos: PromoCatalogEntry[];
  /** ทะเบียนหัตถการที่ทีมเพิ่มเอง (ทุก product team) — influ_services */
  services: InfluServiceRow[];
  /** พิมพ์ชื่อใหม่ = ลงทะเบียนเข้าเมนูทีมทันที — แจ้งกลับให้ parent เขียน log/อัปเดตลิสต์ */
  onServiceCreated?: (service: InfluServiceRow) => void;
  disabled?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [team, setTeam] = useState<InfluProductTeam>(DEFAULT_PRODUCT_TEAM);
  // รายการที่เพิ่งลงทะเบียนใหม่ใน session นี้ — โผล่ใน dropdown ทันทีไม่ต้องรอ refresh
  const [extraServices, setExtraServices] = useState<InfluServiceRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const allServices = useMemo(
    () => [...services, ...extraServices],
    [services, extraServices]
  );

  const add = (
    name: string,
    priceItemId: string | null,
    price: number,
    promoPackageId: string | null = null
  ) => {
    const clean = shortenProgramName(
      name,
      priceItemId || promoPackageId ? 60 : PROCEDURE_NAME_MAX
    );
    if (!clean) return;
    if (picked.some((p) => p.name === clean && p.team === team)) return;
    onChange([...picked, { name: clean, priceItemId, promoPackageId, price, team }]);
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
      const known = allServices.some((sv) => sv.id === service.id);
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

      {/* เลือก product team ก่อน — dropdown ด้านล่างแสดงเฉพาะเมนูของทีมนี้
          ผู้ใช้ 2026-09-03: เปลี่ยนจากช่องพิมพ์ค้นหาที่เปิดค้างเป็นปุ่ม dropdown ปิดโดยปริยาย */}
      <div className="mb-2">
        <TeamPicker team={team} disabled={disabled} onChange={setTeam} />
      </div>

      <ProcedureDropdown
        team={team}
        catalog={catalog}
        promos={promos}
        services={allServices}
        onAdd={(name, priceItemId, refPrice, promoPackageId) =>
          add(name, priceItemId, refPrice, promoPackageId)
        }
        onAddNew={(name) => void addNewToTeam(name)}
        disabled={disabled}
        placeholder={
          team === "aesthetics"
            ? "+ เพิ่มหัตถการจาก Price List..."
            : `+ เพิ่มหัตถการของทีม ${INFLU_PRODUCT_TEAMS[team].label}...`
        }
      />
      {err && (
        <p className="mt-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 animate-fade-in">
          {err}
        </p>
      )}
    </div>
  );
}
