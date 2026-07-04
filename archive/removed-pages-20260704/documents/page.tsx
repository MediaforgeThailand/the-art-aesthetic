import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { DocumentsClient } from "./documents-client";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: documents, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`โหลดข้อมูลเอกสารไม่สำเร็จ: ${error.message}`);
  }

  return (
    <PageContainer>
      <DocumentsClient documents={documents ?? []} userId={user?.id ?? ""} />
    </PageContainer>
  );
}
