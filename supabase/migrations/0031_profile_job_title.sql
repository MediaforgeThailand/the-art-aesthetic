-- 0031: ตำแหน่งงานของผู้ใช้ (เลือกได้ ไม่บังคับ) — Graphic/Editor | Content | Marketer | null
alter table public.profiles add column if not exists job_title text;
