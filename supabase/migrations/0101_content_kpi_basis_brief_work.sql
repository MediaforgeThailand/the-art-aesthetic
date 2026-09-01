-- ฐาน KPI ใหม่ 'brief_work' = ชิ้นงานที่ "รับมาจากใบ Brief ของคนอื่น" แล้วกดส่งตรวจแล้ว
-- (เจ้าของ = ผู้รับผิดชอบการ์ด; คนละฐานกับ 'brief' ซึ่งเป็นผลงานของผู้สั่ง Brief)
alter table public.content_kpis drop constraint if exists content_kpis_basis_check;
alter table public.content_kpis
  add constraint content_kpis_basis_check
  check (basis = any (array['work','brief_work','brief','posted']));
