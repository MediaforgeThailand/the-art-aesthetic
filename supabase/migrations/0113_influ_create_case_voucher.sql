-- ============================================================
-- 0113 — influ_create_case รับวงเงิน voucher ด้วย (ต่อจาก 0106 + 0109)
--
-- 0106 (อีก session) เปลี่ยนสมการมูลค่าเคสเป็น "วงเงิน voucher + ค่าตัว" แล้วเพิ่ม
-- คอลัมน์ voucher_count / voucher_unit — แต่ตอนนั้น RPC influ_create_case ของ 0109
-- ยังไม่มี ⇒ พอ merge สองสายเข้าด้วยกัน เคสที่สร้างจากโมดัล "สร้างนัดใหม่" จะได้
-- voucher_count = 0 (ค่า default) ทั้งที่ case_value ถูกคิดจากวงเงินที่ผู้ใช้เพิ่งเลือก
-- ⇒ หน้าเคสโชว์ "ยังไม่เปิดวงเงิน" แต่มูลค่าเคสมีตัวเลข (ขัดกันเอง)
--
-- แก้ด้วยการสร้างฟังก์ชันทับ เพิ่ม 2 คอลัมน์ลง insert เท่านั้น (ที่เหลือเหมือน 0109 เป๊ะ)
-- voucher_unit เป็น snapshot ราคาต่อใบ ณ ตอนเปิด — default 10000 ให้ตรงกับ DDL ของ 0106
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
    voucher_count, voucher_unit,
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
    coalesce((p ->> 'voucher_count')::integer, 0),
    coalesce(nullif(p ->> 'voucher_unit', '')::numeric, 10000),
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
