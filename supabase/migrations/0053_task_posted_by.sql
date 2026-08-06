-- 0053: ผู้กดปุ่ม "โพสแล้ว" — คู่กับ posted_at (0030) ที่บอกแค่ "เมื่อไหร่" แต่ไม่บอก "ใคร"
-- null = ยังไม่โพส หรือเป็นงานเก่าที่กดโพสไว้ก่อนมีคอลัมน์นี้ (ไม่มีข้อมูลย้อนหลังให้เติม)
-- โปรไฟล์ถูกลบ = set null (ไม่ลบงานทิ้งตาม) เหมือน reviewer_id/created_by
alter table public.tasks
  add column if not exists posted_by uuid references public.profiles(id) on delete set null;
