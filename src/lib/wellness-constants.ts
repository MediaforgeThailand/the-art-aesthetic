// ค่าคงที่ + helper ของระบบ Wellness (client-safe — ไม่ import server-only)
//
// flow ของเคส: BC สร้างการ์ดลูกค้า → Lab อัพผลเลือด PDF + กดยืนยัน →
// Admin โทรนัด + ลงคิวปรึกษาแพทย์ → ฟังผลเสร็จ = ปิดเคส
import type { WellnessApptStatus } from "@/lib/database.types";
import { todayISO } from "@/lib/format";

/* ============================================================
   สถานะเคส — คำนวณจากข้อมูลจริง ไม่มีคอลัมน์ status ใน wellness_customers
   (กติกาเดียวกับ statusOf ของ My List: สถานะต้องเล่าจาก flow ไม่ใช่ให้เลือกเอง)
   ============================================================ */

export type WellnessStatusKey = "awaiting_lab" | "lab_ready" | "booked" | "done";

export const WELLNESS_STATUS: Record<
  WellnessStatusKey,
  {
    label: string;
    /** ใครต้องขยับงานต่อในสถานะนี้ — โชว์ใต้หัวกลุ่มบนบอร์ด */
    hint: string;
    /** ชิปสถานะบนการ์ด/หัวเคส */
    badge: string;
    /** แถบสีซ้ายของกลุ่มบนบอร์ด (แพตเทิร์นเดียวกับ COST_USAGE_META.dot) */
    dot: string;
  }
> = {
  awaiting_lab: {
    label: "รอผลแลบ",
    hint: "ทีม Lab อัพโหลดผลตรวจ + กดยืนยัน",
    badge: "border border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-400",
  },
  lab_ready: {
    label: "ผลพร้อม · รอนัด",
    hint: "Admin โทรนัดลูกค้าเข้าฟังผล แล้วลงคิวแพทย์",
    badge: "border border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-400",
  },
  booked: {
    label: "นัดแล้ว",
    hint: "มีคิวปรึกษาแพทย์แล้ว — รอวันนัด",
    badge: "border border-brand-200 bg-brand-50 text-brand-700",
    dot: "bg-brand-400",
  },
  done: {
    label: "ปิดเคสแล้ว",
    hint: "ฟังผล + ปรึกษาแพทย์เสร็จสมบูรณ์",
    badge: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-400",
  },
};

export const WELLNESS_STATUS_ORDER: WellnessStatusKey[] = [
  "awaiting_lab",
  "lab_ready",
  "booked",
  "done",
];

/** สถานะของเคส — done > booked > lab_ready > awaiting_lab
    (hasScheduledAppt = มีคิว status='scheduled' อย่างน้อย 1 คิว) */
export function wellnessStatusOf(
  customer: { lab_confirmed_at: string | null; completed_at: string | null },
  hasScheduledAppt: boolean
): WellnessStatusKey {
  if (customer.completed_at) return "done";
  if (hasScheduledAppt) return "booked";
  if (customer.lab_confirmed_at) return "lab_ready";
  return "awaiting_lab";
}

/* ============================================================
   คิวปรึกษาแพทย์
   ============================================================ */

/** ระยะเวลาคิวที่ Admin เลือกได้ (กติกาผู้ใช้: 1 / 2 / 3 ชั่วโมงเท่านั้น) */
export const WELLNESS_DURATION_OPTIONS = [1, 2, 3] as const;

export const WELLNESS_APPT_STATUS: Record<
  WellnessApptStatus,
  { label: string; badge: string }
