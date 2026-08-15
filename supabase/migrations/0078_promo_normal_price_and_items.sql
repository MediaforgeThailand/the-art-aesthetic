-- แก้ข้อมูลโปรรอบที่ 2 — ต่อจาก 0077
-- ที่มา: full audit โปร 476 ใบ (15 ส.ค. 2569) รอบตรวจทานแบบหักล้าง
--
-- สองกลุ่มใหญ่:
--   ก. "ราคาปกติ" ที่ไม่มีอยู่จริง — แพ็กเกจแบบซื้อจำนวน (ช็อต/ยูนิต/Lines) ถูกคิดราคาปกติ
--      จาก (จำนวน × ราคาต่อหน่วย) ทั้งที่ไฟล์ราคาของบริษัทตั้งราคาปกติของแพ็กเกจไว้เอง
--      เช่น Liftera Pen 5,000 ช็อต ขาย 19,900 · ไฟล์ราคาบอกราคาปกติ 19,900 (ไม่ลด)
--      แต่แอปคิด 5,000 × 20 = 100,000 แล้วโชว์ "ประหยัด 80,100"
--   ข. บรรทัดที่ชี้ผิดตัว / จำนวนผิด / หน่วยผิด ที่เจอเพิ่มในรอบนี้
--
-- ทุกคำสั่งรันซ้ำได้ไม่เปลี่ยนผล (idempotent)
-- คู่กับ scripts/promo-corrections.mjs ซึ่งใส่การแก้ชุดเดียวกันกลับทุกครั้งที่นำเข้าใหม่

-- ── 1. หน่วยที่ลงผิดใน Item Master ───────────────────────────────────────────
-- Fat SISI ขายเป็นขวด (ชื่อไอเทมเองก็บอก "1 ขวด") แต่ POS ลงหน่วยเป็น "ซีซี"
-- Pure Collagen ขายเป็นกล่อง (ชื่อบอก "1 กล่อง") แต่ลงเป็น "ครั้ง"
update sa_items set unit = 'ขวด'  where code = 'AES-6812001' and unit is distinct from 'ขวด';
update sa_items set unit = 'กล่อง' where code = 'AES-6811105' and unit is distinct from 'กล่อง';

update sa_promo_items set unit = 'ขวด'  where item_code = 'AES-6812001' and unit is distinct from 'ขวด';
update sa_promo_items set unit = 'กล่อง' where item_code = 'AES-6811105' and unit is distinct from 'กล่อง';

update promo_package_items set unit = 'ขวด'  where item_sku = 'AES-6812001' and unit is distinct from 'ขวด';
update promo_package_items set unit = 'กล่อง' where item_sku = 'AES-6811105' and unit is distinct from 'กล่อง';

update promo_packages set base_unit = 'ขวด'  where base_item_sku = 'AES-6812001' and base_unit is distinct from 'ขวด';
update promo_packages set base_unit = 'กล่อง' where base_item_sku = 'AES-6811105' and base_unit is distinct from 'กล่อง';

-- ── 2. ผูกคนละไอเทมกับชื่อโปร ────────────────────────────────────────────────
-- PKAES-6812288 ชื่อ "Pro Fresh" ขาย 1,950 แต่ผูกกับ Gold Facial (8,950) ซึ่งกางสูตร
-- 13 ขั้นมีแผ่นทองคำ 99.99% ให้ลูกค้าดู · ไฟล์ราคาแถว 330 "Pro Fresh 1 ครั้ง" 2,500 → 1,950
update sa_promo_items i
   set item_code = 'AES-6811096', item_name = t.name, unit_price = t.price, unit = t.unit
  from sa_items t
 where t.code = 'AES-6811096'
   and i.promo_id = 'PKAES-6812288' and i.item_code = 'AES-6811101';

update promo_package_items i
   set item_sku = 'AES-6811096', item_name = t.name, unit_price = t.price, unit = t.unit
  from sa_items t, promo_packages p
 where t.code = 'AES-6811096'
   and p.sku = 'PKAES-6812288' and i.package_id = p.id and i.item_sku = 'AES-6811101';

-- ── 3. จำนวนที่นับซ้ำกับชื่อไอเทม ────────────────────────────────────────────
-- AES-6811051 คือ "Juvelook ใต้ตา (2 CC)" — ตัวรายการเป็นชุด 2 cc อยู่แล้ว
-- การลง qty = 2 ทำให้คิดเป็น 2 ชุด (4 cc) และดันราคาปกติขึ้นเท่าตัว
-- ใบพี่น้อง PKAES-6905006/07/08 ใช้ qty = 1 ถูกต้อง
update sa_promo_items set qty = 1
 where item_code = 'AES-6811051' and promo_id in ('PKAES-6811067','PKAES-6905002') and qty <> 1;

