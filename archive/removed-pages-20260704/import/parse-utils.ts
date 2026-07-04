import Papa from "papaparse";
import * as XLSX from "xlsx";

/** ผลลัพธ์การอ่านไฟล์: หัวคอลัมน์ + แถวข้อมูลทั้งหมด */
export interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
}

/** ฟิลด์เป้าหมายในตาราง sales_records ที่รองรับการจับคู่คอลัมน์ */
export type TargetField =
  | "record_date"
  | "amount"
  | "branch"
  | "category"
  | "item_name"
  | "quantity"
  | "unit_price"
  | "customer_name"
  | "staff_name"
  | "payment_method"
  | "note";

/** การจับคู่ ฟิลด์เป้าหมาย → ชื่อหัวคอลัมน์ในไฟล์ */
export type FieldMapping = Partial<Record<TargetField, string>>;

/** รายการฟิลด์เป้าหมายพร้อม label ไทย (เรียงตามลำดับที่แสดงในฟอร์ม) */
export const TARGET_FIELD_DEFS: {
  key: TargetField;
  label: string;
  required: boolean;
}[] = [
  { key: "record_date", label: "วันที่ขาย", required: true },
  { key: "amount", label: "ยอดเงิน (บาท)", required: true },
  { key: "branch", label: "สาขา", required: false },
  { key: "category", label: "หมวดหมู่", required: false },
  { key: "item_name", label: "รายการ/บริการ", required: false },
  { key: "quantity", label: "จำนวน", required: false },
  { key: "unit_price", label: "ราคาต่อหน่วย", required: false },
  { key: "customer_name", label: "ชื่อลูกค้า", required: false },
  { key: "staff_name", label: "พนักงาน/ผู้ขาย", required: false },
  { key: "payment_method", label: "วิธีชำระเงิน", required: false },
  { key: "note", label: "หมายเหตุ", required: false },
];

/* ---------- อ่านไฟล์ CSV / Excel ---------- */

/**
 * อ่านไฟล์ CSV (.csv) หรือ Excel (.xlsx/.xls) เป็นหัวคอลัมน์ + แถวข้อมูล
 * โยน Error พร้อมข้อความภาษาไทยเมื่อไฟล์ว่าง/เสียหาย/นามสกุลไม่รองรับ
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsvFile(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcelFile(file);
  }
  throw new Error("รองรับเฉพาะไฟล์ .csv, .xlsx หรือ .xls เท่านั้น");
}

function parseCsvFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = (results.meta.fields ?? []).filter(
          (h) => h.trim() !== ""
        );
        if (headers.length === 0) {
          reject(
            new Error(
              "ไม่พบหัวคอลัมน์ในไฟล์ กรุณาตรวจสอบว่าแถวแรกเป็นชื่อคอลัมน์"
            )
          );
          return;
        }
        if (results.data.length === 0) {
          reject(new Error("ไฟล์นี้ไม่มีแถวข้อมูล กรุณาตรวจสอบไฟล์อีกครั้ง"));
          return;
        }
        resolve({ headers, rows: results.data });
      },
      error: (err: Error) => {
        reject(new Error(`อ่านไฟล์ CSV ไม่สำเร็จ: ${err.message}`));
      },
    });
  });
}

async function parseExcelFile(file: File): Promise<ParsedFile> {
  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    throw new Error(
      "อ่านไฟล์ Excel ไม่สำเร็จ ไฟล์อาจเสียหายหรือไม่ใช่รูปแบบที่รองรับ"
    );
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new Error("ไฟล์ Excel นี้ไม่มีแผ่นงาน (sheet) ข้อมูล");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  const first = rows[0];
  if (!first) {
    throw new Error("ไฟล์นี้ไม่มีแถวข้อมูล กรุณาตรวจสอบไฟล์อีกครั้ง");
  }

  const headers = Object.keys(first).filter((h) => h.trim() !== "");
  if (headers.length === 0) {
    throw new Error("ไม่พบหัวคอลัมน์ในไฟล์ กรุณาตรวจสอบว่าแถวแรกเป็นชื่อคอลัมน์");
  }
  return { headers, rows };
}

/* ---------- จับคู่หัวคอลัมน์อัตโนมัติ ---------- */