> = {
  scheduled: {
    label: "นัดไว้",
    badge: "border border-brand-200 bg-brand-50 text-brand-700",
  },
  done: {
    label: "เสร็จแล้ว",
    badge: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  cancelled: {
    label: "ยกเลิก",
    badge: "border border-stone-200 bg-stone-50 text-stone-500",
  },
};

/** "10:00:00" | "10:00" → "10:00" (ค่า time จาก Postgres มีวินาทีติดมา) */
export function formatTimeShort(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** เวลาสิ้นสุดคิว — "10:00" + 2 ชม. → "12:00" (คิวไม่มีทางข้ามเที่ยงคืน: เริ่มไม่เกิน 3 ชม.ก่อนหมดวันตามการใช้งานจริงของคลินิก) */
function apptEndTime(startTime: string, durationHours: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!m) return startTime;
  const end = (Number(m[1]) + durationHours) % 24;
  return `${String(end).padStart(2, "0")}:${m[2]}`;
}

/** ช่วงเวลาอ่านง่าย "10:00–12:00 (2 ชม.)" */
export function apptRangeLabel(startTime: string, durationHours: number): string {
  return `${formatTimeShort(startTime)}–${apptEndTime(startTime, durationHours)} (${durationHours} ชม.)`;
}

/** ข้อความไทยเมื่อคิวชนกัน — exclusion constraint ใน DB คืน error code 23P01
    (ใช้ทั้งหน้าการ์ดลูกค้าและปฏิทิน — ที่ไหน insert/ย้ายคิวเป็น scheduled ต้องดักโค้ดนี้) */
const WELLNESS_OVERLAP_MESSAGE =
  "ช่วงเวลานี้ชนกับคิวที่มีอยู่ — เลือกเวลาอื่นหรือเช็คปฏิทินคิวแพทย์ก่อน";

/** แพทย์ Wellness เข้าเฉพาะ อังคาร/เสาร์ (กติกาผู้ใช้ — แต่ปฏิทินเปิดลงคิวได้ทุกวัน
    แค่เตือน ไม่บล็อค เผื่อวันเข้าเปลี่ยน) — dateStr = YYYY-MM-DD */
export function isWellnessDoctorDay(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 2 || day === 6;
}

/* ============================================================
   อื่นๆ
   ============================================================ */

/** ชื่อเต็มของลูกค้า (การ์ดเก่าอาจมีแต่ชื่อ) */
export function wellnessCustomerName(customer: {
  first_name: string;
  last_name: string;
}): string {
  return (
    `${customer.first_name} ${customer.last_name}`.trim() || "(ไม่ระบุชื่อ)"
  );
}

/** path ไฟล์ผล lab ใน bucket documents — ชื่อ object เป็น ascii ล้วน
    (ชื่อไฟล์จริงเก็บใน wellness_lab_files.file_name — ชื่อไทยแสดงจากคอลัมน์นั้น)
    อยู่ระดับโมดูลเพราะเรียก Date.now() (กฎ react-hooks/purity) */
export function newLabFilePath(
  customerId: string,
  fileName: string,
  index = 0
): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const ext = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `wellness/${customerId}/${Date.now()}-${index}${ext ? `.${ext}` : ""}`;
}

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ปฏิทิน/ฟอร์มนัดต้องอิงเวลาไทยเสมอ
    ตัวคำนวณจริงอยู่ที่ `todayISO()` ใน format.ts ที่เดียว (ชื่อนี้คงไว้ให้ผู้เรียกเดิม) */
export function todayBangkokISO(): string {
  return todayISO();
}

/** select ของคิวพร้อมข้อมูลลูกค้า + ไฟล์ผลแลบ — ใช้ทั้ง page.tsx (server) และ
    insert ใน calendar-client (สองที่ต้องคืนรูปเดียวกันเสมอไม่งั้น state หลังลงคิวขาดข้อมูล)
    **ต้องอยู่ไฟล์นี้ ห้ามย้ายไป calendar-client**: ค่า runtime ที่ export จากไฟล์
    "use client" จะกลายเป็น client-reference proxy เมื่อ server component import
    → supabase เรียก .split() แล้วพังทั้งหน้า (บั๊กจริงที่เจอจาก e2e 2026-08-28) */
export const CALENDAR_APPT_SELECT =
  "*, customer:wellness_customers(id, first_name, last_name, phone, procedure_text, lab_confirmed_at, completed_at, lab_files:wellness_lab_files(id, file_path, file_name, created_at))";

/* ============================================================
   บทบาท + พื้นที่ทำงาน (workspace) — "1 บทบาท = 1 หน้า = 1 งาน" (2026-08-28)

   กติกาผู้ใช้: ทุก feature (เพิ่มการ์ด / อัพผล lab / ลงคิว) ต้องเป็น **stage แยกหน้ากัน**
   และคนหนึ่งคนเห็นเฉพาะหน้าของบทบาทตัวเอง เพื่อลด learning gap —
   ห้ามเอาปุ่มของอีกบทบาทไปแปะรวมในหน้าเดียวกันอีก
   ============================================================ */

type WellnessRole = "bc" | "lab" | "admin" | "doctor";

/** บทบาทที่ "ติ๊กไว้จริง" ของบัญชีนั้น — ไม่ใช่สิทธิ์ที่ได้มาเพราะเป็น admin
    (canWellnessBc/Lab ใน permissions.ts คืน true ให้ admin ด้วย ซึ่งใช้คุมปุ่ม
    แต่ตอนเลือก "หน้าแรกของคนนี้" ต้องดูบทบาทดิบ ไม่งั้น admin จะถูกส่งเข้าหน้า BC) */
