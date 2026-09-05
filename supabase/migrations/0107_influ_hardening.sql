-- ============================================================
-- 0107 — เก็บงานความปลอดภัย/ความถูกต้องของระบบ Influencer (audit 2026-09-03)
--
-- หมายเหตุเลขไฟล์: ไฟล์นี้ถูก apply จริง **ก่อน** 0106 (voucher credit) ที่อีก session
-- ทำขนานกันในวันเดียวกัน — แต่ของเขาขึ้น main ไปก่อนในเลข 0106 เลยเลื่อนชุดนี้เป็น 0107+
-- ทั้งสองก้อนแตะคนละเรื่อง (ของเขา = คอลัมน์ voucher, ของนี้ = สิทธิ์ RPC/ถังขยะ/RLS)
-- ลำดับ replay จึงสลับกันได้ไม่มีผล
--
-- 4 เรื่องในก้อนเดียว:
--   1) RPC ของระบบ Influ เปิดให้ `anon` เรียกได้มาตลอด (ไม่เคย revoke จาก public)
--      + guard เดิมปล่อยผ่านเมื่อ auth.uid() เป็น null ⇒ ใครมี anon key (ซึ่งเห็นได้จาก
--      หน้า /price-list ที่เป็นหน้าสาธารณะ) ก็ลบ/กู้/ล้างถังขยะเคส Influ ได้
--   2) ถังขยะไม่เก็บ `influ_case_photos` (0105) — ลบแล้วกู้คืน รูปเคสหายทั้งชุด
--      และกู้คืนแถวเก่า 65/67 ไม่ได้เลยเพราะ person_id ชี้โปรไฟล์ที่ถูกลบตอน 0081 (ชน FK)
--   3) `influ_assignees.scopes` ปนกัน 2 ยุค (memo/contract/followup ก่อน 0104 กับ
--      owner/follower/memo หลัง 0104) — normalize ครั้งเดียวแล้วบีบ check ให้เหลือชุดใหม่
--   4) RLS ของตารางที่ "ต้องผ่าน RPC เท่านั้น" ยังเปิด authenticated ทั้งหมด
--      ⇒ ยิง REST ตรงข้าม guard ได้ (ลบ backup ทิ้ง / mark read แจ้งเตือนของคนอื่น)
-- ============================================================

/* ---------- 1) ปิดช่อง anon เรียก RPC ---------- */

revoke execute on function public.influ_delete_with_backup(uuid) from public, anon;
revoke execute on function public.influ_restore_backup(uuid) from public, anon;
revoke execute on function public.influ_purge_expired_backups() from public, anon;
revoke execute on function public.next_influ_code() from public, anon;
revoke execute on function public.next_campaign_tag() from public, anon;

grant execute on function public.influ_delete_with_backup(uuid) to authenticated, service_role;
grant execute on function public.influ_restore_backup(uuid) to authenticated, service_role;
grant execute on function public.influ_purge_expired_backups() to authenticated, service_role;
grant execute on function public.next_influ_code() to authenticated, service_role;
grant execute on function public.next_campaign_tag() to authenticated, service_role;

-- ฟังก์ชันใหม่ใน public ไม่ต้องเปิดให้ PUBLIC อีกต่อไป (ค่าปริยายของ Postgres คือเปิด)
-- RPC ตัวใหม่หลังจากนี้ต้อง `grant execute ... to authenticated` เองเสมอ
-- ไม่งั้นแอปจะเจอ permission denied (ล้มดัง ไม่ใช่เงียบ — ตั้งใจให้เป็นแบบนั้น)
alter default privileges in schema public revoke execute on functions from public;

/* ---------- 2) helper: แปลงค่า scopes เก่า ไปเป็นบทบาทใหม่ (0104) ---------- */

create or replace function private.influ_normalize_scopes(p_scopes text[])
returns text[]
language sql
immutable
as $fn$
  select coalesce(array(
    select distinct m.r
      from unnest(coalesce(p_scopes, '{}'::text[])) s
     cross join lateral (
       select case s when 'contract' then 'owner'
                     when 'followup' then 'follower'
                     else s end as r
     ) m
     where m.r in ('owner', 'follower', 'memo')
  ), '{}'::text[]);
$fn$;

/* ---------- 3) normalize ข้อมูลเดิม แล้วบีบ check ---------- */

update public.influ_assignees
   set scopes = private.influ_normalize_scopes(scopes)
 where scopes <> private.influ_normalize_scopes(scopes);

-- payload ในถังขยะก็เก็บ scopes ยุคเก่าไว้ — ไม่แปลงตาม = กู้คืนแล้วชน check ใหม่
update public.influ_deleted_backups b
   set payload = jsonb_set(
     b.payload,
     '{assignees}',
     coalesce((
       select jsonb_agg(
         jsonb_set(
           a,
           '{scopes}',
           to_jsonb(private.influ_normalize_scopes(
             array(select jsonb_array_elements_text(a -> 'scopes'))
           ))
         )
       )
       from jsonb_array_elements(b.payload -> 'assignees') a
     ), '[]'::jsonb)
   )
 where jsonb_typeof(b.payload -> 'assignees') = 'array'
   and jsonb_array_length(b.payload -> 'assignees') > 0;

