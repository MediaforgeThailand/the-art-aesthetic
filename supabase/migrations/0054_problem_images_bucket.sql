-- รูปหัวข้อปัญหาของ sales assistant (the-art-sales-assistant) เก็บกลางใน Storage
-- ทีมอัพโหลดจากแอปเครื่องไหนก็ได้ ทุก iPad เห็นรูปเดียวกันผ่าน content sync
-- path ตายตัวต่อหัวข้อ: problems/<problem_id>.jpg — อัพซ้ำ = แทนที่รูปเดิม
--
-- แอปอัพโหลดด้วย anon key (PWA ไม่มีระบบ login) จึงจำกัด policy ไว้เฉพาะ bucket นี้
-- พร้อมเพดานขนาดไฟล์และชนิดรูปที่ยอมรับ
-- (applied 2026-08-06 via MCP as "problem_images_bucket")

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('problem-images', 'problem-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "problem images read" on storage.objects;
create policy "problem images read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'problem-images');

drop policy if exists "problem images upload" on storage.objects;
create policy "problem images upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'problem-images');

drop policy if exists "problem images replace" on storage.objects;
create policy "problem images replace" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'problem-images')
  with check (bucket_id = 'problem-images');

drop policy if exists "problem images delete" on storage.objects;
create policy "problem images delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'problem-images');
