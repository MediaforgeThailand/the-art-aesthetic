-- ============================================================
-- 0095 — ผู้รับผิดชอบเคสหลายคน (แยกตามขั้นงาน) + ระบบแจ้งเตือนของระบบ Influencer
--
-- ที่มา (ผู้ใช้ 2026-08-29):
--   "ในแต่ละ Card ตอนนี้ยังไม่มีการเพิ่มผู้รับผิดชอบ ... ตอนนี้ card จะแสดงผู้สร้าง
--    ให้เก็บเป็นข้อมูลไว้ ส่วนอันที่แสดงให้แสดงเป็นผู้รับผิดชอบแทน โดยสามารถมีได้มากกว่า 1 คน"
--   "การเปลี่ยน stage A > B ต้องแจ้งเตือนไปหาผู้รับผิดชอบในส่วนนั้นๆ ทุกคน (ยกเว้นผู้อัพเดทเอง)
--    ... เลือกได้ว่า stage 1, 2, 3 ใครรับผิดชอบอันไหน เพื่อให้การแจ้งเตือนนั้นเด่น"
--
-- แนวคิด:
--   * `influencers.owner_id` = **ผู้สร้างการ์ด** ยังอยู่เหมือนเดิม ไม่ถูกแทนที่ (เก็บเป็นข้อมูล)
--     สิ่งที่เปลี่ยนคือ "คนที่การ์ดแสดง" ย้ายไปอ่านจากตารางใหม่นี้แทน
--   * 1 เคส มีผู้รับผิดชอบได้หลายคน แต่ละคนถือ "ขอบเขตงาน" (scopes) ของตัวเอง
--       memo      = ขั้น 1 Memo ขออนุมัติ
--       contract  = ขั้น 2 เซนสัญญา + วันรับบริการ
--       followup  = การตามงานที่หน้า Follow Up (ไม่ใช่ stage ใน pipeline แต่เป็นงานก้อนใหญ่
--                   ที่ต้องมีเจ้าภาพ — ผู้ใช้ระบุตรงๆ ว่า "Follow Up นั้นมีหลายอย่างมาก")
--     scopes ว่าง = ผู้เกี่ยวข้อง/หัวหน้างาน — เห็นความเคลื่อนไหวทุกอย่างแต่เป็นแจ้งเตือน
--     ระดับ "อัพเดท" (ไม่เด่น) ไม่ใช่ "ต้องลงมือ"
--
-- `influ_notifications` แยกจากตาราง `notifications` ของระบบ Task โดยตั้งใจ —
-- คนละแอป คนละกระดิ่ง คนละปลายทาง (task ผูก task_id ตายตัว, ที่นี่เก็บ href อิสระ
-- เพราะเหตุการณ์เกิดได้ทั้งหน้าเคส/ปฏิทิน/Follow Up/Hunting)
-- ============================================================

/* ---------- ผู้รับผิดชอบเคส ---------- */

create table if not exists public.influ_assignees (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- ขอบเขตงานที่คนนี้ถือ — ว่าง = ผู้เกี่ยวข้อง/หัวหน้างาน (ได้แจ้งเตือนแบบเงียบ)
  scopes text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (influencer_id, user_id),
  constraint influ_assignees_scopes_valid
    check (scopes <@ array['memo', 'contract', 'followup']::text[])
);

create index if not exists influ_assignees_influencer_idx
  on public.influ_assignees (influencer_id);
create index if not exists influ_assignees_user_idx
  on public.influ_assignees (user_id);

alter table public.influ_assignees enable row level security;

drop policy if exists "authenticated full access influ_assignees" on public.influ_assignees;
create policy "authenticated full access influ_assignees"
  on public.influ_assignees for all
  to authenticated using (true) with check (true);

-- เคสเดิมทุกใบ: ผู้สร้างการ์ด (owner_id) = ผู้รับผิดชอบเต็มขอบเขต
-- ไม่งั้นเปิดฟีเจอร์มาแล้วทุกการ์ดไม่มีใครรับผิดชอบเลย และไม่มีใครได้แจ้งเตือน
insert into public.influ_assignees (influencer_id, user_id, scopes, created_by)
select i.id, i.owner_id, array['memo', 'contract', 'followup']::text[], i.owner_id
  from public.influencers i
 where i.owner_id is not null
on conflict (influencer_id, user_id) do nothing;

/* ---------- การแจ้งเตือนของระบบ Influencer ---------- */

create table if not exists public.influ_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  -- ชื่อ ณ ตอนที่ทำ — บัญชีถูกลบแล้วแจ้งเตือนเก่าต้องยังบอกได้ว่าใครทำ (แพทเทิร์นเดียวกับ log)
  actor_name text,
  -- เคสที่ถูกลบ (ถังขยะ) ต้องไม่ลบแจ้งเตือนทิ้ง — ผู้รับต้องเห็นว่า "เคสนี้ถูกลบ"
  influencer_id uuid references public.influencers(id) on delete set null,
  influencer_name text,
  -- ชนิดเหตุการณ์ — เป็น text อิสระตามแพทเทิร์น influ_activity_log.action
  -- (เพิ่มชนิดใหม่ไม่ต้อง migrate; ป้าย/ไอคอนอยู่ที่ INFLU_NOTI_TYPES ใน influ-notify.ts)
  type text not null,
  -- ระดับความสำคัญ: action = งานในขอบเขตของฉัน ต้องลงมือ (เด่น มี badge)
  --                 update = ความเคลื่อนไหวที่เกี่ยวข้อง (เงียบ ไม่นับใน badge)
  level text not null default 'update'
    check (level in ('action', 'update')),
  title text not null,
  body text,
  -- ปลายทางตอนกด เช่น /influencers/<id>?view=2 (null = เคสถูกลบไปแล้ว ไม่มีที่ให้ไป)
  href text,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists influ_notifications_recipient_idx
  on public.influ_notifications (recipient_id, created_at desc);
