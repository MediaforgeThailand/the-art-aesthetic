import { VIDEO_UPLOAD_ENABLED } from "@/lib/constants";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** เพดานขนาดไฟล์ต่อไฟล์ของโปรเจกต์ Supabase
 *
 *  ค่านี้ "ไม่ได้" ตั้งที่ bucket (bucket documents ตั้ง file_size_limit = null โดยตั้งใจ —
 *  ดู AGENTS.md: ตั้งด้วย SQL ตรงๆ แล้วอัปโหลดพังทุกขนาด) แต่มาจากลิมิตกลางของโปรเจกต์
 *  ที่ **Dashboard → Storage → Settings** — ตัวเลขตรงนี้ต้องตั้งให้ตรงกับที่นั่นเสมอ
 *
 *  25MB ตั้งแต่ 2026-09-22 ตอนกลับมาเป็นแพลน Free (โควตารวมทั้งโปรเจกต์ 1GB — ไฟล์ใบละ
 *  500MB แบบเดิมกินโควตาครึ่งหนึ่งได้ในไฟล์เดียว) คู่กับ `VIDEO_UPLOAD_ENABLED = false`
 *  ⇒ ของที่เหลืออัพได้คือรูป (ย่อแล้วมักไม่ถึง 1MB) กับ PDF ผลแลบ
 *
 *  รูปถูกย่อในเบราว์เซอร์ก่อนถึงจุดนี้แล้ว (`compressImageFile` ใน @/lib/upload-prepare) */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** วิดีโอหรือเปล่า — ดูจาก MIME ก่อน (ช่องนี้ว่างได้บนบางเครื่อง) แล้วค่อยตกไปดูนามสกุล */
function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm|avi|mkv|3gp|hevc|mpg|mpeg|wmv|flv)$/i.test(
    file.name
  );
}

/** เหตุผลที่ไฟล์นี้อัพไม่ได้ — คืน null เมื่อผ่าน
 *
 *  เช็คตั้งแต่ก่อนยิงขึ้น server: ไม่งั้นผู้ใช้ต้องรออัพเป็นนาทีแล้วค่อยเจอ error
 *  ครอบ 2 เรื่อง คือ "ชนิดไฟล์ที่ระบบปิดรับ" (วิดีโอ) และ "ใหญ่เกินเพดาน" */
export function uploadBlockedMessage(file: File): string | null {
  if (!VIDEO_UPLOAD_ENABLED && isVideoFile(file)) {
    return `ตอนนี้ระบบไม่รับอัพโหลดวิดีโอ (พื้นที่เก็บไฟล์เต็มโควตา) — ให้อัพคลิปขึ้น Google Drive แล้ววางลิงก์ในช่อง "ลิงก์ไฟล์งาน Google Drive" แทน`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `ไฟล์ "${file.name}" ใหญ่ ${formatFileSize(file.size)} — เกินเพดาน ${formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์ของระบบ ให้วางลิงก์ Google Drive ในช่องลิงก์แทน`;
  }
  return null;
}

/** ตรวจทั้งชุดก่อนเริ่มอัพ — คืน null เมื่อผ่านหมด
 *  บอกชื่อของไฟล์ที่ไม่ผ่าน "ทุกไฟล์" เพื่อให้รู้ทีเดียวว่าต้องเอาไฟล์ไหนออกบ้าง
 *  (ถ้าบอกทีละไฟล์ ทีมต้องเลือกไฟล์ใหม่ซ้ำหลายรอบกว่าจะรู้ครบ) */
export function uploadBlockedSummary(files: File[]): string | null {
  const blocked = files.filter((f) => uploadBlockedMessage(f) !== null);
  if (blocked.length === 0) return null;
  if (blocked.length === 1) return uploadBlockedMessage(blocked[0]);

  const videos = blocked.filter((f) => uploadBlockedMessage(f)!.includes("วิดีโอ"));
  const list = blocked.map((f) => `"${f.name}"`).join(", ");
  if (videos.length === blocked.length) {
    return `ตอนนี้ระบบไม่รับอัพโหลดวิดีโอ (พื้นที่เก็บไฟล์เต็มโควตา) — ${blocked.length} ไฟล์ที่เลือกเป็นคลิป: ${list} ให้อัพขึ้น Google Drive แล้ววางลิงก์แทน`;
  }
  return `อัพไม่ได้ ${blocked.length} ไฟล์: ${list} — วิดีโอต้องไปอยู่บน Google Drive และไฟล์อื่นต้องไม่เกิน ${formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์`;
}

