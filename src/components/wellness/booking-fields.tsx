"use client";

import { Input, Label, Select } from "@/components/ui";
import {
  WELLNESS_DURATION_OPTIONS,
  isWellnessDoctorDay,
  todayBangkokISO,
} from "@/lib/wellness-constants";

/** ค่าที่ต้องกรอกเพื่อลงคิว 1 คิว (ยังไม่รวมว่าเป็นลูกค้าคนไหน) */
export type BookingDraft = {
  date: string;
  time: string;
  duration: number;
  note: string;
};

/** ค่าตั้งต้นของฟอร์มลงคิว — อยู่ระดับโมดูลเพราะอ่านเวลาปัจจุบัน (กฎ react-hooks/purity) */
export function newBookingDraft(date?: string): BookingDraft {
  return {
    date: date ?? todayBangkokISO(),
    time: "10:00",
    duration: 1,
    note: "",
  };
}

/**
 * ช่องกรอกคิวชุดมาตรฐาน — ใช้ทั้ง 3 ที่ที่ลงคิวได้ (หน้าโทรนัด+ลงคิว, ปฏิทิน, หน้าเคส)
 * เพื่อให้กติกาเหมือนกันทุกที่: เลือกได้ 1–3 ชม. และเตือนเมื่อวันที่เลือกไม่ใช่วันแพทย์เข้า
 *
 * ปุ่มบันทึก + การ insert เป็นของผู้เรียก (แต่ละหน้า select คนละรูป) —
 * ข้อความ error ให้ใช้ `apptErrorMessage()` เสมอ ไม่ต้องเขียนเอง
 */
export function BookingFields({
  draft,
  onChange,
  /** วันถูกกำหนดมาแล้ว (เช่นกดจากช่องวันในปฏิทิน) = ไม่ต้องมีช่องเลือกวัน */
  lockedDate = false,
  idPrefix = "wb",
}: {
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  lockedDate?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-3">
      {!lockedDate && (
        <div>
          <Label htmlFor={`${idPrefix}-date`}>วันนัด *</Label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={draft.date}
            onChange={(e) => onChange({ date: e.target.value })}
          />
        </div>
      )}

      {draft.date && !isWellnessDoctorDay(draft.date) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          แพทย์ Wellness เข้าเฉพาะ <b>วันอังคาร</b> และ <b>วันเสาร์</b> —
          วันที่เลือกไม่ตรงวันแพทย์เข้า (ลงได้ถ้าเป็นเคสพิเศษ)
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-time`}>เวลาเริ่ม *</Label>
          <Input
            id={`${idPrefix}-time`}
            type="time"
            value={draft.time}
            onChange={(e) => onChange({ time: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-duration`}>ระยะเวลา</Label>
          <Select
            id={`${idPrefix}-duration`}
            value={String(draft.duration)}
            onChange={(e) => onChange({ duration: Number(e.target.value) })}
          >
            {WELLNESS_DURATION_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} ชั่วโมง
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-note`}>หมายเหตุคิว (ไม่บังคับ)</Label>
        <Input
          id={`${idPrefix}-note`}
          value={draft.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="เช่น ขอคุยเรื่องวิตามินเพิ่ม / มากับญาติ"
        />
      </div>
    </div>
  );
}
