-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0125 = migration "sales_queue_drop_da_handoff" (version 20260820110111) ที่ apply บน Supabase แล้วเมื่อ 2026-08-20
-- ที่มาของไฟล์: repo `the-art-sales-assistant` โฟลเดอร์ `queue/supabase/migrations/` (ถูกลบไปพร้อมโฟลเดอร์ queue/ ตอนรวม Sales Queue เข้าแอปนี้ — commit 00f2265) — ชื่อเดิม 0006_sales_queue_drop_da_handoff.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- ---------------------------------------------------------------------------
-- 0006 — ตัดส่วน "ส่งต่อทีม DA" และการเก็บข้อความต้นฉบับออกทั้งหมด
--
-- ระบบคิวนี้เป็นของแผนกย่อย ไม่ได้ทำงานร่วมกับทีม DA ของบริษัทใหญ่
-- และทีม DA ก็ไม่รู้ว่ามีระบบนี้อยู่ การส่งต่อจึงไม่เคยมีอยู่จริงตั้งแต่แรก
--
-- พอไม่มีปลายทางที่ต้องได้ข้อความฉบับเต็ม การเก็บข้อความดิบไว้ก็ไม่มีคนอ่าน
-- เหลือแค่ PII (เลขบัตร/โรคประจำตัว/ประวัติแพ้ยา) นอนอยู่ในฐานข้อมูลเปล่าๆ
-- จึงเลิกเก็บทั้งหมด — ระบบเก็บเฉพาะช่องที่ parser แยกออกมาแล้วเท่านั้น
-- ต้นฉบับยังอยู่ในแชทต้นทางที่แอดมินก๊อปมา ซึ่งเป็นที่เก็บที่ถูกต้องกว่าอยู่แล้ว
--
-- ตอน apply ทุกตารางยังว่าง (0 แถว) จึงไม่มีข้อมูลจริงสูญหาย
-- ---------------------------------------------------------------------------

-- 1. เลิกงานกวาดข้อความต้นฉบับ — ไม่มีข้อความให้กวาดอีกแล้ว
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'sq-purge-raw-daily') then
    perform cron.unschedule('sq-purge-raw-daily');
  end if;
end
$do$;

-- 2. ฟังก์ชันที่ไม่มีใครเรียกอีก
drop function if exists public.sq_mark_delivery(uuid, text, text, text, text);
drop function if exists public.sq_purge_raw(interval);
drop function if exists public.sq_purge_raw_expired();

-- 3. สร้าง sq_create_case ใหม่ให้ไม่รับข้อความต้นฉบับอีก
--    เปลี่ยน signature จึงต้อง drop ก่อน (create or replace เปลี่ยนพารามิเตอร์ไม่ได้)
--    ผลพลอยได้: request body ของหน้าวางข้อมูลไม่มีข้อความลูกค้าติดไปแล้ว (§11)
drop function if exists public.sq_create_case(jsonb, text, text, text, boolean, text);