export type WellnessRoleFlags = Record<WellnessRole, boolean>;

export function wellnessRoleFlags(
  permissions: readonly string[]
): WellnessRoleFlags {
  return {
    bc: permissions.includes("wellness_bc"),
    lab: permissions.includes("wellness_lab"),
    admin: permissions.includes("wellness_admin"),
    doctor: permissions.includes("wellness_doctor"),
  };
}

type WellnessWorkspaceId =
  | "register"
  | "lab"
  | "contact"
  | "calendar"
  | "clinic"
  | "cases";

/** คีย์ไอคอน — ค่าคงที่เป็นไฟล์ .ts จึงเก็บ JSX ไม่ได้ ตัว component map อยู่ฝั่ง client
    (แพตเทิร์นเดียวกับ QUICK_ICONS ของ prospect-panel) */
export type WellnessIconKey = WellnessWorkspaceId;

export type WellnessWorkspace = {
  id: WellnessWorkspaceId;
  href: string;
  /** ป้ายบนเมนู (สั้น) */
  label: string;
  /** ป้ายสั้นสุดบนแถบแท็บล่างมือถือ (~5 ช่อง ช่องละแคบ) */
  short: string;
  /** ประโยคเดียวว่าหน้านี้ "ทำอะไร" — ใช้บนหน้าเลือกงานและใต้หัวข้อของหน้านั้น */
  detail: string;
  icon: WellnessIconKey;
  /** ลำดับใน flow 1→5 (null = เครื่องมือประกอบ ไม่ใช่ stage ของ flow)
      แถบแท็บล่างเรียงตามเลขนี้เสมอ — "เมนูล่างต้องเรียงตาม flow" (ผู้ใช้ 2026-08-28) */
  step: number | null;
  /** บทบาทที่เข้าหน้านี้ได้ — admin เข้าได้ทุกหน้าเสมอ ไม่ต้องใส่ซ้ำทุกแถว */
  roles: WellnessRole[];
  /** บทบาทที่ถือว่าหน้านี้คือ "หน้าทำงานหลัก" ของเขา (ใช้เลือกปลายทางของ /wellness) */
  primaryFor: WellnessRole[];
};

export const WELLNESS_WORKSPACES: WellnessWorkspace[] = [
  {
    id: "register",
    href: "/wellness/register",
    label: "ทะเบียนลูกค้า",
    short: "ทะเบียน",
    detail:
      "เพิ่มการ์ดลูกค้าที่ตรวจเลือดแล้ว และแก้ชื่อ/เบอร์/หัตถการให้ถูกต้อง",
    icon: "register",
    step: 1,
    roles: ["bc"],
    primaryFor: ["bc"],
  },
  {
    id: "lab",
    href: "/wellness/lab",
    label: "อัพผลแลบ",
    short: "ผลแลบ",
    detail:
      "อัพไฟล์ผลตรวจเลือดของลูกค้าแต่ละคน แล้วกดยืนยันเมื่อผลครบ",
    icon: "lab",
    step: 2,
    roles: ["lab"],
    primaryFor: ["lab"],
  },
  {
    id: "contact",
    href: "/wellness/contact",
    label: "ข้อมูลติดต่อ",
    short: "ติดต่อ",
    detail:
      "เบอร์ลูกค้าที่ผลเลือดพร้อมแล้ว — โทรแจ้งผลและตกลงวันเข้าพบแพทย์",
    icon: "contact",
    step: 3,
    roles: [],
    primaryFor: ["admin"],
  },
  {
    id: "calendar",
    href: "/wellness/calendar",
    label: "ลงคิวนัด",
    short: "ลงคิว",
    detail:
      "ปฏิทินคิวทั้งเดือน — วันแพทย์เข้า (อังคาร · เสาร์) ไฮไลต์ไว้ กดวันแล้วลงคิวได้เลย",
    icon: "calendar",
    step: 4,
    // เฉพาะ admin — หมอดูปฏิทินตัวเดียวกันที่หน้า "คิวตรวจ" (อ่านอย่างเดียว) ไม่ต้องมี 2 เมนู
    roles: [],
    primaryFor: [],
  },
  {
    id: "clinic",
    href: "/wellness/clinic",
    label: "คิวตรวจของแพทย์",
    short: "คิวตรวจ",
    detail:
      "ปฏิทินคิวตรวจทั้งเดือน (อ่านอย่างเดียว) — กดวันแล้วเห็นคิว กดคิวแล้วเปิดผลเลือด",
    icon: "clinic",
    step: 5,
    roles: ["doctor"],
    primaryFor: ["doctor"],
  },
  {
    id: "cases",
    href: "/wellness/cases",
    label: "ภาพรวมเคส",
    short: "เคส",
    detail: "การ์ดทั้งหมดในระบบ แยกตามขั้นตอน — ใช้ตามงานที่ค้าง",
    icon: "cases",
    step: null,
    roles: [],
    primaryFor: [],
  },
];

