/**
 * ตรรกะกลางของ KPI คอนเทนต์ (migration 0085 + 0087) — ใช้ร่วมกัน 2 หน้า:
 *   • `/content-tracking`          = ปฏิทินรายคน (heatmap + แผงสถิติด้านขวา)
 *   • `/content-tracking/overview` = ภาพรวมทีม (ตาราง/ลิสต์เทียบกันทั้งทีม)
 *
 * ทุกอย่างในไฟล์นี้เป็น pure function ระดับโมดูล — **ห้ามอ่านเวลาปัจจุบันในนี้**
 * (กฎ react-hooks/purity ของโปรเจกต์): "วันนี้" ถูกส่งมาจาก server ผ่าน props เสมอ
 *
 * นิยามที่ทั้งสองหน้าต้องตรงกัน (แก้ที่นี่ที่เดียว):
 *  - "วันส่งงาน" = review_submitted_at → revision_at → approved_at → posted_at (workTimeOf)
 *  - เป้าของกติกา 'day' = target × จำนวนวันของเดือนนั้น (monthTargetOf)
 *  - เป้ารวมของคน = กติกา "ทุกฟอร์แมต·ทุกหมวด" ถ้ามี ไม่งั้นรวมกติกาที่ระบุฟอร์แมต
 *    (กันนับซ้ำกับกติกาที่เจาะหมวดของฟอร์แมตเดียวกัน — convention เดียวกับ hint ใน /content-kpi)
 */

import { briefFormatOf, postOwnerIdOf } from "@/lib/constants";
import { isImagePath, isVideoPath, thaiDayOf } from "@/lib/media";
import type {
  ContentFormat,
  ContentKpiBasis,
  ContentKpiRow,
} from "@/lib/types";

/* ---------- types ที่หน้า server ส่งลงมา ---------- */

/** แถวงานแบบย่อที่ระบบ KPI ใช้ — select เฉพาะคอลัมน์นี้จาก page.tsx */
export type TrackedTask = {
  id: string;
  title: string;
  assignee_id: string | null;
  posted_at: string | null;
  approved_at: string | null;
  review_submitted_at: string | null;
  review_status: string;
  completed: boolean;
  content_format: ContentFormat | null;
  content_category_id: string | null;
  /** ผู้สร้างการ์ด — การ์ด creative ที่มาจาก Brief ช่องนี้คือ "ผู้สั่ง Brief" (migration 0095 ใช้หาเจ้าของคิวโพส) */
  created_by: string | null;
  /** เวลาที่มีคนกด "รับงาน" บนการ์ด Brief — ฐานการนับ 'brief' ของผู้สั่ง Brief */
  brief_accepted_at: string | null;
  /** การ์ด creative ที่เกิดจาก Brief จะชี้กลับการ์ด Brief ต้นทาง (null = ไม่ได้มาจาก Brief) */
  brief_source_id: string | null;
  /** ชนิดงานที่สั่งบนการ์ด Brief (graphic|video) — ใช้เดาฟอร์แมตของ event ฐาน 'brief' */
  brief_content_type: string | null;
  /**
   * เวลาที่ถูกตีกลับล่าสุด (คอมเมนต์ is_revision ล่าสุดของการ์ด) — kpi-data เป็นคนใส่มาให้
   * **ทำไมต้องมี:** migration 0036 ล้าง `review_submitted_at` ทิ้งตอนตีกลับ งานที่กำลังแก้อยู่
   * จึงไม่เหลือวันส่งงานเลยและหายไปจาก KPI ทั้งใบ — ช่องนี้คือวันส่งงานที่กู้กลับคืนมา
   */
  revision_at: string | null;
  /** ประเภทการตีกลับล่าสุด ('mistake' = คำผิด นับ KPI · 'addition' = เพิ่มเติม ไม่นับ) */
  revision_kind: string | null;
  /** ไฟล์ที่อัพโหลดในการ์ด (task_files) — ตัววิเคราะห์จำนวนชิ้นงานใช้นับภาพ/วิดีโอจริง */
  files: { file_path: string }[];
};

export type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
};

/* ---------- วัน/เดือน (เวลาไทย) ---------- */

// ชื่อเดือนไทยตารางคงที่ — ห้ามใช้ toLocaleDateString (ผล SSR/CSR ไม่ตรงกัน)
export const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

