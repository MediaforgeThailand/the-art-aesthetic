import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** เพดานขนาดไฟล์ต่อไฟล์ของโปรเจกต์ Supabase
 *
 *  ค่านี้ "ไม่ได้" ตั้งที่ bucket (bucket documents ตั้ง file_size_limit = null โดยตั้งใจ —
 *  ดู AGENTS.md: ตั้งด้วย SQL ตรงๆ แล้วอัปโหลดพังทุกขนาด) แต่มาจากลิมิตกลางของโปรเจกต์
 *  ที่ **Dashboard → Storage → Settings** — ตัวเลขตรงนี้ต้องตั้งให้ตรงกับที่นั่นเสมอ
 *  (ตั้งไว้ 500MB ตามที่ผู้ใช้อัพแพลน Supabase แล้วเมื่อ 2026-08-08; เดิม Free plan = 50MB)
 *
 *  รูปถูกย่อในเบราว์เซอร์ก่อนถึงจุดนี้แล้ว (`compressImageFile` ใน @/lib/upload-prepare)
 *  เพดานนี้จึงกระทบกับวิดีโอเป็นหลัก */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** ข้อความอธิบายเมื่อไฟล์ใหญ่เกินเพดาน — คืน null เมื่อขนาดผ่าน
 *  (เช็คตั้งแต่ก่อนยิงขึ้น server: ไม่งั้นผู้ใช้ต้องรออัพวิดีโอเป็นนาทีแล้วค่อยเจอ error) */
export function fileTooLargeMessage(file: File): string | null {
  if (file.size <= MAX_UPLOAD_BYTES) return null;
  return `ไฟล์ "${file.name}" ใหญ่ ${formatFileSize(file.size)} — เกินเพดาน ${formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์ของระบบ ให้บีบอัดวิดีโอให้เล็กลง หรือวางลิงก์ Google Drive ในช่องลิงก์แทน`;
}

/** ตรวจทั้งชุดก่อนเริ่มอัพ — คืน null เมื่อผ่านหมด
 *  บอกชื่อ+ขนาดของไฟล์ที่เกิน "ทุกไฟล์" เพื่อให้รู้ทีเดียวว่าต้องไปบีบไฟล์ไหนบ้าง
 *  (ถ้าบอกทีละไฟล์ ทีมต้องเลือกไฟล์ใหม่ซ้ำหลายรอบกว่าจะรู้ครบ) */
export function tooLargeSummary(files: File[]): string | null {
  const over = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
  if (over.length === 0) return null;
  if (over.length === 1) return fileTooLargeMessage(over[0]);
  const list = over
    .map((f) => `"${f.name}" (${formatFileSize(f.size)})`)
    .join(", ");
  return `ไฟล์ ${over.length} ไฟล์ใหญ่เกินเพดาน ${formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์: ${list} — ให้บีบอัดวิดีโอให้เล็กลง หรือวางลิงก์ Google Drive ในช่องลิงก์แทน`;
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
    return `ไฟล์ใหญ่เกินเพดาน ${formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์ที่ Supabase ยอมรับ — ให้บีบอัดวิดีโอ หรือวางลิงก์ Google Drive แทน`;
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
  const tooLarge = fileTooLargeMessage(file);
  if (tooLarge) return { error: { message: tooLarge } };

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
