-- 0092: รหัส Influ ID ออกอัตโนมัติ + ทะเบียนหมอมีเลขใบ ปว. + ระบบแคมเปญ (แท็กสำหรับ tracking)
--
-- ที่มา (ผู้ใช้ 2026-08-29): ต่อไปโพสของ influ ต้องติดแฮชแท็กชุดบังคับ เพื่อให้ทีมหลังบ้าน
-- ดึงข้อมูลจาก Meta API มาแล้ว attribute ได้ว่า return มาจากใคร/แคมเปญไหน ⇒ ทุกกุญแจ
-- (Influ ID / รหัสหมอ / รหัสแคมเปญ) ต้อง "ไม่ซ้ำและระบบออกให้" ไม่ใช่ให้คนพิมพ์เอง
--
-- ⚠️ แฮชแท็กบน IG/FB ตัดคำที่เครื่องหมาย "-" (#INF-00001 จะกลายเป็น #INF)
-- รหัสที่คนอ่าน (INF-00001) กับข้อความแฮชแท็กจริง (#INF00001) จึงคนละรูป —
-- ฝั่งแอปแปลงให้ด้วย hashtagSafe() ใน influ-constants.ts (ทีมกดปุ่มคัดลอก ไม่ต้องพิมพ์เอง)

/* ---------------------------------------------------------------
   1) Influ ID อัตโนมัติ — INF- + เลข 5 หลัก (ไม่ซ้ำทั้งระบบ)
   --------------------------------------------------------------- */

create sequence if not exists public.influ_code_seq start 1;

-- ออกรหัสถัดไป — วนข้ามรหัสที่มีคนใช้อยู่แล้ว (เผื่อมีแถวที่ตั้งรหัสมือไว้ก่อนหน้า)
-- SECURITY DEFINER เพราะ role authenticated ไม่มีสิทธิ์ nextval บน sequence โดยตรง
create or replace function public.next_influ_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_guard int := 0;
begin
  loop
    v_code := 'INF-' || lpad(nextval('public.influ_code_seq')::text, 5, '0');
    exit when not exists (
      select 1 from public.influencers where lower(influ_code) = lower(v_code)
    );
    v_guard := v_guard + 1;
    if v_guard > 5000 then
      raise exception 'ออกรหัส Influ ID ไม่สำเร็จ (ลองใหม่อีกครั้ง)';
    end if;
  end loop;
  return v_code;
end;
$$;

comment on function public.next_influ_code() is
  'ออกรหัส Influ ID ถัดไป (INF-00001) — เรียกจากแอปตอนสร้างเคส/เติมรหัสให้เคสเก่า';

grant execute on function public.next_influ_code() to authenticated;

-- เคสเดิมทั้งหมดยังไม่มีรหัสเลย (0 จาก 174 แถว ณ วันที่เขียน) — เติมให้ครบตามลำดับที่สร้าง
-- เพราะแฮชแท็ก #Influ ID เป็นข้อบังคับ เคสที่ไม่มีรหัสจะติดแท็กไม่ได้
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.influencers
  where influ_code is null
)
update public.influencers i
set influ_code = 'INF-' || lpad(o.rn::text, 5, '0')
from ordered o
where o.id = i.id;

-- เดินตัวนับไปหลังรหัสที่ใช้ไปแล้ว (setval ค่าปัจจุบัน ⇒ nextval ตัวถัดไปคือ +1)
select setval(
  'public.influ_code_seq',
  greatest(
    1,
    coalesce(
      (select max(substring(influ_code from '^INF-(\d{1,5})$')::int)
       from public.influencers
       where influ_code ~ '^INF-\d{1,5}$'),
      0
    )
  )
);

/* ---------------------------------------------------------------
   2) ทะเบียนหมอ — เลขใบประกอบวิชาชีพ + ชื่อจริง/นามสกุล/ชื่อเล่นแยกช่อง
   --------------------------------------------------------------- */

-- doctors.name ยังเป็น "ชื่อที่แสดง" และเป็นกุญแจจับคู่กับ influencers.doctor_name เหมือนเดิม
-- (คอลัมน์ใหม่คือข้อมูลมีโครงสร้าง — แอปประกอบ name ให้จากช่องเหล่านี้ตอนบันทึก)
alter table public.doctors
  add column if not exists license_no text,
  add column if not exists title text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists nickname text;

comment on column public.doctors.license_no is
  'เลขใบประกอบวิชาชีพเวชกรรม (ว.) — กุญแจของแฮชแท็ก #DR<เลข> ห้ามซ้ำ';
comment on column public.doctors.title is 'คำนำหน้า เช่น นพ. / พญ.';

create unique index if not exists doctors_license_no_key
  on public.doctors (upper(license_no))
  where license_no is not null;

-- แตกชื่อเดิม "นพ. ปลื้ม บุตรศรี (หมอปลื้ม)" ออกเป็นช่อง ๆ ให้ทีมไม่ต้องกรอกซ้ำ
-- (แถวที่ไม่เข้ารูปแบบ เช่น "ทรีทเม้นท์" จะได้ first_name = ชื่อเดิมทั้งก้อน)
with parsed as (
  select
    id,
    (regexp_match(name, '^(นพ\.|พญ\.|น\.พ\.|พ\.ญ\.)'))[1] as t,
    (regexp_match(name, '\(([^)]+)\)'))[1] as nick,
    btrim(regexp_replace(regexp_replace(name, '^(นพ\.|พญ\.|น\.พ\.|พ\.ญ\.)', ''), '\s*\([^)]*\)\s*$', '')) as bare
  from public.doctors
)
update public.doctors d
set
  title = p.t,
  nickname = p.nick,
  first_name = split_part(p.bare, ' ', 1),
  last_name = nullif(btrim(substring(p.bare from position(' ' in p.bare) + 1)), split_part(p.bare, ' ', 1))
from parsed p
where p.id = d.id and d.first_name is null;

/* ---------------------------------------------------------------
   3) แคมเปญ (ระดับระบบ) + สมาชิกแคมเปญ
   --------------------------------------------------------------- */

-- ⚠️ คนละก้อนกับตาราง public.influ_campaigns ที่มีอยู่เดิม — อันนั้นคือ "Sub Campaign"
-- รายเคสในหน้าสัญญา (ยังไม่เคยมีข้อมูลสักแถว) ส่วนตารางนี้คือแคมเปญการตลาดระดับระบบ
-- ที่มีแท็กประจำตัวไว้ให้ influ ติดในโพส แล้วดึงยอดจาก Meta มา attribute ทีหลัง
create table if not exists public.influ_campaign_defs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- แท็กที่บังคับให้ influ ติดในโพส (เก็บแบบไม่มี # นำหน้า, ตัวพิมพ์ใหญ่)
  -- ห้ามมี "-" หรือช่องว่าง เพราะ IG/FB ตัดคำตรงนั้น
  tag text not null,
  detail text,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint influ_campaign_defs_tag_format
    check (tag ~ '^[A-Za-z0-9_ก-๛]{2,30}$')
);

comment on table public.influ_campaign_defs is
  'แคมเปญการตลาดของระบบ Influencer — 1 แคมเปญ = 1 แท็กที่ influ ต้องติดในโพส (กุญแจ attribution กับข้อมูล Meta)';

create unique index if not exists influ_campaign_defs_tag_key
  on public.influ_campaign_defs (upper(tag));

-- สมาชิก = "ตัวบุคคล" (influ_profiles) ไม่ใช่เคส เพราะคนหนึ่งเข้าแคมเปญแล้วอาจทำหลายรอบ
create table if not exists public.influ_campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.influ_campaign_defs(id) on delete cascade,
  profile_id uuid not null references public.influ_profiles(id) on delete cascade,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, profile_id)
);

