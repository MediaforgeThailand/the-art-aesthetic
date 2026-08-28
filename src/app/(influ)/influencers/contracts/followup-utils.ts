/**
 * ตรรกะกลางของหน้า Follow Up (`/influencers/contracts`) — ไฟล์ปกติ ไม่ใช่ "use client"
 * เพื่อให้ทั้งหน้า server, ลิสต์, heatmap และแผงข้าง อ่านตัวเลขชุดเดียวกันเสมอ
 *
 * กติกาที่กำหนดรูปร่างไฟล์นี้ (ผู้ใช้ 2026-08-29):
 * "สิ่งที่ต้อง force ตามหลักเลยคือ การโพสคลิปเป็น priority หลักในการตาม
 *  ส่วนอื่น ผลลัพธ์ให้มีไว้แต่ไม่ต้องแสดงหลัก และไม่ได้ force ณ ตอนนี้"
 * ⇒ **สถานะของเคสคิดจากเป้าโพสคลิปอย่างเดียว** (post_quotas เทียบลิงก์ที่ลงจริง)
 *   เช็คพอยต์รูปติดตาม/เช็คลิสต์ยังคำนวณและแสดงอยู่ แต่ไม่มีผลกับสถานะ/heatmap
 */

import { todayISO } from "@/lib/format";
import {
  activeFollowupTasks,
  contractEndDate,
  INFLU_POST_PLATFORM_ORDER,
  postLinkPlatform,
} from "@/lib/influ-constants";
import type {
  InfluCampaignRow,
  InfluencerRow,
  InfluPostLinkRow,
  InfluPostPlatform,
  InfluPostQuotas,
  InfluTaskRow,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* สถานะการติดตาม — ใช้ทั้ง heatmap / หัวกลุ่มในลิสต์ / ตัวกรอง / แผง     */
/* ------------------------------------------------------------------ */

export type TrackStatus =
  | "overdue"
  | "noquota"
  | "ontrack"
  | "complete"
  | "expired";

export const TRACK_STATUSES: Record<
  TrackStatus,
  { label: string; hint: string; dot: string; chip: string; heat: string }
> = {
  overdue: {
    label: "ตามหลังเป้า",
    hint: "คลิปที่ลงจริงยังไม่ทันเป้าที่ควรได้ ณ วันนี้",
    dot: "bg-rose-400",
    chip: "border border-rose-200 bg-rose-50 text-rose-600",
    heat: "bg-rose-300 text-rose-900",
  },
  noquota: {
    label: "ยังไม่ตั้งเป้าโพส",
    hint: "ต้องกำหนดก่อนว่าต้องลงคลิปช่องไหนกี่โพส ถึงจะตามได้",
    dot: "bg-amber-400",
    chip: "border border-amber-200 bg-amber-50 text-amber-700",
    heat: "bg-amber-200 text-amber-900",
  },
  ontrack: {
    label: "ตามเป้าอยู่",
    hint: "ลงคลิปทันเป้าที่ควรได้ ณ วันนี้ — ยังไม่ครบทั้งสัญญา",
    dot: "bg-sky-400",
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
    heat: "bg-sky-300 text-sky-900",
  },
  complete: {
    label: "ครบเป้าแล้ว",
    hint: "ลงคลิปครบทุกช่องทางที่ตั้งเป้าไว้",
    dot: "bg-emerald-400",
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    heat: "bg-emerald-400 text-emerald-950",
  },
  expired: {
    label: "สัญญาหมดแล้ว",
    hint: "หมดอายุสัญญาโดยยังลงคลิปไม่ครบเป้า",
    dot: "bg-stone-300",
    chip: "border border-stone-200 bg-stone-100 text-stone-500",
    heat: "bg-stone-300 text-stone-700",
  },
};

/** ลำดับกลุ่มในลิสต์ — เรื่องที่ต้องลงมือทำอยู่บนสุด */
export const TRACK_STATUS_ORDER: TrackStatus[] = [
  "overdue",
  "noquota",
  "ontrack",
  "complete",
  "expired",
];

/* ------------------------------------------------------------------ */
/* ข้อมูลพร้อมใช้ต่อเคส                                                 */
/* ------------------------------------------------------------------ */

/** ข้อมูลประกอบเสร็จของ 1 เคส — คำนวณครั้งเดียว ใช้ทั้ง heatmap/ลิสต์/แผง */
export type TrackRow = {
  influ: InfluencerRow;
  /** วันที่เริ่มนับสัญญา (= วันที่ influ เข้ามาตามนิยามของหน้านี้) */
  start: string;
  end: string;
  daysLeft: number;
  expired: boolean;
  /** % ของอายุสัญญาที่ผ่านไปแล้ว (0-100) */
  usedPct: number;
  status: TrackStatus;

  /* ---- ส่วนที่ force: โพสคลิปตามสัญญา ---- */
  quotas: InfluPostQuotas;
  /** ช่องทางที่ตั้งเป้าไว้ (เรียงตาม INFLU_POST_PLATFORM_ORDER) */
  quotaPlatforms: InfluPostPlatform[];
  quotaTotal: number;
  /** จำนวนลิงก์ kind=post แยกตามช่องทาง (ค่าที่เลือกเอง > เดาจาก hostname) */
  postCounts: Partial<Record<InfluPostPlatform, number>>;
  postTotal: number;
  commentCount: number;
  /** โพสที่นับเข้าเป้าแล้ว = Σ min(ลงจริง, เป้า) — โพสเกินเป้าไม่ถูกนับซ้ำ */
  metCount: number;
  /** เป้าที่ "ควรได้แล้ว ณ วันนี้" ตามสัดส่วนอายุสัญญา */
  expectedByNow: number;
  /** ความคืบหน้าเป้าโพส 0-1 — null = ยังไม่ตั้งเป้า */
  progress: number | null;

  /* ---- ส่วนที่ไม่ force: ผลลัพธ์/เช็คลิสต์ ---- */
  /** เช็คพอยต์รูปติดตาม (หมวด 4 ของ checklist มาตรฐาน) — เคสโหมด custom = [] เสมอ */
  photoTasks: InfluTaskRow[];
  photoDone: number;
  photoOverdue: boolean;
  /** checklist ทั้งชุดของโหมดที่เคสใช้อยู่ (กรองด้วย activeFollowupTasks แล้ว)
      แสดงเป็นส่วนรองในแผงติดตาม — ไม่มีผลกับสถานะ/heatmap */
  checklistTasks: InfluTaskRow[];
  checklistDone: number;

  links: InfluPostLinkRow[];
  campaigns: InfluCampaignRow[];
  ownerName: string | null;
};

export function influName(i: {
  first_name: string;
  last_name: string | null;
  nickname: string | null;
}): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

const DAY_MS = 86_400_000;

function dayDiff(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T00:00:00Z`).getTime() -
      new Date(`${b}T00:00:00Z`).getTime()) /
      DAY_MS
  );
}

/** ประกอบ TrackRow ของทุกเคส — ตัวเดียวที่รู้สูตรสถานะ/ความคืบหน้า */
export function buildTrackRows({
  influencers,
  links,
  tasks,
  campaigns,
  ownerNames,
  today = todayISO(),
}: {
  /** เฉพาะเคสที่เริ่มนับสัญญาแล้ว (contract_start ไม่เป็น null) */
  influencers: InfluencerRow[];
  links: InfluPostLinkRow[];
  /** งาน checklist ทั้งหมดของเคสเหล่านี้ (ทั้ง 2 โหมด — กรองตามโหมดที่นี่) */
  tasks: InfluTaskRow[];
  campaigns: InfluCampaignRow[];
  ownerNames: Map<string, string>;
  today?: string;
}): TrackRow[] {
  const linksBy = groupBy(links, (l) => l.influencer_id);
  const tasksBy = groupBy(tasks, (t) => t.influencer_id);
  const campsBy = groupBy(campaigns, (c) => c.influencer_id);

  return influencers.map((i) => {
    const start = i.contract_start!;
    const end = contractEndDate(start, i.contract_months);
    const totalDays = Math.max(1, dayDiff(end, start));
    const usedDays = dayDiff(today, start);
    const daysLeft = dayDiff(end, today);
    const expired = daysLeft < 0;
    const elapsed = Math.min(1, Math.max(0, usedDays / totalDays));

    const myLinks = linksBy.get(i.id) ?? [];
    const postCounts: Partial<Record<InfluPostPlatform, number>> = {};
    let postTotal = 0;
    for (const l of myLinks) {
      if (l.kind !== "post") continue;
      const p = postLinkPlatform(l);
      postCounts[p] = (postCounts[p] ?? 0) + 1;
      postTotal += 1;
    }

    const quotas = i.post_quotas ?? {};
    const quotaPlatforms = INFLU_POST_PLATFORM_ORDER.filter(
      (p) => (quotas[p] ?? 0) > 0
    );
    const quotaTotal = quotaPlatforms.reduce((s, p) => s + (quotas[p] ?? 0), 0);
    // โพสเกินเป้าของช่องหนึ่งไม่ชดเชยอีกช่อง — เป้าตามสัญญาเป็นรายช่องทาง
    const metCount = quotaPlatforms.reduce(
      (s, p) => s + Math.min(postCounts[p] ?? 0, quotas[p] ?? 0),
      0
    );
    // floor: ให้เวลาเดินไปพอสมควรก่อนถึงจะเรียกว่า "ควรได้เพิ่มอีก 1 โพส"
    const expectedByNow = Math.floor(quotaTotal * elapsed);
    const progress = quotaTotal > 0 ? metCount / quotaTotal : null;

    // ข้อของโหมดที่เคสไม่ได้ใช้ถูกซ่อนไว้ใน DB — ต้องกรองด้วย activeFollowupTasks ก่อนนับ
    const checklistTasks = activeFollowupTasks(
      i.followup_mode,
      tasksBy.get(i.id) ?? []
    ).sort((a, b) => a.step - b.step);
    // เช็คพอยต์รูปผลลัพธ์ = หมวด 4 ของ checklist มาตรฐาน (เคสโหมด custom ไม่มี)
    const pTasks =
      i.followup_mode === "custom"
        ? []
        : checklistTasks.filter((t) => t.section?.startsWith("4.") ?? false);
    const photoDone = pTasks.filter((t) => t.done).length;
    const photoOverdue = pTasks.some(
      (t) => !t.done && t.due_date !== null && t.due_date < today
    );

    const status: TrackStatus =
      quotaTotal > 0 && metCount >= quotaTotal
        ? "complete"
        : expired
          ? "expired"
          : quotaTotal === 0
            ? "noquota"
            : metCount < expectedByNow
              ? "overdue"
              : "ontrack";

    return {
      influ: i,
      start,
      end,
      daysLeft,
      expired,
      usedPct: Math.round(elapsed * 100),
      status,
      quotas,
      quotaPlatforms,
      quotaTotal,
      postCounts,
      postTotal,
      commentCount: myLinks.length - postTotal,
      metCount,
      expectedByNow,
      progress,
      photoTasks: pTasks,
      photoDone,
      photoOverdue,
      checklistTasks,
      checklistDone: checklistTasks.filter((t) => t.done).length,
      links: myLinks,
      campaigns: campsBy.get(i.id) ?? [],
      ownerName:
        (i.owner_id && ownerNames.get(i.owner_id)) ||
        (i.created_by && ownerNames.get(i.created_by)) ||
        null,
    };
  });
}

function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const arr = m.get(k);
    if (arr) arr.push(item);
    else m.set(k, [item]);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* heatmap ปฏิทิน — 1 ช่อง = 1 วันที่เริ่มนับสัญญา                      */
/* ------------------------------------------------------------------ */

export type DayCell = {
  /** yyyy-mm-dd */
  date: string;
  rows: TrackRow[];
  /** ค่าเฉลี่ยความคืบหน้าเป้าโพสของเคสที่เข้ามาวันนั้น — null = ไม่มีเคสที่ตั้งเป้า */
  progress: number | null;
  /** จำนวนเคสที่ยังไม่ตั้งเป้า (ตัวเลขที่ต้องรีบจัดการที่สุดของหน้านี้) */
  unset: number;
};

/** ระดับสีของช่องปฏิทิน — ไล่จาก "ยังไม่ได้อะไรเลย" ไป "ครบเป้า" */
export type HeatLevel = "empty" | "unset" | "low" | "mid" | "high" | "full";

export const HEAT_CELL: Record<HeatLevel, string> = {
  empty: "bg-white/45 text-stone-300",
  unset: "bg-amber-200/90 text-amber-900",
  low: "bg-rose-200/90 text-rose-900",
  mid: "bg-amber-300/90 text-amber-950",
  high: "bg-emerald-200/90 text-emerald-900",
  full: "bg-emerald-500 text-white",
};

export const HEAT_LEGEND: { level: HeatLevel; label: string }[] = [
  { level: "unset", label: "ยังไม่ตั้งเป้า" },
  { level: "low", label: "< 34%" },
  { level: "mid", label: "34–66%" },
  { level: "high", label: "67–99%" },
  { level: "full", label: "ครบเป้า" },
];

export function heatLevelOf(cell: DayCell): HeatLevel {
  if (cell.rows.length === 0) return "empty";
  if (cell.progress === null) return "unset";
  if (cell.progress >= 1) return "full";
  if (cell.progress >= 0.67) return "high";
  if (cell.progress >= 0.34) return "mid";
  return "low";
}

/** จัดเคสลงช่องวันตาม contract_start */
export function cellsByDate(rows: TrackRow[]): Map<string, DayCell> {
  const m = new Map<string, DayCell>();
  for (const r of rows) {
    const cell = m.get(r.start) ?? {
      date: r.start,
      rows: [],
      progress: null,
      unset: 0,
    };
    cell.rows.push(r);
    m.set(r.start, cell);
  }
  for (const cell of m.values()) {
    const scored = cell.rows.filter((r) => r.progress !== null);
    cell.unset = cell.rows.length - scored.length;
    cell.progress = scored.length
      ? scored.reduce((s, r) => s + (r.progress ?? 0), 0) / scored.length
      : null;
  }
  return m;
}

/* ---------- ปฏิทินย่อรายเดือน (สัปดาห์เริ่มวันจันทร์ เหมือนปฏิทินคิว) ---------- */

export type MonthGrid = {
  /** yyyy-mm */
  key: string;
  year: number;
  /** 1-12 */
  month: number;
  /** ช่องว่างนำหน้า + วันของเดือน (null = ช่องว่างเติมหัวสัปดาห์) */
  days: (string | null)[];
};

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** index ของวันในสัปดาห์แบบเริ่มจันทร์ (จ=0 … อา=6)
    ใช้ Date.UTC ของ "วันตามปฏิทิน" — ห้ามใช้ epoch ของเที่ยงคืนเวลาไทย
    (ค่านั้นตกอยู่ในวัน UTC ก่อนหน้า คอลัมน์จะเลื่อนไป 1 ช่อง) */
function mondayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** ปฏิทินย่อ n เดือนย้อนหลังจากเดือนของ `anchor` (เดือนล่าสุดอยู่ท้ายสุด) */
export function monthGrids(anchor: string, months: number): MonthGrid[] {
  const [y, m] = anchor.split("-").map(Number);
  const out: MonthGrid[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(Date.UTC(y, m - 1 - back, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days: (string | null)[] = Array(mondayIndex(year, month, 1)).fill(
      null
    );
    for (let day = 1; day <= total; day++) days.push(isoDate(year, month, day));
    out.push({ key: `${year}-${pad(month)}`, year, month, days });
  }
  return out;
}

export const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** "ส.ค. 69" — เดือนย่อ + ปี พ.ศ. 2 หลัก (ตาราง THAI_MONTHS_SHORT คงที่
    ไม่ใช้ toLocaleDateString กัน SSR/CSR ให้ผลไม่ตรงกัน) */
export function monthLabel(g: MonthGrid): string {
  const be = String((g.year + 543) % 100).padStart(2, "0");
  return `${THAI_MONTHS_SHORT[g.month - 1]} ${be}`;
}
