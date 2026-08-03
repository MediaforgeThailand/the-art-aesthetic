-- ปิดการสมัครบัญชีเองด้วย domain — ต้องอยู่ใน allowed_emails เท่านั้น
--
-- ก่อนหน้านี้ trigger ปล่อยผ่านถ้าอีเมลลงท้าย @artsurgery.co.th (migration 0025) ซึ่งแปลว่า
-- ใครก็ตามที่เดาที่อยู่อีเมลพนักงานได้ สร้างบัญชีแทนคนนั้นได้เลยโดยไม่ต้องพิสูจน์ว่าเป็นเจ้าของ
-- อีเมลจริง (edge function domain-auth สร้างด้วย email_confirm=true ไม่ส่งเมลยืนยัน) และเพราะ
-- RLS ของทุกตารางเป็น "authenticated เข้าถึงได้ทั้งหมด" บัญชีที่ได้มาจึงอ่าน/แก้ข้อมูลทั้งฐาน
-- ผ่าน REST API ได้ทันที (profiles.permissions กันแค่การมองเห็นเมนูในเว็บ ไม่ได้กันข้อมูล)
-- ผลพลอยได้: พนักงานที่ถูกลบบัญชีตอนลาออกจะสมัครกลับเข้ามาเองไม่ได้อีก
--
-- ไม่กระทบผู้ใช้เดิม — trigger นี้ทำงานเฉพาะตอน insert เข้า auth.users (สร้างบัญชีใหม่)
-- การเพิ่มบัญชีจากหน้า /accounts ยังทำงานเหมือนเดิม เพราะ edge function admin-users
-- upsert อีเมลเข้า allowed_emails ก่อนเรียก createUser อยู่แล้ว
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or not exists (
       select 1 from public.allowed_emails where email = lower(new.email)
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

comment on function public.handle_new_user() is
  'สร้าง profile ให้ user ใหม่ — อนุญาตเฉพาะอีเมลที่อยู่ใน allowed_emails (admin เพิ่มผ่าน /accounts)';
