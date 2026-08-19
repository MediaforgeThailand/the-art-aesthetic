-- 0082: รูปภาพหลายรูปต่อโปรไฟล์ influ (ผู้ใช้ 2026-08-19)
-- อัพได้หลายรูปต่อคนใน "เพิ่ม/แก้โปรไฟล์" — รูปแรก (position ต่ำสุด) = รูปหน้าปก
-- ฝั่งแอป sync รูปหน้าปกลง influ_profiles.photo_path เสมอ (consumer เดิมทั้งหมด
-- อ่าน photo_path อยู่แล้ว เช่นตอน copy รูปเข้าโฟลเดอร์เคสใหม่)
-- ไฟล์รูปที่อัพจากฟีเจอร์นี้อยู่ที่ documents/influ-profiles/{profile_id}/
-- (แถว backfill ยังชี้โฟลเดอร์เคสเดิม influencers/{caseId}/ — ลบแถวนั้นห้ามลบไฟล์
-- เพราะไฟล์เป็นของเคส ฝั่งแอปเช็ค prefix ก่อน remove)

create table public.influ_profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.influ_profiles(id) on delete cascade,
  file_path text not null,
  file_name text,
  position double precision not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.influ_profile_photos enable row level security;
create policy "authenticated all influ_profile_photos"
  on public.influ_profile_photos for all to authenticated
  using (true) with check (true);

create index influ_profile_photos_profile_idx
  on public.influ_profile_photos (profile_id, position);

-- backfill: โปรไฟล์ที่มีรูปอยู่แล้ว (photo_path จาก backfill 0080 ชี้ไฟล์ในโฟลเดอร์เคส)
-- ให้เป็นรูปแรกของแกลเลอรี — จะได้เห็นรูปเดิมในฟอร์มแก้โปรไฟล์ทันที
insert into public.influ_profile_photos (profile_id, file_path, position)
select id, photo_path, 1
from public.influ_profiles
where photo_path is not null;
