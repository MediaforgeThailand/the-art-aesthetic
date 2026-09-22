"use client";

/**
 * ย่อ/บีบอัดรูปในเบราว์เซอร์ก่อนอัพขึ้น storage
 *
 * ทำไมต้องมี: ทีมอัพรูปจากมือถือ (3-12MB/รูป) ซึ่งกินโควตา storage เร็วมากและอัพช้า
 * ทั้งที่จุดประสงค์ของไฟล์ในระบบนี้คือ "ให้ผู้ตรวจกดดูเพื่อตรวจงาน + วัด KPI"
 * ไม่ใช่เก็บต้นฉบับความละเอียดเต็ม (ต้นฉบับอยู่ใน Google Drive ของทีมอยู่แล้ว)
 *
 * ขอบเขต:
 * - **รูป** (jpeg/png/webp ที่เบราว์เซอร์ decode ได้) — heic ของ iPhone decode ไม่ได้
 *   จึงส่งต่อไฟล์เดิม
 * - **วิดีโอ** ปิดรับอยู่ (`VIDEO_UPLOAD_ENABLED = false` — แพลน Free) จึงส่งไฟล์เดิมกลับไป
 *   ให้ `uploadBlockedMessage` ปฏิเสธ; ตัวบีบ `compressVideoFile` (@/lib/video-compress)
 *   ยังอยู่ครบ รอวันเปิดสวิตช์กลับ — ไฟล์อื่น (pdf ฯลฯ) ส่งต่อตามเดิม
 *
 * จุดอัพโหลดทุกที่ควรเรียกผ่าน `prepareUploadFile`/`prepareUploadFiles` ตัวเดียว จะได้ไม่ต้อง
 * จำว่าไฟล์ชนิดไหนต้องผ่านตัวย่อตัวไหน
 *
 * เพดานขนาดไฟล์อยู่ที่ `MAX_UPLOAD_BYTES` ใน `@/lib/upload` ที่เดียว — ที่นี่ไม่เช็คขนาด
 * (ผู้เรียกต้องย่อก่อน แล้วค่อยเช็คเพดาน เพราะไฟล์ที่เกินมักผ่านได้หลังย่อ)
 */

import {
  IMAGE_COMPRESS_OVER_MB,
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_DIMENSION,
  VIDEO_UPLOAD_ENABLED,
} from "@/lib/constants";
import { compressVideoFile } from "@/lib/video-compress";

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
      canvas.toBlob(resolve, "image/jpeg", IMAGE_JPEG_QUALITY)
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

/** เตรียมไฟล์เดียวก่อนอัพ — รูปย่อด้วย canvas, วิดีโอบีบด้วย WebCodecs, ที่เหลือส่งต่อตามเดิม
 *  `onProgress` มีค่าเฉพาะตอนบีบวิดีโอ (0–1) เพราะเป็นขั้นตอนเดียวที่กินเวลาเป็นนาที */
export async function prepareUploadFile(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<File> {
  if (file.type.startsWith("video/")) {
    // ปิดรับวิดีโออยู่ (แพลน Free) — ส่งไฟล์เดิมกลับไปให้ `uploadBlockedMessage` ปฏิเสธทันที
    // ไม่ต้องเสียเวลาบีบเป็นนาทีแล้วค่อยบอกว่าอัพไม่ได้
    if (!VIDEO_UPLOAD_ENABLED) return file;
    return compressVideoFile(file, onProgress);
  }
  return compressImageFile(file);
}

/** เตรียมทั้งชุด (ทำทีละไฟล์ — เลี่ยงการถอด/เข้ารหัสหลายไฟล์พร้อมกันจนมือถือหน่วยความจำไม่พอ)
 *  `onProgress` รายงานว่ากำลังทำไฟล์ที่เท่าไรจากทั้งหมด และไฟล์นั้นไปถึงไหนแล้ว */
export async function prepareUploadFiles(
  files: File[],
  onProgress?: (p: { index: number; total: number; pct: number }) => void
): Promise<File[]> {
  const out: File[] = [];
  for (const [index, f] of files.entries()) {
    out.push(
      await prepareUploadFile(f, (pct) =>
        onProgress?.({ index, total: files.length, pct })
      )
    );
  }
  return out;
}
