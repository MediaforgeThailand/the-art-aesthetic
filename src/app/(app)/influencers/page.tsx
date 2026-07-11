import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluTaskRow } from "@/lib/types";
import { InfluencersClient, type InfluencerListRow } from "./influencers-client";

export const metadata: Metadata = {
  title: "Influ Management",
};

// คอลัมน์ทั้งหมดของ influencers ยกเว้น procedure_history — jsonb เก็บลายเซน base64
// (~10-30KB/รายการ) หน้า list ไม่ได้ใช้ ไม่ต้องส่งลงมาให้หนักเปล่า
const INFLU_LIST_COLUMNS =
  "id, first_name, last_name, nickname, phone, occupation, followers, follower_note, tier, procedure_text, case_value, service_date, doctor_name, photo_path, channel_photo_path, memo_file_path, memo_file_name, memo_uploaded_at, contract_file_path, contract_file_name, contract_uploaded_at, maker_name, stage, completed, contract_start, contract_months, note, size_group, board_position, created_by, created_at, updated_at";

export default async function InfluencersPage() {
  const access = await getAccess();
  if (!hasPermission(access, "influ")) return <AccessNotice />;

  const supabase = await createClient();

  const [{ data: influencers, error }, { data: tasks }] = await Promise.all([
    supabase
      .from("influencers")
      .select(INFLU_LIST_COLUMNS)
      .order("created_at", { ascending: false }),
    // ดึงทั้ง done/ไม่ done — ใช้คำนวณ countdown ครบกำหนด และ "follow แล้วกี่วัน"
    supabase
      .from("influ_tasks")
      .select("influencer_id, due_date, done, done_at"),
  ]);

  return (
    <PageContainer>
      <InfluencersClient
        influencers={(influencers ?? []) as InfluencerListRow[]}
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
