-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0120 = migration "sales_queue_core" (version 20260820091315) ที่ apply บน Supabase แล้วเมื่อ 2026-08-20
-- ที่มาของไฟล์: repo `the-art-sales-assistant` โฟลเดอร์ `queue/supabase/migrations/` (ถูกลบไปพร้อมโฟลเดอร์ queue/ ตอนรวม Sales Queue เข้าแอปนี้ — commit 00f2265) — ชื่อเดิม 0001_sales_queue_core.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- ============================================================================
-- Sales Queue (ระบบรันคิวลูกค้า Online ของทีม Beauty Consult)
--
-- อยู่ในฐานข้อมูลเดียวกับระบบหลัง (TheArtAesthetic) — ทุกตารางขึ้นต้นด้วย `sq_`
-- และ **ไม่แตะตารางเดิมเลย** (อ้าง auth.users / public.profiles แบบอ่านอย่างเดียว)
--
-- หลักการความปลอดภัย (สรุปจากข้อกำหนด §14):
--   * ไม่เก็บเลขบัตรประชาชน โรคประจำตัว หรือประวัติแพ้ยา ลงตารางคิวเลย
--     ข้อความดิบที่แอดมินวาง (ซึ่งมีข้อมูลเหล่านั้น) เก็บแยกที่ `sq_case_raw`
--     แอดมินเท่านั้นที่อ่านได้ และถูกลบทิ้งทันทีที่ส่งเข้า Google Chat สำเร็จ
--   * RLS จริงรายแถวทุกตาราง — BC เห็นเฉพาะเคสที่ถูกมอบหมายให้ตัวเอง
--   * การเขียนทุกอย่างผ่าน RPC (SECURITY DEFINER) ที่ตรวจสิทธิ์เองและเขียน audit
--     ตารางจึงไม่มี policy INSERT/UPDATE/DELETE ให้ client เรียกตรงๆ ได้เลย
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper functions (ใช้ทั้งใน RLS และ RPC)
-- ---------------------------------------------------------------------------

-- วันที่ "วันนี้" ตามเวลาไทยเสมอ — server เป็น UTC การนับคิวรายวันจะเพี้ยนช่วงหัวค่ำ
create or replace function public.sq_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Bangkok')::date
$$;

-- คีย์เดือน 'YYYY-MM' ตามเวลาไทย
create or replace function public.sq_period_key(p_date date default null)
returns text language sql stable as $$
  select to_char(coalesce(p_date, public.sq_today()), 'YYYY-MM')
$$;

-- Weight ตามอันดับ Drag ประจำเดือน (§7.4) — 1–3 ได้ 4, 4–5 ได้ 2, 6+ ได้ 1
create or replace function public.sq_weight_for_rank(p_rank int)
returns int language sql immutable as $$
  select case
    when p_rank is null then 1
    when p_rank <= 3 then 4
    when p_rank <= 5 then 2
    else 1
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. ตารางสมาชิกทีม Beauty Consult
--    เก็บ role ของระบบคิวไว้ที่นี่ **จงใจไม่ใช้ profiles.permissions**
--    เพราะ edge function `admin-users` ของระบบหลักมี whitelist ของ permission
--    ที่รู้จัก แล้วเขียนทับค่านอก whitelist ทิ้งทุกครั้งที่แก้บัญชี
-- ---------------------------------------------------------------------------

create table if not exists public.sq_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null,
  employee_code text,
  -- 'bc' = Beauty Consult รับคิว, 'admin' = แอดมินระบบคิว
  role text not null default 'bc' check (role in ('bc', 'admin')),
  is_active boolean not null default true,
  queue_enabled boolean not null default true,
  availability text not null default 'available'
    check (availability in ('available', 'busy', 'paused', 'offline')),
  joined_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivation_reason text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sq_members is 'สมาชิกทีม Beauty Consult ของระบบคิว — อ้าง auth.users ด้วย stable id ไม่ผูกด้วยชื่อ';
comment on column public.sq_members.is_active is 'ยังอยู่ในทีมหรือไม่ (ลบใน UI = ตั้งเป็น false เพื่อรักษาประวัติ)';
comment on column public.sq_members.availability is 'สถานะเรียลไทม์ — มีเฉพาะ available ที่เข้าเกณฑ์รับคิวใหม่';

-- ตรวจสิทธิ์แอดมิน — เป็นแอดมินระบบคิว **หรือ** แอดมินของระบบหลัก
-- (ข้อหลังคือทางเข้าตั้งต้น: วันแรกที่เปิดระบบยังไม่มีใครอยู่ใน sq_members เลย
--  ถ้าไม่มีทางนี้จะไม่มีใครเพิ่มสมาชิกคนแรกได้)
create or replace function public.sq_is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.sq_members m
    where m.user_id = auth.uid() and m.is_active and m.role = 'admin'
  ) or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
$$;

-- ตรวจสิทธิ์: เป็นสมาชิกระบบคิวที่ยัง active หรือไม่
create or replace function public.sq_is_member()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.sq_members m
    where m.user_id = auth.uid() and m.is_active
  ) or public.sq_is_admin()
$$;

-- id สมาชิกของผู้ใช้ที่ล็อกอินอยู่ (null ถ้าไม่ได้เป็นสมาชิก)
create or replace function public.sq_my_member_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select m.id from public.sq_members m where m.user_id = auth.uid() limit 1
$$;

-- ---------------------------------------------------------------------------
-- 3. Ranking ประจำเดือน (snapshot — ห้ามแก้ย้อนหลัง ต้องออกเวอร์ชันใหม่)
-- ---------------------------------------------------------------------------

