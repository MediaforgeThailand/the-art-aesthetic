"use client";

/**
 * ตัวเปิดวงเงินด้วย voucher (migration 0106, ผู้ใช้ 2026-09-03)
 *
 * "การเพิ่มสินค้า หลังจากนี้จะเป็นรูปแบบการเปิดวงเงินแต่จะไม่ใช่จำนวนเงินเลย ...
 *  เพิ่มจำนวน voucher ราคา 10k ... ให้คนกรอกกดเลือกว่าเปิดวงเงินเท่าไหร่ เช่น 50k
 *  ก็จะเป็น voucher 10k * 5"
 *
 * รอบสอง (ผู้ใช้ 2026-09-03 เพิ่มเติม): "ui เลือก voucher ให้เป็นช่องใส่จำนวน
 * แล้วแสดงว่าจำนวนเท่าไหร่ ในมูลค่ารวมเอาด้วย" — ยุบจากปุ่มลัด+ตัวเพิ่ม/ลด เหลือ
 * **ช่องกรอกตัวเลขล้วนตัวเดียว** ส่วนความคุ้มค่า/เทียบกับมูลค่าสินค้าที่เลือกไว้ย้ายไปแสดง
 * ที่กล่อง "มูลค่าเคสรวม" ของฟอร์ม (ผ่าน voucherLabelOf) แทนที่จะมีอยู่ในตัวช่องนี้เอง
 *
 * กติกาที่ต้องรักษา:
 * - **หน่วยของจริงคือ "ใบ" ไม่ใช่ "บาท"** — ค่าที่กรอก/บันทึกคือจำนวนใบเสมอ
 *   (ปลายทางต้องออก voucher จริงในระบบ POS)
 * - ราคาต่อใบมาจาก `unit` ของเคส (คอลัมน์ voucher_unit) **ไม่ใช่ค่าคงที่ที่อ่านสด** —
 *   เคสเก่าที่เปิดวงเงินตอนราคาอื่นต้องยังอ่านยอดเดิมได้ถูก
 * - ใช้ทั้งในฟอร์ม "สร้างนัดใหม่" และแท็บ "รายละเอียดเคส" — markup ชุดเดียว ห้าม copy
 */

import { Ticket } from "lucide-react";
import { Input, Label } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

export function VoucherPicker({
  count,
  unit,
  onChange,
  disabled = false,
}: {
  count: number;
  unit: number;
  onChange: (count: number) => void;
  disabled?: boolean;
}) {
  const credit = count > 0 ? count * unit : 0;
  const set = (next: number) => {
    if (disabled) return;
    onChange(Math.max(0, Math.min(999, Math.trunc(next) || 0)));
  };

  return (
    <div>
      <Label htmlFor="voucher-count" className="flex items-center gap-1.5">
        <Ticket size={14} className="text-brand-500" />
        จำนวน Voucher * (ใบละ {formatCurrency(unit)})
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="voucher-count"
          type="number"
          min={0}
          max={999}
          inputMode="numeric"
          disabled={disabled}
          value={count === 0 ? "" : String(count)}
          onChange={(e) => set(Number(e.target.value))}
          className="w-24"
        />
        <span className="text-sm text-stone-500">ใบ</span>
        {credit > 0 && (
          <span className="ml-auto shrink-0 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand-700">
            = {formatCurrency(credit)}
          </span>
        )}
      </div>
    </div>
  );
}
