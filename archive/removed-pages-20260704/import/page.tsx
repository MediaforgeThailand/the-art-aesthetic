import { redirect } from "next/navigation";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ImportClient } from "./import-client";

export const metadata = {
  title: "นำเข้าข้อมูลยอดขาย",
};

export default async function ImportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: imports } = await supabase
    .from("data_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <PageContainer>
      <ImportClient userId={user.id} history={imports ?? []} />
    </PageContainer>
  );
}
