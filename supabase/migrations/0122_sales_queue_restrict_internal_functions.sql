-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0122 = migration "sales_queue_restrict_internal_functions" (version 20260820091640) ที่ apply บน Supabase แล้วเมื่อ 2026-08-20
-- ที่มาของไฟล์: repo `the-art-sales-assistant` โฟลเดอร์ `queue/supabase/migrations/` (ถูกลบไปพร้อมโฟลเดอร์ queue/ ตอนรวม Sales Queue เข้าแอปนี้ — commit 00f2265) — ชื่อเดิม 0003_sales_queue_restrict_internal_functions.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- Supabase แจก EXECUTE ให้ role authenticated อัตโนมัติผ่าน default privileges
-- สองตัวนี้เป็น internal ของ RPC อื่น ไม่ควรให้ client เรียกตรง
revoke all on function public.sq_pick_member(uuid[]) from authenticated;
revoke all on function public.sq_audit(text, text, uuid, text, jsonb) from authenticated;
