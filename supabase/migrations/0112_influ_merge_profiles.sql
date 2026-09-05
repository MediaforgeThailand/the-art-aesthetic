-- ============================================================
-- 0112 — รวมโปรไฟล์ซ้ำ + ลบโปรไฟล์กำพร้า (audit 2026-09-03 แพ็กเกจสุดท้าย)
--
-- ปัญหา: backfill ตอน 0073/0080 สร้างโปรไฟล์ 1 แถวต่อ "เคส" ⇒ คนที่เคยเข้ามาหลายครั้ง
-- ก่อนมีระบบรอบงาน กลายเป็นคนละโปรไฟล์กัน (แทนไทมี 2 person_id — ใบหนึ่ง archived
-- รหัส INF-00042 อีกใบใช้งานจริงรหัส INF-00160) ⇒ แฮชแท็ก #INF ที่ใช้ track ยอดจาก Meta
-- ยังแตกเป็นคนละคนอยู่ดี แม้ 0107 จะรวมรหัสข้าม "รอบ" ของโปรไฟล์เดียวกันไปแล้ว
--
-- **กติกาผู้ใช้ 2026-09-03: รวมแล้วให้ยึด "รหัสเก่า" (เลขน้อยกว่า)**
-- เพราะรหัส INF-xxxxx เป็นของชั่วคราว — ปลายทางที่ผู้ใช้วางไว้คือ PK = เลขบัตรประชาชน
-- (เก็บหลังบ้าน ไม่โชว์) ส่วนสิ่งที่ทีมกรอกตอนสร้างโปรไฟล์จะเป็นแฮชแท็กบังคับ
-- (เช่น #ต้าเฟ็ดเฟ่ = ชื่อ-นามสกุล ซึ่ง "ซ้ำกันได้") ⇒ ระหว่างนี้ยึดเลขเก่าไว้ก่อน
--
-- ⚠️ **ห้ามรวมอัตโนมัติจากชื่อ** — ฝั่ง UI เสนอ "คู่ที่น่าจะซ้ำ" ให้ดูเฉยๆ
-- คนกดยืนยันเป็นคนตัดสินทีละคู่เสมอ (ชื่อซ้ำ ≠ คนเดียวกัน)
-- ============================================================

/* ---------- รวมโปรไฟล์: ย้ายทุกอย่างจาก p_from ไป p_into แล้วลบ p_from ---------- */

create or replace function public.influ_merge_profiles(p_from uuid, p_into uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_from public.influ_profiles%rowtype;
  v_into public.influ_profiles%rowtype;
  v_keep_code text;
  v_from_num bigint;
  v_into_num bigint;
  v_round integer;
  v_cases integer := 0;
  r record;
begin
  if v_actor is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'ต้องเข้าสู่ระบบก่อนจึงจะรวมโปรไฟล์ได้';
  end if;
  if v_actor is not null and not private.influ_can_manage(v_actor) then
    raise exception 'รวมโปรไฟล์ได้เฉพาะผู้ดูแลระบบ Influencer';
  end if;
  if p_from = p_into then
    raise exception 'เลือกคนละโปรไฟล์ก่อนรวม';
  end if;

  -- ล็อกทั้งสองแถว กันกดรวมพร้อมกัน 2 หน้าต่างแล้วข้อมูลข้ามกันมั่ว
  select * into v_from from public.influ_profiles where id = p_from for update;
  if not found then raise exception 'ไม่พบโปรไฟล์ต้นทาง (อาจถูกลบ/รวมไปแล้ว)'; end if;
  select * into v_into from public.influ_profiles where id = p_into for update;
  if not found then raise exception 'ไม่พบโปรไฟล์ปลายทาง (อาจถูกลบ/รวมไปแล้ว)'; end if;

  -- รหัสที่รอด = เลขน้อยกว่า (เก่ากว่า); รหัสที่ผิดรูป = ถือว่าใหม่สุดเพื่อให้รหัสจริงชนะ
  v_from_num := coalesce(nullif(regexp_replace(coalesce(v_from.influ_code, ''), '\D', '', 'g'), '')::bigint, 9223372036854775807);
  v_into_num := coalesce(nullif(regexp_replace(coalesce(v_into.influ_code, ''), '\D', '', 'g'), '')::bigint, 9223372036854775807);
  v_keep_code := case when v_from_num < v_into_num then v_from.influ_code else v_into.influ_code end;

  /* 1) ย้ายเคสทุกรอบมาที่ p_into — ต่อท้ายเลขรอบเดิมของปลายทางก่อน (กัน unique ชน)
        trigger influencers_sync_code จะ set influ_code ตามโปรไฟล์ปลายทางให้เอง */
  select coalesce(max(round_no), 0) into v_round
    from public.influencers where person_id = p_into;
  for r in
    select id from public.influencers where person_id = p_from order by round_no, created_at
  loop
    v_round := v_round + 1;
    v_cases := v_cases + 1;
    update public.influencers set person_id = p_into, round_no = v_round where id = r.id;
  end loop;

  /* 2) เรียงเลขรอบใหม่ทั้งชุดตามเวลาสร้างจริง (1..N) — ยกไปช่วงสูงก่อนแล้วค่อยไล่ลง
        ไม่งั้นชน unique (person_id, round_no) ระหว่างทาง */
  update public.influencers set round_no = round_no + 1000 where person_id = p_into;
  v_round := 0;
  for r in
    select id from public.influencers where person_id = p_into order by created_at, id
  loop
    v_round := v_round + 1;
    update public.influencers set round_no = v_round where id = r.id;
  end loop;

  /* 3) ลูกของโปรไฟล์: แคมเปญ (unique campaign+profile — ข้ามตัวที่ปลายทางมีแล้ว),
        ช่องทางติดต่อ, รูปโปรไฟล์, รายชื่อใน Hunting ที่ชี้โปรไฟล์นี้ */
  update public.influ_campaign_members m
     set profile_id = p_into
   where m.profile_id = p_from
     and not exists (
       select 1 from public.influ_campaign_members m2
        where m2.campaign_id = m.campaign_id and m2.profile_id = p_into
     );
  delete from public.influ_campaign_members where profile_id = p_from;

  update public.influ_profile_channels set profile_id = p_into where profile_id = p_from;
  update public.influ_profile_photos set profile_id = p_into where profile_id = p_from;
  update public.influ_prospects set profile_id = p_into where profile_id = p_from;

  /* 4) เติมช่องที่ปลายทางว่างจากต้นทาง (ข้อมูลไม่ควรหายไปกับโปรไฟล์ที่ถูกลบ) */
  update public.influ_profiles
     set last_name = coalesce(last_name, v_from.last_name),
         nickname = coalesce(nickname, v_from.nickname),
         phone = coalesce(phone, v_from.phone),
         occupation = coalesce(occupation, v_from.occupation),
         followers = coalesce(followers, v_from.followers),
         follower_note = coalesce(follower_note, v_from.follower_note),
         tier = coalesce(tier, v_from.tier),
         photo_path = coalesce(photo_path, v_from.photo_path),
         note = coalesce(note, v_from.note)
   where id = p_into;

  -- 5) ลบต้นทางก่อน แล้วค่อยตั้งรหัสที่รอด (ไม่งั้นชน unique index ของ influ_code)
  delete from public.influ_profiles where id = p_from;

  update public.influ_profiles
     set influ_code = v_keep_code
   where id = p_into
     and influ_code is distinct from v_keep_code;
  -- trigger influ_profiles_code_fanout (0107) sync รหัสลงเคสทุกรอบให้เอง

  select full_name into v_actor_name from public.profiles where id = v_actor;
  insert into public.influ_activity_log
    (actor_id, actor_name, action, entity, entity_id, summary, meta)
  values (
    v_actor, v_actor_name, 'update', 'profile', p_into,
    'รวมโปรไฟล์ "' || coalesce(v_from.nickname, v_from.first_name, 'ไม่ระบุชื่อ') ||
    '" (' || coalesce(v_from.influ_code, 'ไม่มีรหัส') || ') เข้ากับ "' ||
    coalesce(v_into.nickname, v_into.first_name, 'ไม่ระบุชื่อ') ||
    '" — ย้ายเคส ' || v_cases || ' รอบ, รหัสที่ใช้ต่อคือ ' || coalesce(v_keep_code, 'ไม่มีรหัส'),
    jsonb_build_object(
      'from_profile', p_from, 'into_profile', p_into,
      'from_code', v_from.influ_code, 'into_code', v_into.influ_code,
      'kept_code', v_keep_code, 'cases_moved', v_cases
    )
  );

  return p_into;
end;
$fn$;

revoke execute on function public.influ_merge_profiles(uuid, uuid) from public, anon;
grant execute on function public.influ_merge_profiles(uuid, uuid) to authenticated, service_role;

/* ---------- ลบโปรไฟล์ที่ยังไม่มีเคส ----------
   FK influencers.person_id เป็น NO ACTION อยู่แล้ว (ลบโปรไฟล์ที่มีเคสไม่ได้) แต่ error
   ดิบของ FK อ่านไม่รู้เรื่อง — ห่อเป็น RPC เพื่อให้ได้ข้อความไทย + เขียน log ให้ด้วย */

create or replace function public.influ_delete_profile(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_row public.influ_profiles%rowtype;
  v_cases integer;
begin
  if v_actor is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'ต้องเข้าสู่ระบบก่อนจึงจะลบโปรไฟล์ได้';
  end if;
  if v_actor is not null and not private.influ_can_manage(v_actor) then
    raise exception 'ลบโปรไฟล์ได้เฉพาะผู้ดูแลระบบ Influencer';
  end if;

  select * into v_row from public.influ_profiles where id = p_id;
  if not found then raise exception 'ไม่พบโปรไฟล์นี้ (อาจถูกลบไปแล้ว)'; end if;

  select count(*) into v_cases from public.influencers where person_id = p_id;
  if v_cases > 0 then
    raise exception 'โปรไฟล์นี้มีเคสอยู่ % รอบ — ลบเคสให้หมดก่อน หรือใช้ "รวมโปรไฟล์" แทน', v_cases;
  end if;

  delete from public.influ_profiles where id = p_id;

  select full_name into v_actor_name from public.profiles where id = v_actor;
  insert into public.influ_activity_log
    (actor_id, actor_name, action, entity, entity_id, summary, meta)
  values (
    v_actor, v_actor_name, 'delete', 'profile', p_id,
    'ลบโปรไฟล์ที่ยังไม่มีเคส: ' ||
    coalesce(v_row.nickname, v_row.first_name, 'ไม่ระบุชื่อ') ||
    ' (' || coalesce(v_row.influ_code, 'ไม่มีรหัส') || ')',
    jsonb_build_object('influ_code', v_row.influ_code)
  );
end;
$fn$;

revoke execute on function public.influ_delete_profile(uuid) from public, anon;
grant execute on function public.influ_delete_profile(uuid) to authenticated, service_role;
