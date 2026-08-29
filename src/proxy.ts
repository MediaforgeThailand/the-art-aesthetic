import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export default async function proxy(request: NextRequest) {
  // หน้า Price List สาธารณะ — เปิดดูได้โดยไม่ต้องล็อกอิน (แชร์ให้ลูกค้า/ทีมภายนอก)
  // "/" = หน้าประตูรวมช่องทาง สาธารณะเหมือนกัน (ทุกคนเปิดโดเมนหลักแล้วเจอหน้านี้ก่อน
  // — โชว์แค่ชื่อระบบ ไม่มีข้อมูลภายใน; ระบบข้างในยังบังคับล็อกอินของตัวเองตามเดิม)
  // /api/warm = endpoint อุ่นเครื่องที่ pg_cron ยิง ไม่มี session ต้องปล่อยผ่านเหมือนกัน
  if (
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname === "/price-list" ||
    request.nextUrl.pathname === "/api/warm" ||
    // PWA: เบราว์เซอร์ดึง manifest แบบไม่ส่ง cookie — ไม่ปล่อยผ่านจะโดนเด้งไป /login
    // แล้วติดตั้งลงหน้าจอโฮมไม่ได้ (matcher ข้างล่างยกเว้นแค่นามสกุลรูป ไม่ครอบคลุมอันนี้)
    request.nextUrl.pathname === "/manifest.webmanifest" ||
    // service worker ของ Web Push — เบราว์เซอร์ดึงไฟล์นี้เองนอกบริบทหน้าเว็บ
    // (และดึงซ้ำเป็นระยะเพื่อเช็คเวอร์ชัน) ไม่ปล่อยผ่าน = โดนเด้งไป /login แล้ว
    // register ล้มเหลว → แจ้งเตือนไม่เด้งทั้งระบบ
    request.nextUrl.pathname === "/sw.js" ||
    // ปลายทางที่ Supabase ส่งกลับหลังยืนยันตัวตนกับ Google — ตอนถูกเรียกยังไม่มี session
    // (route handler เป็นคนแลก code เป็นคุกกี้เอง) ไม่ปล่อยผ่าน = เด้งกลับ /login วนไม่จบ
    request.nextUrl.pathname === "/auth/callback"
  ) {
    return NextResponse.next({ request });
  }
  // ยังไม่ได้ตั้งค่า Supabase — ปล่อยผ่านเพื่อให้หน้า setup แสดงได้
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims ตรวจ JWT ในเครื่อง (เร็วกว่า getUser ที่ยิง network ทุกครั้ง)
  // และจะ refresh token ให้อัตโนมัติเมื่อหมดอายุ
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";

  // redirect ต้องพกคุกกี้ที่เพิ่ง refresh มาด้วย — ไม่งั้น refresh token ที่ถูก rotate
  // หายไปกับ response เดิม แล้ว request ถัดไปใช้ token เก่าโดน revoke ทั้ง session
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!claims && !isLoginPage) {
    return redirectTo("/login");
  }

  if (claims && isLoginPage) {
    // /start เลือกหน้าแรกตามสิทธิ์ — ชี้ /dashboard ตายตัวไม่ได้ เพราะทีมที่ไม่มีสิทธิ์
    // data จะเจอ "ไม่มีสิทธิ์เข้าถึง" ทันทีที่ล็อกอิน
    return redirectTo("/start");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * ทุก path ยกเว้น static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
