import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import {
  canEditInflu,
  canManageInflu,
  canViewInflu,
  getAccess,
  influLevel,
} from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type {
  DoctorRow,
  InfluProfileRow,
  InfluServiceRow,
  InfluTaskRow,
} from "@/lib/types";
import type { InfluLinkLite } from "./influ-links";
import { InfluencersClient, type InfluencerListRow } from "./influencers-client";
import type { PriceCatalogEntry } from "./procedure-items-editor";

export const metadata: Metadata = {
  title: "Influ Management",
};

// คอลัมน์ทั้งหมดของ influencers ยกเว้น procedure_history — jsonb เก็บลายเซน base64
// (~10-30KB/รายการ) หน้า list ไม่ได้ใช้ ไม่ต้องส่งลงมาให้หนักเปล่า
const INFLU_LIST_COLUMNS =
  "id, person_id, round_no, first_name, last_name, nickname, phone, occupation, followers, follower_note, tier, procedure_text, case_value, service_date, doctor_name, photo_path, channel_photo_path, memo_file_path, memo_file_name, memo_uploaded_at, memo_ready_at, docs_sent_at, contract_file_path, contract_file_name, contract_uploaded_at, maker_name, stage, completed, contract_start, contract_months, note, followup_mode, package_note, size_group, board_position, archived, declined_at, influ_code, owner_id, created_by, created_at, updated_at";

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
    { data: priceCatalog },
    { data: profiles },
    { data: influProfiles },
    { data: services },
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
      // ตัวเลือกหัตถการจาก Price List กลาง — ต้องเลือกตั้งแต่ตอนสร้างการ์ด
      supabase
        .from("price_items")
        .select("id, name, price_normal, promos, search_aliases")
        .eq("active", true)
        .order("name", { ascending: true }),
      // ชื่อผู้รับผิดชอบ (owner_id) — แสดงบนการ์ด + ตัวกรอง "เคสของฉัน"
      supabase.from("profiles").select("id, full_name, email"),
      // โปรไฟล์ตัวบุคคล (0080) — ตัวเลือกตอน "สร้างนัดใหม่"
      supabase
        .from("influ_profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      // เมนูหัตถการที่ทีมเพิ่มเอง แยก product team (aesthetics ใช้ price_items เป็นหลัก)
      supabase
        .from("influ_services")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true }),
    ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  const me = (profiles ?? []).find((p) => p.id === access.uid);

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
        priceCatalog={(priceCatalog ?? []) as PriceCatalogEntry[]}
        profiles={(influProfiles ?? []) as InfluProfileRow[]}
        services={(services ?? []) as InfluServiceRow[]}
        people={
          (profiles ?? []).map((p) => ({
            id: p.id,
            name: p.full_name || p.email || "ไม่ทราบชื่อ",
          })) as { id: string; name: string }[]
        }
        me={{
          id: access.uid,
          name: me?.full_name || me?.email || "",
          level: influLevel(access),
          canEdit: canEditInflu(access),
          canManage: canManageInflu(access),
        }}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
