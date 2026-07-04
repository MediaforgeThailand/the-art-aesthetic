import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export default async function proxy(request: NextRequest) {
  // หน้า Price List สาธารณะ — เปิดดูได้โดยไม่ต้องล็อกอิน (แชร์ให้ลูกค้า/ทีมภายนอก)
  if (request.nextUrl.pathname === "/price-list") {
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

  if (!claims && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (claims && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
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
