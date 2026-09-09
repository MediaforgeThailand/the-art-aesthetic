-- เชื่อม task กับ influencer (เลือกได้ ไม่บังคับ)
alter table tasks
  add column if not exists influencer_id uuid references influencers(id) on delete set null;

-- ไฟล์งานหลายไฟล์ต่อ task (รูป/วิดีโอ)
create table if not exists task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);

alter table task_files enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'task_files' and policyname = 'task_files_all_auth') then
    create policy "task_files_all_auth" on task_files
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create index if not exists task_files_task_id_idx on task_files(task_id);

-- ย้ายไฟล์เดี่ยวเดิม (deliverable_file_path) เข้า task_files
insert into task_files (task_id, file_path)
select id, deliverable_file_path from tasks
where deliverable_file_path is not null
  and not exists (select 1 from task_files tf where tf.task_id = tasks.id and tf.file_path = tasks.deliverable_file_path);
