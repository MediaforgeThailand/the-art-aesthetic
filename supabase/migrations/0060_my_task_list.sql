-- ============================================================
-- 0060 — My List: รายการงาน/โน้ตส่วนตัว (หน้า /my-tasks)
--
-- คนละเรื่องกับบอร์ดทีม `tasks` (ที่นั่นคืองานของแผนกที่ทุกคนเห็นและมี workflow ตรวจงาน)
-- ตารางชุดนี้เป็น "ลิสต์ของฉัน" — จดโน้ต/ตั้งงานให้ตัวเอง เห็นเฉพาะเจ้าของ
--
-- ออกแบบเผื่อ "แชร์ให้คนอื่นในอนาคต" ตั้งแต่วันแรก:
--   * owner_id = เจ้าของรายการ (ไม่ใช่ created_by) — ทุก policy ยึดคอลัมน์นี้
--   * list_task_shares = ตารางแชร์ (ยังไม่มี UI สร้างแถว → วันนี้ทุกอย่างจึงเป็นส่วนตัวจริง)
--     policy อ่านรองรับแล้ว: มีแถวแชร์เมื่อไหร่ คนนั้นเห็นรายการ+แท็กทันทีโดยไม่ต้อง migrate
--     ส่วน "แก้ไข" ยังจำกัดเจ้าของอย่างเดียว (คอลัมน์ can_edit เตรียมไว้ แต่ policy ยังไม่ใช้ —
--     เปิดทีหลังด้วยการแก้ policy update/delete ให้เรียก list_task_can_edit() เพิ่ม)
--   * visibility = ธงระดับรายการ ('private' | 'shared') ไว้ให้ UI อนาคตกรอง/แสดงสถานะ
--
-- RLS ที่นี่ "ไม่ใช่" แบบ authenticated เข้าถึงได้ทั้งหมดเหมือนตารางอื่นในระบบ —
-- เพราะเป็นข้อมูลส่วนตัวรายคน ต้องกันที่ชั้น DB ไม่ใช่แค่ซ่อนใน UI
-- ============================================================

