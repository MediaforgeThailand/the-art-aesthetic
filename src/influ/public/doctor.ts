/**
 * ทะเบียนหมอ — ส่วนที่ "ฝั่ง Team" ใช้ได้จากระบบ Influencer
 *
 * - `DoctorAvatar` : รูป/ตัวย่อชื่อหมอ ใช้ในตัวเลือกแท็กหมอของ /tasks
 * - `DoctorManagerPanel` : ตัวจัดการทะเบียนหมอทั้งชุด — หน้า /tag-management ของทีมคอนเทนต์
 *   ฝังไว้ให้เพิ่ม/แก้หมอทีม aesthetics ได้จากหน้านั้น (ทะเบียนมีที่เดียวใน DB คือตาราง `doctors`)
 * - `InfluLogActor` : ชื่อผู้ทำ ที่ DoctorManagerPanel ใช้เขียน log ของระบบ Influencer
 *
 * ทางเข้าเดียวจากนอกโมดูล Influ (กฎ ESLint `no-restricted-imports`) — ดู src/influ/README.md
 */
export { DoctorAvatar } from "@/app/(influ)/influencers/doctor-select";
export { DoctorManagerPanel } from "@/app/(influ)/influencers/doctor-manager";
export type { InfluLogActor } from "@/influ/lib/influ-log";
