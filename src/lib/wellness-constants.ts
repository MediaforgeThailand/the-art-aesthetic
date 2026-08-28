// ค่าคงที่ + helper ของระบบ Wellness (client-safe — ไม่ import server-only)
//
// flow ของเคส: BC สร้างการ์ดลูกค้า → Lab อัพผลเลือด PDF + กดยืนยัน →
// Admin โทรนัด + ลงคิวปรึกษาแพทย์ → ฟังผลเสร็จ = ปิดเคส
import type { WellnessApptStatus } from "@/lib/database.types";

/* ============================================================
   สถานะเคส — คำนวณจากข้อมูลจริง ไม่มีคอลัมน์ status ใน wellness_customers
   (กติกาเดียวกับ statusOf ของ My List: สถานะต้องเล่าจาก flow ไม่ใช่ให้เลือกเอง)
   ============================================================ */

export type WellnessStatusKey = "awaiting_lab" | "lab_ready" | "booked" | "done";

export const WELLNESS_STATUS: Record<
  WellnessStatusKey,
  {
    label: string;
    /** ใครต้องขยับงานต่อในสถานะนี้ — โชว์ใต้หัวกลุ่มบนบอร์ด */
    hint: string;
    /** ชิปสถานะบนการ์ด/หัวเคส */
    badge: string;
    /** แถบสีซ้ายของกลุ่มบนบอร์ด (แพตเทิร์นเดียวกับ COST_USAGE_META.dot) */
    dot: string;
  }
> = {
  awaiting_lab: {
    label: "รอผลแลบ",
    hint: "ทีม Lab อัพโหลดผลตรวจ + กดยืนยัน",
    badge: "border border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-400",
  },
  lab_ready: {
    label: "ผลพร้อม · รอนัด",
    hint: "Admin โทรนัดลูกค้าเข้าฟังผล แล้วลงคิวแพทย์",
    badge: "border border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-400",
  },
  booked: {
    label: "นัดแล้ว",
    hint: "มีคิวปรึกษาแพทย์แล้ว — รอวันนัด",
    badge: "border border-brand-200 bg-brand-50 text-brand-700",
    dot: "bg-brand-400",
  },
  done: {
    label: "ปิดเคสแล้ว",
    hint: "ฟังผล + ปรึกษาแพทย์เสร็จสมบูรณ์",
    badge: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-400",
  },
};

export const WELLNESS_STATUS_ORDER: WellnessStatusKey[] = [
  "awaiting_lab",
  "lab_ready",
  "booked",
  "done",
];

/** สถานะของเคส — done > booked > lab_ready > awaiting_lab
    (hasScheduledAppt = มีคิว status='scheduled' อย่างน้อย 1 คิว) */
export function wellnessStatusOf(
  customer: { lab_confirmed_at: string | null; completed_at: string | null },
  hasScheduledAppt: boolean
): WellnessStatusKey {
  if (customer.completed_at) return "done";
  if (hasScheduledAppt) return "booked";
  if (customer.lab_confirmed_at) return "lab_ready";
  return "awaiting_lab";
}

/* ============================================================
   คิวปรึกษาแพทย์
   ============================================================ */

/** ระยะเวลาคิวที่ Admin เลือกได้ (กติกาผู้ใช้: 1 / 2 / 3 ชั่วโมงเท่านั้น) */
export const WELLNESS_DURATION_OPTIONS = [1, 2, 3] as const;

export const WELLNESS_APPT_STATUS: Record<
  WellnessApptStatus,
  { label: string; badge: string }
