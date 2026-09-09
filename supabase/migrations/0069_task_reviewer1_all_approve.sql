-- ทอดแรกต้องอนุมัติ "ครบทุกคน" (ทั้งคนหลักและผู้ตรวจร่วม) ก่อนส่งต่อลำดับ 2
-- จดเวลาอนุมัติแยกรายช่อง — null = ช่องนั้นยังไม่อนุมัติ (ล้างตอนยกเลิก/ตีกลับ/เปิดงานใหม่/ส่งตรวจรอบใหม่)
alter table public.tasks
  add column reviewer1_approved_at timestamptz,
  add column reviewer1b_approved_at timestamptz;
