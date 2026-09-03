-- ============================================================
-- 0108 — สร้างเคสใหม่ใน transaction เดียว (RPC influ_create_case)
--
-- ปัญหาเดิม (audit 2026-09-03): โมดัล "สร้างนัดใหม่" ยิง 4-5 คำสั่งเรียงกันจากฝั่ง client
-- (อ่านเลขรอบ → insert เคส → insert หัตถการ → insert ผู้รับผิดชอบ → copy รูป)
-- ล้มกลางทางเมื่อไหร่ก็ได้เคสครึ่งๆ กลางๆ:
--   * insert ผู้รับผิดชอบล้ม = แค่ console.warn แล้วเดินต่อ ⇒ การ์ดใหม่ไม่มีเจ้าภาพ
--     และหายจากบอร์ดของคนที่เพิ่งกดสร้างทันที (ตัวกรองค่าโรงงานคือ "เคสของฉัน")
--   * insert หัตถการล้ม = error ถูก reset() ล้างทิ้งก่อนผู้ใช้ทันเห็น
--   * เลขรอบอ่านจาก client = สองหน้าต่างสร้างพร้อมกันได้เลขเดียวกัน (ตอนนี้ 0106 กันไว้
--     ด้วย unique (person_id, round_no) แต่ผู้ใช้จะเจอ error แทนที่จะได้เลขถัดไป)
--
-- RPC นี้ทำทั้งหมดในคำสั่งเดียว: ล็อกแถวโปรไฟล์ → คำนวณเลขรอบ → insert เคส +
-- หัตถการ + ผู้รับผิดชอบ แล้วคืน id (ล้มตรงไหน = rollback ทั้งก้อน ไม่มีเคสค้าง)
-- รูปยัง copy จากฝั่ง client หลังจากนี้ (best effort — ไฟล์ storage ไม่อยู่ใน transaction อยู่แล้ว)
-- ============================================================

create or replace function public.influ_create_case(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_actor uuid := auth.uid();
  v_person uuid := nullif(p ->> 'person_id', '')::uuid;
  v_profile public.influ_profiles%rowtype;
  v_round integer;
  v_id uuid;
  v_pos integer := 0;
  v_item jsonb;
  v_scopes text[];
begin
  if v_actor is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'ต้องเข้าสู่ระบบก่อนจึงจะสร้างเคสได้';
  end if;
  if v_actor is not null and not private.influ_can_edit(v_actor) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์สร้างเคส Influencer';
  end if;
  if v_person is null then
    raise exception 'ต้องเลือกโปรไฟล์ Influencer ก่อนสร้างเคส';
  end if;

  -- ล็อกแถวโปรไฟล์ = กันสองหน้าต่างคำนวณเลขรอบพร้อมกันแล้วได้เลขเดียวกัน
  select * into v_profile from public.influ_profiles where id = v_person for update;
  if not found then
    raise exception 'ไม่พบโปรไฟล์ที่เลือก (อาจถูกลบไปแล้ว)';
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round
    from public.influencers where person_id = v_person;

  -- ข้อมูลตัวบุคคลอ่านจากโปรไฟล์เสมอ (ความจริงแหล่งเดียว) ส่วนข้อมูลเคสมาจาก payload
  -- influ_code ไม่ต้องส่ง — trigger influencers_sync_code เติมจากโปรไฟล์ให้ (0107)
  insert into public.influencers (
    person_id, round_no,
    first_name, last_name, nickname, phone, occupation,
    followers, follower_note, tier,
    stage, campaign_id, consult_only, talent_fee, case_value,
    memo_ready_at, service_date, doctor_name, contact_channel,
    procedure_text, owner_id, created_by
  ) values (
    v_person, v_round,
    v_profile.first_name, v_profile.last_name, v_profile.nickname,
    v_profile.phone, v_profile.occupation,
    v_profile.followers, v_profile.follower_note, v_profile.tier,
    coalesce((p ->> 'stage')::integer, 1),
    nullif(p ->> 'campaign_id', '')::uuid,
    coalesce((p ->> 'consult_only')::boolean, false),
    nullif(p ->> 'talent_fee', '')::numeric,
    nullif(p ->> 'case_value', '')::numeric,
    now(),
    nullif(p ->> 'service_date', '')::date,
    nullif(p ->> 'doctor_name', ''),
    nullif(p ->> 'contact_channel', ''),
    nullif(p ->> 'procedure_text', ''),
    v_actor, v_actor
  )
  returning id into v_id;

  for v_item in
    select * from jsonb_array_elements(coalesce(p -> 'procedures', '[]'::jsonb))
  loop
    v_pos := v_pos + 1;
    insert into public.influ_procedure_items
      (influencer_id, name, price, price_item_id, promo_package_id, product_team, position)
    values (
      v_id,
      v_item ->> 'name',
      coalesce((v_item ->> 'price')::numeric, 0),
      nullif(v_item ->> 'price_item_id', '')::uuid,
      nullif(v_item ->> 'promo_package_id', '')::uuid,
      coalesce(nullif(v_item ->> 'product_team', ''), 'aesthetics'),
      v_pos
    );
  end loop;

  for v_item in
    select * from jsonb_array_elements(coalesce(p -> 'assignees', '[]'::jsonb))
  loop
    -- scopes ว่าง = ผู้เกี่ยวข้อง (แจ้งเตือนแบบเงียบ) — ไม่ใช่ข้อมูลเสีย
    v_scopes := private.influ_normalize_scopes(
      array(select jsonb_array_elements_text(coalesce(v_item -> 'scopes', '[]'::jsonb)))
    );
    insert into public.influ_assignees (influencer_id, user_id, scopes, created_by)
    values (v_id, (v_item ->> 'user_id')::uuid, v_scopes, v_actor)
    on conflict (influencer_id, user_id) do update set scopes = excluded.scopes;
  end loop;

  return v_id;
end;
$fn$;

revoke execute on function public.influ_create_case(jsonb) from public, anon;
grant execute on function public.influ_create_case(jsonb) to authenticated, service_role;
