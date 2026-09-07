import { ShieldAlert } from "lucide-react";
import { EmptyState, PageContainer, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AccountsClient } from "./accounts-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const uid = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  // เช็คสิทธิ์ + โหลดรายชื่อพร้อมกัน (หน้าโชว์เฉพาะ admin)
  const [{ data: me }, { data: profiles }] = await Promise.all([
    uid
      ? supabase.from("profiles").select("role").eq("id", uid).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("profiles")
      .select("id, email, full_name, role, permissions, created_at")
      .order("created_at", { ascending: true }),
  ]);

  if (me?.role !== "admin") {
    return (
      <PageContainer>
        <PageHeader
          title="จัดการบัญชีผู้ใช้"
        />
        <EmptyState
          icon={<ShieldAlert size={40} />}
          title="เฉพาะผู้ดูแลระบบเท่านั้น"
          description="บัญชีของคุณไม่มีสิทธิ์จัดการบัญชีผู้ใช้ — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์นี้"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <AccountsClient myId={uid!} initialProfiles={profiles ?? []} />
    </PageContainer>
  );
}
