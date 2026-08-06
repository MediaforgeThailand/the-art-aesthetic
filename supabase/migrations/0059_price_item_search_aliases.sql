-- 0059: คำค้นเพิ่มเติม (aliases) ของโปรแกรมใน Price List
-- ปัญหา: ชื่อจริงของสินค้าไม่ตรงกับชื่อที่ทีมเรียกปากเปล่า เช่น "Botox Korea" ไม่มีใน Price List
-- (ตัวจริงคือ Botox Hutox) ทำให้พิมพ์ค้นหาแล้วไม่เจอ — เพิ่มคอลัมน์เก็บคำค้น/ชื่อเรียกอื่น
-- ให้ช่องค้นหาจับด้วย (Stage 2 picker ใน ProcedureItemsEditor, หน้า /price-list, จัดการใน /pricing)
-- ไม่แสดงเป็นเนื้อหาบนเมนู ใช้ประกอบการค้นหาเท่านั้น
-- หมายเหตุ: ข้อมูล alias ตั้งต้นถูกเติมตรงบน remote (data cleanup 2026-08-06 — ไม่อยู่ในไฟล์นี้
-- เพราะผูกกับข้อมูลจริงที่ไม่ได้ seed จาก migration); ทีมแก้เองได้ในโมดัลแก้รายการที่ /pricing

alter table public.price_items add column if not exists search_aliases text;
comment on column public.price_items.search_aliases is 'คำค้นเพิ่มเติม/ชื่อเรียกปากเปล่า ใช้ประกอบการค้นหา — ไม่แสดงเป็นเนื้อหาบนเมนู';
