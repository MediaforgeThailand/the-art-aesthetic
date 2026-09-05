import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canViewInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { DoctorRow } from "@/lib/types";
import { DoctorManagerPanel } from "../influencers/doctor-manager";

export const metadata: Metadata = {
  title: "จัดการหมอ",
};

/**
 * ทะเบียนแพทย์ — หน้าของตัวเอง (เดิมเป็นโมดัลบนหัวบอร์ดเคส, ย้ายมา 2026-08-19)
 *
 * เปิดดูได้ทุกระดับของระบบ Influencer แต่ **เพิ่ม/แก้/ลบได้เฉพาะ admin** (0103 —
 * ทะเบียนเดียวกับหน้าจัดการแท็กของทีมคอนเทนต์ จึงต้องใช้เกณฑ์สิทธิ์เดียวกันทั้งสองหน้า);
 * เพิ่ม/แก้ชื่อหมอต้องผ่านหน้านี้หรือหน้าจัดการแท็กเท่านั้น กันชื่อสะกดเพี้ยนงอกใหม่จากหลายทีม
 */
export default async function InfluDoctorsPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data: doctors }] = await Promise.all([
    getAccess(),
    supabase.from("doctors").select("*").order("name", { ascending: true }),
  ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <DoctorManagerPanel
        doctors={(doctors ?? []) as DoctorRow[]}
        canEdit={access.isAdmin}
        actor={{ id: access.uid, name: access.name }}
      />
    </PageContainer>
  );
}
