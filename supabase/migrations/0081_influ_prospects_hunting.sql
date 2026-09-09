-- ============================================================
-- 0081 — บอร์ด Hunting: แยกขั้น "ติดต่อ + รายละเอียด" ออกจากบอร์ดเคส
-- (ผู้ใช้ 2026-08-19: สองขั้นแรกคือ flow ก่อนขึ้นโปรไฟล์ —
--  ขึ้นโปรไฟล์ = ตอบรับแล้ว; ให้ทำเป็นหน้าแยก "Hunting" เต็มรูปแบบ)
--
--   1) influ_prospects         = คนที่กำลังตามล่า/ติดต่อ ยังไม่ตอบรับ (ยังไม่มีโปรไฟล์)
--                                pipeline: new → contacted → negotiating → accepted | declined
--   2) influ_prospect_contacts = log การติดต่อรายครั้ง (วันที่/ช่องทาง/ผลลัพธ์)
--   3) ย้ายเคส stage ≤ 2 (ไม่ archived/ไม่ completed) เข้า influ_prospects
--      แล้วลบแถวเคสผ่าน influ_delete_with_backup (กู้จากถังขยะได้ 30 วัน)
--      + ลบโปรไฟล์ backfill ที่ไม่เหลือเคสอ้างอิง (คนพวกนี้ยังไม่เคยตอบรับ
--      ไม่ควรมีโปรไฟล์ตามนิยาม 0080) — หมายเหตุ: การกู้เคสพวกนี้จากถังขยะ
--      จะติด FK person_id เพราะโปรไฟล์ถูกลบแล้ว (ข้อมูลจริงอยู่ใน influ_prospects)
--
-- ผลจริงตอน apply บนโปรดักชัน 2026-08-19: ย้าย 65 แถว (contacted 55 / declined 10),
-- backup 65 ใบ, ลบโปรไฟล์กำพร้า 65 แถว — เหลือเคส 167 / โปรไฟล์ 167 ตรงกันพอดี
--
-- self-host: SQL มาตรฐานทั้งหมด ไม่พึ่งฟีเจอร์เฉพาะ cloud
-- ============================================================

/* ---------- 1) prospect = คนที่กำลังตามล่า ---------- */

