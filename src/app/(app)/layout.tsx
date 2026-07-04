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
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={fullName} userEmail={email} />
      {/* แต่ละหน้าคุม scroll เอง — หน้าปกติครอบด้วย PageContainer, หน้าบอร์ด (/tasks) เป็น full-bleed */}
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
