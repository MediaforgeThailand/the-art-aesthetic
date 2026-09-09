-- 0090: รายการหัตถการของเคส Influ ผูกกับโปรที่ขึ้นหน้า /price-list ได้ (promo_packages)
-- เหตุผล: dropdown เลือกโปรแกรมใน "รายละเอียดเคส" เดิมอ่านแต่ price_items (ราคาเต็ม/ราคากลาง)
-- ทำให้โปรที่ขายจริง (เช่น Botox Hutox 100U ตัวโปร 9,900) ค้นไม่เจอ — ต้องเลือกจากโปรได้ตรงๆ
-- ราคาที่ล็อกจากโปรใช้กติกาเดียวกับ price_item_id (ลบแล้วเลือกใหม่เมื่อราคาเปลี่ยน)
-- nullable โดยตั้งใจ — payload เก่าใน influ_deleted_backups ต้องกู้คืนได้โดยไม่ต้อง backfill
alter table public.influ_procedure_items
  add column if not exists promo_package_id uuid references public.promo_packages(id) on delete set null;
