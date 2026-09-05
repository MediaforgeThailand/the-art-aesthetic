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
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type {
  DoctorRow,
  InfluCampaignDefRow,
  InfluProfileRow,
  InfluServiceRow,
} from "@/lib/types";
import type { InfluTaskLite } from "./influ-board";
import type { InfluLinkLite } from "./influ-links";
import type { InfluPerson } from "./assignees";
import {
  type CaseAssigneeRow,
  type CaseProcedureLite,
  InfluencersClient,
  type InfluencerListRow,
} from "./influencers-client";
import type {
  PriceCatalogEntry,
  PromoCatalogEntry,
} from "./procedure-items-editor";

export const metadata: Metadata = {
  title: "เคสดำเนินงาน",
};

// คอลัมน์ทั้งหมดของ influencers ยกเว้น procedure_history — jsonb เก็บลายเซน base64
// (~10-30KB/รายการ) หน้า list ไม่ได้ใช้ ไม่ต้องส่งลงมาให้หนักเปล่า
const INFLU_LIST_COLUMNS =
  "id, person_id, round_no, first_name, last_name, nickname, phone, occupation, followers, follower_note, tier, procedure_text, case_value, voucher_count, voucher_unit, consult_only, talent_fee, service_date, doctor_name, contact_channel, photo_path, channel_photo_path, memo_file_path, memo_file_name, memo_uploaded_at, memo_ready_at, docs_sent_at, memo_submitted_at, contract_file_path, contract_file_name, contract_uploaded_at, maker_name, stage, completed, contract_start, contract_months, note, followup_mode, package_note, size_group, board_position, archived, declined_at, influ_code, campaign_id, owner_id, created_by, created_at, updated_at";

export default async function InfluencersPage({
  searchParams,
}: {
  /** `?filter=needbooking_approved` ฯลฯ — deep link จากปุ่มแจ้งเตือนบนปฏิทิน/กระดิ่ง
      (ค่าที่รับได้ดู boardSeedFromParam ใน board-filters.tsx) */
  searchParams: Promise<{ filter?: string }>;
}) {
  const supabase = await createClient();

  // วันนี้ตามเวลาไทย — ใช้กรองโปรที่หมดเขตแล้วออกจากตัวเลือกหัตถการ
  const todayBkk = todayISO();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    { filter: filterParam },
    access,
    { data: influencers, error },
    { data: tasks },
    { data: doctors },
    { data: sourceLinks },
    { data: serviceBookings },
    { data: priceCatalog },
    { data: promoCatalog },
    { data: profiles },
    { data: influProfiles },
    { data: services },
    { data: campaigns },
    { data: procedureItems },
    { data: assignees },
  ] = await Promise.all([
      searchParams,
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
        .select("influencer_id, due_date, done, done_at, is_custom, section"),
      // ทะเบียนแพทย์ — ตัวเลือก "แพทย์ที่รับเคส" ในฟอร์มสร้างนัด (แก้ทะเบียนที่หน้า /influ-doctors)
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
      // โปรที่ขึ้นหน้า /price-list (promo_packages — 0090): ราคาโปรจริงที่ขายอยู่
      // หลายตัวไม่มีคู่ใน price_items (เช่น Botox Hutox โปร 9,900 vs ปกติ 11,900)
      supabase
        .from("promo_packages")
        .select("id, name, sale_price, full_price")
        .eq("active", true)
        .or(`ends_on.is.null,ends_on.gte.${todayBkk}`)
        .order("name", { ascending: true }),
      // บัญชีทั้งหมด — รูป/ชื่อของผู้รับผิดชอบบนการ์ด + ตัวเลือกตอนมอบหมายงาน
      supabase.from("profiles").select("id, full_name, email, avatar_path, job_title"),
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
      // แคมเปญ (0093) — ตัวเลือกในฟอร์มสร้างนัด + แปลงเป็นแฮชแท็กบนการ์ด
      supabase
        .from("influ_campaign_defs")
        .select("*")
        .order("created_at", { ascending: false }),
      // หัตถการของทุกเคส — ใช้สร้างแฮชแท็ก #หัตถการ (product_team) และ #โปรโมชัน (sku ของโปร)
      supabase
        .from("influ_procedure_items")
        .select("influencer_id, product_team, promo:promo_packages(sku)"),
      // ผู้รับผิดชอบของทุกเคส (0095) — สิ่งที่การ์ดแสดงแทนชื่อผู้สร้างเดิม
      supabase.from("influ_assignees").select("influencer_id, user_id, scopes"),
    ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  const me = (profiles ?? []).find((p) => p.id === access.uid);

  return (
    // จอเล็กบอร์ดเป็น pager ปาดข้าง — ต้องกั้นความสูงให้รางกินที่ที่เหลือพอดีจอ
    // (แต่ละกลุ่มเลื่อนแนวตั้งในตัวเอง ไม่ใช่ทั้งหน้าเลื่อนยาวลงไป)
    <PageContainer className="max-md:flex max-md:h-full max-md:flex-col">
      <InfluencersClient
        influencers={(influencers ?? []) as InfluencerListRow[]}
        tasks={(tasks ?? []) as InfluTaskLite[]}
        doctors={(doctors ?? []) as DoctorRow[]}
        campaigns={(campaigns ?? []) as InfluCampaignDefRow[]}
        // embed ของ supabase ไม่มีใน Database type ที่เขียนมือ — ต้อง cast ผ่าน unknown
        procedureItems={
          (procedureItems ?? []) as unknown as CaseProcedureLite[]
        }
        sourceLinks={(sourceLinks ?? []) as InfluLinkLite[]}
        bookedInfluIds={
          (serviceBookings ?? [])
            .map((b) => b.influencer_id)
            .filter((id): id is string => id !== null)
        }
        priceCatalog={(priceCatalog ?? []) as PriceCatalogEntry[]}
        promoCatalog={(promoCatalog ?? []) as PromoCatalogEntry[]}
        profiles={(influProfiles ?? []) as InfluProfileRow[]}
        services={(services ?? []) as InfluServiceRow[]}
        people={
          (profiles ?? []).map((p) => ({
            id: p.id,
            name: p.full_name || p.email || "ไม่ทราบชื่อ",
            avatarPath: p.avatar_path ?? null,
            jobTitle: p.job_title ?? null,
          })) as InfluPerson[]
        }
        assignees={(assignees ?? []) as CaseAssigneeRow[]}
        initialFilter={filterParam ?? null}
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
