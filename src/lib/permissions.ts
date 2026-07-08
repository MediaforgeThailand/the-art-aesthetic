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
];

export const ALL_PERMISSIONS: AppPermission[] = PERMISSION_META.map(
  (p) => p.key
);

export type Access = {
  uid: string | null;
  isAdmin: boolean;
  permissions: AppPermission[];
};

/** admin เห็นทุกอย่าง; นอกนั้นเช็คตาม permissions รายคน */
export function hasPermission(access: Access, perm: AppPermission): boolean {
  return access.isAdmin || access.permissions.includes(perm);
}
