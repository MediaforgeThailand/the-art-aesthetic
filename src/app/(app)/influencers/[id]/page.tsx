import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type {
  InfluencerRow,
  InfluFollowupRow,
  InfluSignatureRow,
  InfluTaskRow,
  TaskWithAssignee,
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

  const access = await getAccess();
  if (!hasPermission(access, "influ")) return <AccessNotice />;

  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  const [
    { data: influencer },
    { data: followups },
    { data: signatures },
    { data: tasks },
    { data: contentTasks },
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
    // งานคอนเทนต์ (จากหน้า "งาน") ที่ผูกกับ influencer คนนี้
    supabase
      .from("tasks")
      .select(
        "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email), files:task_files(id, task_id, file_path, file_name, created_at)"
      )
      .eq("influencer_id", id)
      .order("created_at", { ascending: false }),
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
        contentTasks={(contentTasks ?? []) as unknown as TaskWithAssignee[]}
        userName={profile?.full_name || profile?.email || ""}
      />
    </PageContainer>
  );
}
