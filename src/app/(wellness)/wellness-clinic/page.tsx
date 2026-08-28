import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessAdmin, getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
// ⚠️ import ค่า runtime จากไฟล์ "use client" ไม่ได้ — select string จึงอยู่ใน wellness-constants
import {
  CALENDAR_APPT_SELECT,
  addDaysISO,
  todayBangkokISO,
} from "@/lib/wellness-constants";
import { ClinicClient, type ClinicAppt } from "./clinic-client";

export const metadata: Metadata = { title: "คิวตรวจของแพทย์ Wellness" };

/**
 * Stage 4 — แพทย์: คิวที่ต้องตรวจ พร้อมผลเลือดของแต่ละคน (อ่านอย่างเดียว)
 * ไม่มีปุ่มลงคิว/แก้ข้อมูล — งานนั้นเป็นของ Admin คนละหน้ากัน
 */
export default async function WellnessClinicPage() {
  const supabase = await createClient();
  const today = todayBangkokISO();

  const [access, apptsRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_appointments")
      .select(CALENDAR_APPT_SELECT)
      // ย้อนหลัง 30 วันก็พอสำหรับ "เคสที่เพิ่งตรวจไป" — ของเก่ากว่านั้นดูที่ปฏิทิน
      .gte("appt_date", addDaysISO(today, -30))
      .order("appt_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (
    !hasPermission(access, "wellness_doctor") &&
    !canWellnessAdmin(access)
  ) {
    return <AccessNotice />;
  }

  return (
    <ClinicClient
      appointments={(apptsRes.data ?? []) as unknown as ClinicAppt[]}
      today={today}
    />
  );
}
