import type {
  AnalysisCategory,
  ContentFormat,
  ContentKpiBasis,
  ContentKpiPeriod,
  NotificationType,
  PriceGroup,
  RevisionKind,
  TaskPriority,
} from "./types";

export const TASK_PRIORITY: Record<
  TaskPriority,
  { label: string; badge: string }
> = {
  low: { label: "ต่ำ", badge: "bg-stone-100 text-stone-600" },
  medium: { label: "ปานกลาง", badge: "bg-amber-100 text-amber-700" },
  high: { label: "สูง", badge: "bg-orange-100 text-orange-700" },
  urgent: { label: "ด่วน", badge: "bg-rose-100 text-rose-700" },
};

const TASK_CATEGORIES = [
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

/** สถานะ "ในตัว" ของงานใน My List — **คำนวณจากข้อมูลจริง ไม่ใช่คอลัมน์ใน DB**
 *  (list_tasks มีแค่ done + due_date; ที่เหลือคือการอ่านสองค่านี้ให้เป็นภาษาคน)
 *  ใช้กับคอลัมน์ "สถานะ" ของตารางแบบ Monday และแถบสรุปท้ายกลุ่ม
 *  ตั้งแต่ 0072 ผู้ใช้เพิ่มสถานะ "ระหว่างทาง" ของตัวเองได้ (list_options kind=status)
 *  — งานที่เลือกสถานะเหล่านั้นยังนับเป็น "ยังไม่เสร็จ" ทุกที่ที่ดู done (ดู statusViewOf) */
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

/** ชุดสีที่ผู้ใช้เลือกเองได้ใน My List — key เก็บใน list_tags.color / list_groups.color /
 *  list_options.color (สีเดียวกันทั้งแท็ก หมวดหมู่ และตัวเลือกสถานะ/ความสำคัญที่เพิ่มเอง)
 *  DB ไม่มี check constraint (เพิ่มสีใหม่ได้โดยไม่ต้อง migrate) — สีที่ไม่รู้จัก fallback เป็น brand
 *  cell = ช่องสีทึบเต็มเซลล์ในตาราง (ใช้กับตัวเลือกที่เพิ่มเอง ให้หน้าตาเท่ากับสถานะในตัว)
 *  row  = พื้นแถวอ่อนของงานที่ใช้ความสำคัญที่เพิ่มเอง (คู่กับ LIST_PRIORITY.row) */
type ListColorMeta = {
  label: string;
  chip: string;
  dot: string;
  text: string;
  cell: string;
  row: string;
};

export const LIST_TAG_COLORS: Record<string, ListColorMeta> = {
  brand: {
    label: "โรสโกลด์",
    chip: "bg-brand-100 text-brand-800",
    dot: "bg-brand-400",
    text: "text-brand-700",
    cell: "bg-brand-500 text-white",
    row: "border-l-brand-300 bg-brand-50/60",
  },
  rose: {
    label: "แดง",
    chip: "bg-rose-100 text-rose-700",
    dot: "bg-rose-400",
    text: "text-rose-600",
    cell: "bg-rose-500 text-white",
    row: "border-l-rose-400 bg-rose-50/70",
  },
  amber: {
    label: "เหลือง",
    chip: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400",
    text: "text-amber-600",
    cell: "bg-amber-400 text-amber-950",
    row: "border-l-amber-300 bg-amber-50/50",
  },
  emerald: {
    label: "เขียว",
    chip: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-400",
    text: "text-emerald-600",
    cell: "bg-emerald-500 text-white",
    row: "border-l-emerald-300 bg-emerald-50/60",
  },
  sky: {
    label: "ฟ้า",
    chip: "bg-sky-100 text-sky-700",
    dot: "bg-sky-400",
    text: "text-sky-600",
    cell: "bg-sky-500 text-white",
    row: "border-l-sky-300 bg-sky-50/60",
  },
  violet: {
    label: "ม่วง",
    chip: "bg-violet-100 text-violet-700",
    dot: "bg-violet-400",
    text: "text-violet-600",
    cell: "bg-violet-500 text-white",
    row: "border-l-violet-300 bg-violet-50/60",
  },
  stone: {
    label: "เทา",
    chip: "bg-stone-100 text-stone-600",
    dot: "bg-stone-400",
    text: "text-stone-500",
    cell: "bg-stone-400 text-white",
    row: "border-l-stone-200 bg-white/70",
  },
};

export const LIST_TAG_COLOR_ORDER = Object.keys(LIST_TAG_COLORS);

/** สีของแท็ก/หมวด/ตัวเลือก — ค่าที่ระบบไม่รู้จัก (ข้อมูลเก่า/สีที่ถอดออก) ตกลงมาที่ brand */
export function listTagColor(key: string): ListColorMeta {
  return LIST_TAG_COLORS[key] ?? LIST_TAG_COLORS.brand;
}

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

/* ---------- โปร/แพ็กเกจที่ขายจริง (หน้าสาธารณะ /price-list) ---------- */

/** ลำดับหมวดบนหน้า Price List — หมวดที่ไม่อยู่ในลิสต์นี้ไปต่อท้ายตามตัวอักษร
    (ค่าใน promo_packages.category เป็น text อิสระ เพิ่มหมวดใหม่ได้โดยไม่ต้อง migrate
     แต่ถ้าอยากคุมลำดับการแสดงผลต้องมาเติมที่นี่) */
export const PROMO_CATEGORY_ORDER = [
  "แพ็กเกจรวมหลายหัตถการ",
  "Botox",
  "Filler & Skin Booster",
  "เมโส & ผิวขาว",
  "IV Drip",
  "เครื่องยกกระชับ",
  "เลเซอร์ผิวหน้า",
  "กำจัดขนถาวร",
  "โปรแกรมดูแลผิวหน้า",
  "ดูแลผิวหน้า & สิว",
  "ฟื้นฟูผิวเฉพาะทาง",
  "ลดสัดส่วน",
  "ร้อยไหม",
  "นวด & ผ่อนคลาย",
  "ฟื้นฟูสุขภาพ",
] as const;

/** เรียงหมวดตาม PROMO_CATEGORY_ORDER — หมวดแปลกใหม่ไปอยู่ท้ายสุด ไม่หายไปจากหน้า */
export function comparePromoCategories(a: string, b: string): number {
  const ia = PROMO_CATEGORY_ORDER.indexOf(a as (typeof PROMO_CATEGORY_ORDER)[number]);
  const ib = PROMO_CATEGORY_ORDER.indexOf(b as (typeof PROMO_CATEGORY_ORDER)[number]);
  if (ia === -1 && ib === -1) return a.localeCompare(b, "th");
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

/** เหลือกี่วันถึงนับว่า "ใกล้หมดเขต" — ใช้ทั้งป้ายบนแถวและชิปตัวกรอง */
export const PROMO_ENDING_SOON_DAYS = 30;

/**
 * Sales Assistant — แอป iPad ของทีมขาย (คนละ repo/โดเมน: the-art-sales-assistant)
 * แอปนั้นมีปุ่ม "Price-List" ที่ลิงก์มา `/price-list?from=sales` และหน้านี้ตอบกลับด้วย
 * ปุ่ม "กลับแอปขาย" ที่ชี้กลับมาที่นี่ — สัญญาระหว่าง 2 repo คือ query `?from=sales`
 * ตัวเดียว ห้ามโชว์ปุ่มนี้กับคนทั่วไป เพราะ /price-list เป็นลิงก์ที่แชร์ให้ลูกค้าดูด้วย
 *
 * ย้ายจาก `the-art-sales-assistant.vercel.app` มาโดเมนบริษัทเมื่อ 2026-08-20 —
 * **ค่านี้มี path ต่อท้าย (`/salestool/`) ไม่ใช่แค่ origin ห้ามตัดทิ้ง** เพราะแอปขายถูก
 * serve ใต้ base path นั้น (ตัดแล้วกดปุ่มไปเจอ 404). ส่วนปุ่ม "กลับแอปขาย" เทียบ
 * `document.referrer` กับ `.origin` ของค่านี้ (= https://sales.theartbb.com) จึงยัง
 * ทำงานถูกแม้ค่าจะมี path ต่อท้าย — ไม่ต้องแก้ logic ตรงนั้น
 */
export const SALES_ASSISTANT_URL = "https://sales.theartbb.com/salestool/";

/** ค่า `?from=` ที่แอปขายส่งมา — ใช้ตัดสินว่าจะโชว์ปุ่มกลับไหม */
export const SALES_ASSISTANT_FROM = "sales";

/**
 * Sales Operation — ระบบจัดคิวลูกค้าออนไลน์ของทีม Beauty Consult ("Sales Queue")
 * แอปแยกอีกตัว (คนละ repo/โดเมน: Vercel project `the-art-sales-queue`) มีล็อกอินของตัวเอง
 * เปิดทางเข้าจากหน้าประตูรวมช่องทาง (root `/`) เมื่อ 2026-09-01
 *
 * **แอปนี้ serve ที่ root ของโดเมนตัวเอง ไม่มี base path แบบ `SALES_ASSISTANT_URL`**
 * (อันนั้นต้องมี `/salestool/` ต่อท้าย ห้ามตัด) — ที่นี่ใส่ origin ล้วนพอ
 * ผูกโดเมนบริษัท `queue.theartbb.com` แล้วเมื่อ 2026-09-01 (CNAME ที่ GoDaddy ชี้เข้า Vercel)
 * ลิงก์ `the-art-sales-queue.vercel.app` เดิมยังเข้าได้ แต่ห้ามเอากลับมาเป็นค่าในโค้ด
 * ย้ายโดเมนอีกแก้ค่านี้จุดเดียว การ์ดบนหน้าประตูจะตามเอง (ไม่มีสัญญา referrer ข้าม repo แบบแอปขาย)
 */
export const SALES_OPERATION_URL: string | null = "https://queue.theartbb.com";

/**
 * ระบบ Influencer — แยกเป็น repo/แอปของตัวเองเมื่อ 2026-09-08 (repo `the-art-influencer`,
 * ใช้ Supabase ตัวเดียวกัน บัญชี/สิทธิ์ชุดเดียวกัน) ทางเข้าทุกจุดในแอปนี้ (หน้าประตู, sidebar,
 * /start, แดชบอร์ด) ชี้ไปที่นี่ — ย้ายโดเมนเมื่อไหร่แก้ค่านี้ค่าเดียว
 *
 * ยังเป็น `.vercel.app` ไปก่อน (ยังไม่ผูก subdomain) ⇒ คุกกี้ session แยกจากแอปนี้ ต้องล็อกอินอีกรอบ
 * ที่นั่น; ค่าเดียวกันถูกเก็บใน Vault `influ_app_url` ให้ edge function `send-push` ใช้ทำ URL เต็ม
 * ของแจ้งเตือน Influ (เปลี่ยนที่นี่ต้องเปลี่ยนที่ Vault ด้วย)
 */
export const INFLU_APP_URL = "https://the-art-influencer.vercel.app";

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

export const STORAGE_BUCKET_DOCUMENTS = "documents";

/** ข้อมูลบริษัท (ชื่อ/ที่อยู่/โทร) — ใช้ทั้งท้ายหน้า Price List สาธารณะ และหัวเอกสาร Memo ของระบบ Influencer */
export const COMPANY_INFO = {
  name: "บริษัท อาทออฟเซอร์เจอร์รี่ จำกัด (สำนักงานใหญ่)",
  address:
    "เลขที่ 287 ถนนวิภาวดีรังสิต แขวงสนามบิน ดอนเมือง กรุงเทพมหานคร 10210",
  phone: "โทร. 02-6664666",
} as const;

/* ---------- ตีกลับงาน (migration 0063 + 'brief' ที่ 0097) ----------
   ทุกแบบดึงงานกลับเป็น "กำลังทำ" เหมือนกัน ต่างกันที่ "นับเป็นข้อผิดพลาดไหม"
   countsAsError = true จะถูกนับใน KPI รายคนหน้า Team Workload

   ⚠️ 'brief' = ตีกลับของ "ผู้สั่ง brief" ในทอด 0 — ไม่มีปุ่มให้เลือก (จึงไม่อยู่ใน
   REVISION_KIND_ORDER) ระบบใส่ให้เองตอนผู้สั่ง brief กดตีกลับ และ **ไม่นับ KPI**
   เพราะยังไม่ผ่านสายตาผู้ตรวจจริง (กติกาผู้ใช้ 2026-08-29) */
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
  brief: {
    label: "ผู้สั่ง brief ขอแก้",
    hint: "ผู้สั่ง brief ขอให้แก้ก่อนส่งตรวจจริง — บันทึกในแชท แต่ไม่นับเป็นข้อผิดพลาด",
    countsAsError: false,
    chip: "border border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
};

/** ตัวเลือกในกล่อง "ตีกลับ" ของผู้ตรวจจริง — 'brief' ไม่อยู่ในนี้โดยตั้งใจ
    (ผู้สั่ง brief กดตีกลับได้ปุ่มเดียว ระบบใส่ชนิดให้เอง) */
export const REVISION_KIND_ORDER: RevisionKind[] = ["mistake", "addition"];

/** ประเภทของแถวเดิมที่ไม่มีค่า (ตีกลับก่อน migration 0063) — ถือเป็นคำผิดตามเดิม */
export const DEFAULT_REVISION_KIND: RevisionKind = "mistake";

/* ---------- ป้ายชนิดงานในกระดิ่งแจ้งเตือน (migration 0096) ----------
   ทุกแถวในกระดิ่งติดป้ายชิดขวาบอกว่า "เรื่องนี้คืออะไร" อ่านได้ตั้งแต่ยังไม่อ่านข้อความ

   loud = เรื่องที่ต้องลงมือทำต่อ (ป้ายเรืองแสงด้วย animate-glow-pulse ตามสีตัวเอง)
   loud = false = เรื่องที่แค่ "เราเกี่ยวข้องอยู่ด้วย" — ป้ายเงียบๆ ไม่แย่งสายตา
   กติกาผู้ใช้ 2026-08-29: อย่าให้ทุกอย่างเด่นเท่ากัน ไม่งั้นเท่ากับไม่มีอะไรเด่น */
type NotificationBadgeKey =
  | "review_request"
  | "rejected_mistake"
  | "rejected_addition"
  | "rejected_brief"
  | "mention"
  | "assign"
  | "approved"
  | "comment"
  | "brief_accepted";

export const NOTIFICATION_BADGES: Record<
  NotificationBadgeKey,
  { label: string; chip: string; loud: boolean }
> = {
  review_request: {
    label: "ตรวจงาน",
    chip: "border-amber-300 bg-amber-50 text-amber-700",
    loud: true,
  },
  rejected_mistake: {
    label: "แก้คำผิด",
    chip: "border-rose-300 bg-rose-50 text-rose-700",
    loud: true,
  },
  rejected_addition: {
    label: "แก้เพิ่มเติม",
    chip: "border-sky-300 bg-sky-50 text-sky-700",
    loud: true,
  },
  rejected_brief: {
    label: "แก้ก่อนส่งตรวจ",
    chip: "border-amber-300 bg-amber-50 text-amber-700",
    loud: true,
  },
  mention: {
    label: "กล่าวถึงคุณ",
    chip: "border-violet-300 bg-violet-50 text-violet-700",
    loud: true,
  },
  assign: {
    label: "งานใหม่",
    chip: "border-brand-300 bg-brand-50 text-brand-700",
    loud: true,
  },
  approved: {
    label: "อนุมัติแล้ว",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-600",
    loud: false,
  },
  comment: {
    label: "ความคิดเห็น",
    chip: "border-stone-200 bg-stone-50 text-stone-500",
    loud: false,
  },
  brief_accepted: {
    label: "รับงาน brief",
    chip: "border-stone-200 bg-stone-50 text-stone-500",
    loud: false,
  },
};

/** ชนิด "rejected" แตกเป็น 3 ป้ายตาม revision_kind — ที่เหลือแมปตรงตัว */
export function notificationBadgeKey(
  type: NotificationType,
  revisionKind: RevisionKind | null
): NotificationBadgeKey {
  if (type !== "rejected") return type;
  if (revisionKind === "addition") return "rejected_addition";
  if (revisionKind === "brief") return "rejected_brief";
  return "rejected_mistake";
}

/* ---------- คลังลิงก์ผลวิเคราะห์ (migration 0065) ----------
   แท็บ "ผลวิเคราะห์" หน้า Task — ลิงก์ Canva ราย สัปดาห์/เดือน ที่หัวหน้าทีมแปะแชร์ */

/** หมวดผลวิเคราะห์ — ป้าย+สีชิปบนแถวลิสต์และปุ่มเลือกในโมดัล */
export const ANALYSIS_CATEGORIES: Record<
  AnalysisCategory,
  { label: string; chip: string }
> = {
  content: { label: "Content", chip: "bg-sky-100 text-sky-700" },
  ads: { label: "Ads", chip: "bg-amber-100 text-amber-700" },
  artwork: { label: "Artwork", chip: "bg-violet-100 text-violet-700" },
  other: { label: "อื่นๆ", chip: "bg-stone-100 text-stone-600" },
};

export const ANALYSIS_CATEGORY_ORDER: AnalysisCategory[] = [
  "content",
  "ads",
  "artwork",
  "other",
];

/* ---------- KPI ทีมคอนเทนต์ (migration 0085) ----------
   ประเภทชิ้นงานติดบนการ์ดงาน (tasks.content_format + content_category_id)
   หมวดเนื้อหามาจากตาราง content_categories (ทีมเพิ่มเอง) — ที่นี่มีเฉพาะฟอร์แมตซึ่งเป็นค่าตายตัว */
export const CONTENT_FORMATS: Record<
  ContentFormat,
  { label: string; chip: string; dot: string }
> = {
  image: {
    label: "ภาพ",
    chip: "bg-violet-100 text-violet-700",
    dot: "bg-violet-500",
  },
  video: {
    label: "วิดีโอ",
    chip: "bg-sky-100 text-sky-700",
    dot: "bg-sky-500",
  },
};

export const CONTENT_FORMAT_ORDER: ContentFormat[] = ["image", "video"];

/** คาบของเป้า KPI คอนเทนต์ (migration 0087) — ใช้ทั้งหน้า /content-kpi และแดชบอร์ด /content-tracking
 *  unit = ข้อความหน่วยเต็ม, short = ป้ายสั้นบน toggle */
export const CONTENT_KPI_PERIODS: Record<
  ContentKpiPeriod,
  { label: string; unit: string; short: string }
> = {
  month: { label: "ต่อเดือน", unit: "ชิ้น/เดือน", short: "เดือน" },
  day: { label: "ต่อวัน", unit: "ชิ้น/วัน", short: "วัน" },
};

export const CONTENT_KPI_PERIOD_ORDER: ContentKpiPeriod[] = ["month", "day"];

/* ---------- ฐานการนับของกติกา KPI (migration 0095 + 0101) ----------
   "ผลงาน 1 ชิ้น" ของแต่ละคนไม่เหมือนกัน — content ที่ brief อย่างเดียวไม่มีการ์ด creative ของตัวเอง
   เลยเคยได้ KPI 0 ตลอด; แต่ละกติกาจึงเลือกได้ว่านับจากอะไร (ดู `kpiEventsOf` ใน kpi-utils.ts) */
export const CONTENT_KPI_BASES: Record<
  ContentKpiBasis,
  {
    /** ชื่อเต็มในหน้าตั้งค่า */
    label: string;
    /** ป้ายสั้นบนชิป/ตาราง */
    short: string;
    /** อธิบายว่านับตอนไหน + ใครเป็นเจ้าของผลงาน */
    desc: string;
    chip: string;
    dot: string;
  }
> = {
  work: {
    label: "ชิ้นงานที่ทำเอง",
    short: "ส่งงาน",
    desc: "นับตอนกดส่งตรวจ — การ์ดชิ้นงานที่ตัวเองเป็นผู้รับผิดชอบ",
    chip: "bg-stone-100 text-stone-700",
    dot: "bg-stone-500",
  },
  brief_work: {
    label: "ชิ้นงานที่รับจาก Brief",
    short: "รับ Brief",
    // ผู้ใช้ 2026-09-01: บางคนวัดเฉพาะงานที่รับ brief มาทำ ไม่รวมงานที่ตัดเอง — เจ้าของคือคนทำ
    // (assignee) และนับตอน "ตัวเองกดส่งตรวจ" ไม่รอด่านผู้สั่ง Brief เหมือนฐาน 'brief'
    // เพราะคนทำคุมเวลาที่ผู้สั่ง Brief จะมาตรวจให้ไม่ได้
    desc: "นับตอนกดส่งตรวจ — เฉพาะการ์ดที่รับงานมาจากใบ Brief ของคนอื่น",
    chip: "bg-sky-100 text-sky-800",
    dot: "bg-sky-500",
  },
  brief: {
    label: "Brief ที่ส่งตรวจแล้ว",
    short: "Brief",
    // ผู้ใช้ 2026-09-01: แค่มีคนกด "รับงาน" ยังไม่นับ — ต้องผ่านด่านผู้สั่ง Brief
    // แล้วงานถูกส่งต่อถึงผู้ตรวจจริง (ดู briefEventMs ใน kpi-utils.ts)
    desc: "นับตอนงานจากการ์ด Brief ที่ตัวเองสั่ง ถูกรับงานและส่งตรวจถึงผู้ตรวจแล้ว",
    chip: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  posted: {
    label: "งานที่ต้องโพส",
    short: "โพส",
    desc: "นับตอนกด “โพสแล้ว” — การ์ดจาก Brief เป็นของผู้สั่ง Brief ส่วนการ์ดที่ไม่มี Brief เป็นของผู้รับผิดชอบเอง",
    chip: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
};

export const CONTENT_KPI_BASIS_ORDER: ContentKpiBasis[] = [
  "work",
  "brief_work",
  "brief",
  "posted",
];

/**
 * เจ้าของ "คิวโพส" ของการ์ดหนึ่ง — กติกาผู้ใช้ 2026-08-29:
 * การ์ดที่มาจาก Brief → **ผู้สั่ง Brief** เป็นคนถือ KPI การโพส (created_by ของการ์ด creative
 * ถูกตั้งเป็นผู้สั่ง Brief ตอนกดรับงาน) · การ์ดที่ไม่มี Brief (คนตัดเอง/สร้างการ์ดเอง)
 * → ผู้รับผิดชอบการ์ดต้องเป็นคนโพสเอง
 *
 * ใช้ร่วมกันทั้งคิว "รอโพส" ในหน้า /tasks และการนับ KPI ฐาน 'posted'
 * — **ห้ามเขียนเงื่อนไขนี้ซ้ำที่อื่น** ไม่งั้นสองที่จะนับคนละคนเมื่อกติกาเปลี่ยน
 */
export function postOwnerIdOf(t: {
  brief_source_id: string | null;
  created_by: string | null;
  assignee_id: string | null;
}): string | null {
  return t.brief_source_id !== null ? t.created_by : t.assignee_id;
}

/**
 * ฟอร์แมตชิ้นงานที่เดาได้จากการ์ด Brief — การ์ด Brief มักไม่มี `content_format`
 * (ช่องนั้นติดตอนโพส) แต่มี `brief_content_type` (graphic|video) อยู่แล้ว
 * กติกา KPI ฐาน 'brief' ที่เจาะฟอร์แมตจึงเทียบกับค่านี้เป็นตัวสำรอง
 */
export function briefFormatOf(briefContentType: string | null): ContentFormat | null {
  if (briefContentType === "video") return "video";
  if (briefContentType === "graphic") return "image";
  return null;
}

/* ---------- ย่อไฟล์ก่อนอัพโหลด ----------
   เพดานขนาดไฟล์อยู่ที่ `MAX_UPLOAD_BYTES` ใน `@/lib/upload` ที่เดียว (ต้องตรงกับค่าที่ตั้งไว้
   ใน Supabase Dashboard → Storage → Settings; **ห้ามตั้งด้วย SQL** — เคยทำอัพโหลดพังทั้งระบบ) */

/** ไฟล์รูปที่ใหญ่กว่านี้จะถูกย่อ/บีบอัดในเบราว์เซอร์ก่อนอัพ (รูปจากมือถือมักใหญ่ 3-12MB) */
export const IMAGE_COMPRESS_OVER_MB = 1;

/** ด้านยาวสุดของรูปหลังย่อ — พอสำหรับดูตรวจงานบนจอ 4K โดยไฟล์เล็กลงหลายเท่า */
export const IMAGE_MAX_DIMENSION = 2560;

/** วิดีโอที่ใหญ่กว่านี้จะถูกบีบเสมอ (`compressVideoFile` ใน @/lib/video-compress) */
export const VIDEO_COMPRESS_OVER_MB = 20;

/** วิดีโอที่เล็กกว่านี้ปล่อยผ่านเสมอ — โหลดทันอยู่แล้ว ไม่คุ้มที่จะให้ผู้ใช้รอแปลง
 *  (ระหว่าง 2 ค่านี้ ตัดสินจาก "บิตเรต" ว่าเปิดดูแล้วจะสะดุดหรือไม่) */
export const VIDEO_SKIP_UNDER_MB = 3;

/** ด้านยาวสุดของวิดีโอหลังบีบ — 1080p พอสำหรับตรวจงาน (ต้นฉบับ 4K จากมือถือเล็กลงหลายเท่า) */
export const VIDEO_MAX_DIMENSION = 1920;

/** เฟรมเรตสูงสุดของไฟล์หลังบีบ — คลิปจากมือถือมักเป็น 50/60fps ซึ่งกินแบนด์วิดท์และ
 *  แรงถอดรหัสเกือบเท่าตัวโดยไม่ช่วยการตรวจงานเลย */
export const VIDEO_MAX_FPS = 30;

/** บิตต่อพิกเซลต่อเฟรมที่ใช้คำนวณ "บิตเรตเป้าหมาย" ของไฟล์หลังบีบ
 *  (H.264 ที่ ~0.04 = 1080x1920@30fps ราว 2.5 Mbps — คมพอตรวจงานและสตรีมทันบนเน็ตออฟฟิศ)
 *  ตัวเลขนี้คือหัวใจของการแก้อาการ "กดเล่นแล้วกระตุก": ไฟล์ที่บิตเรตสูงกว่าความเร็วเน็ต
 *  จะเล่นไปโหลดไปแล้ว buffer หมดเป็นระยะ ไม่ว่าเครื่องผู้ตรวจจะแรงแค่ไหน */
export const VIDEO_BITS_PER_PIXEL = 0.04;

/** ขอบบน–ล่างของบิตเรตเป้าหมาย (bit/s) — กันคลิปจอใหญ่พุ่งเกินเน็ต และกันคลิปจอเล็กแตกเกินไป */
export const VIDEO_MIN_BITRATE = 600_000;
export const VIDEO_MAX_BITRATE = 2_800_000;

/** บีบก็ต่อเมื่อบิตเรตต้นทางสูงกว่าเป้าหมายเกินเท่านี้ — ไฟล์ที่ดีอยู่แล้วไม่ต้องเสียคุณภาพซ้ำ */
export const VIDEO_BITRATE_SLACK = 1.25;
