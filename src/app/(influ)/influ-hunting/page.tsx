import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import {
  canEditInflu,
  canManageInflu,
  canViewInflu,
  getAccess,
} from "@/lib/access";
import { todayBangkokISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type {
  DoctorRow,
  InfluCampaignDefRow,
  InfluProfileRow,
  InfluProspectContactRow,
  InfluProspectRow,
  InfluServiceRow,
} from "@/lib/types";
import type {
  PriceCatalogEntry,
  PromoCatalogEntry,
} from "../influencers/procedure-items-editor";
import { HuntingClient } from "./hunting-client";

export const metadata: Metadata = {
  title: "Influ Hunting",
};

export default async function InfluHuntingPage() {
  const supabase = await createClient();

  // วันนี้ตามเวลาไทย — ใช้กรองโปรที่หมดเขตแล้วออกจากตัวเลือกหัตถการ
  const todayBkk = todayBangkokISO();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    access,
    { data: prospects, error },
    { data: contacts },
    { data: influProfiles },
    { data: services },
    { data: priceCatalog },
    { data: promoCatalog },
    { data: doctors },
    { data: profiles },
    { data: campaigns },
  ] = await Promise.all([
    getAccess(),
    supabase
      .from("influ_prospects")
      .select("*")
      .order("updated_at", { ascending: false }),
    // log การติดต่อทั้งบอร์ด — แถวสั้นและโตช้า ดึงทีเดียวแล้ว group ฝั่ง client
    supabase
      .from("influ_prospect_contacts")
      .select("*")
      .order("contacted_on", { ascending: false })
      .order("created_at", { ascending: false }),
    // โปรไฟล์ทั้งหมด — ใช้ตอน "ตอบรับ" (เช็คโปรไฟล์เดิม) + ส่งเข้า NewCaseModal
    supabase
      .from("influ_profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("influ_services")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("price_items")
      .select("id, name, price_normal, promos, search_aliases")
      .eq("active", true)
      .order("name", { ascending: true }),
    // โปรที่ขึ้นหน้า /price-list (promo_packages — 0090): ราคาโปรจริงที่ขายอยู่
    supabase
      .from("promo_packages")
      .select("id, name, sale_price, full_price")
      .eq("active", true)
      .or(`ends_on.is.null,ends_on.gte.${todayBkk}`)
      .order("name", { ascending: true }),
    supabase.from("doctors").select("*").order("name", { ascending: true }),
    supabase.from("profiles").select("id, full_name, email"),
    // แคมเปญ (0093) — ตัวเลือกในฟอร์มสร้างนัดที่เปิดต่อจากปุ่ม "ตอบรับ"
    supabase
      .from("influ_campaign_defs")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  const me = (profiles ?? []).find((p) => p.id === access.uid);

  return (
    <PageContainer>
      <HuntingClient
        prospects={(prospects ?? []) as InfluProspectRow[]}
        contacts={(contacts ?? []) as InfluProspectContactRow[]}
        profiles={(influProfiles ?? []) as InfluProfileRow[]}
        services={(services ?? []) as InfluServiceRow[]}
        priceCatalog={(priceCatalog ?? []) as PriceCatalogEntry[]}
        promoCatalog={(promoCatalog ?? []) as PromoCatalogEntry[]}
        doctors={(doctors ?? []) as DoctorRow[]}
        campaigns={(campaigns ?? []) as InfluCampaignDefRow[]}
        people={(profiles ?? []).map((p) => ({
          id: p.id,
          name: p.full_name || p.email || "ไม่ทราบชื่อ",
        }))}
        me={{
          id: access.uid,
          name: me?.full_name || me?.email || "",
          canEdit: canEditInflu(access),
          canManage: canManageInflu(access),
        }}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
