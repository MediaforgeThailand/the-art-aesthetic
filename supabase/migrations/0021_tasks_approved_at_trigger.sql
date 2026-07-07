-- approved_at ให้ DB เป็นคนตัดสินเวลา (กัน clock เครื่องผู้ใช้เพี้ยน) — pattern เดียวกับ set_updated_at
-- (applied remotely as tasks_approved_at_trigger)
create or replace function public.tasks_set_approved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.review_status = 'approved' and old.review_status is distinct from 'approved' then
    new.approved_at := now();
  elsif new.review_status <> 'approved' then
    new.approved_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_set_approved_at
  before update on public.tasks
  for each row execute function public.tasks_set_approved_at();
