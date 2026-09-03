"use client";

/**
 * ตัวเปิดวงเงินด้วย voucher (migration 0106, ผู้ใช้ 2026-09-03)
 *
 * "การเพิ่มสินค้า หลังจากนี้จะเป็นรูปแบบการเปิดวงเงินแต่จะไม่ใช่จำนวนเงินเลย ...
 *  เพิ่มจำนวน voucher ราคา 10k ... ให้คนกรอกกดเลือกว่าเปิดวงเงินเท่าไหร่ เช่น 50k
 *  ก็จะเป็น voucher 10k * 5"
 *
 * กติกาที่ต้องรักษา:
 * - **หน่วยของจริงคือ "ใบ" ไม่ใช่ "บาท"** — ปุ่มลัดโชว์เป็นยอดเงินเพราะคนคิดเป็นยอด
 *   แต่ค่าที่บันทึกคือจำนวนใบเสมอ (ปลายทางต้องออก voucher จริงในระบบ POS)
 * - ราคาต่อใบมาจาก `unit` ของเคส (คอลัมน์ voucher_unit) **ไม่ใช่ค่าคงที่ที่อ่านสด** —
 *   เคสเก่าที่เปิดวงเงินตอนราคาอื่นต้องยังอ่านยอดเดิมได้ถูก
 * - ใช้ทั้งในฟอร์ม "สร้างนัดใหม่" และแท็บ "รายละเอียดเคส" — markup ชุดเดียว ห้าม copy
 */

import { Minus, Plus, Ticket } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { INFLU_VOUCHER_PRESETS } from "@/lib/influ-constants";

export function VoucherPicker({
  count,
  unit,
  onChange,
  disabled = false,
  /** ยอดรวมราคาสินค้าที่เลือกไว้ — โชว์ประกอบให้คนกรอกเคาะวงเงินได้ (ไม่เข้าสมการมูลค่า) */
  itemsTotal,
}: {
  count: number;
  unit: number;
  onChange: (count: number) => void;
  disabled?: boolean;
  itemsTotal: number;
}) {
  const credit = count > 0 ? count * unit : 0;
  const set = (next: number) => {
    if (disabled) return;
    onChange(Math.max(0, Math.min(999, Math.trunc(next) || 0)));
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <Ticket size={14} className="text-brand-500" />
          วงเงินที่เปิดให้ (Voucher ใบละ {formatCurrency(unit)})
        </p>
        {credit > 0 && (
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 tabular-nums">
            {formatCurrency(credit)}
          </span>
        )}
      </div>

      {/* ปุ่มลัด: โชว์เป็นยอดเงินเพราะคนเคาะวงเงินเป็นยอด แต่ค่าที่เก็บคือจำนวนใบ */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {INFLU_VOUCHER_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => set(count === n ? 0 : n)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-all active:scale-[0.97] disabled:opacity-60 max-sm:min-h-11 ${
              count === n
                ? "border-brand-500 bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                : "border-stone-200 bg-white text-stone-600 hover:border-brand-300 hover:text-brand-700"
            }`}
          >
            {formatCurrency(n * unit)}
          </button>
        ))}
      </div>

      {/* จำนวนใบ — ยอดที่ไม่ตรงปุ่มลัด (เช่น 7 ใบ = 70,000) กรอกที่นี่ */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500">จำนวนใบ</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="ลดจำนวน voucher"
            disabled={disabled || count <= 0}
            onClick={() => set(count - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-40 max-sm:h-11 max-sm:w-11"
          >
            <Minus size={15} />
          </button>
          <input
            type="number"
            min="0"
            max="999"
            aria-label="จำนวน voucher"
            disabled={disabled}
            value={count === 0 ? "" : String(count)}
            onChange={(e) => set(Number(e.target.value))}
            placeholder="0"
            className="h-9 w-16 rounded-lg border border-stone-200 bg-white text-center text-base tabular-nums text-stone-800 placeholder:text-stone-500 focus:border-brand-400 focus:outline-none disabled:opacity-60 sm:text-sm max-sm:h-11"
          />
          <button
            type="button"
            aria-label="เพิ่มจำนวน voucher"
            disabled={disabled}
            onClick={() => set(count + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-40 max-sm:h-11 max-sm:w-11"
          >
            <Plus size={15} />
          </button>
        </div>
        {/* มูลค่าสินค้าที่เลือก = ข้อมูลประกอบ ไม่ใช่คำอธิบาย จึงไม่ใช่สีจาง (กติกา UI ของระบบ) */}
        {itemsTotal > 0 && (
          <span className="text-xs text-stone-600">
            มูลค่าสินค้าที่เลือกไว้{" "}
            <b className="tabular-nums">{formatCurrency(itemsTotal)}</b>
            {credit > 0 && credit < itemsTotal && (
              <span className="ml-1 font-medium text-amber-700">
                (วงเงินน้อยกว่ามูลค่าสินค้า)
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
