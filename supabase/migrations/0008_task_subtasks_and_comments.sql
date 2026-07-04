-- งานย่อย (subtask) + ความคิดเห็นของงาน — สำหรับแผงรายละเอียดแบบ Asana
-- (applied remotely as task_subtasks_and_comments)
create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create index task_subtasks_task_idx on public.task_subtasks (task_id);

alter table public.task_subtasks enable row level security;
create policy "authenticated full access task_subtasks"
  on public.task_subtasks for all to authenticated
  using (true) with check (true);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id);

alter table public.task_comments enable row level security;
create policy "authenticated full access task_comments"
  on public.task_comments for all to authenticated
  using (true) with check (true);