create table if not exists public.sq_ranking_periods (
  id uuid primary key default gen_random_uuid(),
  period_key text not null check (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  version int not null default 1,
  status text not null default 'published'
    check (status in ('draft', 'published', 'superseded')),
  source_note text,
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (period_key, version)
);

-- หนึ่งเดือนมี "ฉบับที่ใช้จริง" ได้ครั้งละหนึ่งเวอร์ชันเท่านั้น
create unique index if not exists sq_ranking_periods_one_published
  on public.sq_ranking_periods (period_key)
  where status = 'published';

create table if not exists public.sq_ranking_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.sq_ranking_periods(id) on delete cascade,
  member_id uuid not null references public.sq_members(id) on delete restrict,
  rank int not null check (rank >= 1),
  weight int not null check (weight >= 1),
  drag_paid_bills int not null default 0,
  drag_net_sales numeric(14, 2) not null default 0,
  cancel_count int,
  source_name text,
  source_row int,
  created_at timestamptz not null default now(),
  unique (period_id, member_id),
  unique (period_id, rank)
);

comment on column public.sq_ranking_entries.source_name is 'ชื่อดิบจากชีต — เก็บไว้ตรวจย้อนว่า map ไปหาใคร';

-- ---------------------------------------------------------------------------
-- 4. เคสปิดการขาย
--    **ไม่มีคอลัมน์เลขบัตรประชาชน / โรคประจำตัว / ประวัติแพ้ยา โดยเจตนา**
-- ---------------------------------------------------------------------------

create table if not exists public.sq_cases (
  id uuid primary key default gen_random_uuid(),
  case_no bigint generated always as identity,
  case_type text not null
    check (case_type in ('online', 'walk_in', 'existing', 'referral', 'drag_surgery', 'other')),
  status text not null default 'open'
    check (status in ('open', 'pending_manual_assignment', 'cancelled')),

  customer_name text not null,
  customer_age int,
  -- ข้อมูลติดต่อ — BC เห็นได้เฉพาะเคสของตัวเอง (คุมด้วย RLS), รายการรวมมาสก์ที่ UI
  phone text,
  line_id text,

  appointment_date date,
  appointment_time time,
  treatment_main text,
  treatment_detail text,
  doctor text,
  branch text,
  channel text,
  seller_name text,
  owner_bc_name text,
  discussion_start_date date,
  closed_date date,
  note text,

  -- คีย์กันเคสซ้ำ (เบอร์ + วันเวลานัด + หัตถการหลัก แบบ normalize แล้ว)
  dup_key text,
  -- คีย์กันการกดยืนยันซ้ำจากหน้าเดิม (คนละเรื่องกับ dup_key)
  idempotency_key text,
  force_reason text,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sq_cases_idempotency_key_uniq
  on public.sq_cases (idempotency_key)
  where idempotency_key is not null;
create index if not exists sq_cases_dup_key_idx on public.sq_cases (dup_key);
create index if not exists sq_cases_created_at_idx on public.sq_cases (created_at desc);
create index if not exists sq_cases_appointment_idx on public.sq_cases (appointment_date);

-- ข้อความดิบที่แอดมินวาง — มี PII เต็มรูปแบบ เก็บไว้เพียงเพื่อส่ง/ส่งซ้ำเข้า Google Chat
-- ลบทิ้งทันทีที่ส่งสำเร็จ (ดู sq_mark_delivery) และมี sq_purge_raw() ไล่เก็บของค้าง
create table if not exists public.sq_case_raw (
  case_id uuid primary key references public.sq_cases(id) on delete cascade,
  raw_text text not null,
  created_at timestamptz not null default now()
);

comment on table public.sq_case_raw is 'ข้อความดิบมี PII — แอดมินเท่านั้นที่อ่านได้ และลบทิ้งเมื่อส่ง Google Chat สำเร็จ';

-- ---------------------------------------------------------------------------
-- 5. การมอบหมายคิว
-- ---------------------------------------------------------------------------

create table if not exists public.sq_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.sq_cases(id) on delete cascade,
  member_id uuid references public.sq_members(id) on delete restrict,
  status text not null
    check (status in ('assigned', 'acknowledged', 'reassigned',
                      'pending_manual_assignment', 'cancelled', 'voided')),

  -- snapshot ณ เวลาแจก — Ranking เดือนใหม่ต้องไม่ย้อนไปแก้ของเก่า
  rank_snapshot int,
  weight_snapshot int not null default 1,
  daily_ratio numeric(10, 4),
  monthly_ratio numeric(10, 4),
  seq_today int,

  quota_consumed boolean not null default true,
  assigned_date date not null default public.sq_today(),
  period_key text not null default public.sq_period_key(),

  assigned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  reassigned_at timestamptz,
  voided_at timestamptz,
  reason text,
  replaced_by uuid references public.sq_assignments(id),

  created_by uuid references auth.users(id)
);

-- หนึ่งเคสมีคิวที่ยัง "มีผล" ได้ใบเดียว — กันแจกซ้ำจากการกดยืนยันพร้อมกัน
create unique index if not exists sq_assignments_one_active_per_case
  on public.sq_assignments (case_id)
  where status in ('assigned', 'acknowledged', 'pending_manual_assignment');

create index if not exists sq_assignments_member_day_idx
  on public.sq_assignments (member_id, assigned_date) where quota_consumed;
create index if not exists sq_assignments_member_month_idx
  on public.sq_assignments (member_id, period_key) where quota_consumed;
create index if not exists sq_assignments_case_idx on public.sq_assignments (case_id);

-- ---------------------------------------------------------------------------
-- 6. สถานะการส่งเข้า Google Chat
-- ---------------------------------------------------------------------------

create table if not exists public.sq_deliveries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.sq_cases(id) on delete cascade,
  destination text,
  idempotency_key text not null unique,
  external_message_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'not_configured', 'skipped')),
  attempt_count int not null default 0,
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.sq_deliveries.last_error is 'ข้อความ error แบบตัดข้อมูลลูกค้าออกแล้ว (redacted)';

-- ---------------------------------------------------------------------------
-- 7. Audit log — ทุกการกระทำที่เปลี่ยนสถานะต้องลงที่นี่ (ห้ามมี PII)
-- ---------------------------------------------------------------------------

create table if not exists public.sq_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sq_audit_log_created_idx on public.sq_audit_log (created_at desc);
create index if not exists sq_audit_log_entity_idx on public.sq_audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 8. ค่าตั้งระบบ (แอดมินแก้ได้จากหน้าเว็บ ไม่ต้อง deploy)
-- ---------------------------------------------------------------------------

