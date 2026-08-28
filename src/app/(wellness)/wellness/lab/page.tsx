import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessLab, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { LabQueueClient, type LabQueueCustomer } from "./lab-client";

export const metadata: Metadata = { title: "อัพผลแลบ Wellness" };

// ตัวแปร (ไม่ใช่ literal ตรงๆ) — ผลลัพธ์ของ embed ถูก cast เองด้านล่าง
// เพราะ Database type ของโปรเจกต์เขียนมือ ไม่มี Relationships ให้ supabase-js อนุมาน
const LAB_QUEUE_SELECT = "*, lab_files:wellness_lab_files(*)";

/**
 * Stage 2 — ทีม Lab: คิวอัพไฟล์ผลตรวจเลือด แล้วกดยืนยันเมื่อครบ
 * ทำงานจบในหน้าเดียว ไม่ต้องเปิดหน้าเคส และไม่มีปุ่มของบทบาทอื่นเลย
 */
export default async function WellnessLabPage() {
  const supabase = await createClient();

  const [access, customersRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_customers")
      .select(LAB_QUEUE_SELECT)
      // เคสที่ปิดแล้วไม่ใช่งานของ Lab — เก็บเป็นประวัติในหน้าภาพรวมของ Admin
      .is("completed_at", null)
      // เก่าสุดขึ้นก่อน = คิวแบบมาก่อนได้ก่อน
      .order("created_at", { ascending: true }),
  ]);

  if (!canWellnessLab(access)) return <AccessNotice />;

  return (
    <LabQueueClient
      customers={(customersRes.data ?? []) as unknown as LabQueueCustomer[]}
      uid={access.uid}
    />
  );
}
