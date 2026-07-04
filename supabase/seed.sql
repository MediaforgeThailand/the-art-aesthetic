-- ============================================================
-- ข้อมูลตัวอย่าง (demo) สำหรับทดสอบแดชบอร์ด — ลบได้ด้วย:
--   delete from public.sales_records where note = 'demo';
--   delete from public.tasks where description = 'demo';
-- ============================================================

insert into public.sales_records
  (record_date, branch, category, item_name, quantity, unit_price, amount, customer_name, staff_name, payment_method, note, source)
select
  (current_date - (random() * 180)::int)                            as record_date,
  (array['สาขาสยาม', 'สาขาทองหล่อ', 'สาขาลาดพร้าว'])[1 + (random() * 2)::int] as branch,
  cat                                                                as category,
  item                                                               as item_name,
  1,
  price,
  price                                                              as amount,
  'ลูกค้าตัวอย่าง ' || gs                                             as customer_name,
  (array['คุณหมอเอ', 'คุณหมอบี', 'คุณเมย์', 'คุณฟ้า'])[1 + (random() * 3)::int] as staff_name,
  (array['เงินสด', 'โอนเงิน', 'บัตรเครดิต'])[1 + (random() * 2)::int]  as payment_method,
  'demo',
  'manual'
from generate_series(1, 120) gs,
lateral (
  select *
  from (values
    ('Botox',          'Botox กราม 50 ยูนิต',        12000::numeric),
    ('Botox',          'Botox หน้าผาก 30 ยูนิต',      8000),
    ('Filler',         'Filler ปาก 1 cc',            15000),
    ('Filler',         'Filler ร่องแก้ม 1 cc',        16000),
    ('Laser',          'Pico Laser หน้าใส',           3500),
    ('Laser',          'เลเซอร์กำจัดขน รักแร้',        1500),
    ('Skin Treatment', 'ทรีตเมนต์หน้าใส Premium',      2500),
    ('Skin Treatment', 'Meso Fat หน้าเรียว',          4500),
    ('Products',       'เซรั่มบำรุงผิว SkinLab',       1890),
    ('Products',       'กันแดด SPF50+ PA++++',         990)
  ) as t(cat, item, price)
  order by random()
  limit 1
) picks;

insert into public.tasks (title, description, status, priority, due_date)
values
  ('สรุปยอดขายประจำเดือนส่งผู้จัดการ',   'demo', 'in_progress', 'high',   current_date + 3),
  ('เตรียมโปรโมชั่นเดือนหน้า',           'demo', 'todo',        'medium', current_date + 10),
  ('ตรวจนับสต๊อกผลิตภัณฑ์',             'demo', 'todo',        'medium', current_date + 5),
  ('อบรมพนักงานใหม่เรื่องการใช้เครื่อง Laser', 'demo', 'done',   'high',   current_date - 2),
  ('ต่อสัญญา supplier ผลิตภัณฑ์บำรุงผิว', 'demo', 'todo',        'urgent', current_date + 1);
