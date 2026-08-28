import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { PendingApprovalClient } from "./pending-client";

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
  // ระบบ Wellness — ส่งไปหน้าแรกของระบบ แล้วที่นั่นส่งต่อไปหน้างานของบทบาทนั้นเอง
  // (BC → ทะเบียนลูกค้า, Lab → อัพผลแลบ, แพทย์ → คิวตรวจ, Admin/หลายบทบาท → หน้าเลือกงาน)
  if (
    access.permissions.includes("wellness_bc") ||
    access.permissions.includes("wellness_lab") ||
    access.permissions.includes("wellness_admin") ||
    access.permissions.includes("wellness_doctor")
  )
    redirect("/wellness");
  // admin ที่ยังไม่ได้ติ๊กสิทธิ์มองเห็นให้ตัวเอง — ส่งไปหน้าที่ตัวเองเข้าได้แน่ๆ
  if (access.isAdmin) redirect("/accounts");

  // ยังไม่มีสิทธิ์อะไรเลย = บัญชีที่เพิ่งสร้าง (ส่วนใหญ่มาจากเมลบริษัทที่ล็อกอินด้วย Google
  // ตาม migration 0094) — บอกตรงๆ ว่า "รออนุมัติสิทธิ์" ไม่ใช่โยนเข้า My List เงียบๆ
  // ให้เดาเอาเองว่าทำไมไม่มีเมนูอะไรเลย (ผู้ใช้ 2026-08-29)
  if (!access.uid) redirect("/login");
  return <PendingApprovalClient email={access.name ?? ""} />;
}
