-- ============================================================
-- 0067 — My List: หมวดหมู่ที่ผู้ใช้ตั้งเอง (list_groups) แบบกลุ่มของบอร์ด Monday
--
-- เดิมหัวข้อใหญ่ของ /my-tasks เป็น "กลุ่มคำนวณจากข้อมูล" (สถานะ/ความสำคัญ/แท็ก/กำหนดส่ง)
-- ผู้ใช้ต้องการหมวดใหญ่ที่ตั้งชื่อ/เพิ่ม/ลบ/เรียงเองได้ (สถานะเป็นค่าประจำงานอยู่แล้ว
-- ผ่าน dropdown ในคอลัมน์สถานะ) — จึงเพิ่มตารางหมวด + คอลัมน์ group_id ที่ list_tasks
--
-- ออกแบบตามแนวเดียวกับ list_tags (0060/0061):
--   * หมวดเป็นของรายคน (owner_id) — ลิสต์ส่วนตัว ไม่ใช่หมวดกลางของแผนก
--   * color = key ของชุดสี LIST_TAG_COLORS ใน constants.ts — จงใจไม่มี check constraint
--     (เพิ่มสีใหม่ได้โดยไม่ต้อง migrate, ค่าที่ไม่รู้จัก fallback เป็น brand ฝั่ง client)
--   * position = ลำดับหมวดบนบอร์ด (float กึ่งกลางเพื่อนบ้าน แบบเดียวกับ list_tasks.position)
--   * ลบหมวด = งานในหมวดไม่หาย แค่ตกกลับไปกลุ่ม "ยังไม่จัดหมวดหมู่" (FK SET NULL)
--   * ไม่บังคับชื่อ unique — ตั้งชื่อซ้ำได้แบบ Monday (แท็ก unique เพราะใช้ค้น/กรอง ต่างกัน)
-- ============================================================

create table if not exists public.list_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text not null default 'brand',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.list_groups is
  'หมวดหมู่ของ My List (หัวข้อใหญ่บนบอร์ด /my-tasks) — ผู้ใช้ตั้งเองรายคนแบบกลุ่มของ Monday';
comment on column public.list_groups.color is
  'key ของชุดสีใน LIST_TAG_COLORS (constants.ts) — ไม่มี check ให้เพิ่มสีได้โดยไม่ migrate';

create index if not exists list_groups_owner_position_idx
  on public.list_groups (owner_id, position);

-- งานชี้หมวดของตัวเอง — null = ยังไม่จัดหมวด (แสดงในกลุ่มสำรองท้ายบอร์ด)
alter table public.list_tasks
  add column if not exists group_id uuid references public.list_groups(id) on delete set null;

comment on column public.list_tasks.group_id is
  'หมวดหมู่ (list_groups) ที่งานอยู่ — null = ยังไม่จัดหมวด; ลบหมวดแล้ว DB ตั้ง null ให้เอง';

create index if not exists list_tasks_group_idx
  on public.list_tasks (group_id);

-- ---------- helper ของ policy (schema private ตามแนว 0061) ----------
-- หมวดของคนอื่นมองเห็นได้เฉพาะเมื่อมันติดอยู่บนงานที่ถูกแชร์มาให้เรา
-- (ไม่งั้นหัวกลุ่มบนงานที่แชร์มาจะกลายเป็นชื่อว่างเปล่า) — SECURITY DEFINER
-- เพื่อไม่ปลุก policy ของ list_tasks/list_task_shares ซ้อนจนวนไม่รู้จบ
create or replace function private.list_group_shared_with_me(p_group uuid)
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
    where t.group_id = p_group and s.profile_id = (select auth.uid())
  );
$$;

revoke execute on function private.list_group_shared_with_me(uuid) from public, anon;
grant execute on function private.list_group_shared_with_me(uuid) to authenticated;

-- ---------- RLS (แนวเดียวกับ list_tags: เจ้าของจัดการเต็ม / คนถูกแชร์อ่านอย่างเดียว) ----------
alter table public.list_groups enable row level security;

drop policy if exists "read own or shared list_groups" on public.list_groups;
create policy "read own or shared list_groups"
  on public.list_groups for select to authenticated
  using (
    owner_id = (select auth.uid())
    or private.list_group_shared_with_me(id)
  );

drop policy if exists "insert own list_groups" on public.list_groups;
create policy "insert own list_groups"
  on public.list_groups for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "update own list_groups" on public.list_groups;
create policy "update own list_groups"
  on public.list_groups for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "delete own list_groups" on public.list_groups;
create policy "delete own list_groups"
  on public.list_groups for delete to authenticated
  using (owner_id = (select auth.uid()));

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตาราง/คอลัมน์ใหม่ไม่เจอ
notify pgrst, 'reload schema';
