-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0127 = migration "sq_revoke_anon_execute" (version 20260826070147) ที่ apply บน Supabase แล้วเมื่อ 2026-08-26
-- ที่มาของไฟล์: repo `the-art-sales-assistant` โฟลเดอร์ `queue/supabase/migrations/` (ถูกลบไปพร้อมโฟลเดอร์ queue/ ตอนรวม Sales Queue เข้าแอปนี้ — commit 00f2265) — ชื่อเดิม 0008_sq_revoke_anon_execute.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- 0008: ปิดไม่ให้ผู้ที่ยังไม่ล็อกอิน (anon) เรียก RPC ของระบบคิว
--
-- 0007 สร้าง sq_can_view_all / sq_my_access ใหม่ และเปลี่ยนลายเซ็น sq_add_member
-- ฟังก์ชันที่สร้างใหม่ Postgres จะให้สิทธิ์ execute กับ public (รวม anon) โดยอัตโนมัติ
-- ทั้งสามตัวอิง auth.uid() อยู่แล้ว anon เรียกไปก็ไม่ได้ข้อมูลและถูก 'forbidden'
-- แต่ปิดให้เหมือน sq_* ตัวอื่นทั้งหมด เพื่อไม่ให้เปิด endpoint ทิ้งไว้เปล่าๆ
revoke all on function public.sq_can_view_all() from public, anon;
revoke all on function public.sq_my_access() from public, anon;
revoke all on function public.sq_add_member(uuid, text, text, boolean) from public, anon;

grant execute on function public.sq_can_view_all() to authenticated, service_role;
grant execute on function public.sq_my_access() to authenticated, service_role;
grant execute on function public.sq_add_member(uuid, text, text, boolean) to authenticated, service_role;
