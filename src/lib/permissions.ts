// สิทธิ์การมองเห็น — โมดูลนี้ปลอดฝั่ง client (ไม่ import server-only) ใช้ได้ทั้ง client/server
import type { AppPermission } from "@/lib/database.types";

export type { AppPermission };

/** สิทธิ์ทั้งหมดที่ admin เปิดให้รายคนได้ + คำอธิบาย (ใช้ในหน้า /accounts) */
export const PERMISSION_META: {
  key: AppPermission;
  label: string;
  detail: string;
  /** กลุ่มของสิทธิ์ — 'influ' = 3 ระดับของระบบ Influencer (เลือกได้ระดับเดียว),
      'wellness' = บทบาทของระบบ Wellness (สวิตช์อิสระ ติ๊กรวมกันได้) */
  group?: "influ" | "wellness";
}[] = [
  {
    key: "data",
    label: "ข้อมูล & รายงาน",
    detail: "ดูแดชบอร์ดและรายงานทั้งหมด",
  },
  {
    key: "team",
    label: "งานทีม",
    detail: "เข้าหน้า Task, Team Workload, คลังลิงก์ไฟล์ และโปรไฟล์ Influencer",
  },
  {
    key: "influ_view",
    label: "Influencer — Viewer (ดูอย่างเดียว)",
    detail:
      "เข้าดูทุกหน้าในระบบ Influencer ได้ทั้งหมด (บอร์ด เคส ปฏิทิน ต้นทุน แดชบอร์ด) แต่เพิ่ม/แก้/ลบอะไรไม่ได้เลย",
    group: "influ",
  },
  {
    key: "influ_hunter",
    label: "Influencer — ระดับ Influencer (ทำงานเคส)",
    detail:
      "สร้างการ์ด Influ (เป็นผู้รับผิดชอบเคสของตัวเอง) เดินงาน แก้ข้อมูล และลบเคสที่ตัวเองสร้างได้ · ไม่เห็นถังขยะ/ประวัติการใช้งาน และแก้ทะเบียนหมอไม่ได้",
    group: "influ",
  },
  {
    key: "influ",
    label: "Influencer — Admin (ผู้ดูแลระบบ)",
    detail:
      "ทำได้ทุกอย่างในระบบ Influencer รวมถึงลบเคสของทุกคน · ทะเบียนหมอ · ประวัติการใช้งาน (Log) · ถังขยะ 30 วัน",
    group: "influ",
  },
  {
    key: "pricing",
    label: "Product Pricing",
    detail: "เข้าหน้าจัดการราคา (Price List) — หน้าราคาสาธารณะยังเปิดให้ทุกคน",
  },
  {
    key: "wellness_bc",
    label: "Wellness — BC (Beauty Consult)",
    detail:
      "สร้าง/แก้การ์ดลูกค้า Wellness (ชื่อ เบอร์โทร หัตถการที่ทำ) หลังลูกค้าตรวจเลือด",
    group: "wellness",
  },
  {
    key: "wellness_lab",
    label: "Wellness — Lab",
    detail:
      "อัพโหลด/แก้ไข/ลบไฟล์ผลตรวจเลือด (PDF) บนการ์ดลูกค้า และกดยืนยันผลเพื่อส่งต่อให้ Admin",
    group: "wellness",
  },
  {
    key: "wellness_admin",
    label: "Wellness — Admin",
    detail:
      "ทำได้ทุกอย่างในระบบ Wellness: ดูข้อมูลติดต่อลูกค้า โทรนัด ลงคิวปรึกษาแพทย์ (เลือก 1-3 ชม.) ปิดเคส และลบข้อมูล",
    group: "wellness",
  },
  {
    key: "wellness_doctor",
    label: "Wellness — แพทย์",
    detail:
      "ดูปฏิทินคิวของตัวเอง + เปิดดูผลตรวจเลือดและข้อมูลลูกค้า (อ่านอย่างเดียว)",
    group: "wellness",
  },
];

export const ALL_PERMISSIONS: AppPermission[] = PERMISSION_META.map(
  (p) => p.key
);

export type Access = {
  uid: string | null;
  /** ชื่อที่ใช้แสดง (full_name → email) — ใช้เป็น "ผู้ทำ" ตอนเขียน log โดยไม่ต้อง query ซ้ำ */
  name: string | null;
  isAdmin: boolean;
  permissions: AppPermission[];
};

/** สิทธิ์การมองเห็นแยกอิสระต่อบัญชี (แบบ Discord) — เช็คจาก permissions รายคนตรงๆ
    ไม่ผูกกับ role: การเป็น admin (จัดการบัญชี/ผู้ตรวจ) เป็นสิทธิ์แยก ไม่เหมาเห็นทุกหน้า */
export function hasPermission(access: Access, perm: AppPermission): boolean {
  return access.permissions.includes(perm);
}

/* ============================================================
   ระดับสิทธิ์ของระบบ Influencer (2026-08-14)

   ทีมอื่นเข้ามาใช้ระบบด้วย จึงต้องแยกให้ละเอียดกว่า "มี influ / ไม่มี influ":
     none    = ไม่เห็นระบบนี้เลย
     view    = ดูเฉยๆ — อ่านได้ทุกหน้า แต่ไม่มีปุ่มเพิ่ม/แก้/ลบใดๆ
     hunter  = สร้างการ์ด Influ + เดินงาน + แก้ข้อมูล; ลบได้เฉพาะเคสที่ตัวเองรับผิดชอบ
     manager = ผู้ดูแลระบบ Influ — ทุกอย่าง + ทะเบียนหมอ + log + ถังขยะ

   เป็น "ระดับ" (สูงกว่าครอบต่ำกว่า) ต่างจากสิทธิ์อื่นในระบบที่เป็นสวิตช์อิสระ —
   เพราะผู้ใช้ต้องการให้เลือกได้ทีละระดับ ไม่ใช่ติ๊กรวมกันแล้วงง
   ============================================================ */

