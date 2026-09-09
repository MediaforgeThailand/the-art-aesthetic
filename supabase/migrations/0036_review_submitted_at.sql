-- เวลาที่กด "ส่งตรวจงาน" — ใช้แสดง "รอมานานเท่าไร/ค้างอยู่ที่ใคร" ในแท็บรอตรวจ
-- (ตั้งตอน submit, ล้างตอน ยกเลิกส่งตรวจ/ตีกลับ/เปิดงานใหม่)
alter table public.tasks
  add column if not exists review_submitted_at timestamptz;

-- backfill งานที่กำลังรอตรวจอยู่ก่อนหน้า — ใช้ updated_at เป็นค่าประมาณ
update public.tasks
  set review_submitted_at = updated_at
  where review_status = 'pending' and review_submitted_at is null;
