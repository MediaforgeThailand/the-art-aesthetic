-- ============================================================
-- 0025 — สิทธิ์การมองเห็นรายคน (permissions) + เปิด domain artsurgery.co.th สมัครเอง
-- ============================================================

-- สิทธิ์ที่ admin เปิดให้รายคนได้: 'data' (แดชบอร์ด+รายงาน), 'team' (งาน+ภาระทีม+ไฟล์)
-- (pricing/influencer เปิดให้ทุกคน ไม่ต้องมีสิทธิ์; admin role = เห็นทุกอย่าง)
alter table public.profiles
  add column permissions text[] not null default '{}';

-- ผู้ใช้เดิมที่ไม่ใช่ admin (ถ้ามี) ให้สิทธิ์ครบไว้ก่อน กันของเดิมพัง
update public.profiles
  set permissions = array['data', 'team']
  where role <> 'admin' and permissions = '{}';

-- เปิดสมัครเองเฉพาะ domain artsurgery.co.th (นอกเหนือจาก allowlist เดิม)
-- ผู้ใช้ใหม่เริ่มต้นไม่มีสิทธิ์ (permissions = '{}') รอ admin เปิดให้
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or (
       not exists (select 1 from public.allowed_emails where email = lower(new.email))
       and lower(split_part(new.email, '@', 2)) <> 'artsurgery.co.th'
     ) then
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

-- กันเปลี่ยน role/permissions เอง: เปลี่ยนได้เฉพาะ admin (หรือ service role = auth.uid() null)
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if (new.role is distinct from old.role)
     or (new.permissions is distinct from old.permissions) then
    if caller is not null and not exists (
      select 1 from public.profiles where id = caller and role = 'admin'
    ) then
      raise exception 'only admins can change roles or permissions';
    end if;
  end if;
  return new;
end;
$$;

-- เช็คว่าอีเมลมีบัญชีแล้วหรือยัง — ใช้จาก edge function domain-auth (service role) เท่านั้น
-- (revoke จาก client กัน enumeration ผ่าน PostgREST)
create or replace function public.email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;

revoke execute on function public.email_exists(text) from public, anon, authenticated;
grant execute on function public.email_exists(text) to service_role;
