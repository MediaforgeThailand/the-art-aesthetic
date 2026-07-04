import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type {
  InfluencerRow,
  InfluFollowupRow,
  InfluSignatureRow,
  InfluTaskRow,
} from "@/lib/types";
import { InfluDetailClient } from "./detail-client";

export const metadata: Metadata = {
  title: "รายละเอียด Influencer",
};

export default async function InfluencerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  const [
    { data: influencer },
    { data: followups },
    { data: signatures },
    { data: tasks },
    { data: profile },
  ] = await Promise.all([
    supabase.from("influencers").select("*").eq("id", id).single(),
    supabase
      .from("influ_followups")
      .select("*")
      .eq("influencer_id", id)
      .order("round", { ascending: true }),
    supabase.from("influ_signatures").select("*").eq("influencer_id", id),
    supabase
      .from("influ_tasks")
      .select("*")
      .eq("influencer_id", id)
      .order("step", { ascending: true }),
    userId
      ? supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  if (!influencer) notFound();

  return (
    <PageContainer>
      <InfluDetailClient
        influencer={influencer as InfluencerRow}
        followups={(followups ?? []) as InfluFollowupRow[]}
        signatures={(signatures ?? []) as InfluSignatureRow[]}
        tasks={(tasks ?? []) as InfluTaskRow[]}
        userName={profile?.full_name || profile?.email || ""}
      />
    </PageContainer>
  );
}
