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

/* ---------- Stage 6: checklist ติดตามงาน Influencer (ตามเอกสารแนบท้ายสัญญาของโรงพยาบาล) ----------
   แบ่ง 5 หมวด เรียงตามเอกสารจริง
   offsetDays: null = ไม่มีกำหนดเวลา (ไม่ต้องเตือน/นับถอยหลัง)
   มีค่า = นับจาก "วันที่เข้าสู่ stage 6" แล้วแจ้งเตือนเมื่อใกล้ถึงกำหนด (≤ 7 วัน) */

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
