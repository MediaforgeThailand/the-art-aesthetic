import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
