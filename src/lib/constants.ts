import type { PriceGroup, RevisionKind, TaskPriority } from "./types";

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

/* ---------- My List — งาน/โน้ตส่วนตัว (/my-tasks) ---------- */

/** สีประจำความสำคัญของ My List — เลือกแล้ว "สีของ task เปลี่ยน" ทั้งแถบซ้ายและพื้นแถว
 *  ใช้ TaskPriority ชุดเดียวกับบอร์ดทีม (DB check ก็ชุดเดียวกัน) จะได้ไม่ต้องจำสองระบบ
 *  row = คลาสที่ใส่คู่กับ border-l-4 บนแถว (ต้องเป็นคลาสเต็มเสมอ — Tailwind v4 ไม่เห็นคลาสที่ต่อสตริงเอง) */
export const LIST_PRIORITY: Record<
  TaskPriority,
  {
    label: string;
    chip: string;
    dot: string;
    row: string;
    /** ช่องสีทึบเต็มเซลล์ในตารางแบบ Monday (คอลัมน์ "ความสำคัญ") */
    cell: string;
    /** แถบสีของกลุ่ม/แถบสรุปท้ายกลุ่ม (พื้นทึบล้วน ไม่มีสีตัวอักษร) */
    bar: string;
    /** สีตัวอักษรหัวกลุ่มตอนจัดกลุ่มตามความสำคัญ */
    text: string;
  }
> = {
  urgent: {
    label: "ด่วน",
    chip: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
    row: "border-l-rose-400 bg-rose-50/70",
    cell: "bg-rose-500 text-white",
    bar: "bg-rose-500",
    text: "text-rose-600",
  },
  high: {
    label: "สูง",
    chip: "bg-orange-100 text-orange-700",
    dot: "bg-orange-500",
    row: "border-l-orange-300 bg-orange-50/60",
    cell: "bg-orange-500 text-white",
    bar: "bg-orange-500",
    text: "text-orange-600",
  },
  medium: {
    label: "ปานกลาง",
    chip: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400",
    row: "border-l-amber-300 bg-amber-50/50",
    cell: "bg-amber-400 text-amber-950",
    bar: "bg-amber-400",
    text: "text-amber-600",
  },
  low: {
    label: "ต่ำ",
    chip: "bg-stone-100 text-stone-600",
    dot: "bg-stone-300",
    row: "border-l-stone-200 bg-white/70",
    cell: "bg-stone-300 text-stone-700",
    bar: "bg-stone-300",
    text: "text-stone-500",
  },
};

/** ลำดับที่แสดงในตัวเลือก — ด่วนอยู่บนสุด (คนเปิดเมนูมักจะมาเลือกอันนี้) */
export const LIST_PRIORITY_ORDER: TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
];

/** สถานะของงานใน My List — **คำนวณจากข้อมูลจริง ไม่ใช่คอลัมน์ใน DB**
 *  (list_tasks มีแค่ done + due_date; ที่เหลือคือการอ่านสองค่านี้ให้เป็นภาษาคน)
 *  ใช้กับคอลัมน์ "สถานะ" ของตารางแบบ Monday และแถบสรุปท้ายกลุ่ม
 *  กดที่ช่องสถานะ = สลับ done เท่านั้น (ไม่มีสถานะกลางให้เลือกเอง) */
export type ListStatus = "done" | "overdue" | "soon" | "open";

export const LIST_STATUS: Record<
  ListStatus,
  { label: string; cell: string; bar: string; text: string }
> = {
  done: {
    label: "เสร็จแล้ว",
    cell: "bg-emerald-500 text-white",
    bar: "bg-emerald-500",
    text: "text-emerald-600",
  },
  overdue: {
    label: "เลยกำหนด",
    cell: "bg-rose-500 text-white",
    bar: "bg-rose-500",
    text: "text-rose-600",
  },
  soon: {
    label: "ใกล้ครบกำหนด",
    cell: "bg-amber-400 text-amber-950",
    bar: "bg-amber-400",
    text: "text-amber-600",
  },
  open: {
    label: "ยังไม่เสร็จ",
    cell: "bg-stone-300 text-stone-700",
    bar: "bg-stone-300",
    text: "text-stone-500",
  },
};

/** ลำดับที่ใช้ในแถบสรุป (ซ้าย→ขวา) */
export const LIST_STATUS_ORDER: ListStatus[] = [
  "overdue",
  "soon",
  "open",
  "done",
];

