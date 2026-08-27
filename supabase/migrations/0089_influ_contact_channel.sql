-- 0089: ช่องทางการติดต่อของเคส (ชื่อกลุ่มไลน์ที่ใช้คุยกับ influ รอบนี้)
--
-- คนละก้อนกับ influ_profile_channels (ช่องทางระดับ "ตัวบุคคล" เช่น IG/TikTok ของคนนั้น)
-- และคนละก้อนกับ channel_photo_path (รูปสกรีนช็อตช่องทาง) — อันนี้คือ "คุยงานรอบนี้กันที่ไหน"
-- ซึ่งเปลี่ยนไปทุกรอบ จึงเก็บที่เคส ไม่ใช่ที่โปรไฟล์
--
-- nullable โดยตั้งใจ: influ_deleted_backups เก็บเคสเป็น jsonb แล้วกู้คืนด้วย jsonb_populate_record
-- คอลัมน์ NOT NULL ที่เพิ่มใหม่จะทำให้ backup เก่ากู้ไม่ขึ้น (บทเรียนจาก 0083)
alter table public.influencers
  add column if not exists contact_channel text;

comment on column public.influencers.contact_channel is
  'ช่องทางการติดต่อของเคสนี้ เช่น ชื่อกลุ่มไลน์ที่ใช้คุยกับ influ (ต่อรอบ ไม่ใช่ข้อมูลตัวบุคคล)';
