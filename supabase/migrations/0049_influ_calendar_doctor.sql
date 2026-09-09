-- ชื่อแพทย์ที่รับเคสของคิวบนปฏิทิน Influ Calendar
-- (applied remotely as influ_calendar_doctor)
-- ค่าเริ่มต้นตอนเลือก influencer ในฟอร์ม = influencers.doctor_name ของเคสนั้น แต่แก้เป็นคนอื่นได้
alter table public.influ_calendar_events
  add column if not exists doctor_name text;

comment on column public.influ_calendar_events.doctor_name is
  'แพทย์ที่รับคิวนี้ (null = ยังไม่ระบุ) — เติมอัตโนมัติจาก influencers.doctor_name ตอนเลือก influencer';

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query คอลัมน์ใหม่ไม่เจอ
notify pgrst, 'reload schema';