create function public.sq_create_case(
  p_payload jsonb,
  p_case_type text,
  p_idempotency_key text,
  p_force boolean default false,
  p_force_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.sq_cases%rowtype;
  v_existing public.sq_cases%rowtype;
  v_dup_key text;
  v_member_id uuid;
  v_weight int;
  v_rank int;
  v_daily numeric;
  v_monthly numeric;
  v_assignment public.sq_assignments%rowtype;
  v_seq int;
  v_member_name text;
begin
  if not public.sq_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_case_type is null or p_case_type not in
     ('online', 'walk_in', 'existing', 'referral', 'drag_surgery', 'other') then
    raise exception 'invalid_case_type';
  end if;

  -- ล็อกทั้งการแจกคิว: แอดมินสองคนกดยืนยันพร้อมกันต้องไม่คำนวณจากยอดเดียวกัน
  perform pg_advisory_xact_lock(hashtext('sq_queue_allocation'));

  -- กดยืนยันซ้ำจากหน้าเดิม = คืนผลเดิม ไม่สร้างใหม่
  if p_idempotency_key is not null then
    select * into v_existing from public.sq_cases where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('status', 'duplicate_request', 'case_id', v_existing.id);
    end if;
  end if;

  v_dup_key := public.sq_dup_key(
    p_payload->>'phone',
    nullif(p_payload->>'appointment_date', '')::date,
    nullif(p_payload->>'appointment_time', '')::time,
    p_payload->>'treatment_main'
  );

  -- เคสซ้ำเชิงธุรกิจ — ต้องให้แอดมินตัดสินใจ ห้ามแจกคิวซ้ำอัตโนมัติ
  if not coalesce(p_force, false) then
    select * into v_existing
    from public.sq_cases c
    where c.dup_key = v_dup_key and c.status <> 'cancelled'
    order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object(
        'status', 'duplicate_case',
        'existing_case_id', v_existing.id,
        'existing_case_no', v_existing.case_no,
        'existing_created_at', v_existing.created_at,
        'existing_assignee', (
          select m.display_name from public.sq_assignments a
          join public.sq_members m on m.id = a.member_id
          where a.case_id = v_existing.id
            and a.status in ('assigned', 'acknowledged')
          limit 1
        )
      );
    end if;
  elsif coalesce(btrim(p_force_reason), '') = '' then
    raise exception 'force_reason_required';
  end if;

  insert into public.sq_cases (
    case_type, status, customer_name, customer_age, phone, line_id,
    appointment_date, appointment_time, treatment_main, treatment_detail,
    doctor, branch, channel, seller_name, owner_bc_name,
    discussion_start_date, closed_date, note,
    dup_key, idempotency_key, force_reason, created_by
  ) values (
    p_case_type, 'open',
    btrim(p_payload->>'customer_name'),
    nullif(p_payload->>'customer_age', '')::int,
    nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
    nullif(btrim(coalesce(p_payload->>'line_id', '')), ''),
    nullif(p_payload->>'appointment_date', '')::date,
    nullif(p_payload->>'appointment_time', '')::time,
    nullif(btrim(coalesce(p_payload->>'treatment_main', '')), ''),
    nullif(btrim(coalesce(p_payload->>'treatment_detail', '')), ''),
    nullif(btrim(coalesce(p_payload->>'doctor', '')), ''),
    nullif(btrim(coalesce(p_payload->>'branch', '')), ''),
    nullif(btrim(coalesce(p_payload->>'channel', '')), ''),
    nullif(btrim(coalesce(p_payload->>'seller_name', '')), ''),
    nullif(btrim(coalesce(p_payload->>'owner_bc_name', '')), ''),
    nullif(p_payload->>'discussion_start_date', '')::date,
    nullif(p_payload->>'closed_date', '')::date,
    nullif(btrim(coalesce(p_payload->>'note', '')), ''),
    v_dup_key,
    p_idempotency_key,
    case when coalesce(p_force, false) then btrim(p_force_reason) end,
    auth.uid()
  ) returning * into v_case;

  -- เฉพาะเคส Online เท่านั้นที่เข้าคิวอัตโนมัติ (§9)
  if p_case_type = 'online' then
    select p.member_id, p.weight, p.rank_snapshot, p.daily_ratio, p.monthly_ratio
      into v_member_id, v_weight, v_rank, v_daily, v_monthly
    from public.sq_pick_member() p;

    select coalesce(max(a.seq_today), 0) + 1 into v_seq
    from public.sq_assignments a
    where a.assigned_date = public.sq_today();

    if v_member_id is null then
      update public.sq_cases set status = 'pending_manual_assignment' where id = v_case.id;
      insert into public.sq_assignments (
        case_id, member_id, status, quota_consumed, seq_today, created_by
      ) values (
        v_case.id, null, 'pending_manual_assignment', false, v_seq, auth.uid()
      ) returning * into v_assignment;
    else
      insert into public.sq_assignments (
        case_id, member_id, status, rank_snapshot, weight_snapshot,
        daily_ratio, monthly_ratio, seq_today, created_by
      ) values (
        v_case.id, v_member_id, 'assigned', v_rank, v_weight,
        v_daily, v_monthly, v_seq, auth.uid()
      ) returning * into v_assignment;

      select display_name into v_member_name from public.sq_members where id = v_member_id;
    end if;
  end if;

  perform public.sq_audit(
    'case.create', 'case', v_case.id,
    case when coalesce(p_force, false) then btrim(p_force_reason) end,
    jsonb_build_object(
      'case_no', v_case.case_no,
      'case_type', p_case_type,
      'assigned_member_id', v_assignment.member_id,
      'weight', v_assignment.weight_snapshot,
      'forced', coalesce(p_force, false)
    )
  );

  return jsonb_build_object(
    'status', 'created',
    'case_id', v_case.id,
    'case_no', v_case.case_no,
    'case_type', p_case_type,
    'assignment_id', v_assignment.id,
    'assignment_status', v_assignment.status,
    'member_id', v_assignment.member_id,
    'member_name', v_member_name,
    'rank', v_assignment.rank_snapshot,
    'weight', v_assignment.weight_snapshot,
    'seq_today', v_assignment.seq_today
  );
end;
$$;

-- ฟังก์ชันที่สร้างใหม่จะได้ EXECUTE ของ public กลับมาตาม default ของ Postgres
-- ต้องปิดซ้ำให้เหมือนเดิม (เหตุผลเดียวกับ 0002)
revoke all on function public.sq_create_case(jsonb, text, text, boolean, text)
  from public, anon;
grant execute on function public.sq_create_case(jsonb, text, text, boolean, text)
  to authenticated;

-- 4. ตารางที่ไม่มีใครอ่านแล้ว
drop table if exists public.sq_deliveries;
drop table if exists public.sq_case_raw;
