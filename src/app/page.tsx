import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";

/**
 * ปลายทางแรกของแต่ละคน — เลือกตามสิทธิ์ที่มีจริง
 * ของเดิมส่งเข้า /dashboard ตายตัว ทีมที่มีแค่สิทธิ์ influ/team จึงเจอ "ไม่มีสิทธิ์เข้าถึง"
 * ทุกครั้งที่เปิดแอป — และในโหมด PWA standalone ไม่มีแถบ address ให้พิมพ์หนีไปหน้าอื่นด้วย
 * (manifest ตั้ง start_url เป็น "/" จึงวิ่งผ่านที่นี่เสมอตอนกดไอคอนบนหน้าจอโฮม)
 */
export default async function Home() {
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
