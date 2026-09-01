-- 0102: เก็บกวาดร่องรอยของ migration 20260826083835 "0088_content_kpi_brief" ที่ไม่มีไฟล์ mirror ในรีโป
-- ของที่มันทิ้งไว้บน DB จริงคือ format='brief' (เคยเป็นวิธีบอกว่ากติกาแถวนั้นนับใบ Brief)
-- ซึ่งถูกแทนด้วยคอลัมน์ basis ตั้งแต่ 0095 แล้ว — ฝั่ง TypeScript มีแค่ 'image' | 'video'
-- ตอนรัน: content_kpis 7 แถว, format='brief' 0 แถว, tasks.content_format ไม่เคยถูกแตะ (image|video อยู่แล้ว)

alter table public.content_kpis drop constraint if exists content_kpis_brief_no_category;

alter table public.content_kpis drop constraint if exists content_kpis_format_check;
alter table public.content_kpis
  add constraint content_kpis_format_check
  check (format = any (array['image','video']));

notify pgrst, 'reload schema';
