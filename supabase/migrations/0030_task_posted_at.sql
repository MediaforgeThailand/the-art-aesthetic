-- 0030: สถานะ "ใช้งานแล้ว / โพสแล้ว" ของงานที่เสร็จ — null = ยังไม่โพส, มีค่า = โพส/ใช้แล้ว
alter table public.tasks add column if not exists posted_at timestamptz;
