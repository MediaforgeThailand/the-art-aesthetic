const currencyFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const currencyPreciseFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("th-TH");

export function formatCurrency(value: number, precise = false): string {
  return precise
    ? currencyPreciseFormatter.format(value)
    : currencyFormatter.format(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** แสดงวันที่แบบไทย เช่น "3 ก.ค. 2569"
    ตรึงโซนเวลาไทยเสมอ — server บน Vercel เป็น UTC ถ้าไม่ตรึง SSR/CSR จะ render คนละวัน (hydration mismatch) */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** แสดงวันที่แบบไทย ตรึงโซนเวลาไทย — ใช้กับ timestamptz ที่ถูกกรอง/จัดกลุ่มเป็นวันไทย
    (formatDate ปกติใช้ timezone เครื่องผู้ชม — วันที่โชว์อาจไม่ตรงกับตัวกรองวันไทย) */
export function formatDateBangkok(
  value: string | Date | null | undefined
): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** แสดงวันที่+เวลาแบบไทย เช่น "3 ก.ค. 2569 14:30" — ตรึงโซนเวลาไทยกัน hydration mismatch เช่นกัน */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

/* ตารางชื่อวัน/เดือนคงที่ — ไม่ใช้ toLocaleDateString เพราะ locale ของแต่ละเครื่อง
   ให้คำต่างกัน (บางเครื่องได้ "วันเสาร์" บางเครื่องได้ "ส.") และ SSR/CSR อาจไม่ตรงกัน */
const THAI_WEEKDAYS = [
  "อาทิตย์",
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
];
const THAI_MONTHS_SHORT = [
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

/** เวลาบนรายการแจ้งเตือน เช่น "เสาร์ 29 ส.ค. · 14:25"
    ขึ้นต้นด้วยชื่อวันเพราะคนอ่านกระดิ่งอยากรู้ก่อนว่า "วันไหน" ไม่ใช่ "วันที่เท่าไร"
    — ปีไม่แสดง (การแจ้งเตือนเป็นเรื่องสดๆ) ตรึงโซนเวลาไทยเหมือน helper ตัวอื่น */
export function formatNotiTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-")
    .map(Number);
  // หาวันในสัปดาห์จาก "วันตามปฏิทินไทย" ผ่าน Date.UTC — ใช้ epoch ของเที่ยงคืนไทย
  // ตรงๆ ไม่ได้ เพราะค่านั้นตกไปอยู่วัน UTC ก่อนหน้า (คลาดไป 1 วัน)
  const weekday = THAI_WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${weekday} ${day} ${THAI_MONTHS_SHORT[m - 1]} · ${time}`;
}

/** ชื่อเดือนสั้นภาษาไทยจาก key "YYYY-MM" เช่น "ก.ค. 69" */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** วันที่วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาไทยเสมอ
    (สำคัญ: ฝั่ง server อยู่คนละ timezone — ห้ามใช้เวลาท้องถิ่นของเครื่อง ไม่งั้น SSR/CSR คำนวณวันไม่ตรงกัน) */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}
