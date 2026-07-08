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
  const access = await getAccess();
  if (!hasPermission(access, "influ")) return <AccessNotice />;

  const supabase = await createClient();

  const [{ data: influencers }, { data: campaigns }] = await Promise.all([
    supabase
      .from("influencers")
      .select("*")
      .not("contract_start", "is", null)
      .order("contract_start", { ascending: false }),
    supabase
      .from("influ_campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <PageContainer>
      <ContractsClient
        influencers={(influencers ?? []) as InfluencerRow[]}
        campaigns={(campaigns ?? []) as InfluCampaignRow[]}
      />
    </PageContainer>
  );
}
