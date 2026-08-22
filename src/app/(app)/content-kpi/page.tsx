import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { ContentCategoryRow, ContentKpiRow } from "@/lib/types";
import { ContentKpiClient } from "./content-kpi-client";

export const metadata: Metadata = {
  title: "ตั้งค่า KPI คอนเทนต์",
};

/**
 * หน้าตั้งค่า KPI ทีมคอนเทนต์ (migration 0085) — จัดการหมวดเนื้อหา (ขาย/Value/หมอ/สวย ...)
 * + กำหนดเป้าจำนวนชิ้นต่อเดือนรายคน; ผลติดตามจริงดูที่ /content-tracking
 * ทุกคนที่มีสิทธิ์ team เปิดดูได้ — แก้ไขเฉพาะ admin (คุมที่ UI ตามแนวระบบ)
 */
export default async function ContentKpiPage() {
  const supabase = await createClient();

  const [access, categoriesResult, kpisResult, profilesResult] =
    await Promise.all([
      getAccess(),
      supabase
        .from("content_categories")
        .select("*")
        .order("position", { ascending: true }),
      supabase
        .from("content_kpis")
        .select("*")
        .order("position", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true }),
    ]);

  if (!hasPermission(access, "team")) return <AccessNotice />;

  const categories = (categoriesResult.data ?? []) as ContentCategoryRow[];
  const kpis = (kpisResult.data ?? []) as ContentKpiRow[];
  const profiles = profilesResult.data ?? [];
  const loadError =
    categoriesResult.error?.message ??
    kpisResult.error?.message ??
    profilesResult.error?.message ??
    null;

  return (
    <PageContainer>
      <ContentKpiClient
        initialCategories={categories}
        initialKpis={kpis}
        profiles={profiles}
        isAdmin={access.isAdmin}
        userId={access.uid}
        loadError={loadError}
      />
    </PageContainer>
  );
}
