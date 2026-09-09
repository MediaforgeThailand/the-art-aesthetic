-- ============================================================
-- 0114 — หมายเหตุงบเกินเพดาน Tier + backfill voucher ให้เคสที่รอ Memo
-- (ผู้ใช้ 2026-09-07 — มาพร้อมตารางเพดานงบทางการของบริษัท)
--
-- (1) `influencers.budget_note` = หมายเหตุประกอบการขออนุมัติเมื่อมูลค่าเคส
--     (วงเงิน voucher + ค่าตัว) เกินเพดานงบของ Tier — ตารางเพดานอยู่ที่
--     INFLU_BUDGET_CAPS ใน influ-constants.ts (nano 50k / micro 150k / mid 300k /
--     macro 500k / celebrity 1.5M — celebrity ต้องผ่าน CEO เพิ่ม) โผล่ในข้อความ
--     Memo และจะส่งต่อเข้า API ระบบ E-document ในอนาคต
--     nullable ตามบทเรียนถังขยะ 0083 — backup เก่ากู้คืนได้โดยไม่ต้อง jsonb_set
--
-- (2) backfill voucher: กติกาใหม่คือ "voucher เป็นของบังคับ ไม่ใช่หัตถการ"
--     เคสเก่าที่ยังรอ Memo (memo_file_path null, ไม่ปิดงาน/ปฏิเสธ/archived)
--     และยังไม่เปิดวงเงิน ให้เปิดให้ "มากกว่ามูลค่าหัตถการเล็กน้อย" =
--     ceil(มูลค่ารวมที่ไม่ใช่ของแบรนด์ support / ราคาต่อใบ) เช่น 19,900 → 2 ใบ
--     แล้วคิด case_value ใหม่ตามสมการ 0106 + เขียน log กำกับทุกเคส
--     ตอนรันจริง: 9 เคสถูกเติม (สูงสุด หนิง 114,700 → 12 ใบ) เคสที่มี voucher
--     แล้ว (พิมพลอย 10 ใบ) ไม่ถูกแตะ
--
-- (3) influ_create_case เขียน budget_note ด้วย (กติกา 0113: เพิ่มคอลัมน์ให้
--     influencers ต้องเช็คว่า RPC นี้ต้องเขียนด้วยไหมทุกครั้ง)
-- ============================================================

alter table public.influencers add column if not exists budget_note text;
comment on column public.influencers.budget_note is
  'หมายเหตุประกอบการขออนุมัติเมื่อมูลค่าเคส (วงเงิน voucher + ค่าตัว) เกินเพดานงบของ Tier — โผล่ในข้อความ Memo และจะส่งต่อเข้า API ระบบ E-document';

with waiting as (
  select i.id, i.voucher_unit, i.talent_fee,
    coalesce(sum(case when p.is_supported then 0 else p.price end), 0) as total
  from public.influencers i
  left join public.influ_procedure_items p on p.influencer_id = i.id
  where i.memo_file_path is null and i.completed = false
    and i.declined_at is null and i.archived = false
    and i.voucher_count = 0
  group by i.id
), calc as (
  select id, total, voucher_unit,
    ceil(total / voucher_unit)::int as vc
  from waiting where total > 0
), upd as (
  update public.influencers i
  set voucher_count = c.vc,
      case_value = (c.vc * c.voucher_unit) + coalesce(i.talent_fee, 0)
  from calc c where c.id = i.id
  returning i.id, i.first_name, i.last_name, i.nickname, c.vc, c.voucher_unit, c.total
)
insert into public.influ_activity_log
  (actor_name, action, entity, influencer_id, influencer_name, summary)
select
  'ระบบ (migration 0114)', 'update', 'influencer', u.id,
  coalesce(nullif(trim(concat(u.first_name, ' ', u.last_name)), ''), u.nickname, 'ไม่ระบุชื่อ'),
  format('เปิดวงเงิน voucher %s ใบ (%s บาท) ให้เคสที่รอ Memo — คำนวณจากมูลค่าหัตถการ %s บาท',
    u.vc, to_char(u.vc * u.voucher_unit, 'FM999,999,990'), to_char(u.total, 'FM999,999,990'))
from upd u;

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

  select * into v_profile from public.influ_profiles where id = v_person for update;
  if not found then
    raise exception 'ไม่พบโปรไฟล์ที่เลือก (อาจถูกลบไปแล้ว)';
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round
    from public.influencers where person_id = v_person;

  insert into public.influencers (
    person_id, round_no,
    first_name, last_name, nickname, phone, occupation,
    followers, follower_note, tier,
    stage, campaign_id, consult_only, talent_fee, case_value,
    voucher_count, voucher_unit, budget_note,
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
    nullif(p ->> 'budget_note', ''),
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
