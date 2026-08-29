/**
 * คลังไฟล์รวมของระบบงาน (All Media)
 *
 * ไฟล์ในระบบ Task ถูกเก็บกระจาย 3 ที่ตามจุดที่อัพโหลด — ที่นี่รวบให้เป็นรายการเดียว
 * เพื่อให้หน้า /all-media และแท็บรายบุคคลใน Team Workload ใช้ตรรกะเดียวกัน:
 *   1. `task_files`          — ไฟล์งานของการ์ด (รวมไฟล์ Brief ของการ์ด brief)
 *   2. `task_subtask_files`  — ไฟล์แนบของงานย่อย
 *   3. `task_comments.file_path` — ไฟล์แนบในแชทของงาน
 *
 * **เจ้าของไฟล์ = ผู้รับผิดชอบการ์ด (`tasks.assignee_id`)** ไม่ใช่คนที่กดอัพโหลด —
 * ตารางไฟล์ไม่ได้เก็บผู้อัพโหลดไว้ และผู้ใช้ต้องการดู "งานของใคร" ซึ่งคือเจ้าของการ์ด
 * (ถ้าวันหนึ่งต้องแยก "ใครอัพ" ออกจาก "งานของใคร" ต้องเพิ่มคอลัมน์ uploaded_by ก่อน)
 */

/* เฉพาะฟอร์แมตที่ Chrome/Edge เปิดได้จริง — .heic/.avi ไม่รองรับ ให้ตกไปเป็นไฟล์แนบธรรมดา
   (นิยามไว้ที่นี่เพราะ lib นี้ถูกใช้ทั้งฝั่ง server และ client — task-card re-export ต่อให้
   โค้ดเดิมที่ import จากที่นั่นใช้ได้เหมือนเดิม) */
export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(path);
}

export function isVideoPath(path: string): boolean {
  return /\.(mp4|mov|webm|m4v)$/i.test(path);
}

/**
 * src ของ `<video>` ที่ใช้เป็น "รูปหน้าปก" (thumbnail) — **ต้องต่อ media fragment `#t=`**
 * ไม่งั้นเบราว์เซอร์ที่ `preload="metadata"` โหลดแค่ header แล้ว **ไม่วาดเฟรมไหนเลย**
 * (ได้ช่องเทาๆ ว่างแทนรูป — อาการที่ทีมเจอบนการ์ดงานที่เป็นวิดีโอ);
 * `#t=0.1` สั่งให้ seek ไปวินาทีนั้นแล้ววาดเฟรมออกมาเป็นภาพนิ่ง (Supabase Storage
 * รองรับ range request จึงดึงมาแค่ช่วงต้นไฟล์ ไม่ได้โหลดทั้งคลิป)
 * ใช้เฉพาะกับ `<video>` ที่เป็นรูปหน้าปก — ตัวเล่นจริง (lightbox/แผงงาน) ไม่ต้องใช้
 */
export function videoThumbSrc(url: string): string {
  return `${url}#t=0.1`;
}

export type MediaKind = "image" | "video" | "other";

export const MEDIA_KINDS: Record<
  MediaKind,
  { label: string; chip: string }
> = {
  image: { label: "รูปภาพ", chip: "border border-brand-200 bg-brand-50 text-brand-700" },
  video: { label: "วิดีโอ", chip: "border border-violet-200 bg-violet-50 text-violet-700" },
  other: { label: "ไฟล์อื่นๆ", chip: "border border-stone-200 bg-stone-100 text-stone-600" },
};

export const MEDIA_KIND_ORDER: MediaKind[] = ["image", "video", "other"];

/** ที่มาของไฟล์ — บอกผู้ใช้ว่าไฟล์นี้ถูกแนบไว้ตรงไหนของงาน */
export type MediaSource = "task" | "subtask" | "comment";

export const MEDIA_SOURCES: Record<MediaSource, string> = {
  task: "ไฟล์งาน",
  subtask: "งานย่อย",
  comment: "ในแชท",
};

export interface MediaItem {
  /** unique ต่อรายการ = `${source}:${row id}` (id ของแต่ละตารางซ้ำกันเองไม่ได้ แต่ข้ามตารางได้) */
  key: string;
  source: MediaSource;
  filePath: string;
  fileName: string | null;
  /** เวลาอัพโหลด (created_at ของแถวไฟล์) */
  uploadedAt: string;
  kind: MediaKind;
  taskId: string;
  taskTitle: string;
  /** ผู้รับผิดชอบการ์ด — null = ยังไม่มีผู้รับผิดชอบ */
  assigneeId: string | null;
}

export function mediaKindOf(path: string): MediaKind {
  if (isImagePath(path)) return "image";
  if (isVideoPath(path)) return "video";
  return "other";
}

/** ชื่อไฟล์ที่แสดง — ไม่มีชื่อจริงให้ตัดเอาท้าย path (ซึ่งมี timestamp นำหน้า) */
export function mediaDisplayName(item: MediaItem): string {
  if (item.fileName) return item.fileName;
  const tail = item.filePath.split("/").pop() ?? item.filePath;
  return tail.replace(/^\d+_([a-z0-9]{4}_)?/i, "");
}

/* ---------- ช่วงเวลาของตัวกรอง ---------- */

export type MediaRangeKey = "7d" | "14d" | "1m" | "3m" | "all" | "custom";

export const MEDIA_RANGES: { key: MediaRangeKey; label: string }[] = [
  { key: "7d", label: "7 วันล่าสุด" },
  { key: "14d", label: "14 วันล่าสุด" },
  { key: "1m", label: "1 เดือนล่าสุด" },
  { key: "3m", label: "3 เดือนล่าสุด" },
  { key: "all", label: "ทั้งหมด" },
  { key: "custom", label: "เลือกช่วงเอง" },
];

/**
 * แปลงตัวเลือกช่วงเป็นวันเริ่ม (YYYY-MM-DD) — อิง "วันนี้" ที่ผู้เรียกส่งมา (เวลาไทย)
 * คืน null = ไม่จำกัดวันเริ่ม
 */
export function rangeStart(key: MediaRangeKey, todayStr: string): string | null {
  if (key === "all" || key === "custom") return null;
  const base = new Date(`${todayStr}T00:00:00`);
  const back = key === "7d" ? 6 : key === "14d" ? 13 : key === "1m" ? 29 : 89;
  base.setDate(base.getDate() - back);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/** วันของ timestamp ตามเวลาไทย (YYYY-MM-DD) — ใช้เทียบกับตัวกรองช่วงวัน */
export function thaiDayOf(ts: string): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}
