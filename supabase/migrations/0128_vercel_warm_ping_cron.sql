-- ============================================================
-- 0128 — mirror ของ cron job `vercel-warm-ping` ที่เคยตั้งมือบน Supabase (2026-08-03 — ดู AGENTS.md "กัน cold start")
--
-- ยิง GET /api/warm ของแอปหลักทุก 5 นาที ให้ Vercel function ไม่ cold start (route นั้น force-dynamic
-- และ proxy ปล่อยผ่านโดยไม่ต้องล็อกอิน) — ก่อนหน้านี้เป็น object เดียวใน DB ที่ไม่มีไฟล์ migration
-- cron.schedule ด้วยชื่อเดิม = อัปเดตงานเดิม (idempotent) จึง apply ซ้ำได้ ไม่เกิดงานซ้อน
--
-- ย้ายโดเมน/ย้าย server: แก้ URL ที่นี่แล้ว apply ใหม่ หรือ `select cron.unschedule('vercel-warm-ping')`
-- (self-host ที่รัน Node ค้างไว้ไม่มี cold start — ไม่ต้องมี job นี้)
-- ============================================================

select cron.schedule(
  'vercel-warm-ping',
  '*/5 * * * *',
  $$ select net.http_get(url := 'https://the-art-aesthetic.vercel.app/api/warm', timeout_milliseconds := 10000) $$
);
