-- ระบบจัดการผู้ตรวจงาน: roster ผู้ตรวจ + ผู้ตรวจอัตโนมัติรายคน + เวลาอนุมัติ
-- (applied remotely as reviewer_management)

-- รายชื่อคนที่เป็นผู้ตรวจงานได้ (เพิ่ม/ลบจากหน้า /tasks)
create table public.task_reviewers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.task_reviewers enable row level security;
create policy "authenticated full access task_reviewers"
  on public.task_reviewers for all to authenticated
  using (true) with check (true);

-- ผู้ตรวจอัตโนมัติของแต่ละคน — ใช้ตอนสร้างงานใหม่ (แก้บนโปรไฟล์ตัวเองได้ตาม policy เดิม)
alter table public.profiles add column default_reviewer_id uuid references public.profiles(id) on delete set null;

-- เวลาที่งานผ่านการตรวจ — ใช้เรียง/กรองแท็บ "ตรวจแล้ว"
alter table public.tasks add column approved_at timestamptz;
update public.tasks set approved_at = updated_at where review_status = 'approved';

-- ตั้งต้น: คนที่เคยถูกเลือกเป็นผู้ตรวจอยู่แล้ว เข้า roster อัตโนมัติ
insert into public.task_reviewers (profile_id)
select distinct reviewer_id from public.tasks where reviewer_id is not null
on conflict do nothing;
