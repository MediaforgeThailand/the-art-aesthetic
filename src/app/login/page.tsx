import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import LoginClient from "./login-client";

/**
 * หน้าเข้าสู่ระบบ — server component บางๆ ที่ทำ 2 อย่างให้ฟอร์มฝั่ง client
 *
 * 1. อ่าน `?error=` ที่ `/auth/callback` (Google SSO) เด้งกลับมา
 *    ทำไมต้องอ่านฝั่ง server: ถ้าให้ client ไปอ่าน `window.location.search` เอง HTML ที่
 *    prerender ไว้จะไม่มีกล่องข้อความ แต่ render แรกฝั่ง client มี → hydration ไม่ตรงกัน
 *    (ส่วน useSearchParams ก็บังคับให้ต้องมี Suspense boundary ครอบ ทำให้หน้าโล่งชั่วครู่)
 * 2. เช็คว่าเปิด Google ไว้ที่ Supabase หรือยัง — ดู `googleEnabled()`
 *
 * การใช้ searchParams ทำให้หน้านี้ถูก render ต่อคำขอ — ไม่กระทบอะไร เพราะ proxy
 * ก็ทำงานทุกคำขออยู่แล้ว และหน้านี้เปิดกันไม่บ่อย
 */

/**
 * ถาม Supabase ว่าเปิด provider `google` ไว้หรือยัง (endpoint สาธารณะของ GoTrue)
 *
 * มีไว้เพื่อ **ไม่โชว์ปุ่มที่กดแล้วตาย**: ถ้ายังไม่ได้เปิด provider การกดปุ่มจะพาไปเจอ
 * JSON ดิบ `{"msg":"Unsupported provider: provider is not enabled"}` บนโดเมน supabase.co
 * (endpoint /authorize ตอบ 400 ตรงๆ ไม่ได้ redirect กลับมาให้เราแปลงเป็นข้อความไทย)
 * ผลพลอยได้: วันที่ผู้ดูแลเปิด Google ที่ Dashboard ปุ่มจะโผล่เอง ไม่ต้อง deploy ใหม่
 *
 * ต่อไม่ติด/ตอบไม่ใช่ ok = ถือว่ายังไม่เปิด แล้วเหลือทางเข้าด้วยอีเมล+รหัสผ่านตามเดิม
 */
async function googleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      // cache สั้นๆ พอไม่ให้ยิงทุกครั้งที่มีคนเปิดหน้า login แต่ยังสั้นพอที่วันเปิด/ปิด
      // provider ที่ Dashboard แล้วปุ่มจะขึ้น-ลงตามภายในนาทีเดียว (ไม่ต้องรอ/ไม่ต้อง deploy)
      next: { revalidate: 60 },
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, google] = await Promise.all([searchParams, googleEnabled()]);
  return <LoginClient initialError={error ?? null} googleEnabled={google} />;
}
