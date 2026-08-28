import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessAdmin, getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { CALENDAR_APPT_SELECT } from "@/lib/wellness-constants";
import {
  WellnessCalendarClient,
  type CalendarAppt,
} from "../calendar/calendar-client";

export const metadata: Metadata = { title: "คิวตรวจของแพทย์ Wellness" };

/**
 * Stage 5 — แพทย์: **คิวตรวจ** แสดงเป็น "ปฏิทินเดือน" ชุดเดียวกับหน้าลงคิว
 * (ผู้ใช้ 2026-08-29: "หมอคิวตรวจ ตอนนี้เป็น card ต้องการให้เป็น calendar เหมือนกัน
 * มันดูง่ายกว่า แบบหน้าลงคิวเลย")
 *
 * ต่างจากหน้าลงคิวแค่ `canAdmin={false}` — ไม่มีปุ่มลงคิว/แก้สถานะ เป็นตารางอ่านอย่างเดียว
 * กดวันแล้วเห็นคิวของวันนั้น กดคิวแล้วเปิดผลเลือดของคนไข้ได้
 */
export default async function WellnessClinicPage() {
  const supabase = await createClient();

  const [access, apptsRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_appointments")
      .select(CALENDAR_APPT_SELECT)
      .order("appt_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (!hasPermission(access, "wellness_doctor") && !canWellnessAdmin(access)) {
    return <AccessNotice />;
  }

  return (
    <WellnessCalendarClient
      appointments={(apptsRes.data ?? []) as unknown as CalendarAppt[]}
      // อ่านอย่างเดียว — ไม่มีฟอร์มลงคิว จึงไม่ต้องส่งรายชื่อลูกค้ามาเลย
      customers={[]}
      uid={access.uid}
      canAdmin={false}
    />
  );
}
