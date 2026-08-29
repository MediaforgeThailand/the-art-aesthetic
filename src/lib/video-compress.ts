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
 * `VIDEO_MAX_DIMENSION` เฟรมเรตไม่เกิน `VIDEO_MAX_FPS` และ **กำหนดบิตเรตเป้าหมายเป็นตัวเลข**
 * (คำนวณจากขนาดภาพ × เฟรมเรต ดู `targetBitrateFor`) — เสียงถูกคัดลอกต่อ (หรือแปลงให้เอง
 * ถ้าโค้ดเสียงเดิมใส่ MP4 ไม่ได้) จึงไม่มีทางได้คลิปเงียบ
 *
 * **ทำไมต้องคุมบิตเรตเป็นตัวเลข ไม่ใช่ระดับคุณภาพ (บทเรียน 2026-08-29):** ของเดิมส่งแค่
 * `Quality('medium')` ที่ความละเอียด/เฟรมเรตเดิม — คลิปแนวตั้ง 1080x1920 60fps จากมือถือ
 * จึงออกมาที่ ~6.6 Mbps (จาก 9.35 Mbps) ซึ่งยังสูงกว่าความเร็วที่ดึงไฟล์จาก Supabase (ซิดนีย์)
 * มาถึงออฟฟิศได้จริง ผู้ตรวจกดเล่นแล้ว buffer หมดเป็นระยะ = "กระตุกมาก" (วัดจริง: เล่นได้ 7 วิ
 * ในเวลา 15 วิ, สะดุด 4 ครั้ง, ตกเฟรม 164) — คุมบิตเรตตรงๆ เท่านั้นที่แก้อาการนี้ได้
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
  VIDEO_BITRATE_SLACK,
  VIDEO_BITS_PER_PIXEL,
  VIDEO_COMPRESS_OVER_MB,
  VIDEO_MAX_BITRATE,
  VIDEO_MAX_DIMENSION,
  VIDEO_MAX_FPS,
  VIDEO_MIN_BITRATE,
  VIDEO_SKIP_UNDER_MB,
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

/**
 * บิตเรตเป้าหมาย (bit/s) ของไฟล์หลังบีบ — คิดจากจำนวนพิกเซล × เฟรมเรต
 * แล้วหนีบไว้ในกรอบ `VIDEO_MIN_BITRATE`–`VIDEO_MAX_BITRATE`
 */
function targetBitrateFor(width: number, height: number, fps: number): number {
  const raw = width * height * fps * VIDEO_BITS_PER_PIXEL;
  return Math.round(
    Math.min(VIDEO_MAX_BITRATE, Math.max(VIDEO_MIN_BITRATE, raw))
  );
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
  if (file.size <= VIDEO_SKIP_UNDER_MB * MB) return file;
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

    // อ่านสถิติจากตัวอย่างแพ็กเก็ตช่วงต้นไฟล์ (ไม่ต้องสแกนทั้งไฟล์) เพื่อรู้เฟรมเรตต้นทาง
    // — พลาดก็ไม่เป็นไร ถือว่า 30fps ไว้ก่อน
    const stats = await track.computePacketStats(120).catch(() => null);
    const srcFps = stats?.averagePacketRate;
    const fps = Math.min(
      VIDEO_MAX_FPS,
      srcFps && srcFps > 1 ? Math.round(srcFps) : VIDEO_MAX_FPS
    );
    const targetBitrate = targetBitrateFor(width, height, fps);

    // บิตเรตต้นทาง: ใช้ "ขนาดไฟล์จริง ÷ ความยาว" เป็นหลัก (แม่นกว่าและรวมเสียงด้วย)
    // ตกไปใช้ค่าจากตัวอย่างแพ็กเก็ตเมื่ออ่านความยาวจาก metadata ไม่ได้
    const duration = await track.getDurationFromMetadata().catch(() => null);
    const srcBitrate =
      duration && duration > 0
        ? (file.size * 8) / duration
        : (stats?.averageBitrate ?? Infinity);

    // ไฟล์ที่บิตเรตพอเหมาะและขนาดไม่ใหญ่อยู่แล้ว = เปิดดูได้ลื่นตั้งแต่ต้น ไม่ต้องบีบซ้ำ
    // ให้เสียคุณภาพและเสียเวลารอ
    if (
      file.size <= VIDEO_COMPRESS_OVER_MB * MB &&
      srcBitrate <= targetBitrate * VIDEO_BITRATE_SLACK &&
      scale === 1 &&
      (!srcFps || srcFps <= VIDEO_MAX_FPS * 1.2)
    ) {
      return file;
    }

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
        frameRate: fps,
        // ⚠️ ต้องเป็น `{ bitrate }` เท่านั้น — `new Quality(ตัวเลข)` ของ mediabunny คือ
        // "ระดับคุณภาพ 0–1" ไม่ใช่บิตเรต ใส่เลขบิตเรตลงไปตรงๆ จะได้ไฟล์เสียล้วนขนาด 2MB
        // (เจอมาแล้วตอนทำฟีเจอร์นี้) ส่วน `new Quality('medium')` ปล่อยให้ตัวเข้ารหัสเลือก
        // quantizer เอง = บิตเรตพุ่งตามความละเอียด/เฟรมเรตต้นทาง ซึ่งเป็นต้นเหตุอาการกระตุก
        quality: new Quality({ bitrate: targetBitrate, bitrateMode: "variable" }),
        // มาถึงตรงนี้แปลว่าไฟล์ต้นทาง "หนักเกินจะเล่นลื่น" แล้ว จึงต้องเข้ารหัสใหม่จริงๆ
        // ไม่ใช่คัดลอกแพ็กเก็ตเดิมมาทั้งดุ้น (ซึ่งจะได้บิตเรตเท่าเดิม)
        forceTranscode: true,
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
