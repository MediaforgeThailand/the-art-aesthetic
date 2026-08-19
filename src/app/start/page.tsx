import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";

/**
 * ปลายทางแรกของแต่ละคน — เลือกตามสิทธิ์ที่มีจริง
 * (ย้ายมาจากหน้า "/" เดิม ตอนเปลี่ยน root เป็นหน้าประตูรวมช่องทางสาธารณะ 2026-08-19)
 *
 * ใครชี้มาที่นี่บ้าง:
 * - การ์ด "Aesthetics Team" บนหน้าประตู (root `/`)
 * - หน้า /login หลังเข้าสู่ระบบสำเร็จ + proxy ตอนคนล็อกอินแล้วเปิด /login
 *   (เดิมชี้ /dashboard ตายตัว — ทีมที่ไม่มีสิทธิ์ data เจอ "ไม่มีสิทธิ์เข้าถึง" ทุกครั้ง)
 * - ไอคอน PWA บนหน้าจอโฮม (manifest ตั้ง start_url เป็น "/start" — เข้าหน้างานตรงๆ
 *   ไม่ต้องผ่านหน้าประตู และในโหมด standalone ไม่มีแถบ address ให้พิมพ์หนีด้วย)
 */
export default async function StartPage() {
  const access = await getAccess();

  if (access.permissions.includes("data")) redirect("/dashboard");
  // ระดับใดก็ได้ของระบบ Influencer (Admin/Influencer/Viewer) — บอร์ดเคสคือหน้ารวมของระบบ
  if (
    access.permissions.includes("influ") ||
    access.permissions.includes("influ_hunter") ||
    access.permissions.includes("influ_view")
  )
    redirect("/influencers");
  if (access.permissions.includes("team")) redirect("/tasks");
  if (access.permissions.includes("pricing")) redirect("/pricing");
  // admin ที่ยังไม่ได้ติ๊กสิทธิ์มองเห็นให้ตัวเอง — ส่งไปหน้าที่ตัวเองเข้าได้แน่ๆ
  if (access.isAdmin) redirect("/accounts");
  // ผู้ใช้ใหม่ที่ admin ยังไม่เปิดสิทธิ์ให้ — อย่างน้อย My List ใช้ได้ทันทีโดยไม่ต้องรอใคร
  // (เป็นพื้นที่ส่วนตัวของบัญชีนั้นเอง ไม่ใช่ข้อมูลของแผนก)
  redirect("/my-tasks");
}
