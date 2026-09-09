-- หมวดหมู่งาน
-- (applied remotely as 20260703130150_add_task_category)
alter table public.tasks add column category text not null default 'ทั่วไป';
create index tasks_category_idx on public.tasks (category);
