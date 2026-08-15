"use client";

/**
 * บีบอัดวิดีโอในเบราว์เซอร์ก่อนอัพขึ้น storage (คู่กับ `compressImageFile` ที่ทำกับรูป)
 *
 * ทำไมต้องมี: ทีมอัพคลิปรีวิวจากมือถือ/กล้อง ไฟล์ละ 100–500MB+ ซึ่งอัพนานมาก
 * กินโควตา storage เร็ว และบางไฟล์ใหญ่เกินเพดานจนอัพไม่ได้เลย ทั้งที่จุดประสงค์ของไฟล์
 * ในระบบนี้คือ "ให้ผู้ตรวจกดดูเพื่อตรวจงาน + วัด KPI" ไม่ใช่เก็บต้นฉบับ
 * (ต้นฉบับอยู่ใน Google Drive ของทีมอยู่แล้ว)
 *
 * วิธีทำ: ใช้ mediabunny (WebCodecs) แปลงเป็น **MP4 / H.264** ย่อด้านยาวสุดเหลือ
 * `VIDEO_MAX_DIMENSION` ที่คุณภาพ `VIDEO_QUALITY_LEVEL` — เสียงถูกคัดลอกต่อ (หรือแปลงให้เอง
 * ถ้าโค้ดเสียงเดิมใส่ MP4 ไม่ได้) จึงไม่มีทางได้คลิปเงียบ
 *
 * เลือก H.264 อย่างเดียวโดยตั้งใจ (ไม่ fallback ไป VP9/AV1/HEVC): ไฟล์ที่ได้ต้องเปิดดูได้
 * ในทุกเบราว์เซอร์ที่ทีมใช้ตรวจงาน — เครื่องไหน encode H.264 ไม่ได้ให้อัพไฟล์เดิมไปตามปกติ
 * ดีกว่าได้ไฟล์เล็กที่คนตรวจเปิดไม่ขึ้น
 *
 * หลักเดียวกับฝั่งรูป: **ไม่มีทางโยน error** — ล้มตรงไหน (เบราว์เซอร์ไม่รองรับ WebCodecs,
 * โค้ดวิดีโอแปลก, หน่วยความจำไม่พอ) ก็คืน "ไฟล์เดิม" แล้วปล่อยให้เพดาน `MAX_UPLOAD_BYTES`
 * ใน `@/lib/upload` เป็นคนกันต่อ พร้อมข้อความให้แนบเป็นลิงก์ Drive แทน
 *
 * mediabunny ถูก `import()` แบบ dynamic เพื่อไม่ให้ไลบรารีติดไปกับ bundle หลัก —
 * โหลดเฉพาะตอนมีคนแนบวิดีโอใหญ่จริงๆ (ทั้งระบบใช้บนมือถือด้วย)
 */

import {
  VIDEO_COMPRESS_OVER_MB,
  VIDEO_MAX_DIMENSION,
  VIDEO_QUALITY_LEVEL,
} from "@/lib/constants";

const MB = 1024 * 1024;

/** ไฟล์ที่เข้าข่ายลองบีบ — mediabunny อ่าน mp4/mov/webm/mkv ได้ ที่เหลือจะไปตกที่ try/catch เอง */
function isCompressibleVideo(file: File): boolean {
  return file.type.startsWith("video/");
}

/** H.264 ต้องการความกว้าง/สูงเป็นเลขคู่ */
function evenDim(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** เบราว์เซอร์รองรับ WebCodecs ครบทั้งขาถอดและขาเข้ารหัสหรือไม่ */
function hasWebCodecs(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.VideoEncoder !== "undefined" &&
    typeof window.VideoDecoder !== "undefined"
  );
}

/**
 * บีบวิดีโอ 1 ไฟล์ — คืน **ไฟล์เดิม** เมื่อบีบไม่ได้ หรือบีบแล้วไม่เล็กลง
 * `onProgress` รายงานความคืบหน้าเป็นสัดส่วน 0–1 (การแปลงกินเวลาเป็นนาทีในไฟล์ใหญ่
 * ต้องมีอะไรขยับให้ผู้ใช้เห็น ไม่งั้นจะคิดว่าเครื่องค้างแล้วปิดแท็บทิ้ง)
 */
