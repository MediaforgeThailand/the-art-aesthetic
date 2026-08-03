import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // client cache หน้า dynamic 30 วิ — สลับเมนูไปมาไม่ต้องโหลดใหม่ทุกคลิก
    // ปลอดภัยเพราะ mutation ทุกจุดเรียก router.refresh() และ /tasks มี Realtime อยู่แล้ว
    staleTimes: {
      dynamic: 30,
    },
  },
  // security headers พื้นฐาน — ระบบภายในโรงพยาบาล กันฝัง iframe/เดา MIME/รั่ว referrer
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
