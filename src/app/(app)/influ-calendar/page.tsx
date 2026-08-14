import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { DoctorRow } from "@/lib/types";
import { CalendarClient, type CalendarEvent, type CalendarInflu } from "./calendar-client";

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
      // ชื่อ influ join มาด้วย เพราะคิวเก่าอาจผูกกับคนที่ถูก archive แล้ว (ไม่อยู่ในลิสต์ตัวเลือก)
      supabase
        .from("influ_calendar_events")
        .select(
          "*, influencer:influencers(id, first_name, last_name, nickname)"
        )
        .order("event_date", { ascending: true }),
      // ตัวเลือก influencer ของฟอร์ม + วันเข้ารับบริการจากเคส (ซ้อนบนปฏิทินแบบอ่านอย่างเดียว)
      supabase
        .from("influencers")
        .select(
          "id, first_name, last_name, nickname, round_no, service_date, doctor_name, stage, completed, declined_at, procedure_text"
        )
        .eq("archived", false)
        .order("first_name", { ascending: true }),
      // ทะเบียนแพทย์ — ตัวเลือก "แพทย์ที่รับเคส" ในฟอร์มคิว + รูปโปรไฟล์ในแผงข้าง
      supabase.from("doctors").select("*").order("name", { ascending: true }),
    ]);
  if (!hasPermission(access, "influ")) return <AccessNotice />;

  return (
    <PageContainer>
      <CalendarClient
        events={(events ?? []) as unknown as CalendarEvent[]}
        influencers={(influencers ?? []) as CalendarInflu[]}
        doctors={(doctors ?? []) as DoctorRow[]}
        userId={access.uid}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
