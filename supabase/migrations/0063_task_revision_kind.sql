-- ตีกลับงาน 2 แบบ (คำสั่งผู้ใช้ 2026-08-08)
--   mistake  = "คำผิด"    — ความผิดพลาดของงาน นับเป็น KPI ข้อผิดพลาดรายคน
--   addition = "เพิ่มเติม" — ผู้ตรวจแนะนำให้ปรับเพื่อคุมคุณภาพ บันทึกไว้แต่ **ไม่นับเป็นข้อผิดพลาด**
-- ทั้งสองแบบดึงงานกลับเป็น "กำลังทำ" เหมือนกัน ต่างกันแค่การนับ KPI

alter table public.task_comments
  add column if not exists revision_kind text;

-- แถวเดิม: การตีกลับที่มีอยู่ทั้งหมดเกิดก่อนมีการแยกประเภท = ถือเป็น "คำผิด"
update public.task_comments
   set revision_kind = 'mistake'
 where is_revision = true
   and revision_kind is null;

-- คอมเมนต์ทั่วไป (is_revision = false) ต้องไม่มีประเภท — กันข้อมูลเพี้ยนตอนนับ KPI
alter table public.task_comments
  drop constraint if exists task_comments_revision_kind_valid;
alter table public.task_comments
  add constraint task_comments_revision_kind_valid check (
    (is_revision = true and revision_kind in ('mistake', 'addition'))
    or (is_revision = false and revision_kind is null)
  );

-- นับ KPI รายเดือนต่อคน = กรอง is_revision + revision_kind แล้ว join task
create index if not exists task_comments_revision_kind_idx
  on public.task_comments (revision_kind)
  where is_revision = true;
