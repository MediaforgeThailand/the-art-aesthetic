-- Section แบบ Asana: ผู้ใช้สร้าง/เปลี่ยนชื่อ/ลบได้เอง + งานมีสถานะเสร็จเป็น boolean
-- (applied remotely as 20260704054419_asana_style_sections)
create table public.task_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table public.task_sections enable row level security;

create policy "authenticated full access task_sections"
  on public.task_sections for all to authenticated
  using (true) with check (true);

alter table public.tasks add column section_id uuid references public.task_sections(id) on delete set null;
alter table public.tasks add column completed boolean not null default false;
alter table public.tasks add column position double precision not null default 0;

create index tasks_section_idx on public.tasks (section_id);

-- seed section เริ่มต้น + ย้ายงานเดิมตามสถานะเก่า
insert into public.task_sections (name, position) values
  ('To do', 1),
  ('Doing', 2),
  ('Done', 3);

update public.tasks set position = extract(epoch from created_at);

update public.tasks set section_id = (select id from public.task_sections where name = 'To do')
  where status = 'todo';
update public.tasks set section_id = (select id from public.task_sections where name = 'Doing')
  where status = 'in_progress';
update public.tasks set section_id = (select id from public.task_sections where name = 'Done'), completed = true
  where status in ('done', 'cancelled');
