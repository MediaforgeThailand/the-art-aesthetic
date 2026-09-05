import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canEditInflu, canViewInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { DoctorRow } from "@/lib/types";
import { CalendarClient, type CalendarEvent, type CalendarInflu } from "./calendar-client";
import { CALENDAR_EVENT_SELECT } from "./calendar-query";

export const metadata: Metadata = {
  title: "Influ Calendar",
};

export default async function InfluCalendarPage() {
  const supabase = await createClient();

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data: events, error }, { data: influencers }, { data: doctors }] =
    await Promise.all([
      getAccess(),
      // ดึงคิวทั้งหมด แล้วแบ่งเดือนฝั่ง client (ปฏิทินเดินเดือนไปมาได้โดยไม่ต้องโหลดใหม่)
      // — ตารางนี้โตช้ามาก (หลักร้อยแถว/ปี); ถ้าวันหนึ่งใหญ่เกินค่อยเปลี่ยนเป็นดึงเป็นช่วงเดือน
      // embed ที่ join มา (ชื่อ influ / ไฟล์สัญญา / หัตถการ+ทีม) อธิบายไว้ที่ calendar-query.ts
      supabase
        .from("influ_calendar_events")
        .select(CALENDAR_EVENT_SELECT)
        .order("event_date", { ascending: true }),
      // ตัวเลือก influencer ของฟอร์มเพิ่ม/แก้คิว (doctor_name ใช้เติมแพทย์ให้อัตโนมัติ
      // ตอนเลือกคน + เป็นตัวเลือกในตัวกรองแพทย์)
      // stage/completed/declined_at ใช้นับ "เอกสารผ่านแล้วแต่ยังไม่ลงคิว" (ปุ่มแจ้งเตือน
      // ท้ายแผงขวา — เกณฑ์ memoApprovedNeedsBooking เดียวกับตัวกรองบนบอร์ดเคส)
      supabase
        .from("influencers")
        .select(
          "id, first_name, last_name, nickname, round_no, doctor_name, stage, completed, declined_at"
        )
        .eq("archived", false)
        .order("first_name", { ascending: true }),
      // ทะเบียนแพทย์ — ตัวเลือก "แพทย์ที่รับเคส" ในฟอร์มคิว + รูปโปรไฟล์ในแผงข้าง
      supabase.from("doctors").select("*").order("name", { ascending: true }),
    ]);
  if (!canViewInflu(access)) return <AccessNotice />;

  return (
    // ไม่ใช้ PageContainer: จอ ≥lg หน้านี้ต้องสูงพอดีจอ ไม่มี scroll ทั้งหน้า (คำสั่งผู้ใช้
    // 2026-08-20 — ปฏิทินกางเต็มความสูงที่เหลือแบบ TimeTree) ส่วนจอเล็กยังเลื่อนปกติ
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 lg:flex lg:flex-col lg:overflow-hidden lg:px-2.5 lg:py-2">
      <CalendarClient
        events={(events ?? []) as unknown as CalendarEvent[]}
        influencers={(influencers ?? []) as CalendarInflu[]}
        doctors={(doctors ?? []) as DoctorRow[]}
        userId={access.uid}
        userName={access.name}
        canEdit={canEditInflu(access)}
        loadError={error?.message ?? null}
      />
    </div>
  );
}
