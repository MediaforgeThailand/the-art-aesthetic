// สิทธิ์การมองเห็น — โมดูลนี้ปลอดฝั่ง client (ไม่ import server-only) ใช้ได้ทั้ง client/server
import type { AppPermission } from "@/lib/database.types";

export type { AppPermission };

/** สิทธิ์ทั้งหมดที่ admin เปิดให้รายคนได้ + คำอธิบาย (ใช้ในหน้า /accounts) */
export const PERMISSION_META: {
  key: AppPermission;
  label: string;
  detail: string;
}[] = [
  {
    key: "data",
    label: "ข้อมูล & รายงาน",
    detail: "ดูแดชบอร์ดและรายงานทั้งหมด",
  },
  {
    key: "team",
    label: "งานทีม",
    detail: "เข้าหน้างาน ภาระงานทีม และคลังลิงก์ไฟล์",
  },
  {
    key: "influ",
    label: "Influencer",
    detail: "เข้า Influ Management และหน้าโปรไฟล์ Influencer",
  },
  {
    key: "pricing",
    label: "Product Pricing",
    detail: "เข้าหน้าจัดการราคา (Price List) — หน้าราคาสาธารณะยังเปิดให้ทุกคน",
  },
];

export const ALL_PERMISSIONS: AppPermission[] = PERMISSION_META.map(
  (p) => p.key
);

export type Access = {
  uid: string | null;
  isAdmin: boolean;
  permissions: AppPermission[];
};

/** สิทธิ์การมองเห็นแยกอิสระต่อบัญชี (แบบ Discord) — เช็คจาก permissions รายคนตรงๆ
    ไม่ผูกกับ role: การเป็น admin (จัดการบัญชี/ผู้ตรวจ) เป็นสิทธิ์แยก ไม่เหมาเห็นทุกหน้า */
export function hasPermission(access: Access, perm: AppPermission): boolean {
  return access.permissions.includes(perm);
}
