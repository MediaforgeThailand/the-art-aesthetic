-- ============================================================
-- 0072 — My List: ตัวเลือกที่ผู้ใช้เพิ่มเอง (สถานะ / ความสำคัญ) แบบ label ของ Monday
--
-- เดิมช่อง "สถานะ" เลือกได้แค่ ยังไม่เสร็จ/เสร็จแล้ว (คำนวณจาก done + due_date) และ
-- "ความสำคัญ" ตายตัว 4 ระดับ — ผู้ใช้ต้องการกดเพิ่มตัวเลือกเองได้เหมือน Monday
-- (เช่น "กำลังทำ", "ติดปัญหา", "รอคนอื่น" / "ไว้ก่อนก็ได้")
--
-- ออกแบบเป็น "ชั้นเสริม" ไม่ใช่การรื้อของเดิม:
--   * ตัวเลือกในตัวยังอยู่ครบ — งานที่ไม่ได้เลือกตัวเลือกที่เพิ่มเอง (status_id/priority_id
--     เป็น null) ทำงานเหมือนเดิมทุกประการ ไม่ต้อง backfill แถวเก่า
--   * `done` ยังเป็นความจริงเรื่อง "งานเสร็จหรือยัง" เพียงแหล่งเดียว — สถานะที่เพิ่มเอง
--     คือสถานะ "ระหว่างทาง" (งานยังไม่เสร็จ) ตัวนับ/ตัวกรอง/ทริกเกอร์ done_at จึงไม่ต้องแก้
--     (ติ๊กเสร็จ = client ล้าง status_id ให้เอง ป้ายจะได้ไม่ค้างว่า "กำลังทำ" ทั้งที่จบแล้ว)
--   * `priority` ยังอยู่ครบ — ความสำคัญที่เพิ่มเองเรียงต่อท้าย 4 ระดับเดิม
--
-- ตารางเดียวคุมทั้งสองชนิดผ่าน `kind` (โครงเหมือนกันเป๊ะ: ชื่อ+สี+ลำดับ) แนวเดียวกับ
-- list_groups/list_tags (0060/0061/0067): เป็นของรายคน, color = key ของ LIST_TAG_COLORS
-- ที่จงใจไม่มี check constraint (เพิ่มสีใหม่ได้โดยไม่ต้อง migrate), ลบตัวเลือก = งานไม่หาย
-- แค่ตกกลับไปใช้ค่าในตัว (FK SET NULL)
-- ============================================================

create table if not exists public.list_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('status', 'priority')),
  name text not null,
  color text not null default 'brand',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.list_options is
  'ตัวเลือกที่ผู้ใช้เพิ่มเองให้ dropdown ของ My List — kind=status (สถานะระหว่างทาง) / priority (ความสำคัญเพิ่มเติม)';
comment on column public.list_options.kind is
  'ชนิดของ dropdown ที่ตัวเลือกนี้อยู่ — status | priority (ชนิดใหม่ต้องแก้ check constraint + ListOptionKind)';
comment on column public.list_options.color is
  'key ของชุดสีใน LIST_TAG_COLORS (constants.ts) — ไม่มี check ให้เพิ่มสีได้โดยไม่ migrate';

create index if not exists list_options_owner_kind_idx
  on public.list_options (owner_id, kind, position);

-- งานชี้ตัวเลือกที่เพิ่มเอง — null = ใช้ค่าในตัว (สถานะคำนวณจาก done+due_date / priority เดิม)
alter table public.list_tasks
  add column if not exists status_id uuid references public.list_options(id) on delete set null;

alter table public.list_tasks
  add column if not exists priority_id uuid references public.list_options(id) on delete set null;

comment on column public.list_tasks.status_id is
  'สถานะที่ผู้ใช้เพิ่มเอง (list_options kind=status) — null = ใช้สถานะคำนวณจาก done + due_date';
comment on column public.list_tasks.priority_id is
  'ความสำคัญที่ผู้ใช้เพิ่มเอง (list_options kind=priority) — null = ใช้คอลัมน์ priority ตามเดิม';

create index if not exists list_tasks_status_option_idx
  on public.list_tasks (status_id);

create index if not exists list_tasks_priority_option_idx
  on public.list_tasks (priority_id);

-- ---------- helper ของ policy (schema private ตามแนว 0061) ----------
-- ตัวเลือกของคนอื่นมองเห็นได้เฉพาะเมื่อมันติดอยู่บนงานที่ถูกแชร์มาให้เรา (ไม่งั้นช่องสถานะ
-- ของงานที่แชร์มาจะกลายเป็นป้ายว่างเปล่า) — SECURITY DEFINER เพื่อไม่ปลุก policy ของ
-- list_tasks/list_task_shares ซ้อนกันจนวนไม่รู้จบ
create or replace function private.list_option_shared_with_me(p_option uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.list_tasks t
    join public.list_task_shares s on s.task_id = t.id
    where (t.status_id = p_option or t.priority_id = p_option)
      and s.profile_id = (select auth.uid())
  );
$$;

revoke execute on function private.list_option_shared_with_me(uuid) from public, anon;
grant execute on function private.list_option_shared_with_me(uuid) to authenticated;

-- ---------- RLS (แนวเดียวกับ list_groups: เจ้าของจัดการเต็ม / คนถูกแชร์อ่านอย่างเดียว) ----------
alter table public.list_options enable row level security;

drop policy if exists "read own or shared list_options" on public.list_options;
create policy "read own or shared list_options"
  on public.list_options for select to authenticated
  using (
    owner_id = (select auth.uid())
    or private.list_option_shared_with_me(id)
  );

drop policy if exists "insert own list_options" on public.list_options;
create policy "insert own list_options"
  on public.list_options for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "update own list_options" on public.list_options;
create policy "update own list_options"
  on public.list_options for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "delete own list_options" on public.list_options;
create policy "delete own list_options"
  on public.list_options for delete to authenticated
  using (owner_id = (select auth.uid()));

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตาราง/คอลัมน์ใหม่ไม่เจอ
notify pgrst, 'reload schema';
