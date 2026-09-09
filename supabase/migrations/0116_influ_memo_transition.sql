-- ============================================================
-- 0116 — ขั้นย่อยของ Memo ย้ายไปเป็น state machine ตัวเดียวใน DB (RPC influ_memo_transition)
--
-- ผู้ใช้ 2026-09-08: "หน้ากรอกรายละเอียดเคสต้องเป็น 1.0 · กดยืนยันในหน้านั้น = เข้า 1.1
-- (พร้อมทำ Memo) · 1.1 คือหน้าที่มีให้ก๊อปข้อมูลไปทำ Memo · ทำแล้วเป็น 1.2 รออนุมัติ ·
-- อนุมัติแล้วค่อยไป 2 เซนสัญญา — และเตรียมไว้ว่าอนาคต 1.1/1.2 จะถูกทำโดย API แทน"
--
-- ความหมายของคอลัมน์ (คอลัมน์เดิมทั้งหมด — ไม่มีการย้ายข้อมูล):
--   1.0 กรอกรายละเอียดเคส   docs_sent_at is null
--   1.1 พร้อมทำ Memo         docs_sent_at != null and memo_submitted_at is null
--   1.2 รออนุมัติ Memo        memo_submitted_at != null and memo_file_path is null
--   ผ่านขั้น Memo             memo_file_path != null (stage 2)
-- docs_sent_at เดิม (0104) = "ผู้ดูแลยืนยันส่งเรื่องขอ Memo" — เป็นเหตุการณ์เดียวกันกับ
-- "ยืนยันว่ารายละเอียดเคสครบ พร้อมให้ผู้ออก Memo ทำต่อ" เปลี่ยนแค่ชื่อ + ที่กด (จากการ์ดใน
-- แท็บ Memo ไปเป็นปุ่ม "ถัดไป" ท้ายแท็บรายละเอียดเคส) ⇒ แถวเดิมอ่านด้วยกติกาใหม่ได้ตรงตัว
-- (ต่างจากบทเรียน 0104 ที่ความหมายเปลี่ยนแล้วไม่ย้ายข้อมูล)
--
-- ทำไมต้องเป็น RPC: ทุกทางที่เปลี่ยนขั้นย่อย (ปุ่มในแอปวันนี้ / API ของ E-document ในอนาคต)
-- ต้องผ่านฟังก์ชันเดียวกัน — เช็คลำดับขั้น + เขียน influ_activity_log ในที่เดียว ไม่ต้องให้
-- ฝั่ง client หรือระบบนอกจำกติกาว่าคอลัมน์ไหนต้องตั้ง/ล้างพร้อมกัน
--   confirm_details : 1.0 → 1.1   (ผู้ดูแลกด "ถัดไป" ท้ายรายละเอียดเคส)
--   undo_details    : 1.1 → 1.0
--   submit_memo     : 1.1 → 1.2   (ผู้ออก Memo ทำเอกสารส่งขออนุมัติแล้ว — จุดที่ API จะมาแทน)
--   undo_submit     : 1.2 → 1.1
--   approve         : → มีไฟล์ Memo ที่อนุมัติแล้ว (+ เลื่อนเข้า stage 2 ถ้ายังอยู่ขั้น Memo)
--                     ไฟล์ต้องถูกอัพเข้า Storage ก่อน แล้วส่ง path/ชื่อมา — เติม 1.0/1.1 ที่ยัง
--                     ว่างให้ครบ (ไฟล์อนุมัติคือหลักฐานว่าผ่านมาแล้วจริง) และคืน path ไฟล์เดิม
--                     ให้ผู้เรียกลบออกจาก Storage เอง (Storage ไม่อยู่ใน transaction)
-- คืน jsonb { step: '1.0'|'1.1'|'1.2', stage, advanced, previous_file_path }
--
-- สิทธิ์: คนล็อกอินต้องแก้ไขเคส Influ ได้ (private.influ_can_edit) — service role (API/edge
-- function) เรียกได้โดยไม่มี auth.uid() และส่ง p_actor_name เป็นชื่อระบบที่ทำแทน
-- การ gate ว่า "ต้องเป็นผู้ออก Memo เท่านั้น" ยังอยู่ที่ UI ตามเดิม (RLS ของระบบนี้เป็น
-- authenticated ทั้งฐานอยู่แล้ว — ดู AGENTS.md); แจ้งเตือน (influ_notifications) ยังยิงจาก
-- client เพราะระดับ "ต้องลงมือ/อัพเดท" คิดจากบทบาทใน TS (buildInfluNotifications)
-- ============================================================