create table if not exists public.sq_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.sq_settings (key, value) values
  ('online_channels', '["L10"]'::jsonb),
  ('ack_sla_minutes', '30'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Normalize + duplicate key
-- ---------------------------------------------------------------------------

create or replace function public.sq_normalize_phone(p_phone text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '')
$$;

create or replace function public.sq_dup_key(
  p_phone text, p_date date, p_time time, p_treatment text
) returns text language sql immutable as $$
  select coalesce(public.sq_normalize_phone(p_phone), 'nophone')
    || '|' || coalesce(p_date::text, '')
    || '|' || coalesce(to_char(p_time, 'HH24:MI'), '')
    || '|' || lower(regexp_replace(coalesce(p_treatment, ''), '\s+', '', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- 10. Audit helper
-- ---------------------------------------------------------------------------

create or replace function public.sq_audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_reason text default null, p_summary jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.sq_audit_log (actor_id, action, entity_type, entity_id, reason, summary)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_reason, coalesce(p_summary, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- 11. เครื่องแจกคิว (Weighted Fair Queue)
--
--     ลำดับการเลือกตามข้อกำหนด §10.2:
--       1) daily ratio ต่ำสุด  2) monthly ratio ต่ำสุด
--       3) last_assigned_at เก่าสุด  4) id (deterministic)
--
--     หมายเหตุการตัดสินใจ: ใช้ ratio "หลังได้รับเคสนี้" คือ (n + 1) / weight
--     ไม่ใช่ n / weight ตรงๆ — สองสูตรให้ผลเท่ากันที่ 19 เคส (4,4,4,2,2,1,1,1)
--     แต่วันที่มี 20–22 เคส สูตร n/weight จะเสมอกันหมดที่ ratio 1.0 แล้วตกไปที่
--     ข้อ 3 (คนที่ได้คิวนานสุด) ซึ่งเป็นคน weight 1 → กลายเป็น 4,4,4,2,2,2,2,2
--     ผิดเจตนาข้อ §10.2 ที่ให้ "กระจายตาม Ratio". สูตร (n+1)/weight ให้
--     5,5,5,2,2,1,1,1 ซึ่งได้สัดส่วนตาม weight จริง
-- ---------------------------------------------------------------------------

create or replace function public.sq_pick_member(p_exclude uuid[] default '{}'::uuid[])
returns table (
  member_id uuid, weight int, rank_snapshot int,
  daily_ratio numeric, monthly_ratio numeric
)
language sql stable security definer set search_path = public, pg_temp as $$
  with today as (select public.sq_today() as d, public.sq_period_key() as k),
  period as (
    select rp.id from public.sq_ranking_periods rp, today
    where rp.period_key = today.k and rp.status = 'published'
    limit 1
  ),
  candidates as (
    select m.id,
           coalesce(re.weight, 1) as w,   -- ยังไม่มี ranking เดือนนี้ = weight 1 (§6 ข้อ 7)
           re.rank as rk
    from public.sq_members m
    left join public.sq_ranking_entries re
      on re.member_id = m.id and re.period_id = (select id from period)
    where m.is_active
      and m.queue_enabled
      and m.availability = 'available'
      and not (m.id = any (coalesce(p_exclude, '{}'::uuid[])))
  ),
  scored as (
    select c.id, c.w, c.rk,
      (select count(*) from public.sq_assignments a, today
        where a.member_id = c.id and a.assigned_date = today.d and a.quota_consumed)::numeric as n_day,
      (select count(*) from public.sq_assignments a, today
        where a.member_id = c.id and a.period_key = today.k and a.quota_consumed)::numeric as n_month,
      (select max(a.assigned_at) from public.sq_assignments a where a.member_id = c.id) as last_at
    from candidates c
  )
  select id, w, rk, round(n_day / w, 4), round(n_month / w, 4)
  from scored
  order by (n_day + 1) / w asc, (n_month + 1) / w asc, last_at asc nulls first, id asc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 12. RPC: สร้างเคสและแจกคิว (atomic)
-- ---------------------------------------------------------------------------

