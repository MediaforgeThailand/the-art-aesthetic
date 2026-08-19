import type { MetadataRoute } from "next";

/**
 * Web App Manifest — ให้ทีมติดตั้งแอปลงหน้าจอโฮมมือถือได้ (PWA)
 * Next สร้างไฟล์นี้เป็น /manifest.webmanifest และใส่ <link rel="manifest"> ให้เอง
 *
 * ข้อควรรู้:
 * - **ต้องปล่อยผ่านใน `src/proxy.ts`** เบราว์เซอร์ดึง manifest แบบไม่ส่ง cookie
 *   ถ้าไม่ปล่อยผ่านจะโดน redirect ไป /login แล้วติดตั้งไม่ได้ (เจอตอน audit 2026-08-05)
 * - start_url เป็น "/start" — หน้านั้นส่งต่อไปหน้าแรกที่ผู้ใช้คนนั้นมีสิทธิ์เข้าเอง
 *   (ทีม influ ไม่มีสิทธิ์ data จะเด้งเข้า /influencers แทน) — เปิดจากไอคอน PWA
 *   จึงเข้าหน้างานตรงๆ ไม่ต้องผ่านหน้าประตูรวมช่องทางที่ root ("/" เปลี่ยนเป็น
 *   หน้าประตูสาธารณะเมื่อ 2026-08-19)
 * - ไอคอนสร้างจาก `scripts/gen-icons.mjs` (sharp) — แก้ดีไซน์แล้วรันใหม่
 * - iOS: ติดตั้งได้ทาง Safari > Share > "เพิ่มไปยังหน้าจอโฮม" เท่านั้น (ไม่มี install prompt)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The ART Aesthetic — ระบบทีม Aesthetic",
    short_name: "Aesthetic",
    description:
      "ระบบจัดการหลังบ้านแผนก Aesthetic: งานทีม, Influencer, Price List และรายงาน",
    lang: "th",
    dir: "ltr",
    // id คือ "ตัวตน" ของแอปที่ติดตั้งไปแล้ว — **ห้ามแก้เด็ดขาด** ไม่งั้นเบราว์เซอร์
    // ถือว่าเป็นคนละแอป เกิดไอคอนซ้ำบนหน้าจอโฮมของทุกคน (start_url แก้ได้เพราะ
    // id ตรึงตัวตนไว้แล้ว — เครื่องที่ติดตั้งอยู่จะอัพเดท start_url ตามเอง)
    id: "/",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    background_color: "#faf6f2",
    theme_color: "#a96a58",
    categories: ["business", "productivity", "medical"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // ทางลัดตอนกดค้างที่ไอคอนแอป — เลือกเฉพาะงานที่ทีมเปิดบ่อยที่สุด
    shortcuts: [
      {
        name: "งานของทีม",
        short_name: "Task",
        url: "/tasks",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Influ Management",
        short_name: "Influ",
        url: "/influencers",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Price List",
        short_name: "ราคา",
        url: "/price-list",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
