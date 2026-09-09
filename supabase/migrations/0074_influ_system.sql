-- ============================================================
-- 0074 — Influencer System: รหัส Influ ID · ผู้รับผิดชอบ · log · ถังขยะ 30 วัน
--
-- ทีมอื่นเข้ามาใช้ระบบ Influ ด้วย (หลายคน หลายหัตถการ) จึงต้องแยกของใครของมัน
-- และเก็บร่องรอยไว้ทุกการกระทำ:
--   1) influencers.influ_code = รหัส Influ ID ที่ทีมกรอกเอง (ห้ามซ้ำแบบไม่สนตัวพิมพ์)
--   2) influencers.owner_id   = ผู้รับผิดชอบเคส = คนที่สร้างการ์ด (backfill จาก created_by)
--   3) influ_activity_log     = log ทุกการกระทำ — insert ได้อย่างเดียว
--      (ไม่มี policy update/delete = ลบ/แก้ log จาก client ไม่ได้เลย)
--   4) influ_deleted_backups  = สำเนาเคสที่ถูกลบ เก็บ 30 วัน + ฟังก์ชัน ลบ/กู้คืน/ล้างของหมดอายุ
--
-- สิทธิ์ระดับย่อย (influ_view = ดูเฉยๆ / influ_hunter = สร้าง-แก้เคสได้ / influ = ผู้ดูแลระบบ Influ)
-- เก็บใน profiles.permissions[] เดิม — เป็น text[] อิสระ ไม่ต้องแก้ schema
-- (ต้องอัปเดต VALID_PERMISSIONS ใน edge function admin-users แล้ว redeploy ด้วย)
--
-- self-host: SQL มาตรฐาน + auth.uid() ของ Supabase เท่านั้น ไม่ต้องตั้งค่าเพิ่ม
-- ============================================================

/* ---------- 1) รหัส Influ ID + ผู้รับผิดชอบ ---------- */

alter table public.influencers
  add column if not exists influ_code text,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

comment on column public.influencers.influ_code is
  'รหัส Influ ID ที่ทีมกำหนดเอง (ห้ามซ้ำ — เทียบแบบไม่สนตัวพิมพ์ใหญ่เล็ก)';
comment on column public.influencers.owner_id is
  'ผู้รับผิดชอบเคส = คนที่สร้างการ์ด (ว่าง = บัญชีถูกลบไปแล้ว)';

-- เคสเดิมทั้งหมด: ผู้รับผิดชอบ = ผู้สร้าง (ข้อมูลนำเข้าเก่าที่ created_by ว่าง ก็ปล่อยว่างไว้)
update public.influencers
   set owner_id = created_by
 where owner_id is null
   and created_by is not null;

-- กันกรอกรหัสซ้ำ (คนละคนแต่รหัสเดียวกัน = human error ที่ตามแก้ยากภายหลัง)
create unique index if not exists influencers_influ_code_key
  on public.influencers (lower(influ_code))
  where influ_code is not null;

create index if not exists influencers_owner_idx on public.influencers (owner_id);

/* ---------- 2) Log ทุกการกระทำในระบบ Influ ---------- */

create table if not exists public.influ_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  -- เก็บชื่อไว้ด้วย เพราะบัญชีถูกลบแล้ว log ต้องยังบอกได้ว่าใครทำ
  actor_name text,
  -- create | update | delete | restore | stage | upload | permission | ...
  action text not null,
  -- influencer | procedure_item | calendar_event | doctor | link | ...
  entity text not null default 'influencer',
  entity_id uuid,
  -- ไม่ผูก FK: เคสถูกลบไปแล้ว log ของเคสนั้นต้องยังอยู่ครบ
  influencer_id uuid,
  influencer_name text,
  summary text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists influ_activity_log_created_idx
  on public.influ_activity_log (created_at desc);
create index if not exists influ_activity_log_influ_idx
  on public.influ_activity_log (influencer_id);
create index if not exists influ_activity_log_actor_idx
  on public.influ_activity_log (actor_id);

alter table public.influ_activity_log enable row level security;

