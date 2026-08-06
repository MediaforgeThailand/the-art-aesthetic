-- กัน member แก้ `profiles.email` ของตัวเอง
--
-- RLS ของ profiles ปล่อยให้เจ้าของแถว update ตัวเองได้ (นโยบาย "users can update own profile")
-- และ trigger เดิม guard_profile_role_change กันแค่ role/permissions — คอลัมน์ email จึงแก้ได้
-- ซึ่งอันตรายเพราะ email ใน profiles ถูกใช้เป็น "ตัวตน" ในหลายที่ เช่นตอนลบบัญชีจาก /accounts
-- ที่เอาไปถอนรายชื่อออกจาก allowed_emails — ถ้าค่าถูกแก้ไว้ก่อน จะถอนผิดที่อยู่แล้วพนักงาน
-- ที่ลาออกยังสมัครกลับเข้ามาได้ (แก้ฝั่ง edge function ให้ยึด auth.users แล้วเช่นกัน — กันสองชั้น)
--
-- email ที่ถูกต้องมาจาก auth.users เท่านั้น (trigger handle_new_user เป็นคนเขียนตอนสร้างบัญชี)
create or replace function public.guard_profile_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if new.email is distinct from old.email then
    -- service role / SQL ตรง (auth.uid() = null) และ admin แก้ได้ตามปกติ
    if caller is not null and not exists (
      select 1 from public.profiles where id = caller and role = 'admin'
    ) then
      raise exception 'email is managed by the system — ask an admin';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_profile_email_change() from anon, authenticated, public;

drop trigger if exists guard_profile_email on public.profiles;
create trigger guard_profile_email
  before update on public.profiles
  for each row execute function public.guard_profile_email_change();
