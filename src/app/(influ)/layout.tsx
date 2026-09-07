import { redirect } from "next/navigation";
import { InfluShell } from "@/influ/components/influ-shell";
import { SetupNotice } from "@/components/setup-notice";
import {
  canManageInflu,
  canViewInflu,
  getAccess,
  hasPermission,
  INFLU_LEVELS,
  influLevel,
} from "@/lib/access";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout ของ **ระบบ Influencer** — คนละโครงกับแอปทีม `(app)`
 *
 * ทีมอื่นเข้ามาใช้ระบบนี้ด้วย จึงแยกออกมาเป็นพื้นที่ของตัวเอง (แถบบนของตัวเอง ไม่มีเมนูของทีม)
 * `(influ)` เป็น route group → **URL ทุกหน้ายังเป็นของเดิมเป๊ะ** (/influencers, /influ-calendar, ...)
 * ลิงก์/บุ๊กมาร์ก/router.push ที่มีอยู่ทั่วระบบจึงไม่ต้องแก้เลย
 */
export default async function InfluLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();

  // ตรวจ JWT ในเครื่อง (ไม่ยิง network) + อ่านสิทธิ์ขนานกัน
  const [{ data }, access] = await Promise.all([
    supabase.auth.getClaims(),
    getAccess(),
  ]);
  const claims = data?.claims;

  if (!claims) {
    redirect("/login");
  }

  const meta_ = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta_.full_name === "string" ? meta_.full_name : "";
  const email = typeof claims.email === "string" ? claims.email : "";

  const level = influLevel(access);
  const levelMeta = level === "none" ? null : INFLU_LEVELS[level];

  // ปุ่ม "แอปหลัก" — ปลายทางเดียวกับหน้าแรก (src/app/page.tsx) เพื่อไม่พาไปหน้าที่ไม่มีสิทธิ์
  // ทุกบัญชีมี /my-tasks เสมอ จึงไม่มีทางเป็นทางตัน แม้จะมีแค่สิทธิ์ระบบ Influencer
  const backHref = access.permissions.includes("data")
    ? "/dashboard"
    : access.permissions.includes("team")
      ? "/tasks"
      : access.permissions.includes("pricing")
        ? "/pricing"
        : access.isAdmin
          ? "/accounts"
          : "/my-tasks";

  return (
    <InfluShell
      userId={access.uid}
      userName={fullName}
      userEmail={email}
      levelLabel={levelMeta?.short ?? null}
      levelBadge={levelMeta?.badge ?? null}
      canView={canViewInflu(access)}
      canManage={canManageInflu(access)}
      // โปรไฟล์ Influencer เปิดให้ทีม (สิทธิ์ team) ดูได้ด้วย แม้ไม่มีระดับในระบบนี้
      canGallery={hasPermission(access, "team") || canViewInflu(access)}
      backHref={backHref}
    >
      {children}
    </InfluShell>
  );
}