-- นับ badge "ยังไม่อ่าน" เฉพาะระดับ action — index บางเพื่อให้ count เร็ว
create index if not exists influ_notifications_unread_idx
  on public.influ_notifications (recipient_id, level)
  where read_at is null;

alter table public.influ_notifications enable row level security;

drop policy if exists "authenticated full access influ_notifications" on public.influ_notifications;
create policy "authenticated full access influ_notifications"
  on public.influ_notifications for all
  to authenticated using (true) with check (true);

-- Realtime: กระดิ่งของระบบ Influencer อัพเดทสด (แพทเทิร์นเดียวกับ 0032)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'influ_notifications'
  ) then
    alter publication supabase_realtime add table public.influ_notifications;
  end if;
end $$;

/* ---------- ถังขยะต้องเก็บ/คืนผู้รับผิดชอบด้วย ----------
   `influ_assignees` cascade ตามเคสที่ถูกลบ — ไม่ใส่ใน payload = กู้คืนมาแล้วการ์ดไม่มี
   ผู้รับผิดชอบเลย (บทเรียนเดียวกับ 0083: ทุกครั้งที่เพิ่มตารางลูก ต้องแก้ 2 ฟังก์ชันนี้พร้อมกัน) */

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

  if v_actor is not null then
    if not private.influ_can_edit(v_actor) then
      raise exception 'บัญชีนี้ไม่มีสิทธิ์ลบข้อมูล Influencer';
    end if;
    if not private.influ_can_manage(v_actor)
       and (v_row.owner_id is null or v_row.owner_id <> v_actor) then
      raise exception 'ลบได้เฉพาะเคสที่ตัวเองรับผิดชอบ — เคสของคนอื่นให้ผู้ดูแลระบบเป็นคนลบ';
    end if;
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
      'calendar_events', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_calendar_events t where t.influencer_id = p_id), '[]'::jsonb),
      'assignees', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_assignees t where t.influencer_id = p_id), '[]'::jsonb)
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
  v_influ jsonb;
  v_id uuid;
begin
  select * into v_b from public.influ_deleted_backups where id = p_backup_id;
  if not found then
    raise exception 'ไม่พบข้อมูลสำรองชุดนี้ (อาจเลย 30 วันแล้ว)';
  end if;
  if v_b.restored_at is not null then
    raise exception 'ข้อมูลชุดนี้ถูกกู้คืนไปแล้ว';
  end if;
  if v_actor is not null and not private.influ_can_manage(v_actor) then
    raise exception 'กู้คืนข้อมูลได้เฉพาะผู้ดูแลระบบ Influencer';
  end if;

  v_influ := v_b.payload -> 'influencer';
  v_id := (v_influ ->> 'id')::uuid;
  if exists (select 1 from public.influencers where id = v_id) then
    raise exception 'มีเคสรหัสเดิมอยู่ในระบบแล้ว — กู้คืนซ้ำไม่ได้';
  end if;

  insert into public.influencers
  select * from jsonb_populate_record(null::public.influencers, v_influ);

  insert into public.influ_followups
  select * from jsonb_populate_recordset(null::public.influ_followups, v_b.payload -> 'followups');
  insert into public.influ_signatures
  select * from jsonb_populate_recordset(null::public.influ_signatures, v_b.payload -> 'signatures');
  insert into public.influ_tasks
  select * from jsonb_populate_recordset(null::public.influ_tasks, v_b.payload -> 'tasks');
  insert into public.influ_campaigns
  select * from jsonb_populate_recordset(null::public.influ_campaigns, v_b.payload -> 'campaigns');
  insert into public.influ_procedure_items
  select * from jsonb_populate_recordset(null::public.influ_procedure_items, v_b.payload -> 'procedure_items');
  insert into public.influ_links
  select * from jsonb_populate_recordset(null::public.influ_links, v_b.payload -> 'links');
  insert into public.influ_post_links
  select * from jsonb_populate_recordset(null::public.influ_post_links, v_b.payload -> 'post_links');
  insert into public.influ_calendar_events
  select * from jsonb_populate_recordset(null::public.influ_calendar_events, v_b.payload -> 'calendar_events');
  -- backup ชุดเก่า (ก่อน 0095) ไม่มีคีย์นี้ — coalesce เป็น [] ไม่งั้นกู้คืนของเก่าพัง
  insert into public.influ_assignees
  select * from jsonb_populate_recordset(
    null::public.influ_assignees,
    coalesce(v_b.payload -> 'assignees', '[]'::jsonb)
  )
  -- โปรไฟล์ที่ถูกลบไประหว่างอยู่ในถังขยะ = ข้ามคนนั้นไป ไม่ให้การกู้คืนทั้งเคสพัง
  where user_id in (select id from public.profiles);

  select full_name into v_actor_name from public.profiles where id = v_actor;

  update public.influ_deleted_backups
     set restored_at = now(), restored_by = v_actor
   where id = p_backup_id;

  insert into public.influ_activity_log
    (actor_id, actor_name, action, entity, entity_id, influencer_id, influencer_name, summary, meta)
  values (
    v_actor, v_actor_name, 'restore', 'influencer', v_id, v_id, v_b.label,
    'กู้คืนเคส ' || v_b.label || ' จากถังขยะ',
    jsonb_build_object('backup_id', p_backup_id)
  );

  return v_id;
end;
$$;