> = {
  scheduled: {
    label: "นัดไว้",
    badge: "border border-brand-200 bg-brand-50 text-brand-700",
  },
  done: {
    label: "เสร็จแล้ว",
    badge: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  cancelled: {
    label: "ยกเลิก",
    badge: "border border-stone-200 bg-stone-50 text-stone-500",
  },
};

/** "10:00:00" | "10:00" → "10:00" (ค่า time จาก Postgres มีวินาทีติดมา) */
export function formatTimeShort(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** เวลาสิ้นสุดคิว — "10:00" + 2 ชม. → "12:00" (คิวไม่มีทางข้ามเที่ยงคืน: เริ่มไม่เกิน 3 ชม.ก่อนหมดวันตามการใช้งานจริงของคลินิก) */
export function apptEndTime(startTime: string, durationHours: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!m) return startTime;
  const end = (Number(m[1]) + durationHours) % 24;
  return `${String(end).padStart(2, "0")}:${m[2]}`;
}

/** ช่วงเวลาอ่านง่าย "10:00–12:00 (2 ชม.)" */
export function apptRangeLabel(startTime: string, durationHours: number): string {
  return `${formatTimeShort(startTime)}–${apptEndTime(startTime, durationHours)} (${durationHours} ชม.)`;
}

/** ข้อความไทยเมื่อคิวชนกัน — exclusion constraint ใน DB คืน error code 23P01
    (ใช้ทั้งหน้าการ์ดลูกค้าและปฏิทิน — ที่ไหน insert/ย้ายคิวเป็น scheduled ต้องดักโค้ดนี้) */
export const WELLNESS_OVERLAP_MESSAGE =
  "ช่วงเวลานี้ชนกับคิวที่มีอยู่ — เลือกเวลาอื่นหรือเช็คปฏิทินคิวแพทย์ก่อน";

/** แพทย์ Wellness เข้าเฉพาะ อังคาร/เสาร์ (กติกาผู้ใช้ — แต่ปฏิทินเปิดลงคิวได้ทุกวัน
    แค่เตือน ไม่บล็อค เผื่อวันเข้าเปลี่ยน) — dateStr = YYYY-MM-DD */
export function isWellnessDoctorDay(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 2 || day === 6;
}

/* ============================================================
   อื่นๆ
   ============================================================ */

/** ชื่อเต็มของลูกค้า (การ์ดเก่าอาจมีแต่ชื่อ) */
export function wellnessCustomerName(customer: {
  first_name: string;
  last_name: string;
}): string {
  return (
    `${customer.first_name} ${customer.last_name}`.trim() || "(ไม่ระบุชื่อ)"
  );
}

/** path ไฟล์ผล lab ใน bucket documents — ชื่อ object เป็น ascii ล้วน
    (ชื่อไฟล์จริงเก็บใน wellness_lab_files.file_name — ชื่อไทยแสดงจากคอลัมน์นั้น)
    อยู่ระดับโมดูลเพราะเรียก Date.now() (กฎ react-hooks/purity) */
export function newLabFilePath(
  customerId: string,
  fileName: string,
  index = 0
): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const ext = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `wellness/${customerId}/${Date.now()}-${index}${ext ? `.${ext}` : ""}`;
}

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ปฏิทิน/ฟอร์มนัดต้องอิงเวลาไทยเสมอ
    อยู่ระดับโมดูลเพราะอ่านเวลาปัจจุบัน */
export function todayBangkokISO(): string {
  const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return bkk.toISOString().slice(0, 10);
}

/** select ของคิวพร้อมข้อมูลลูกค้า + ไฟล์ผลแลบ — ใช้ทั้ง page.tsx (server) และ
    insert ใน calendar-client (สองที่ต้องคืนรูปเดียวกันเสมอไม่งั้น state หลังลงคิวขาดข้อมูล)
    **ต้องอยู่ไฟล์นี้ ห้ามย้ายไป calendar-client**: ค่า runtime ที่ export จากไฟล์
    "use client" จะกลายเป็น client-reference proxy เมื่อ server component import
    → supabase เรียก .split() แล้วพังทั้งหน้า (บั๊กจริงที่เจอจาก e2e 2026-08-28) */
export const CALENDAR_APPT_SELECT =
  "*, customer:wellness_customers(id, first_name, last_name, phone, procedure_text, lab_confirmed_at, completed_at, lab_files:wellness_lab_files(id, file_path, file_name, created_at))";
