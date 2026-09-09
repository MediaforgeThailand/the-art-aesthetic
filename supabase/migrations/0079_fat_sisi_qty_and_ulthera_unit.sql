-- ตามหลัง 0078 ทันที — ปิดช่องที่ 0078 เปิดไว้เอง
--
-- 0078 แก้หน่วยของ AES-6812001 "Fat SISI 1 ขวด" จาก "ซีซี" เป็น "ขวด" (ถูกแล้ว ตัวรายการ
-- คือ 1 ขวด ราคา 5,900 ต่อขวด) แต่มีอีก 2 โปรที่ลง qty = 10 ไว้โดยอ่านป้าย "ซีซี" ตามตัวอักษร
-- พอเปลี่ยนป้ายเป็น "ขวด" บรรทัดจึงกลายเป็น "Fat SISI 1 ขวด · 10 ขวด" = สัญญาว่าให้ 10 ขวด
--
-- ของจริง 1 ขวด = 10 CC พิสูจน์จากบันไดราคาใน Item Master 2 คู่:
--   Laura Fat   1 ขวด 3,900 (AES-6811048) · 1 CC 390 (AES-6905015)  → 10 เท่า
--   Diamond Fat 1 ขวด 5,900 (AES-6811049) · 1 CC 590 (AES-6905014)  → 10 เท่า
-- ชื่อโปร PKAES-6812019 เขียนว่า "แถม Fat SISI 10 cc" = 1 ขวดพอดี
-- ราคา 10 ขวด = 59,000 ในโปรที่ขาย 8,900 / 4,900 เป็นไปไม่ได้อยู่แล้ว

update sa_promo_items set qty = 1
 where item_code = 'AES-6812001'
   and promo_id in ('PKAES-6812019','PKAES-6812020') and qty <> 1;

update promo_package_items i set qty = 1
  from promo_packages p
 where p.sku in ('PKAES-6812019','PKAES-6812020')
   and i.package_id = p.id and i.item_sku = 'AES-6812001' and i.qty <> 1;

-- AES-6811104 เป็นพี่น้องของ AES-6811103 (ที่ 0077 แก้เป็น Lines แล้ว)
-- ชื่อเขียนตรง ๆ ว่า "Line ละ" แต่หน่วยยังเป็น "ครั้ง" · ตอนนี้ยังไม่มีโปรใบไหนใช้
-- แก้ไว้กันไม่ให้ตกหล่นตอนมีโปรมาใช้ในอนาคต
update sa_items set unit = 'Lines'
 where code = 'AES-6811104' and unit is distinct from 'Lines';
update sa_promo_items set unit = 'Lines'
 where item_code = 'AES-6811104' and unit is distinct from 'Lines';
update promo_package_items set unit = 'Lines'
 where item_sku = 'AES-6811104' and unit is distinct from 'Lines';
update promo_packages set base_unit = 'Lines'
 where base_item_sku = 'AES-6811104' and base_unit is distinct from 'Lines';

-- คำนวณค่าที่ผูกกับบรรทัดใหม่
with agg as (
  select l.promo_id,
         sum(l.qty * l.unit_price) as normal_total,
         count(*)::int as item_count,
         string_agg(l.qty::text || '× ' || l.item_name, ' + ' order by l.pos) as composition
    from sa_promo_items l
   where l.promo_id in ('PKAES-6812019','PKAES-6812020')
   group by l.promo_id
)
update sa_promos p
   set normal_total = a.normal_total, item_count = a.item_count, composition = a.composition
  from agg a where p.id = a.promo_id;

update sa_promo_items l
   set line_total = round(p.price * (l.qty * l.unit_price) / nullif(p.normal_total, 0), 2)
  from sa_promos p
 where p.id = l.promo_id and l.promo_id in ('PKAES-6812019','PKAES-6812020');

update promo_packages p
   set full_price = a.total
  from (
    select i.package_id, sum(i.qty * coalesce(i.unit_price, 0)) as total
      from promo_package_items i group by i.package_id
  ) a
 where a.package_id = p.id
   and p.sku in ('PKAES-6812019','PKAES-6812020')
   and p.full_price is distinct from a.total;
