/**
 * ตรรกะกลางของ KPI คอนเทนต์ (migration 0085 + 0087) — ใช้ร่วมกัน 2 หน้า:
 *   • `/content-tracking`          = ปฏิทินรายคน (heatmap + แผงสถิติด้านขวา)
 *   • `/content-tracking/overview` = ภาพรวมทีม (ตาราง/ลิสต์เทียบกันทั้งทีม)
 *
 * ทุกอย่างในไฟล์นี้เป็น pure function ระดับโมดูล — **ห้ามอ่านเวลาปัจจุบันในนี้**
 * (กฎ react-hooks/purity ของโปรเจกต์): "วันนี้" ถูกส่งมาจาก server ผ่าน props เสมอ
 *
 * นิยามที่ทั้งสองหน้าต้องตรงกัน (แก้ที่นี่ที่เดียว):
 *  - "วันส่งงาน" = review_submitted_at → approved_at → posted_at (workTimeOf)
 *  - เป้าของกติกา 'day' = target × จำนวนวันของเดือนนั้น (monthTargetOf)
 *  - เป้ารวมของคน = กติกา "ทุกฟอร์แมต·ทุกหมวด" ถ้ามี ไม่งั้นรวมกติกาที่ระบุฟอร์แมต
 *    (กันนับซ้ำกับกติกาที่เจาะหมวดของฟอร์แมตเดียวกัน — convention เดียวกับ hint ใน /content-kpi)
 */

import { isImagePath, isVideoPath, thaiDayOf } from "@/lib/media";
import type { ContentFormat, ContentKpiRow } from "@/lib/types";

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
 * เวลาที่งานชิ้นนี้ "ส่งงาน" — ผู้ใช้ให้นับ KPI จากการส่งงาน ไม่ใช่วันกดโพส
 * (คนโพสอาจกดช้าเป็นชุด — คนทำงานไม่ควรดูตามหลังเพราะคิวโพส):
 * ยึด review_submitted_at (กดส่งตรวจ) → งานเก่าก่อน 0036 ใช้ approved_at → posted_at
 */
