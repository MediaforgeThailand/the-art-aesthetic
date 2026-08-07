"use client";

/**
 * ย่อ/บีบอัดรูปในเบราว์เซอร์ก่อนอัพขึ้น storage
 *
 * ทำไมต้องมี: ทีมอัพรูปจากมือถือ (3-12MB/รูป) ซึ่งกินโควตา storage เร็วมากและอัพช้า
 * ทั้งที่จุดประสงค์ของไฟล์ในระบบนี้คือ "ให้ผู้ตรวจกดดูเพื่อตรวจงาน + วัด KPI"
 * ไม่ใช่เก็บต้นฉบับความละเอียดเต็ม (ต้นฉบับอยู่ใน Google Drive ของทีมอยู่แล้ว)
 *
 * ขอบเขต:
 * - **รูปเท่านั้น** (jpeg/png/webp ที่เบราว์เซอร์ decode ได้) — heic ของ iPhone decode ไม่ได้
 *   จึงส่งต่อไฟล์เดิม
 * - **วิดีโอไม่ถูกแตะ** — การ transcode ในเบราว์เซอร์ต้องใช้ WebCodecs + muxer ซึ่งเป็น
 *   งานแยกก้อน; ตอนนี้วิดีโอเกินเพดานจะถูกกันที่ `fileTooLargeMessage` ใน `@/lib/upload`
 *   พร้อมข้อความให้แนบเป็นลิงก์ Drive แทน
 *
 * เพดานขนาดไฟล์อยู่ที่ `MAX_UPLOAD_BYTES` ใน `@/lib/upload` ที่เดียว — ที่นี่ไม่เช็คขนาด
 * (ผู้เรียกต้องย่อก่อน แล้วค่อยเช็คเพดาน เพราะรูปที่เกินอาจผ่านได้หลังย่อ)
 */

import { IMAGE_COMPRESS_OVER_MB, IMAGE_MAX_DIMENSION } from "@/lib/constants";

const MB = 1024 * 1024;

/** ฟอร์แมตรูปที่ canvas ของเบราว์เซอร์ decode ได้แน่ๆ */
function isCompressibleImage(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/i.test(file.type);
}

/**
 * ย่อ + encode รูปใหม่ด้วย canvas — คืน **ไฟล์เดิม** ถ้าย่อไม่ได้ หรือย่อแล้วไม่เล็กลง
 * ไม่เคยโยน error (ล้มเมื่อไหร่ = ใช้ไฟล์เดิม) เพื่อไม่ให้การอัพโหลดพังเพราะขั้นตอนนี้
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!isCompressibleImage(file)) return file;
  if (file.size <= IMAGE_COMPRESS_OVER_MB * MB) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    // ย่อแล้วไม่เล็กลง (เช่น PNG ลายเส้น) — เก็บไฟล์เดิมไว้ดีกว่า
    if (!blob || blob.size >= file.size) return file;

    // นามสกุลต้องตรงกับเนื้อไฟล์จริง — isImagePath()/การแสดง preview อ่านจากนามสกุล
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // decode ไม่ได้ (ฟอร์แมตแปลก / หน่วยความจำไม่พอ) — อัพไฟล์เดิมไปตามปกติ
    return file;
  }
}

/** ย่อทั้งชุด (ทำทีละไฟล์ — เลี่ยงการถอดรหัสรูปหลายใบพร้อมกันจนมือถือหน่วยความจำไม่พอ) */
export async function compressImages(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) out.push(await compressImageFile(f));
  return out;
}
