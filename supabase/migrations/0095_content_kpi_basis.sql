-- 0095: KPI คอนเทนต์ — เลือก "ฐานการนับ" ของแต่ละกติกาได้ (ผู้ใช้ 2026-08-29)
-- ปัญหาเดิม: ระบบนับผลงานจาก "การ์ด creative ที่ตัวเองเป็นผู้รับผิดชอบ" อย่างเดียว
-- แต่ content บางคนทำหน้าที่ brief อย่างเดียว (ไม่มีการ์ด creative ของตัวเอง) KPI จึงเป็น 0 ตลอด
--   work   = การ์ดชิ้นงานที่ตัวเองรับผิดชอบ นับตอนกดส่งตรวจ (พฤติกรรมเดิม = ค่า default)
--   brief  = การ์ด Brief ที่ตัวเองสั่ง นับตอนมีคนกด "รับงาน" (brief_accepted_at)
--   posted = งานที่ตัวเองต้องเป็นคนโพส นับตอนกด "โพสแล้ว" (posted_at)
--            เจ้าของคิวโพส = ผู้สั่ง brief ถ้าการ์ดมาจาก brief (brief_source_id → created_by)
--            ไม่งั้นเป็นผู้รับผิดชอบการ์ด (คนที่ตัดเอง/สร้างการ์ดเองต้องโพสเอง)
alter table public.content_kpis
  add column if not exists basis text not null default 'work'
    check (basis in ('work', 'brief', 'posted'));

-- หมวดเนื้อหาที่ผู้ใช้ยกตัวอย่างไว้ตอนสั่งงานนี้ ("สวย หมอ before/after") แต่ยังไม่มีในทะเบียน
-- เพิ่มให้เฉพาะเมื่อยังไม่มีชื่อนี้ — ทีมกดซ่อน/ลบเองได้จากหน้าตั้งค่า KPI
insert into public.content_categories (name, position)
select 'Before/After', coalesce((select max(position) from public.content_categories), 0) + 1
where not exists (
  select 1 from public.content_categories where lower(name) = lower('Before/After')
);

notify pgrst, 'reload schema';
