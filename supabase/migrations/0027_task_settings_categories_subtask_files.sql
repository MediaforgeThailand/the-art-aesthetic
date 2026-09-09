-- ============================================================
-- 0027 — ตั้งค่างานรวม (ผู้ตรวจเริ่มต้นคนเดียวทั้งทีม) + หมวดหมู่แบบเพิ่มได้ + ไฟล์แนบงานย่อย
-- ============================================================

-- key/value setting กลางของทั้งระบบ (เช่น default_reviewer_id)
create table public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "authenticated full access app_settings"
  on public.app_settings for all to authenticated using (true) with check (true);
insert into public.app_settings (key, value) values ('default_reviewer_id', null)
  on conflict (key) do nothing;

-- หมวดหมู่งาน: ตั้งต้นใหม่ตามที่ทีมใช้ (ผลงานลูกค้า / ผลงาน Influ) — เพิ่มได้เองในหน้างาน
--
-- ตารางนี้ถูกสร้างบนโปรเจกต์จริงโดย migration ที่ไม่เคยถูก mirror ลงรีโป
-- (remote `20260704133409_task_categories_fixed_sections_realtime`) — ถ้าไม่ประกาศไว้ตรงนี้
-- การรัน 0001..N บน Postgres เปล่าจะ error ที่ delete ข้างล่างแล้วหยุดทั้งชุด
-- ใช้ if not exists เพื่อให้บนโปรเจกต์จริงไม่มีผลอะไร (ตารางมีอยู่แล้ว)
create table if not exists public.task_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.task_categories enable row level security;
drop policy if exists "authenticated full access task_categories" on public.task_categories;
create policy "authenticated full access task_categories"
  on public.task_categories for all to authenticated using (true) with check (true);

delete from public.task_categories;
insert into public.task_categories (name) values ('ผลงานลูกค้า'), ('ผลงาน Influ');

-- ไฟล์แนบของงานย่อย (แนบได้หลายไฟล์ต่อ 1 งานย่อย)
create table public.task_subtask_files (
  id uuid primary key default gen_random_uuid(),
  subtask_id uuid not null references public.task_subtasks(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);
create index task_subtask_files_subtask_idx on public.task_subtask_files (subtask_id);
alter table public.task_subtask_files enable row level security;
create policy "authenticated full access task_subtask_files"
  on public.task_subtask_files for all to authenticated using (true) with check (true);
