import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import {
  canEditInflu,
  canManageInflu,
  canViewInflu,
  getAccess,
} from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluCampaignDefRow, InfluProfileRow } from "@/lib/types";
import {
  CampaignsClient,
  type CampaignCaseLite,
  type CampaignMemberWithProfile,
} from "./campaigns-client";

export const metadata: Metadata = {
  title: "แคมเปญ",
};

/**
 * แคมเปญ + แท็กสำหรับ tracking (0093)
 *
 * หน้านี้คือที่ตั้ง "แท็กประจำแคมเปญ" ซึ่งเป็นกุญแจที่ influ ต้องติดในโพส แล้วทีมหลังบ้าน
 * เอาไปจับคู่กับข้อมูลที่ดึงจาก Meta API เพื่อบอกว่ายอดมาจากแคมเปญไหน/ใคร
 * (ยังไม่ได้ต่อ API จริง — ตอนนี้เตรียมกุญแจให้ครบก่อน)
 *
 * สมาชิกแคมเปญผูกกับ "ตัวบุคคล" (influ_profiles) เพราะคนหนึ่งอยู่ในแคมเปญแล้ว
 * อาจเปิดเคสหลายรอบภายใต้แคมเปญเดียวกัน
 */
export default async function InfluCampaignsPage() {
  const supabase = await createClient();

  const [access, campaignsRes, membersRes, profilesRes, casesRes] =
    await Promise.all([
      getAccess(),
      supabase
        .from("influ_campaign_defs")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("influ_campaign_members")
        .select(
          "*, profile:influ_profiles(id, first_name, last_name, nickname, followers, tier, photo_path)"
        )
        .order("created_at", { ascending: true }),
      supabase
        .from("influ_profiles")
        .select("*")
        .order("first_name", { ascending: true }),
      // นับเคสต่อแคมเปญ — ดึงเฉพาะคอลัมน์ที่ใช้ (เคสทั้งระบบยังหลักร้อย)
      supabase
        .from("influencers")
        .select("id, campaign_id, person_id, completed, declined_at")
        .not("campaign_id", "is", null),
    ]);

  if (!canViewInflu(access)) return <AccessNotice />;

  return (
    <CampaignsClient
      campaigns={(campaignsRes.data ?? []) as InfluCampaignDefRow[]}
      members={
        (membersRes.data ?? []) as unknown as CampaignMemberWithProfile[]
      }
      profiles={(profilesRes.data ?? []) as InfluProfileRow[]}
      cases={(casesRes.data ?? []) as CampaignCaseLite[]}
      canEdit={canEditInflu(access)}
      canManage={canManageInflu(access)}
      actor={{ id: access.uid, name: access.name }}
    />
  );
}
