import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluCampaignRow, InfluencerRow } from "@/lib/types";
import { ContractsClient } from "./contracts-client";

export const metadata: Metadata = {
  title: "อายุสัญญา Influencer",
};

export default async function InfluContractsPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data: influencers }, { data: campaigns }] =
    await Promise.all([
      getAccess(),
      supabase
        .from("influencers")
        .select("*")
        .not("contract_start", "is", null)
        // ซ่อนข้อมูลเก่าที่นำเข้า (archive-only) — หน้าอายุสัญญาโชว์เฉพาะเคสที่เดินงานในระบบ
        .eq("archived", false)
        .order("contract_start", { ascending: false }),
      supabase
        .from("influ_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
  if (!hasPermission(access, "influ")) return <AccessNotice />;

  return (
    <PageContainer>
      <ContractsClient
        influencers={(influencers ?? []) as InfluencerRow[]}
        campaigns={(campaigns ?? []) as InfluCampaignRow[]}
      />
    </PageContainer>
  );
}
