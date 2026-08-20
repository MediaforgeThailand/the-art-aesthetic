import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * ปลายทางที่ Supabase ส่งกลับมาหลังผู้ใช้ยืนยันตัวตนกับ Google (SSO)
 *
 * เส้นทางเต็ม: กดปุ่มที่ /login → Google → `<supabase>/auth/v1/callback` → หน้านี้พร้อม `?code=`
 * → แลก code เป็น session (PKCE) แล้วเขียนคุกกี้ → เด้งเข้าหน้าแรกตามสิทธิ์ที่ /start
 *
 * **ต้องอยู่ใน allowlist ของ `src/proxy.ts`** เพราะตอนถูกเรียกยังไม่มี session
 * ถ้าไม่ปล่อยผ่าน proxy จะเด้งกลับ /login ทิ้ง code ไปเฉยๆ แล้วล็อกอินด้วย Google ไม่มีวันสำเร็จ
 *
 * กติกาการอนุญาต **ไม่ได้เปลี่ยน** — Google เป็นแค่วิธียืนยันตัวตน คนที่อีเมลไม่อยู่ใน
 * `allowed_emails` ยังถูก trigger `handle_new_user` ปฏิเสธเหมือนเดิม (ดู migration 0056)
 * แต่ GoTrue ห่อ error ของ DB เป็นข้อความกลางๆ "Database error saving new user" —
 * เราจึงแปลงกลับเป็นข้อความไทยที่บอกทางออกจริงให้ผู้ใช้ (ดู `errorCodeFor`)
 */

// อย่าให้ Next ทำหน้านี้เป็น static — ต้องอ่าน query + เขียนคุกกี้ทุกครั้ง
export const dynamic = "force-dynamic";

/**
 * ปลายทางหลังล็อกอินสำเร็จ — รับเฉพาะ path ในแอป กัน open redirect ผ่าน `?next=`
 * ต้องขึ้นต้นด้วย "/" ตัวเดียวจริงๆ: "//evil.com" เป็น URL แบบ protocol-relative และ
 * "/\evil.com" ก็โดนเบราว์เซอร์แปลง backslash เป็น slash แล้วกลายเป็นข้ามโดเมนเหมือนกัน
 */
function safeNext(raw: string | null): string {
  if (!raw || raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return "/start";
  return raw;
}

/**
 * origin จริงที่ผู้ใช้เห็นบนแถบ address — บน Vercel คำขอผ่าน load balancer มาก่อน
 * `request.url` จึงอาจเป็นโดเมนภายในของ deployment ไม่ใช่ theartbb.com ที่ผู้ใช้เปิดอยู่
 */
function baseUrl(request: Request, origin: string): string {
  if (process.env.NODE_ENV === "development") return origin;
  const forwardedHost = request.headers.get("x-forwarded-host");
  return forwardedHost ? `https://${forwardedHost}` : origin;
}

/** แปลง error ดิบจาก Supabase/Google เป็นคีย์ที่หน้า /login รู้จัก (ข้อความไทยอยู่ที่นั่น) */
function errorCodeFor(description: string | null): string {
  const desc = (description ?? "").toLowerCase();
  // trigger handle_new_user โยน exception เมื่ออีเมลไม่อยู่ใน allowed_emails —
  // GoTrue กลืนข้อความจริงทิ้ง แล้วส่งกลับมาเป็น "Database error saving new user" เสมอ
  if (desc.includes("database error")) return "not_allowed";
  // ยังไม่ได้เปิด provider Google ที่ Supabase (ตั้งค่าไม่ครบ — เป็นเรื่องของผู้ดูแลระบบ)
  if (desc.includes("not enabled") || desc.includes("unsupported provider")) {
    return "provider_disabled";
  }
  return "oauth_failed";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const base = baseUrl(request, origin);
  const backToLogin = (reason: string) =>
    NextResponse.redirect(`${base}/login?error=${reason}`);

  // Google/Supabase ตีกลับมาพร้อม error — ไม่มี code ให้แลก
  const error = searchParams.get("error");
  if (error) {
    // ผู้ใช้กดยกเลิก/ไม่อนุญาตที่หน้า Google — ไม่ใช่ความผิดพลาด ไม่ต้องขึ้นข้อความแดงตกใจ
    if (error === "access_denied") return backToLogin("cancelled");
    return backToLogin(errorCodeFor(searchParams.get("error_description")));
  }

  const code = searchParams.get("code");
  if (!code) return backToLogin("oauth_failed");

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return backToLogin(errorCodeFor(exchangeError.message));
  }

  return NextResponse.redirect(`${base}${safeNext(searchParams.get("next"))}`);
}