const SYNONYMS: Record<TargetField, string[]> = {
  record_date: ["วันที่", "date", "วัน"],
  amount: ["ยอด", "จำนวนเงิน", "amount", "total", "revenue", "มูลค่า", "ราคา"],
  branch: ["สาขา", "branch"],
  category: ["หมวด", "ประเภท", "category", "type"],
  item_name: [
    "รายการ",
    "บริการ",
    "สินค้า",
    "item",
    "service",
    "product",
    "หัตถการ",
  ],
  quantity: ["จำนวน", "qty", "quantity"],
  unit_price: ["ราคาต่อหน่วย", "unit"],
  customer_name: ["ลูกค้า", "ชื่อลูกค้า", "customer", "คนไข้"],
  staff_name: ["พนักงาน", "ผู้ขาย", "staff", "หมอ", "แพทย์", "sale"],
  payment_method: ["ชำระ", "payment", "การจ่าย"],
  note: ["หมายเหตุ", "note", "remark"],
};

/**
 * ลำดับการจับคู่ — จัดให้ฟิลด์ที่ชื่อเฉพาะเจาะจงกว่ามาก่อน
 * เพื่อไม่ให้ synonym กว้างๆ แย่งคอลัมน์ไป (เช่น "ราคาต่อหน่วย" ต้องมาก่อน "ราคา",
 * "จำนวนเงิน" ของ amount ต้องถูกจับก่อน "จำนวน" ของ quantity)
 */
const GUESS_ORDER: TargetField[] = [
  "record_date",
  "unit_price",
  "amount",
  "quantity",
  "branch",
  "category",
  "item_name",
  "customer_name",
  "staff_name",
  "payment_method",
  "note",
];

/** เดาการจับคู่หัวคอลัมน์อัตโนมัติจาก synonym ไทย/อังกฤษ (case-insensitive, contains) */
export function guessMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const used = new Set<string>();

  for (const field of GUESS_ORDER) {
    for (const synonym of SYNONYMS[field]) {
      const lower = synonym.toLowerCase();
      const hit = headers.find(
        (h) => !used.has(h) && h.toLowerCase().includes(lower)
      );
      if (hit) {
        mapping[field] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return mapping;
}

/* ---------- แปลงค่าเซลล์ ---------- */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function isValidYMD(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** แปลงเลข Excel serial เป็น YYYY-MM-DD (คำนวณแบบ UTC) */
function excelSerialToISO(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * แปลงค่าวันที่เป็น "YYYY-MM-DD" — รองรับ Date object, เลข Excel serial,
 * string ISO (yyyy-mm-dd), string dd/mm/yyyy หรือ dd-mm-yyyy (วันขึ้นก่อน,
 * ปี พ.ศ. > 2400 จะถูกลบ 543, ปีสองหลักเดาเป็น 20xx) — คืน null ถ้าแปลงไม่ได้
 */
export function parseDateValue(v: unknown): string | null {
  if (v == null) return null;

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return toISODate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }

  if (typeof v === "number") {
    if (Number.isFinite(v) && v >= 25569 && v <= 80000) {
      return excelSerialToISO(v);
    }
    return null;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // ISO: yyyy-mm-dd (อาจตามด้วยเวลา)
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (iso) {
      let year = Number(iso[1]);
      const month = Number(iso[2]);
      const day = Number(iso[3]);
      if (year > 2400) year -= 543; // ปี พ.ศ.
      if (!isValidYMD(year, month, day)) return null;
      return toISODate(year, month, day);
    }

    // dd/mm/yyyy หรือ dd-mm-yyyy (วันขึ้นก่อน)
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      let year = Number(dmy[3]);
      if (year < 100) year += 2000; // ปีสองหลัก → 20xx
      if (year > 2400) year -= 543; // ปี พ.ศ. → ค.ศ.
      if (!isValidYMD(year, month, day)) return null;
      return toISODate(year, month, day);
    }

    // string ตัวเลขล้วนที่อยู่ในช่วง Excel serial (เช่นจาก CSV)
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n >= 25569 && n <= 80000) return excelSerialToISO(n);
    }

    return null;
  }

  return null;
}

/**
 * แปลงค่าจำนวนเงินเป็นตัวเลข — ตัด comma, ช่องว่าง, สัญลักษณ์ ฿/THB/บาท
 * คืน null ถ้าไม่ใช่ตัวเลข
 */
export function parseAmountValue(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === "string") {
    const cleaned = v
      .replace(/[,\s฿]/g, "")
      .replace(/thb/gi, "")
      .replace(/บาท/g, "");
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** แปลงค่าเซลล์เป็นข้อความ (trim แล้ว) — คืน null ถ้าว่าง/ไม่ใช่ค่าที่แสดงได้ */
export function parseTextValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return toISODate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  return null;
}
