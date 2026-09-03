-- ============================================================
-- 0107 — รหัส Influ ID เป็นของ "ตัวบุคคล" ไม่ใช่ของเคส
--
-- ผู้ใช้ 2026-09-03: "รหัส influ เป็น PK ซึ่งมันควรเป็นอันเดียวกัน เพราะอินฟูคนเดียว"
--
-- ของเดิม (0093): `next_influ_code()` ถูกเรียกทุกครั้งที่สร้างเคส ⇒ คนที่เข้ามาทำ
-- 2 รอบได้ 2 รหัส (แทนไท INF-00160 + INF-00172) แฮชแท็ก #INF ที่ใช้ track ยอดจาก Meta
-- จึงแตกเป็น "คนละคน" และตัวเลือกแท็กในระบบ Task ก็ขึ้นซ้ำ 2 แถวคนละรหัส
--
-- โมเดลใหม่:
--   * ต้นทางของรหัส = `influ_profiles.influ_code` (unique, ออกให้ทันทีที่สร้างโปรไฟล์)
--   * `influencers.influ_code` = **สำเนา** ที่ trigger sync ให้ทุกรอบของคนเดียวกัน
--     (denormalize ไว้เพราะทั้งการ์ด/หัวเคส/ค้นหา/caseHashtags/แท็กใน Task อ่านช่องนี้อยู่แล้ว —
--      ไม่ต้องแก้จุดอ่านสักจุด)
--
-- เลือกรหัสที่เก็บ: รอบแรกของแต่ละคน (round_no ต่ำสุด) — ปลอดภัยเพราะ `influ_post_links`
-- ทั้งระบบมีแค่ 1 แถว ⇒ ยังไม่มีโพสจริงที่ติดแฮชแท็กรหัสรอบหลังไปแล้ว
-- (ตอนรัน: เปลี่ยน 2 แถว — INF-00172 → INF-00160 (แทนไท รอบ 2), INF-00170 → INF-00162 (หนิง รอบ 2))
-- ============================================================

alter table public.influ_profiles
  add column if not exists influ_code text;

comment on column public.influ_profiles.influ_code is
  'รหัส Influ ID ประจำตัวบุคคล (ต้นทาง) — ระบบออกให้ตอนสร้างโปรไฟล์ ห้ามพิมพ์เอง';
comment on column public.influencers.influ_code is
  'สำเนาของ influ_profiles.influ_code — trigger sync ให้ ทุกรอบของคนเดียวกันเท่ากันเสมอ';

create unique index if not exists influ_profiles_influ_code_key
  on public.influ_profiles (lower(influ_code))
  where influ_code is not null;

/* ---------- ออกรหัสไม่ให้ชนทั้ง 2 ตาราง ---------- */

create or replace function public.next_influ_code()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code text;
  v_guard int := 0;
begin
  loop
    v_code := 'INF-' || lpad(nextval('public.influ_code_seq')::text, 5, '0');
    exit when not exists (
      select 1 from public.influ_profiles where lower(influ_code) = lower(v_code)
    ) and not exists (
      -- เคสเก่าที่ยังถือรหัสเดิมไว้ (รวมแถวที่ archived) ก็ต้องไม่ชน
      select 1 from public.influencers where lower(influ_code) = lower(v_code)
    );
    v_guard := v_guard + 1;
    if v_guard > 5000 then
      raise exception 'ออกรหัส Influ ID ไม่สำเร็จ (ลองใหม่อีกครั้ง)';
    end if;
  end loop;
  return v_code;
end;
$fn$;

revoke execute on function public.next_influ_code() from public, anon;
grant execute on function public.next_influ_code() to authenticated, service_role;

/* ---------- backfill: โปรไฟล์ได้รหัสของรอบแรก ---------- */

