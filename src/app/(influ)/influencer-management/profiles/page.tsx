import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canManageInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluProfileRow } from "@/lib/types";
import { ProfilesClient, type ProfileCaseLite } from "./profiles-client";

export const metadata: Metadata = {
  title: "จัดการโปรไฟล์ Influencer",
};

/**
 * จัดการโปรไฟล์ (ตัวบุคคล) — งานของผู้ดูแลระบบ Influ เท่านั้น
 *
 * มี 2 งานที่ไม่มีที่อยู่มาก่อน (audit 2026-09-03):
 *   1. **โปรไฟล์กำพร้า** (สร้างไว้แต่ยังไม่เคยเปิดเคส) มองไม่เห็นจากหน้าไหนเลย
 *      — โผล่แค่ในช่องค้นหาของโมดัลสร้างนัด และลบไม่ได้
 *   2. **โปรไฟล์ซ้ำ** — backfill 0073/0080 สร้าง 1 โปรไฟล์ต่อ "เคส" ⇒ คนที่เข้ามา
 *      หลายครั้งก่อนมีระบบรอบงานกลายเป็นคนละคน (แฮชแท็ก #INF จึงยังแตกกันอยู่)
 */
export default async function InfluProfilesPage() {
  const supabase = await createClient();

  const [access, profilesRes, casesRes] = await Promise.all([
    getAccess(),
    supabase
      .from("influ_profiles")
      .select("*")
      .order("first_name", { ascending: true }),
    // เคสทั้งหมด (รวม archived) — ต้องนับให้ครบเพื่อบอกว่าโปรไฟล์ไหน "ยังไม่มีเคส" จริง
    supabase
      .from("influencers")
      .select("id, person_id, round_no, influ_code, archived, completed, declined_at"),
  ]);

  if (!canManageInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <ProfilesClient
        profiles={(profilesRes.data ?? []) as InfluProfileRow[]}
        cases={(casesRes.data ?? []) as ProfileCaseLite[]}
        actor={{ id: access.uid, name: access.name }}
        loadError={profilesRes.error?.message ?? casesRes.error?.message ?? null}
      />
    </PageContainer>
  );
}