alter table public.influ_assignees
  drop constraint if exists influ_assignees_scopes_valid;
alter table public.influ_assignees
  add constraint influ_assignees_scopes_valid
  check (scopes <@ array['owner', 'follower', 'memo']::text[]);

/* ---------- 4) 1 โปรไฟล์ + 1 เลขรอบ = 1 เคส ----------
   ผู้ใช้ยอมรับว่ามีหลายรอบพร้อมกันได้ (เตือนใน UI ไม่บล็อค) — ที่กันตรงนี้คือ
   "กดสร้างพร้อมกัน 2 หน้าต่างแล้วได้ round_no ซ้ำ" ซึ่ง UI อ่านเลขสดจาก DB กันไม่ได้ */
create unique index if not exists influencers_person_round_key
  on public.influencers (person_id, round_no);

/* ---------- 5) ลบ/กู้คืนเคส: guard + ตารางลูกให้ครบ ---------- */

create or replace function public.influ_delete_with_backup(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_row public.influencers%rowtype;
  v_label text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_backup_id uuid;
begin
  -- เรียกผ่าน API โดยไม่ล็อกอิน = ปฏิเสธ (งานดูแลระบบจาก SQL editor/service role ยังผ่าน)
  if v_actor is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'ต้องเข้าสู่ระบบก่อนจึงจะลบเคสได้';
  end if;

  select * into v_row from public.influencers where id = p_id;
  if not found then
    raise exception 'ไม่พบเคสที่ต้องการลบ (อาจถูกลบไปแล้ว)';
  end if;

  if v_actor is not null then
    if not private.influ_can_edit(v_actor) then
      raise exception 'บัญชีนี้ไม่มีสิทธิ์ลบข้อมูล Influencer';
    end if;
    -- "เจ้าของเคส" = ผู้สร้าง (owner_id) หรือคนที่ถือบทบาท "ผู้ดูแล" ในเคสนี้ (0104)
    if not private.influ_can_manage(v_actor)
       and (v_row.owner_id is null or v_row.owner_id <> v_actor)
       and not exists (
         select 1 from public.influ_assignees a
          where a.influencer_id = p_id
            and a.user_id = v_actor
            and 'owner' = any (private.influ_normalize_scopes(a.scopes))
       ) then
      raise exception 'ลบได้เฉพาะเคสที่ตัวเองสร้างหรือเป็นผู้ดูแล — เคสอื่นให้ผู้ดูแลระบบเป็นคนลบ';
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
      'assignees', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_assignees t where t.influencer_id = p_id), '[]'::jsonb),
      -- 0105: รูปของเคส (คนละชุดกับรูปโปรไฟล์) — ไม่เก็บ = กู้คืนแล้วแกลเลอรีเคสว่าง
      'case_photos', coalesce((select jsonb_agg(to_jsonb(t)) from public.influ_case_photos t where t.influencer_id = p_id), '[]'::jsonb)
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
$fn$;

