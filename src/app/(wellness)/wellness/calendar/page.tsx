import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessAdmin, getAccess, hasPermission } from "@/lib/access";
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
    // ตัวเลือกในฟอร์มลงคิว = **เฉพาะคนที่ทีม Lab ยืนยันผลแล้วและยังไม่ปิดเคส**
    // (ผู้ใช้ 2026-08-29: ชื่อที่เลือกได้ต้องอัพผล Lab แล้วเท่านั้น)
    supabase
      .from("wellness_customers")
      .select("id, first_name, last_name, phone, lab_confirmed_at, completed_at")
      .not("lab_confirmed_at", "is", null)
      .is("completed_at", null)
      .order("lab_confirmed_at", { ascending: true }),
  ]);

  // ปฏิทินเป็นเครื่องมือของ Admin (คนลงคิว) และแพทย์ (คนดูคิวตัวเอง) —
  // BC/Lab ไม่ต้องเห็น ตามกติกา "เห็นเฉพาะงานของบทบาทตัวเอง"
  if (!hasPermission(access, "wellness_doctor") && !canWellnessAdmin(access)) {
    return <AccessNotice />;
  }

  return (
    <WellnessCalendarClient
      appointments={(apptsRes.data ?? []) as unknown as CalendarAppt[]}
      customers={(customersRes.data ?? []) as BookableCustomer[]}
      uid={access.uid}
      canAdmin={canWellnessAdmin(access)}
    />
  );
}
