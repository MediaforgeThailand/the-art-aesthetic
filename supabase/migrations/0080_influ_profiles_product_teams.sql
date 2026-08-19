-- ============================================================
-- 0080 — โปรไฟล์ Influencer แยกจากเคส + หัตถการแยกตาม Product Team
-- (ผู้ใช้ 2026-08-19: "เพิ่ม influ แบ่งเป็น 2 ส่วน — สร้างโปรไฟล์ก่อน แล้วค่อยทำนัด")
--
-- แนวคิด: มีโปรไฟล์ = ตกลงร่วมงานกันแล้ว แต่ยังไม่ confirm หัตถการ/วันนัด
--   1) influ_profiles         = "ตัวบุคคล" จริง (เดิม person_id เป็นแค่ uuid ลอยๆ ที่ทุกรอบแชร์)
--                               เก็บข้อมูลติดต่อ + ใช้เป็นตัวเลือกตอน "สร้างนัดใหม่"
--                               backfill 1 โปรไฟล์ต่อ person_id จากข้อมูลรอบล่าสุด —
--                               **id ของโปรไฟล์ = person_id เดิม** จึงต่อ FK ได้โดยไม่แตะแถวเคส
--   2) influ_profile_channels = ช่องทางติดต่อ/โซเชียลของโปรไฟล์ (IG/TikTok/... หลายช่องได้)
--   3) influ_services         = ทะเบียนหัตถการที่ทีมเพิ่มเอง แยกตาม product team
--                               (aesthetics ใช้ price_items เป็นเมนูหลักเหมือนเดิม — ตารางนี้เก็บ
--                               เฉพาะที่ทีมเพิ่มใหม่; ทีมอื่นยังไม่มีเมนูกลาง = เริ่มจากตารางนี้ล้วน)
--   4) influ_procedure_items.product_team = รายการนั้นเป็นหัตถการของทีมไหน (ของเดิม = aesthetics)
--
-- product team มี 4 ทีม: aesthetics (สกินทั้งหมด) / breast (หน้าอก) /
-- abdomen (หนังหน้าท้อง) / lipo (ดูดไขมัน) — เพิ่มทีมใหม่ต้องแก้ 3 ที่:
-- type InfluProductTeam (database.types), INFLU_PRODUCT_TEAMS (influ-constants)
-- และ check constraint ทั้งสองตัวในไฟล์นี้ (ผ่าน migration ใหม่)
--
-- self-host: SQL มาตรฐานทั้งหมด ไม่พึ่งฟีเจอร์เฉพาะ cloud
-- ============================================================

/* ---------- 1) โปรไฟล์ตัวบุคคล ---------- */

create table if not exists public.influ_profiles (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  nickname text,
  phone text,
  occupation text,
  followers bigint,
  follower_note text,
  tier text,
  -- รูปโปรไฟล์ (อัพจากฟอร์มโปรไฟล์ path influencers/profiles/{id}/ —
  -- แถว backfill ชี้ไฟล์เดิมของเคส อาจหายถ้าเคสนั้นถูกลบ: UI ต้อง fallback ได้เสมอ)
  photo_path text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists influ_profiles_set_updated_at on public.influ_profiles;
create trigger influ_profiles_set_updated_at
  before update on public.influ_profiles
  for each row execute function public.set_updated_at();

alter table public.influ_profiles enable row level security;
drop policy if exists "authenticated all influ_profiles" on public.influ_profiles;
create policy "authenticated all influ_profiles"
  on public.influ_profiles for all to authenticated
  using (true) with check (true);

-- backfill: 1 โปรไฟล์ต่อ person_id — ใช้ข้อมูล "รอบล่าสุด" ของคนนั้น
insert into public.influ_profiles
  (id, first_name, last_name, nickname, phone, occupation,
   followers, follower_note, tier, photo_path, created_by, created_at)
select distinct on (person_id)
  person_id, first_name, last_name, nickname, phone, occupation,
  followers, follower_note, tier, photo_path, created_by, created_at
from public.influencers
order by person_id, round_no desc, created_at desc
on conflict (id) do nothing;

-- ผูกเคสเข้ากับโปรไฟล์ — จากนี้สร้างเคสต้องมีโปรไฟล์ก่อนเสมอ
-- (ลบโปรไฟล์ที่ยังมีเคสอ้างอยู่ไม่ได้ = RESTRICT โดย default;
--  ถอด default gen_random_uuid ออก: insert เคสโดยไม่ส่ง person_id ต้อง fail ดังๆ
--  ไม่ใช่สุ่ม uuid ที่ไม่มีโปรไฟล์รองรับ)
alter table public.influencers
  alter column person_id drop default;
do $$
begin
  alter table public.influencers
    add constraint influencers_person_id_fkey
    foreign key (person_id) references public.influ_profiles(id);
exception when duplicate_object then null;
end $$;

/* ---------- 2) ช่องทางติดต่อ/โซเชียลของโปรไฟล์ ---------- */

create table if not exists public.influ_profile_channels (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.influ_profiles(id) on delete cascade,
  -- ชื่อแพลตฟอร์ม text อิสระ (Instagram / TikTok / Facebook / Line / เบอร์สำรอง ...)
  platform text not null,
  -- ลิงก์หรือ handle เช่น https://tiktok.com/@... หรือ @mimi_beauty หรือเบอร์โทร
  value text not null,
  -- ยอดผู้ติดตามของ "ช่องนี้" (ยอดรวมของคนอยู่ที่ influ_profiles.followers)
  followers bigint,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists influ_profile_channels_profile_idx
  on public.influ_profile_channels (profile_id);

alter table public.influ_profile_channels enable row level security;
drop policy if exists "authenticated all influ_profile_channels" on public.influ_profile_channels;
create policy "authenticated all influ_profile_channels"
  on public.influ_profile_channels for all to authenticated
  using (true) with check (true);

/* ---------- 3) ทะเบียนหัตถการที่ทีมเพิ่มเอง (แยกตาม product team) ---------- */

create table if not exists public.influ_services (
  id uuid primary key default gen_random_uuid(),
  team text not null
    constraint influ_services_team_valid
    check (team in ('aesthetics', 'breast', 'abdomen', 'lipo')),
  name text not null,
  -- ต้นทุนอ้างอิงตั้งต้น (บาท) — null/0 = ยังไม่รู้ ให้ไปกรอกที่ Influencer Cost
  default_price numeric,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- กันพิมพ์ชื่อเดิมซ้ำในทีมเดียวกัน (ไม่สนตัวพิมพ์) — คนละทีมชื่อซ้ำกันได้
create unique index if not exists influ_services_team_name_key
  on public.influ_services (team, lower(name));

alter table public.influ_services enable row level security;
drop policy if exists "authenticated all influ_services" on public.influ_services;
create policy "authenticated all influ_services"
  on public.influ_services for all to authenticated
  using (true) with check (true);

/* ---------- 4) หัตถการของเคสระบุทีม ---------- */

alter table public.influ_procedure_items
  add column if not exists product_team text not null default 'aesthetics';
do $$
begin
  alter table public.influ_procedure_items
    add constraint influ_procedure_items_team_valid
    check (product_team in ('aesthetics', 'breast', 'abdomen', 'lipo'));
exception when duplicate_object then null;
end $$;

comment on column public.influ_procedure_items.product_team is
  'หัตถการรายการนี้เป็นของ product team ไหน — ของเดิมทั้งหมดคือ aesthetics';