/** ชื่อวันแบบสั้น เริ่มวันจันทร์ (แบบเดียวกับปฏิทินคิว Influ) — อาทิตย์อยู่คอลัมน์ท้าย */
export const WEEKDAYS_MON = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"] as const;

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function monthLabel(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1] ?? month} ${year + 543}`;
}

/** ขอบเขตเดือนตามเวลาไทย เป็น epoch ms — [start, end) */
export function monthBounds(year: number, month: number) {
  const start = Date.parse(`${year}-${pad2(month)}-01T00:00:00+07:00`);
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const end = Date.parse(`${nextY}-${pad2(nextM)}-01T00:00:00+07:00`);
  return { start, end };
}

export function shiftMonth(year: number, month: number, dir: -1 | 1) {
  const m = month + dir;
  if (m < 1) return { year: year - 1, month: 12 };
  if (m > 12) return { year: year + 1, month: 1 };
  return { year, month: m };
}

/**
 * ดัชนีคอลัมน์แบบจันทร์ = 0 … อาทิตย์ = 6 ของวันที่ 1 ของเดือน
 *
 * คิดจาก `Date.UTC` ของวันที่ตามปฏิทิน (ไม่ใช่ epoch ของเที่ยงคืนเวลาไทย ซึ่งตกอยู่ใน
 * "วัน UTC" ก่อนหน้าจึงเลื่อนคอลัมน์ไป 1 ช่อง) — ค่านี้ไม่ขึ้นกับ timezone ของเครื่องผู้ใช้
 * จึงไม่มีทางเพี้ยนระหว่าง SSR/CSR; 1 ม.ค. 1970 เป็นวันพฤหัส = index 3 แบบเริ่มวันจันทร์
 */
export function firstWeekdayIndex(year: number, month: number): number {
  const days = Math.round(Date.UTC(year, month - 1, 1) / 86400000);
  return (((days + 3) % 7) + 7) % 7;
}

/** วันที่แบบไทยเต็ม เช่น "12 สิงหาคม 2569" — ใช้เป็นหัวโมดัลรายละเอียดของวัน */
export function thaiDateLabel(year: number, month: number, day: number): string {
  return `${day} ${THAI_MONTHS[month - 1] ?? month} ${year + 543}`;
}

export function personName(p: ProfileLite | undefined | null): string {
  if (!p) return "ไม่ทราบชื่อ";
  return p.full_name?.trim() || p.email || "ไม่ทราบชื่อ";
}

/** ชื่อสั้นสำหรับชิปในช่องปฏิทิน (ช่องแคบ ชื่อเต็มอ่านไม่ทัน) — คำแรกของชื่อ */
export function shortName(p: ProfileLite | undefined | null): string {
  const full = personName(p);
  return full.split(/\s+/)[0] || full;
}

export function initialsOf(p: ProfileLite | undefined | null): string {
  return personName(p).trim().charAt(0).toUpperCase() || "?";
}

/* ---------- งาน: เวลาส่ง + สถานะการตรวจ ---------- */

/**
 * วันส่งงานดิบของการ์ด — **ห้ามสลับให้ approved_at ขึ้นก่อน**
 * (ผู้ใช้ย้ำ 2026-08-29: KPI นับ "วันที่ส่งตรวจ" ไม่ใช่ "วันที่ตรวจผ่าน")
 *  1. review_submitted_at = กดส่งตรวจ (ค่าปกติ)
 *  2. revision_at         = ถูกตีกลับอยู่ — 0036 ล้างช่องแรกทิ้ง ใช้วันที่ตีกลับแทน
 *                           ไม่งั้นงานที่กำลังแก้หายจาก KPI ทั้งใบ
 *  3. approved_at         = งานเก่าก่อน 0036 ที่ไม่เคยมี review_submitted_at
 *  4. posted_at           = ทางสุดท้ายของงานที่ไม่เคยเข้าคิวตรวจ
 */
function workRawOf(t: TrackedTask): string | null {
  return t.review_submitted_at ?? t.revision_at ?? t.approved_at ?? t.posted_at;
}

/** เวลาที่งานชิ้นนี้ "ส่งงาน" (epoch ms) — ฐานเวลาเดียวของทั้งระบบ KPI */
export function workTimeOf(t: TrackedTask): number | null {
  const raw = workRawOf(t);
  if (raw === null) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** วันส่งงานตามเวลาไทย (YYYY-MM-DD) — ตัววิเคราะห์จำนวนชิ้นงานใช้เทียบกับตัวกรองช่วงวัน */
export function workDayOf(t: TrackedTask): string | null {
  const raw = workRawOf(t);
  return raw === null ? null : thaiDayOf(raw);
}

/**
 * สถานะของงานที่ส่งแล้ว — เป็นตัวกำหนดสีทั้งระบบ KPI
 * **รหัสสีที่ผู้ใช้กำหนดเอง (2026-08-29): ฟ้า = ตรวจผ่านแล้ว · เขียว = ส่งตรวจแล้ว · แดง = งานแก้**
 *  approved = ตรวจผ่านแล้ว (ฟ้า) · waiting = ส่งตรวจแล้วรอผู้ตรวจ (เขียว)
 *  revision = ถูกตีกลับและยังไม่ได้กดส่งตรวจใหม่ = กำลังแก้อยู่ (แดง)
 *  sent     = ส่งแล้วแต่ไม่ได้อยู่ในคิวตรวจ (งานเก่า/ปิดเองโดยไม่ส่งตรวจ) — นับเป็น
 *             "ยังไม่ผ่าน" เหมือน waiting แค่แยกป้ายให้รู้ที่มา จึงใช้โทนเขียวชุดเดียวกัน
 */
export type WorkState = "approved" | "waiting" | "revision" | "sent";

export function workStateOf(t: TrackedTask): WorkState {
  if (t.review_status === "approved") return "approved";
  if (t.review_status === "pending") return "waiting";
  // ไม่อยู่ในคิวตรวจ + เคยถูกตีกลับ + ยังไม่ได้กดส่งตรวจใหม่ (0036 ล้างช่องนั้นทิ้ง) = กำลังแก้
  if (t.revision_at !== null && t.review_submitted_at === null) return "revision";
  return "sent";
}

/**
 * ป้ายสถานะในโมดัลรายวัน/ตัวกรอง — อยู่บนพื้นขาว จึงใช้คนละชุดกับชิปในช่องปฏิทิน (HEAT_CHIP)
 * `text` = สีตัวเลขบนแผงสถิติ/หัวปฏิทิน (พื้นขาวเหมือนกัน)
 */
export const WORK_STATES: Record<
  WorkState,
  { label: string; chip: string; short: string; text: string; dot: string }
> = {
  approved: {
    label: "ตรวจผ่านแล้ว",
    short: "ผ่าน",
    // sky-600 คู่ตัวขาว ≈4.6:1 — ปลายเดียวกับระดับเข้มสุดของ heatmap
    chip: "bg-sky-600 text-white",
    text: "text-sky-700",
    dot: "bg-sky-600",
  },
  waiting: {
    label: "ส่งตรวจแล้ว · รอตรวจ",
    short: "รอตรวจ",
    chip: "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  revision: {
    label: "ถูกตีกลับ · กำลังแก้",
    short: "งานแก้",
    chip: "bg-rose-100 text-rose-900 ring-1 ring-inset ring-rose-300",
    text: "text-rose-600",
    dot: "bg-rose-500",
  },
  sent: {
    label: "ส่งแล้ว · ไม่ได้อยู่ในคิวตรวจ",
    short: "ยังไม่ผ่าน",
    chip: "border border-dashed border-emerald-300 bg-emerald-50/70 text-emerald-800",
    text: "text-emerald-700",
    dot: "border border-emerald-400 bg-white",
  },
};

/** ลำดับที่ใช้แสดงสถานะ (ตัวกรอง/คำอธิบายสี) — ไล่จาก "จบแล้ว" ไป "ยังต้องทำต่อ" */
export const WORK_STATE_ORDER: WorkState[] = [
  "approved",
  "waiting",
  "revision",
  "sent",
];

/* ---------- "ผลงาน 1 ชิ้น" ของแต่ละคน = KPI event (migration 0095) ---------- */

/**
 * งาน 1 การ์ดสร้าง "ผลงาน" ให้คนได้มากกว่า 1 แบบ และคนละคนกัน — ผู้ใช้ 2026-08-29:
 * content บางคนทำหน้าที่ brief อย่างเดียว KPI ของเขาคือ "การ์ด Brief ที่มีคนกดรับงาน"
 * ไม่ใช่การ์ด creative; ส่วนการโพส ถ้าการ์ดมาจาก Brief คนสั่ง Brief เป็นคนถือ KPI การโพส
 * แต่ถ้าไม่มี Brief (ตัดเอง/สร้างการ์ดเอง) คนรับผิดชอบต้องโพสเอง
 *
 * ทุกการนับของระบบ KPI ผ่านตัวนี้ที่เดียว — เพิ่มฐานใหม่ต้องแก้ 3 ที่:
 * type `ContentKpiBasis`, ตาราง `CONTENT_KPI_BASES` และ check constraint (migration ใหม่)
 */
export type KpiEvent = {
  t: TrackedTask;
  basis: ContentKpiBasis;
  /** เจ้าของผลงานชิ้นนี้ (profile id) — คนละคนได้ตามฐาน */
  ownerId: string | null;
  /** เวลาที่ผลงานชิ้นนี้เกิด (epoch ms) — ใช้จัดลงเดือน/ช่องวัน */
  ms: number;
  /** วันในเดือนที่กำลังดู (0-based) — ตั้งค่าเฉพาะ event ที่ตกอยู่ในเดือนนั้น */
  dayIndex: number;
};

const parseMs = (raw: string | null): number | null => {
  if (raw === null) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
};

/** ผลงานทุกแบบที่การ์ดใบนี้สร้างขึ้น (ยังไม่ผูกเดือน — computeKpiMonth เป็นคนคัดต่อ) */
export function kpiEventsOf(
  t: TrackedTask
): { basis: ContentKpiBasis; ownerId: string | null; ms: number }[] {
  const out: { basis: ContentKpiBasis; ownerId: string | null; ms: number }[] =
    [];
  const work = workTimeOf(t);
  if (work !== null)
    out.push({ basis: "work", ownerId: t.assignee_id, ms: work });
  const brief = parseMs(t.brief_accepted_at);
  if (brief !== null)
    out.push({ basis: "brief", ownerId: t.created_by, ms: brief });
  const posted = parseMs(t.posted_at);
  if (posted !== null)
    out.push({ basis: "posted", ownerId: postOwnerIdOf(t), ms: posted });
  return out;
}

/**
 * ฟอร์แมตของ event ตามฐาน — การ์ด Brief มักยังไม่มี `content_format`
 * (ช่องนั้นถูกบังคับติดตอนกด "โพสแล้ว") จึงตกไปเดาจาก `brief_content_type` แทน
 */
export function kpiFormatOf(
  t: TrackedTask,
  basis: ContentKpiBasis
): ContentFormat | null {
  if (basis === "brief")
    return t.content_format ?? briefFormatOf(t.brief_content_type);
  return t.content_format;
}

/** event นี้เข้าเงื่อนไขกติกา KPI แถวนี้ไหม — null ในกติกา = ไม่จำกัด */
export function ruleMatchesEvent(e: KpiEvent, r: ContentKpiRow): boolean {
  if (r.basis !== e.basis) return false;
  if (r.format !== null && kpiFormatOf(e.t, e.basis) !== r.format) return false;
  if (r.category_id !== null && e.t.content_category_id !== r.category_id)
    return false;
  return true;
}

/** ฐานที่คนคนนี้ถูกวัดผล — ไม่มีกติกาเลย = ใช้ 'work' (พฤติกรรมเดิมของระบบ) */
export function basesOf(rules: ContentKpiRow[] | undefined): Set<ContentKpiBasis> {
  if (!rules || rules.length === 0) return new Set<ContentKpiBasis>(["work"]);
  return new Set(rules.map((r) => r.basis));
}

/* ---------- คิวโพสที่ค้าง (นับวันจากที่อนุมัติครบแล้ว) ---------- */

/**
 * จำนวนวันที่งานค้างคิวโพส — นับจาก "วันที่อนุมัติครบ" ถึงวันนี้ (เวลาไทย, นับเป็นวันเต็ม)
 * เทียบเป็น "วันตามปฏิทิน" ทั้งสองฝั่ง จึงไม่แกว่งตามเวลาที่เปิดหน้า และไม่แตะ Date.now()
 */
export function pendingDays(
  approvedAt: string | null,
  today: { year: number; month: number; day: number }
): number {
  if (approvedAt === null) return 0;
  const from = Date.parse(`${thaiDayOf(approvedAt)}T00:00:00+07:00`);
  const now = Date.parse(
    `${today.year}-${pad2(today.month)}-${pad2(today.day)}T00:00:00+07:00`
  );
  if (Number.isNaN(from) || Number.isNaN(now)) return 0;
  return Math.max(0, Math.round((now - from) / 86400000));
}

export type PostBacklogItem = { t: TrackedTask; days: number };

/** สถิติคิวโพสของคนหนึ่ง (เจ้าของคิว = `postOwnerIdOf`) */
export type PostStat = {
  /** งานที่ตรวจผ่านในเดือนที่เลือก และคนนี้เป็นคนที่ต้องโพส */
  due: number;
  /** ในจำนวนนั้น โพสไปแล้วกี่ชิ้น */
  done: number;
  /** คิวค้างสด ณ วันนี้ (ทุกเดือน ไม่ผูกเดือนที่เลือก) — ตัวเลข "ดองไว้กี่ชิ้น" */
  backlog: number;
  /** วันค้างรวมของคิวค้าง (ผลบวกของทุกชิ้น) */
  backlogDays: number;
  /** ค้างนานสุดกี่วัน */
  oldestDays: number;
  /** รายการงานค้าง เรียงค้างนานสุดก่อน — ใช้ในป๊อปอัพ */
  items: PostBacklogItem[];
};

export function emptyPostStat(): PostStat {
  return {
    due: 0,
    done: 0,
    backlog: 0,
    backlogDays: 0,
    oldestDays: 0,
    items: [],
  };
}

/** คิวค้างของคนหนึ่ง พร้อมโปรไฟล์ — ป๊อปอัพ "ใครดองงานโพสไว้บ้าง" ใช้ชุดนี้ */
export type PostBacklogGroup = {
  ownerId: string | null;
  profile: ProfileLite | undefined;
  stat: PostStat;
};

/* ---------- heatmap ของช่องวัน ---------- */

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * ความเข้มของช่องวัน — กติกาสีตามที่ผู้ใช้กำหนด (2026-08-28):
 * เทา = ยังไม่ส่งงาน · ส้มอ่อน = ส่งแล้วยังไม่ผ่านการตรวจ · ส้มเข้ม = ตรวจผ่านแล้ว
 * (ระดับกลางไล่ตามสัดส่วนงานที่ผ่าน — เห็นได้ว่างานเก่าถูกแก้/ตรวจจบไปแล้วแค่ไหน)
 */
export function heatLevel(total: number, approved: number): HeatLevel {
  if (total === 0) return 0;
  const ratio = approved / total;
  if (ratio === 0) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 1) return 3;
  return 4;
}

/**
 * สีของช่องปฏิทินต่อระดับ — คุมที่ตารางนี้ที่เดียว
 * (recolor 2026-08-29 ตามผู้ใช้: "สีแดงเป็นงานแก้ สีฟ้าเป็นตรวจผ่านแล้ว สีเขียวเป็นส่งตรวจแล้ว")
 *
 * หลักที่ยึด:
 * 1. **ramp แนว GnBu ของ ColorBrewer** (sequential ที่ผ่านการพิสูจน์มาแล้ว):
 *    เขียวอ่อน → เขียวอมฟ้า → ฟ้า → ฟ้าเข้ม (emerald-100 → teal-200 → sky-400 → sky-700)
 *    — เข้ารหัสความหมายไปในตัว: ต้นทางเขียว = "ส่งตรวจแล้ว" ปลายทางฟ้า = "ตรวจผ่านแล้ว"
 *    และ **สว่างลดลงพร้อมอิ่มสีเพิ่มขึ้นไปด้วยกัน** ซึ่งเป็นหัวใจของ heat ramp
 * 2. **ค่าความสว่างไล่ลงจริง** L*≈94 → 87 → 72 → 47 — ขั้นสุดท้ายเว้นห่างมากโดยตั้งใจ
 *    ให้ "ผ่านครบ" เป็นหมุดสายตา
 * 3. **ช่องว่าง = สีเทากลาง ไม่ใช่ขาว** ให้วันที่ยังไม่ส่งงานจมลงไปเป็นพื้นหลัง
 * 4. **คอนทราสต์ตัวหนังสือผ่านทุกระดับ**: ระดับ 1-3 ตัวเข้ม (≥6:1) · ระดับ 4 ตัวขาวบน
 *    sky-700 (≈5.4:1) — **ห้ามใช้เฉดกลางอย่าง sky-500/brand-500 เป็นพื้น** เพราะคอนทราสต์
 *    ตกทั้งกับตัวขาวและตัวเข้ม (~3:1 ทั้งคู่); เคยลองจบที่ brand-700 (copper) แล้วพังมาแล้ว
 *    เพราะสีหม่นอิ่มสีต่ำอ่านว่า "จางลง" แทนที่จะเป็น "เข้มขึ้น"
 * 5. **ชิปงานเป็นการ์ดขาวทึบเสมอทุกระดับ** — ชิปสีบนพื้นสีเดียวกันจะขุ่นกลืนกันหมด
 *    (ระดับ 0 ไม่มีชิปอยู่แล้ว เพราะ level 0 = ไม่มีงานในวันนั้น)
 * 6. **งานแก้ (แดง) ไม่ใช่ระดับความเข้ม แต่เป็นสัญญาณซ้อนทับ** — วันที่มีงานถูกตีกลับได้
 *    ขอบแดง (HEAT_REWORK) เพราะเป็นคนละมิติกับ "ผ่านไปเท่าไหร่" และเป็นสัญญาณเดียว
 *    ที่มองเห็นได้บนจอเล็กซึ่งไม่มีชิปงานให้อ่าน
 */
export const HEAT_LEVELS: Record<
  HeatLevel,
  {
    /** พื้นช่อง */
    tile: string;
    /** สีตอน hover (เข้มขึ้นนิดเดียว ไม่เปลี่ยนความหมาย) */
    hover: string;
    /** เลขวัน */
    day: string;
    /** วงกลม "วันนี้" ที่ครอบเลขวัน — ต้องเด่นบนพื้นทุกระดับ */
    today: string;
    /** ตัวเลข ผ่าน/ทั้งหมด มุมขวาบน */
    ratio: string;
  }
> = {
  0: {
    tile: "bg-stone-200/40",
    hover: "hover:bg-stone-200/70",
    day: "text-stone-400",
    today: "bg-stone-600 text-white",
    ratio: "text-stone-400",
  },
  1: {
    tile: "bg-emerald-100",
    hover: "hover:bg-emerald-200/80",
    day: "text-emerald-950",
    today: "bg-emerald-950 text-white",
    ratio: "text-emerald-900/70",
  },
  2: {
    tile: "bg-teal-200",
    hover: "hover:bg-teal-300/90",
    day: "text-teal-950",
    today: "bg-teal-950 text-white",
    ratio: "text-teal-950/75",
  },
  3: {
    tile: "bg-sky-400",
    hover: "hover:bg-sky-500/90",
    day: "text-sky-950",
    today: "bg-sky-950 text-white",
    ratio: "text-sky-950/80",
  },
  4: {
    tile: "bg-sky-700",
    hover: "hover:bg-sky-800",
    day: "text-white",
    today: "bg-white text-sky-800",
    ratio: "text-white/80",
  },
};

/** ขอบเตือนของช่องวันที่มีงานถูกตีกลับ — แดงตามรหัสสีของผู้ใช้ (สัญญาณเดียวที่เห็นได้บนจอเล็ก) */
export const HEAT_REWORK = "ring-2 ring-inset ring-rose-400";

/** ชิปงานในช่องวัน — การ์ดขาวทึบ ใช้ชุดเดียวทุกระดับความเข้ม (อ่านง่ายบนพื้นสีทุกเฉด) */
export const HEAT_CHIP =
  "bg-white/90 text-stone-700 shadow-[0_1px_2px_rgba(12,74,110,0.12)]";

/**
 * จุดสถานะหน้าชิป — เข้ารหัสสองชั้น (สี + ทึบ/กลวง) คนตาบอดสีก็แยกออก
 * ทึบฟ้า = ตรวจผ่านแล้ว · ทึบเขียว = รอตรวจ · ทึบแดง = งานแก้ · กลวง = ส่งแล้วไม่อยู่ในคิว
 * (สีมาจาก WORK_STATES ที่เดียว — ห้ามตั้งสีซ้ำในหน้า UI)
 */
export const heatDotOf = (state: WorkState) => WORK_STATES[state].dot;
export const HEAT_DOT_DONE = WORK_STATES.approved.dot;
export const HEAT_DOT_OPEN = WORK_STATES.sent.dot;

/** ไล่ระดับสำหรับแถบคำอธิบาย (legend) — เรียงอ่อน→เข้มแบบ heatmap มาตรฐาน */
export const HEAT_SCALE: HeatLevel[] = [1, 2, 3, 4];

/* ---------- กติกา KPI ---------- */

/** เป้าที่ "ควรทำได้ถึงวันนี้" — target × (วันที่ผ่านไป ÷ วันทั้งเดือน) ปัดลง (ต้นเดือนไม่โดนธงแดงฟรี) */
export function expectedByNow(
  target: number,
  elapsedDays: number,
  daysInMonth: number
) {
  return Math.floor((target * elapsedDays) / daysInMonth + 1e-9);
}

/** เป้าทั้งเดือนของกติกา — 'day' (0087) = target × จำนวนวันของเดือนนั้น, 'month' = ค่าตรงๆ */
export function monthTargetOf(rule: ContentKpiRow, daysInMonth: number) {
  return rule.period === "day" ? rule.target * daysInMonth : rule.target;
}

/** เป้าถึงวันนี้ของกติกา — 'day' นับเต็มวัน (target × วันที่ผ่านไป), 'month' ใช้สูตร prorate */
export function expectedOf(
  rule: ContentKpiRow,
  elapsedDays: number,
  daysInMonth: number
) {
  return rule.period === "day"
    ? rule.target * elapsedDays
    : expectedByNow(rule.target, elapsedDays, daysInMonth);
}

/** ฐานทั้งหมดที่ชุดกติกานี้ใช้ (เรียงตามลำดับที่เจอ) */
function basisList(rules: ContentKpiRow[]): ContentKpiBasis[] {
  return [...new Set(rules.map((r) => r.basis))];
}

/**
 * กติกาที่ใช้คิด "เป้ารวม" ของคนหนึ่ง — คิดแยกทีละฐาน (คนหนึ่งมีได้ทั้งเป้าส่งงานและเป้าโพส
 * ซึ่งเป็นคนละผลงานกัน จึงต้องบวกกัน ไม่ใช่เลือกอันใดอันหนึ่ง):
 * ในแต่ละฐาน — กติกาทุกฟอร์แมต·ทุกหมวดถ้ามี (ร่มคลุมทั้งฐาน) ไม่งั้นรวมกติกาที่ระบุ
 * ฟอร์แมตแต่ไม่เจาะหมวด; ไม่มีทั้งคู่ค่อยรวมทุกกติกาของฐานนั้น
 */
export function overallRulesOf(rules: ContentKpiRow[]): ContentKpiRow[] {
  const out: ContentKpiRow[] = [];
  for (const basis of basisList(rules)) {
    const inBasis = rules.filter((r) => r.basis === basis);
    const anyAny = inBasis.find(
      (r) => r.format === null && r.category_id === null
    );
    if (anyAny !== undefined) {
      out.push(anyAny);
      continue;
    }
    const fmtRules = inBasis.filter(
      (r) => r.format !== null && r.category_id === null
    );
    out.push(...(fmtRules.length > 0 ? fmtRules : inBasis));
  }
  return out;
}

/** แถวที่ใช้คิดผลรวมของชุดกติกาย่อยหนึ่ง — ต่อฐาน: แถวที่ไม่เจาะหมวดเป็นร่ม (กันนับซ้ำ) */
function umbrellaRules(rules: ContentKpiRow[]): ContentKpiRow[] {
  const out: ContentKpiRow[] = [];
  for (const basis of basisList(rules)) {
    const inBasis = rules.filter((r) => r.basis === basis);
    const broad = inBasis.filter((r) => r.category_id === null);
    out.push(...(broad.length > 0 ? broad : inBasis));
  }
  return out;
}

/** เป้าของฟอร์แมตหนึ่ง — รวมทุกฐาน โดยในแต่ละฐานใช้แถว "ทุกหมวด" เป็นร่ม */
export function formatTargetOf(
  rules: ContentKpiRow[],
  format: ContentFormat,
  daysInMonth: number
): number {
  return umbrellaRules(rules.filter((r) => r.format === format)).reduce(
    (s, r) => s + monthTargetOf(r, daysInMonth),
    0
  );
}

/** เป้าถึงวันนี้ของฟอร์แมตหนึ่ง — logic เดียวกับ formatTargetOf */
export function formatExpectedOf(
  rules: ContentKpiRow[],
  format: ContentFormat,
  elapsedDays: number,
  daysInMonth: number
): number {
  return umbrellaRules(rules.filter((r) => r.format === format)).reduce(
    (s, r) => s + expectedOf(r, elapsedDays, daysInMonth),
    0
  );
}

/* ---------- จำนวนชิ้นงาน (การ์ด vs ไฟล์ที่อัพจริง) ---------- */

/**
 * ยอดสะสมของตัววิเคราะห์จำนวนชิ้นงาน — แยก 2 มุมมองตามที่ผู้ใช้ขอ (2026-08-26):
 * "การ์ด" = จำนวนงาน (แยกภาพ/วิดีโอจาก content_format) และ "ชิ้นงานไฟล์" =
 * จำนวนไฟล์ภาพ/วิดีโอที่อัพโหลดจริงในการ์ด (การ์ด 1 ใบมีหลายภาพ = หลายชิ้น)
 */
export type PieceAgg = {
  cards: number;
  cardImage: number;
  cardVideo: number;
  cardNone: number;
  files: number;
  fileImage: number;
  fileVideo: number;
};

export function emptyPieceAgg(): PieceAgg {
  return {
    cards: 0,
    cardImage: 0,
    cardVideo: 0,
    cardNone: 0,
    files: 0,
    fileImage: 0,
    fileVideo: 0,
  };
}

/** นับงาน 1 ใบเข้ายอด — ไฟล์ที่ไม่ใช่รูป/วิดีโอ (pdf/zip ฯลฯ) ไม่นับเป็นชิ้นงาน */
export function addToPieceAgg(agg: PieceAgg, t: TrackedTask) {
  agg.cards += 1;
  if (t.content_format === "image") agg.cardImage += 1;
  else if (t.content_format === "video") agg.cardVideo += 1;
  else agg.cardNone += 1;
  for (const f of t.files) {
    if (isImagePath(f.file_path)) {
      agg.fileImage += 1;
      agg.files += 1;
    } else if (isVideoPath(f.file_path)) {
      agg.fileVideo += 1;
      agg.files += 1;
    }
  }
}

/* ---------- สถิติรายคน ---------- */

export type RuleStat = {
  rule: ContentKpiRow;
  /** เป้าทั้งเดือน (กติกา 'day' ถูกคูณจำนวนวันแล้ว) — JSX ต้องใช้ตัวนี้ ไม่ใช่ rule.target */
  target: number;
  done: number;
  lastDone: number;
  expected: number;
  behind: number;
  met: boolean;
};

export type PersonStatus = "behind" | "ontrack" | "done";

export const STATUS_RANK: Record<PersonStatus, number> = {
  behind: 0,
  ontrack: 1,
  done: 2,
};

const EMPTY_BASIS_COUNTS = (): Record<ContentKpiBasis, number> => ({
  work: 0,
  brief: 0,
  posted: 0,
});

export type PersonStat = {
  profile: ProfileLite;
  rules: ContentKpiRow[];
  ruleStats: RuleStat[];
  /** ฐานที่คนนี้ถูกวัดผล (ไม่มีกติกา = 'work') */
  bases: ContentKpiBasis[];
  /** ผลงานที่นับ KPI ในเดือนนี้ (ตามฐานของเขาเอง) เรียงตามเวลา */
  events: KpiEvent[];
  /** การ์ดชิ้นงานที่ตัวเองรับผิดชอบและส่งตรวจในเดือนนี้ (ฐาน 'work' เสมอ ไม่ว่าจะถูกวัดผลด้วยฐานไหน) */
  tasks: TrackedTask[];
  /** จำนวนผลงานที่นับ KPI = events.length */
  doneTotal: number;
  /** งานที่ส่งตรวจเอง (= tasks.length) — คนละตัวกับ doneTotal เมื่อคนนี้ถูกวัดด้วยฐาน brief/posted */
  submitted: number;
  /** ผลงานแยกตามฐาน — โชว์เป็นบรรทัดย่อยเมื่อคนนี้มีหลายฐาน */
  basisCounts: Record<ContentKpiBasis, number>;
  approved: number;
  waiting: number;
  /** งานที่ถูกตีกลับและยังแก้อยู่ (WorkState 'revision') */
  revision: number;
  sent: number;
  posted: number;
  /** จำนวนวันในเดือนที่มีผลงานอย่างน้อย 1 ชิ้น */
  activeDays: number;
  lastTotal: number;
  lastMetRules: number;
  overallTarget: number;
  expectedOverall: number;
  /** ผลงาน/เป้า แยกตามฟอร์แมต — ใช้ทั้งแผงข้างและตารางภาพรวมทีม */
  formats: Record<
    ContentFormat,
    { done: number; target: number; expected: number }
  >;
  /** ผลงานในเดือนที่ยังระบุประเภทชิ้นงาน/หมวดเนื้อหาไม่ครบ */
  untagged: number;
  pieces: PieceAgg;
  /** คิวโพสของคนนี้ (เจ้าของคิวตาม postOwnerIdOf) — due/done ผูกเดือน, backlog เป็นคิวสด */
  post: PostStat;
  status: PersonStatus;
  behindRules: number;
};

/** ยอดรวมทั้งทีมของเดือนที่เลือก — หน้าภาพรวมใช้เป็นบรรทัด "KPI รวม" */
export type TeamTotals = {
  /** งานที่ส่งตรวจในเดือนนี้ทั้งทีม (ฐาน 'work' ล้วน) */
  submitted: number;
  /** ผลงานที่นับ KPI ทั้งทีม (รวมทุกฐานตามที่แต่ละคนถูกตั้งไว้) */
  credited: number;
  creditedByBasis: Record<ContentKpiBasis, number>;
  approved: number;
  waiting: number;
  /** งานทั้งทีมที่ถูกตีกลับและยังแก้อยู่ */
  revision: number;
  sent: number;
  posted: number;
  prevSubmitted: number;
  overallDone: number;
  overallTarget: number;
  overallExpected: number;
  formats: Record<
    ContentFormat,
    { done: number; target: number; expected: number }
  >;
  /** งานทั้งทีมที่ยังระบุประเภทไม่ครบ — เข้ากติกาที่เจาะภาพ/วิดีโอ/หมวดไม่ได้จนกว่าจะระบุ */
  untagged: number;
  /** คิวโพสรวมทั้งทีม */
  post: PostStat;
  peopleWithTarget: number;
  behindPeople: number;
  donePeople: number;
};

/** งาน 1 ชิ้นพร้อมเวลาส่ง + วันในเดือน (0-based) — ใช้ในตัววิเคราะห์ที่นับเฉพาะการส่งงาน */
export type TaskAt = { t: TrackedTask; ms: number; dayIndex: number };

export type KpiMonth = {
  year: number;
  month: number;
  daysInMonth: number;
  /** วันที่ผ่านไปของเดือนที่เลือก — เดือนอดีต = ทั้งเดือน, เดือนอนาคต = 0 */
  elapsedDays: number;
  isCurrentMonth: boolean;
  /** ผลงานที่นับ KPI ของทุกคนในเดือนนี้ (ปฏิทิน/ตัวกรองคนใช้ชุดนี้) เรียงตามเวลา */
  inMonth: KpiEvent[];
  personStats: PersonStat[];
  statsById: Map<string, PersonStat>;
  /** ทุกคนที่มีเป้า หรือมีผลงานในเดือนนี้ — ใช้เป็นตัวเลือก "เลือกคน" */
  people: ProfileLite[];
  /** คนที่มีผลงานในเดือนนี้แต่ยังไม่ถูกตั้งเป้า */
  offRadar: { id: string; profile: ProfileLite | undefined; count: number }[];
  /** งานที่ระบุประเภทไม่ครบ (ไม่มีฟอร์แมต หรือไม่มีหมวดเนื้อหา) */
  untagged: TrackedTask[];
  /** คิวโพสค้างของทั้งทีม แยกตามเจ้าของคิว เรียงค้างนานรวมมากสุดก่อน */
  postBacklog: PostBacklogGroup[];
  /** คิวโพสรายคน (ทุกคนที่มีคิว ไม่ใช่แค่คนที่ถูกตั้งเป้า) — แผงข้างหน้าปฏิทินใช้ */
  postById: Map<string, PostStat>;
  team: TeamTotals;
};

const EMPTY_FORMATS = (): Record<
  ContentFormat,
  { done: number; target: number; expected: number }
> => ({
  image: { done: 0, target: 0, expected: 0 },
  video: { done: 0, target: 0, expected: 0 },
});

/** ระบุประเภทครบหรือยัง — ผู้ใช้ 2026-08-29 สั่งให้ "ประเภทของชิ้น" เป็นข้อบังคับ ไม่ใช่ option */
export function isUntagged(t: TrackedTask): boolean {
  return t.content_format === null || t.content_category_id === null;
}

/**
 * คิดสถิติทั้งเดือนของทีมในที่เดียว — ทั้งหน้าปฏิทินและหน้าภาพรวมเรียกตัวนี้
 * (ตัวเลขจึงตรงกันเสมอ ไม่ต้องไล่แก้สองที่)
 */
export function computeKpiMonth({
  tasks,
  profiles,
  kpis,
  year,
  month,
  today,
}: {
  tasks: TrackedTask[];
  profiles: ProfileLite[];
  kpis: ContentKpiRow[];
  year: number;
  month: number;
  /** วันนี้ตามเวลาไทย (จาก server) */
  today: { year: number; month: number; day: number };
}): KpiMonth {
  const bounds = monthBounds(year, month);
  const daysInMonth = Math.round((bounds.end - bounds.start) / 86400000);
  const prev = shiftMonth(year, month, -1);
  const prevBounds = monthBounds(prev.year, prev.month);
  const prevDays = Math.round((prevBounds.end - prevBounds.start) / 86400000);

  const ymKey = year * 12 + month;
  const nowKey = today.year * 12 + today.month;
  const isCurrentMonth = ymKey === nowKey;
  const elapsedDays =
    ymKey < nowKey
      ? daysInMonth
      : ymKey > nowKey
        ? 0
        : Math.min(today.day, daysInMonth);

  /* กติกาของแต่ละคน — ต้องรู้ก่อนคัด event เพราะ "ผลงานที่นับ" ขึ้นกับฐานที่เขาถูกตั้งไว้ */
  const rulesByPerson = new Map<string, ContentKpiRow[]>();
  for (const r of kpis) {
    const list = rulesByPerson.get(r.profile_id);
    if (list) list.push(r);
    else rulesByPerson.set(r.profile_id, [r]);
  }
  for (const list of rulesByPerson.values())
    list.sort((a, b) => a.position - b.position);

  const basesByPerson = new Map<string, Set<ContentKpiBasis>>();
  const basesFor = (ownerId: string | null): Set<ContentKpiBasis> => {
    if (ownerId === null) return basesOf(undefined);
    const cached = basesByPerson.get(ownerId);
    if (cached) return cached;
    const set = basesOf(rulesByPerson.get(ownerId));
    basesByPerson.set(ownerId, set);
    return set;
  };

  /* คัด event ของเดือนที่ดู + เดือนก่อน — เอาเฉพาะฐานที่เจ้าของคนนั้นถูกวัดผลจริง
     (ไม่งั้นการ์ดใบเดียวจะโผล่ทั้งตอนส่งงานและตอนโพส แล้วยอด "ผลงาน" เกินจริง) */
  const inMonth: KpiEvent[] = [];
  const prevMonthEvents: KpiEvent[] = [];
  /** งานที่ส่งตรวจในเดือน (ฐาน work ล้วน ไม่สนว่าถูกวัดผลไหม) — ใช้กับสถิติ ส่ง/ผ่าน/รอตรวจ */
  const workInMonth: TaskAt[] = [];
  const workPrevMonth: TrackedTask[] = [];

  for (const t of tasks) {
    for (const raw of kpiEventsOf(t)) {
      const inThis = raw.ms >= bounds.start && raw.ms < bounds.end;
      const inPrev = raw.ms >= prevBounds.start && raw.ms < prevBounds.end;
      if (!inThis && !inPrev) continue;
      if (raw.basis === "work") {
        if (inThis)
          workInMonth.push({
            t,
            ms: raw.ms,
            dayIndex: Math.floor((raw.ms - bounds.start) / 86400000),
          });
        else workPrevMonth.push(t);
      }
      if (!basesFor(raw.ownerId).has(raw.basis)) continue;
      const event: KpiEvent = {
        t,
        basis: raw.basis,
        ownerId: raw.ownerId,
        ms: raw.ms,
        dayIndex: Math.floor(
          (raw.ms - (inThis ? bounds.start : prevBounds.start)) / 86400000
        ),
      };
      if (inThis) inMonth.push(event);
      else prevMonthEvents.push(event);
    }
  }
  inMonth.sort((a, b) => a.ms - b.ms);
  workInMonth.sort((a, b) => a.ms - b.ms);

  const byOwner = new Map<string, KpiEvent[]>();
  for (const e of inMonth) {
    if (e.ownerId === null) continue;
    const list = byOwner.get(e.ownerId);
    if (list) list.push(e);
    else byOwner.set(e.ownerId, [e]);
  }

  const prevByOwner = new Map<string, KpiEvent[]>();
  for (const e of prevMonthEvents) {
    if (e.ownerId === null) continue;
    const list = prevByOwner.get(e.ownerId);
    if (list) list.push(e);
    else prevByOwner.set(e.ownerId, [e]);
  }

  const workByAssignee = new Map<string, TrackedTask[]>();
  for (const { t } of workInMonth) {
    if (t.assignee_id === null) continue;
    const list = workByAssignee.get(t.assignee_id);
    if (list) list.push(t);
    else workByAssignee.set(t.assignee_id, [t]);
  }

  /* ---------- คิวโพส (เจ้าของ = ผู้สั่ง Brief ถ้าการ์ดมาจาก Brief ไม่งั้นผู้รับผิดชอบ) ---------- */
  const postByOwner = new Map<string, PostStat>();
  const teamPost = emptyPostStat();
  const bumpPost = (ownerId: string | null, apply: (p: PostStat) => void) => {
    apply(teamPost);
    if (ownerId === null) return;
    let cur = postByOwner.get(ownerId);
    if (!cur) {
      cur = emptyPostStat();
      postByOwner.set(ownerId, cur);
    }
    apply(cur);
  };
  for (const t of tasks) {
    if (t.review_status !== "approved") continue;
    const ownerId = postOwnerIdOf(t);
    // **จัดลงเดือนด้วย "วันส่งงาน" ไม่ใช่วันที่ตรวจผ่าน** (ผู้ใช้ 2026-08-29) — งานที่ส่ง
    // ปลายเดือนแล้วผู้ตรวจกดผ่านต้นเดือนถัดไป ต้องอยู่เดือนเดียวกับที่มันถูกนับเป็นผลงาน
    // ไม่งั้นตัวหารของ "โพสแล้ว x/y" ไปคนละเดือนกับตัวเลขผลงานบนแผงเดียวกัน
    const workMs = workTimeOf(t);
    if (workMs !== null && workMs >= bounds.start && workMs < bounds.end) {
      bumpPost(ownerId, (p) => {
        p.due += 1;
        if (t.posted_at !== null) p.done += 1;
      });
    }
    if (t.posted_at === null) {
      const days = pendingDays(t.approved_at, today);
      bumpPost(ownerId, (p) => {
        p.backlog += 1;
        p.backlogDays += days;
        p.oldestDays = Math.max(p.oldestDays, days);
        p.items.push({ t, days });
      });
    }
  }
  const sortBacklog = (p: PostStat) => {
    p.items.sort(
      (a, b) => b.days - a.days || a.t.title.localeCompare(b.t.title, "th")
    );
  };
  sortBacklog(teamPost);
  for (const p of postByOwner.values()) sortBacklog(p);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const postBacklog: PostBacklogGroup[] = [...postByOwner.entries()]
    .filter(([, stat]) => stat.backlog > 0)
    .map(([ownerId, stat]) => ({
      ownerId,
      profile: profileById.get(ownerId),
      stat,
    }))
    .sort(
      (a, b) =>
        b.stat.backlogDays - a.stat.backlogDays ||
        b.stat.backlog - a.stat.backlog
    );
  // งานค้างที่ไม่รู้ว่าใครต้องโพส (ไม่มีผู้รับผิดชอบ/ผู้สร้าง) — ต่อท้ายลิสต์ ไม่ปล่อยให้หายเงียบ
  const orphanBacklog = teamPost.items.filter(
    (i) => postOwnerIdOf(i.t) === null
  );
  if (orphanBacklog.length > 0) {
    const stat = emptyPostStat();
    stat.backlog = orphanBacklog.length;
    stat.backlogDays = orphanBacklog.reduce((s, i) => s + i.days, 0);
    stat.oldestDays = orphanBacklog.reduce((s, i) => Math.max(s, i.days), 0);
    stat.items = orphanBacklog;
    postBacklog.push({ ownerId: null, profile: undefined, stat });
  }

  /* ---------- สถิติรายคน ---------- */
  const personStats: PersonStat[] = [];
  for (const profile of profiles) {
    const rules = rulesByPerson.get(profile.id);
    if (!rules) continue;
    const events = byOwner.get(profile.id) ?? [];
    const prevEvents = prevByOwner.get(profile.id) ?? [];
    const workTasks = workByAssignee.get(profile.id) ?? [];

    const ruleStats: RuleStat[] = rules.map((rule) => {
      const count = events.filter((e) => ruleMatchesEvent(e, rule)).length;
      const target = monthTargetOf(rule, daysInMonth);
      const expected = expectedOf(rule, elapsedDays, daysInMonth);
      return {
        rule,
        target,
        done: count,
        lastDone: prevEvents.filter((e) => ruleMatchesEvent(e, rule)).length,
        expected,
        behind: Math.max(0, expected - count),
        met: count >= target,
      };
    });

    const overallRules = overallRulesOf(rules);
    const formats = EMPTY_FORMATS();
    for (const f of ["image", "video"] as const) {
      formats[f] = {
        done: events.filter((e) => kpiFormatOf(e.t, e.basis) === f).length,
        target: formatTargetOf(rules, f, daysInMonth),
        expected: formatExpectedOf(rules, f, elapsedDays, daysInMonth),
      };
    }

    // ชิ้นงาน/ไฟล์ นับจากการ์ดที่ไม่ซ้ำ (คนที่ถูกวัดหลายฐานอาจได้การ์ดใบเดียวสองครั้ง)
    const pieces = emptyPieceAgg();
    const seenCards = new Set<string>();
    for (const e of events) {
      if (seenCards.has(e.t.id)) continue;
      seenCards.add(e.t.id);
      addToPieceAgg(pieces, e.t);
    }

    const basisCounts = EMPTY_BASIS_COUNTS();
    for (const e of events) basisCounts[e.basis] += 1;

    const behindRules = ruleStats.filter((r) => r.behind > 0).length;
    const allMet = ruleStats.length > 0 && ruleStats.every((r) => r.met);

    personStats.push({
      profile,
      rules,
      ruleStats,
      bases: basisList(rules),
      events,
      tasks: workTasks,
      doneTotal: events.length,
      submitted: workTasks.length,
      basisCounts,
      approved: workTasks.filter((t) => workStateOf(t) === "approved").length,
      waiting: workTasks.filter((t) => workStateOf(t) === "waiting").length,
      revision: workTasks.filter((t) => workStateOf(t) === "revision").length,
      sent: workTasks.filter((t) => workStateOf(t) === "sent").length,
      posted: events.filter((e) => e.t.posted_at !== null).length,
      activeDays: new Set(events.map((e) => e.dayIndex)).size,
      lastTotal: prevEvents.length,
      lastMetRules: rules.filter(
        (rule) =>
          prevEvents.filter((e) => ruleMatchesEvent(e, rule)).length >=
          monthTargetOf(rule, prevDays)
      ).length,
      overallTarget: overallRules.reduce(
        (s, r) => s + monthTargetOf(r, daysInMonth),
        0
      ),
      expectedOverall: overallRules.reduce(
        (s, r) => s + expectedOf(r, elapsedDays, daysInMonth),
        0
      ),
      formats,
      untagged: events.filter((e) => isUntagged(e.t)).length,
      pieces,
      post: postByOwner.get(profile.id) ?? emptyPostStat(),
      status: allMet ? "done" : behindRules > 0 ? "behind" : "ontrack",
      behindRules,
    });
  }
  personStats.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.behindRules - a.behindRules ||
      personName(a.profile).localeCompare(personName(b.profile), "th")
  );

  const statsById = new Map(personStats.map((s) => [s.profile.id, s]));

  // ตัวเลือก "เลือกคน" = คนที่ถูกตั้งเป้า หรือมีผลงานในเดือนนี้ (เรียงตามลำดับรายชื่อ server)
  const people = profiles.filter(
    (p) => rulesByPerson.has(p.id) || byOwner.has(p.id)
  );

  const offRadar = [...byOwner.keys()]
    .filter((id) => !rulesByPerson.has(id))
    .map((id) => ({
      id,
      profile: profileById.get(id),
      count: byOwner.get(id)?.length ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  /* ยอด KPI ของทีม = รวมเฉพาะ "คนที่ถูกตั้งเป้า" ทั้งตัวตั้งและตัวหาร
     (ถ้าเอาผลงานของคนที่ยังไม่มีเป้ามาบวกในตัวตั้ง อัตราส่วน 42/100 จะเกินจริง และ
     ตัวเลข "รวมทุกฟอร์แมต" จะไม่เท่ากับผลบวกของแต่ละฟอร์แมต) — ผลผลิตจริงทั้งทีม
     ดูได้ที่ `submitted` และรายชื่อคนที่ยังไม่ถูกตั้งเป้าดูที่ `offRadar` */
  const teamFormats = EMPTY_FORMATS();
  for (const s of personStats) {
    for (const f of ["image", "video"] as const) {
      teamFormats[f].done += s.formats[f].done;
      teamFormats[f].target += s.formats[f].target;
      teamFormats[f].expected += s.formats[f].expected;
    }
  }

  const creditedByBasis = EMPTY_BASIS_COUNTS();
  for (const e of inMonth) creditedByBasis[e.basis] += 1;

  const untaggedTasks: TrackedTask[] = [];
  const seenUntagged = new Set<string>();
  for (const e of inMonth) {
    if (!isUntagged(e.t) || seenUntagged.has(e.t.id)) continue;
    seenUntagged.add(e.t.id);
    untaggedTasks.push(e.t);
  }

  const team: TeamTotals = {
    submitted: workInMonth.length,
    credited: inMonth.length,
    creditedByBasis,
    approved: workInMonth.filter(({ t }) => workStateOf(t) === "approved")
      .length,
    waiting: workInMonth.filter(({ t }) => workStateOf(t) === "waiting").length,
    revision: workInMonth.filter(({ t }) => workStateOf(t) === "revision")
      .length,
    sent: workInMonth.filter(({ t }) => workStateOf(t) === "sent").length,
    posted: workInMonth.filter(({ t }) => t.posted_at !== null).length,
    prevSubmitted: workPrevMonth.length,
    overallDone: personStats.reduce((s, p) => s + p.doneTotal, 0),
    overallTarget: personStats.reduce((s, p) => s + p.overallTarget, 0),
    overallExpected: personStats.reduce((s, p) => s + p.expectedOverall, 0),
    formats: teamFormats,
    untagged: untaggedTasks.length,
    post: teamPost,
    peopleWithTarget: personStats.length,
    behindPeople: personStats.filter((s) => s.status === "behind").length,
    donePeople: personStats.filter((s) => s.status === "done").length,
  };

  return {
    year,
    month,
    daysInMonth,
    elapsedDays,
    isCurrentMonth,
    inMonth,
    personStats,
    statsById,
    people,
    offRadar,
    untagged: untaggedTasks,
    postBacklog,
    postById: postByOwner,
    team,
  };
}

/**
 * % ความคืบหน้าสำหรับ "แสดงเป็นตัวเลข" — **ไม่ cap ที่ 100** เพราะทำเกินเป้าได้
 * (เคยขึ้น "81/70 (100%)" ซึ่งกลืนความจริงว่าทีมทำเกินเป้าไป 16%)
 * ส่วนความยาวแถบ PaceBar cap เองอยู่แล้ว จึงไม่ล้นกล่อง; target 0 = ยังไม่ตั้งเป้า คืน 0
 */
export function pctOf(done: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((done / target) * 100);
}

/** โทนของแถบความคืบหน้า — ครบเป้า / ตามหลังเป้าถึงวันนี้ / ยังอยู่ในเกณฑ์ */
export function paceTone(
  done: number,
  target: number,
  expected: number
): "met" | "behind" | "ontrack" {
  if (target > 0 && done >= target) return "met";
  return done < expected ? "behind" : "ontrack";
}
