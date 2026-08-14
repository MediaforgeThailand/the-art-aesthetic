import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { DoctorRow, InfluTaskRow } from "@/lib/types";
import type { InfluLinkLite } from "./influ-links";
import { InfluencersClient, type InfluencerListRow } from "./influencers-client";

export const metadata: Metadata = {
  title: "Influ Management",
};

// คอลัมน์ทั้งหมดของ influencers ยกเว้น procedure_history — jsonb เก็บลายเซน base64
// (~10-30KB/รายการ) หน้า list ไม่ได้ใช้ ไม่ต้องส่งลงมาให้หนักเปล่า
const INFLU_LIST_COLUMNS =
  "id, person_id, round_no, first_name, last_name, nickname, phone, occupation, followers, follower_note, tier, procedure_text, case_value, service_date, doctor_name, photo_path, channel_photo_path, memo_file_path, memo_file_name, memo_uploaded_at, memo_ready_at, docs_sent_at, contract_file_path, contract_file_name, contract_uploaded_at, maker_name, stage, completed, contract_start, contract_months, note, followup_mode, package_note, size_group, board_position, archived, declined_at, created_by, created_at, updated_at";

export default async function InfluencersPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    access,
    { data: influencers, error },
    { data: tasks },
    { data: doctors },
    { data: sourceLinks },
    { data: serviceBookings },
  ] = await Promise.all([
      getAccess(),
      supabase
        .from("influencers")
        .select(INFLU_LIST_COLUMNS)
        // ซ่อนข้อมูลเก่าที่นำเข้า (archive-only) — โผล่เฉพาะหน้าโปรไฟล์ Influencer
        .eq("archived", false)
        .order("created_at", { ascending: false }),
      // ดึงทั้ง done/ไม่ done — ใช้คำนวณ countdown ครบกำหนด และ "follow แล้วกี่วัน"
      // is_custom: ข้อของโหมดที่เคสนั้นไม่ได้ใช้ต้องไม่ถูกนับ (กรองด้วย activeFollowupTasks ฝั่ง client)
      supabase
        .from("influ_tasks")
        .select("influencer_id, due_date, done, done_at, is_custom"),
      // ทะเบียนแพทย์ — ตัวเลือก "แพทย์ที่รับเคส" + โมดัลจัดการหมอ
      supabase.from("doctors").select("*").order("name", { ascending: true }),
      // ลิงก์ไฟล์ source (Google Drive) — ปุ่มเปิดเร็วบนการ์ด
      supabase
        .from("influ_links")
        .select("id, influencer_id, title, url")
        .order("position", { ascending: true }),
      // คิว "เข้ารับบริการ" ที่ลงในปฏิทินแล้ว = หลักฐานว่านัดหมอเรียบร้อย
      // (influ manager ลงคิวฝั่งนี้ต่อจากคิวฝั่งระบบโรงพยาบาล) — ใช้ติดป้ายเตือนบนการ์ด
      supabase
        .from("influ_calendar_events")
        .select("influencer_id")
        .eq("kind", "service")
        .not("influencer_id", "is", null),
    ]);
  if (!hasPermission(access, "influ")) return <AccessNotice />;

  return (
    <PageContainer>
      <InfluencersClient
        influencers={(influencers ?? []) as InfluencerListRow[]}
        tasks={
          (tasks ?? []) as Pick<
            InfluTaskRow,
            "influencer_id" | "due_date" | "done" | "done_at" | "is_custom"
          >[]
        }
        doctors={(doctors ?? []) as DoctorRow[]}
        sourceLinks={(sourceLinks ?? []) as InfluLinkLite[]}
        bookedInfluIds={
          (serviceBookings ?? [])
            .map((b) => b.influencer_id)
            .filter((id): id is string => id !== null)
        }
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
