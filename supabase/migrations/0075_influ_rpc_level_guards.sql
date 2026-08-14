-- ============================================================
-- 0075 — บังคับ "ระดับสิทธิ์ Influencer" ที่ฝั่ง DB ด้วย ไม่ใช่แค่ปุ่มบนจอ
--
-- 0074 เช็คแค่ "แก้ข้อมูล Influ ได้ไหม" (hunter หรือ manager) ทำให้ตามตัวหนังสือแล้ว
-- Hunter ยิง RPC ตรงๆ ลบเคสของคนอื่นได้ ทั้งที่ UI ให้ลบได้เฉพาะเคสของตัวเอง
-- และถังขยะ/กู้คืนเป็นงานของผู้ดูแลระบบ Influ เท่านั้น
--
-- ปรับให้ตรงกับกติกาในหน้าเว็บ (permissions.ts):
--   canDeleteInflu : manager = ทุกเคส · hunter = เฉพาะ owner_id ของตัวเอง
--   กู้คืน/ล้างถังขยะ : manager เท่านั้น
-- (auth.uid() = null คือเรียกจาก SQL editor/service role — ยังปล่อยผ่านเหมือนเดิม
--  เพราะเป็นงานดูแลระบบที่ไม่ได้ผ่านแอป)
-- ============================================================

-- ผู้ดูแลระบบ Influ = permission 'influ' (role admin ของระบบบัญชีไม่เหมาให้อัตโนมัติ
-- ตามกติกาสิทธิ์ของระบบนี้ — แต่ยังปล่อยผ่านเพราะเป็นคนที่กำหนดสิทธิ์เองได้อยู่แล้ว)
create or replace function private.influ_can_manage(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_uid
       and (p.role = 'admin' or p.permissions && array['influ']::text[])
  );
$$;

revoke all on function private.influ_can_manage(uuid) from public, anon, authenticated;

-- ลบเคส: hunter ลบได้เฉพาะเคสที่ตัวเองรับผิดชอบ
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
    -- ไม่ใช่ผู้ดูแล = ลบได้เฉพาะเคสของตัวเอง (เคสเก่าที่ owner_id ว่าง = ผู้ดูแลเท่านั้น)
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

-- กู้คืน: ผู้ดูแลระบบ Influ เท่านั้น (หน้าถังขยะก็เปิดให้เฉพาะผู้ดูแลอยู่แล้ว)
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

-- ล้างของหมดอายุ: ผู้ดูแลระบบ Influ เท่านั้น (หน้าถังขยะเรียกตอนเปิด — คนอื่นได้ 0 เงียบๆ
-- ไม่โยน error เพราะเป็นการเก็บกวาดเบื้องหลัง ไม่ใช่การกระทำที่ผู้ใช้ตั้งใจกด)
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
  if v_actor is not null and not private.influ_can_manage(v_actor) then
    return 0;
  end if;

  -- ลบทุกชุดที่เลย 30 วัน รวมชุดที่กู้คืนไปแล้ว (เก็บต่อไปก็ไม่มีใครใช้ — กันตารางบวม)
  with gone as (
    delete from public.influ_deleted_backups
     where purge_after < now()
    returning 1
  )
  select count(*) into v_count from gone;

  return coalesce(v_count, 0);
end;
$$;
