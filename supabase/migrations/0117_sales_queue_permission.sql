-- ============================================================
-- 0117 — Sales Queue รวมเข้าแอปหลัก: สิทธิ์เมนู `sales_queue`
--
-- ผู้ใช้ 2026-09-09: "sales queue ก็รวมกับระบบทีมเลย เพราะยังไม่ได้ใช้จริงแล้วเป็นของแผนกเดียวกัน"
-- ระบบคิวลูกค้าออนไลน์ (ตาราง sq_* + RPC sq_* จาก migration sales_queue_* เดิม) ย้ายจาก
-- แอป Next แยก (the-art-sales-assistant/queue → queue.theartbb.com) มาเป็นหน้า /queue ของแอปหลัก
--
-- ไม่มี DDL: `profiles.permissions text[]` ไม่มี check constraint จึงเพิ่มค่าใหม่ได้ทันที
-- (ค่าที่ valid คุมที่ edge function admin-users `VALID_PERMISSIONS` + `AppPermission` ใน TS)
-- backfill: แอดมินของแอปหลัก (บูตสแตรปของ sq_is_admin อยู่แล้ว) และสมาชิกทีมคิวที่ยัง active
-- ได้สิทธิ์เมนูทันที ไม่ต้องให้ใครไปติ๊กใน /accounts ซ้ำ — สิทธิ์ในตัวระบบ (BC/แอดมิน/ผู้ดูอย่างเดียว)
-- ยังเป็นของ sq_members + RPC/RLS ของ sq_* เหมือนเดิม สิทธิ์นี้คุมแค่ "เห็นเมนู/เข้าหน้า"
-- ============================================================

-- 2026-09-09 (แก้ไฟล์ที่ apply แล้วเพื่อ replay เท่านั้น — เนื้อหาบนโปรดักชันไม่เปลี่ยน):
-- ไฟล์ schema ของ sq_* ถูกกู้เข้า repo ทีหลังเป็น 0120–0127 จึงมาหลังไฟล์นี้ในลำดับ replay
-- บน stack เปล่าตาราง sq_members ยังไม่มีตอนรันไฟล์นี้ → ข้าม backfill (ข้อมูลจริงมากับ dump อยู่แล้ว)
-- plpgsql เตรียม statement ตอนรันถึงบรรทัดนั้น การ return ก่อนจึงไม่ parse ชื่อตารางที่ยังไม่มี
do $$
begin
  if to_regclass('public.sq_members') is null then
    raise notice '0117: skip backfill — sq_members not created yet (fresh replay)';
    return;
  end if;
  update public.profiles p
     set permissions = array_append(coalesce(p.permissions, '{}'::text[]), 'sales_queue')
   where not ('sales_queue' = any(coalesce(p.permissions, '{}'::text[])))
     and (
       p.role = 'admin'
       or p.id in (select m.user_id from public.sq_members m where m.is_active)
     );
end $$;