comment on table public.influ_campaign_members is
  'influ ที่อยู่ในแคมเปญ (ต่อ "ตัวบุคคล" ไม่ใช่ต่อเคส) — เคสของคนนี้ถึงจะเลือกแคมเปญนี้ได้สะดวก';

create index if not exists influ_campaign_members_campaign_idx
  on public.influ_campaign_members (campaign_id);
create index if not exists influ_campaign_members_profile_idx
  on public.influ_campaign_members (profile_id);

-- เคสเลือกแคมเปญได้ (ไม่บังคับ) — nullable โดยตั้งใจ ตามบทเรียนถังขยะ 0083:
-- influ_deleted_backups เก็บเคสเป็น jsonb คอลัมน์ NOT NULL ใหม่จะทำให้ backup เก่ากู้ไม่ขึ้น
alter table public.influencers
  add column if not exists campaign_id uuid
    references public.influ_campaign_defs(id) on delete set null;

comment on column public.influencers.campaign_id is
  'แคมเปญของเคสนี้ (ไม่บังคับ) — มีค่าเมื่อไหร่ แฮชแท็กบังคับของเคสจะเพิ่ม #<tag> ของแคมเปญ';

create index if not exists influencers_campaign_idx
  on public.influencers (campaign_id)
  where campaign_id is not null;

-- ออกแท็กแคมเปญให้อัตโนมัติเมื่อทีมไม่อยากคิดเอง (CMP00001)
create sequence if not exists public.influ_campaign_tag_seq start 1;

create or replace function public.next_campaign_tag()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text;
  v_guard int := 0;
begin
  loop
    v_tag := 'CMP' || lpad(nextval('public.influ_campaign_tag_seq')::text, 5, '0');
    exit when not exists (
      select 1 from public.influ_campaign_defs where upper(tag) = upper(v_tag)
    );
    v_guard := v_guard + 1;
    if v_guard > 5000 then
      raise exception 'ออกรหัสแคมเปญไม่สำเร็จ (ลองใหม่อีกครั้ง)';
    end if;
  end loop;
  return v_tag;
end;
$$;

grant execute on function public.next_campaign_tag() to authenticated;

-- RLS ตามแนวระบบ (authenticated เข้าถึงได้ทั้งหมด — ชั้นที่กันจริงคือ guard ของหน้า)
alter table public.influ_campaign_defs enable row level security;
alter table public.influ_campaign_members enable row level security;

drop policy if exists "influ_campaign_defs_all" on public.influ_campaign_defs;
create policy "influ_campaign_defs_all" on public.influ_campaign_defs
  for all to authenticated using (true) with check (true);

drop policy if exists "influ_campaign_members_all" on public.influ_campaign_members;
create policy "influ_campaign_members_all" on public.influ_campaign_members
  for all to authenticated using (true) with check (true);

-- updated_at ให้เหมือนตารางอื่นในระบบ
drop trigger if exists influ_campaign_defs_updated_at on public.influ_campaign_defs;
create trigger influ_campaign_defs_updated_at
  before update on public.influ_campaign_defs
  for each row execute function public.set_updated_at();
