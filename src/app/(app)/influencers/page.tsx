import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { InfluencerRow, InfluTaskRow } from "@/lib/types";
import { InfluencersClient } from "./influencers-client";

export const metadata: Metadata = {
  title: "Influ Management",
};

export default async function InfluencersPage() {
  const supabase = await createClient();

  const [{ data: influencers, error }, { data: tasks }] = await Promise.all([
    supabase
      .from("influencers")
      .select("*")
      .order("created_at", { ascending: false }),
    // ดึงทั้ง done/ไม่ done — ใช้คำนวณ countdown ครบกำหนด และ "follow แล้วกี่วัน"
    supabase
      .from("influ_tasks")
      .select("influencer_id, due_date, done, done_at"),
  ]);

  return (
    <PageContainer>
      <InfluencersClient
        influencers={(influencers ?? []) as InfluencerRow[]}
        tasks={
          (tasks ?? []) as Pick<
            InfluTaskRow,
            "influencer_id" | "due_date" | "done" | "done_at"
          >[]
        }
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