update promo_package_items i set qty = 1
  from promo_packages p
 where p.sku in ('PKAES-6811067','PKAES-6905002')
   and i.package_id = p.id and i.item_sku = 'AES-6811051' and i.qty <> 1;

-- ── 4. PKAES-6812201 นวดมือ+Therma Tite 60 mins ─────────────────────────────
-- ขาย 6,900 (ครั้งเดียว ตามไฟล์ราคาแถว 203) แต่ในระบบเป็น "นวดมือ 10 ครั้ง"
-- และไม่มีบรรทัด Therma Tite เลย ทั้งที่เป็นตัวชูโรงในชื่อโปร
-- แบบ 5/10 ครั้งมีใบของตัวเองอยู่แล้ว (PKAES-6812202 = 35,900 · PKAES-6812203 = 47,900)
-- รูปที่ถูกคือ 2 บรรทัด เหมือนใบ 30 mins (PKAES-6812197) และใบ Upper Legs (PKAES-6812204)
update sa_promo_items set qty = 1
 where promo_id = 'PKAES-6812201' and item_code = 'AAL-6812015' and qty <> 1;

insert into sa_promo_items (promo_id, pos, item_code, item_name, qty, unit, unit_price, line_total, gift)
select 'PKAES-6812201', 2, t.code, t.name, 1, t.unit, t.price, 0, false
  from sa_items t
 where t.code = 'ATT-6811004'
   and not exists (select 1 from sa_promo_items x
                    where x.promo_id = 'PKAES-6812201' and x.item_code = 'ATT-6811004');

update promo_package_items i set qty = 1
  from promo_packages p
 where p.sku = 'PKAES-6812201' and i.package_id = p.id
   and i.item_sku = 'AAL-6812015' and i.qty <> 1;

insert into promo_package_items (package_id, item_sku, item_name, qty, unit, unit_price, position)
select p.id, t.code, t.name, 1, t.unit, t.price, 2
  from promo_packages p, sa_items t
 where p.sku = 'PKAES-6812201' and t.code = 'ATT-6811004'
   and not exists (select 1 from promo_package_items x
                    where x.package_id = p.id and x.item_sku = 'ATT-6811004');

-- ── 5. นวดหน้า / นวดตัว ที่ยุบรวมกันตอนนำเข้า ────────────────────────────────
-- ไฟล์ราคาแถว 312 คำว่า "นวดมือ" เป็นหัวข้อกลุ่ม ไม่ใช่ชื่อรายการ
-- ของจริงแยกเป็นแถว 313 "นวดหน้า (มือ) (1 ครั้ง)" และแถว 314 "นวดตัว (มือ) (1 ครั้ง)"
-- ตอนนำเข้าหยิบหัวข้อกลุ่มมาเป็นชื่อไอเทม โปรนวดหน้ากับนวดตัวจึงโชว์บรรทัดเหมือนกันเป๊ะ
-- แก้ที่ชื่อบรรทัด (ทั้งสองแอปอ่านชื่อจากบรรทัด ไม่ได้อ่านจาก Item Master)
update sa_promo_items set item_name = 'นวดหน้า (มือ) (1 ครั้ง)'
 where item_code = 'AAL-6812015' and promo_id in ('PKAES-6904054','PKAES-6904055')
   and item_name is distinct from 'นวดหน้า (มือ) (1 ครั้ง)';
update sa_promo_items set item_name = 'นวดตัว (มือ) (1 ครั้ง)'
 where item_code = 'AAL-6812015' and promo_id in ('PKAES-6904056','PKAES-6904057')
   and item_name is distinct from 'นวดตัว (มือ) (1 ครั้ง)';

update promo_package_items i set item_name = 'นวดหน้า (มือ) (1 ครั้ง)'
  from promo_packages p
 where p.sku in ('PKAES-6904054','PKAES-6904055') and i.package_id = p.id
   and i.item_sku = 'AAL-6812015' and i.item_name is distinct from 'นวดหน้า (มือ) (1 ครั้ง)';
update promo_package_items i set item_name = 'นวดตัว (มือ) (1 ครั้ง)'
  from promo_packages p
 where p.sku in ('PKAES-6904056','PKAES-6904057') and i.package_id = p.id
   and i.item_sku = 'AAL-6812015' and i.item_name is distinct from 'นวดตัว (มือ) (1 ครั้ง)';

