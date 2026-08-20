import { todayISO } from "./format";
import type {
  InfluCalendarKind,
  InfluFollowupMode,
  InfluPostKind,
  InfluProductTeam,
  InfluProspectStatus,
  InfluSizeGroup,
  InfluTier,
} from "./types";

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

/* ---------- Product team ของหัตถการ (migration 0080) ----------
   บริษัทแบ่งทีมสินค้าแยกกัน — เลือกทีมก่อนแล้วช่องค้นหาหัตถการจะขึ้นตามทีมที่เลือก
   aesthetics ใช้ price_items เป็นเมนูหลัก + influ_services ที่ทีมเพิ่มเอง
   ทีมอื่นใช้ influ_services (ทีมเพิ่มเองทั้งหมด — ยังไม่มีเมนูกลาง)
   เพิ่มทีมใหม่ต้องแก้ 3 ที่: type InfluProductTeam, ตารางนี้ และ check constraint (migration ใหม่) */

export const INFLU_PRODUCT_TEAMS: Record<
  InfluProductTeam,
  { label: string; chip: string }
> = {
  aesthetics: {
    label: "Aesthetics (สกิน)",
    chip: "border border-brand-200 bg-brand-50 text-brand-700",
  },
  breast: {
    label: "หน้าอก",
    chip: "border border-rose-200 bg-rose-50 text-rose-700",
  },
  abdomen: {
    label: "หนังหน้าท้อง",
    chip: "border border-amber-200 bg-amber-50 text-amber-700",
  },
  lipo: {
    label: "ดูดไขมัน",
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
  },
};

export const INFLU_PRODUCT_TEAM_ORDER: InfluProductTeam[] = [
  "aesthetics",
  "breast",
  "abdomen",
  "lipo",
];

export const DEFAULT_PRODUCT_TEAM: InfluProductTeam = "aesthetics";

/** ตัวเลือกแพลตฟอร์มแนะนำของช่องทางติดต่อในโปรไฟล์ (พิมพ์ชื่ออื่นเองได้ — เก็บเป็น text อิสระ) */
export const INFLU_CHANNEL_PLATFORMS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "YouTube",
  "X (Twitter)",
  "Lemon8",
  "Line",
  "อื่นๆ",
] as const;
/* ---------- บอร์ด Hunting — pipeline คนที่ยังไม่ตอบรับ (migration 0081) ---------- */

/** สถานะบนบอร์ด Hunting — ป้าย/สี/คำอธิบายคอลัมน์
    เพิ่มสถานะใหม่ต้องแก้ 3 ที่: type InfluProspectStatus (database.types),
    ตารางนี้ และ check constraint influ_prospects_status_valid (migration ใหม่) */
export const INFLU_PROSPECT_STATUSES: Record<
  InfluProspectStatus,
  { label: string; desc: string; chip: string; dot: string }