/** แปลง error จาก storage API เป็นข้อความไทยที่บอกทางแก้
 *
 *  หมายเหตุ: storage ตอบ HTTP 400 แต่ใส่โค้ดจริงไว้ใน body (`{"statusCode":"403",...}`)
 *  จึงต้องดูทั้งสองที่ ไม่งั้นเคสสิทธิ์/ไฟล์ใหญ่จะตกไปเป็นข้อความ error ดิบภาษาอังกฤษ */
function storageErrorMessage(httpStatus: number, responseText: string): string {
  let detail = "";
  let bodyStatus = 0;
  try {
    const parsed = JSON.parse(responseText) as {
      message?: string;
      error?: string;
      statusCode?: string;
    };
    detail = parsed.message ?? parsed.error ?? "";
    bodyStatus = Number(parsed.statusCode) || 0;
  } catch {
    detail = responseText.slice(0, 120);
  }
  const code = bodyStatus || httpStatus;

  if (code === 413) {
    return `ไฟล์ใหญ่เกินเพดาน ${formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์ที่ Supabase ยอมรับ — ให้วางลิงก์ Google Drive แทน`;
  }
  // แพลน Free มีโควตารวม 1GB ทั้งโปรเจกต์ — เต็มแล้วจะเด้งกลับมาเป็น 507 พร้อมข้อความอังกฤษ
  if (code === 507 || /quota|exceeded the storage/i.test(detail)) {
    return "พื้นที่เก็บไฟล์ของระบบเต็มโควตาแล้ว — แจ้งผู้ดูแลระบบ และระหว่างนี้ให้วางลิงก์ Google Drive แทน";
  }
  if (code === 401 || code === 403) {
    return "ไม่มีสิทธิ์อัพโหลด หรือเซสชันหมดอายุ — ลองรีเฟรชหน้าแล้วเข้าสู่ระบบใหม่";
  }
  if (code === 409) {
    return "มีไฟล์ชื่อนี้อยู่แล้ว — ลองอัพโหลดใหม่อีกครั้ง";
  }
  return `อัพโหลดไม่สำเร็จ (${code})${detail ? ` — ${detail}` : ""}`;
}

/** อัพโหลดไฟล์เดียวเข้า storage พร้อมรายงานความคืบหน้าเป็นสัดส่วน 0–1
 *
 *  ทำไมไม่ใช้ supabase.storage.upload(): supabase-js ยิงด้วย fetch จึงไม่มี progress —
 *  ไฟล์วิดีโอ 10–46MB ใช้เวลาหลายสิบวินาที ปุ่มค้างเฉยๆ ทำให้ทีมเข้าใจว่า "กดอัพโหลดไม่ได้"
 *  ที่นี่จึงยิง REST endpoint เดียวกันเองผ่าน XHR (รูปแบบ body/header ลอกจาก supabase-js:
 *  FormData มี cacheControl + ไฟล์ในคีย์ว่าง) — ยังใช้ URL จาก env จึงย้าย self-host ได้เหมือนเดิม */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (ratio: number) => void
): Promise<{ error: { message: string } | null }> {
  // ด่านสุดท้ายก่อนยิงจริง — ผู้เรียกเช็คมาแล้วชั้นหนึ่ง แต่ห้ามพึ่งผู้เรียกอย่างเดียว
  // (จุดอัพโหลดใหม่ที่ลืมเช็คจะได้ไม่หลุดวิดีโอขึ้น storage เงียบๆ)
  const blocked = uploadBlockedMessage(file);
  if (blocked) return { error: { message: blocked } };

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { error: { message: "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง" } };
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve({ error: null });
        return;
      }
      resolve({
        error: { message: storageErrorMessage(xhr.status, xhr.responseText) },
      });
    };
    xhr.onerror = () =>
      resolve({
        error: {
          message:
            "เชื่อมต่อไม่สำเร็จระหว่างอัพโหลด — เช็คอินเทอร์เน็ตแล้วลองใหม่ (ไฟล์ใหญ่ควรใช้ Wi-Fi ที่นิ่ง)",
        },
      });
    xhr.onabort = () => resolve({ error: { message: "ยกเลิกการอัพโหลดแล้ว" } });

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}
