import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // ให้ตรงกับ "exclude" ของ tsconfig.json — โค้ดที่ถอดออกไปแล้วกับ edge function
    // ของ Deno ไม่ได้อยู่ใน type-check ของแอป จึงไม่ควรถูกนับเป็น error ของ lint ด้วย
    // (supabase/functions ใช้ deno-lint ของตัวเอง มี deno-lint-ignore กำกับอยู่แล้ว)
    "archive/**",
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