export async function compressVideoFile(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<File> {
  if (!isCompressibleVideo(file)) return file;
  if (file.size <= VIDEO_COMPRESS_OVER_MB * MB) return file;
  if (!hasWebCodecs()) return file;

  let input: { dispose: () => void } | null = null;
  try {
    const {
      ALL_FORMATS,
      BlobSource,
      BufferTarget,
      Conversion,
      Input,
      Mp4OutputFormat,
      Output,
      Quality,
      canEncodeVideo,
    } = await import("mediabunny");

    const source = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    input = source;

    const track = await source.getPrimaryVideoTrack();
    // ไม่มีภาพ (ไฟล์เสียงล้วน) หรือเบราว์เซอร์ถอดรหัสวิดีโอนี้ไม่ได้ — ปล่อยผ่าน
    if (!track || !(await track.canDecode())) return file;

    // ย่อโดยกำหนด "ด้านเดียว" แล้วปล่อยให้ไลบรารีคำนวณอีกด้านตามสัดส่วนเดิม
    // (ถ้าส่งทั้ง width และ height ไลบรารีจะบังคับให้ระบุ `fit` ด้วย และเสี่ยงได้ขอบดำ
    //  เมื่อสัดส่วนไม่ลงตัว) — คลิปที่เล็กกว่าเพดานอยู่แล้วไม่ต้องย่อ เอาแค่ลดบิตเรต
    const scale = Math.min(
      1,
      VIDEO_MAX_DIMENSION / Math.max(track.displayWidth, track.displayHeight)
    );
    const width = evenDim(track.displayWidth * scale);
    const height = evenDim(track.displayHeight * scale);
    const resize =
      scale === 1
        ? {}
        : track.displayHeight >= track.displayWidth
          ? { height: VIDEO_MAX_DIMENSION }
          : { width: VIDEO_MAX_DIMENSION };

    if (!(await canEncodeVideo("avc", { width, height }))) return file;

    const target = new BufferTarget();
    const conversion = await Conversion.init({
      input: source,
      output: new Output({
        // in-memory = ย้าย moov ไปหัวไฟล์ ทำให้กดดูได้ทันทีโดยไม่ต้องโหลดจนจบ
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target,
      }),
      video: {
        codec: "avc",
        ...resize,
        quality: new Quality(VIDEO_QUALITY_LEVEL),
      },
      // เสียง: ไม่ตั้งค่าใดๆ = ไลบรารีคัดลอกของเดิมมาตรงๆ ถ้าใส่ MP4 ได้ (ไม่เสียคุณภาพ)
      // ไม่ได้ค่อยแปลงให้เอง
      showWarnings: false,
    });
    // ไฟล์ที่ประกอบเป็น MP4 ไม่ได้ (เช่นแทร็กถูกตัดทิ้งหมด) — อัพของเดิมไปดีกว่า
    if (!conversion.isValid) return file;
    if (onProgress) conversion.onProgress = (ratio) => onProgress(ratio);

    await conversion.execute();

    const buffer = target.buffer;
    // บีบแล้วไม่เล็กลง (คลิปสั้นบิตเรตต่ำอยู่แล้ว) — เก็บต้นฉบับไว้ดีกว่า
    if (!buffer || buffer.byteLength >= file.size) return file;

    // นามสกุลต้องตรงกับเนื้อไฟล์จริง — isVideoPath()/การแสดง preview อ่านจากนามสกุล
    const name = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    return new File([buffer], name, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
  } catch (err) {
    // ล้มตรงไหนก็ตาม = อัพไฟล์เดิมไปตามปกติ (เพดานขนาดไฟล์เป็นคนกันต่อ)
    // ผู้ใช้ไม่ต้องรู้ แต่ตอน dev ต้องเห็นสาเหตุ ไม่งั้นไล่บั๊กไม่ได้เลยเพราะเงียบสนิท
    if (process.env.NODE_ENV !== "production") {
      console.error("[video-compress] ใช้ไฟล์เดิมเพราะบีบไม่สำเร็จ:", err);
    }
    return file;
  } finally {
    input?.dispose();
  }
}