> = {
  new: {
    label: "ยังไม่ติดต่อ",
    desc: "เจอมาแล้ว จดชื่อไว้ก่อน ยังไม่ได้ทัก",
    chip: "border border-stone-200 bg-stone-50 text-stone-600",
    dot: "bg-stone-400",
  },
  contacted: {
    label: "ทักแล้ว รอตอบ",
    desc: "ส่งข้อความไปแล้ว รอเขาตอบกลับ",
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  negotiating: {
    label: "กำลังคุยรายละเอียด",
    desc: "ตอบกลับแล้ว กำลังคุยเงื่อนไข/หัตถการ",
    chip: "border border-brand-200 bg-brand-50 text-brand-700",
    dot: "bg-brand-500",
  },
  accepted: {
    label: "ตอบรับแล้ว",
    desc: "เข้าระบบแล้ว — มีโปรไฟล์ พร้อมสร้างนัด",
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  declined: {
    label: "ปฏิเสธ",
    desc: "ไม่รับงาน/เงื่อนไขไม่ลงตัว",
    chip: "border border-rose-200 bg-rose-50 text-rose-600",
    dot: "bg-rose-400",
  },
};

export const INFLU_PROSPECT_STATUS_ORDER: InfluProspectStatus[] = [
  "new",
  "contacted",
  "negotiating",
  "accepted",
  "declined",
];

/** คอลัมน์บนบอร์ด Hunting — declined ไม่เป็นคอลัมน์ (ดูผ่านชิปสลับมุมมอง) */
export const INFLU_PROSPECT_COLUMNS: InfluProspectStatus[] = [
  "new",
  "contacted",
  "negotiating",
  "accepted",
];

/** สถานะที่ยังต้องตามงานอยู่ — ใช้นับเตือน "ถึงกำหนดตาม" (accepted/declined จบแล้ว) */
export const INFLU_PROSPECT_ACTIVE: InfluProspectStatus[] = [
  "new",
  "contacted",
  "negotiating",
];

/** ปุ่มบันทึกการติดต่อแบบกดครั้งเดียวบนโมดัล Hunting (ผู้ใช้ 2026-08-19:
    "ให้เป็นแค่ปุ่ม กดว่าโทร/ทัก พอกดแล้วบันทึกว่าวันไหนที่โทรไป")
    กดปุ่ม = insert influ_prospect_contacts ของวันนี้ทันที ไม่มีฟอร์มให้กรอกก่อน;
    channel เป็น text อิสระในตาราง ข้อมูลเก่าที่พิมพ์เองไว้ (เช่น "Instagram DM")
    ยังแสดงบนลิสต์ได้ตามเดิม — ตารางนี้คุมแค่ "ปุ่มลัดที่มีให้กด" */
export const INFLU_CONTACT_QUICK = [
  { channel: "โทร", label: "โทร", icon: "phone" },
  { channel: "ทัก", label: "ทัก", icon: "message" },
] as const;

/* ---------- กลุ่มขนาดบนบอร์ด 3 คอลัมน์ (เล็ก / กลาง / ใหญ่) ---------- */

export const INFLU_SIZE_GROUPS: Record<
  InfluSizeGroup,
  { label: string; range: string; dot: string; headerText: string }
> = {
  s: {
    label: "เล็ก",
    range: "ต่ำกว่า 100K",
    dot: "bg-sky-400",
    headerText: "text-sky-700",
  },
  m: {
    label: "กลาง",
    range: "100K – 1M",
    dot: "bg-violet-400",
    headerText: "text-violet-700",
  },
  l: {
    label: "ใหญ่",
    range: "1M ขึ้นไป",
    dot: "bg-pink-400",
    headerText: "text-pink-700",
  },
};

export const INFLU_SIZE_GROUP_ORDER: InfluSizeGroup[] = ["s", "m", "l"];

/** จัดกลุ่มขนาดอัตโนมัติจากยอดผู้ติดตาม (ยังไม่กรอก = เล็ก) */
export function sizeGroupFromFollowers(
  followers: number | null
): InfluSizeGroup {
  if (followers !== null && followers >= 1_000_000) return "l";
  if (followers !== null && followers >= 100_000) return "m";
  return "s";
}

/* ---------- รอบงาน (0073): โปรไฟล์ 1 คน มีการ์ด/เคสได้หลายรอบ ---------- */

/** ป้าย "รอบ N" ของเคส — รอบแรกไม่โชว์ (เคสส่วนใหญ่มีรอบเดียว ไม่ต้องรกจอ)
    ใช้ทุกที่ที่ชื่อ influ อาจซ้ำกันข้ามรอบ: การ์ดบอร์ด / ตัวเลือกในฟอร์ม / หน้า cost-สัญญา */
export function roundLabel(roundNo: number): string | null {
  return roundNo > 1 ? `รอบ ${roundNo}` : null;
}

/* ---------- Influ Calendar: ประเภทคิวบนปฏิทิน (/influ-calendar) ----------
   เพิ่มชนิดใหม่ต้องแก้ 3 ที่: InfluCalendarKind (database.types), ตารางนี้
   และ check constraint ของ influ_calendar_events (migration ใหม่) */

export const INFLU_CALENDAR_KINDS: Record<
  InfluCalendarKind,
  {
    label: string;
    short: string;
    chip: string;
    dot: string;
    /** ขอบซ้ายเข้มของชิปในช่องวัน — แยกประเภทด้วยสีขอบให้กวาดตาเจอเร็ว */
    edge: string;
    /** แท่งสีทึบตัวหนังสือขาว (ชิปคิวบนกริดปฏิทินแบบ TimeTree) — เลือกเฉดที่ contrast พอ */
    solid: string;
  }
> = {
  service: {
    label: "เข้ารับบริการ / ทำหัตถการ",
    short: "รับบริการ",
    chip: "bg-brand-100 text-brand-800 border-brand-200",
    dot: "bg-brand-500",
    edge: "border-l-brand-500",
    solid: "bg-brand-500",
  },
  shoot: {
    label: "ถ่ายทำ / ถ่ายคอนเทนต์",
    short: "ถ่ายทำ",
    chip: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    edge: "border-l-violet-500",
    solid: "bg-violet-500",
  },
  post: {
    label: "คิวโพสต์ / ลงคลิป",
    short: "โพสต์",
    chip: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    edge: "border-l-sky-500",
    solid: "bg-sky-600",
  },
  meeting: {
    label: "นัดคุย / ประชุม",
    short: "นัดคุย",
    chip: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    edge: "border-l-amber-500",
    solid: "bg-amber-600",
  },
  followup: {
    label: "ติดตามงาน / ส่งภาพอัปเดต",
    short: "ตามงาน",
    chip: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    edge: "border-l-emerald-500",
    solid: "bg-emerald-600",
  },
  other: {
    label: "อื่นๆ",
    short: "อื่นๆ",
    chip: "bg-stone-100 text-stone-600 border-stone-200",
    dot: "bg-stone-400",
    edge: "border-l-stone-400",
    solid: "bg-stone-500",
  },
};

export const INFLU_CALENDAR_KIND_ORDER: InfluCalendarKind[] = [
  "service",
  "shoot",
  "post",
  "meeting",
  "followup",
  "other",
];

/** เวลาแบบสั้นจากค่า time ของ Postgres ("14:30:00" → "14:30") */
export function shortTime(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

/** ป้ายเวลาของคิว — ไม่กรอกเวลา = "ทั้งวัน", มีเวลาสิ้นสุด = ช่วงเวลา */
export function calendarTimeLabel(
  start: string | null,
  end: string | null
): string {
  const s = shortTime(start);
  if (!s) return "ทั้งวัน";
  const e = shortTime(end);
  return e ? `${s} – ${e}` : s;
}

/* ---------- Stage ของ pipeline ----------
   ปรับเป็น 5 ขั้นเมื่อ 2026-08-07 (migration 0062) ตามคำสั่งผู้ใช้:
   - "เซนสัญญา" (เดิม 4) กับ "วันเข้ารับบริการ" (เดิม 5) รวมเป็นขั้นเดียว เพราะสัญญาถูกเซน
     และอัพโหลดตอน influ เข้ามารับบริการอยู่แล้ว — เป็นงานวันเดียวกัน
   - "Follow up งาน" เลื่อนจาก 6 → 5
   **ห้ามเทียบเลข stage ตรงๆ ในโค้ดใหม่ — ใช้ค่าคงที่ INFLU_STAGE ด้านล่างเสมอ**
   (การรวมขั้นครั้งนี้ต้องไล่แก้เลขดิบทั้งระบบ เพราะเดิมกระจายอยู่หลายไฟล์) */

/** เลขขั้นของแต่ละ stage — ใช้แทนเลขดิบทุกที่ */
export const INFLU_STAGE = {
  /** 1. ติดต่อ / follow up ก่อนตอบรับ */
  contact: 1,
  /** 2. เก็บรายละเอียดเคส (โปรแกรม/ยอดผู้ติดตาม/แพทย์) */
  caseDetail: 2,
  /** 3. Memo ขออนุมัติ — อัพไฟล์ Memo ที่อนุมัติแล้ว = ผ่านขั้นนี้อัตโนมัติ */
  memo: 3,
  /** 4. เซนสัญญา + วันเข้ารับบริการ (ขั้นรวม) */
  contractService: 4,
  /** 5. Follow up งานตามเอกสารแนบท้ายสัญญา (ขั้นสุดท้าย) */
  followup: 5,
} as const;

/** ขั้นสุดท้ายของ pipeline — ใช้กับ stepper / เคสที่ปิดงานแล้ว */
export const INFLU_STAGE_LAST = INFLU_STAGE.followup;

/** วันเริ่มนับสัญญา 6 เดือน (เกณฑ์ผู้ใช้ 2026-08-07) — ใช้ "วันรับบริการ" ที่กรอกไว้
    เพราะสัญญาถูกเซนวันที่ influ เข้ามารับบริการ; ยังไม่กรอกวันค่อยตกไปใช้วันที่อัพไฟล์สัญญา
    (วันนี้ตามเวลาไทย — ไม่อิงนาฬิกาเครื่องผู้ใช้) */
export function contractStartFor(c: { service_date: string | null }): string {
  return c.service_date ?? todayISO();
}

export const INFLU_STAGES: { step: number; title: string; short: string }[] = [
  { step: INFLU_STAGE.contact, title: "ติดต่อ / Follow up", short: "ติดต่อ" },
  { step: INFLU_STAGE.caseDetail, title: "เก็บรายละเอียดเคส", short: "รายละเอียด" },
  { step: INFLU_STAGE.memo, title: "Memo ขออนุมัติ", short: "Memo" },
  {
    step: INFLU_STAGE.contractService,
    title: "เซนสัญญา + วันรับบริการ",
    short: "สัญญา/รับบริการ",
  },
  { step: INFLU_STAGE.followup, title: "Follow up งาน", short: "ตามงาน" },
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

/** ไฟล์แม่แบบสัญญา Influencer (PDF ให้ดาวน์โหลดไปพิมพ์/เซน) — เก็บในบัคเก็ต documents (path templates/)
    2 ฉบับ: สัญญาหลัก + เอกสารแนบท้าย (ใช้ร่วมทุก influencer) */
export const INFLU_CONTRACT_TEMPLATES: {
  path: string;
  name: string;
  label: string;
}[] = [
  {
    path: "templates/influencer-contract.pdf",
    name: "สัญญารีวิว-Influencer-The-ART.pdf",
    label: "สัญญารีวิวโฆษณาประชาสัมพันธ์ Influencer",
  },
  {
    path: "templates/influencer-contract-annex.pdf",
    name: "เอกสารแนบท้ายสัญญา-Influencer-The-ART.pdf",
    label: "เอกสารแนบท้ายสัญญา (เงื่อนไขการทำเคส)",
  },
];

/* ---------- ขั้น Follow up: ลิงก์โพส/คอมเมนต์ที่ influ ลงจริง (ตาราง influ_post_links) ---------- */

export const INFLU_POST_KINDS: Record<
  InfluPostKind,
  { label: string; chip: string; hint: string }
> = {
  post: {
    label: "โพส",
    chip: "bg-sky-100 text-sky-700 border-sky-200",
    hint: "คลิปรีวิว / โพสหลัก / โพสเสริม",
  },
  comment: {
    label: "คอมเมนต์",
    chip: "bg-amber-100 text-amber-700 border-amber-200",
    hint: "คอมเมนต์รีวิว เช่น ในกลุ่มปิด / ใต้โพสของแบรนด์",
  },
};

export const INFLU_POST_KIND_ORDER: InfluPostKind[] = ["post", "comment"];

/* ---------- ขั้น Follow up: checklist ติดตามงาน Influencer (ตามเอกสารแนบท้ายสัญญาของโรงพยาบาล) ----------
   แบ่ง 5 หมวด เรียงตามเอกสารจริง
   offsetDays: null = ไม่มีกำหนดเวลา (ไม่ต้องเตือน/นับถอยหลัง)
   มีค่า = นับจาก "วันที่เข้าสู่ขั้น Follow up" แล้วแจ้งเตือนเมื่อใกล้ถึงกำหนด (≤ 7 วัน) */

export const INFLU_CHECKLIST: {
  step: number;
  section: string;
  title: string;
  detail: string | null;
  offsetDays: number | null;
}[] = [
  // ── 1. เตรียมตัวและการแต่งกายก่อนเริ่มงาน ──
  {
    step: 1,
    section: "1. สถานีเตรียมตัวและการแต่งกายก่อนเริ่มงาน (Preparation Checklist)",
    title: "การแต่งหน้าและทรงผม",
    detail:
      "ตรวจสอบว่าแต่งหน้าและทำผมมาพร้อมสมบูรณ์เรียบร้อยก่อนเข้าสตูดิโอ",
    offsetDays: null,
  },
  {
    step: 2,
    section: "1. สถานีเตรียมตัวและการแต่งกายก่อนเริ่มงาน (Preparation Checklist)",
    title: "โทนสีเสื้อผ้า",
    detail:
      "สวมใส่ชุดสุภาพตามกลุ่มโทนสีที่กำหนด: สีขาว / สีครีม / สีน้ำตาล / สีชมพู",
    offsetDays: null,
  },
  // ── 2. กิจกรรมและฟุตเทจ ณ โรงพยาบาล ──
  {
    step: 3,
    section: "2. เช็กลิสต์กิจกรรมและฟุตเทจ ณ โรงพยาบาล (On-Site Checklist)",
    title: "จุดถ่ายฉากดำ (ชั้น 1)",
    detail:
      "ถ่ายภาพนิ่งและวิดีโอ Before และ After ทันที ตามมุมมาตรฐานที่ทีมงานกำหนดเพื่อใช้เปรียบเทียบผลลัพธ์",
    offsetDays: null,
  },
  {
    step: 4,
    section: "2. เช็กลิสต์กิจกรรมและฟุตเทจ ณ โรงพยาบาล (On-Site Checklist)",
    title: "ห้องสตูดิโอ (ชั้น 4)",
    detail:
      "เข้าถ่ายภาพพอร์ทเทรต แฟชั่น หรือวิดีโอสั้นตามนัดหมายของทีมสตูฯ",
    offsetDays: null,
  },
  {
    step: 5,
    section: "2. เช็กลิสต์กิจกรรมและฟุตเทจ ณ โรงพยาบาล (On-Site Checklist)",
    title: "บรรยากาศรอบโรงพยาบาล",
    detail:
      "เก็บฟุตเทจวิดีโอบรรยากาศทั่วไป ความสะอาด ความสวยงาม และ Lifestyle เพื่อประกอบการเล่าเรื่องในคลิปรีวิวหลัก",
    offsetDays: null,
  },
  {
    step: 6,
    section: "2. เช็กลิสต์กิจกรรมและฟุตเทจ ณ โรงพยาบาล (On-Site Checklist)",
    title: "ขั้นตอนการปรึกษาแพทย์",
    detail:
      "เก็บภาพนิ่งและวิดีโอสั้นตอนเข้าห้องพูดคุย ปรึกษาปัญหากับคุณหมอก่อนทำหัตถการ",
    offsetDays: null,
  },
  {
    step: 7,
    section: "2. เช็กลิสต์กิจกรรมและฟุตเทจ ณ โรงพยาบาล (On-Site Checklist)",
    title: "ขั้นตอนระหว่างทำ",
    detail:
      "เก็บไฟล์ภาพหรือวิดีโอสั้นขณะกำลังทำหัตถการ (ตามขอบเขตความปลอดภัยที่ทีมงานอนุญาต)",
    offsetDays: null,
  },
  {
    step: 8,
    section: "2. เช็กลิสต์กิจกรรมและฟุตเทจ ณ โรงพยาบาล (On-Site Checklist)",
    title: "การลง Story เช็กอิน",
    detail:
      "ถ่ายสตอรี่เช็กอินสถานที่ ณ โรงพยาบาล พร้อมแท็กบัญชีทางการ @theart_aesthetic หรือ theart aesthetic 1",
    offsetDays: null,
  },
  // ── 3. การเผยแพร่และส่งมอบผลงาน ──
  {
    step: 9,
    section: "3. เช็กลิสต์การเผยแพร่และส่งมอบผลงาน (Deliverables Checklist)",
    title: "คลิปรีวิวหลัก (1 คลิป)",
    detail:
      "อัปโหลดเผยแพร่ภายใน 14 วันหลังเข้ารับบริการ · ความยาววิดีโอขั้นต่ำ 30-60 วินาที · เนื้อหาครบถ้วน: ประสบการณ์จริง → ความรู้สึกหลังทำ → ผลลัพธ์ที่ชัดเจน · ลงแพลตฟอร์มหลักอย่างน้อย 1 ช่องทาง (TikTok, Facebook หรือ IG)",
    offsetDays: 14,
  },
  {
    step: 10,
    section: "3. เช็กลิสต์การเผยแพร่และส่งมอบผลงาน (Deliverables Checklist)",
    title: "โพสต์แชร์ลงกลุ่มปิด",
    detail:
      "เขียนบทความรีวิวจากใจจริงและแชร์รูปภาพลงใน กลุ่มปิดศัลยกรรมหรือความงาม อย่างน้อย 3 กลุ่ม",
    offsetDays: null,
  },
  {
    step: 11,
    section: "3. เช็กลิสต์การเผยแพร่และส่งมอบผลงาน (Deliverables Checklist)",
    title: "รีวิวระบบ Google",
    detail:
      "เข้าไปให้คะแนนความพึงพอใจและเขียนรีวิวสั้นๆ บนช่องทาง Google Review ของแบรนด์",
    offsetDays: null,
  },
  {
    step: 12,
    section: "3. เช็กลิสต์การเผยแพร่และส่งมอบผลงาน (Deliverables Checklist)",
    title: "เงื่อนไขการคงอยู่คอนเทนต์",
    detail:
      "ตรวจสอบให้แน่ใจว่าไม่มีการลบ หรือกดซ่อน (Archive) คลิปรีวิวและโพสต์ก่อนครบกำหนดเวลาในสัญญา",
    offsetDays: null,
  },
  // ── 4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ ──
  {
    step: 13,
    section:
      "4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ (Long-Term Photo Schedule)",
    title: "ระยะแรก (7-14 วันแรก)",
    detail: "ส่งไฟล์ภาพนิ่งและคลิปสั้นอัปเดตอาการและการยุบบวมเบื้องต้น",
    offsetDays: 14,
  },
  {
    step: 14,
    section:
      "4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ (Long-Term Photo Schedule)",
    title: "หลังทำครบ 1 เดือน",
    detail: "จัดส่งภาพถ่าย After มุมมาตรฐานอัปเดตให้ทีมงานโรงพยาบาล",
    offsetDays: 30,
  },
  {
    step: 15,
    section:
      "4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ (Long-Term Photo Schedule)",
    title: "หลังทำครบ 2 เดือน",
    detail: "จัดส่งภาพถ่าย After มุมมาตรฐานอัปเดตให้ทีมงานโรงพยาบาล",
    offsetDays: 60,
  },
  {
    step: 16,
    section:
      "4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ (Long-Term Photo Schedule)",
    title: "หลังทำครบ 3 เดือน",
    detail: "จัดส่งภาพถ่าย After มุมมาตรฐานอัปเดตให้ทีมงานโรงพยาบาล",
    offsetDays: 90,
  },
  {
    step: 17,
    section:
      "4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ (Long-Term Photo Schedule)",
    title: "หลังทำครบ 4 เดือน",
    detail: "จัดส่งภาพถ่าย After มุมมาตรฐานอัปเดตให้ทีมงานโรงพยาบาล",
    offsetDays: 120,
  },
  {
    step: 18,
    section:
      "4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ (Long-Term Photo Schedule)",
    title: "หลังทำครบ 5 เดือน",
    detail: "จัดส่งภาพถ่าย After มุมมาตรฐานอัปเดตให้ทีมงานโรงพยาบาล",
    offsetDays: 150,
  },
  {
    step: 19,
    section:
      "4. แผนงานติดตามและการจัดส่งภาพอัปเดตผลลัพธ์ (Long-Term Photo Schedule)",
    title: "หลังทำครบ 6 เดือน",
    detail: "จัดส่งภาพถ่าย After อัปเดตงวดสุดท้าย (หรือจนกว่าจะครบอายุสัญญา)",
    offsetDays: 180,
  },
  // ── 5. การตรวจสอบสิทธิ์และความร่วมมือในอนาคต ──
  {
    step: 20,
    section:
      "5. การตรวจสอบสิทธิ์และความร่วมมือในอนาคต (Rights & Future Cooperation Audit)",
    title: "ข้อตกลงบันทึกและดาวน์โหลดสื่อ",
    detail:
      "รับทราบและยินยอมให้ทางโรงพยาบาลสามารถบันทึกหรือดาวน์โหลดภาพนิ่งและวิดีโอรีวิวทั้งหมดจากโซเชียลมีเดียส่วนตัวของเราได้ครบถ้วน",
    offsetDays: null,
  },
  {
    step: 21,
    section:
      "5. การตรวจสอบสิทธิ์และความร่วมมือในอนาคต (Rights & Future Cooperation Audit)",
    title: "การเข้าร่วมกิจกรรมและแคมเปญ",
    detail:
      "รับทราบและตกลงว่าจะให้ความร่วมมือในการเดินทางมาร่วมกิจกรรมพิเศษหรืองานแคมเปญการตลาดของโรงพยาบาลในอนาคต ตามความเหมาะสมและตกลงร่วมกัน",
    offsetDays: null,
  },
  {
    step: 22,
    section:
      "5. การตรวจสอบสิทธิ์และความร่วมมือในอนาคต (Rights & Future Cooperation Audit)",
    title: "การอนุญาตยิงแอด (Ads Media)",
    detail:
      "ให้สิทธิ์แบรนด์ในการนำคลิปไปทำโฆษณา และประสานงานเปิดสิทธิ์ยิงแอดผ่านบัญชี TikTok ของเราแล้วเรียบร้อย",
    offsetDays: null,
  },
  {
    step: 23,
    section:
      "5. การตรวจสอบสิทธิ์และความร่วมมือในอนาคต (Rights & Future Cooperation Audit)",
    title: "การตรวจสอบเนื้อหา",
    detail:
      "ตรวจทานแล้วว่าในคลิปไม่มีการพูดพาดพิงหรือเปรียบเทียบแบรนด์คู่แข่งอื่นในแง่ลบ และไม่มีคำโฆษณาเกินจริง",
    offsetDays: null,
  },
];

/** ลำดับหมวดของ checklist — ใช้จัดกลุ่มบนหน้าจอ */
export const INFLU_CHECKLIST_SECTIONS: string[] = [
  ...new Set(INFLU_CHECKLIST.map((c) => c.section)),
];

/* ---------- Stage 6: โหมด checklist (มาตรฐาน / แพ็คเกจเฉพาะ) ---------- */

export const INFLU_FOLLOWUP_MODES: Record<
  InfluFollowupMode,
  { label: string; hint: string }
> = {
  standard: {
    label: "มาตรฐาน",
    hint: "checklist 5 หมวดตามเอกสารแนบท้ายสัญญา — ใช้กับเคสแลกหัตถการทั่วไป",
  },
  custom: {
    label: "แพ็คเกจเฉพาะ",
    hint: "เคสดารา/จ่ายค่าตัว ที่เงื่อนไขไม่เหมือนเคสมาตรฐาน — เขียนขอบเขตงานเป็น note แล้วกรอก checklist เงื่อนไขเอง",
  },
};

export const INFLU_FOLLOWUP_MODE_ORDER: InfluFollowupMode[] = [
  "standard",
  "custom",
];

/** ข้อ checklist ที่ "ใช้งานอยู่" ตามโหมดของเคส — ข้อของอีกโหมดถูกซ่อนไว้ (ไม่ถูกลบ สลับกลับมาเห็นได้)
    ทุกที่ที่นับ follow-up ต้องกรองด้วยตัวนี้ ไม่งั้นเลขจะรวมข้อของโหมดที่ซ่อนอยู่ด้วย */
export function activeFollowupTasks<T extends { is_custom: boolean }>(
  mode: InfluFollowupMode,
  tasks: T[]
): T[] {
  return tasks.filter((t) => t.is_custom === (mode === "custom"));
}

/* ---------- (เทมเพลตเดิม 10 step — เลิกใช้แล้ว เก็บไว้อ้างอิงข้อมูลเก่าใน DB) ----------
   งานที่ generate ด้วยเทมเพลตนี้ก่อน 2026-07-05 ยังแสดงผลได้ปกติ (section = null) */

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

/* ---------- Influencer Cost: ต้นทุนค่าบริการรายโปรแกรม (/influ-cost) ---------- */

/** เพดานความยาวชื่อโปรแกรมที่พิมพ์เอง (ชื่อใน Price List บางอันยาวมาก — ต้องตัดให้อ่านง่าย) */
export const PROCEDURE_NAME_MAX = 80;

/** ตัดชื่อโปรแกรมจาก Price List ให้สั้นลงตอนหยิบเข้ารายการ — พยายามตัดที่ขอบเขตคำ */
export function shortenProgramName(name: string, max = 60): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** ต้นทุนที่นับจริงของรายการ — ติ๊ก "แบรนด์ support" แล้วนับเป็น 0 */
export function itemEffectiveCost(item: {
  price: number;
  is_supported: boolean;
}): number {
  return item.is_supported ? 0 : Number(item.price) || 0;
}

/** ข้อความสรุปรายการโปรแกรมของเคส — sync กลับ influencers.procedure_text
    เพื่อให้ช่องก๊อป Memo / การ์ดบอร์ด / ปฏิทิน แสดงรูปแบบเดิม (คั่นด้วย " / " ตามข้อมูลจริง) */
export function procedureSummaryText(items: { name: string }[]): string {
  return items
    .map((i) => i.name.trim())
    .filter(Boolean)
    .join(" / ");
}

/** สถานะการใช้ต้นทุน — "ใช้บริการแล้ว" = เคสผ่านขั้น "เซนสัญญา + วันรับบริการ" มาแล้ว
    คือขึ้นขั้น Follow up หรือปิดงาน (เกณฑ์จากผู้ใช้ 2026-08-03: การเดิน stage คือตัวยืนยันว่าเข้ามาจริง
    ไม่ใช่แค่วันที่นัดถึงกำหนด — วันที่เลยมาแล้วแต่ยังไม่ผ่านขั้นรับบริการ = อาจเลื่อนนัด ยังไม่นับ) */
export type CostUsage = "used" | "upcoming" | "unscheduled";

export function costUsageOf(c: {
  service_date: string | null;
  stage: number;
  completed: boolean;
}): CostUsage {
  if (c.completed || c.stage > INFLU_STAGE.contractService) return "used";
  return c.service_date ? "upcoming" : "unscheduled";
}

export const COST_USAGE_META: Record<
  CostUsage,
  { label: string; chip: string; dot: string }
> = {
  used: {
    label: "ใช้บริการแล้ว",
    chip: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  upcoming: {
    label: "กำลังจะมา",
    chip: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  unscheduled: {
    label: "ยังไม่เคาะวัน",
    chip: "bg-stone-100 text-stone-600 border-stone-200",
    dot: "bg-stone-400",
  },
};

export const COST_USAGE_ORDER: CostUsage[] = [
  "upcoming",
  "unscheduled",
  "used",
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
