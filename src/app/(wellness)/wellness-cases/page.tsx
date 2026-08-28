import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessAdmin, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { WellnessCasesClient, type ScheduledApptLite } from "./cases-client";

export const metadata: Metadata = { title: "ภาพรวมเคส Wellness" };

/**
 * ภาพรวมทุกการ์ดในระบบ แยกตามขั้น — **หน้าของ Admin เท่านั้น**
 * (บทบาทอื่นทำงานจบในหน้าของตัวเอง ไม่ต้องเห็นเคสของขั้นอื่น)
 *
 * หน้านี้คือ "บอร์ดรวม" เดิมของ /wellness ที่ถูกย้ายมา ตอนแยก UI ตามบทบาท 2026-08-28
 */
export default async function WellnessCasesPage() {
  const supabase = await createClient();

  const [access, customersRes, apptsRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_customers")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("wellness_appointments")
      .select("customer_id, appt_date, start_time, duration_hours")
      .eq("status", "scheduled")
      .order("appt_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (!canWellnessAdmin(access)) return <AccessNotice />;

  return (
    <WellnessCasesClient
      customers={customersRes.data ?? []}
      scheduledAppts={(apptsRes.data ?? []) as ScheduledApptLite[]}
    />
  );
}
