-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0126 = migration "sq_viewer_role_and_my_access" (version 20260826064507) ที่ apply บน Supabase แล้วเมื่อ 2026-08-26
-- ที่มาของไฟล์: repo `the-art-sales-assistant` โฟลเดอร์ `queue/supabase/migrations/` (ถูกลบไปพร้อมโฟลเดอร์ queue/ ตอนรวม Sales Queue เข้าแอปนี้ — commit 00f2265) — ชื่อเดิม 0007_sales_queue_viewer_role.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- 0007: บทบาท "ผู้ดูอย่างเดียว" (viewer) + RPC อ่านสิทธิ์ของตัวเองครั้งเดียว
--
-- ที่มา:
--  1) แอดมินตัวจริงเจอหน้า "ยังไม่ได้อยู่ในทีมคิว" เพราะ getQueueSession อ่าน profiles
--     แล้ว PostgREST ตอบ 401 (PGRST303) ชั่วคราว โค้ดฝั่งแอปกลืน error เป็น "ไม่ใช่แอดมิน"
--     -> รวมการอ่านสิทธิ์ไว้ที่ sq_my_access() ครั้งเดียว แอปเช็ค error ได้จริง
--  2) ต้องมีสิทธิ์สำหรับคนที่ "ดูได้ทั้งทีม แต่ไม่อยู่ในคิว" เช่น หัวหน้า/แอดมินที่ไม่ลงคิว
--  3) เพิ่มสมาชิกแล้วเลือกได้ว่าจะให้รับคิวลูกค้าหรือไม่ (เดิมถูกใส่เข้าคิวเสมอ)

-- 1) role: bc | admin | viewer
alter table public.sq_members drop constraint if exists sq_members_role_check;
alter table public.sq_members add constraint sq_members_role_check
  check (role = any (array['bc'::text, 'admin'::text, 'viewer'::text]));

-- 2) ใครมีสิทธิ์เห็นข้อมูลของทั้งทีม
create or replace function public.sq_can_view_all()
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.sq_is_admin() or exists (
    select 1 from public.sq_members m
    where m.user_id = auth.uid() and m.is_active and m.role = 'viewer'
  )
$$;
grant execute on function public.sq_can_view_all() to authenticated, service_role;

-- 3) RLS: viewer อ่านเคส/การจ่ายงานได้ทั้งหมด (audit log ยังเป็นของแอดมินเท่านั้น)
drop policy if exists "sq_cases_select" on public.sq_cases;
create policy "sq_cases_select" on public.sq_cases
  for select to authenticated
  using (
    public.sq_can_view_all()
    or exists (
      select 1 from public.sq_assignments a
      where a.case_id = sq_cases.id and a.member_id = public.sq_my_member_id()
    )
  );

drop policy if exists "sq_assignments_select" on public.sq_assignments;
create policy "sq_assignments_select" on public.sq_assignments
  for select to authenticated
  using (
    public.sq_can_view_all()
    or member_id = public.sq_my_member_id()
  );

-- 4) viewer ต้องไม่ถูกสุ่มเข้าคิวเด็ดขาด
create or replace function public.sq_pick_member(p_exclude uuid[] default '{}'::uuid[])
returns table(member_id uuid, weight integer, rank_snapshot integer, daily_ratio numeric, monthly_ratio numeric)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with today as (select public.sq_today() as d, public.sq_period_key() as k),
  period as (
    select rp.id from public.sq_ranking_periods rp, today
    where rp.period_key = today.k and rp.status = 'published'
    limit 1
  ),
  candidates as (
    select m.id,
           coalesce(re.weight, 1) as w,
           re.rank as rk
    from public.sq_members m
    left join public.sq_ranking_entries re
      on re.member_id = m.id and re.period_id = (select id from period)
    where m.is_active
      and m.queue_enabled
      and m.role <> 'viewer'
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

-- 5) เพิ่มสมาชิก: เลือกได้ว่าให้รับคิวหรือไม่ / viewer ไม่รับคิวเสมอ
create or replace function public.sq_add_member(
  p_user_id uuid,
  p_employee_code text default null,
  p_role text default 'bc',
  p_queue_enabled boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_existing public.sq_members%rowtype;
  v_name text;
  v_id uuid;
  v_role text := coalesce(p_role, 'bc');
  v_queue boolean;
  v_avail text;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_role not in ('bc', 'admin', 'viewer') then raise exception 'invalid_role'; end if;

  v_queue := case when v_role = 'viewer' then false else coalesce(p_queue_enabled, true) end;
  v_avail := case when v_queue then 'available' else 'offline' end;

  select coalesce(nullif(btrim(coalesce(full_name, '')), ''), email, 'ไม่ทราบชื่อ')
    into v_name from public.profiles where id = p_user_id;
  if v_name is null then raise exception 'user_not_found'; end if;

  select * into v_existing from public.sq_members where user_id = p_user_id;
  if found then
    update public.sq_members set
      is_active = true, deactivated_at = null, deactivation_reason = null,
      queue_enabled = v_queue, availability = v_avail,
      employee_code = coalesce(nullif(btrim(coalesce(p_employee_code, '')), ''), employee_code),
      role = v_role, display_name = v_name,
      updated_by = auth.uid(), updated_at = now()
    where id = v_existing.id;
    perform public.sq_audit('member.reactivate', 'member', v_existing.id, null,
      jsonb_build_object('user_id', p_user_id, 'role', v_role, 'queue_enabled', v_queue));
    return jsonb_build_object('status', 'reactivated', 'member_id', v_existing.id);
  end if;

  insert into public.sq_members (user_id, display_name, employee_code, role,
                                 queue_enabled, availability, created_by, updated_by)
  values (p_user_id, v_name, nullif(btrim(coalesce(p_employee_code, '')), ''),
          v_role, v_queue, v_avail, auth.uid(), auth.uid())
  returning id into v_id;

  perform public.sq_audit('member.add', 'member', v_id, null,
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'queue_enabled', v_queue));
  return jsonb_build_object('status', 'added', 'member_id', v_id);
