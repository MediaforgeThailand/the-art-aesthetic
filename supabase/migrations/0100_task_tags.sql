-- 0100 — แท็กบังคับของงานคอนเทนต์ (Tag Management, 2026-08-31)
--
-- ทีมคอนเทนต์ต้องติดแท็ก "หมอ" และ "influencer" ให้ทุกชิ้นงานก่อนส่งตรวจ เพื่อให้
-- ตามผลย้อนกลับได้ว่าคอนเทนต์ชิ้นไหนของหมอท่านใด/influ คนไหน (ต่อยอดจากระบบ
-- แฮชแท็กของเคส influ ใน 0093 ที่ใช้ดึงข้อมูลจาก Meta API)
--
-- * doctor_id  — แท็กหมอ อ้าง public.doctors (ทะเบียนเดียวกับระบบ influ)
-- * tags_set_at — เวลาที่ "ยืนยันแท็กครบแล้ว" (null = ยังไม่เคยยืนยัน → ถูกบังคับ
--   ให้เลือกตอนกดส่งตรวจ) เก็บแยกจาก doctor_id/influencer_id เพราะการตอบว่า
--   "ชิ้นงานนี้ไม่มีหมอ/ไม่มี influ" ก็ถือว่าติดแท็กแล้ว — ไม่งั้นจะถูกถามซ้ำทุกครั้ง

alter table public.tasks
  add column if not exists doctor_id uuid references public.doctors(id) on delete set null,
  add column if not exists tags_set_at timestamptz;

create index if not exists tasks_doctor_id_idx
  on public.tasks(doctor_id)
  where doctor_id is not null;

-- งานที่ส่งตรวจ/ตรวจผ่าน/โพสไปแล้วก่อนมีกติกานี้ ไม่ต้องถูกดึงกลับมาติดแท็กย้อนหลัง
-- (กติกามีผลกับการกดส่งตรวจครั้งถัดไป — แนวเดียวกับตอนบังคับลิงก์ Drive 2026-08-29)
update public.tasks
set tags_set_at = coalesce(review_submitted_at, approved_at, posted_at, updated_at)
where tags_set_at is null
  and (
    review_submitted_at is not null
    or approved_at is not null
    or posted_at is not null
  );
