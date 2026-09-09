-- 0105: รูปภาพหลายรูปต่อ "เคส" (ผู้ใช้ 2026-09-02) — แยกจาก influ_profile_photos (0082)
-- ซึ่งเป็นรูปของ "ตัวบุคคล" (แก้ที่โมดัลโปรไฟล์) ส่วนตารางนี้เป็นรูปที่แนบตอนกรอก
-- "รายละเอียดเคส" (แท็บ CaseDetailStage) — 2 ชนิด kind='photo' (รูป Influencer)
-- และ kind='channel' (รูปช่องทาง/สกรีนช็อตยอดผู้ติดตาม) แยกกันต่อเคส
--
-- รูปแรก (position ต่ำสุด) ของแต่ละ kind = รูปหน้าปก — ฝั่งแอป sync ลง
-- influencers.photo_path / channel_photo_path เสมอ (consumer เดิมทั้งหมดอ่าน 2 คอลัมน์นี้
-- อยู่แล้ว: การ์ดบอร์ด, sidebar โปรไฟล์, หัวเอกสารภาพรวม, copy รูปตอนเปิดรอบใหม่ ฯลฯ)
-- ไฟล์อยู่ที่ documents/influencers/{influencer_id}/ เหมือนเดิม (โฟลเดอร์เดียวกับที่
-- photo_path/channel_photo_path ใช้อยู่แล้ว)

create table public.influ_case_photos (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  kind text not null check (kind in ('photo', 'channel')),
  file_path text not null,
  file_name text,
  position double precision not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.influ_case_photos enable row level security;
create policy "authenticated all influ_case_photos"
  on public.influ_case_photos for all to authenticated
  using (true) with check (true);

create index influ_case_photos_case_idx
  on public.influ_case_photos (influencer_id, kind, position);

-- backfill: เคสที่มีรูปเดี่ยวอยู่แล้ว (จากฟีเจอร์เดิม) ให้เป็นรูปแรกของแกลเลอรีทันที
-- จะได้เห็นรูปเดิมในแท็บรายละเอียดเคสต่อโดยไม่ต้องอัพใหม่
insert into public.influ_case_photos (influencer_id, kind, file_path, position)
select id, 'photo', photo_path, 1
from public.influencers
where photo_path is not null;

insert into public.influ_case_photos (influencer_id, kind, file_path, position)
select id, 'channel', channel_photo_path, 1
from public.influencers
where channel_photo_path is not null;
