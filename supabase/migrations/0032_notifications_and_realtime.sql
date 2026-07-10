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

-- Realtime: กระดิ่งอัพเดทสด — tasks/task_comments/task_sections/task_subtasks
-- ถูกเพิ่มเข้า publication supabase_realtime ไว้แล้ว (เปิดจาก dashboard) เหลือแค่ notifications
alter publication supabase_realtime add table public.notifications;
