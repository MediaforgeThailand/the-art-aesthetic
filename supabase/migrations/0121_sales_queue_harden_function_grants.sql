-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0121 = migration "sales_queue_harden_function_grants" (version 20260820091607) ที่ apply บน Supabase แล้วเมื่อ 2026-08-20
-- ที่มาของไฟล์: repo `the-art-sales-assistant` โฟลเดอร์ `queue/supabase/migrations/` (ถูกลบไปพร้อมโฟลเดอร์ queue/ ตอนรวม Sales Queue เข้าแอปนี้ — commit 00f2265) — ชื่อเดิม 0002_sales_queue_harden_function_grants.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- ปิดช่องที่ Supabase linter แจ้ง: (1) helper ยังไม่ล็อก search_path
-- (2) Postgres แจก EXECUTE ให้ PUBLIC เป็นค่าเริ่มต้น → anon เรียก RPC ได้

create or replace function public.sq_today()
returns date language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'Asia/Bangkok')::date
$$;

create or replace function public.sq_period_key(p_date date default null)
returns text language sql stable set search_path = public, pg_temp as $$
  select to_char(coalesce(p_date, public.sq_today()), 'YYYY-MM')
$$;

create or replace function public.sq_weight_for_rank(p_rank int)
returns int language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_rank is null then 1
    when p_rank <= 3 then 4
    when p_rank <= 5 then 2
    else 1
  end
$$;

create or replace function public.sq_normalize_phone(p_phone text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '')
$$;

create or replace function public.sq_dup_key(
  p_phone text, p_date date, p_time time, p_treatment text
) returns text language sql immutable set search_path = public, pg_temp as $$
  select coalesce(public.sq_normalize_phone(p_phone), 'nophone')
    || '|' || coalesce(p_date::text, '')
    || '|' || coalesce(to_char(p_time, 'HH24:MI'), '')
    || '|' || lower(regexp_replace(coalesce(p_treatment, ''), '\s+', '', 'g'))
$$;

-- เพิกถอน EXECUTE จาก public/anon เฉพาะฟังก์ชัน sq_* (ห้ามแตะฟังก์ชันของระบบหลัก)
do $do$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'sq\_%'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end $do$;

-- คืนสิทธิ์ให้ผู้ใช้ที่ล็อกอินแล้วเท่านั้น (sq_pick_member / sq_audit เป็น internal ไม่คืน)
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
