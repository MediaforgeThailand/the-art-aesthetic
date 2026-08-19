import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer, PageHeader } from "@/components/ui";
import { canManageInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { DoctorRow } from "@/lib/types";
import { DoctorManagerPanel } from "../influencers/doctor-manager";

export const metadata: Metadata = {
  title: "จัดการหมอ",
};

/**
 * ทะเบียนแพทย์ — หน้าของตัวเอง (เดิมเป็นโมดัลบนหัวบอร์ดเคส, ย้ายมา 2026-08-19)
 *
 * งานผู้ดูแลระบบเท่านั้น (canManageInflu) เหมือนตอนเป็นปุ่มบนบอร์ด — เพิ่ม/แก้ชื่อหมอ
 * ต้องผ่านหน้านี้ที่เดียว กันชื่อสะกดเพี้ยนงอกใหม่จากหลายทีม
 */
export default async function InfluDoctorsPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data: doctors }] = await Promise.all([
    getAccess(),
    supabase.from("doctors").select("*").order("name", { ascending: true }),
  ]);
  if (!canManageInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <PageHeader
        title="จัดการหมอ"
        description="ทะเบียนแพทย์ที่ใช้เป็นตัวเลือก 'แพทย์ที่รับเคส' ทั้งในหน้าเดินงานและปฏิทินคิว"
      />
      <DoctorManagerPanel doctors={(doctors ?? []) as DoctorRow[]} />
    </PageContainer>
  );
}