end;
$$;
revoke all on function public.sq_add_member(uuid, text, text, boolean) from public;
grant execute on function public.sq_add_member(uuid, text, text, boolean) to authenticated, service_role;
drop function if exists public.sq_add_member(uuid, text, text);

-- 6) แก้ไขสมาชิก: ตรวจบทบาท + เปลี่ยนเป็น viewer แล้วออกจากคิวอัตโนมัติ
create or replace function public.sq_update_member(
  p_member_id uuid,
  p_is_active boolean default null,
  p_queue_enabled boolean default null,
  p_availability text default null,
  p_role text default null,
  p_employee_code text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_m public.sq_members%rowtype;
  v_open int;
  v_role text;
  v_queue boolean;
  v_avail text;
begin
  if not public.sq_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_m from public.sq_members where id = p_member_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_role is not null and p_role not in ('bc', 'admin', 'viewer') then
    raise exception 'invalid_role';
  end if;
  if p_availability is not null and p_availability not in
     ('available', 'busy', 'paused', 'offline') then
    raise exception 'invalid_availability';
  end if;

  v_role  := coalesce(p_role, v_m.role);
  v_queue := coalesce(p_queue_enabled, v_m.queue_enabled);
  v_avail := coalesce(p_availability, v_m.availability);

  -- viewer อยู่นอกคิวเสมอ
  if v_role = 'viewer' then
    v_queue := false;
    if p_availability is null then v_avail := 'offline'; end if;
  end if;

  -- ต้องมีเหตุผลเมื่อแอดมินสั่ง "ปิดใช้งาน" หรือ "ปิดรับคิว" เอง
  if (p_is_active is false and v_m.is_active)
     or (p_queue_enabled is false and v_m.queue_enabled) then
    if coalesce(btrim(coalesce(p_reason, '')), '') = '' then raise exception 'reason_required'; end if;
  end if;

  update public.sq_members set
    is_active = coalesce(p_is_active, is_active),
    queue_enabled = v_queue,
    availability = v_avail,
    role = v_role,
    employee_code = case when p_employee_code is null then employee_code
                    else nullif(btrim(p_employee_code), '') end,
    deactivated_at = case when p_is_active is false then now()
                     when p_is_active is true then null else deactivated_at end,
    deactivation_reason = case when p_is_active is false then btrim(coalesce(p_reason, ''))
                          when p_is_active is true then null else deactivation_reason end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_member_id;

  select count(*) into v_open from public.sq_assignments
  where member_id = p_member_id and status in ('assigned', 'acknowledged');

  perform public.sq_audit(
    case when p_is_active is false then 'member.deactivate'
         when p_is_active is true then 'member.reactivate'
         else 'member.update' end,
    'member', p_member_id, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('is_active', coalesce(p_is_active, v_m.is_active),
                       'queue_enabled', v_queue,
                       'availability', v_avail,
                       'role', v_role,
                       'open_assignments', v_open));

  return jsonb_build_object('status', 'updated', 'open_assignments', v_open);
end;
$$;

-- 7) สิทธิ์ของผู้ใช้ปัจจุบัน: อ่านครั้งเดียว ไม่ต้องยิงสองตารางแล้วเดาผลเอง
create or replace function public.sq_my_access()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'is_admin', public.sq_is_admin(),
    'can_view_all', public.sq_can_view_all(),
    'profile_role', (select p.role from public.profiles p where p.id = auth.uid()),
    'display_name', coalesce(
      nullif(btrim(coalesce((select m.display_name from public.sq_members m
                             where m.user_id = auth.uid()), '')), ''),
      nullif(btrim(coalesce((select p.full_name from public.profiles p
                             where p.id = auth.uid()), '')), ''),
      (select p.email from public.profiles p where p.id = auth.uid())
    ),
    'member', (select to_jsonb(m) from public.sq_members m where m.user_id = auth.uid())
  )
$$;
grant execute on function public.sq_my_access() to authenticated, service_role;
