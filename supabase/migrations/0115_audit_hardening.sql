-- 0115_audit_hardening.sql — FULL AUDIT 2026-09-08: แก้ตามผล Supabase advisors (security + performance)
--
-- (1) trigger function ที่เป็น SECURITY DEFINER ถูกเปิด EXECUTE ให้ anon/authenticated
--     (advisor: anon_security_definer_function_executable / authenticated_security_definer_function_executable)
--     trigger ยิงได้โดยไม่ต้องมี EXECUTE ของคนที่ทำ DML — ทดสอบแล้วแบบ rollback ก่อนเขียนไฟล์นี้:
--     revoke แล้ว insert notifications / influ_notifications / influ_profiles + update influencers
--     ในฐานะ role authenticated ผ่านหมด จึง revoke ได้โดยไม่กระทบแอป
--     ทำเฉพาะฟังก์ชันของระบบนี้ — promo_mirror_* เป็นของแอป Sales Assistant (ไม่อยู่ใน migration ชุดนี้)
--     และ RPC ที่ client เรียกจริง (influ_create_case, register_push_subscription, next_*_code ฯลฯ) คงไว้ตามเดิม
do $$
declare f text;
begin
  foreach f in array array[
    'influ_case_sync_code',
    'influ_notify_push',
    'influ_profile_code_fanout',
    'influ_profile_data_fanout',
    'influ_profile_set_code',
    'influ_recalc_case_value',
    'notify_push'
  ] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f and p.pronargs = 0
    ) then
      execute format('revoke execute on function public.%I() from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

-- (2) function_search_path_mutable: private.influ_normalize_scopes ใช้แต่ builtin — ล็อก search_path
alter function private.influ_normalize_scopes(text[]) set search_path = pg_catalog;

-- (3) auth_rls_initplan: ห่อ auth.uid() ด้วย (select ...) ให้ Postgres ประเมินครั้งเดียวต่อ query
--     แทนที่จะเรียกทุกแถว (policy เดิมของ 0095/0096/0107/0110 — ความหมายเหมือนเดิมทุกตัว)
alter policy "read own influ_notifications" on public.influ_notifications
  using (recipient_id = (select auth.uid()));
alter policy "update own influ_notifications" on public.influ_notifications
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
alter policy "delete own influ_notifications" on public.influ_notifications
  using (recipient_id = (select auth.uid()));
alter policy "own push subscriptions" on public.push_subscriptions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy "influ manage read backups" on public.influ_deleted_backups
  using (private.influ_can_manage((select auth.uid())));

-- (4) unindexed_foreign_keys: index ให้ FK ที่ถูก join/กรองจริง — tasks ตามผู้รับผิดชอบ/ผู้ตรวจ/ผู้สร้าง/
--     influ/brief ต้นทาง/หมวดเนื้อหา, คอมเมนต์ตามผู้เขียน, แจ้งเตือนตามงาน, หัตถการตามราคาอ้างอิง/โปร,
--     prospect → profile, เคสตามผู้สร้าง. FK ประเภท created_by บนตารางเล็ก และตารางของแอปอื่น (sa_*, sq_*)
--     ไม่แตะ (advisor เตือน 57 ตัว — ที่เหลือไม่มี query ไหนกรองด้วยคอลัมน์นั้น)
create index if not exists tasks_assignee_id_idx on public.tasks (assignee_id);
create index if not exists tasks_reviewer_id_idx on public.tasks (reviewer_id);
create index if not exists tasks_reviewer1b_id_idx on public.tasks (reviewer1b_id) where reviewer1b_id is not null;
create index if not exists tasks_reviewer2_id_idx on public.tasks (reviewer2_id) where reviewer2_id is not null;
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_influencer_id_idx on public.tasks (influencer_id) where influencer_id is not null;
create index if not exists tasks_brief_source_id_idx on public.tasks (brief_source_id) where brief_source_id is not null;
create index if not exists tasks_content_category_id_idx on public.tasks (content_category_id) where content_category_id is not null;
create index if not exists task_comments_author_id_idx on public.task_comments (author_id);
create index if not exists notifications_task_id_idx on public.notifications (task_id) where task_id is not null;
create index if not exists influ_procedure_items_price_item_idx on public.influ_procedure_items (price_item_id) where price_item_id is not null;
create index if not exists influ_procedure_items_promo_idx on public.influ_procedure_items (promo_package_id) where promo_package_id is not null;
create index if not exists influ_prospects_profile_id_idx on public.influ_prospects (profile_id) where profile_id is not null;
create index if not exists influencers_created_by_idx on public.influencers (created_by);