-- ---------- รายการงาน ----------
create table if not exists public.list_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  -- โน้ต/รายละเอียดยาว (เปิดดูในแผงรายละเอียด)
  note text,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  done boolean not null default false,
  -- DB ตั้งให้เองจาก trigger (client ส่งมาก็ถูกทับ) — นาฬิกาเครื่องผู้ใช้เชื่อไม่ได้
  done_at timestamptz,
  -- ลำดับในลิสต์ (ลากเรียงเอง) — float กึ่งกลางเพื่อนบ้าน แบบเดียวกับบอร์ด Task/Influ
  position double precision not null default 0,
  visibility text not null default 'private'
    check (visibility in ('private', 'shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.list_tasks is
  'My List — งาน/โน้ตส่วนตัวรายคน (หน้า /my-tasks); owner_id = เจ้าของ, เห็นเฉพาะเจ้าของหรือคนที่มีแถวใน list_task_shares';
comment on column public.list_tasks.visibility is
  'ธงเผื่ออนาคต: private = ของฉันคนเดียว, shared = ตั้งใจแชร์ (รายชื่อคนอยู่ใน list_task_shares)';

create index if not exists list_tasks_owner_idx
  on public.list_tasks (owner_id);
-- ลิสต์เปิดมาเรียงตาม position เสมอ และมีการกรอง "เลยกำหนด/ใกล้ครบ" บ่อย
create index if not exists list_tasks_owner_position_idx
  on public.list_tasks (owner_id, position);
create index if not exists list_tasks_owner_due_idx
  on public.list_tasks (owner_id, due_date);

-- ---------- แท็กของแต่ละคน ----------
-- แท็กเป็นของเจ้าของลิสต์ (ไม่ใช่ของกลางทั้งระบบ) — ลิสต์ส่วนตัวของแต่ละคน
-- ใช้คำเรียกต่างกันได้ ไม่ต้องมาตกลงชื่อกลางกัน
create table if not exists public.list_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  -- key ของชุดสีใน src/lib/constants.ts (LIST_TAG_COLORS) — ตั้งใจไม่ผูก check constraint
  -- ไว้ ให้เพิ่มสีใหม่ได้โดยไม่ต้อง migrate (สีที่ระบบไม่รู้จักจะ fallback เป็น brand)
  color text not null default 'brand',
  created_at timestamptz not null default now()
);

comment on table public.list_tags is
  'แท็กของ My List — เป็นของรายคน (unique ที่ชื่อ + เจ้าของ, ไม่สนตัวพิมพ์ใหญ่เล็ก)';

create unique index if not exists list_tags_owner_name_key
  on public.list_tags (owner_id, lower(name));

-- ---------- แท็กที่ติดกับรายการ ----------
create table if not exists public.list_task_tags (
  task_id uuid not null references public.list_tasks(id) on delete cascade,
  tag_id uuid not null references public.list_tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create index if not exists list_task_tags_tag_idx
  on public.list_task_tags (tag_id);

-- ---------- การแชร์ (เตรียมไว้ให้อนาคต — ยังไม่มี UI สร้างแถว) ----------
create table if not exists public.list_task_shares (
  task_id uuid not null references public.list_tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- ยังไม่มีผลกับ policy (วันนี้แชร์ = อ่านอย่างเดียว) — เปิดใช้ตอนทำ UI แชร์
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

comment on table public.list_task_shares is
  'แชร์รายการ My List ให้คนอื่น (เตรียมโครงไว้ ยังไม่มี UI) — วันนี้ policy ให้สิทธิ์อ่านอย่างเดียว';

create index if not exists list_task_shares_profile_idx
  on public.list_task_shares (profile_id);

-- ---------- trigger ----------
create or replace trigger list_tasks_set_updated_at
  before update on public.list_tasks
  for each row execute function public.set_updated_at();

-- done_at ให้ DB ตั้ง/ล้างเอง (แบบเดียวกับ tasks_set_approved_at ใน 0021)
create or replace function public.list_tasks_set_done_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at = now();
  elsif not new.done then
    new.done_at = null;
  end if;
  return new;
end;
$$;

revoke execute on function public.list_tasks_set_done_at()
  from public, anon, authenticated;

create or replace trigger list_tasks_set_done_at
  before insert or update on public.list_tasks
  for each row execute function public.list_tasks_set_done_at();

-- ---------- helper ของ policy ----------
-- ทั้งหมดเป็น SECURITY DEFINER โดยจงใจ: policy ของ list_tasks ต้องดู list_task_shares และ
-- policy ของ list_task_shares ต้องดู list_tasks — ถ้าอ่านตรงๆ จะเรียก policy ของกันและกัน
-- วนไม่รู้จบ (infinite recursion) ฟังก์ชัน definer อ่านข้ามมาโดยไม่ปลุก policy อีกชั้น
-- ทั้งสามตัวเปิดเผยแค่ "ผู้เรียกเองมีสิทธิ์กับแถวนี้ไหม" จึงไม่รั่วข้อมูลของคนอื่น

create or replace function public.list_task_is_owner(p_task uuid)
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

create or replace function public.list_task_shared_with_me(p_task uuid)
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

-- แท็กของคนอื่นจะมองเห็นได้เฉพาะเมื่อมันติดอยู่บนรายการที่ถูกแชร์มาให้เรา
-- (ไม่งั้นชิปแท็กบนรายการที่แชร์มาจะกลายเป็นชื่อว่างเปล่า)
create or replace function public.list_tag_shared_with_me(p_tag uuid)
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

revoke execute on function public.list_task_is_owner(uuid) from public, anon;
revoke execute on function public.list_task_shared_with_me(uuid) from public, anon;
revoke execute on function public.list_tag_shared_with_me(uuid) from public, anon;
grant execute on function public.list_task_is_owner(uuid) to authenticated;
grant execute on function public.list_task_shared_with_me(uuid) to authenticated;
grant execute on function public.list_tag_shared_with_me(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.list_tasks enable row level security;
alter table public.list_tags enable row level security;
alter table public.list_task_tags enable row level security;
alter table public.list_task_shares enable row level security;

-- list_tasks: อ่านได้ถ้าเป็นเจ้าของหรือถูกแชร์ / เขียนได้เฉพาะเจ้าของ
drop policy if exists "read own or shared list_tasks" on public.list_tasks;
create policy "read own or shared list_tasks"
  on public.list_tasks for select to authenticated
  using (
    owner_id = (select auth.uid())
    or public.list_task_shared_with_me(id)
  );

drop policy if exists "insert own list_tasks" on public.list_tasks;
create policy "insert own list_tasks"
  on public.list_tasks for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "update own list_tasks" on public.list_tasks;
create policy "update own list_tasks"
  on public.list_tasks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "delete own list_tasks" on public.list_tasks;
create policy "delete own list_tasks"
  on public.list_tasks for delete to authenticated
  using (owner_id = (select auth.uid()));

-- list_tags: ของตัวเองจัดการได้เต็ม / แท็กบนรายการที่ถูกแชร์มา อ่านได้อย่างเดียว
drop policy if exists "read own or shared list_tags" on public.list_tags;
create policy "read own or shared list_tags"
  on public.list_tags for select to authenticated
  using (
    owner_id = (select auth.uid())
    or public.list_tag_shared_with_me(id)
  );

drop policy if exists "insert own list_tags" on public.list_tags;
create policy "insert own list_tags"
  on public.list_tags for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "update own list_tags" on public.list_tags;
create policy "update own list_tags"
  on public.list_tags for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "delete own list_tags" on public.list_tags;
create policy "delete own list_tags"
  on public.list_tags for delete to authenticated
  using (owner_id = (select auth.uid()));

-- list_task_tags: เห็นตามรายการ / ติด-ถอดแท็กได้เฉพาะเจ้าของรายการ
drop policy if exists "read visible list_task_tags" on public.list_task_tags;
create policy "read visible list_task_tags"
  on public.list_task_tags for select to authenticated
  using (
    public.list_task_is_owner(task_id)
    or public.list_task_shared_with_me(task_id)
  );

drop policy if exists "insert own list_task_tags" on public.list_task_tags;
create policy "insert own list_task_tags"
  on public.list_task_tags for insert to authenticated
  with check (public.list_task_is_owner(task_id));

drop policy if exists "delete own list_task_tags" on public.list_task_tags;
create policy "delete own list_task_tags"
  on public.list_task_tags for delete to authenticated
  using (public.list_task_is_owner(task_id));

-- list_task_shares: เจ้าของรายการจัดการรายชื่อ / คนที่ถูกแชร์เห็นแถวของตัวเอง
drop policy if exists "read own list_task_shares" on public.list_task_shares;
create policy "read own list_task_shares"
  on public.list_task_shares for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.list_task_is_owner(task_id)
  );

drop policy if exists "insert list_task_shares as owner" on public.list_task_shares;
create policy "insert list_task_shares as owner"
  on public.list_task_shares for insert to authenticated
  with check (public.list_task_is_owner(task_id));

drop policy if exists "update list_task_shares as owner" on public.list_task_shares;
create policy "update list_task_shares as owner"
  on public.list_task_shares for update to authenticated
  using (public.list_task_is_owner(task_id))
  with check (public.list_task_is_owner(task_id));

drop policy if exists "delete list_task_shares as owner" on public.list_task_shares;
create policy "delete list_task_shares as owner"
  on public.list_task_shares for delete to authenticated
  using (public.list_task_is_owner(task_id));

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตารางใหม่ไม่เจอ
notify pgrst, 'reload schema';
