-- 0093: เมลโดเมนบริษัทเข้าระบบเองได้ — เฉพาะทาง Google SSO เท่านั้น
--
-- ที่มา (ผู้ใช้ 2026-08-29): "user ที่มี domain เป็นเมลบริษัทสามารถ login เข้าเว็บได้เลย
-- แค่ขึ้นว่ารออนุมัติสิทธิ์ แล้ว account ต้องไปโผล่ในหน้าบัญชี" — ของเดิม admin ต้องพิมพ์อีเมล
-- เข้า allowlist ก่อน คนใหม่จึงเข้าไม่ได้เลยจนกว่าจะมีคนไปกดให้
--
-- ⚠️ ทำไมเฉพาะ Google: RLS ทุกตารางเป็น "authenticated เข้าถึงได้ทั้งหมด" (รวม sales_records
-- ที่มีชื่อคนไข้+HN) การเปิดให้ "ตั้งรหัสผ่านเองด้วยอีเมลโดเมนบริษัท" จึงเท่ากับใครเดาที่อยู่
-- อีเมลพนักงานได้ก็สร้างบัญชีแทนคนนั้นแล้วอ่านข้อมูลทั้งฐานผ่าน REST ได้ทันที — นี่คือเหตุผล
-- ที่ migration 0056 ปิดกฎโดเมนทิ้งไป ส่วน Google เป็นคนพิสูจน์ให้แล้วว่าผู้สมัคร "เป็นเจ้าของ
-- กล่องเมลนั้นจริง" ช่องโหว่เดิมจึงไม่กลับมา (ผู้ใช้เลือกทางนี้เอง 2026-08-29)
--
-- การตั้งรหัสผ่านเองที่หน้า /login ยังจำกัดที่ allowed_emails เหมือนเดิมทุกประการ

create table if not exists public.allowed_email_domains (
  domain text primary key,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.allowed_email_domains is
  'โดเมนอีเมลที่สมัครเองได้ผ่าน Google SSO (ยืนยันความเป็นเจ้าของกล่องเมลแล้ว) — บัญชีที่ได้ยังมี permissions ว่าง รอ admin เปิดสิทธิ์';

alter table public.allowed_email_domains enable row level security;

-- อ่านได้ทุกคนที่ล็อกอิน (หน้า /accounts เอาไปแสดง) — แก้ได้เฉพาะ service role (edge function)
drop policy if exists "allowed_email_domains_read" on public.allowed_email_domains;
create policy "allowed_email_domains_read" on public.allowed_email_domains
  for select to authenticated using (true);

insert into public.allowed_email_domains (domain, note)
values ('artsurgery.co.th', 'โดเมนอีเมลบริษัท')
on conflict (domain) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
  v_allowed boolean;
begin
  if new.email is null then
    raise exception 'signup disabled: ask an admin to create your account';
  end if;

  -- เทียบแบบ lower ทั้งสองฝั่ง: /accounts บันทึกอีเมลเป็นตัวพิมพ์เล็กอยู่แล้ว แต่ถ้ามีใคร
  -- insert allowed_emails ด้วย SQL มือแล้วติดตัวพิมพ์ใหญ่มา บัญชีจะสร้างไม่ได้แบบงงๆ
  v_allowed := exists (
    select 1 from public.allowed_emails where lower(email) = lower(new.email)
  );

  -- ไม่อยู่ใน allowlist แต่เป็นเมลโดเมนบริษัท "และ" ยืนยันตัวตนผ่าน identity provider ภายนอก
  -- (provider ที่ไม่ใช่ 'email' = Google/OAuth — GoTrue ใส่ค่านี้ให้ตั้งแต่ตอน insert)
  if not v_allowed
     and v_provider <> 'email'
     and exists (
       select 1 from public.allowed_email_domains d where lower(d.domain) = v_domain
     )
  then
    v_allowed := true;
    -- บันทึกเข้า allowlist ไว้ด้วย เพื่อให้ /accounts เห็นเป็นบัญชีที่ระบบรู้จัก
    -- (และตอน admin ลบบัญชี edge function จะถอน allowlist ให้ครบในที่เดียว)
    insert into public.allowed_emails (email, note)
    values (lower(new.email), 'สมัครอัตโนมัติด้วย Google (โดเมนบริษัท)')
    on conflict (email) do nothing;
  end if;

  if not v_allowed then
    raise exception 'signup disabled: ask an admin to create your account';
  end if;

  -- permissions เริ่มต้นว่างเสมอ — เข้าเว็บได้แต่ยังไม่เห็นหน้าไหน จนกว่า admin จะเปิดให้
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
  'สร้าง profile ให้ user ใหม่ — ผ่านได้เมื่ออยู่ใน allowed_emails หรือเป็นเมลโดเมนบริษัทที่ล็อกอินด้วย Google (allowed_email_domains)';