with keep as (
  select distinct on (person_id) person_id, influ_code
    from public.influencers
   where influ_code is not null
   order by person_id, round_no, created_at
)
update public.influ_profiles p
   set influ_code = k.influ_code
  from keep k
 where k.person_id = p.id
   and p.influ_code is null;

-- โปรไฟล์ที่ยังไม่มีเคส (จึงไม่มีรหัสให้ยืม) — ออกใหม่ให้ทีละแถว
do $$
declare
  r record;
begin
  for r in select id from public.influ_profiles where influ_code is null loop
    update public.influ_profiles
       set influ_code = public.next_influ_code()
     where id = r.id;
  end loop;
end $$;

alter table public.influ_profiles
  alter column influ_code set not null;

/* ---------- ทุกเคสใช้รหัสของโปรไฟล์ ---------- */

-- log ก่อนเปลี่ยน (เปลี่ยนแล้วจะย้อนดูรหัสเดิมไม่ได้)
insert into public.influ_activity_log
  (actor_id, actor_name, action, entity, entity_id, influencer_id, influencer_name, summary, meta)
select null, 'ระบบ (migration 0107)', 'update', 'influencer', i.id, i.id,
       coalesce(nullif(btrim(coalesce(i.first_name, '') || ' ' || coalesce(i.last_name, '')), ''), 'ไม่ระบุชื่อ'),
       'ย้ายรหัส Influ ID มาเป็นของตัวบุคคล — รอบ ' || i.round_no || ' เปลี่ยนจาก ' ||
       coalesce(i.influ_code, '(ไม่มี)') || ' เป็น ' || p.influ_code,
       jsonb_build_object('person_id', i.person_id, 'old_code', i.influ_code, 'new_code', p.influ_code)
  from public.influencers i
  join public.influ_profiles p on p.id = i.person_id
 where i.influ_code is distinct from p.influ_code;

-- drop unique index ของเคสก่อน ไม่งั้น update ระหว่างทางจะชนกันเอง
drop index if exists public.influencers_influ_code_key;

update public.influencers i
   set influ_code = p.influ_code
  from public.influ_profiles p
 where p.id = i.person_id
   and i.influ_code is distinct from p.influ_code;

-- เหลือไว้เป็น index ธรรมดาเพื่อการค้นหา (ซ้ำได้แล้วโดยตั้งใจ — หลายรอบ = รหัสเดียวกัน)
create index if not exists influencers_influ_code_idx
  on public.influencers (lower(influ_code));

/* ---------- trigger: ออกรหัส + sync ---------- */

create or replace function public.influ_profile_set_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  if new.influ_code is null or btrim(new.influ_code) = '' then
    new.influ_code := public.next_influ_code();
  end if;
  return new;
end;
$fn$;

drop trigger if exists influ_profiles_set_code on public.influ_profiles;
create trigger influ_profiles_set_code
  before insert on public.influ_profiles
  for each row execute function public.influ_profile_set_code();

-- เคสยึดรหัสของโปรไฟล์เสมอ (รวมตอนกู้คืนจากถังขยะ ซึ่ง payload พกรหัสเดิมมา)
create or replace function public.influ_case_sync_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  select p.influ_code into new.influ_code
    from public.influ_profiles p
   where p.id = new.person_id;
  return new;
end;
$fn$;

drop trigger if exists influencers_sync_code on public.influencers;
create trigger influencers_sync_code
  before insert or update of person_id on public.influencers
  for each row execute function public.influ_case_sync_code();

-- เปลี่ยนรหัสที่โปรไฟล์ = ทุกรอบเปลี่ยนตาม
create or replace function public.influ_profile_code_fanout()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  update public.influencers
     set influ_code = new.influ_code
   where person_id = new.id
     and influ_code is distinct from new.influ_code;
  return new;
end;
$fn$;

drop trigger if exists influ_profiles_code_fanout on public.influ_profiles;
create trigger influ_profiles_code_fanout
  after update of influ_code on public.influ_profiles
  for each row execute function public.influ_profile_code_fanout();
