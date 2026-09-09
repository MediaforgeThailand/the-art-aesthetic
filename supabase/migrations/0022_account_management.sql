-- ============================================================
-- 0022 — ระบบจัดการบัญชี (ปิดสมัครเอง + สิทธิ์ admin/member)
-- ============================================================

-- อีเมลที่ได้รับอนุญาตให้มีบัญชี — จัดการผ่าน edge function (service role) เท่านั้น
create table public.allowed_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

-- RLS เปิดไว้แต่ไม่มี policy = client แตะไม่ได้เลย (service role bypass)
alter table public.allowed_emails enable row level security;

-- ผู้ใช้ปัจจุบันทุกคนถือว่าได้รับอนุญาตแล้ว
insert into public.allowed_emails (email, note)
select lower(email), 'ผู้ใช้เดิมก่อนเปิดระบบจัดการบัญชี'
from auth.users where email is not null
on conflict (email) do nothing;

-- ปิดการสมัครเองจากหน้า login/API: สมัครได้เฉพาะอีเมลใน allowed_emails
-- (admin เพิ่มบัญชีผ่าน edge function ซึ่ง upsert allowed_emails ให้ก่อน createUser)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'signup disabled: ask an admin to create your account';
  end if;
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- กันเปลี่ยน role เอง: เปลี่ยนได้เฉพาะ service role (edge function) หรือ admin
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if new.role is distinct from old.role then
    if caller is not null and not exists (
      select 1 from public.profiles where id = caller and role = 'admin'
    ) then
      raise exception 'only admins can change roles';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- ตั้งบัญชีเดิมเป็น admin (เจ้าของระบบ)
update public.profiles set role = 'admin'
where lower(email) in ('taksin.t@surgery.co.th', 'mediaforge2026+pricelist-import@gmail.com');
