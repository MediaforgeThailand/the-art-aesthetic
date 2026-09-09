-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0124 = migration "sales_queue_purge_raw_cron" (version 20260820100552) ที่ apply บน Supabase แล้วเมื่อ 2026-08-20
-- ที่มาของไฟล์: repo `the-art-sales-assistant` โฟลเดอร์ `queue/supabase/migrations/` (ถูกลบไปพร้อมโฟลเดอร์ queue/ ตอนรวม Sales Queue เข้าแอปนี้ — commit 00f2265) — ชื่อเดิม 0005_sales_queue_purge_raw_cron.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- ---------------------------------------------------------------------------
-- 0005 — กวาดข้อความต้นฉบับที่ค้างทิ้งอัตโนมัติทุกคืน
--
-- เดิมข้อความดิบถูกลบทันทีที่ยิง webhook สำเร็จ พอเปลี่ยนเป็นวางด้วยมือ (0004)
-- ข้อความจึงค้างอยู่จนกว่าจะมีคนกดยืนยัน ซึ่งอาจไม่เกิดขึ้นเลย
-- ใช้ pg_cron ที่โปรเจกต์นี้ใช้อยู่แล้วเป็นตัวไล่เก็บ (§11 retention สั้นที่สุด)
--
-- 7 วันเท่ากับค่า default ของ sq_purge_raw() ที่แอดมินเรียกเองได้ — ยาวพอให้ข้ามวันหยุด
-- แต่ไม่ปล่อยให้ PII ค้างในฐานข้อมูลแบบไม่มีกำหนด
-- ---------------------------------------------------------------------------

-- แยกจาก sq_purge_raw() เพราะตัวนั้นบังคับ sq_is_admin() ซึ่ง cron ไม่มีทางผ่าน
-- (cron ทำงานโดยไม่มี auth.uid()) ตัวนี้จึงห้ามให้ role ฝั่ง client เรียกเด็ดขาด
create or replace function public.sq_purge_raw_expired()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  delete from public.sq_case_raw where created_at < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.sq_purge_raw_expired() is
  'งานเบื้องหลังของ pg_cron เท่านั้น — ห้าม grant ให้ anon/authenticated';

revoke all on function public.sq_purge_raw_expired() from public, anon, authenticated;

select cron.schedule(
  'sq-purge-raw-daily',
  '15 1 * * *',                       -- 01:15 UTC = 08:15 เวลาไทย
  $$select public.sq_purge_raw_expired()$$
);
