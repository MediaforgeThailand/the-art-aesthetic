import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { canWellnessAdmin, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { ContactClient, type ContactCustomer } from "./contact-client";

export const metadata: Metadata = { title: "ข้อมูลติดต่อลูกค้า Wellness" };

// ตัวแปร (ไม่ใช่ literal) — cast ผลลัพธ์เอง เพราะ Database type เขียนมือไม่มี Relationships
const CONTACT_QUEUE_SELECT =
  "*, lab_files:wellness_lab_files(id), appointments:wellness_appointments(*)";

/**
 * Stage 3 — Admin: **ข้อมูลติดต่อ** — เบอร์ลูกค้าที่ผลเลือดพร้อมแล้ว โทรแจ้งผล
 * แล้วกดลงคิวได้จากแถวเลย (ไม่ต้องข้ามหน้าไปมาระหว่างคุยโทรศัพท์) — ปฏิทินคิวเต็มอยู่ Stage 4
 */
export default async function WellnessContactPage() {
  const supabase = await createClient();

  const [access, customersRes] = await Promise.all([
    getAccess(),
    supabase
      .from("wellness_customers")
      .select(CONTACT_QUEUE_SELECT)
      .is("completed_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (!canWellnessAdmin(access)) return <AccessNotice />;

  return (
    <ContactClient
      customers={(customersRes.data ?? []) as unknown as ContactCustomer[]}
      uid={access.uid}
    />
  );
}