export type InfluLevel = "none" | "view" | "hunter" | "manager";

export const INFLU_LEVELS: Record<
  Exclude<InfluLevel, "none">,
  { key: AppPermission; label: string; short: string; badge: string }
> = {
  view: {
    key: "influ_view",
    label: "Viewer (ดูอย่างเดียว)",
    short: "Viewer",
    badge: "border border-stone-200 bg-stone-50 text-stone-600",
  },
  hunter: {
    key: "influ_hunter",
    label: "Influencer (สร้าง/แก้เคสได้)",
    short: "Influencer",
    badge: "border border-sky-200 bg-sky-50 text-sky-700",
  },
  manager: {
    key: "influ",
    label: "Admin (ผู้ดูแลระบบ Influencer)",
    short: "Admin",
    badge: "border border-brand-200 bg-brand-50 text-brand-700",
  },
};

/** ระดับสูงสุดที่บัญชีนี้มี (ติ๊กหลายอันพร้อมกัน = ใช้อันสูงสุด) */
export function influLevel(access: Access): InfluLevel {
  if (hasPermission(access, "influ")) return "manager";
  if (hasPermission(access, "influ_hunter")) return "hunter";
  if (hasPermission(access, "influ_view")) return "view";
  return "none";
}

/** เห็นระบบ Influencer ไหม (guard ของทุกหน้าในระบบนี้) */
export function canViewInflu(access: Access): boolean {
  return influLevel(access) !== "none";
}

/** เพิ่ม/แก้ข้อมูลได้ไหม — Hunter ขึ้นไป (ระดับ "ดูเฉยๆ" ต้องไม่เห็นปุ่มแก้ใดๆ) */
export function canEditInflu(access: Access): boolean {
  const lvl = influLevel(access);
  return lvl === "hunter" || lvl === "manager";
}

/** งานผู้ดูแลระบบ Influ — ทะเบียนหมอ, ประวัติการใช้งาน, ถังขยะ, ลบเคสของคนอื่น */
export function canManageInflu(access: Access): boolean {
  return influLevel(access) === "manager";
}

/** ลบเคสได้ไหม — ผู้ดูแลลบได้ทุกเคส, Hunter ลบได้เฉพาะเคสที่ตัวเองรับผิดชอบ/สร้าง
    (ownerId ว่าง = เคสเก่าที่ไม่มีเจ้าของ → เฉพาะผู้ดูแลเท่านั้น) */
export function canDeleteInflu(
  access: Access,
  ownerId: string | null | undefined,
  /** ถือบทบาท "ผู้ดูแล" (owner) ในเคสนี้ไหม — ผู้รับผิดชอบตัวจริงตั้งแต่ 0104
      (owner_id คือ "ผู้สร้าง" คนละเรื่องกัน — เคสที่ถูกมอบต่อจึงลบไม่ได้ถ้าดูแค่ owner_id) */
  isCaseOwner = false
): boolean {
  const lvl = influLevel(access);
  if (lvl === "manager") return true;
  if (lvl !== "hunter") return false;
  if (isCaseOwner) return true;
  return ownerId !== null && ownerId !== undefined && ownerId === access.uid;
}

/* ============================================================
   บทบาทของระบบ Wellness (2026-08-27)

   ต่างจาก Influencer ที่เป็น "ระดับ": ที่นี่เป็น "บทบาทตาม flow งาน"
   ที่แยกอิสระและติ๊กรวมกันได้ (คนเดียวเป็นทั้ง BC + Lab ได้):
     wellness_bc     = สร้าง/แก้การ์ดลูกค้า
     wellness_lab    = อัพ/ลบไฟล์ผล lab + ยืนยันผล
     wellness_admin  = ลงคิว/ปิดเคส/ลบ — ทำได้ทุกอย่าง
     wellness_doctor = ดูปฏิทิน + ผล lab + ข้อมูลลูกค้า (อ่านอย่างเดียว)
   ============================================================ */

/** เห็นระบบ Wellness ไหม (guard ของทุกหน้าในระบบนี้) — มีบทบาทใดบทบาทหนึ่งก็เข้าได้ */
export function canViewWellness(access: Access): boolean {
  return (
    hasPermission(access, "wellness_bc") ||
    hasPermission(access, "wellness_lab") ||
    hasPermission(access, "wellness_admin") ||
    hasPermission(access, "wellness_doctor")
  );
}

/** สร้าง/แก้การ์ดลูกค้าได้ไหม — BC หรือ Admin */
export function canWellnessBc(access: Access): boolean {
  return (
    hasPermission(access, "wellness_bc") ||
    hasPermission(access, "wellness_admin")
  );
}

/** จัดการไฟล์ผล lab + กดยืนยันผลได้ไหม — Lab หรือ Admin */
export function canWellnessLab(access: Access): boolean {
  return (
    hasPermission(access, "wellness_lab") ||
    hasPermission(access, "wellness_admin")
  );
}

/** งาน Admin ของระบบ Wellness — ลงคิว/แก้คิว/ปิดเคส/ลบข้อมูล */
export function canWellnessAdmin(access: Access): boolean {
  return hasPermission(access, "wellness_admin");
}
