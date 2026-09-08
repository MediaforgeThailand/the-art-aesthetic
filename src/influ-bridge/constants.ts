/**
 * ค่าคงที่/ตัวช่วยของระบบ Influencer ที่ "ฝั่ง Team" ต้องรู้จัก — สำเนาที่ Team เป็นเจ้าของ
 *
 * ต้นฉบับอยู่ใน repo `the-art-influencer` → `src/influ/lib/influ-constants.ts` (แยก repo 2026-09-08)
 * ที่นี่เก็บเฉพาะส่วนที่ `/tasks` และ `/tag-management` ใช้: ทีม product 9 ทีม (แท็ก `#หัตถการ`),
 * ชื่อ influ บรรทัดเดียว, ชุดแฮชแท็กบังคับของเคส, และชื่อที่แสดงของหมอ
 *
 * ⚠️ กติกาที่ต้องตรงกับต้นฉบับเสมอ (ฝั่งนั้นเปลี่ยนเมื่อไหร่ต้องมาแก้ที่นี่ด้วย):
 * - key ของทีม = ข้อความแฮชแท็ก ตัวพิมพ์เล็กล้วน ไม่มีเว้นวรรค/ขีด; เพิ่มทีม = migration ใหม่
 *   ที่ผ่อน check constraint ใน DB (repo Influ) + `InfluProductTeam` ใน database.types + ตารางนี้
 * - `hashtagSafe()` ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข/ขีดล่าง เพราะ IG/FB ตัดแฮชแท็กที่ "-"
 * - `doctorDisplayName()` คือค่าที่เขียนลง `doctors.name` ซึ่งเป็นกุญแจจับคู่กับ
 *   `influencers.doctor_name` / `influ_calendar_events.doctor_name` (text ไม่มี FK)
 */

import type {
  InfluencerLite,
  InfluProductTeam,
  InfluTagOption,
} from "@/lib/types";

/* ---------- ทีม product ของหัตถการ (0080 → 9 ทีมที่ 0103) ---------- */

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

/* ---------- ชื่อ influ ---------- */

/** ป้าย "รอบ N" — รอบแรกไม่โชว์ (ไม่รู้จำนวนรอบทั้งหมด = กติกาเดิม) */
function roundLabel(roundNo: number): string | null {
  return roundNo > 1 ? `รอบ ${roundNo}` : null;
}

/** ชื่อ influ แบบเต็มบรรทัดเดียว "ชื่อเล่น (ชื่อ นามสกุล) · รอบ N" —
    ชื่อเล่นนำหน้าเพราะทีมจำ/เรียก influ กันด้วยชื่อเล่นเป็นหลัก */
export function influLabel(i: InfluencerLite): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  const name = i.nickname ? (full ? `${i.nickname} (${full})` : i.nickname) : full;
  const round = roundLabel(i.round_no);
  return round ? `${name} · ${round}` : name;
}

/* ---------- แฮชแท็กบังคับของเคส (0093) ----------
   influ ทุกคนต้องติดแท็กชุดนี้ในโพส เพื่อให้ทีมหลังบ้านดึงข้อมูลจาก Meta API
   มา attribute ได้ว่ายอดมาจากใคร/แคมเปญไหน/โปรตัวไหน */

/** ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข/ขีดล่าง (รองรับไทย) — ได้ข้อความที่ใช้เป็นแฮชแท็กได้จริง */
export function hashtagSafe(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}_]/gu, "");
}

/** คำนำหน้าแท็กของหมอ */
const DOCTOR_TAG_PREFIX = "DR";

type CaseHashtagKey = "influ" | "doctor" | "campaign" | "procedure" | "promo";

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

type CaseHashtagInput = {
  influCode: string | null;
  doctorLicense?: string | null;
  doctorName?: string | null;
  campaignTag?: string | null;
  campaignName?: string | null;
  teams?: InfluProductTeam[];
  promoSkus?: string[];
};

/**
 * ชุดแฮชแท็กของเคสหนึ่ง — เรียง #Influ ID · #รหัสหมอ · #แคมเปญ · #หัตถการ · #โปรโมชัน
 * รายการที่ยังไม่มีข้อมูลก็คืนมาด้วย (tag = null) เพื่อให้หน้าจอเตือนว่าขาดอะไร
 */
function caseHashtags(input: CaseHashtagInput): CaseHashtag[] {
  const tags: CaseHashtag[] = [];

  tags.push({
    key: "influ",
    label: "รหัส Influ",
    tag: input.influCode ? `#${hashtagSafe(input.influCode)}` : null,
    source: input.influCode ?? null,
    required: true,
    missingHint: "เคสนี้ยังไม่มีรหัส Influ ID — กดออกรหัสที่หน้าเคส",
  });

  // ระบุแพทย์แล้วแต่ยังไม่มีเลขใบ ปว. ในทะเบียน = ไม่ต้องมีแท็กนี้ (ไม่นับเป็นแท็กที่ขาด);
  // ยังไม่ได้ระบุแพทย์เลย = เตือน เพราะเป็นข้อมูลเคสที่ขาดจริงๆ
  if (input.doctorLicense) {
    tags.push({
      key: "doctor",
      label: "รหัสหมอ",
      tag: `#${DOCTOR_TAG_PREFIX}${hashtagSafe(input.doctorLicense)}`,
      source: input.doctorName ?? null,
      required: true,
    });
  } else if (!input.doctorName) {
    tags.push({
      key: "doctor",
      label: "รหัสหมอ",
      tag: null,
      source: null,
      required: true,
      missingHint: "ยังไม่ได้ระบุแพทย์ที่รับเคส",
    });
  }

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
 * `InfluTagOption` resolve เลขใบ ปว./แท็กแคมเปญมาให้ตั้งแต่ฝั่ง server แล้ว (influ-tags.ts)
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

/* ---------- ทะเบียนหมอ (0093) ---------- */

/**
 * ชื่อที่แสดงของหมอ — `นพ. ชื่อ นามสกุล (ชื่อเล่น)` ตามที่ทีมตกลงกันไว้
 * ค่านี้ถูกเขียนลง doctors.name ซึ่งเป็น **กุญแจจับคู่** กับ influencers.doctor_name และ
 * influ_calendar_events.doctor_name — เปลี่ยนชื่อจึงต้องตามแก้เคส/คิวเสมอ (DoctorManagerPanel ทำให้)
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
