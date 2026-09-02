import { todayISO } from "./format";
import type {
  InfluCalendarKind,
  InfluFollowupMode,
  InfluPostKind,
  InfluPostPlatform,
  InfluProductTeam,
  InfluProspectStatus,
  InfluScope,
  InfluSizeGroup,
  InfluencerLite,
  InfluTagOption,
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

/* ---------- Product team ของหัตถการ (migration 0080 · ขยายเป็น 9 ทีมที่ 0103) ----------
   บริษัทแบ่งทีมสินค้าแยกกัน — เลือกทีมก่อนแล้วช่องค้นหาหัตถการจะขึ้นตามทีมที่เลือก
   aesthetics ใช้ price_items เป็นเมนูหลัก + influ_services ที่ทีมเพิ่มเอง
   ทีมอื่นใช้ influ_services (ทีมเพิ่มเองทั้งหมด — ยังไม่มีเมนูกลาง)
   เพิ่มทีมใหม่ต้องแก้ 3 ที่: type InfluProductTeam, ตารางนี้ และ check constraint (migration ใหม่)
   ⚠️ key = แฮชแท็ก — ต้องเป็นตัวพิมพ์เล็กล้วน ไม่มีเว้นวรรค/ขีด (คำสั่งผู้ใช้ 2026-09-01)
   IG/FB ตัดแท็กที่ `-` ทิ้ง และแท็กพิมพ์ใหญ่ทำให้ทีมพิมพ์ตามไม่ตรง */

export const INFLU_PRODUCT_TEAMS: Record<
  InfluProductTeam,
  { label: string; chip: string; tag: string }
> = {
  aesthetics: {
    label: "Aesthetics (สกิน)",
    chip: "border border-brand-200 bg-brand-50 text-brand-700",
    tag: "aesthetics",
  },
  breast: {
    label: "เสริมหน้าอก",
    chip: "border border-rose-200 bg-rose-50 text-rose-700",
    tag: "breast",
  },
  abdomen: {
    label: "ตัดหนังหน้าท้อง",
    chip: "border border-amber-200 bg-amber-50 text-amber-700",
    tag: "abdomen",
  },
  lipo: {
    label: "ดูดไขมัน / เติมไขมัน",
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
    tag: "lipo",
  },
  noseopen: {
    label: "เสริมจมูก Open",
    chip: "border border-violet-200 bg-violet-50 text-violet-700",
    tag: "noseopen",
  },
  noseclosed: {
    label: "เสริมจมูก Closed",
    chip: "border border-indigo-200 bg-indigo-50 text-indigo-700",
    tag: "noseclosed",
  },
  chin: {
    label: "เสริมคาง",
    chip: "border border-teal-200 bg-teal-50 text-teal-700",
    tag: "chin",
  },
  eyes: {
    label: "ตาสองชั้น / Subbrow",
    chip: "border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    tag: "eyes",
  },
  facelift: {
    label: "ดึงหน้า Endotine",
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    tag: "facelift",
  },
};

export const INFLU_PRODUCT_TEAM_ORDER: InfluProductTeam[] = [
  "aesthetics",
  "breast",
  "abdomen",
  "lipo",
  "noseopen",
  "noseclosed",
  "chin",
  "eyes",
  "facelift",
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

/** ชื่อ influ แบบเต็มบรรทัดเดียว "ชื่อเล่น (ชื่อ นามสกุล) · รอบ N" —
    ชื่อเล่นนำหน้าเพราะทีมจำ/เรียก influ กันด้วยชื่อเล่นเป็นหลัก (ผู้ใช้ 2026-09-02)
    ใช้ร่วมกันทั้งตัวเลือกในหน้า Task และหน้าจัดการแท็ก */
export function influLabel(i: InfluencerLite): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  const name = i.nickname ? (full ? `${i.nickname} (${full})` : i.nickname) : full;
  const round = roundLabel(i.round_no);
  return round ? `${name} · ${round}` : name;
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
   ปรับเหลือ 2 ขั้นเมื่อ 2026-08-29 (migration 0092) ตามคำสั่งผู้ใช้:
   ขั้น "Follow up งาน" (เดิม 3) ถูกถอดออกจาก pipeline ทั้งขั้น — การติดตามผลงาน
   ย้ายไปทำที่หน้า **Follow Up** (`/influencers/contracts`) ซึ่งเป็นทั้งที่ตั้งเป้าโพส
   และที่ติดตามในตัวเดียวกัน; เคสเข้าสู่การติดตามเองเมื่ออัพไฟล์สัญญา (contract_start
   ถูกตั้ง) และ "ปิดงาน" ก็กดจากหน้านั้น ⇒ ขั้นสุดท้ายของ pipeline = สัญญา+รับบริการ

   ประวัติ: 0062 (2026-08-07) รวมเซนสัญญา+วันรับบริการ · 0086 (2026-08-22) ถอดขั้น
   ติดต่อ/รายละเอียดเคสออก เหลือ 3 ขั้น
   **ห้ามเทียบเลข stage ตรงๆ ในโค้ดใหม่ — ใช้ค่าคงที่ INFLU_STAGE ด้านล่างเสมอ**
   (การเลื่อนเลขขั้นแบบนี้เกิดมาแล้ว 3 ครั้ง เลขดิบที่หลุดไว้จะพังเงียบๆ) */

/** เลขขั้นของแต่ละ stage — ใช้แทนเลขดิบทุกที่ */
export const INFLU_STAGE = {
  /** 1. Memo ขออนุมัติ — อัพไฟล์ Memo ที่อนุมัติแล้ว = ผ่านขั้นนี้อัตโนมัติ */
  memo: 1,
  /** 2. เซนสัญญา + วันเข้ารับบริการ (ขั้นสุดท้ายของ pipeline — 0092) */
  contractService: 2,
} as const;

/** ขั้นสุดท้ายของ pipeline — ใช้กับ stepper / เคสที่ปิดงานแล้ว */
export const INFLU_STAGE_LAST = INFLU_STAGE.contractService;

/** วันเริ่มนับสัญญา 6 เดือน (เกณฑ์ผู้ใช้ 2026-08-07) — ใช้ "วันรับบริการ" ที่กรอกไว้
    เพราะสัญญาถูกเซนวันที่ influ เข้ามารับบริการ; ยังไม่กรอกวันค่อยตกไปใช้วันที่อัพไฟล์สัญญา
    (วันนี้ตามเวลาไทย — ไม่อิงนาฬิกาเครื่องผู้ใช้) */
export function contractStartFor(c: { service_date: string | null }): string {
  return c.service_date ?? todayISO();
}

export const INFLU_STAGES: { step: number; title: string; short: string }[] = [
  { step: INFLU_STAGE.memo, title: "Memo ขออนุมัติ", short: "Memo" },
  {
    step: INFLU_STAGE.contractService,
    title: "เซนสัญญา + วันรับบริการ",
    short: "สัญญา/รับบริการ",
  },
];

/* ---------- เคสที่ยังไม่ได้ลงคิวหมอ (คิว "เข้ารับบริการ" ในปฏิทิน) ----------
   คิวหมอลง 2 ฝั่ง (กติกาจากผู้ใช้ 2026-08-03): ฝั่งระบบโรงพยาบาลลงคิวก่อน = ยืนยันว่า
   influ เข้ามาจริง แล้ว influ manager ถึงมาลงคิวในปฏิทินฝั่งนี้เพื่อดูภาพรวมตาราง
   ⇒ "มีคิว kind=service ในปฏิทิน" คือหลักฐานว่านัดหมอเรียบร้อย
   ⇒ influencers.service_date (เคาะไว้ตั้งแต่ขั้นรายละเอียดเคส) เป็นแค่วันที่คุยกันไว้ ยังไม่นับว่านัดแล้ว
   helper อยู่ที่นี่ (ไม่ใช่ใน influ-board.tsx) เพราะใช้ทั้งบอร์ดเคส ปฏิทิน และกระดิ่ง —
   ปฏิทินไม่ควรลาก dnd-kit ของบอร์ดติดมาแค่เพื่อฟังก์ชันเดียว */

/** ฟิลด์ขั้นต่ำที่ใช้ตัดสิน — รับได้ทั้งแถวเต็ม (InfluencerListRow) และแถวย่อ (ปฏิทิน/กระดิ่ง) */
export type BookingCheckCase = {
  id: string;
  stage: number;
  completed: boolean;
  declined_at: string | null;
};

/** "รอลงคิวหมอ" — เคสที่ยังเดินอยู่ในขั้น Memo–สัญญา และยังไม่มีคิว service ในปฏิทิน
    (ครอบทุกขั้นย่อยของ Memo ด้วย — เคสที่ Memo ยังไม่ผ่านก็นับ เพราะทีมมักคุยวันกันไว้ก่อน) */
export const needsDoctorBooking = (
  i: BookingCheckCase,
  bookedIds: ReadonlySet<string>
): boolean =>
  i.stage >= INFLU_STAGE.memo &&
  i.stage <= INFLU_STAGE.contractService &&
  !i.completed &&
  i.declined_at === null &&
  !bookedIds.has(i.id);

/** "เอกสารผ่านแล้วแต่ยังไม่ลงคิว" — subset ของ needsDoctorBooking ที่ **ผ่านขั้น 1.2 แล้ว**
    (อัพไฟล์ Memo ที่อนุมัติ = เลื่อนเข้าขั้นสัญญาอัตโนมัติ จึงเช็คที่เลข stage ได้เลย)
    ผู้ใช้ 2026-09-02: ปุ่มแจ้งเตือนท้ายแผงขวาของปฏิทิน + ตัวกรองบนบอร์ดเคสใช้เกณฑ์นี้ */
export const memoApprovedNeedsBooking = (
  i: BookingCheckCase,
  bookedIds: ReadonlySet<string>
): boolean =>
  needsDoctorBooking(i, bookedIds) && i.stage >= INFLU_STAGE.contractService;

/* ---------- บทบาทผู้รับผิดชอบของเคส (0095 → รื้อเป็นบทบาทที่ 0104) ----------
   ผู้ใช้ 2026-09-01: "ปรับ design ใหม่เป็น check list เช่น 1.ผู้ดูแล คือคนหลักที่เป็นคน
   สร้างแต่ติดตามเคสนี้จนถึงเซนสัญญา 2.ผู้ติดตาม จะเป็นคนทำสัญญาไปจนถึงการ follow up
   3.ผู้ออก Memo จะเป็นคนทำ 1.1, 1.2"

   โมเดล: `influ_assignees.scopes` เก็บ "บทบาท" (owner/follower/memo) — แถวเก่าก่อน
   0104 เก็บเป็น "ขอบเขตขั้นงาน" (memo/contract/followup) ซึ่งยังอยู่ใน DB และในถังขยะ
   (check constraint เป็น superset) — **โค้ดอ่านผ่าน normalizeRoles() เสมอ**:
   contract→owner, followup→follower, memo→memo (คีย์เดิมความหมายใหม่)
   แต่ละบทบาท "คุม" ขอบเขตเหตุการณ์ (InfluEventScope) ตาม covers — ใช้ตัดสินแจ้งเตือน
   ระดับ "ต้องลงมือ" ใน influ-notify; **ไม่ถือบทบาทไหนเลย = หัวหน้างาน/ผู้เกี่ยวข้อง**
   (ได้แจ้งเตือนทุกอย่างแต่ระดับ "อัพเดท" — กติกาเดิมจาก 0095) */

/** บทบาทที่เลือกได้ในเช็คลิสต์ผู้รับผิดชอบ (ชุดใหม่ 0104) */
export type InfluRole = "owner" | "follower" | "memo";

/** ขอบเขตเหตุการณ์ — ใช้ระบุว่าเหตุการณ์หนึ่งเป็นงานของช่วงไหนของเคส
    (memo = ขั้น 1 ทั้งก้อนรวมขั้นย่อย, contract = ขั้น 2, followup = หลังเซนสัญญา) */
export type InfluEventScope = "memo" | "contract" | "followup";

export const INFLU_ROLES: Record<
  InfluRole,
  {
    label: string;
    short: string;
    desc: string;
    chip: string;
    dot: string;
    /** ขอบเขตเหตุการณ์ที่บทบาทนี้รับผิดชอบ — แจ้งเตือนระดับ "ต้องลงมือ" */
    covers: InfluEventScope[];
  }
> = {
  owner: {
    label: "1. ผู้ดูแล",
    short: "ผู้ดูแล",
    desc: "คนหลักที่สร้างเคสและตามจนถึงเซนสัญญา",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-400",
    covers: ["memo", "contract"],
  },
  follower: {
    label: "2. ผู้ติดตาม",
    short: "ผู้ติดตาม",
    desc: "ทำสัญญาไปจนถึงการ Follow Up",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-400",
    covers: ["contract", "followup"],
  },
  memo: {
    label: "3. ผู้ออก Memo",
    short: "ผู้ออก Memo",
    desc: "ทำเอกสาร Memo (ขั้น 1.1) และอัพไฟล์ที่อนุมัติแล้ว (ขั้น 1.2)",
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-400",
    covers: ["memo"],
  },
};

export const INFLU_ROLE_ORDER: InfluRole[] = ["owner", "follower", "memo"];

/** แปลงค่าใน `influ_assignees.scopes` (มีทั้งคีย์บทบาทใหม่และขอบเขตเก่าก่อน 0104)
    เป็นชุดบทบาท — ทุกที่ที่อ่าน scopes ต้องผ่านตัวนี้ ห้ามเทียบค่าดิบ */
export function normalizeRoles(scopes: InfluScope[]): InfluRole[] {
  const out = new Set<InfluRole>();
  for (const s of scopes) {
    if (s === "contract") out.add("owner");
    else if (s === "followup") out.add("follower");
    else out.add(s);
  }
  return INFLU_ROLE_ORDER.filter((r) => out.has(r));
}

/** บทบาทในชุดนี้มีคนคุมขอบเขตเหตุการณ์นั้นไหม — หัวใจของแจ้งเตือนระดับ "ต้องลงมือ" */
export function rolesCoverScope(
  scopes: InfluScope[],
  scope: InfluEventScope | null | undefined
): boolean {
  if (!scope) return false;
  return normalizeRoles(scopes).some((r) =>
    INFLU_ROLES[r].covers.includes(scope)
  );
}

/** ขอบเขตเหตุการณ์ของขั้นงานเลขนั้น (คืน null ถ้าเลขไม่ตรงขั้นไหน เช่นข้อมูลเก่า) */
export function scopeOfStage(stage: number): InfluEventScope | null {
  if (stage === INFLU_STAGE.memo) return "memo";
  if (stage === INFLU_STAGE.contractService) return "contract";
  return null;
}

/** ป้ายสั้นของชุดบทบาท — ว่าง = หัวหน้างาน/ผู้เกี่ยวข้อง (ไม่ได้ถือบทบาทไหน) */
export function roleSummary(scopes: InfluScope[]): string {
  const roles = normalizeRoles(scopes);
  if (roles.length === 0) return "ผู้เกี่ยวข้อง";
  if (roles.length === INFLU_ROLE_ORDER.length) return "ทุกบทบาท";
  return roles.map((r) => INFLU_ROLES[r].short).join(" · ");
}

/* ---------- ขั้นย่อยของ Memo (1.0 / 1.1 / 1.2 — migration 0104) ----------
   ผู้ใช้ 2026-09-01: แตกขั้น Memo เป็น 3 จังหวะ — เลข stage ใน DB ยังเป็น 1 ตลอด
   ขั้นย่อยคำนวณจาก 3 คอลัมน์:
     1.0 = ยังไม่ยืนยันส่งเรื่อง (docs_sent_at null) — ผู้ดูแลเลือกผู้ออก Memo แล้วกดยืนยัน
     1.1 = ส่งเรื่องแล้ว รอผู้ออก Memo ทำเอกสาร (memo_submitted_at null)
     1.2 = ทำเอกสารส่งแล้ว รออัพไฟล์ Memo ที่อนุมัติ (memo_file_path null)
   อัพไฟล์ Memo = เลื่อนเข้า stage 2 อัตโนมัติ (กลไกเดิมใน uploadMemo) */

export type MemoSubStep = "1.0" | "1.1" | "1.2";

export const MEMO_SUBSTEPS: {
  key: MemoSubStep;
  /** ป้ายบนเส้น tracker ของการ์ด/หน้าเคส */
  short: string;
  title: string;
  desc: string;
}[] = [
  {
    key: "1.0",
    short: "Memo",
    title: "1. ส่งเรื่องขอ Memo",
    desc: "ผู้ดูแลเลือกผู้ออก Memo แล้วยืนยันการส่งเรื่อง",
  },
  {
    key: "1.1",
    short: "ทำเอกสาร",
    title: "1.1 ทำเอกสาร Memo",
    desc: "ผู้ออก Memo ทำเอกสารแล้วกดยืนยันว่าส่งขออนุมัติแล้ว",
  },
  {
    key: "1.2",
    short: "อัพไฟล์",
    title: "1.2 อัพไฟล์ Memo ที่อนุมัติ",
    desc: "Memo ผ่านอนุมัติแล้ว — อัพไฟล์เอกสารเข้าระบบ (เลื่อนเข้าขั้นสัญญาให้เอง)",
  },
];

/** ขั้นย่อยปัจจุบันของเคสที่อยู่ขั้น Memo — อ่านจาก 3 คอลัมน์ตามลำดับ
    (เคสที่เลยขั้น Memo ไปแล้วค่าที่ได้ไม่มีความหมาย — เช็ค stage ก่อนเรียกเอง) */
export function memoStepOf(i: {
  docs_sent_at: string | null;
  memo_submitted_at: string | null;
  memo_file_path: string | null;
}): MemoSubStep {
  if (i.docs_sent_at === null) return "1.0";
  if (i.memo_submitted_at === null) return "1.1";
  return "1.2";
}

/** user id ของผู้ออก Memo ทั้งหมดในเคส — ใช้ gate ปุ่มขั้น 1.1/1.2
    (ไม่มีใครถือบทบาทนี้ = คืน [] ให้ฝั่ง UI เปิดให้ editor ทุกคนกดแทน กันเคสค้างตาย) */
export function memoMakerIds(
  assignees: { userId: string; scopes: InfluScope[] }[]
): string[] {
  return assignees
    .filter((a) => normalizeRoles(a.scopes).includes("memo"))
    .map((a) => a.userId);
}

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

/* ---------- ช่องทางโซเชียลของโพส + เป้าโพสตามสัญญา (migration 0084) ----------
   คีย์ชุดนี้ = คีย์ใน influencers.post_quotas — ยอดที่ลงจริงไม่เก็บซ้ำ
   นับจาก influ_post_links (kind='post') โดยแยกช่องทางจาก hostname ของลิงก์ */

export const INFLU_POST_PLATFORMS: Record<
  InfluPostPlatform,
  { label: string; short: string; chip: string }
> = {
  // short = ป้ายย่อบนชิปตาราง (เลียนแบบ Ig1/Fb2/Tk3 ในไฟล์ติดตามของทีม branding เดิม)
  tiktok: {
    label: "TikTok",
    short: "TK",
    chip: "border-stone-300 bg-stone-800 text-white",
  },
  instagram: {
    label: "Instagram",
    short: "IG",
    chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  },
  facebook: {
    label: "Facebook",
    short: "FB",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
  },
  youtube: {
    label: "YouTube",
    short: "YT",
    chip: "border-rose-200 bg-rose-50 text-rose-600",
  },
  lemon8: {
    label: "Lemon8",
    short: "L8",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
  },
  x: {
    label: "X (Twitter)",
    short: "X",
    chip: "border-stone-200 bg-stone-100 text-stone-700",
  },
  line: {
    label: "LINE",
    short: "LN",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  other: {
    label: "อื่นๆ",
    short: "อื่น",
    chip: "border-stone-200 bg-stone-50 text-stone-500",
  },
};

/** ลำดับช่องทาง — 3 ช่องแรกคือช่องหลักตามสัญญา (ตรงกับไฟล์ทีม branding: IG/FB/Tiktok) */
export const INFLU_POST_PLATFORM_ORDER: InfluPostPlatform[] = [
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "lemon8",
  "x",
  "line",
  "other",
];

/** ช่องทางหลักที่ฟอร์มตั้งเป้าโชว์ให้เสมอ (ช่องอื่นโผล่เมื่อมีเป้า/มีโพสจริง) */
export const INFLU_POST_PLATFORM_PRIMARY: InfluPostPlatform[] = [
  "tiktok",
  "instagram",
  "facebook",
];

/** แยกช่องทางจาก hostname ของลิงก์โพส — ไม่รู้จัก/ลิงก์เพี้ยน = 'other' */
export function postPlatformOf(url: string): InfluPostPlatform {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "other";
  }
  const rules: [RegExp, InfluPostPlatform][] = [
    [/(^|\.)tiktok\.com$/, "tiktok"],
    [/(^|\.)instagram\.com$/, "instagram"],
    [/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, "facebook"],
    [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
    [/(^|\.)lemon8-app\.com$/, "lemon8"],
    [/(^|\.)(x\.com|twitter\.com)$/, "x"],
    [/(^|\.)line\.me$/, "line"],
  ];
  for (const [re, key] of rules) if (re.test(host)) return key;
  return "other";
}

/** ช่องทางของลิงก์โพส 1 แถว — ใช้ค่าที่ทีม "เลือกเอง" ตอนแปะลิงก์ก่อนเสมอ
    (influ_post_links.platform — migration 0092: ฟอร์มบังคับให้เลือกช่องจากเป้าที่ตั้งไว้)
    แถวเก่าที่ยังไม่มีค่า ตกไปเดาจาก hostname เหมือนเดิม ⇒ ข้อมูลเดิมไม่ต้อง backfill
    **ทุกที่ที่นับโพสต่อช่องทางต้องเรียกตัวนี้ ห้ามเรียก postPlatformOf(url) ตรงๆ**
    ไม่งั้นลิงก์ย่อ/ลิงก์ครอสโพสจะถูกนับผิดช่องเงียบๆ */
export function postLinkPlatform(l: {
  url: string;
  platform?: InfluPostPlatform | null;
}): InfluPostPlatform {
  return l.platform ?? postPlatformOf(l.url);
}

/** ชื่อช่องทางไว้แสดงผลจากลิงก์ — ช่องที่ไม่รู้จักคืน hostname ตรงๆ (ตัด www.)
    ให้คนอ่านยังรู้ว่าลิงก์ไปไหน แทนที่จะเหมารวมเป็น "อื่นๆ" */
export function postPlatformLabel(url: string): string {
  const key = postPlatformOf(url);
  if (key !== "other") return INFLU_POST_PLATFORMS[key].label;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

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

/* ---------- ขั้นตามงาน: โหมด checklist (มาตรฐาน / แพ็คเกจเฉพาะ) ---------- */

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
    (เกณฑ์จากผู้ใช้ 2026-08-03: การเดินงานคือตัวยืนยันว่าเข้ามาจริง ไม่ใช่แค่วันที่นัดถึงกำหนด
    — วันที่เลยมาแล้วแต่ยังไม่ผ่านขั้นรับบริการ = อาจเลื่อนนัด ยังไม่นับ)

    ตั้งแต่ 0092 (pipeline เหลือ 2 ขั้น) ตัวชี้วัดคือ **contract_start** ไม่ใช่เลข stage:
    วันเริ่มนับสัญญาถูกตั้งตอนอัพไฟล์สัญญา = จุดเดียวกับที่เคยเป็น "ขึ้นขั้น Follow up"
    (ย้อน stage ออกจากขั้นสัญญาก็ล้าง contract_start ให้อยู่แล้ว เกณฑ์จึงกลับเป็น upcoming เหมือนเดิม) */
export type CostUsage = "used" | "upcoming" | "unscheduled";

export function costUsageOf(c: {
  service_date: string | null;
  contract_start: string | null;
  completed: boolean;
}): CostUsage {
  if (c.completed || c.contract_start !== null) return "used";
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

/* ---------- แฮชแท็กบังคับของเคส (0093) ----------
   ที่มา (ผู้ใช้ 2026-08-29): influ ทุกคนต้องติดแท็กชุดนี้ในโพส เพื่อให้ทีมหลังบ้าน
   ดึงข้อมูลจาก Meta API มา attribute ได้ว่ายอดมาจากใคร/แคมเปญไหน/โปรตัวไหน

   ⚠️ IG/FB ตัดแฮชแท็กที่เครื่องหมาย "-" (#INF-00001 จะกลายเป็น #INF)
   รหัสที่คนอ่าน (INF-00001) กับข้อความแท็กจริง (#INF00001) จึงคนละรูป — แปลงด้วย
   hashtagSafe() ที่เดียวเท่านั้น และให้ทีมกดปุ่มคัดลอกแทนการพิมพ์เอง */

/** ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข/ขีดล่าง (รองรับไทย) — ได้ข้อความที่ใช้เป็นแฮชแท็กได้จริง */
export function hashtagSafe(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}_]/gu, "");
}

/** คำนำหน้าแท็กของหมอ — เปลี่ยนที่นี่ที่เดียวถ้าทีมอยากได้รูปแบบอื่น */
export const DOCTOR_TAG_PREFIX = "DR";

export type CaseHashtagKey =
  | "influ"
  | "doctor"
  | "campaign"
  | "procedure"
  | "promo";

export type CaseHashtag = {
  key: CaseHashtagKey;
  /** ป้ายบอกว่าแท็กนี้แทนอะไร (ใช้ใน tooltip/หัวข้อ) */
  label: string;
  /** ข้อความแท็กพร้อม # — null = ยังไม่มีข้อมูลให้สร้างแท็ก */
  tag: string | null;
  /** ค่าที่คนอ่านเข้าใจ เช่นชื่อหมอ/ชื่อแคมเปญ (โชว์ใน tooltip) */
  source: string | null;
  /** true = ขาดไม่ได้ — เคสที่ยังไม่มีต้องขึ้นเตือนให้ไปเติมข้อมูล */
  required: boolean;
  /** บอกว่าต้องไปเติมที่ไหนเมื่อ tag เป็น null */
  missingHint?: string;
};

export type CaseHashtagInput = {
  influCode: string | null;
  /** เลขใบ ปว. ของหมอที่รับเคส — หาจากทะเบียนหมอด้วยชื่อ (doctors.name ↔ influencers.doctor_name) */
  doctorLicense?: string | null;
  doctorName?: string | null;
  /** แท็กของแคมเปญที่เคสนี้สังกัด (ไม่มี # นำหน้า) */
  campaignTag?: string | null;
  campaignName?: string | null;
  /** ทีมสินค้าของหัตถการในเคส (ไม่ซ้ำ) — เคสหนึ่งมีได้หลายทีม */
  teams?: InfluProductTeam[];
  /** รหัสแพ็กเกจโปรที่เคสนี้ใช้ (promo_packages.sku) */
  promoSkus?: string[];
};

/**
 * ชุดแฮชแท็กของเคสหนึ่ง — เรียงตามลำดับที่ตกลงกับผู้ใช้:
 * #Influ ID · #รหัสหมอ · #แคมเปญ · #หัตถการ · #โปรโมชัน
 *
 * รายการที่ยังไม่มีข้อมูลก็คืนมาด้วย (tag = null) เพื่อให้หน้าจอเตือนว่าขาดอะไร —
 * ฝั่งที่ต้องการเฉพาะแท็กที่ใช้ได้จริงให้กรอง `t.tag !== null` เอง
 */
export function caseHashtags(input: CaseHashtagInput): CaseHashtag[] {
  const tags: CaseHashtag[] = [];

  tags.push({
    key: "influ",
    label: "รหัส Influ",
    tag: input.influCode ? `#${hashtagSafe(input.influCode)}` : null,
    source: input.influCode ?? null,
    required: true,
    missingHint: "เคสนี้ยังไม่มีรหัส Influ ID — กดออกรหัสที่หน้าเคส",
  });

  tags.push({
    key: "doctor",
    label: "รหัสหมอ",
    tag: input.doctorLicense
      ? `#${DOCTOR_TAG_PREFIX}${hashtagSafe(input.doctorLicense)}`
      : null,
    source: input.doctorName ?? null,
    required: true,
    missingHint: input.doctorName
      ? `"${input.doctorName}" ยังไม่มีเลขใบ ปว. ในทะเบียนหมอ — เพิ่มที่เมนู "จัดการหมอ"`
      : "ยังไม่ได้ระบุแพทย์ที่รับเคส",
  });

  // แคมเปญไม่บังคับ — เคสที่ไม่ได้อยู่ในแคมเปญไหนไม่ต้องมีแท็กนี้
  if (input.campaignTag) {
    tags.push({
      key: "campaign",
      label: "แคมเปญ",
      tag: `#${hashtagSafe(input.campaignTag)}`,
      source: input.campaignName ?? null,
      required: true,
    });
  }

  const teams = [...new Set(input.teams ?? [])];
  if (teams.length === 0) {
    tags.push({
      key: "procedure",
      label: "หัตถการ",
      tag: null,
      source: null,
      required: true,
      missingHint: "ยังไม่มีรายการหัตถการในเคส — เพิ่มที่แท็บรายละเอียดเคส",
    });
  } else {
    for (const team of teams) {
      tags.push({
        key: "procedure",
        label: "หัตถการ",
        tag: `#${hashtagSafe(INFLU_PRODUCT_TEAMS[team].tag)}`,
        source: INFLU_PRODUCT_TEAMS[team].label,
        required: true,
      });
    }
  }

  // โปรโมชันมีเฉพาะเคสที่หัตถการผูกกับโปรใน Price List — ไม่ผูกก็ไม่ต้องมีแท็ก
  for (const sku of [...new Set(input.promoSkus ?? [])]) {
    tags.push({
      key: "promo",
      label: "โปรโมชัน",
      tag: `#${hashtagSafe(sku)}`,
      source: sku,
      required: true,
    });
  }

  return tags;
}

/** ข้อความแท็กทั้งชุดคั่นด้วยช่องว่าง — ปุ่ม "คัดลอกแฮชแท็ก" ส่งค่านี้ให้ influ */
export function hashtagText(tags: CaseHashtag[]): string {
  return tags
    .map((t) => t.tag)
    .filter((t): t is string => t !== null)
    .join(" ");
}

/** จำนวนแท็กบังคับที่ยังไม่มีข้อมูล — >0 = เคสนี้ยังส่งแท็กให้ influ ไม่ได้ */
export function missingHashtagCount(tags: CaseHashtag[]): number {
  return tags.filter((t) => t.required && t.tag === null).length;
}

/**
 * ชุดแฮชแท็กของตัวเลือกแท็ก influencer (หน้าจัดการแท็ก + ตัวเลือกในหน้า Task)
 *
 * `InfluTagOption` resolve เลขใบ ปว./แท็กแคมเปญมาให้ตั้งแต่ฝั่ง server แล้ว (influ-tags.ts)
 * จึงประกอบแท็กได้จากก้อนเดียวโดยไม่ต้องส่งทะเบียนหมอ/แคมเปญไปทั้งชุด
 */
export function influTagHashtags(option: InfluTagOption): CaseHashtag[] {
  return caseHashtags({
    influCode: option.influ_code,
    doctorName: option.doctor_name,
    doctorLicense: option.doctor_license,
    campaignTag: option.campaign_tag,
    campaignName: option.campaign_name,
    teams: option.teams,
    promoSkus: option.promo_skus,
  });
}

/* ---------- แท็กแคมเปญ ---------- */

/** ปรับข้อความที่ผู้ใช้พิมพ์ให้เป็นแท็กที่ใช้ได้จริง (ตัวพิมพ์ใหญ่ ไม่มีขีด/ช่องว่าง) */
export function normalizeCampaignTag(raw: string): string {
  return hashtagSafe(raw.trim().replace(/\s+/g, "")).toUpperCase().slice(0, 30);
}

/** ตรวจว่าแท็กผ่านกติกาเดียวกับ check constraint ของ DB หรือยัง */
export function campaignTagError(tag: string): string | null {
  if (tag.length < 2) return "แท็กต้องยาวอย่างน้อย 2 ตัวอักษร";
  if (tag.length > 30) return "แท็กยาวเกิน 30 ตัวอักษร";
  if (!/^[A-Za-z0-9_\u0E01-\u0E5B]+$/.test(tag)) {
    return "แท็กใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดล่าง (ห้ามมีขีดกลางหรือช่องว่าง)";
  }
  return null;
}

/* ---------- ทะเบียนหมอ (0093) ---------- */

/**
 * ชื่อที่แสดงของหมอ — ประกอบจากช่องที่กรอกแยกไว้ให้ได้รูปแบบเดียวทั้งระบบ
 * `นพ. ชื่อ นามสกุล (ชื่อเล่น)` ตามที่ทีมตกลงกันไว้
 *
 * ค่านี้ถูกเขียนลง doctors.name ซึ่งเป็น **กุญแจจับคู่** กับ influencers.doctor_name
 * และ influ_calendar_events.doctor_name (คอลัมน์เหล่านั้นเป็น text ไม่มี FK) —
 * เปลี่ยนชื่อจึงต้องตามแก้เคส/คิวเสมอ (โมดัลจัดการหมอทำให้อยู่แล้ว)
 */
export function doctorDisplayName(d: {
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}): string {
  const head = [d.title, d.first_name, d.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const nick = (d.nickname ?? "").trim();
  return nick ? `${head} (${nick})`.trim() : head;
}

/** คำนำหน้าที่เลือกได้ในทะเบียนหมอ ("" = ไม่ระบุ เช่นแถว "ทรีทเม้นท์" ที่ไม่ใช่หมอ) */
export const DOCTOR_TITLES = ["นพ.", "พญ.", ""] as const;

/* ---------- โฟกัสของการติดตาม: "ตามให้โพส" มาก่อน (ผู้ใช้ 2026-08-29) ----------
   คำสั่งผู้ใช้: "priority ตอนนี้คือการตามให้ตัว influ โพสคลิปและเราติด tracking
   ส่วนที่ไม่ต้องโฟกัสมากอย่างเช่นตามให้ส่งภาพผลลัพ"

   ⇒ checklist หมวด 4 (รูปติดตามผล 7 งวด) = "งานรอง": ยังอยู่ครบและติ๊กได้ที่หน้า Follow Up
     แต่ **ไม่นับเข้าตัวเตือนบนการ์ดบอร์ด** ไม่งั้น 7 งวด × ทุกเคสจะกลบสัญญาณงานที่ต้องตามจริง
     (หน้า Follow Up มีกติกาเดียวกันอยู่แล้ว — สถานะเคสคิดจากเป้าโพสอย่างเดียว) */

/** ขึ้นต้นหมวดของ checklist มาตรฐานที่เป็น "งานรอง" — ตอนนี้มีแค่หมวด 4 รูปติดตามผล */
export const CHECKLIST_SECTION_PHOTO = "4.";

/** หมวดนี้คืองานรอง (ไม่เร่ง / ไม่ส่งเสียงเตือน) หรือไม่ */
export function isLaterSection(section: string | null): boolean {
  return (section ?? "").startsWith(CHECKLIST_SECTION_PHOTO);
}
