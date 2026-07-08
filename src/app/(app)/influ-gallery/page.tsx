import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluencerListRow } from "../influencers/influencers-client";
import { InfluGalleryClient } from "./gallery-client";

export const metadata: Metadata = {
  title: "โปรไฟล์ Influencer",
};

// คอลัมน์ทั้งหมดของ influencers ยกเว้น procedure_history — jsonb เก็บลายเซน base64
// (~10-30KB/รายการ) หน้าการ์ดไม่ได้ใช้ ไม่ต้องส่งลงมาให้หนักเปล่า
const INFLU_LIST_COLUMNS =
  "id, first_name, last_name, nickname, phone, occupation, followers, follower_note, tier, procedure_text, case_value, service_date, doctor_name, photo_path, channel_photo_path, memo_file_path, memo_file_name, memo_uploaded_at, contract_file_path, contract_file_name, contract_uploaded_at, maker_name, stage, completed, contract_start, contract_months, note, created_by, created_at, updated_at";

export default async function InfluGalleryPage() {
  const access = await getAccess();
  if (!hasPermission(access, "influ")) return <AccessNotice />;

  const supabase = await createClient();

  const [{ data: influencers, error }, { data: influTasks }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("influencers")
        .select(INFLU_LIST_COLUMNS)
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
        influencers={(influencers ?? []) as InfluencerListRow[]}
        followupRemaining={followupRemaining}
        contentTaskCount={contentTaskCount}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