-- อ่านได้ทุกคนที่ล็อกอิน (UI จำกัดหน้า log ให้เฉพาะผู้ดูแลระบบ Influ)
-- เขียนได้อย่างเดียว — ไม่มี policy update/delete จึงลบ/แก้ประวัติจาก client ไม่ได้
drop policy if exists "authenticated read influ_activity_log" on public.influ_activity_log;
create policy "authenticated read influ_activity_log"
  on public.influ_activity_log for select to authenticated using (true);
drop policy if exists "authenticated insert influ_activity_log" on public.influ_activity_log;
create policy "authenticated insert influ_activity_log"
  on public.influ_activity_log for insert to authenticated with check (true);

/* ---------- 3) ถังขยะ: สำรองข้อมูลที่ถูกลบไว้ 30 วัน ---------- */

create table if not exists public.influ_deleted_backups (
  id uuid primary key default gen_random_uuid(),
  entity text not null default 'influencer',
  entity_id uuid not null,
  label text not null,
  -- ทั้งเคส + ลูกทุกตาราง (followups/signatures/tasks/campaigns/procedure_items/links/post_links/calendar)
  payload jsonb not null,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_name text,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz,
  restored_by uuid references public.profiles(id) on delete set null
);

create index if not exists influ_deleted_backups_purge_idx
  on public.influ_deleted_backups (purge_after);

alter table public.influ_deleted_backups enable row level security;

drop policy if exists "authenticated full access influ_deleted_backups" on public.influ_deleted_backups;
create policy "authenticated full access influ_deleted_backups"
  on public.influ_deleted_backups for all to authenticated using (true) with check (true);

/* ---------- 4) ฟังก์ชัน ลบ / กู้คืน / ล้างของหมดอายุ ---------- */

-- helper เช็คสิทธิ์แก้ไขข้อมูล Influ — อยู่ใน schema private เพื่อไม่ให้ PostgREST
-- เปิดเป็น RPC สาธารณะ (แนวเดียวกับ 0061)
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.influ_can_edit(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_uid
       and (p.role = 'admin' or p.permissions && array['influ', 'influ_hunter']::text[])
  );
$$;

-- ลบเคส = สำรองลง influ_deleted_backups ก่อนเสมอ แล้วค่อยลบจริง (ลูกทุกตาราง cascade ตามอยู่แล้ว)
-- คืนค่า id ของสำเนาที่เก็บไว้ ให้ฝั่ง client เอาไปโชว์/กู้คืนได้
create or replace function public.influ_delete_with_backup(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.influencers%rowtype;
  v_label text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_backup_id uuid;
begin
  select * into v_row from public.influencers where id = p_id;
  if not found then
    raise exception 'ไม่พบเคสที่ต้องการลบ (อาจถูกลบไปแล้ว)';
  end if;

  -- auth.uid() เป็น null เมื่อเรียกจาก SQL editor/service role — ปล่อยผ่าน (งานดูแลระบบ)
  if v_actor is not null and not private.influ_can_edit(v_actor) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์ลบข้อมูล Influencer';
  end if;

  select full_name into v_actor_name from public.profiles where id = v_actor;
  v_label := nullif(
    btrim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')),
    ''
  );
  v_label := coalesce(v_label, 'ไม่ระบุชื่อ');

  insert into public.influ_deleted_backups
    (entity, entity_id, label, payload, deleted_by, deleted_by_name)
  values (
    'influencer',
    p_id,
    v_label,
    jsonb_build_object(
      'influencer', to_jsonb(v_row),
      'followups', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_followups t where t.influencer_id = p_id), '[]'::jsonb),
      'signatures', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_signatures t where t.influencer_id = p_id), '[]'::jsonb),
      'tasks', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_tasks t where t.influencer_id = p_id), '[]'::jsonb),
      'campaigns', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_campaigns t where t.influencer_id = p_id), '[]'::jsonb),
      'procedure_items', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_procedure_items t where t.influencer_id = p_id), '[]'::jsonb),
      'links', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_links t where t.influencer_id = p_id), '[]'::jsonb),
      'post_links', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_post_links t where t.influencer_id = p_id), '[]'::jsonb),
      'calendar_events', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_calendar_events t where t.influencer_id = p_id), '[]'::jsonb)
    ),
    v_actor,
    v_actor_name
  )
  returning id into v_backup_id;

  delete from public.influencers where id = p_id;

  insert into public.influ_activity_log
    (actor_id, actor_name, action, entity, entity_id, influencer_id, influencer_name, summary, meta)
  values (
    v_actor, v_actor_name, 'delete', 'influencer', p_id, p_id, v_label,
    'ลบเคส ' || v_label || ' (สำรองไว้ 30 วัน)',
    jsonb_build_object('backup_id', v_backup_id)
  );

  return v_backup_id;
