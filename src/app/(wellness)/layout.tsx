import { redirect } from "next/navigation";
import { SetupNotice } from "@/components/setup-notice";
import { WellnessShell } from "@/components/wellness-shell";
import { getAccess } from "@/lib/access";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { wellnessRoleFlags } from "@/lib/wellness-constants";

/**
 * Layout ของ **ระบบ Wellness** — พื้นที่แยกของตัวเองแบบเดียวกับ `(influ)`
 *
 * ทีมที่ใช้ระบบนี้ (BC / Lab / Admin / แพทย์ wellness) ไม่ได้ทำงานในแอปทีม
 * จึงมีแถบบนของตัวเอง — `(wellness)` เป็น route group URL จริงคือ
 * /wellness, /wellness/[id], /wellness-register, /wellness-lab,
 * /wellness-contact, /wellness-calendar, /wellness-clinic, /wellness-cases
 *
 * เมนูบนแถบนี้ขึ้นกับ **บทบาทที่ติ๊กไว้จริง** ของบัญชี (ดู wellnessWorkspacesFor)
 */
export default async function WellnessLayout({
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

  // ไม่มีปุ่ม "แอปหลัก" และไม่มีกระดิ่งแจ้งเตือนในระบบนี้ (ผู้ใช้ 2026-08-28 —
  // ทีม Wellness ไม่เกี่ยวกับระบบทีม/Influ; ใครมีสิทธิ์แอปอื่นเข้าผ่านหน้าประตู / เอง)
  return (
    <WellnessShell
      userId={access.uid}
      userName={fullName}
      userEmail={email}
      flags={wellnessRoleFlags(access.permissions)}
    >
      {children}
    </WellnessShell>
  );
}
