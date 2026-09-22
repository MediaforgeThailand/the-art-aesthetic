import { describe, expect, it } from "vitest";
import { VIDEO_UPLOAD_ENABLED } from "@/lib/constants";
import {
  MAX_UPLOAD_BYTES,
  uploadBlockedMessage,
  uploadBlockedSummary,
} from "@/lib/upload";

/** สร้าง File ปลอมตามขนาดที่ต้องการโดยไม่ต้องจองหน่วยความจำจริง
 *  (เทสต์สนใจแค่ `size`/`type`/`name` ซึ่งเป็นสิ่งเดียวที่ตัวเช็คอ่าน) */
function fakeFile(name: string, type: string, size: number): File {
  const f = new File([], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

const img = (size: number, name = "a.jpg") => fakeFile(name, "image/jpeg", size);

describe("uploadBlockedMessage", () => {
  it("ปล่อยรูปขนาดปกติผ่าน", () => {
    expect(uploadBlockedMessage(img(500_000))).toBeNull();
  });

  it("กันไฟล์ที่ใหญ่เกินเพดาน", () => {
    const msg = uploadBlockedMessage(img(MAX_UPLOAD_BYTES + 1));
    expect(msg).toContain("เกินเพดาน");
  });

  it("ไฟล์เท่าเพดานพอดียังผ่าน (เกณฑ์เป็น > ไม่ใช่ >=)", () => {
    expect(uploadBlockedMessage(img(MAX_UPLOAD_BYTES))).toBeNull();
  });

  // ตัวกันวิดีโอคือหัวใจของการอยู่ในโควตาแพลน Free — ถ้าสวิตช์ถูกเปิดกลับ เทสต์ชุดนี้ต้องกลับด้าน
  it.skipIf(VIDEO_UPLOAD_ENABLED)("กันวิดีโอจาก MIME", () => {
    const msg = uploadBlockedMessage(fakeFile("clip.mp4", "video/mp4", 1_000));
    expect(msg).toContain("ไม่รับอัพโหลดวิดีโอ");
  });

  it.skipIf(VIDEO_UPLOAD_ENABLED)(
    "กันวิดีโอจากนามสกุล แม้ MIME จะว่าง (บางเครื่องไม่ใส่ type มาให้)",
    () => {
      for (const name of ["clip.MOV", "a.mkv", "b.3gp", "c.webm"]) {
        expect(uploadBlockedMessage(fakeFile(name, "", 1_000))).toContain(
          "ไม่รับอัพโหลดวิดีโอ"
        );
      }
    }
  );

  it("ไม่เผลอกันไฟล์ที่ชื่อมีคำว่า video อยู่เฉยๆ", () => {
    expect(uploadBlockedMessage(img(1_000, "video-cover.jpg"))).toBeNull();
  });
});

describe("uploadBlockedSummary", () => {
  it("คืน null เมื่อผ่านหมด", () => {
    expect(uploadBlockedSummary([img(1_000), img(2_000)])).toBeNull();
  });

  it.skipIf(VIDEO_UPLOAD_ENABLED)("รวมคลิปหลายไฟล์เป็นข้อความเดียว", () => {
    const msg = uploadBlockedSummary([
      fakeFile("a.mp4", "video/mp4", 10),
      fakeFile("b.mp4", "video/mp4", 10),
      img(1_000),
    ]);
    expect(msg).toContain("2 ไฟล์ที่เลือกเป็นคลิป");
    expect(msg).toContain("Google Drive");
  });

  it.skipIf(VIDEO_UPLOAD_ENABLED)(
    "ปนกันระหว่างคลิปกับไฟล์ใหญ่เกิน — บอกทั้งสองเหตุผล",
    () => {
      const msg = uploadBlockedSummary([
        fakeFile("a.mp4", "video/mp4", 10),
        img(MAX_UPLOAD_BYTES + 1, "big.jpg"),
      ]);
      expect(msg).toContain("อัพไม่ได้ 2 ไฟล์");
      expect(msg).toContain("big.jpg");
    }
  );
});
