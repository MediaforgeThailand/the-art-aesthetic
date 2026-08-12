-- ============================================================
-- 0070 — My List: ไฟล์แนบต่อรายการ (เก็บวิดีโอ/รูป/ไอเดียของงานตัวเอง)
--
-- คนละชุดกับไฟล์ของบอร์ดทีม (task_files / task_subtask_files / ไฟล์ในแชท) ซึ่งถูกรวม
-- ไว้ในคลัง All Media — ไฟล์ของ My List เป็นของส่วนตัวรายคน จึงไม่เข้าคลังรวมนั้น
--
-- ไฟล์จริงอยู่ใน storage bucket `documents` path `my-tasks/{task_id}/...`
-- แถวนี้เก็บแค่ path + ชื่อไฟล์เดิม (แบบเดียวกับ task_files)
-- ลบงาน = แถวนี้ถูก CASCADE ตามไป แต่ "ไฟล์ใน storage ไม่ถูกลบเอง" — client เก็บกวาด
-- ให้ (best effort) เหมือน cleanupTaskStorage ของบอร์ดทีม
--
-- RLS ยึดเจ้าของงานผ่าน helper ใน schema private เหมือน list_task_tags (0060/0061):
-- ห้ามอ่านตาราง list_tasks ตรงๆ ใน policy เพราะ policy ของสองตารางจะเรียกกันวนไม่จบ
-- ============================================================

create table if not exists public.list_task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.list_tasks(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.list_task_files is
  'ไฟล์แนบของงานใน My List (วิดีโอ/รูป/ไอเดีย) — ไฟล์จริงอยู่ใน bucket documents path my-tasks/{task_id}/';

create index if not exists list_task_files_task_idx
  on public.list_task_files (task_id);

alter table public.list_task_files enable row level security;

-- เห็นไฟล์ตามสิทธิ์ของงาน (เจ้าของ หรือ งานที่ถูกแชร์มา) / อัพ-ลบได้เฉพาะเจ้าของงาน
drop policy if exists "read visible list_task_files" on public.list_task_files;
create policy "read visible list_task_files"
  on public.list_task_files for select to authenticated
  using (
    private.list_task_is_owner(task_id)
    or private.list_task_shared_with_me(task_id)
  );

drop policy if exists "insert own list_task_files" on public.list_task_files;
create policy "insert own list_task_files"
  on public.list_task_files for insert to authenticated
  with check (private.list_task_is_owner(task_id));

drop policy if exists "delete own list_task_files" on public.list_task_files;
create policy "delete own list_task_files"
  on public.list_task_files for delete to authenticated
  using (private.list_task_is_owner(task_id));

notify pgrst, 'reload schema';
