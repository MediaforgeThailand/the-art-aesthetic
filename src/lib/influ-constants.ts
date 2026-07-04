import type { InfluTier } from "./types";

/* ---------- Tier ตามยอดผู้ติดตาม (ตามแบบฟอร์มขออนุมัติเคส) ---------- */

export const INFLU_TIERS: Record<
  InfluTier,
  { label: string; range: string; badge: string }
> = {
  nano: {
    label: "Nano",
    range: "< 50,000",
    badge: "bg-stone-100 text-stone-600",
  },
  micro: {
    label: "Micro",
    range: "50,000 - 100,000",
    badge: "bg-sky-100 text-sky-700",
  },
  mid: {
    label: "Mid-Tier",
    range: "100,000 - 300,000",
    badge: "bg-violet-100 text-violet-700",
  },
  macro: {
    label: "Macro",
    range: "300,000 - 1,000,000",
    badge: "bg-amber-100 text-amber-700",
  },
  celebrity: {
    label: "Celebrity",
    range: "1,000,000 ขึ้นไป",
    badge: "bg-pink-100 text-pink-700",
  },
};

export const INFLU_TIER_ORDER: InfluTier[] = [
  "nano",
  "micro",
  "mid",
  "macro",
  "celebrity",
];

/** คำนวณ Tier อัตโนมัติจากยอดผู้ติดตาม */
export function tierFromFollowers(followers: number): InfluTier {
  if (followers >= 1_000_000) return "celebrity";
  if (followers >= 300_000) return "macro";
  if (followers >= 100_000) return "mid";
  if (followers >= 50_000) return "micro";
  return "nano";
}

/* ---------- Stage ของ pipeline ---------- */

export const INFLU_STAGES: { step: number; title: string; short: string }[] = [
  { step: 1, title: "ติดต่อ / Follow up", short: "ติดต่อ" },
  { step: 2, title: "เก็บรายละเอียดเคส", short: "รายละเอียด" },
  { step: 3, title: "Memo ขออนุมัติ", short: "Memo" },
  { step: 4, title: "เซนสัญญา", short: "สัญญา" },
  { step: 5, title: "วันเข้ารับบริการ", short: "รับบริการ" },
  { step: 6, title: "Follow up งาน", short: "ตามงาน" },
];

/* ---------- ผู้เซน memo (preset ตามแบบฟอร์มจริง — ผู้จัดทำเป็นคนใหม่ทุกครั้ง) ---------- */

export type MemoRole =
  | "maker"
  | "checker1"
  | "checker2"
  | "approver1"
  | "approver2";

export const MEMO_SIGNERS: {
  role: MemoRole;
  heading: string;
  name: string | null; // null = ผู้จัดทำ กรอกชื่อเอง
  position: string | null;
}[] = [
  { role: "maker", heading: "ผู้จัดทำ", name: null, position: null },
  {
    role: "checker1",
    heading: "ผู้ตรวจสอบ",
    name: "คุณปิยะวัฒน์ วรสิงห์",
    position: "Project and sales Manager",
  },
  {
    role: "checker2",
    heading: "ผู้ตรวจสอบ",
    name: "คุณชิตพล อินทรจันทร์",
    position: "Branding Director",
  },
  {
    role: "approver1",
    heading: "ผู้อนุมัติ",
    name: "คุณอิสริยา แก้วสมนึก",
    position: "Assist VCEO",
  },
  {
    role: "approver2",
    heading: "ผู้อนุมัติ",
    name: "คุณนมนรร ชื่นสุวรรณ",
    position: "Acting CEO Hospital Unit.",
  },
];

export const MEMO_COMPANY = {
  name: "บริษัท อาทออฟเซอร์เจอร์รี่ จำกัด (สำนักงานใหญ่)",
  address:
    "เลขที่ 287 ถนนวิภาวดีรังสิต แขวงสนามบิน ดอนเมือง กรุงเทพมหานคร 10210",
  phone: "โทร. 02-6664666",
  formTitle: "แบบฟอร์มขออนุมัติเคสทางการตลาด",
  to: "รองประธานเจ้าหน้าที่บริหาร (ธุรกิจ)",
  attachments:
    "1. สัญญาโฆษณาประชาสัมพันธ์ Influencer  2. เอกสารแนบท้ายสัญญา",
  purpose:
    "ทางฝ่ายการตลาดมีความประสงค์ขออนุมัติเคสทางการตลาดเพื่อใช้โปรโมทหัตถการ Aesthetic เพื่อใช้โปรโมทสร้างภาพลักษณ์ให้กับองค์กร โดยทำสัญญา ระยะเวลา 6 เดือน ตามรายละเอียด ดังนี้",
};

/* ---------- Stage 6: template follow-up 10 step ----------
   offsetDays นับจากวันเข้ารับบริการ (service_date) — {ชื่อเล่น} จะถูกแทนตอน generate */