create or replace function public.influ_restore_backup(p_backup_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_b public.influ_deleted_backups%rowtype;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_influ jsonb;
  v_id uuid;
  v_person uuid;
  v_round integer;
  v_code text;
  v_note text := '';
begin
  if v_actor is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'ต้องเข้าสู่ระบบก่อนจึงจะกู้คืนข้อมูลได้';
  end if;

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

  -- โปรไฟล์ของเคสอาจถูกลบไปแล้ว (เช่นเคสที่ย้ายไปบอร์ด Hunting ตอน 0081)
  -- สร้างกลับจากข้อมูลตัวบุคคลใน payload ไม่งั้นชน FK แล้วกู้คืนไม่ได้ตลอดกาล
  v_person := nullif(v_influ ->> 'person_id', '')::uuid;
  if v_person is not null and not exists (select 1 from public.influ_profiles where id = v_person) then
    insert into public.influ_profiles
      (id, first_name, last_name, nickname, phone, occupation,
       followers, follower_note, tier, photo_path, note, created_by)
    values (
      v_person,
      coalesce(nullif(v_influ ->> 'first_name', ''), 'ไม่ระบุชื่อ'),
      nullif(v_influ ->> 'last_name', ''),
      nullif(v_influ ->> 'nickname', ''),
      nullif(v_influ ->> 'phone', ''),
      nullif(v_influ ->> 'occupation', ''),
      nullif(v_influ ->> 'followers', '')::bigint,
      nullif(v_influ ->> 'follower_note', ''),
      nullif(v_influ ->> 'tier', ''),
      nullif(v_influ ->> 'photo_path', ''),
      'สร้างกลับอัตโนมัติตอนกู้คืนเคสจากถังขยะ',
      v_actor
    );
    v_note := v_note || ' (สร้างโปรไฟล์กลับให้ด้วย)';
  end if;

  -- เลขรอบชนกับเคสสดที่เปิดไปแล้วระหว่างอยู่ในถังขยะ = ต่อท้ายเป็นรอบล่าสุด
  v_round := coalesce(nullif(v_influ ->> 'round_no', '')::integer, 1);
  if v_person is not null and exists (
    select 1 from public.influencers where person_id = v_person and round_no = v_round
  ) then
    select coalesce(max(round_no), 0) + 1 into v_round
      from public.influencers where person_id = v_person;
    v_influ := jsonb_set(v_influ, '{round_no}', to_jsonb(v_round));
    v_note := v_note || ' (เปลี่ยนเป็นรอบ ' || v_round || ')';
  end if;

  -- รหัส Influ ID ถูกใช้ไปแล้วระหว่างอยู่ในถังขยะ = ปล่อยว่างแทนการล้มทั้งการกู้คืน
  v_code := nullif(v_influ ->> 'influ_code', '');
  if v_code is not null and exists (
    select 1 from public.influencers where lower(influ_code) = lower(v_code)
  ) then
    v_influ := jsonb_set(v_influ, '{influ_code}', 'null'::jsonb);
    v_note := v_note || ' (รหัส ' || v_code || ' ถูกใช้ไปแล้ว จึงกู้คืนมาแบบไม่มีรหัส)';
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
  -- backup ชุดเก่า (ก่อน 0105) ไม่มีคีย์นี้ — coalesce เป็น [] ไม่งั้นกู้คืนของเก่าพัง
  insert into public.influ_case_photos
  select * from jsonb_populate_recordset(
    null::public.influ_case_photos,
    coalesce(v_b.payload -> 'case_photos', '[]'::jsonb)
  );
  -- backup ชุดเก่า (ก่อน 0099) ไม่มีคีย์นี้เช่นกัน; scopes ถูก normalize ไว้แล้วใน 0106
  insert into public.influ_assignees (id, influencer_id, user_id, scopes, created_by, created_at)
  select a.id, a.influencer_id, a.user_id,
         private.influ_normalize_scopes(a.scopes), a.created_by, a.created_at
    from jsonb_populate_recordset(
      null::public.influ_assignees,
      coalesce(v_b.payload -> 'assignees', '[]'::jsonb)
    ) a
  -- โปรไฟล์ที่ถูกลบไประหว่างอยู่ในถังขยะ = ข้ามคนนั้นไป ไม่ให้การกู้คืนทั้งเคสพัง
  where a.user_id in (select id from public.profiles);

  select full_name into v_actor_name from public.profiles where id = v_actor;

  update public.influ_deleted_backups
     set restored_at = now(), restored_by = v_actor
   where id = p_backup_id;

  insert into public.influ_activity_log
    (actor_id, actor_name, action, entity, entity_id, influencer_id, influencer_name, summary, meta)
  values (
    v_actor, v_actor_name, 'restore', 'influencer', v_id, v_id, v_b.label,
    'กู้คืนเคส ' || v_b.label || ' จากถังขยะ' || v_note,
    jsonb_build_object('backup_id', p_backup_id)
  );

  return v_id;
end;
$fn$;

create or replace function public.influ_purge_expired_backups()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'ต้องเข้าสู่ระบบก่อนจึงจะล้างถังขยะได้';
  end if;
  if v_actor is not null and not private.influ_can_manage(v_actor) then
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
$fn$;

/* ---------- 6) RLS: ตารางที่ต้องผ่าน RPC เท่านั้น ---------- */

-- ถังขยะ: อ่านได้เฉพาะผู้ดูแลระบบ (หน้า /influencer-management/trash) และ
-- ไม่มี policy insert/update/delete เลย — ทางเข้าเดียวคือ RPC (SECURITY DEFINER)
drop policy if exists "authenticated full access influ_deleted_backups" on public.influ_deleted_backups;
drop policy if exists "influ manage read backups" on public.influ_deleted_backups;
create policy "influ manage read backups"
  on public.influ_deleted_backups for select
  to authenticated
  using (private.influ_can_manage(auth.uid()));

-- แจ้งเตือน: insert ให้คนอื่นได้ (client เป็นคนสร้าง) แต่ mark read/ลบ ได้เฉพาะของตัวเอง
drop policy if exists "authenticated full access influ_notifications" on public.influ_notifications;
drop policy if exists "read own influ_notifications" on public.influ_notifications;
drop policy if exists "insert influ_notifications" on public.influ_notifications;
drop policy if exists "update own influ_notifications" on public.influ_notifications;
drop policy if exists "delete own influ_notifications" on public.influ_notifications;
create policy "read own influ_notifications"
  on public.influ_notifications for select
  to authenticated using (recipient_id = auth.uid());
create policy "insert influ_notifications"
  on public.influ_notifications for insert
  to authenticated with check (true);
create policy "update own influ_notifications"
  on public.influ_notifications for update
  to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "delete own influ_notifications"
  on public.influ_notifications for delete
  to authenticated using (recipient_id = auth.uid());

/* ---------- 7) index ที่ขาด ---------- */

create index if not exists influ_notifications_influencer_idx
  on public.influ_notifications (influencer_id)
  where influencer_id is not null;
create index if not exists influ_notifications_actor_idx
  on public.influ_notifications (actor_id);
