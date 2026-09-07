import { formatNumber, todayISO } from "./format";

/** สไตล์ tooltip ของ recharts ให้เหมือนกันทุกรายงาน */
export const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e7e5e4",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: 12,
};

export const AXIS_TICK = { fontSize: 12, fill: "#78716c" };

/** ย่อจำนวนเงินบนแกน เช่น 1.2M / 350K */
export function compactBaht(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${formatNumber(Math.round((value / 1_000_000) * 10) / 10)}M`;
  }
  if (abs >= 1_000) {
    return `${formatNumber(Math.round(value / 1_000))}K`;
  }
  return formatNumber(value);
}

/* ---------- ตัวเลือกช่วงเวลาแบบเดียวกันทุกรายงาน ---------- */

export type PeriodKey = "today" | "7d" | "30d" | "mtd" | "90d" | "6m" | "12m";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 วัน" },
  { key: "30d", label: "30 วัน" },
  { key: "mtd", label: "เดือนนี้" },
  { key: "90d", label: "90 วัน" },
  { key: "6m", label: "6 เดือน" },
  { key: "12m", label: "12 เดือน" },
];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "วันนี้",
  "7d": "7 วันล่าสุด",
  "30d": "30 วันล่าสุด",
  mtd: "เดือนนี้ (1 – วันนี้)",
  "90d": "90 วันล่าสุด",
  "6m": "6 เดือนล่าสุด",
  "12m": "12 เดือนล่าสุด",
};

function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- ผลลัพธ์ RPC aggregate ยอดขาย (migration 0032) ----------
   ยอดขายจริงเป็นรายบรรทัดใบเสร็จหลายหมื่นแถว — หน้ารายงาน aggregate ใน SQL
   แล้วส่งเฉพาะผลสรุปมา ("บิล" = จำนวนใบเสร็จ distinct ไม่ใช่จำนวนบรรทัด) */

interface NamedTotal {
  name: string;
  total: number;
}

interface ItemTotal extends NamedTotal {
  lines: number;
}

interface PersonTotal extends NamedTotal {
  bills: number;
  lines: number;
}

export interface SalesTotals {
  total: number;
  lines: number;
  bills: number;
}

export interface SalesDashSummary extends SalesTotals {
  by_category: NamedTotal[];
  by_branch: NamedTotal[];
  top_items: ItemTotal[];
  by_person: PersonTotal[];
}

export interface MonthlySalesPoint {
  month: string; // YYYY-MM
  total: number;
  bills: number;
}

export const EMPTY_SALES_SUMMARY: SalesDashSummary = {
  total: 0,
  lines: 0,
  bills: 0,
  by_category: [],
  by_branch: [],
  top_items: [],
  by_person: [],
};

/** ช่วงก่อนหน้าที่ยาวเท่ากัน สำหรับชิปเปรียบเทียบ */
export function previousWindow(
  cutoffISO: string,
  todayStr: string
): { from: string; to: string } {
  const cutoff = new Date(`${cutoffISO}T00:00:00`);
  const today = new Date(`${todayStr}T00:00:00`);
  const days = Math.round((today.getTime() - cutoff.getTime()) / 86400000) + 1;
  const from = new Date(cutoff);
  from.setDate(from.getDate() - days);
  const to = new Date(cutoff);
  to.setDate(to.getDate() - 1);
  return { from: toISODate(from), to: toISODate(to) };
}

export function isPeriodKey(v: string | undefined): v is PeriodKey {
  return PERIOD_OPTIONS.some((o) => o.key === v);
}

/** วันเริ่มต้นของช่วงเวลา (YYYY-MM-DD) — อิง "วันนี้" ตามเวลาไทยเสมอ (todayISO) */
export function cutoffFor(period: PeriodKey): string {
  const t = todayISO(); // Asia/Bangkok
  const base = new Date(`${t}T00:00:00`);
  const shiftDays = (days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() - days);
    return toISODate(d);
  };
  const monthStart = (monthsBack: number) => {
    const d = new Date(base.getFullYear(), base.getMonth() - monthsBack, 1);
    return toISODate(d);
  };
  switch (period) {
    case "today":
      return t;
    case "7d":
      return shiftDays(6);
    case "30d":
      return shiftDays(29);
    case "mtd":
      return `${t.slice(0, 7)}-01`;
    case "90d":
      return shiftDays(89);
    case "6m":
      return monthStart(5);
    case "12m":
      return monthStart(11);
  }
}

/** ปุ่ม segmented เลือกช่วงเวลา — สไตล์เดียวกับแดชบอร์ด */
export const PERIOD_BUTTON_ACTIVE =
  "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm";
export const PERIOD_BUTTON_IDLE =
  "text-stone-500 hover:bg-brand-50 hover:text-brand-800";

/* ---------- KPI รายคน ---------- */

/**
 * รวมเป้า KPI รายเดือนให้ตรงกับช่วงเวลาที่เลือก
 * เดือนปัจจุบัน (ยังไม่จบ) คิดเป้าตามสัดส่วนวันที่ผ่านไป (prorate) เพื่อให้
 * การเทียบ "ทำได้ / เป้า" ยุติธรรม — เดือนแรกของช่วง 30/90 วันที่เริ่มกลางเดือน
 * ก็ prorate ตามจำนวนวันที่อยู่ในช่วงเช่นกัน
 */
export function sumTargetsForPeriod(
  targets: { month: string; target_amount: number }[],
  cutoffISO: string,
  todayISO: string
): number {
  const cutoffMonth = cutoffISO.slice(0, 7);
  const currentMonth = todayISO.slice(0, 7);
  let sum = 0;
  for (const t of targets) {
    const m = t.month.slice(0, 7);
    if (m < cutoffMonth || m > currentMonth) continue;
    const [y, mo] = m.split("-").map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    // สัดส่วน = จำนวนวันของเดือนนี้ที่อยู่ "ในช่วง" จริงๆ (start–end อาจอยู่เดือนเดียวกัน
    // เช่น Today/7 วัน — ห้ามใช้ min ของสองสัดส่วนแยกกัน จะได้ค่าเกินจริง)
    const startDay = m === cutoffMonth ? Number(cutoffISO.slice(8, 10)) : 1;
    const endDay = m === currentMonth ? Number(todayISO.slice(8, 10)) : daysInMonth;
    const fraction = Math.max(0, endDay - startDay + 1) / daysInMonth;
    sum += t.target_amount * fraction;
  }
  return sum;
}

/** สี achievement ตามหลัก viz: เขียว ≥100%, เหลือง 80–99%, แดง <80% */
export function achievementTone(pct: number): {
  text: string;
  chip: string;
  bar: string;
} {
  if (pct >= 100) {
    return {
      text: "text-emerald-600",
      chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      bar: "from-emerald-400 to-emerald-500",
    };
  }
  if (pct >= 80) {
    return {
      text: "text-amber-600",
      chip: "bg-amber-50 text-amber-700 border border-amber-200",
      bar: "from-amber-400 to-amber-500",
    };
  }
  return {
    text: "text-rose-600",
    chip: "bg-rose-50 text-rose-700 border border-rose-200",
    bar: "from-rose-400 to-rose-500",
  };
}

/** สีประจำทีมสำหรับกราฟ — ทีมขาย = โทนแบรนด์, ทีมแอดมิน = โทนฟ้า (คนละ hue ชัดเจน) */
export const TEAM_COLORS = {
  sales: { main: "#a96a58", soft: "#ddb9aa", grad: "from-brand-400 to-brand-600" },
  admin: { main: "#0284c7", soft: "#7dd3fc", grad: "from-sky-400 to-sky-600" },
} as const;
