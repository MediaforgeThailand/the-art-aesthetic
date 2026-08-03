import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { FileLinkWithCreator } from "@/lib/types";
import { getAccess, hasPermission } from "@/lib/access";
import { AccessNotice } from "@/components/access-notice";
import { FilesClient } from "./files-client";

export const metadata: Metadata = {
  title: "คลังลิงก์ไฟล์",
};

export default async function FilesPage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data, error }] = await Promise.all([
    getAccess(),
    supabase
      .from("file_links")
      .select("*, creator:profiles!file_links_created_by_fkey(full_name, email)")
      .order("created_at", { ascending: false }),
  ]);
  if (!hasPermission(access, "team")) return <AccessNotice />;

  const links = (data ?? []) as unknown as FileLinkWithCreator[];

  return (
    <PageContainer>
      <FilesClient
        links={links}
        userId={userId}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