-- ── 6. ราคาปกติของแพ็กเกจแบบซื้อจำนวน ───────────────────────────────────────
-- ตัวเลขทุกตัวคือคอลัมน์ "Price List (ราคาปกติ)" ของไฟล์ Aesthetic Price List 2026
-- ในแถวที่ชื่อตรงกับชื่อโปรตัวต่อตัว · ใบ (Pro) ใช้ราคาปกติของแพ็กเกจเดียวกัน
-- วิธีแก้: หารเฉลี่ยลง unit_price ทุกบรรทัด เพื่อให้ (Σ จำนวน × ราคาต่อหน่วย) = ราคาปกติจริง
-- ต้องแก้ที่ unit_price ไม่ใช่แค่ normal_total เพราะทั้งสองแอปคิด "มูลค่าต่อบรรทัด"
-- จาก unit_price × qty เอง ถ้าแก้แค่ยอดรวม ตัวเลขในโมดัลจะขัดกันเอง
with pack(promo, normal) as (values
  ('PKAES-6811080',  39000), ('PKAES-6811081',  62500), ('PKAES-6811082',  84000),
  ('PKAES-6811083', 115000), ('PKAES-6811084', 133200),
  ('PKAES-6812095',   3900), ('PKAES-6812096',   3900), ('PKAES-6812097',   6900),
  ('PKAES-6812098',   6900), ('PKAES-6812099',   5900), ('PKAES-6812100',  10900),
  ('PKAES-6812101',   6000), ('PKAES-6812102',  12900), ('PKAES-6812103',  15900),
  ('PKAES-6812104',  30000),
  ('PKAES-6812171',  21900), ('PKAES-6812172',  34500), ('PKAES-6812173',  45900),
  ('PKAES-6812174',  25000),
  ('PKAES-6812209',   5900), ('PKAES-6812210',   5900), ('PKAES-6812211',  11900),
  ('PKAES-6812212',  11900), ('PKAES-6812213',  15900), ('PKAES-6812214',  15900),
  ('PKAES-6812215',  17900), ('PKAES-6812216',  17900), ('PKAES-6812217',  27500),
  ('PKAES-6812218',  27500), ('PKAES-6812219',  38500), ('PKAES-6812220',  38500),
  ('PKAES-6812221',   2000), ('PKAES-6812222',   2000), ('PKAES-6812223',   4500),
  ('PKAES-6812224',   7500), ('PKAES-6812225',   9900), ('PKAES-6812226',  13900),
  ('PKAES-6812227',  13900), ('PKAES-6812228',  19900),
  ('PKAES-6812303',  11900), ('PKAES-6812304',  11900),
  ('PKAES-6907001',  11900), ('PKAES-6907002',  19900), ('PKAES-6907003',  25000)
)
update sa_promo_items i
   set unit_price = i.unit_price * t.normal / c.total
  from pack t
  cross join lateral (
    select sum(x.qty * x.unit_price) as total from sa_promo_items x where x.promo_id = t.promo
  ) c
 where i.promo_id = t.promo and c.total > 0 and round(c.total) <> t.normal;

with pack(promo, normal) as (values
  ('PKAES-6811080',  39000), ('PKAES-6811081',  62500), ('PKAES-6811082',  84000),
  ('PKAES-6811083', 115000), ('PKAES-6811084', 133200),
  ('PKAES-6812095',   3900), ('PKAES-6812096',   3900), ('PKAES-6812097',   6900),
  ('PKAES-6812098',   6900), ('PKAES-6812099',   5900), ('PKAES-6812100',  10900),
  ('PKAES-6812101',   6000), ('PKAES-6812102',  12900), ('PKAES-6812103',  15900),
  ('PKAES-6812104',  30000),
  ('PKAES-6812171',  21900), ('PKAES-6812172',  34500), ('PKAES-6812173',  45900),
  ('PKAES-6812174',  25000),
  ('PKAES-6812209',   5900), ('PKAES-6812210',   5900), ('PKAES-6812211',  11900),
  ('PKAES-6812212',  11900), ('PKAES-6812213',  15900), ('PKAES-6812214',  15900),
  ('PKAES-6812215',  17900), ('PKAES-6812216',  17900), ('PKAES-6812217',  27500),
  ('PKAES-6812218',  27500), ('PKAES-6812219',  38500), ('PKAES-6812220',  38500),
  ('PKAES-6812221',   2000), ('PKAES-6812222',   2000), ('PKAES-6812223',   4500),
  ('PKAES-6812224',   7500), ('PKAES-6812225',   9900), ('PKAES-6812226',  13900),
  ('PKAES-6812227',  13900), ('PKAES-6812228',  19900),
  ('PKAES-6812303',  11900), ('PKAES-6812304',  11900),
  ('PKAES-6907001',  11900), ('PKAES-6907002',  19900), ('PKAES-6907003',  25000)
)
update promo_package_items i
   set unit_price = i.unit_price * t.normal / c.total
  from pack t
  join promo_packages p on p.sku = t.promo
  cross join lateral (
    select sum(x.qty * coalesce(x.unit_price, 0)) as total
      from promo_package_items x where x.package_id = p.id
  ) c
 where i.package_id = p.id and c.total > 0 and round(c.total) <> t.normal;

