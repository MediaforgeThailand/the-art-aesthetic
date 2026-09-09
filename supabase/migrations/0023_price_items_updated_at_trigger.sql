-- ============================================================
-- 0023 — price_items.updated_at ให้ DB ตั้งเองตอน update
-- (เดิม client ส่ง new Date() มาเอง — นาฬิกาเครื่อง admin เพี้ยน = วันที่บนหน้า
--  สาธารณะผิด และการแก้ผ่าน SQL ที่ไม่ได้ set คอลัมน์นี้จะทำให้วันที่ค้าง)
-- ============================================================

drop trigger if exists price_items_set_updated_at on public.price_items;
create trigger price_items_set_updated_at
  before update on public.price_items
  for each row execute function public.set_updated_at();
