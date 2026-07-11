-- 0034: บอร์ด Influ Management 3 คอลัมน์ตามขนาดผู้ติดตาม (เล็ก/กลาง/ใหญ่) + ลากวาง
-- size_group: override กลุ่มขนาดที่ผู้ใช้ลากการ์ดไปวางเอง (null = จัดอัตโนมัติจาก followers)
--   's' = เล็ก (< 100K) · 'm' = กลาง (100K – 1M) · 'l' = ใหญ่ (1M+)
-- board_position: ลำดับการ์ดในคอลัมน์ (float กึ่งกลางเพื่อนบ้านแบบบอร์ด Task;
--   null = fallback ฝั่ง client จาก created_at)
alter table public.influencers
  add column if not exists size_group text
    check (size_group in ('s', 'm', 'l')),
  add column if not exists board_position double precision;
