import type { PriceGroup, TaskPriority } from "./types";

export const TASK_PRIORITY: Record<
  TaskPriority,
  { label: string; badge: string }
> = {
  low: { label: "ต่ำ", badge: "bg-stone-100 text-stone-600" },
  medium: { label: "ปานกลาง", badge: "bg-amber-100 text-amber-700" },
  high: { label: "สูง", badge: "bg-orange-100 text-orange-700" },
  urgent: { label: "ด่วน", badge: "bg-rose-100 text-rose-700" },
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export const TASK_CATEGORIES = [
  "ทั่วไป",
  "การตลาด",
  "ลูกค้า/บริการ",
  "จัดซื้อ/สต๊อก",
  "บุคคล/อบรม",
  "การเงิน/เอกสาร",
  "อื่นๆ",
] as const;

/** หมวดหมู่ default ของงานใหม่ — ต้องตรงกับ DB default ของ tasks.category */
export const DEFAULT_TASK_CATEGORY = TASK_CATEGORIES[0];

/** ชนิดงานของ Brief (เลือกเป็นปุ่ม) — สำเนาไปการ์ด creative ตอนกด "รับงาน" */
export const BRIEF_CONTENT_TYPES = [
  { key: "graphic", label: "Graphic" },
  { key: "video", label: "Video" },
] as const;

export type BriefContentType = (typeof BRIEF_CONTENT_TYPES)[number]["key"];

/** label ของชนิดงาน Brief จาก key (null ถ้าไม่ระบุ/ไม่รู้จัก) */
export function briefContentTypeLabel(key: string | null): string | null {
  return BRIEF_CONTENT_TYPES.find((t) => t.key === key)?.label ?? null;
}

const TASK_CATEGORY_CHIPS = [
  "bg-stone-100 text-stone-600",
  "bg-brand-100 text-brand-800",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-pink-100 text-pink-700",
];

/** สี chip ประจำหมวดหมู่งาน — หมวดเดียวกันได้สีเดิมเสมอ */
export function taskCategoryChipClass(category: string): string {
  const idx = (TASK_CATEGORIES as readonly string[]).indexOf(category);
  if (idx >= 0) return TASK_CATEGORY_CHIPS[idx % TASK_CATEGORY_CHIPS.length];
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return TASK_CATEGORY_CHIPS[hash % TASK_CATEGORY_CHIPS.length];
}

export const SALES_CATEGORIES = [
  "Botox",
  "Filler",
  "Laser",
  "Skin Treatment",
  "Surgery",
  "Products",
  "อื่นๆ",
] as const;

/* ---------- Price List: กลุ่มหัตถการ ---------- */

/** 3 กลุ่มใหญ่ที่หน้า /price-list แบ่งแท็บ — key เก็บใน price_items.groups
 *  รายการหนึ่งติดได้หลายกลุ่ม (แพ็กเกจรวม เช่น "Ultraformer + Fat + Botox" = เครื่อง+ฉีด)
 *  แล้วจะโผล่ในทุกแท็บที่ติดไว้; DB บังคับอย่างน้อย 1 กลุ่ม (constraint price_items_groups_valid)
 *  สีไม่ใช้ emerald/amber/pink — สงวนให้ป้ายสถานะโปรบนแถวเดียวกัน */
export const PRICE_GROUPS: Record<
  PriceGroup,
  { label: string; hint: string; chip: string }
> = {
  injection: {
    label: "ฉีด",
    hint: "Botox, Filler, Meso, IV Drip, ร้อยไหม",
    chip: "bg-brand-100 text-brand-800",
  },
  treatment: {
    label: "ทรีตเม้น",
    hint: "ทรีตเม้นหน้า/ตัว, นวด, มาส์ก, ฉายแสง",
    chip: "bg-violet-100 text-violet-700",
  },
  device: {
    label: "เครื่อง",
    hint: "Ulthera, Ultraformer, Doublo, เลเซอร์",
    chip: "bg-sky-100 text-sky-700",
  },
};

/** ลำดับที่ใช้แสดงทุกที่ (แท็บ, ชิป, ช่องติ๊กในหลังบ้าน) */
export const PRICE_GROUP_ORDER = Object.keys(PRICE_GROUPS) as PriceGroup[];

/** เรียงกลุ่มของรายการให้ตรงลำดับข้างบนเสมอ — ลำดับใน DB ไม่แน่นอน */
export function sortPriceGroups(groups: PriceGroup[]): PriceGroup[] {
  return PRICE_GROUP_ORDER.filter((g) => groups.includes(g));
}

/* ---------- คลังลิงก์ไฟล์ (File Management) ---------- */

/** ประเภทแหล่งไฟล์ — key เก็บลง DB, ระบบเดาอัตโนมัติจาก URL ได้ */
export const FILE_LINK_TYPES = {
  google_sheet: { label: "Google Sheet", badge: "bg-emerald-100 text-emerald-700" },
  google_doc: { label: "Google Docs", badge: "bg-sky-100 text-sky-700" },
  google_slide: { label: "Google Slides", badge: "bg-amber-100 text-amber-700" },
  google_form: { label: "Google Form", badge: "bg-violet-100 text-violet-700" },
  google_drive: { label: "Google Drive", badge: "bg-brand-100 text-brand-800" },
  looker_studio: { label: "Looker Studio", badge: "bg-blue-100 text-blue-700" },
  document: { label: "ไฟล์เอกสาร", badge: "bg-stone-200 text-stone-700" },
  website: { label: "เว็บไซต์/อื่นๆ", badge: "bg-stone-100 text-stone-600" },
} as const;

export type FileLinkType = keyof typeof FILE_LINK_TYPES;

export const FILE_LINK_TYPE_ORDER = Object.keys(
  FILE_LINK_TYPES
) as FileLinkType[];

export function fileLinkTypeInfo(key: string): {
  label: string;
  badge: string;
} {
  return (
    FILE_LINK_TYPES[key as FileLinkType] ?? FILE_LINK_TYPES.website
  );
}

export const FILE_LINK_CATEGORIES = [
  "ทั่วไป",
  "ข้อมูล/Data",
  "ยอดขาย",
  "การตลาด",
  "การเงิน",
  "บุคลากร",
  "คู่มือ/SOP",
  "อื่นๆ",
] as const;

export const PAYMENT_METHODS = [
  "เงินสด",
  "โอนเงิน",
  "บัตรเครดิต",
  "ผ่อนชำระ",
  "อื่นๆ",
] as const;

export const STORAGE_BUCKET_DOCUMENTS = "documents";