create table if not exists public.influ_prospects (
  id uuid primary key default gen_random_uuid(),
  -- ชื่อเดียวพอ (ตอนล่ามักรู้แค่ชื่อช่อง) — แตก ชื่อ/นามสกุล ตอนแปลงเป็นโปรไฟล์
  name text not null,
  nickname text,
  phone text,
  occupation text,
  followers bigint,
  photo_path text,
  -- ช่องทางโซเชียล [{platform, value, followers}] — โครงเดียวกับฟอร์มโปรไฟล์
  -- ใช้ jsonb เพราะยังเป็นแค่โน้ตตอนล่า แปลงเป็นแถว influ_profile_channels ตอนตอบรับ
  channels jsonb not null default '[]'::jsonb,
  -- เจอมาจากไหน (ค้น TikTok / มีคนแนะนำ / ทักมาเอง ...)
  source text,
  -- ความน่าสนใจ 0-5 ดาว (0 = ยังไม่ให้คะแนน)
  rating smallint not null default 0,
  -- หัตถการที่น่าจะเสนอ/สนใจ (ข้อความอิสระ — ยัง confirm ไม่ได้จนกว่าจะตอบรับ)
  interested_services text,
  note text,
  status text not null default 'new',
  -- นัดตามครั้งถัดไป — เลยวันแล้วขึ้นเตือนบนบอร์ด
  next_followup_on date,
  accepted_at timestamptz,
  declined_at timestamptz,
  -- โปรไฟล์ที่สร้างตอนตอบรับ (หรือโปรไฟล์เดิมถ้าคนนี้เคยอยู่ในระบบ)
  profile_id uuid references public.influ_profiles(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint influ_prospects_status_valid
    check (status in ('new', 'contacted', 'negotiating', 'accepted', 'declined')),
  constraint influ_prospects_rating_valid check (rating between 0 and 5)
);

create index if not exists influ_prospects_status_idx on public.influ_prospects (status);
create index if not exists influ_prospects_owner_idx on public.influ_prospects (owner_id);

drop trigger if exists influ_prospects_set_updated_at on public.influ_prospects;
create trigger influ_prospects_set_updated_at
  before update on public.influ_prospects
  for each row execute function public.set_updated_at();

alter table public.influ_prospects enable row level security;
drop policy if exists "authenticated all influ_prospects" on public.influ_prospects;
create policy "authenticated all influ_prospects"
  on public.influ_prospects for all to authenticated
  using (true) with check (true);

/* ---------- 2) log การติดต่อรายครั้ง ---------- */

create table if not exists public.influ_prospect_contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.influ_prospects(id) on delete cascade,
  contacted_on date not null default current_date,
  -- ช่องทางที่ทักไป (IG DM / TikTok / โทร / Line ...) — text อิสระ
  channel text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists influ_prospect_contacts_prospect_idx
  on public.influ_prospect_contacts (prospect_id);

alter table public.influ_prospect_contacts enable row level security;
drop policy if exists "authenticated all influ_prospect_contacts" on public.influ_prospect_contacts;
create policy "authenticated all influ_prospect_contacts"
  on public.influ_prospect_contacts for all to authenticated
  using (true) with check (true);

/* ---------- 3) ย้ายเคส stage ≤ 2 เข้าบอร์ด Hunting ---------- */

-- id ของ prospect = id เคสเดิม (แกะรอยย้อนกลับได้จาก log/ถังขยะ)
insert into public.influ_prospects
  (id, name, nickname, phone, occupation, followers, photo_path,
   source, interested_services, note, status, declined_at,
   profile_id, owner_id, created_by, created_at, updated_at)
select
  i.id,
  trim(i.first_name || ' ' || coalesce(i.last_name, '')),
  i.nickname, i.phone, i.occupation, i.followers, i.photo_path,
  'ย้ายมาจากบอร์ดเคสเดิม (ขั้นติดต่อ/รายละเอียด)',
  i.procedure_text, i.note,
  case
    when i.declined_at is not null then 'declined'
    when i.stage >= 2 then 'negotiating'
    else 'contacted'
  end,
  i.declined_at,
  i.person_id, i.owner_id, i.created_by, i.created_at, i.updated_at
from public.influencers i
where i.stage <= 2 and i.archived = false and i.completed = false
on conflict (id) do nothing;

-- (influ_followups ของเคสชุดนี้ = 0 แถว ตรวจแล้ว — ไม่มี log ติดต่อให้ย้าย)

-- ลบแถวเคสผ่าน RPC สำรอง-ลบ (ลูกทุกตารางถูกยัดลง payload + เข้าถังขยะ 30 วัน;
-- auth.uid() เป็น null จาก migration = ปล่อยผ่านสำหรับงานดูแลระบบตามที่ 0075 ตั้งใจ)
do $$
declare r record;
begin
  for r in
    select id from public.influencers
    where stage <= 2 and archived = false and completed = false
  loop
    perform public.influ_delete_with_backup(r.id);
  end loop;
end $$;

-- โปรไฟล์ backfill ของคนที่ยังไม่เคยตอบรับ (ไม่เหลือเคสไหนอ้าง) — ลบทิ้งตามนิยาม
-- "มีโปรไฟล์ = ตอบรับแล้ว"; FK จาก influ_prospects.profile_id เป็น SET NULL จึงไม่ติด
delete from public.influ_profiles p
where exists (select 1 from public.influ_prospects x where x.profile_id = p.id)
  and not exists (select 1 from public.influencers i where i.person_id = p.id);

-- log สรุปหนึ่งแถวให้ผู้ดูแลรู้ว่าแถว "ลบเคส" จำนวนมากด้านบนคือการย้ายระบบ ไม่ใช่คนกดลบ
insert into public.influ_activity_log
  (actor_id, actor_name, action, entity, summary, meta)
values
  (null, 'ระบบ (migration 0081)', 'update', 'prospect',
   'ย้ายเคสขั้น "ติดต่อ/รายละเอียด" ทั้งหมดไปบอร์ด Hunting ใหม่ — แถว "ลบเคส" ก่อนหน้านี้คือการย้ายอัตโนมัติ (ข้อมูลอยู่ครบใน Hunting และกู้เคสเดิมได้จากถังขยะ 30 วัน)',
   '{"migration": "0081"}'::jsonb);
