import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ---------- ขอบเขตโมดูล (2026-09-08) — ดู src/influ/README.md ----------
// ระบบ Influencer = src/app/(influ)/** + src/influ/**  ·  ฝั่งอื่น (Team/Wellness/หน้า public/ของกลาง)
// ล้วงเข้าไปข้างในระบบ Influ ตรงๆ ไม่ได้ ใช้ได้เฉพาะ "หน้าต่าง" src/influ/public/*
// และระบบ Influ ห้าม import โค้ดของ Team/Wellness กลับ (เตรียมแยกเป็น repo ของตัวเอง)
const INFLU_FILES = ["src/app/(influ)/**/*.{ts,tsx}", "src/influ/**/*.{ts,tsx}"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // worktree ของ session Claude + build output ที่ค้างอยู่ในนั้น — ไม่ใช่โค้ดแอป
    // และถูก exclude ไว้ใน .git/info/exclude อยู่แล้ว (เคยทำให้ lint เจอ 3,443 error ผี)
    ".claude/**",
    // ให้ตรงกับ "exclude" ของ tsconfig.json — edge function ของ Deno ไม่ได้อยู่ใน
    // type-check ของแอป จึงไม่ควรถูกนับเป็น error ของ lint ด้วย
    // (supabase/functions ใช้ deno-lint ของตัวเอง มี deno-lint-ignore กำกับอยู่แล้ว)
    "supabase/functions/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: INFLU_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/influ/lib/*",
                "@/influ/components/*",
                "@/app/(influ)/*",
                "**/app/(influ)/**",
              ],
              message:
                "โค้ดนอกระบบ Influencer import ได้เฉพาะ @/influ/public/* (ดู src/influ/README.md)",
            },
          ],
        },
      ],
    },
  },
  {
    files: INFLU_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/(app)/*",
                "**/app/(app)/**",
                "@/app/(wellness)/*",
                "**/app/(wellness)/**",
                "@/components/sidebar",
                "@/components/notification-bell",
                "@/components/wellness-shell",
                "@/components/wellness/*",
                "@/lib/wellness-constants",
                "@/lib/media-query",
              ],
              message:
                "ระบบ Influencer ห้ามพึ่งโค้ดของ Team/Wellness — ของที่ใช้ร่วมกันต้องอยู่ใน src/lib หรือ src/components (ดู src/influ/README.md)",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
