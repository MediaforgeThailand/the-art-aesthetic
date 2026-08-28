import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import {
  canViewWellness,
  canWellnessAdmin,
  canWellnessBc,
  getAccess,
} from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { WellnessBoardClient, type ScheduledApptLite } from "./wellness-client";

export const metadata: Metadata = { title: "การ์ดลูกค้า Wellness" };

export default async function WellnessBoardPage() {
  const supabase = await createClient();

  // ยิงขนานตามแพตเทิร์น perf — เช็คสิทธิ์หลัง await (RLS กันข้อมูลอยู่แล้ว)
  const [access, customersRes, apptsRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_customers")
      .select("*")
      .order("created_at", { ascending: false }),
    // คิวที่ยังนัดอยู่ทั้งหมด — ใช้ตัดสินสถานะ "นัดแล้ว" + โชว์วันนัดถัดไปบนการ์ด
    supabase
      .from("wellness_appointments")
      .select("customer_id, appt_date, start_time, duration_hours")
      .eq("status", "scheduled")
      .order("appt_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (!canViewWellness(access)) return <AccessNotice />;

  return (
    <WellnessBoardClient
      customers={customersRes.data ?? []}
      scheduledAppts={(apptsRes.data ?? []) as ScheduledApptLite[]}
      uid={access.uid}
      canCreate={canWellnessBc(access)}
      canAdmin={canWellnessAdmin(access)}
    />
  );
}
