-- 0029: รูปโปรไฟล์ผู้ใช้ — path ใน storage bucket documents (avatars/{uid}/...)
-- ผู้ใช้แก้เองได้ผ่าน policy "users can update own profile" เดิม (trigger กันเฉพาะ role/permissions)
alter table public.profiles add column if not exists avatar_path text;
