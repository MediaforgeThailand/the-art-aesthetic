/**
 * คัดลอกรูปของ "ตัวบุคคล" เข้าโฟลเดอร์ของเคส — helper กลางที่เดียว (audit 2026-09-03)
 *
 * ทำไมต้อง copy ไฟล์ ไม่ใช่ชี้ path เดิม: ลบเคส = ลบทุกไฟล์ใต้ `influencers/{caseId}/`
 * ⇒ ถ้าเคสใหม่ชี้ path ของเคสเก่า/โปรไฟล์ วันหนึ่งรูปจะหายพร้อมกันหมด (กติกา 0073)
 *
 * ทำไมต้องมีที่เดียว: ก่อนหน้านี้มีโค้ด copy รูปกระจาย 3 จุด (สร้างนัดใหม่ / เปิดรอบใหม่ /
 * บันทึกโปรไฟล์) แล้ว **ไม่มีจุดไหนสร้างแถวใน `influ_case_photos` (0105) เลย** —
 * รูปจึงโผล่บนการ์ด (อ่านจาก `influencers.photo_path`) แต่แกลเลอรีในแท็บรายละเอียดเคสว่าง
 * และรูปที่อัพเพิ่มทีหลังทับหน้าปกเงียบๆ
 */

import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import type { createClient } from "@/lib/supabase/client";
import type { InfluCasePhotoKind } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createClient>;

/** ชื่อไฟล์ปลายทางต้องปลอดภัยกับ Storage (ชื่อไทย/อักขระพิเศษทำ path พัง) */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** `Date.now()` ต้องอยู่ในฟังก์ชันระดับโมดูล ไม่ใช่ระหว่าง render (กฎ react-hooks/purity) */
function newCasePhotoPath(caseId: string, srcPath: string): string {
  const base = sanitizeFileName(srcPath.split("/").pop() ?? "photo.jpg");
  return `influencers/${caseId}/${Date.now()}-${base}`;
}

/**
 * คัดลอก 1 รูปเข้าเคส แล้วบันทึกเป็นรูปของเคสนั้น (แถวใน influ_case_photos + คอลัมน์หน้าปก)
 *
 * - best effort ทั้งก้อน: copy ไม่ได้ = คืน null ห้ามโยน error (การสร้างเคสต้องไม่ล้มเพราะรูป)
 * - เขียนคอลัมน์หน้าปก (`photo_path` / `channel_photo_path`) **เฉพาะตอนที่ยังว่าง**
 *   consumer เดิมทั้งหมดอ่าน 2 คอลัมน์นี้ แต่รูปที่ทีมอัพเองต้องไม่ถูกทับ
 */
export async function copyPhotoIntoCase(
  supabase: SupabaseClient,
  caseId: string,
  srcPath: string | null,
  kind: InfluCasePhotoKind
): Promise<string | null> {
  if (!srcPath) return null;
  const dest = newCasePhotoPath(caseId, srcPath);
  const { error: cpErr } = await supabase.storage
    .from(STORAGE_BUCKET_DOCUMENTS)
    .copy(srcPath, dest);
  if (cpErr) return null;

  await supabase
    .from("influ_case_photos")
    .insert({
      influencer_id: caseId,
      kind,
      file_path: dest,
      file_name: srcPath.split("/").pop() ?? null,
      position: 1,
    })
    .then(() => {
      // แถวแกลเลอรีเขียนไม่ขึ้นก็ยังมีคอลัมน์หน้าปกให้การ์ดใช้ — ไม่ต้องล้มทั้งงาน
    });

  if (kind === "photo") {
    await supabase
      .from("influencers")
      .update({ photo_path: dest })
      .eq("id", caseId)
      .is("photo_path", null);
  } else {
    await supabase
      .from("influencers")
      .update({ channel_photo_path: dest })
      .eq("id", caseId)
      .is("channel_photo_path", null);
  }
  return dest;
}
