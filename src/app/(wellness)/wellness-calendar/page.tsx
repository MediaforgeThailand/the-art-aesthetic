import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canViewWellness, canWellnessAdmin, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
// ⚠️ import จากไฟล์ "use client" ได้เฉพาะ component + type เท่านั้น — ค่า runtime
// (string/ฟังก์ชัน) จะกลายเป็น client-reference proxy บน server แล้วพังตอนใช้งาน
import { CALENDAR_APPT_SELECT } from "@/lib/wellness-constants";
import {
  WellnessCalendarClient,
  type BookableCustomer,
  type CalendarAppt,
} from "./calendar-client";

export const metadata: Metadata = { title: "ปฏิทินคิวแพทย์ Wellness" };

export default async function WellnessCalendarPage() {
  const supabase = await createClient();

  // คิวทั้งหมดพร้อมข้อมูลลูกค้า+ไฟล์ผลแลบ (ตารางโตช้า — แบ่งเดือนฝั่ง client แบบ influ-calendar)
  const [access, apptsRes, customersRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_appointments")
      .select(CALENDAR_APPT_SELECT)
      .order("appt_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("wellness_customers")
      .select("id, first_name, last_name, phone, lab_confirmed_at, completed_at")
      .order("created_at", { ascending: false }),
  ]);

  if (!canViewWellness(access)) return <AccessNotice />;

  return (
    <WellnessCalendarClient
      appointments={(apptsRes.data ?? []) as unknown as CalendarAppt[]}
      customers={(customersRes.data ?? []) as BookableCustomer[]}
      uid={access.uid}
      canAdmin={canWellnessAdmin(access)}
    />
  );
}
