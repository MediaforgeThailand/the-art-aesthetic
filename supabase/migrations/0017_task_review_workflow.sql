-- Workflow ส่งตรวจงาน: ผู้รับผิดชอบกด "ส่งตรวจงาน" → รอตรวจ → ผู้ตรวจกด approve → เสร็จสมบูรณ์
alter table tasks
  add column if not exists reviewer_id uuid references profiles(id) on delete set null,
  add column if not exists review_status text not null default 'none';

-- ค่าที่ถูกต้อง: none (ยังไม่ส่ง) | pending (รอตรวจ) | approved (ผ่านการตรวจ = เสร็จสมบูรณ์)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_review_status_check'
  ) then
    alter table tasks
      add constraint tasks_review_status_check
      check (review_status in ('none', 'pending', 'approved'));
  end if;
end $$;

-- งานที่ทำเสร็จอยู่แล้ว (ก่อนมี workflow) = ผ่านการตรวจแล้ว
update tasks set review_status = 'approved' where completed = true and review_status = 'none';
