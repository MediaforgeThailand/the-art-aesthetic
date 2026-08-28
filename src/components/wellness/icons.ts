import {
  CalendarDays,
  ClipboardList,
  FlaskConical,
  LayoutGrid,
  PhoneCall,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import type { WellnessIconKey } from "@/lib/wellness-constants";

/**
 * ไอคอนของแต่ละพื้นที่ทำงาน — ค่าคงที่ใน `wellness-constants.ts` เป็นไฟล์ .ts เก็บ JSX ไม่ได้
 * จึงเก็บเป็นคีย์แล้ว map เป็น component ที่นี่ (แพตเทิร์นเดียวกับ QUICK_ICONS ของ prospect-panel)
 *
 * ไฟล์นี้ **ไม่มี "use client"** โดยตั้งใจ — ทั้งหน้า server (หน้าเลือกงาน) และ client
 * (แถบเมนู) import ชุดเดียวกันได้
 */
export const WELLNESS_ICONS: Record<WellnessIconKey, LucideIcon> = {
  register: ClipboardList,
  lab: FlaskConical,
  booking: PhoneCall,
  clinic: Stethoscope,
  calendar: CalendarDays,
  cases: LayoutGrid,
};