create or replace function public.influ_memo_transition(
  p_id uuid,
  p_action text,
  p_file_path text default null,
  p_file_name text default null,
  p_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_row public.influencers%rowtype;
  v_now timestamptz := now();
  v_prev_file text;
  v_advanced boolean := false;
  v_step text;
  v_summary text;
  v_log_action text := 'status';
  v_case_name text;
begin
  if v_actor is null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if v_actor is not null and not private.influ_can_edit(v_actor) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์แก้ไขเคส Influencer';
  end if;

  -- ล็อกแถว = สองคนกดพร้อมกัน (หรือ API กับคน) ไม่ทับกันเงียบๆ
  select * into v_row from public.influencers where id = p_id for update;
  if not found then
    raise exception 'ไม่พบเคส (อาจถูกลบไปแล้ว)';
  end if;
  if v_row.archived then
    raise exception 'เคสนี้ถูกเก็บถาวรแล้ว แก้ขั้นงานไม่ได้';
  end if;

  v_actor_name := coalesce(
    nullif(p_actor_name, ''),
    (select coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = v_actor),
    'ระบบ'
  );
  v_case_name := concat_ws(' ', v_row.first_name, v_row.last_name)
    || case when v_row.nickname is not null and v_row.nickname <> ''
         then ' (' || v_row.nickname || ')' else '' end;

  case p_action
    when 'confirm_details' then
      -- stage 1 = ขั้น Memo (INFLU_STAGE.memo ฝั่ง TS)
      if v_row.stage <> 1 or v_row.completed then
        raise exception 'เคสไม่ได้อยู่ขั้น Memo';
      end if;
      if v_row.docs_sent_at is not null then
        raise exception 'ยืนยันรายละเอียดเคสไปแล้ว';
      end if;
      update public.influencers set docs_sent_at = v_now where id = p_id;
      v_summary := 'ยืนยันรายละเอียดเคสครบ — พร้อมทำ Memo (ขั้น 1.0 → 1.1)';

    when 'undo_details' then
      if v_row.memo_file_path is not null then
        raise exception 'มีไฟล์ Memo ที่อนุมัติแล้ว ย้อนขั้นไม่ได้';
      end if;
      if v_row.docs_sent_at is null then
        raise exception 'เคสอยู่ขั้น 1.0 อยู่แล้ว';
      end if;
      update public.influencers
         set docs_sent_at = null, memo_submitted_at = null
       where id = p_id;
      v_summary := 'ย้อนกลับไปกรอกรายละเอียดเคส (ขั้น 1.0)';

    when 'submit_memo' then
      if v_row.docs_sent_at is null then
        raise exception 'ต้องยืนยันรายละเอียดเคส (ขั้น 1.0) ก่อน';
      end if;
      if v_row.memo_file_path is not null then
        raise exception 'เคสนี้มีไฟล์ Memo ที่อนุมัติแล้ว';
      end if;
      if v_row.memo_submitted_at is not null then
        raise exception 'ทำ Memo ส่งขออนุมัติไปแล้ว';
      end if;
      update public.influencers set memo_submitted_at = v_now where id = p_id;
      v_summary := 'ทำ Memo ส่งขออนุมัติแล้ว — รออนุมัติ (ขั้น 1.1 → 1.2)';

    when 'undo_submit' then
      if v_row.memo_file_path is not null then
        raise exception 'มีไฟล์ Memo ที่อนุมัติแล้ว ย้อนขั้นไม่ได้';
      end if;
      if v_row.memo_submitted_at is null then
        raise exception 'เคสอยู่ขั้น 1.1 อยู่แล้ว';
      end if;
      update public.influencers set memo_submitted_at = null where id = p_id;
      v_summary := 'ย้อนกลับมาทำ Memo ใหม่ (ขั้น 1.2 → 1.1)';

    when 'approve' then
      if p_file_path is null or p_file_path = '' then
        raise exception 'ต้องระบุไฟล์ Memo ที่อนุมัติแล้ว';
      end if;
      v_prev_file := v_row.memo_file_path;
      -- เคสที่เลยขั้น Memo ไปแล้วแค่มาเปลี่ยนไฟล์ ต้องไม่ถูกดึง stage ถอยหลัง (ผู้ใช้ 2026-08-07)
      v_advanced := (v_row.stage = 1 and not v_row.completed);
      update public.influencers
         set memo_file_path = p_file_path,
             memo_file_name = coalesce(nullif(p_file_name, ''), p_file_path),
             memo_uploaded_at = v_now,
             docs_sent_at = coalesce(docs_sent_at, v_now),
             memo_submitted_at = coalesce(memo_submitted_at, v_now),
             stage = case when v_advanced then 2 else stage end
       where id = p_id;
      v_log_action := 'upload';
      v_summary := (case when v_prev_file is null then 'อัปโหลด' else 'เปลี่ยน' end)
        || 'ไฟล์ Memo ที่อนุมัติแล้ว: ' || coalesce(nullif(p_file_name, ''), p_file_path)
        || case when v_advanced then ' — ผ่านขั้น Memo อัตโนมัติ → ขั้นสัญญา + วันรับบริการ' else '' end;

    else
      raise exception 'ไม่รู้จัก action ของขั้น Memo: %', p_action;
  end case;

  insert into public.influ_activity_log
    (actor_id, actor_name, action, entity, entity_id, influencer_id, influencer_name, summary, meta)
  values
    (v_actor, v_actor_name, v_log_action, 'influencer', p_id, p_id, v_case_name, v_summary,
     jsonb_build_object(
       'memo_action', p_action,
       'source', case when v_actor is null then 'api' else 'app' end
     ));

  select * into v_row from public.influencers where id = p_id;
  v_step := case
    when v_row.docs_sent_at is null then '1.0'
    when v_row.memo_submitted_at is null then '1.1'
    else '1.2'
  end;
  return jsonb_build_object(
    'step', v_step,
    'stage', v_row.stage,
    'advanced', v_advanced,
    'previous_file_path', v_prev_file
  );
end;
$fn$;

revoke execute on function public.influ_memo_transition(uuid, text, text, text, text) from public, anon;
grant execute on function public.influ_memo_transition(uuid, text, text, text, text) to authenticated, service_role;

comment on function public.influ_memo_transition(uuid, text, text, text, text) is
  'state machine ของขั้นย่อย Memo (1.0 → 1.1 → 1.2 → มีไฟล์อนุมัติ) — ทางเดียวที่ควรเปลี่ยน docs_sent_at / memo_submitted_at / memo_file_path ทั้งจากแอปและจาก API ภายนอก (service role ส่ง p_actor_name)';

comment on column public.influencers.docs_sent_at is
  'ขั้น 1.0 → 1.1: ผู้ดูแลยืนยันว่ารายละเอียดเคสครบ พร้อมให้ผู้ออก Memo ทำต่อ (ปุ่ม "ถัดไป" ท้ายแท็บรายละเอียดเคส — 2026-09-08; ก่อนหน้านั้น 0104 คือปุ่ม "ยืนยันส่งเรื่องขอ Memo" ในแท็บ Memo เหตุการณ์เดียวกัน) — เปลี่ยนผ่าน influ_memo_transition เท่านั้น';

comment on column public.influencers.memo_submitted_at is
  'ขั้น 1.1 → 1.2: ผู้ออก Memo (หรือ API) ทำเอกสาร Memo ส่งขออนุมัติแล้ว = รออนุมัติ; จบขั้น 1.2 เมื่อ memo_file_path มีค่า (action approve) — เปลี่ยนผ่าน influ_memo_transition เท่านั้น';
