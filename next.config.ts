import type { NextConfig } from "next";
import { INFLU_APP_URL } from "./src/lib/influ-app-url";

const nextConfig: NextConfig = {
  experimental: {
    // client cache หน้า dynamic 30 วิ — สลับเมนูไปมาไม่ต้องโหลดใหม่ทุกคลิก
    // ปลอดภัยเพราะ mutation ทุกจุดเรียก router.refresh() และ /tasks มี Realtime อยู่แล้ว
    staleTimes: {
      dynamic: 30,
    },
  },
  // URL เดิมของระบบ Influencer (ก่อนแยก repo 2026-09-08) → แอปใหม่ทั้ง path + query
  // เพื่อให้บุ๊กมาร์ก/ทางลัด PWA ที่ทีมติดตั้งไว้ยังเข้าถูกที่ — redirect ของ next.config ทำงาน
  // ก่อน proxy.ts จึงไม่โดนเด้งไป /login ของแอปนี้ก่อน; permanent=false เพราะโดเมนปลายทางจะย้ายอีก
  async redirects() {
    return [
      {
        source: "/influencers/:path*",
        destination: `${INFLU_APP_URL}/influencers/:path*`,
        permanent: false,
      },
      {
        source: "/influencer-management/:path*",
        destination: `${INFLU_APP_URL}/influencer-management/:path*`,
        permanent: false,
      },
      {
        source:
          "/:page(influ-hunting|influ-calendar|influ-cost|influ-campaigns|influ-doctors|influ-gallery|influ-dashboard)",
        destination: `${INFLU_APP_URL}/:page`,
        permanent: false,
      },
    ];
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
