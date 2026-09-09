-- ============================================================
-- 0061 — ย้าย helper ของ policy My List ออกจาก schema public → private
--
-- ทำไม: ฟังก์ชันใน schema `public` ถูก PostgREST เปิดเป็น RPC ให้ทุกคนที่ล็อกอินเรียกได้
-- (/rest/v1/rpc/list_task_is_owner) — security advisor เตือนข้อ
-- 0029_authenticated_security_definer_function_executable
-- ตัวมันเองไม่ได้รั่วอะไร (ตอบแค่ "ผู้เรียกเองมีสิทธิ์กับ id นี้ไหม" เพราะ where ผูก auth.uid()
-- ตลอด) แต่ไม่มีเหตุผลให้เปิดเป็น endpoint สาธารณะ — ย้ายไป schema ที่ไม่ได้ถูก expose
-- คือทางที่ Supabase แนะนำสำหรับ helper ของ RLS
--
-- ยัง SECURITY DEFINER เหมือนเดิม เพราะจุดประสงค์คือตัดวงจร policy เรียกกันเอง:
-- policy ของ list_tasks ต้องดู list_task_shares และ policy ของ list_task_shares ต้องดู
-- list_tasks — ถ้าอ่านตรงๆ จะ recursive ไม่รู้จบ
--
-- self-host: เป็น SQL มาตรฐานล้วน ไม่ต้องตั้งค่าอะไรเพิ่ม ขอแค่ PostgREST ยัง expose
-- เฉพาะ schema public ตามค่าเริ่มต้น (ถ้าไปเพิ่ม `private` เข้า db-schemas เมื่อไหร่
-- คำเตือนเดิมจะกลับมา)
-- ============================================================

create schema if not exists private;

comment on schema private is
  'ฟังก์ชันภายในที่ policy เรียกใช้ — ไม่ถูก expose ผ่าน PostgREST (ต่างจาก public)';

-- authenticated ต้องมี USAGE ของ schema + EXECUTE ของฟังก์ชัน เพราะ policy expression
-- ถูกประเมินด้วยสิทธิ์ของผู้ที่ยิง query ไม่ใช่สิทธิ์ของเจ้าของตาราง
grant usage on schema private to authenticated;

create or replace function private.list_task_is_owner(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.list_tasks t
    where t.id = p_task and t.owner_id = (select auth.uid())
  );
$$;

create or replace function private.list_task_shared_with_me(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.list_task_shares s
    where s.task_id = p_task and s.profile_id = (select auth.uid())
  );
$$;

create or replace function private.list_tag_shared_with_me(p_tag uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.list_task_tags tt
    join public.list_task_shares s on s.task_id = tt.task_id
    where tt.tag_id = p_tag and s.profile_id = (select auth.uid())
  );
$$;

revoke execute on function private.list_task_is_owner(uuid) from public, anon;
revoke execute on function private.list_task_shared_with_me(uuid) from public, anon;
revoke execute on function private.list_tag_shared_with_me(uuid) from public, anon;
grant execute on function private.list_task_is_owner(uuid) to authenticated;
grant execute on function private.list_task_shared_with_me(uuid) to authenticated;
grant execute on function private.list_tag_shared_with_me(uuid) to authenticated;

-- ---------- ผูก policy เข้ากับ helper ตัวใหม่ (เนื้อหาเงื่อนไขเหมือนเดิมทุกข้อ) ----------

drop policy if exists "read own or shared list_tasks" on public.list_tasks;
create policy "read own or shared list_tasks"
  on public.list_tasks for select to authenticated
  using (
    owner_id = (select auth.uid())
    or private.list_task_shared_with_me(id)
  );

drop policy if exists "read own or shared list_tags" on public.list_tags;
create policy "read own or shared list_tags"
  on public.list_tags for select to authenticated
  using (
    owner_id = (select auth.uid())
    or private.list_tag_shared_with_me(id)
  );

drop policy if exists "read visible list_task_tags" on public.list_task_tags;
create policy "read visible list_task_tags"
  on public.list_task_tags for select to authenticated
  using (
    private.list_task_is_owner(task_id)
    or private.list_task_shared_with_me(task_id)
  );

drop policy if exists "insert own list_task_tags" on public.list_task_tags;
create policy "insert own list_task_tags"
  on public.list_task_tags for insert to authenticated
  with check (private.list_task_is_owner(task_id));

drop policy if exists "delete own list_task_tags" on public.list_task_tags;
create policy "delete own list_task_tags"
  on public.list_task_tags for delete to authenticated
  using (private.list_task_is_owner(task_id));

drop policy if exists "read own list_task_shares" on public.list_task_shares;
create policy "read own list_task_shares"
  on public.list_task_shares for select to authenticated
  using (
    profile_id = (select auth.uid())
    or private.list_task_is_owner(task_id)
  );

drop policy if exists "insert list_task_shares as owner" on public.list_task_shares;
create policy "insert list_task_shares as owner"
  on public.list_task_shares for insert to authenticated
  with check (private.list_task_is_owner(task_id));

drop policy if exists "update list_task_shares as owner" on public.list_task_shares;
create policy "update list_task_shares as owner"
  on public.list_task_shares for update to authenticated
  using (private.list_task_is_owner(task_id))
  with check (private.list_task_is_owner(task_id));

drop policy if exists "delete list_task_shares as owner" on public.list_task_shares;
create policy "delete list_task_shares as owner"
  on public.list_task_shares for delete to authenticated
  using (private.list_task_is_owner(task_id));

-- ตัวเก่าใน public ไม่มี policy อ้างถึงแล้ว
drop function if exists public.list_task_is_owner(uuid);
drop function if exists public.list_task_shared_with_me(uuid);
drop function if exists public.list_tag_shared_with_me(uuid);

notify pgrst, 'reload schema';
