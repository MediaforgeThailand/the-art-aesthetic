-- ============================================================
-- 0129 — อุ่นเครื่อง Vercel function ของ **แอป Influencer** ด้วย (audit ความช้า 2026-09-10)
--
-- ตอนแยก repo ปี 2026-09-08 แอป Influ ได้ route `/api/warm` + allowlist ใน proxy ติดไปด้วย
-- แต่ **ไม่มีใครยิงมันเลย** — cron ที่มีอยู่ (0128) ยิงเฉพาะแอปหลัก ⇒ ทีมที่เปิดแอป Influ
-- ตอนเช้า/หลังพักเที่ยงเจอ cold start ทุกครั้ง (วัดเทียบกัน: /api/warm ที่ไม่ทำอะไรเลย
-- ฝั่ง Influ ใช้เวลาฝั่ง server ราว 2 เท่าของแอปหลักที่ถูกอุ่นอยู่)
--
-- แยกเป็นคนละ job กับ 0128 เพื่อให้ปิด/ย้ายโดเมนทีละแอปได้
-- cron.schedule ด้วยชื่อเดิม = อัปเดตงานเดิม (idempotent) apply ซ้ำได้ ไม่เกิดงานซ้อน
--
-- ย้ายโดเมน (วันที่ได้โดเมนบริษัทจริง): แก้ URL ที่นี่แล้ว apply ใหม่
-- เลิกใช้: `select cron.unschedule('influ-warm-ping');`
-- (self-host ที่รัน Node ค้างไว้ไม่มี cold start — ไม่ต้องมี job นี้)
-- ============================================================

select cron.schedule(
  'influ-warm-ping',
  '*/5 * * * *',
  $$ select net.http_get(url := 'https://the-art-influencer.vercel.app/api/warm', timeout_milliseconds := 10000) $$
);
