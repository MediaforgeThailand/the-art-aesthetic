import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { fetchTaskMedia } from "@/lib/media-query";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";
import { AllMediaClient } from "./all-media-client";

export const metadata: Metadata = {
  title: "All Media",
};

/**
 * คลังไฟล์รวมของงานทั้งระบบ — ดู/ดาวน์โหลดอย่างเดียว (อัพโหลดยังทำผ่านการ์ดงานเหมือนเดิม)
 * ไฟล์มาจาก task_files / task_subtask_files / ไฟล์แนบในแชท (ดู `@/lib/media-query`)
 */
export default async function AllMediaPage() {
  const supabase = await createClient();

  const [access, media, profilesRes, claimsRes] = await Promise.all([
    getAccess(),
    fetchTaskMedia(),
    supabase
      .from("profiles")
      .select("id, full_name, email, avatar_path")
      // ตัวกรอง "เจ้าของไฟล์" เอาเฉพาะคนในทีม (สิทธิ์ team)
      .contains("permissions", ["team"])
      .order("full_name", { ascending: true }),
    supabase.auth.getClaims(),
  ]);
  if (!hasPermission(access, "team")) return <AccessNotice />;

  return (
    <PageContainer>
      <AllMediaClient
        items={media}
        profiles={(profilesRes.data ?? []) as ProfileRow[]}
        userId={claimsRes.data?.claims.sub ?? null}
      />
    </PageContainer>
  );
}