end;
$$;

-- กู้คืนเคสจากสำเนา — คืน id ของเคสที่กลับมา
create or replace function public.influ_restore_backup(p_backup_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_b public.influ_deleted_backups%rowtype;
  v_actor uuid := auth.uid();
  v_actor_name text;
begin
  select * into v_b from public.influ_deleted_backups where id = p_backup_id;
  if not found then
    raise exception 'ไม่พบข้อมูลสำรองชุดนี้ (อาจเลย 30 วันแล้ว)';
  end if;
  if v_b.restored_at is not null then
    raise exception 'ข้อมูลชุดนี้ถูกกู้คืนไปแล้ว';
  end if;
  if v_actor is not null and not private.influ_can_edit(v_actor) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์กู้คืนข้อมูล Influencer';
  end if;
  if exists (select 1 from public.influencers where id = v_b.entity_id) then
    raise exception 'มีเคสรหัสเดิมอยู่ในระบบแล้ว — กู้คืนซ้ำไม่ได้';
  end if;

  select full_name into v_actor_name from public.profiles where id = v_actor;

  insert into public.influencers
    select * from jsonb_populate_record(null::public.influencers, v_b.payload->'influencer');
  insert into public.influ_followups
    select * from jsonb_populate_recordset(null::public.influ_followups, coalesce(v_b.payload->'followups', '[]'::jsonb));
  insert into public.influ_signatures
    select * from jsonb_populate_recordset(null::public.influ_signatures, coalesce(v_b.payload->'signatures', '[]'::jsonb));
  insert into public.influ_tasks
    select * from jsonb_populate_recordset(null::public.influ_tasks, coalesce(v_b.payload->'tasks', '[]'::jsonb));
  insert into public.influ_campaigns
    select * from jsonb_populate_recordset(null::public.influ_campaigns, coalesce(v_b.payload->'campaigns', '[]'::jsonb));
  insert into public.influ_procedure_items
    select * from jsonb_populate_recordset(null::public.influ_procedure_items, coalesce(v_b.payload->'procedure_items', '[]'::jsonb));
  insert into public.influ_links
    select * from jsonb_populate_recordset(null::public.influ_links, coalesce(v_b.payload->'links', '[]'::jsonb));
  insert into public.influ_post_links
    select * from jsonb_populate_recordset(null::public.influ_post_links, coalesce(v_b.payload->'post_links', '[]'::jsonb));
  insert into public.influ_calendar_events
    select * from jsonb_populate_recordset(null::public.influ_calendar_events, coalesce(v_b.payload->'calendar_events', '[]'::jsonb));

  update public.influ_deleted_backups
     set restored_at = now(), restored_by = v_actor
   where id = p_backup_id;

  insert into public.influ_activity_log
    (actor_id, actor_name, action, entity, entity_id, influencer_id, influencer_name, summary, meta)
  values (
    v_actor, v_actor_name, 'restore', 'influencer', v_b.entity_id, v_b.entity_id, v_b.label,
    'กู้คืนเคส ' || v_b.label || ' จากถังขยะ',
    jsonb_build_object('backup_id', p_backup_id)
  );

  return v_b.entity_id;
end;
$$;

-- ล้างสำเนาที่เกิน 30 วัน (เรียกตอนเปิดหน้าถังขยะ — แนวเดียวกับถังขยะของ /tasks)
create or replace function public.influ_purge_expired_backups()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is not null and not private.influ_can_edit(v_actor) then
    return 0;
  end if;
  with gone as (
    delete from public.influ_deleted_backups
     where purge_after < now()
    returning 1
  )
  select count(*) into v_count from gone;
  return coalesce(v_count, 0);
end;
$$;
