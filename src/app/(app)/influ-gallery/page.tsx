import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { InfluencerRow } from "@/lib/types";
import { InfluGalleryClient } from "./gallery-client";

export const metadata: Metadata = {
  title: "โปรไฟล์ Influencer",
};

export default async function InfluGalleryPage() {
  const supabase = await createClient();

  const [{ data: influencers, error }, { data: influTasks }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("influencers")
        .select("*")
        .order("created_at", { ascending: false }),
      // follow-up checklist ที่ยังไม่ทำ (stage 6)
      supabase.from("influ_tasks").select("influencer_id, done"),
      // งานคอนเทนต์ที่ผูกกับ influencer
      supabase
        .from("tasks")
        .select("influencer_id")
        .not("influencer_id", "is", null),
    ]);

  // นับ follow-up ที่เหลือ + จำนวนงานคอนเทนต์ ต่อ influencer
  const followupRemaining: Record<string, number> = {};
  for (const t of (influTasks ?? []) as {
    influencer_id: string;
    done: boolean;
  }[]) {
    if (!t.done)
      followupRemaining[t.influencer_id] =
        (followupRemaining[t.influencer_id] ?? 0) + 1;
  }
  const contentTaskCount: Record<string, number> = {};
  for (const t of (tasks ?? []) as { influencer_id: string }[]) {
    contentTaskCount[t.influencer_id] =
      (contentTaskCount[t.influencer_id] ?? 0) + 1;
  }

  return (
    <PageContainer>
      <InfluGalleryClient
        influencers={(influencers ?? []) as InfluencerRow[]}
        followupRemaining={followupRemaining}
        contentTaskCount={contentTaskCount}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
