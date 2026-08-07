"use client";

/**
 * เตรียมไฟล์ก่อนอัพขึ้น Supabase Storage
 *
 * ทำไมต้องมี: ทีมอัพรูปจากมือถือ (3-12MB/รูป) และวิดีโองาน ซึ่งกินโควตา storage เร็วมาก
 * และไฟล์ใหญ่ยิ่งอัพช้า/หลุด — ที่นี่จึง
 *   1. **ย่อรูปในเบราว์เซอร์** ให้ด้านยาวสุดไม่เกิน IMAGE_MAX_DIMENSION แล้ว encode ใหม่
 *      (คุณภาพพอสำหรับ "ตรวจงาน" ซึ่งเป็นจุดประสงค์ของไฟล์ในระบบนี้ — ไฟล์ต้นฉบับความละเอียดเต็ม
 *      อยู่ใน Google Drive ของทีมอยู่แล้ว)
 *   2. **กันไฟล์เกินเพดาน bucket** ตั้งแต่ฝั่งหน้าเว็บ พร้อมข้อความบอกขนาดจริง
 *      แทนที่จะปล่อยให้อัพไปครึ่งทางแล้วเจอ error ดิบจาก storage
 *
 * **วิดีโอยังไม่ถูกบีบอัดอัตโนมัติ** — การ transcode ในเบราว์เซอร์ต้องใช้ WebCodecs + muxer
 * ซึ่งเป็นงานแยกก้อนและต้องทดสอบกับไฟล์จริงหลายฟอร์แมต; ตอนนี้จึงแค่กันไฟล์เกินเพดาน
 * แล้วบอกให้แนบเป็นลิงก์ Drive แทน (ดู `videoTooLargeHint`)
 */

import {
  IMAGE_COMPRESS_OVER_MB,
  IMAGE_MAX_DIMENSION,
  MAX_UPLOAD_MB,
} from "@/lib/constants";

const MB = 1024 * 1024;

/** ฟอร์แมตรูปที่ decode ในเบราว์เซอร์ได้ (heic ของ iPhone decode ไม่ได้ → ปล่อยผ่านตามเดิม) */
function isCompressibleImage(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/i.test(file.type);
}

export function formatMB(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes >= MB ? 1 : 2)} MB`;
}

/** ย่อ + encode รูปใหม่ด้วย canvas — คืนไฟล์เดิมถ้าย่อไม่ได้หรือย่อแล้วไม่เล็กลง */
async function compressImage(file: File): Promise<File> {
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

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // decode ไม่ได้ (ฟอร์แมตแปลก / หน่วยความจำไม่พอ) — อัพไฟล์เดิมไปตามปกติ
    return file;
  }
}

export interface PreparedUpload {
  file: File;
  /** ถูกย่อ/บีบอัดไหม — ใช้บอกผู้ใช้ว่าไฟล์ที่เก็บเป็นเวอร์ชันย่อ */
  compressed: boolean;
  originalSize: number;
}

/**
 * เตรียมไฟล์ 1 ไฟล์ — โยน Error พร้อมข้อความภาษาไทยถ้าไฟล์ใหญ่เกินเพดาน
 * (ผู้เรียกจับแล้วส่งเข้า showError ของหน้าตัวเอง)
 */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const out = await compressImage(file);
  if (out.size > MAX_UPLOAD_MB * MB) {
    throw new Error(
      `ไฟล์ "${file.name}" ใหญ่ ${formatMB(out.size)} เกินเพดาน ${MAX_UPLOAD_MB} MB — ` +
        `บีบอัด/ตัดต่อให้เล็กลงก่อน หรือแนบเป็นลิงก์ Google Drive แทน`
    );
  }
  return { file: out, compressed: out !== file, originalSize: file.size };
}

/** เตรียมหลายไฟล์พร้อมกัน — ไฟล์แรกที่เกินเพดานจะโยน Error ทันที (ไม่อัพทั้งชุด) */
export async function prepareUploads(files: File[]): Promise<PreparedUpload[]> {
  const out: PreparedUpload[] = [];
  for (const f of files) out.push(await prepareUpload(f));
  return out;
}
