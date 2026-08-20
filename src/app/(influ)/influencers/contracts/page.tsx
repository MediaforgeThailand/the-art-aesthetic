import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canEditInflu, canViewInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type {
  InfluCampaignRow,
  InfluencerRow,
  InfluPostLinkRow,
  InfluTaskRow,
} from "@/lib/types";
import { ContractsClient, type ProfileLite } from "./contracts-client";

export const metadata: Metadata = {
  title: "สัญญา & ติดตามผลงาน Influencer",
};

export default async function ContractsPage() {
  const supabase = await createClient();

  // ยิงขนานรวม getAccess ตามแพตเทิร์น perf — เช็คสิทธิ์หลัง await (RLS กันข้อมูลอยู่แล้ว)
  const [
    access,
    { data: influencers },
    { data: campaigns },
    { data: postLinks },
    { data: photoTasks },
    { data: profiles },
  ] = await Promise.all([
    getAccess(),
    // เฉพาะเคสที่เริ่มนับสัญญาแล้ว; archived (ข้อมูลเก่านำเข้า) ไม่ขึ้นหน้านี้ตามกติกา 0043
    supabase
      .from("influencers")
      .select("*")
      .not("contract_start", "is", null)
      .eq("archived", false)
      .order("contract_start", { ascending: false }),
    supabase
      .from("influ_campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("influ_post_links")
      .select("*")
      .order("position", { ascending: true }),
    // เช็คพอยต์รูปติดตามผล = งาน checklist มาตรฐานหมวด 4 (7 งวดตามเอกสารแนบท้ายสัญญา)
    supabase
      .from("influ_tasks")
      .select("*")
      .eq("is_custom", false)
      .like("section", "4.%")
      .order("step", { ascending: true }),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  if (!canViewInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <ContractsClient
        influencers={(influencers ?? []) as InfluencerRow[]}
        campaigns={(campaigns ?? []) as InfluCampaignRow[]}
        postLinks={(postLinks ?? []) as InfluPostLinkRow[]}
        photoTasks={(photoTasks ?? []) as InfluTaskRow[]}
        profiles={(profiles ?? []) as ProfileLite[]}
        canEdit={canEditInflu(access)}
        actor={{ id: access.uid, name: access.name }}
      />
    </PageContainer>
  );
}
