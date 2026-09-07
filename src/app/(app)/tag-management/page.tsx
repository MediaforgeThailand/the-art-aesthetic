import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canManageDoctors, getAccess, hasPermission } from "@/lib/access";
import { fetchInfluTagOptions } from "@/lib/influ-tags";
import { createClient } from "@/lib/supabase/server";
import type { ContentCategoryRow, DoctorRow } from "@/lib/types";
import { TagManagementClient } from "./tag-management-client";

export const metadata: Metadata = {
  title: "จัดการแท็ก",
};

/**
 * หน้าจัดการแท็กของทีมคอนเทนต์ — ศูนย์รวมของทุกแท็กที่ใช้ติดงานคอนเทนต์
 *
 * 3 ส่วน: **หมอ** (ทะเบียนเดียวกับระบบ Influ — เพิ่ม/ลบ/แก้เองได้ที่นี่)
 * · **Influencer** (อ่านจากระบบ Influ: ทุกเคสที่ยังเดินงานอยู่ พร้อมชุดแฮชแท็กบังคับ)
 * · **หมวดเนื้อหา** (อ่านอย่างเดียว — ตั้งค่าจริงอยู่หน้า KPI คอนเทนต์)
 *
 * เปิดดูได้ทุกคนที่มีสิทธิ์ team; แก้ทะเบียนหมอได้เฉพาะคนที่ `canManageDoctors`
 * (isAdmin หรือสิทธิ์ `doctor_manage` แยก — เกณฑ์เดียวกับ /influ-doctors, คุมที่ UI ตามแนวระบบ)
 */
export default async function TagManagementPage() {
  const supabase = await createClient();

  const [access, doctorsResult, influOptions, categoriesResult] =
    await Promise.all([
      getAccess(),
      supabase.from("doctors").select("*").order("name", { ascending: true }),
      fetchInfluTagOptions(),
      supabase
        .from("content_categories")
        .select("*")
        .order("position", { ascending: true }),
    ]);

  if (!hasPermission(access, "team")) return <AccessNotice />;

  return (
    <PageContainer>
      <TagManagementClient
        doctors={(doctorsResult.data ?? []) as DoctorRow[]}
        canManageDoctors={canManageDoctors(access)}
        influOptions={influOptions}
        categories={(categoriesResult.data ?? []) as ContentCategoryRow[]}
        actor={{ id: access.uid, name: access.name }}
      />
    </PageContainer>
  );
}
