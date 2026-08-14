import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canViewInflu, getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluLinkLite } from "../influencers/influ-links";
import type { InfluencerListRow } from "../influencers/influencers-client";
import { InfluGalleryClient } from "./gallery-client";

export const metadata: Metadata = {
  title: "โปรไฟล์ Influencer",
};

// คอลัมน์ทั้งหมดของ influencers ยกเว้น procedure_history — jsonb เก็บลายเซน base64
// (~10-30KB/รายการ) หน้าการ์ดไม่ได้ใช้ ไม่ต้องส่งลงมาให้หนักเปล่า
const INFLU_LIST_COLUMNS =
  "id, first_name, last_name, nickname, phone, occupation, followers, follower_note, tier, procedure_text, case_value, service_date, doctor_name, photo_path, channel_photo_path, memo_file_path, memo_file_name, memo_uploaded_at, contract_file_path, contract_file_name, contract_uploaded_at, maker_name, stage, completed, contract_start, contract_months, note, followup_mode, package_note, size_group, board_position, archived, declined_at, created_by, created_at, updated_at";

export default async function InfluGalleryPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    access,
    { data: influencers, error },
    { data: influTasks },
    { data: tasks },
    { data: links },
  ] = await Promise.all([
    getAccess(),
    supabase
      .from("influencers")
      .select(INFLU_LIST_COLUMNS)
      .order("created_at", { ascending: false }),
    // follow-up checklist ที่ยังไม่ทำ (stage 6) — is_custom ใช้ตัดข้อของโหมดที่เคสนั้นไม่ได้ใช้
    supabase.from("influ_tasks").select("influencer_id, done, is_custom"),
    // งานคอนเทนต์ที่ผูกกับ influencer (ไม่นับงานในถังขยะ)
    supabase
      .from("tasks")
      .select("influencer_id")
      .not("influencer_id", "is", null)
      .is("deleted_at", null),
    // ลิงก์ไฟล์ source (Google Drive) — ปุ่มเปิดเร็วบนการ์ดโปรไฟล์
    supabase
      .from("influ_links")
      .select("id, influencer_id, title, url")
      .order("position", { ascending: true }),
  ]);

  // โปรไฟล์ Influencer เห็นได้ทั้งทีมและทุกระดับของระบบ Influencer
  if (!hasPermission(access, "team") && !canViewInflu(access))
    return <AccessNotice />;

  // นับ follow-up ที่เหลือ + จำนวนงานคอนเทนต์ ต่อ influencer
  // ข้ามข้อของโหมดที่เคสนั้นไม่ได้ใช้ (ซ่อนอยู่ใน DB แต่ไม่ใช่งานค้างของเขา)
  const modeById = new Map(
    ((influencers ?? []) as InfluencerListRow[]).map((i) => [
      i.id,
      i.followup_mode,
    ])
  );
  const followupRemaining: Record<string, number> = {};
  for (const t of (influTasks ?? []) as {
    influencer_id: string;
    done: boolean;
    is_custom: boolean;
  }[]) {
    if (t.done) continue;
    if (t.is_custom !== (modeById.get(t.influencer_id) === "custom")) continue;
    followupRemaining[t.influencer_id] =
      (followupRemaining[t.influencer_id] ?? 0) + 1;
  }
  const contentTaskCount: Record<string, number> = {};
  for (const t of (tasks ?? []) as { influencer_id: string }[]) {
    contentTaskCount[t.influencer_id] =
      (contentTaskCount[t.influencer_id] ?? 0) + 1;
  }
  // ลิงก์ไฟล์ source จัดกลุ่มตาม influencer
  const sourceLinks: Record<string, InfluLinkLite[]> = {};
  for (const l of (links ?? []) as InfluLinkLite[]) {
    (sourceLinks[l.influencer_id] ??= []).push(l);
  }

  return (
    <PageContainer>
      <InfluGalleryClient
        influencers={(influencers ?? []) as InfluencerListRow[]}
        followupRemaining={followupRemaining}
        contentTaskCount={contentTaskCount}
        sourceLinks={sourceLinks}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