/** ชุดสีของแท็กที่ผู้ใช้เลือกเองได้ — key เก็บใน list_tags.color
 *  DB ไม่มี check constraint (เพิ่มสีใหม่ได้โดยไม่ต้อง migrate) — สีที่ไม่รู้จัก fallback เป็น brand */
export const LIST_TAG_COLORS: Record<
  string,
  { label: string; chip: string; dot: string; text: string }
> = {
  brand: {
    label: "โรสโกลด์",
    chip: "bg-brand-100 text-brand-800",
    dot: "bg-brand-400",
    text: "text-brand-700",
  },
  rose: {
    label: "แดง",
    chip: "bg-rose-100 text-rose-700",
    dot: "bg-rose-400",
    text: "text-rose-600",
  },
  amber: {
    label: "เหลือง",
    chip: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400",
    text: "text-amber-600",
  },
  emerald: {
    label: "เขียว",
    chip: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-400",
    text: "text-emerald-600",
  },
  sky: {
    label: "ฟ้า",
    chip: "bg-sky-100 text-sky-700",
    dot: "bg-sky-400",
    text: "text-sky-600",
  },
  violet: {
    label: "ม่วง",
    chip: "bg-violet-100 text-violet-700",
    dot: "bg-violet-400",
    text: "text-violet-600",
  },
  stone: {
    label: "เทา",
    chip: "bg-stone-100 text-stone-600",
    dot: "bg-stone-400",
    text: "text-stone-500",
  },
};

export const LIST_TAG_COLOR_ORDER = Object.keys(LIST_TAG_COLORS);

/** สีของแท็ก — ค่าที่ระบบไม่รู้จัก (ข้อมูลเก่า/สีที่ถอดออก) ตกลงมาที่ brand */
export function listTagColor(key: string): {
  label: string;
  chip: string;
  dot: string;
  text: string;
} {
  return LIST_TAG_COLORS[key] ?? LIST_TAG_COLORS.brand;
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

/* ---------- ตีกลับงาน 2 แบบ (migration 0063) ----------
   ต่างกันที่ "นับเป็นข้อผิดพลาดไหม" เท่านั้น — ทั้งคู่ดึงงานกลับเป็น "กำลังทำ" เหมือนกัน
   countsAsError = true จะถูกนับใน KPI รายคนหน้า Team Workload */
export const REVISION_KINDS: Record<
  RevisionKind,
  {
    label: string;
    /** คำอธิบายในกล่องเลือกตอนตีกลับ */
    hint: string;
    countsAsError: boolean;
    chip: string;
    dot: string;
  }
> = {
  mistake: {
    label: "คำผิด",
    hint: "งานผิดพลาดจริง เช่น สะกดผิด ข้อมูลผิด ใช้ไฟล์ผิด — นับเป็นข้อผิดพลาดใน KPI",
    countsAsError: true,
    chip: "border border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  addition: {
    label: "เพิ่มเติม",
    hint: "ผู้ตรวจแนะนำให้ปรับเพื่อคุมคุณภาพ ไม่ใช่ความผิด — บันทึกไว้แต่ไม่นับเป็นข้อผิดพลาด",
    countsAsError: false,
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
};

export const REVISION_KIND_ORDER: RevisionKind[] = ["mistake", "addition"];

/** ประเภทของแถวเดิมที่ไม่มีค่า (ตีกลับก่อน migration 0063) — ถือเป็นคำผิดตามเดิม */
export const DEFAULT_REVISION_KIND: RevisionKind = "mistake";

/* ---------- ย่อรูปก่อนอัพโหลด ----------
   เพดานขนาดไฟล์อยู่ที่ `MAX_UPLOAD_BYTES` ใน `@/lib/upload` ที่เดียว (ต้องตรงกับค่าที่ตั้งไว้
   ใน Supabase Dashboard → Storage → Settings; **ห้ามตั้งด้วย SQL** — เคยทำอัพโหลดพังทั้งระบบ) */

/** ไฟล์รูปที่ใหญ่กว่านี้จะถูกย่อ/บีบอัดในเบราว์เซอร์ก่อนอัพ (รูปจากมือถือมักใหญ่ 3-12MB) */
export const IMAGE_COMPRESS_OVER_MB = 1;

/** ด้านยาวสุดของรูปหลังย่อ — พอสำหรับดูตรวจงานบนจอ 4K โดยไฟล์เล็กลงหลายเท่า */
export const IMAGE_MAX_DIMENSION = 2560;
