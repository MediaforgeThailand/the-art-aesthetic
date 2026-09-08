/**
 * URL ของแอป Influencer (repo `the-art-influencer` — แยกออกไป 2026-09-08, ใช้ Supabase ตัวเดียวกัน)
 *
 * ไฟล์นี้จงใจไม่ import อะไรเลย เพราะถูกใช้ 2 ที่ที่ bundle คนละแบบ:
 * - `src/lib/constants.ts` re-export เป็น `INFLU_APP_URL` ให้หน้าประตู / sidebar / `/start` / แดชบอร์ด
 * - `next.config.ts` ใช้ทำ redirect ของ URL เดิม (`/influencers`, `/influ-*`, `/influencer-management`)
 *   ไปแอปใหม่ — บุ๊กมาร์ก/ทางลัด PWA ที่ทีมติดตั้งไว้ก่อนแยก repo ยังเข้าถูกที่
 *
 * ย้ายโดเมนแอป Influencer = แก้ค่านี้ค่าเดียว (+ Vault `influ_app_url` และ `TEAM_APP_URL` ฝั่งโน้น)
 * ยังเป็น `.vercel.app` ไปก่อน (ยังไม่ผูก subdomain) ⇒ คุกกี้ session แยกจากแอปนี้ ต้องล็อกอินอีกรอบที่นั่น
 */
export const INFLU_APP_URL = "https://the-art-influencer.vercel.app";
