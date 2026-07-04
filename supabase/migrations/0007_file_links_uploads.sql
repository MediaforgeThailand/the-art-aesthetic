-- คลังลิงก์ไฟล์รองรับ "อัปโหลดไฟล์" นอกจากลิงก์ — ไฟล์เก็บใน storage bucket documents
-- (applied remotely as file_links_uploads)
alter table public.file_links add column file_path text;
alter table public.file_links add column file_size bigint;
alter table public.file_links add column mime_type text;
