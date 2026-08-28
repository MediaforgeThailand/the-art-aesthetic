import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessBc, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { RegisterClient, type RegisterApptLite } from "./register-client";

export const metadata: Metadata = { title: "ทะเบียนลูกค้า Wellness" };

/**
 * Stage 1 — ทีม BC: เพิ่ม/แก้การ์ดลูกค้าอย่างเดียว
 * ไม่มีปุ่มอัพผลแลบหรือลงคิวในหน้านี้โดยตั้งใจ (กติกา "1 บทบาท = 1 หน้า = 1 งาน")
 */
export default async function WellnessRegisterPage() {
  const supabase = await createClient();

  const [access, customersRes, apptsRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_customers")
      .select("*")
      .order("created_at", { ascending: false }),
    // คิวที่ยังนัดอยู่ — ใช้บอก BC ว่าเคสเดินไปถึงไหนแล้ว (อ่านอย่างเดียว)
    supabase
      .from("wellness_appointments")
      .select("customer_id, appt_date, start_time, duration_hours")
      .eq("status", "scheduled")
      .order("appt_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (!canWellnessBc(access)) return <AccessNotice />;

  return (
    <RegisterClient
      customers={customersRes.data ?? []}
      scheduledAppts={(apptsRes.data ?? []) as RegisterApptLite[]}
      uid={access.uid}
    />
  );
}