-- ── 7. คำนวณค่าที่ผูกกับบรรทัดใหม่ ──────────────────────────────────────────
-- รายชื่อโปรที่แตะในไฟล์นี้ = กลุ่มราคาปกติข้างบน + ใบที่แก้บรรทัดในข้อ 1–5
create or replace view _promo_fix_0078 as
select unnest(array[
  'PKAES-6811080','PKAES-6811081','PKAES-6811082','PKAES-6811083','PKAES-6811084',
  'PKAES-6812095','PKAES-6812096','PKAES-6812097','PKAES-6812098','PKAES-6812099',
  'PKAES-6812100','PKAES-6812101','PKAES-6812102','PKAES-6812103','PKAES-6812104',
  'PKAES-6812171','PKAES-6812172','PKAES-6812173','PKAES-6812174',
  'PKAES-6812209','PKAES-6812210','PKAES-6812211','PKAES-6812212','PKAES-6812213',
  'PKAES-6812214','PKAES-6812215','PKAES-6812216','PKAES-6812217','PKAES-6812218',
  'PKAES-6812219','PKAES-6812220','PKAES-6812221','PKAES-6812222','PKAES-6812223',
  'PKAES-6812224','PKAES-6812225','PKAES-6812226','PKAES-6812227','PKAES-6812228',
  'PKAES-6812303','PKAES-6812304',
  'PKAES-6907001','PKAES-6907002','PKAES-6907003',
  'PKAES-6812288','PKAES-6811067','PKAES-6905002','PKAES-6812201',
  'PKAES-6904054','PKAES-6904055','PKAES-6904056','PKAES-6904057',
  'PKAES-6812166','PKAES-6811085','PKAES-6811086']) as id;

with agg as (
  select l.promo_id,
         sum(l.qty * l.unit_price) as normal_total,
         count(*)::int as item_count,
         string_agg(l.qty::text || '× ' || l.item_name, ' + ' order by l.pos) as composition
    from sa_promo_items l
   where l.promo_id in (select id from _promo_fix_0078)
   group by l.promo_id
)
update sa_promos p
   set normal_total = a.normal_total,
       item_count = a.item_count,
       composition = a.composition
  from agg a where p.id = a.promo_id;

update sa_promo_items l
   set line_total = round(p.price * (l.qty * l.unit_price) / nullif(p.normal_total, 0), 2)
  from sa_promos p
 where p.id = l.promo_id and l.promo_id in (select id from _promo_fix_0078);

update promo_packages p
   set full_price = a.total
  from (
    select i.package_id, sum(i.qty * coalesce(i.unit_price, 0)) as total
      from promo_package_items i group by i.package_id
  ) a
 where a.package_id = p.id
   and p.sku in (select id from _promo_fix_0078)
   and p.full_price is distinct from a.total;

-- แพ็กเกจหัตถการเดียว: ช่อง base_* ต้องตามบรรทัดที่เพิ่งเปลี่ยน
update promo_packages p
   set base_item_sku = i.item_sku,
       base_item_name = i.item_name,
       base_qty = i.qty,
       base_unit = i.unit,
       base_unit_price = i.unit_price
  from promo_package_items i
 where i.package_id = p.id
   and p.sku in (select id from _promo_fix_0078)
   and (select count(*) from promo_package_items x where x.package_id = p.id) = 1;

-- PKAES-6812201 เพิ่งกลายเป็น 2 บรรทัด ไม่ใช่ "หัตถการเดียว" อีกต่อไป
update promo_packages p
   set base_item_sku = null, base_item_name = null,
       base_qty = null, base_unit = null, base_unit_price = null
 where p.sku = 'PKAES-6812201' and p.base_item_sku is not null;

drop view _promo_fix_0078;

-- ── 8. ปัดเศษทศนิยมที่เหลือจากการหารเฉลี่ย ──────────────────────────────────
-- 21,899.99999999999988 → 21,900 · ไม่กระทบตัวเลขบนจอ (ทั้งสองแอปปัดอยู่แล้ว)
-- แต่ทำให้ยอดเทียบกับราคาขายตรง ๆ ได้ ไม่ต้องเผื่อ epsilon ตอนตรวจ
update sa_promos set normal_total = round(normal_total)
 where normal_total is not null and normal_total <> round(normal_total)
   and abs(normal_total - round(normal_total)) < 0.01;

update promo_packages set full_price = round(full_price)
 where full_price is not null and full_price <> round(full_price)
   and abs(full_price - round(full_price)) < 0.01;