create or replace function public.sq_create_case(
  p_payload jsonb,
  p_raw_text text,
  p_case_type text,
  p_idempotency_key text,
  p_force boolean default false,
  p_force_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.sq_cases%rowtype;
  v_existing public.sq_cases%rowtype;
  v_dup_key text;
  v_member_id uuid;
  v_weight int;
  v_rank int;
  v_daily numeric;
  v_monthly numeric;
  v_assignment public.sq_assignments%rowtype;
  v_seq int;
  v_member_name text;
begin
  if not public.sq_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_case_type is null or p_case_type not in
     ('online', 'walk_in', 'existing', 'referral', 'drag_surgery', 'other') then
    raise exception 'invalid_case_type';
  end if;

  -- ล็อกทั้งการแจกคิว: แอดมินสองคนกดยืนยันพร้อมกันต้องไม่คำนวณจากยอดเดียวกัน
  perform pg_advisory_xact_lock(hashtext('sq_queue_allocation'));

  -- กดยืนยันซ้ำจากหน้าเดิม = คืนผลเดิม ไม่สร้างใหม่
  if p_idempotency_key is not null then
    select * into v_existing from public.sq_cases where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('status', 'duplicate_request', 'case_id', v_existing.id);
    end if;
  end if;

  v_dup_key := public.sq_dup_key(
    p_payload->>'phone',
    nullif(p_payload->>'appointment_date', '')::date,
    nullif(p_payload->>'appointment_time', '')::time,
    p_payload->>'treatment_main'
  );

  -- เคสซ้ำเชิงธุรกิจ — ต้องให้แอดมินตัดสินใจ ห้ามแจกคิวซ้ำอัตโนมัติ
  if not coalesce(p_force, false) then
    select * into v_existing
    from public.sq_cases c
    where c.dup_key = v_dup_key and c.status <> 'cancelled'
    order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object(
        'status', 'duplicate_case',
        'existing_case_id', v_existing.id,
        'existing_case_no', v_existing.case_no,
        'existing_created_at', v_existing.created_at,
        'existing_assignee', (
          select m.display_name from public.sq_assignments a
          join public.sq_members m on m.id = a.member_id
          where a.case_id = v_existing.id
            and a.status in ('assigned', 'acknowledged')
          limit 1
        )
      );
    end if;
  elsif coalesce(btrim(p_force_reason), '') = '' then
    raise exception 'force_reason_required';
  end if;

  insert into public.sq_cases (
    case_type, status, customer_name, customer_age, phone, line_id,
    appointment_date, appointment_time, treatment_main, treatment_detail,
    doctor, branch, channel, seller_name, owner_bc_name,
    discussion_start_date, closed_date, note,
    dup_key, idempotency_key, force_reason, created_by
  ) values (
    p_case_type, 'open',
    btrim(p_payload->>'customer_name'),
    nullif(p_payload->>'customer_age', '')::int,
    nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
    nullif(btrim(coalesce(p_payload->>'line_id', '')), ''),
    nullif(p_payload->>'appointment_date', '')::date,
    nullif(p_payload->>'appointment_time', '')::time,
    nullif(btrim(coalesce(p_payload->>'treatment_main', '')), ''),
    nullif(btrim(coalesce(p_payload->>'treatment_detail', '')), ''),
    nullif(btrim(coalesce(p_payload->>'doctor', '')), ''),
    nullif(btrim(coalesce(p_payload->>'branch', '')), ''),
    nullif(btrim(coalesce(p_payload->>'channel', '')), ''),
    nullif(btrim(coalesce(p_payload->>'seller_name', '')), ''),
    nullif(btrim(coalesce(p_payload->>'owner_bc_name', '')), ''),
    nullif(p_payload->>'discussion_start_date', '')::date,
    nullif(p_payload->>'closed_date', '')::date,
    nullif(btrim(coalesce(p_payload->>'note', '')), ''),
    v_dup_key,
    p_idempotency_key,
    case when coalesce(p_force, false) then btrim(p_force_reason) end,
    auth.uid()
  ) returning * into v_case;

  if coalesce(btrim(p_raw_text), '') <> '' then
    insert into public.sq_case_raw (case_id, raw_text) values (v_case.id, p_raw_text);
  end if;

  insert into public.sq_deliveries (case_id, idempotency_key, status)
  values (v_case.id, 'case:' || v_case.id::text, 'pending');

  -- เฉพาะเคส Online เท่านั้นที่เข้าคิวอัตโนมัติ (§9)
  if p_case_type = 'online' then
    select p.member_id, p.weight, p.rank_snapshot, p.daily_ratio, p.monthly_ratio
      into v_member_id, v_weight, v_rank, v_daily, v_monthly
    from public.sq_pick_member() p;

    select coalesce(max(a.seq_today), 0) + 1 into v_seq
    from public.sq_assignments a
    where a.assigned_date = public.sq_today();

    if v_member_id is null then
      update public.sq_cases set status = 'pending_manual_assignment' where id = v_case.id;
      insert into public.sq_assignments (
        case_id, member_id, status, quota_consumed, seq_today, created_by
      ) values (
        v_case.id, null, 'pending_manual_assignment', false, v_seq, auth.uid()
      ) returning * into v_assignment;
    else
      insert into public.sq_assignments (
        case_id, member_id, status, rank_snapshot, weight_snapshot,
        daily_ratio, monthly_ratio, seq_today, created_by
      ) values (
        v_case.id, v_member_id, 'assigned', v_rank, v_weight,
        v_daily, v_monthly, v_seq, auth.uid()
      ) returning * into v_assignment;

      select display_name into v_member_name from public.sq_members where id = v_member_id;
    end if;
  end if;

  perform public.sq_audit(
    'case.create', 'case', v_case.id,
    case when coalesce(p_force, false) then btrim(p_force_reason) end,
    jsonb_build_object(
      'case_no', v_case.case_no,
      'case_type', p_case_type,
      'assigned_member_id', v_assignment.member_id,
      'weight', v_assignment.weight_snapshot,
      'forced', coalesce(p_force, false)
    )
  );

  return jsonb_build_object(
    'status', 'created',
    'case_id', v_case.id,
    'case_no', v_case.case_no,
    'case_type', p_case_type,
    'assignment_id', v_assignment.id,
    'assignment_status', v_assignment.status,
    'member_id', v_assignment.member_id,
    'member_name', v_member_name,
    'rank', v_assignment.rank_snapshot,
    'weight', v_assignment.weight_snapshot,
    'seq_today', v_assignment.seq_today
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. RPC: รับทราบคิว / มอบหมายใหม่ / ยกเลิกคิว
-- ---------------------------------------------------------------------------

create or replace function public.sq_acknowledge(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a public.sq_assignments%rowtype;
begin
  select * into v_a from public.sq_assignments where id = p_assignment_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  -- เจ้าของคิวเท่านั้น (แอดมินกดแทนได้เพื่อกรณีปลายทางกดไม่ได้)
  if not (v_a.member_id = public.sq_my_member_id() or public.sq_is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_a.status = 'acknowledged' then
    return jsonb_build_object('status', 'already_acknowledged');
  end if;
  if v_a.status <> 'assigned' then
    raise exception 'invalid_state';
  end if;

  -- กดรับทราบ **ไม่แตะ quota** — นับไปแล้วตั้งแต่ตอนแจก (§10.4)
  update public.sq_assignments
    set status = 'acknowledged', acknowledged_at = now()
    where id = p_assignment_id;

  perform public.sq_audit('assignment.acknowledge', 'assignment', p_assignment_id, null,
    jsonb_build_object('case_id', v_a.case_id));
  return jsonb_build_object('status', 'acknowledged');
end;
$$;

create or replace function public.sq_reassign(
  p_assignment_id uuid, p_reason text, p_target_member_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a public.sq_assignments%rowtype;
  v_new public.sq_assignments%rowtype;
  v_seq int;
  v_member_id uuid;
  v_weight int;
  v_rank int;
  v_daily numeric;
  v_monthly numeric;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  perform pg_advisory_xact_lock(hashtext('sq_queue_allocation'));

  select * into v_a from public.sq_assignments where id = p_assignment_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_a.status not in ('assigned', 'acknowledged', 'pending_manual_assignment') then
    raise exception 'invalid_state';
  end if;

  if p_target_member_id is not null then
    select coalesce(re.weight, 1), re.rank into v_weight, v_rank
    from public.sq_members m
    left join public.sq_ranking_entries re on re.member_id = m.id
      and re.period_id = (
        select id from public.sq_ranking_periods
        where period_key = public.sq_period_key() and status = 'published' limit 1
      )
    where m.id = p_target_member_id and m.is_active;
    if v_weight is null then raise exception 'target_not_eligible'; end if;
    v_member_id := p_target_member_id;
  else
    -- เลือกคนถัดไปตามกติกาเดิม โดยข้ามคนเดิมไป
    select p.member_id, p.weight, p.rank_snapshot, p.daily_ratio, p.monthly_ratio
      into v_member_id, v_weight, v_rank, v_daily, v_monthly
    from public.sq_pick_member(array[v_a.member_id]) p;
    if v_member_id is null then raise exception 'no_eligible_member'; end if;
  end if;

  -- คิวเดิมยังถือว่า "ใช้สิทธิ์ไปแล้ว" (§10.4) — ไม่คืน quota เว้นแต่แอดมินสั่ง void
  update public.sq_assignments
    set status = 'reassigned', reassigned_at = now(), reason = btrim(p_reason)
    where id = p_assignment_id;

  select coalesce(max(a.seq_today), 0) + 1 into v_seq
  from public.sq_assignments a where a.assigned_date = public.sq_today();

  insert into public.sq_assignments (
    case_id, member_id, status, rank_snapshot, weight_snapshot,
    daily_ratio, monthly_ratio, seq_today, reason, created_by
  ) values (
    v_a.case_id, v_member_id, 'assigned', v_rank, v_weight,
    v_daily, v_monthly, v_seq, btrim(p_reason), auth.uid()
  ) returning * into v_new;

  update public.sq_assignments set replaced_by = v_new.id where id = p_assignment_id;
  update public.sq_cases set status = 'open', updated_at = now() where id = v_a.case_id;

  perform public.sq_audit('assignment.reassign', 'assignment', p_assignment_id, btrim(p_reason),
    jsonb_build_object('case_id', v_a.case_id, 'from_member_id', v_a.member_id,
                       'to_member_id', v_new.member_id, 'manual_target', p_target_member_id is not null));

  return jsonb_build_object(
    'status', 'reassigned', 'assignment_id', v_new.id, 'member_id', v_new.member_id,
    'member_name', (select display_name from public.sq_members where id = v_new.member_id)
  );
end;
$$;

create or replace function public.sq_void_assignment(
  p_assignment_id uuid, p_reason text, p_cancel_case boolean default true
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a public.sq_assignments%rowtype;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select * into v_a from public.sq_assignments where id = p_assignment_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_a.status = 'voided' then return jsonb_build_object('status', 'already_voided'); end if;

  -- คืนสิทธิ์คิวให้คนเดิม (ใช้เฉพาะเคสซ้ำ/ระบบพลาด/ข้อมูลผิดจริง §10.4)
  update public.sq_assignments
    set status = 'voided', voided_at = now(), quota_consumed = false, reason = btrim(p_reason)
    where id = p_assignment_id;

  if coalesce(p_cancel_case, true) then
    update public.sq_cases set status = 'cancelled', updated_at = now() where id = v_a.case_id;
  end if;

  perform public.sq_audit('assignment.void', 'assignment', p_assignment_id, btrim(p_reason),
    jsonb_build_object('case_id', v_a.case_id, 'member_id', v_a.member_id,
                       'case_cancelled', coalesce(p_cancel_case, true)));
  return jsonb_build_object('status', 'voided');
end;
$$;

-- แอดมินแจกคิวให้เคสที่ค้างอยู่ (pending_manual_assignment) ด้วยมือ
create or replace function public.sq_assign_pending(
  p_assignment_id uuid, p_target_member_id uuid default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a public.sq_assignments%rowtype;
  v_seq int;
  v_member_id uuid;
  v_weight int;
  v_rank int;
  v_daily numeric;
  v_monthly numeric;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('sq_queue_allocation'));

  select * into v_a from public.sq_assignments where id = p_assignment_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_a.status <> 'pending_manual_assignment' then raise exception 'invalid_state'; end if;

  if p_target_member_id is not null then
    select coalesce(re.weight, 1), re.rank into v_weight, v_rank
    from public.sq_members m
    left join public.sq_ranking_entries re on re.member_id = m.id
      and re.period_id = (
        select id from public.sq_ranking_periods
        where period_key = public.sq_period_key() and status = 'published' limit 1
      )
    where m.id = p_target_member_id and m.is_active;
    if v_weight is null then raise exception 'target_not_eligible'; end if;
    v_member_id := p_target_member_id;
  else
    select p.member_id, p.weight, p.rank_snapshot, p.daily_ratio, p.monthly_ratio
      into v_member_id, v_weight, v_rank, v_daily, v_monthly
    from public.sq_pick_member() p;
    if v_member_id is null then raise exception 'no_eligible_member'; end if;
  end if;

  select coalesce(max(a.seq_today), 0) + 1 into v_seq
  from public.sq_assignments a where a.assigned_date = public.sq_today();

  update public.sq_assignments set
    member_id = v_member_id,
    status = 'assigned',
    rank_snapshot = v_rank,
    weight_snapshot = v_weight,
    daily_ratio = v_daily,
    monthly_ratio = v_monthly,
    quota_consumed = true,
    assigned_at = now(),
    assigned_date = public.sq_today(),
    period_key = public.sq_period_key(),
    seq_today = v_seq,
    reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_assignment_id;

  update public.sq_cases set status = 'open', updated_at = now() where id = v_a.case_id;

  perform public.sq_audit('assignment.manual_assign', 'assignment', p_assignment_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('case_id', v_a.case_id, 'to_member_id', v_member_id,
                       'manual_target', p_target_member_id is not null));

  return jsonb_build_object('status', 'assigned', 'member_id', v_member_id,
    'member_name', (select display_name from public.sq_members where id = v_member_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. RPC: แก้ข้อมูลเคสหลังยืนยัน (มี audit ทุกครั้ง)
-- ---------------------------------------------------------------------------

create or replace function public.sq_update_case(
  p_case_id uuid, p_patch jsonb, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_before public.sq_cases%rowtype;
  v_changed text[] := '{}';
  v_key text;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_before from public.sq_cases where id = p_case_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  -- อนุญาตเฉพาะฟิลด์ที่ตั้งใจให้แก้ (กัน mass assignment)
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('customer_name','customer_age','phone','line_id','appointment_date',
                     'appointment_time','treatment_main','treatment_detail','doctor','branch',
                     'channel','seller_name','owner_bc_name','discussion_start_date',
                     'closed_date','note') then
      raise exception 'field_not_editable';
    end if;
    v_changed := v_changed || v_key;
  end loop;

  update public.sq_cases c set
    customer_name = coalesce(nullif(btrim(coalesce(p_patch->>'customer_name', '')), ''), c.customer_name),
    customer_age = case when p_patch ? 'customer_age'
      then nullif(p_patch->>'customer_age', '')::int else c.customer_age end,
    phone = case when p_patch ? 'phone'
      then nullif(btrim(coalesce(p_patch->>'phone', '')), '') else c.phone end,
    line_id = case when p_patch ? 'line_id'
      then nullif(btrim(coalesce(p_patch->>'line_id', '')), '') else c.line_id end,
    appointment_date = case when p_patch ? 'appointment_date'
      then nullif(p_patch->>'appointment_date', '')::date else c.appointment_date end,
    appointment_time = case when p_patch ? 'appointment_time'
      then nullif(p_patch->>'appointment_time', '')::time else c.appointment_time end,
    treatment_main = case when p_patch ? 'treatment_main'
      then nullif(btrim(coalesce(p_patch->>'treatment_main', '')), '') else c.treatment_main end,
    treatment_detail = case when p_patch ? 'treatment_detail'
      then nullif(btrim(coalesce(p_patch->>'treatment_detail', '')), '') else c.treatment_detail end,
    doctor = case when p_patch ? 'doctor'
      then nullif(btrim(coalesce(p_patch->>'doctor', '')), '') else c.doctor end,
    branch = case when p_patch ? 'branch'
      then nullif(btrim(coalesce(p_patch->>'branch', '')), '') else c.branch end,
    channel = case when p_patch ? 'channel'
      then nullif(btrim(coalesce(p_patch->>'channel', '')), '') else c.channel end,
    seller_name = case when p_patch ? 'seller_name'
      then nullif(btrim(coalesce(p_patch->>'seller_name', '')), '') else c.seller_name end,
    owner_bc_name = case when p_patch ? 'owner_bc_name'
      then nullif(btrim(coalesce(p_patch->>'owner_bc_name', '')), '') else c.owner_bc_name end,
    discussion_start_date = case when p_patch ? 'discussion_start_date'
      then nullif(p_patch->>'discussion_start_date', '')::date else c.discussion_start_date end,
    closed_date = case when p_patch ? 'closed_date'
      then nullif(p_patch->>'closed_date', '')::date else c.closed_date end,
    note = case when p_patch ? 'note'
      then nullif(btrim(coalesce(p_patch->>'note', '')), '') else c.note end,
    updated_at = now()
  where c.id = p_case_id;

  -- dup_key ต้องตามข้อมูลใหม่เสมอ ไม่งั้นการกันเคสซ้ำจะอ่านของเก่า
  update public.sq_cases c set dup_key =
    public.sq_dup_key(c.phone, c.appointment_date, c.appointment_time, c.treatment_main)
  where c.id = p_case_id;

  -- audit เก็บแค่ "ชื่อฟิลด์ที่แก้" ไม่เก็บค่าเก่า/ใหม่ เพราะเป็นข้อมูลลูกค้า
  perform public.sq_audit('case.update', 'case', p_case_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('case_no', v_before.case_no, 'fields', to_jsonb(v_changed)));

  return jsonb_build_object('status', 'updated', 'fields', to_jsonb(v_changed));
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. RPC: จัดการสมาชิก
-- ---------------------------------------------------------------------------

create or replace function public.sq_add_member(
  p_user_id uuid, p_employee_code text default null, p_role text default 'bc'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing public.sq_members%rowtype;
  v_name text;
  v_id uuid;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_role, 'bc') not in ('bc', 'admin') then raise exception 'invalid_role'; end if;

  select coalesce(nullif(btrim(coalesce(full_name, '')), ''), email, 'ไม่ทราบชื่อ')
    into v_name from public.profiles where id = p_user_id;
  if v_name is null then raise exception 'user_not_found'; end if;

  select * into v_existing from public.sq_members where user_id = p_user_id;
  if found then
    -- เคยอยู่ในทีมแล้ว = คืนสภาพ record เดิม ไม่สร้างใหม่ (รักษาประวัติ Ranking/คิว §6 ข้อ 6)
    update public.sq_members set
      is_active = true, deactivated_at = null, deactivation_reason = null,
      queue_enabled = true, availability = 'available',
      employee_code = coalesce(nullif(btrim(coalesce(p_employee_code, '')), ''), employee_code),
      role = coalesce(p_role, role), display_name = v_name,
      updated_by = auth.uid(), updated_at = now()
    where id = v_existing.id;
    perform public.sq_audit('member.reactivate', 'member', v_existing.id, null,
      jsonb_build_object('user_id', p_user_id));
    return jsonb_build_object('status', 'reactivated', 'member_id', v_existing.id);
  end if;

  insert into public.sq_members (user_id, display_name, employee_code, role, created_by, updated_by)
  values (p_user_id, v_name, nullif(btrim(coalesce(p_employee_code, '')), ''),
          coalesce(p_role, 'bc'), auth.uid(), auth.uid())
  returning id into v_id;

  perform public.sq_audit('member.add', 'member', v_id, null,
    jsonb_build_object('user_id', p_user_id, 'role', coalesce(p_role, 'bc')));
  return jsonb_build_object('status', 'added', 'member_id', v_id);
end;
$$;

create or replace function public.sq_update_member(
  p_member_id uuid,
  p_is_active boolean default null,
  p_queue_enabled boolean default null,
  p_availability text default null,
  p_role text default null,
  p_employee_code text default null,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m public.sq_members%rowtype;
  v_open int;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_m from public.sq_members where id = p_member_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  -- ถอดออกจากทีมหรือปิดสิทธิ์รับคิว ต้องมีเหตุผลเสมอ (ลง audit)
  if (p_is_active is false and v_m.is_active)
     or (p_queue_enabled is false and v_m.queue_enabled) then
    if coalesce(btrim(coalesce(p_reason, '')), '') = '' then raise exception 'reason_required'; end if;
  end if;
  if p_availability is not null and p_availability not in
     ('available', 'busy', 'paused', 'offline') then
    raise exception 'invalid_availability';
  end if;

  update public.sq_members set
    is_active = coalesce(p_is_active, is_active),
    queue_enabled = coalesce(p_queue_enabled, queue_enabled),
    availability = coalesce(p_availability, availability),
    role = coalesce(p_role, role),
    employee_code = case when p_employee_code is null then employee_code
                    else nullif(btrim(p_employee_code), '') end,
    deactivated_at = case when p_is_active is false then now()
                     when p_is_active is true then null else deactivated_at end,
    deactivation_reason = case when p_is_active is false then btrim(coalesce(p_reason, ''))
                          when p_is_active is true then null else deactivation_reason end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_member_id;

  -- ถอดกลางวัน: เคสที่ยังไม่รับทราบต้องให้แอดมินตัดสินใจ ไม่เงียบหาย (§6 ข้อ 5)
  select count(*) into v_open from public.sq_assignments
  where member_id = p_member_id and status in ('assigned', 'acknowledged');

  perform public.sq_audit(
    case when p_is_active is false then 'member.deactivate'
         when p_is_active is true then 'member.reactivate'
         else 'member.update' end,
    'member', p_member_id, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('is_active', coalesce(p_is_active, v_m.is_active),
                       'queue_enabled', coalesce(p_queue_enabled, v_m.queue_enabled),
                       'availability', coalesce(p_availability, v_m.availability),
                       'open_assignments', v_open));

  return jsonb_build_object('status', 'updated', 'open_assignments', v_open);
end;
$$;

-- BC เปลี่ยนสถานะพร้อมรับคิวของตัวเอง (ได้แค่ available/busy)
create or replace function public.sq_set_my_availability(p_availability text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_availability not in ('available', 'busy') then raise exception 'invalid_availability'; end if;
  v_id := public.sq_my_member_id();
  if v_id is null then raise exception 'forbidden' using errcode = '42501'; end if;

  update public.sq_members
    set availability = p_availability, updated_by = auth.uid(), updated_at = now()
    where id = v_id;
  perform public.sq_audit('member.availability', 'member', v_id, null,
    jsonb_build_object('availability', p_availability));
  return jsonb_build_object('status', 'updated', 'availability', p_availability);
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. RPC: ประกาศ Ranking ประจำเดือน (สร้างเวอร์ชันใหม่เสมอ ไม่แก้ทับ)
-- ---------------------------------------------------------------------------

create or replace function public.sq_publish_ranking(
  p_period_key text, p_entries jsonb, p_source_note text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version int;
  v_period_id uuid;
  v_count int;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_period_key !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'invalid_period'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'entries_required';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.sq_ranking_periods where period_key = p_period_key;

  -- ฉบับเดิมกลายเป็น superseded — ประวัติยังอยู่ครบ ดูย้อนหลังได้
  update public.sq_ranking_periods
    set status = 'superseded' where period_key = p_period_key and status = 'published';

  insert into public.sq_ranking_periods
    (period_key, version, status, source_note, published_by, published_at, created_by)
  values (p_period_key, v_version, 'published', nullif(btrim(coalesce(p_source_note, '')), ''),
          auth.uid(), now(), auth.uid())
  returning id into v_period_id;

  insert into public.sq_ranking_entries (
    period_id, member_id, rank, weight, drag_paid_bills, drag_net_sales,
    cancel_count, source_name, source_row
  )
  select
    v_period_id,
    (e->>'member_id')::uuid,
    (e->>'rank')::int,
    public.sq_weight_for_rank((e->>'rank')::int),
    coalesce((e->>'drag_paid_bills')::int, 0),
    coalesce((e->>'drag_net_sales')::numeric, 0),
    nullif(e->>'cancel_count', '')::int,
    nullif(btrim(coalesce(e->>'source_name', '')), ''),
    nullif(e->>'source_row', '')::int
  from jsonb_array_elements(p_entries) e;

  get diagnostics v_count = row_count;

  perform public.sq_audit('ranking.publish', 'ranking_period', v_period_id, null,
    jsonb_build_object('period_key', p_period_key, 'version', v_version, 'entries', v_count));

  return jsonb_build_object('status', 'published', 'period_id', v_period_id,
    'version', v_version, 'entries', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. RPC: บันทึกผลส่ง Google Chat (เรียกจาก API route ฝั่ง server)
-- ---------------------------------------------------------------------------

create or replace function public.sq_mark_delivery(
  p_case_id uuid, p_status text, p_external_message_id text default null,
  p_error text default null, p_destination text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending', 'sent', 'failed', 'not_configured', 'skipped') then
    raise exception 'invalid_status';
  end if;

  update public.sq_deliveries set
    status = p_status,
    external_message_id = coalesce(p_external_message_id, external_message_id),
    destination = coalesce(p_destination, destination),
    -- ตัด error ให้สั้นและไม่พาข้อความลูกค้าติดไปด้วย
    last_error = case when p_status = 'sent' then null else left(coalesce(p_error, ''), 300) end,
    attempt_count = attempt_count + 1,
    last_attempt_at = now(),
    sent_at = case when p_status = 'sent' then now() else sent_at end
  where case_id = p_case_id;

  -- ส่งถึงปลายทางแล้ว = ไม่ต้องเก็บข้อความดิบที่มี PII ไว้อีก (retention สั้นที่สุด §11)
  if p_status = 'sent' then
    delete from public.sq_case_raw where case_id = p_case_id;
  end if;

  perform public.sq_audit('delivery.' || p_status, 'case', p_case_id, null,
    jsonb_build_object('has_external_id', p_external_message_id is not null));
  return jsonb_build_object('status', p_status);
end;
$$;

-- ไล่ลบข้อความดิบที่ค้างเกินกำหนด (เผื่อกรณีส่งไม่สำเร็จแล้วไม่มีใครกด retry)
create or replace function public.sq_purge_raw(p_older_than interval default interval '7 days')
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.sq_case_raw where created_at < now() - p_older_than;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. RLS
-- ---------------------------------------------------------------------------

alter table public.sq_members enable row level security;
alter table public.sq_ranking_periods enable row level security;
alter table public.sq_ranking_entries enable row level security;
alter table public.sq_cases enable row level security;
alter table public.sq_case_raw enable row level security;
alter table public.sq_assignments enable row level security;
alter table public.sq_deliveries enable row level security;
alter table public.sq_audit_log enable row level security;
alter table public.sq_settings enable row level security;

-- ทุกตารางเป็นข้อมูลภายใน — ผู้ใช้ที่ไม่ได้ล็อกอินต้องไม่แตะได้เลย
revoke all on public.sq_members, public.sq_ranking_periods, public.sq_ranking_entries,
  public.sq_cases, public.sq_case_raw, public.sq_assignments, public.sq_deliveries,
  public.sq_audit_log, public.sq_settings from anon;

drop policy if exists sq_members_select on public.sq_members;
drop policy if exists sq_ranking_periods_select on public.sq_ranking_periods;
drop policy if exists sq_ranking_entries_select on public.sq_ranking_entries;
drop policy if exists sq_cases_select on public.sq_cases;
drop policy if exists sq_case_raw_select on public.sq_case_raw;
drop policy if exists sq_assignments_select on public.sq_assignments;
drop policy if exists sq_deliveries_select on public.sq_deliveries;
drop policy if exists sq_audit_log_select on public.sq_audit_log;
drop policy if exists sq_settings_select on public.sq_settings;

-- สมาชิกทีม: ทุกคนในระบบคิวเห็นรายชื่อทีม (ไม่มี PII ลูกค้า) แก้ได้เฉพาะผ่าน RPC
create policy sq_members_select on public.sq_members
  for select to authenticated using (public.sq_is_member());

-- Ranking: ทุกคนดูได้ (BC ต้องเห็นอันดับ/weight ตัวเอง) เขียนผ่าน RPC เท่านั้น
create policy sq_ranking_periods_select on public.sq_ranking_periods
  for select to authenticated using (public.sq_is_member());
create policy sq_ranking_entries_select on public.sq_ranking_entries
  for select to authenticated using (public.sq_is_member());

-- เคส: แอดมินเห็นทั้งหมด, BC เห็นเฉพาะเคสที่เคยถูกมอบหมายให้ตัวเอง
create policy sq_cases_select on public.sq_cases
  for select to authenticated using (
    public.sq_is_admin() or exists (
      select 1 from public.sq_assignments a
      where a.case_id = sq_cases.id and a.member_id = public.sq_my_member_id()
    )
  );

-- ข้อความดิบ (มีเลขบัตร/ข้อมูลสุขภาพ): แอดมินเท่านั้น
create policy sq_case_raw_select on public.sq_case_raw
  for select to authenticated using (public.sq_is_admin());

-- คิว: แอดมินเห็นทั้งหมด, BC เห็นของตัวเอง
create policy sq_assignments_select on public.sq_assignments
  for select to authenticated using (
    public.sq_is_admin() or member_id = public.sq_my_member_id()
  );

create policy sq_deliveries_select on public.sq_deliveries
  for select to authenticated using (public.sq_is_admin());
create policy sq_audit_log_select on public.sq_audit_log
  for select to authenticated using (public.sq_is_admin());
create policy sq_settings_select on public.sq_settings
  for select to authenticated using (public.sq_is_member());

-- ---------------------------------------------------------------------------
-- 19. สิทธิ์เรียกฟังก์ชัน
-- ---------------------------------------------------------------------------

revoke all on function public.sq_pick_member(uuid[]) from public;
revoke all on function public.sq_audit(text, text, uuid, text, jsonb) from public;

grant execute on function
  public.sq_today(), public.sq_period_key(date), public.sq_weight_for_rank(int),
  public.sq_is_member(), public.sq_is_admin(), public.sq_my_member_id(),
  public.sq_normalize_phone(text), public.sq_dup_key(text, date, time, text),
  public.sq_create_case(jsonb, text, text, text, boolean, text),
  public.sq_acknowledge(uuid),
  public.sq_reassign(uuid, text, uuid),
  public.sq_void_assignment(uuid, text, boolean),
  public.sq_assign_pending(uuid, uuid, text),
  public.sq_update_case(uuid, jsonb, text),
  public.sq_add_member(uuid, text, text),
  public.sq_update_member(uuid, boolean, boolean, text, text, text, text),
  public.sq_set_my_availability(text),
  public.sq_publish_ranking(text, jsonb, text),
  public.sq_mark_delivery(uuid, text, text, text, text),
  public.sq_purge_raw(interval)
to authenticated;

-- ---------------------------------------------------------------------------
-- 20. Realtime — BC เห็นคิวใหม่เด้งขึ้นเองโดยไม่ต้องรีเฟรช
--     (RLS ยังบังคับอยู่: ได้รับ event เฉพาะแถวที่ตัวเองมีสิทธิ์เห็น)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sq_assignments'
  ) then
    alter publication supabase_realtime add table public.sq_assignments;
  end if;
end $$;