export const FOLLOWUP_TEMPLATE: {
  step: number;
  title: string;
  offsetDays: number;
  channel: string;
  script: string;
}[] = [
  {
    step: 1,
    title: "ขอบคุณหลังรับบริการ + ขอรูป Before",
    offsetDays: 1,
    channel: "LINE กลุ่ม: The ART x {ชื่อเล่น}",
    script:
      "สวัสดีค่ะคุณ{ชื่อเล่น} ขอบคุณที่ไว้วางใจ The ART นะคะ 💕 ทีมขออนุญาตติดตามผลหลังทำหัตถการ และรบกวนขอรูป Before ที่ถ่ายไว้เพื่อใช้ประกอบคอนเทนต์ค่ะ",
  },
  {
    step: 2,
    title: "ติดตามอาการหลังทำ (Day 3)",
    offsetDays: 3,
    channel: "LINE กลุ่ม: The ART x {ชื่อเล่น}",
    script:
      "สอบถามอาการหลังทำหัตถการค่ะคุณ{ชื่อเล่น} บวม/ช้ำลดลงไหมคะ ถ้ามีข้อสงสัยทักได้เลยนะคะ ทีมแพทย์พร้อมดูแลค่ะ 🙏",
  },
  {
    step: 3,
    title: "นัดวันถ่ายคอนเทนต์ / ขอคิวโพส",
    offsetDays: 7,
    channel: "LINE กลุ่ม: The ART x {ชื่อเล่น}",
    script:
      "คุณ{ชื่อเล่น}คะ ผลเริ่มเข้าที่แล้ว 🎉 ทีมขอนัดคิวถ่ายคอนเทนต์/รีวิว และขอทราบคิวโพสคลิปคร่าวๆ ได้ไหมคะ",
  },
  {
    step: 4,
    title: "ขอดู Draft คลิป/คอนเทนต์",
    offsetDays: 10,
    channel: "LINE กลุ่ม: The ART x {ชื่อเล่น}",
    script:
      "รบกวนขอดู draft คลิปก่อนโพสนะคะคุณ{ชื่อเล่น} เพื่อเช็คการแท็ก @theart และข้อความตามสัญญาค่ะ ขอบคุณค่ะ 🙏",
  },
  {
    step: 5,
    title: "ยืนยันวันโพสคลิปหลัก",
    offsetDays: 14,
    channel: "LINE กลุ่ม: The ART x {ชื่อเล่น}",
    script:
      "ยืนยันคิวโพสคลิปหลักของคุณ{ชื่อเล่น}นะคะ ทีมจะช่วย boost และแชร์ต่อทุกช่องทางค่ะ 🚀",
  },
  {
    step: 6,
    title: "เก็บลิงก์คลิป + ยอด engagement รอบแรก",
    offsetDays: 17,
    channel: "ภายในทีม (บันทึกในระบบ)",
    script:
      "เก็บลิงก์คลิปของคุณ{ชื่อเล่น} + ยอดวิว/ไลก์/คอมเมนต์ ณ 72 ชม.แรก ลงรายงานการตลาดค่ะ",
  },
  {
    step: 7,
    title: "ตามโพส IG Story / TikTok ครั้งที่ 2",
    offsetDays: 30,
    channel: "LINE กลุ่ม: The ART x {ชื่อเล่น}",
    script:
      "คุณ{ชื่อเล่น}คะ ตามสัญญามีคอนเทนต์รอบที่ 2 นะคะ สะดวกลง Story/คลิปสั้นช่วงไหนดีคะ เดี๋ยวทีมเตรียมข้อมูลให้ค่ะ 😊",
  },
  {
    step: 8,
    title: "อัพเดทผลลัพธ์หัตถการ (Day 45)",
    offsetDays: 45,
    channel: "LINE กลุ่ม: The ART x {ชื่อเล่น}",
    script:
      "ผ่านมา 1 เดือนครึ่งแล้ว ผลลัพธ์ของคุณ{ชื่อเล่น}เป็นยังไงบ้างคะ รบกวนขอรูป After ล่าสุดเพื่อทำคอนเทนต์ Before/After ค่ะ ✨",
  },
  {
    step: 9,
    title: "เก็บสถิติ engagement รวบยอด",
    offsetDays: 60,
    channel: "ภายในทีม (บันทึกในระบบ)",
    script:
      "รวบรวมยอด engagement ทุกโพสของคุณ{ชื่อเล่น} สรุปเป็นรายงาน ROI ส่งหัวหน้างานค่ะ",
  },
  {
    step: 10,
    title: "สรุปผลแคมเปญ + ประเมินต่อสัญญา",
    offsetDays: 90,
    channel: "ประชุมทีมการตลาด",
    script:
      "สรุปผลแคมเปญคุณ{ชื่อเล่น}: ยอดรวม, ลูกค้าที่เข้ามาจากโค้ด/ลิงก์, ความคุ้มค่า และเสนอว่าควรต่อสัญญา/ชวนร่วม campaign ถัดไปหรือไม่",
  },
];

/** เดดไลน์สัญญา = contract_start + contract_months
    หนีบวันที่ไว้ที่วันสุดท้ายของเดือนปลายทาง — กัน 31 ส.ค. + 6 เดือน ล้นไป 3 มี.ค. */
export function contractEndDate(
  contractStart: string,
  months: number
): string {
  const d = new Date(contractStart);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTarget));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
