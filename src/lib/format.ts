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

/** แสดงวันที่แบบไทย เช่น "3 ก.ค. 2569" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** แสดงวันที่+เวลาแบบไทย เช่น "3 ก.ค. 2569 14:30" */
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
  });
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
