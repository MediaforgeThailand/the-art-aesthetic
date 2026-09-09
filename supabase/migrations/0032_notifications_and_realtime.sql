-- การแจ้งเตือนในแอป (ไอคอนกระดิ่ง) — แถวถูกสร้างจาก client ตอนเกิดเหตุการณ์
-- (@mention ในคอมเมนต์ / คอมเมนต์ถึงผู้เกี่ยวข้อง / มอบหมายงาน / ส่งตรวจ / ผลตรวจ / รับงาน brief)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  task_id uuid references public.tasks(id) on delete cascade,
  type text not null check (
    type in ('mention', 'comment', 'assign', 'review_request', 'approved', 'rejected', 'brief_accepted')
  ),
  preview text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "authenticated full access notifications"
  on public.notifications for all
  to authenticated using (true) with check (true);

-- Realtime: กระดิ่งอัพเดทสด + บอร์ด Task อัพเดทสด
--
-- บนโปรเจกต์จริง publication `supabase_realtime` ถูกสร้างโดยแพลตฟอร์ม Supabase และ
-- tasks/task_comments/task_sections/task_subtasks/task_categories ถูกเพิ่มเข้าไปจาก dashboard
-- (ไม่ได้ผ่าน migration) — บน Postgres เปล่า publication จะไม่มี แล้ว alter publication จะ error
-- ทำให้ migration ทั้งชุดหยุดที่ไฟล์นี้ จึงสร้างเองถ้ายังไม่มี แล้วค่อยเพิ่มตารางทีละตัวแบบ
-- ไม่ซ้ำ (บนโปรเจกต์จริงทุกบรรทัดกลายเป็น no-op)
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'tasks', 'task_comments', 'task_sections', 'task_subtasks',
    'task_categories', 'notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
