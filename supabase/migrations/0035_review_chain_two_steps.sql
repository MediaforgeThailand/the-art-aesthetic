-- ระบบตรวจงาน 2 ลำดับ (ส่งตรวจเป็นทอด): ลำดับ 1 อนุมัติ → ส่งต่อลำดับ 2 → อนุมัติ = เสร็จสมบูรณ์
-- reviewer2_id = ผู้ตรวจลำดับ 2 (snapshot จาก app_settings 'default_reviewer2_id' ตอนกดส่งตรวจ; null = ตรวจชั้นเดียวแบบเดิม)
-- review_step = ทอดที่กำลังรอตรวจ (1|2), review1_approved_at = เวลาที่ลำดับ 1 อนุมัติ
alter table public.tasks
  add column if not exists reviewer2_id uuid references public.profiles(id) on delete set null,
  add column if not exists review_step smallint not null default 1,
  add column if not exists review1_approved_at timestamptz;
