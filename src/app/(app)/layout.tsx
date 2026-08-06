import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();

  // ตรวจ JWT ในเครื่อง (ไม่ยิง network) — ชื่อ/อีเมลอ่านจาก claims ได้เลย
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    redirect("/login");
  }

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name : "";
  const email = typeof claims.email === "string" ? claims.email : "";

  return (
    // มือถือ: topbar อยู่บน (Sidebar render เป็น topbar + drawer) / จอใหญ่: sidebar ซ้าย
    // h-dvh กันแถบ address bar มือถือกินความสูง (100vh เพี้ยนบน iOS/Android)
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      <Sidebar userName={fullName} userEmail={email} />
      {/* แต่ละหน้าคุม scroll เอง — หน้าปกติครอบด้วย PageContainer, หน้าบอร์ด (/tasks) เป็น full-bleed
          pb-nav บนมือถือ = หลบแถบเมนูล่าง (3.5rem + safe area) ให้ครบทุกหน้าพร้อมกัน
          ใส่ที่ main ไม่ใช่ที่ PageContainer เพราะ /tasks จัดเลย์เอาต์เองไม่ได้ใช้ PageContainer */}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden pb-nav lg:pb-0">
        {children}
      </main>
    </div>
  );
}
