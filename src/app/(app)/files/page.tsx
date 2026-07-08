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
  const access = await getAccess();
  if (!hasPermission(access, "team")) return <AccessNotice />;

  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  const { data, error } = await supabase
    .from("file_links")
    .select("*, creator:profiles!file_links_created_by_fkey(full_name, email)")
    .order("created_at", { ascending: false });

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