export function workTimeOf(t: TrackedTask): number | null {
  const raw = t.review_submitted_at ?? t.approved_at ?? t.posted_at;
  if (raw === null) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** วันส่งงานตามเวลาไทย (YYYY-MM-DD) — ตัววิเคราะห์จำนวนชิ้นงานใช้เทียบกับตัวกรองช่วงวัน */
export function workDayOf(t: TrackedTask): string | null {
  const raw = t.review_submitted_at ?? t.approved_at ?? t.posted_at;
  return raw === null ? null : thaiDayOf(raw);
}

/**
 * สถานะของงานที่ส่งแล้ว — เป็นตัวกำหนดสีบนปฏิทิน (heatmap ตามคำสั่งผู้ใช้):
 *  approved = ตรวจผ่านแล้ว (ส้มเข้ม) · waiting = ส่งตรวจแล้วรอผู้ตรวจ (ส้มอ่อน)
 *  sent     = ส่งแล้วแต่ไม่ได้อยู่ในคิวตรวจ (งานเก่า/ปิดเองโดยไม่ส่งตรวจ, หรือถูกตีกลับ
 *             หลังเคยผ่าน) — ยังนับเป็น "ยังไม่ผ่าน" เหมือน waiting แค่แยกป้ายให้รู้ที่มา
 * (งานที่ถูกตีกลับตอนยังไม่เคยผ่านจะหลุดจากการนับเอง เพราะ 0036 ล้าง review_submitted_at)
 */
export type WorkState = "approved" | "waiting" | "sent";

export function workStateOf(t: TrackedTask): WorkState {
  if (t.review_status === "approved") return "approved";
  if (t.review_status === "pending") return "waiting";
  return "sent";
}

export const WORK_STATES: Record<
  WorkState,
  { label: string; chip: string; dot: string; short: string }
> = {
  approved: {
    label: "ตรวจผ่านแล้ว",
    short: "ผ่าน",
    chip: "bg-amber-500 text-white",
    dot: "bg-amber-500",
  },
  waiting: {
    label: "ส่งแล้ว · รอตรวจ",
    short: "รอตรวจ",
    chip: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300",
    dot: "bg-amber-200 ring-1 ring-amber-400",
  },
  sent: {
    label: "ส่งแล้ว · ไม่ได้อยู่ในคิวตรวจ",
    short: "ยังไม่ผ่าน",
    chip: "border border-dashed border-amber-400 bg-amber-50 text-amber-800",
    dot: "border border-dashed border-amber-400 bg-amber-50",
  },
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

/** พื้นช่องปฏิทินตามระดับ — ตัวหนังสือยังเป็นสีเข้มอ่านได้ทุกระดับ (สูงสุด amber-300) */
export const HEAT_CELL: Record<HeatLevel, string> = {
  0: "bg-stone-100/70",
  1: "bg-amber-50",
  2: "bg-amber-100",
  3: "bg-amber-200",
  4: "bg-amber-300",
};

/** ตัวอย่างสีสำหรับแถบคำอธิบาย (legend) เหนือปฏิทิน */
export const HEAT_LEGEND: { level: HeatLevel; label: string }[] = [
  { level: 0, label: "ยังไม่ส่ง" },
  { level: 1, label: "ส่งแล้ว ยังไม่ผ่าน" },
  { level: 2, label: "ผ่านบางส่วน" },
  { level: 4, label: "ผ่านครบทุกงาน" },
];

/* ---------- กติกา KPI ---------- */

/** งานชิ้นนี้เข้าเงื่อนไขกติกา KPI แถวนี้ไหม — null ในกติกา = ไม่จำกัด */
export function matchesRule(t: TrackedTask, r: ContentKpiRow): boolean {
  if (r.format !== null && t.content_format !== r.format) return false;
  if (r.category_id !== null && t.content_category_id !== r.category_id)
    return false;
  return true;
}

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

/**
 * กติกาที่ใช้คิด "เป้ารวม" ของคนหนึ่ง — กติกาทุกฟอร์แมต·ทุกหมวดถ้ามี (เป็นร่มคลุมทั้งหมด)
 * ไม่งั้นรวมกติกาที่ระบุฟอร์แมตแต่ไม่เจาะหมวด; ไม่มีทั้งคู่ค่อยรวมทุกกติกา
 */
export function overallRulesOf(rules: ContentKpiRow[]): ContentKpiRow[] {
  const anyAny = rules.find((r) => r.format === null && r.category_id === null);
  if (anyAny !== undefined) return [anyAny];
  const fmtRules = rules.filter(
    (r) => r.format !== null && r.category_id === null
  );
  return fmtRules.length > 0 ? fmtRules : rules;
}

/** เป้าของฟอร์แมตหนึ่ง — กติกา "ฟอร์แมตนี้·ทุกหมวด" เป็นร่ม ไม่งั้นรวมกติกาที่เจาะหมวด */
export function formatTargetOf(
  rules: ContentKpiRow[],
  format: ContentFormat,
  daysInMonth: number
): number {
  const broad = rules.find((r) => r.format === format && r.category_id === null);
  if (broad) return monthTargetOf(broad, daysInMonth);
  return rules
    .filter((r) => r.format === format)
    .reduce((s, r) => s + monthTargetOf(r, daysInMonth), 0);
}

/** เป้าถึงวันนี้ของฟอร์แมตหนึ่ง — logic เดียวกับ formatTargetOf */
export function formatExpectedOf(
  rules: ContentKpiRow[],
  format: ContentFormat,
  elapsedDays: number,
  daysInMonth: number
): number {
  const broad = rules.find((r) => r.format === format && r.category_id === null);
  if (broad) return expectedOf(broad, elapsedDays, daysInMonth);
  return rules
    .filter((r) => r.format === format)
    .reduce((s, r) => s + expectedOf(r, elapsedDays, daysInMonth), 0);
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

export type PersonStat = {
  profile: ProfileLite;
  rules: ContentKpiRow[];
  ruleStats: RuleStat[];
  /** งานที่ส่งในเดือนที่เลือก (เรียงตามเวลาส่ง) */
  tasks: TrackedTask[];
  doneTotal: number;
  approved: number;
  waiting: number;
  sent: number;
  posted: number;
  /** จำนวนวันในเดือนที่มีการส่งงานอย่างน้อย 1 ชิ้น */
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
  /** งานในเดือนที่ยังไม่ติดประเภทชิ้นงาน */
  untagged: number;
  pieces: PieceAgg;
  /** ตรวจผ่านแล้วแต่ยังไม่กดโพส — คิวค้างทั้งหมด ไม่ผูกเดือน */
  pending: number;
  status: PersonStatus;
  behindRules: number;
};

/** ยอดรวมทั้งทีมของเดือนที่เลือก — หน้าภาพรวมใช้เป็นบรรทัด "KPI รวม" */
export type TeamTotals = {
  submitted: number;
  approved: number;
  waiting: number;
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
  /** งานทั้งทีมที่ยังไม่ติดประเภท — เข้ากติกาที่เจาะภาพ/วิดีโอไม่ได้จนกว่าจะติดประเภท */
  untagged: number;
  pendingPost: number;
  peopleWithTarget: number;
  behindPeople: number;
  donePeople: number;
};

/** งาน 1 ชิ้นพร้อมเวลาส่ง + วันในเดือน (0-based) — ปฏิทินใช้จัดลงช่อง */
export type TaskAt = { t: TrackedTask; ms: number; dayIndex: number };

export type KpiMonth = {
  year: number;
  month: number;
  daysInMonth: number;
  /** วันที่ผ่านไปของเดือนที่เลือก — เดือนอดีต = ทั้งเดือน, เดือนอนาคต = 0 */
  elapsedDays: number;
  isCurrentMonth: boolean;
  inMonth: TaskAt[];
  personStats: PersonStat[];
  statsById: Map<string, PersonStat>;
  /** ทุกคนที่มีเป้า หรือมีผลงานในเดือนนี้ — ใช้เป็นตัวเลือก "เลือกคน" */
  people: ProfileLite[];
  /** คนที่ส่งงานในเดือนนี้แต่ยังไม่ถูกตั้งเป้า */
  offRadar: { id: string; profile: ProfileLite | undefined; count: number }[];
  untagged: TrackedTask[];
  team: TeamTotals;
};

const EMPTY_FORMATS = (): Record<
  ContentFormat,
  { done: number; target: number; expected: number }
> => ({
  image: { done: 0, target: 0, expected: 0 },
  video: { done: 0, target: 0, expected: 0 },
});

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
  const prevDays = Math.round(
    (prevBounds.end - prevBounds.start) / 86400000
  );

  const ymKey = year * 12 + month;
  const nowKey = today.year * 12 + today.month;
  const isCurrentMonth = ymKey === nowKey;
  const elapsedDays =
    ymKey < nowKey
      ? daysInMonth
      : ymKey > nowKey
        ? 0
        : Math.min(today.day, daysInMonth);

  const inMonth: TaskAt[] = [];
  const prevMonth: TrackedTask[] = [];
  for (const t of tasks) {
    const ms = workTimeOf(t);
    if (ms === null) continue;
    if (ms >= bounds.start && ms < bounds.end) {
      inMonth.push({
        t,
        ms,
        dayIndex: Math.floor((ms - bounds.start) / 86400000),
      });
    } else if (ms >= prevBounds.start && ms < prevBounds.end) {
      prevMonth.push(t);
    }
  }
  inMonth.sort((a, b) => a.ms - b.ms);

  const byAssignee = new Map<string, TaskAt[]>();
  for (const at of inMonth) {
    if (at.t.assignee_id === null) continue;
    const list = byAssignee.get(at.t.assignee_id);
    if (list) list.push(at);
    else byAssignee.set(at.t.assignee_id, [at]);
  }

  const prevByAssignee = new Map<string, TrackedTask[]>();
  for (const t of prevMonth) {
    if (t.assignee_id === null) continue;
    const list = prevByAssignee.get(t.assignee_id);
    if (list) list.push(t);
    else prevByAssignee.set(t.assignee_id, [t]);
  }

  /** งานตรวจผ่านแล้วแต่ยังไม่กด "โพสแล้ว" — คิวค้าง ไม่ผูกเดือน */
  const pendingPostByAssignee = new Map<string, number>();
  for (const t of tasks) {
    if (t.posted_at !== null || t.review_status !== "approved") continue;
    if (t.assignee_id === null) continue;
    pendingPostByAssignee.set(
      t.assignee_id,
      (pendingPostByAssignee.get(t.assignee_id) ?? 0) + 1
    );
  }

  const rulesByPerson = new Map<string, ContentKpiRow[]>();
  for (const r of kpis) {
    const list = rulesByPerson.get(r.profile_id);
    if (list) list.push(r);
    else rulesByPerson.set(r.profile_id, [r]);
  }
  for (const list of rulesByPerson.values())
    list.sort((a, b) => a.position - b.position);

  const personStats: PersonStat[] = [];
  for (const profile of profiles) {
    const rules = rulesByPerson.get(profile.id);
    if (!rules) continue;
    const doneAt = byAssignee.get(profile.id) ?? [];
    const done = doneAt.map((a) => a.t);
    const prevDone = prevByAssignee.get(profile.id) ?? [];

    const ruleStats: RuleStat[] = rules.map((rule) => {
      const count = done.filter((t) => matchesRule(t, rule)).length;
      const target = monthTargetOf(rule, daysInMonth);
      const expected = expectedOf(rule, elapsedDays, daysInMonth);
      return {
        rule,
        target,
        done: count,
        lastDone: prevDone.filter((t) => matchesRule(t, rule)).length,
        expected,
        behind: Math.max(0, expected - count),
        met: count >= target,
      };
    });

    const overallRules = overallRulesOf(rules);
    const formats = EMPTY_FORMATS();
    for (const f of ["image", "video"] as const) {
      formats[f] = {
        done: done.filter((t) => t.content_format === f).length,
        target: formatTargetOf(rules, f, daysInMonth),
        expected: formatExpectedOf(rules, f, elapsedDays, daysInMonth),
      };
    }

    const pieces = emptyPieceAgg();
    for (const t of done) addToPieceAgg(pieces, t);

    const behindRules = ruleStats.filter((r) => r.behind > 0).length;
    const allMet = ruleStats.length > 0 && ruleStats.every((r) => r.met);

    personStats.push({
      profile,
      rules,
      ruleStats,
      tasks: done,
      doneTotal: done.length,
      approved: done.filter((t) => workStateOf(t) === "approved").length,
      waiting: done.filter((t) => workStateOf(t) === "waiting").length,
      sent: done.filter((t) => workStateOf(t) === "sent").length,
      posted: done.filter((t) => t.posted_at !== null).length,
      activeDays: new Set(doneAt.map((a) => a.dayIndex)).size,
      lastTotal: prevDone.length,
      lastMetRules: rules.filter(
        (rule) =>
          prevDone.filter((t) => matchesRule(t, rule)).length >=
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
      untagged: done.filter((t) => t.content_format === null).length,
      pieces,
      pending: pendingPostByAssignee.get(profile.id) ?? 0,
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
    (p) => rulesByPerson.has(p.id) || byAssignee.has(p.id)
  );

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const offRadar = [...byAssignee.keys()]
    .filter((id) => !rulesByPerson.has(id))
    .map((id) => ({
      id,
      profile: profileById.get(id),
      count: byAssignee.get(id)?.length ?? 0,
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

  const team: TeamTotals = {
    submitted: inMonth.length,
    approved: inMonth.filter(({ t }) => workStateOf(t) === "approved").length,
    waiting: inMonth.filter(({ t }) => workStateOf(t) === "waiting").length,
    sent: inMonth.filter(({ t }) => workStateOf(t) === "sent").length,
    posted: inMonth.filter(({ t }) => t.posted_at !== null).length,
    prevSubmitted: prevMonth.length,
    overallDone: personStats.reduce((s, p) => s + p.doneTotal, 0),
    overallTarget: personStats.reduce((s, p) => s + p.overallTarget, 0),
    overallExpected: personStats.reduce((s, p) => s + p.expectedOverall, 0),
    formats: teamFormats,
    untagged: inMonth.filter(({ t }) => t.content_format === null).length,
    pendingPost: [...pendingPostByAssignee.values()].reduce((s, n) => s + n, 0),
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
    untagged: inMonth
      .filter(({ t }) => t.content_format === null)
      .map(({ t }) => t),
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
