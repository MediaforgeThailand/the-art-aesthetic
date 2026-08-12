-- ผู้ตรวจลำดับ 1 คนที่ 2 (ผู้ตรวจร่วมทอดแรก — ไม่บังคับ): ใครว่างคนนั้นกดอนุมัติได้
-- เมื่อทอดแรกถูกอนุมัติ ระบบบันทึกเฉพาะคนที่ตรวจจริงไว้ที่ reviewer_id แล้วล้างช่องนี้
-- (applied remotely as task_reviewer1b)
alter table public.tasks
  add column reviewer1b_id uuid references public.profiles(id) on delete set null;
