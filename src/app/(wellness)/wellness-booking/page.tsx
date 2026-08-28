import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessAdmin, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { BookingQueueClient, type BookingQueueCustomer } from "./booking-client";

export const metadata: Metadata = { title: "โทรนัด + ลงคิว Wellness" };

// ตัวแปร (ไม่ใช่ literal) — cast ผลลัพธ์เอง เพราะ Database type เขียนมือไม่มี Relationships
const BOOKING_QUEUE_SELECT =
  "*, lab_files:wellness_lab_files(id), appointments:wellness_appointments(*)";

/**
 * Stage 3 — Admin: โทรหาลูกค้าที่ผลเลือดพร้อมแล้ว ตกลงเวลา แล้วลงคิวพบแพทย์
 * หน้านี้ทำงานจบในตัว (โทร → ลงคิว → เช็คว่ามาแล้ว → ปิดเคส) ไม่ต้องเปิดหน้าอื่น
 */
export default async function WellnessBookingPage() {
  const supabase = await createClient();

  const [access, customersRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_customers")
      .select(BOOKING_QUEUE_SELECT)
      .is("completed_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (!canWellnessAdmin(access)) return <AccessNotice />;

  return (
    <BookingQueueClient
      customers={(customersRes.data ?? []) as unknown as BookingQueueCustomer[]}
      uid={access.uid}
    />
  );
}
