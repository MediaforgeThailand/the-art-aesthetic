-- ถังขยะของ Task — ปุ่มลบเปลี่ยนเป็น soft delete (ตั้ง deleted_at) เก็บกู้คืนได้ 14 วัน
-- งานที่เกิน 14 วันถูกลบถาวร (พร้อมไฟล์ใน storage) แบบ opportunistic ตอนเปิดหน้า Task
alter table public.tasks add column deleted_at timestamptz;

create index tasks_deleted_at_idx
  on public.tasks (deleted_at)
  where deleted_at is not null;