/** หน้าที่บัญชีนี้เข้าได้ — admin เห็นครบทุกหน้า (เป็นคนดูภาพรวมทั้งระบบ),
    บทบาทอื่นเห็นเฉพาะหน้าของงานตัวเอง */
export function wellnessWorkspacesFor(
  flags: WellnessRoleFlags
): WellnessWorkspace[] {
  if (flags.admin) return WELLNESS_WORKSPACES;
  return WELLNESS_WORKSPACES.filter((w) =>
    w.roles.some((r) => flags[r])
  );
}

/** ปลายทางของ `/wellness` — คนที่มีบทบาทเดียวเข้าหน้างานตัวเองตรงๆ (ไม่ต้องเลือกอะไรเลย)
    ส่วน admin / คนที่มีหลายบทบาท คืน null = ไปหน้าเลือกงาน (hub) */
export function wellnessHomeHref(flags: WellnessRoleFlags): string | null {
  if (flags.admin) return null;
  const roles = (["bc", "lab", "doctor"] as WellnessRole[]).filter(
    (r) => flags[r]
  );
  if (roles.length !== 1) return null;
  return (
    WELLNESS_WORKSPACES.find((w) => w.primaryFor.includes(roles[0]))?.href ??
    null
  );
}

/** ข้อความ error ของการ insert/update คิว — 23P01 = ชนกับคิวอื่น (exclusion constraint ใน 0091)
    ใช้ทุกที่ที่แตะ wellness_appointments (ปฏิทิน / หน้าลงคิว / หน้าเคส) ห้ามเขียนข้อความเองซ้ำ */
export function apptErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback = "บันทึกคิวไม่สำเร็จ"
): string {
  if (error?.code === "23P01") return WELLNESS_OVERLAP_MESSAGE;
  return error?.message || fallback;
}

/** บวก/ลบวันจากวันที่ ISO (YYYY-MM-DD) — pure ไม่อ่านเวลาปัจจุบัน
    ใช้กำหนดช่วงที่ query คิว (เช่นย้อนหลัง 30 วันในหน้าคิวตรวจของแพทย์) */
export function addDaysISO(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** แท็บบนแถบล่างของมือถือ — **เรียงตาม flow เสมอ** (ทะเบียน → ผลแลบ → ติดต่อ →
    ลงคิว → คิวตรวจ) ตามคำสั่งผู้ใช้ 2026-08-28; หน้าที่ไม่ใช่ stage (ภาพรวมเคส)
    ไปอยู่ในแท็บ "เพิ่มเติม" ของ shell แทน — ที่บนแถบมีจำกัด */
export function wellnessTabsFor(flags: WellnessRoleFlags): WellnessWorkspace[] {
  const tabs = wellnessWorkspacesFor(flags).filter((w) => w.step !== null);
  // admin: "ลงคิวนัด" (4) กับ "คิวตรวจของแพทย์" (5) เป็นปฏิทินตัวเดียวกัน ต่างแค่สิทธิ์ลงคิว
  // — เอา clinic ออกจากแท็บของ admin ไม่ให้ซ้ำซ้อน (ยังเข้าได้จากชีต "เพิ่มเติม")
  const shown = flags.admin ? tabs.filter((w) => w.id !== "clinic") : tabs;
  return shown.sort((a, b) => (a.step ?? 99) - (b.step ?? 99));
}

/** หน้าที่ไม่ได้อยู่บนแถบแท็บของคนนี้ — โผล่ในชีต "เพิ่มเติม" (คำนวณจากส่วนต่าง
    ไม่ใช่เช็ค step เอง จะได้ไม่มีหน้าไหนหายไปเมื่อ wellnessTabsFor ตัดอะไรออก) */
export function wellnessExtraPagesFor(
  flags: WellnessRoleFlags
): WellnessWorkspace[] {
  const onTabs = new Set(wellnessTabsFor(flags).map((w) => w.id));
  return wellnessWorkspacesFor(flags).filter((w) => !onTabs.has(w.id));
}
