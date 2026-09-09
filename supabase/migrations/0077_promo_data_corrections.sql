-- แก้ข้อมูลโปรที่ผิดมาจากไฟล์ POS ต้นทาง (audit 476 ใบ วันที่ 15 ส.ค. 2569)
--
-- ต้นเหตุอยู่ที่ทะเบียนโปรในระบบ POS ไม่ใช่โค้ด — ไฟล์ export บอกแบบนี้มาตรง ๆ
-- migration นี้แก้ "ของที่ขึ้นอยู่ตอนนี้" ส่วนการนำเข้ารอบหน้าใช้ scripts/promo-corrections.mjs
-- ซึ่งเก็บรายการเดียวกันไว้พร้อมเหตุผลรายข้อ (ต้องแก้ทั้งสองที่ให้ตรงกันเสมอ)
--
-- แตะ 2 ชุดตาราง เพราะคนละหน้าใช้คนละชุด:
--   sa_promos / sa_promo_items          → แอปขายบน iPad
--   promo_packages / promo_package_items → หน้าราคาสาธารณะ /price-list
--
-- ทุกคำสั่งเขียนให้รันซ้ำได้ (idempotent) — รันสองรอบผลเท่าเดิม

-- ── 1. หน่วยที่ลงผิดใน Item Master ────────────────────────────────────────────
-- Ulthera ขายเป็น Lines (ชื่อไอเทมเองบอก "1Lines") · Doublo หัว SD ขายเป็นช็อต
-- POS ลงทั้งคู่เป็น "ครั้ง" หน้าจอเลยขึ้น "900 ครั้ง" แทน "900 Lines"
update sa_items set unit = 'Lines' where code = 'AES-6811103' and unit is distinct from 'Lines';
update sa_items set unit = 'ช็อต'  where code = 'AES-6907001' and unit is distinct from 'ช็อต';

update sa_promo_items set unit = 'Lines' where item_code = 'AES-6811103' and unit is distinct from 'Lines';
update sa_promo_items set unit = 'ช็อต'  where item_code = 'AES-6907001' and unit is distinct from 'ช็อต';

update promo_package_items set unit = 'Lines' where item_sku = 'AES-6811103' and unit is distinct from 'Lines';
update promo_package_items set unit = 'ช็อต'  where item_sku = 'AES-6907001' and unit is distinct from 'ช็อต';

update promo_packages set base_unit = 'Lines' where base_item_sku = 'AES-6811103' and base_unit is distinct from 'Lines';
update promo_packages set base_unit = 'ช็อต'  where base_item_sku = 'AES-6907001' and base_unit is distinct from 'ช็อต';

-- ── 2. จำนวนโบท็อกซ์ผิด — ลงเป็น 1/2 แทนจำนวนยูนิตจริงตามชื่อโปร ─────────────
-- AES-6811061 = "Botox Korea 1 unit" ราคา 150/ยูนิต จำนวนต้องเป็นจำนวนยูนิต
-- โปรชุด MM-MKT015/2569 (PKAES-6812029–036) ลง 20/50 ยูนิตถูกต้องอยู่แล้ว
update sa_promo_items set qty = 50
 where promo_id in ('PKAES-6811093','PKAES-6811094') and item_code = 'AES-6811061' and qty <> 50;
update sa_promo_items set qty = 100
 where promo_id in ('PKAES-6811095','PKAES-6811096') and item_code = 'AES-6811061' and qty <> 100;

update promo_package_items i set qty = 50
 from promo_packages p
 where i.package_id = p.id and p.sku in ('PKAES-6811093','PKAES-6811094')
   and i.item_sku = 'AES-6811061' and i.qty <> 50;
update promo_package_items i set qty = 100
 from promo_packages p
 where i.package_id = p.id and p.sku in ('PKAES-6811095','PKAES-6811096')
   and i.item_sku = 'AES-6811061' and i.qty <> 100;

-- ── 3. จำนวนครั้งในคอร์สไม่ตรงชื่อ ────────────────────────────────────────────
-- "Diode laserกำจัดขน (เหมา 5 จุด)/12ครั้ง" ลงไว้ 10 ครั้ง (ใบ /8ครั้ง ลง 8 ถูกต้อง)
update sa_promo_items set qty = 12
 where promo_id = 'PKAES-6812249' and item_code = 'AES-6812019' and qty <> 12;
update promo_package_items i set qty = 12
 from promo_packages p
 where i.package_id = p.id and p.sku = 'PKAES-6812249' and i.item_sku = 'AES-6812019' and i.qty <> 12;

-- ── 4. ผูกคนละไอเทมกับชื่อโปร ─────────────────────────────────────────────────
-- ทำให้หน้าจอบอกลูกค้าผิดว่าได้อะไร และราคาเต็มที่ใช้คิด % ส่วนลดผิดตามไปด้วย
--   PKAES-6811007  "6 Steps - Clear ACNE"      Skin-Acne Clear (3,000) → โปรแกรม Clear ACNE 6 STEP (1,399)
--   PKAES-6812278  "จี้ไฝ /1จุด (เริ่มต้น)"    เหมาหน้า 10 จุด (12,000) → /1จุด (1,000)  [เคยโชว์ลด 96%]
--   PKAES-6812279  "เหมาหน้า 10 จุดขึ้นไป"     เหมาหน้า+คอ (15,000)    → เหมาหน้า (12,000)
--   PKAES-6812266  "Qswitch ลบรอยแผลเป็น (เหมา)" ต่อจุด (3,000)        → เหมา (5,000)  [ราคาขายเคยสูงกว่าราคาเต็ม]
with relink(promo, from_code, to_code) as (values
  ('PKAES-6811007','AES-6811026','AES-6811029'),
  ('PKAES-6812278','AAL-6812012','AES-6811081'),
  ('PKAES-6812279','AAL-6812013','AAL-6812012'),
  ('PKAES-6812266','AAL-6812009','AAL-6812010')
)
update sa_promo_items l
   set item_code = r.to_code, item_name = t.name, unit = t.unit, unit_price = t.price
  from relink r join sa_items t on t.code = r.to_code
 where l.promo_id = r.promo and l.item_code = r.from_code;

with relink(promo, from_code, to_code) as (values
  ('PKAES-6811007','AES-6811026','AES-6811029'),
  ('PKAES-6812278','AAL-6812012','AES-6811081'),
  ('PKAES-6812279','AAL-6812013','AAL-6812012'),
  ('PKAES-6812266','AAL-6812009','AAL-6812010')
)
update promo_package_items i
   set item_sku = r.to_code, item_name = t.name, unit = t.unit, unit_price = t.price
  from relink r
  join sa_items t on t.code = r.to_code
  join promo_packages p on p.sku = r.promo
 where i.package_id = p.id and i.item_sku = r.from_code;

-- ── 5. ของหลักหายทั้งบรรทัด — โปร TPC Premium รุ่น Liftera ตกบรรทัด Ulthera ────
-- ฝาแฝดรุ่น Doublo (PKAES-6812029/031/033/035) ราคาขายเท่ากัน memo MM-MKT015/2569
-- เดียวกัน มีบรรทัด Ulthera ครบทุกใบ · ยอด "ราคาปกติ" เดิมก็ไม่ได้รวม Ulthera เช่นกัน
-- ขยับ pos ไปที่สูง ๆ ก่อน แล้วค่อยดึงกลับ — กัน primary key (promo_id,pos) ชนกันกลางคัน
update sa_promo_items set pos = pos + 100
 where promo_id in ('PKAES-6812030','PKAES-6812032','PKAES-6812034','PKAES-6812036')
   and not exists (
     select 1 from sa_promo_items x
      where x.promo_id = sa_promo_items.promo_id and x.item_code = 'AES-6811103');

insert into sa_promo_items (promo_id, pos, item_code, item_name, qty, unit, unit_price, line_total, gift)
select v.promo, 0, t.code, t.name, v.qty, t.unit, t.price, 0, false
  from (values
    ('PKAES-6812030', 300::numeric),
    ('PKAES-6812032', 500),
    ('PKAES-6812034', 700),
    ('PKAES-6812036', 900)
  ) as v(promo, qty)
  join sa_items t on t.code = 'AES-6811103'
 where not exists (
   select 1 from sa_promo_items x where x.promo_id = v.promo and x.item_code = 'AES-6811103');

update sa_promo_items set pos = pos - 99
 where promo_id in ('PKAES-6812030','PKAES-6812032','PKAES-6812034','PKAES-6812036')
   and pos >= 100;

insert into promo_package_items (package_id, item_sku, item_name, qty, unit, unit_price, position)
select p.id, t.code, t.name, v.qty, t.unit, t.price, -1
  from (values
    ('PKAES-6812030', 300::numeric),
    ('PKAES-6812032', 500),
    ('PKAES-6812034', 700),
    ('PKAES-6812036', 900)
  ) as v(promo, qty)
  join promo_packages p on p.sku = v.promo
  join sa_items t on t.code = 'AES-6811103'
 where not exists (
   select 1 from promo_package_items x where x.package_id = p.id and x.item_sku = 'AES-6811103');

-- เรียง position ใหม่ให้เป็น 0,1,2,… (บรรทัดที่เพิ่งใส่ position=-1 จึงขึ้นก่อน)
update promo_package_items i set position = r.rn - 1
  from (
    select i2.id, row_number() over (partition by i2.package_id order by i2.position, i2.created_at) as rn
      from promo_package_items i2
      join promo_packages p on p.id = i2.package_id
     where p.sku in ('PKAES-6812030','PKAES-6812032','PKAES-6812034','PKAES-6812036')
  ) r
 where r.id = i.id and i.position <> r.rn - 1;

-- ── 5b. ชั้น 1,200 Lines: บรรทัดซ้ำและปนข้ามใบ ────────────────────────────────
-- ไฟล์ POS ให้ Fat กับ Botox มาใบละ 2 บรรทัด และใบที่ชื่อ "แถม Doublo" (6812037)
-- ยังมีบรรทัด Liftera 8,000 ช็อตของใบคู่แฝด (6812038) ติดมาด้วย
-- ยุบซ้ำแล้วตัดตัวปนออก จะได้รูปเดียวกับชั้น 300/500/700/900 ของตระกูลนี้พอดี
--   6812037 → 230,900 (ลด 48%)  ·  6812038 → 358,900 (ลด 67%)
delete from sa_promo_items where promo_id = 'PKAES-6812037' and item_code = 'AES-6811108';
delete from promo_package_items i using promo_packages p
 where i.package_id = p.id and p.sku = 'PKAES-6812037' and i.item_sku = 'AES-6811108';

-- เหลือบรรทัดแรกของแต่ละไอเทม (pos ต่ำสุด) — รันซ้ำแล้วไม่มีอะไรให้ลบอีก
delete from sa_promo_items l
 where l.promo_id in ('PKAES-6812037','PKAES-6812038')
   and l.pos > (select min(x.pos) from sa_promo_items x
                 where x.promo_id = l.promo_id and x.item_code = l.item_code);

delete from promo_package_items i using promo_packages p
 where i.package_id = p.id and p.sku in ('PKAES-6812037','PKAES-6812038')
   and i.id <> (select x.id from promo_package_items x
                 where x.package_id = i.package_id and x.item_sku = i.item_sku
                 order by x.position, x.created_at, x.id limit 1);

-- ── 6. คำนวณค่าที่ผูกกับบรรทัดใหม่ ────────────────────────────────────────────
-- ราคาปกติ / จำนวนรายการ / ข้อความ "ประกอบด้วย" / ยอดจัดสรรรายบรรทัด
-- (ยอดจัดสรร = ราคาขาย × สัดส่วนราคาเต็มของบรรทัดนั้น — สูตรเดิมของระบบ)
with touched(id) as (
  select unnest(array[
    'PKAES-6811093','PKAES-6811094','PKAES-6811095','PKAES-6811096',
    'PKAES-6812249','PKAES-6811007','PKAES-6812278','PKAES-6812279','PKAES-6812266',
    'PKAES-6812030','PKAES-6812032','PKAES-6812034','PKAES-6812036',
    'PKAES-6812037','PKAES-6812038'])
), agg as (
  select l.promo_id,
         sum(l.qty * l.unit_price) as normal_total,
         count(*)::int as item_count,
         string_agg(l.qty::text || '× ' || l.item_name, ' + ' order by l.pos) as composition
    from sa_promo_items l
   where l.promo_id in (select id from touched)
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
 where p.id = l.promo_id
   and l.promo_id in (
     'PKAES-6811093','PKAES-6811094','PKAES-6811095','PKAES-6811096',
     'PKAES-6812249','PKAES-6811007','PKAES-6812278','PKAES-6812279','PKAES-6812266',
     'PKAES-6812030','PKAES-6812032','PKAES-6812034','PKAES-6812036',
     'PKAES-6812037','PKAES-6812038');

-- หน้าราคาสาธารณะ: ราคาเต็ม = Σ (จำนวน × ราคาต่อหน่วย)
update promo_packages p
   set full_price = a.total
  from (
    select i.package_id, sum(i.qty * coalesce(i.unit_price, 0)) as total
      from promo_package_items i group by i.package_id
  ) a
 where a.package_id = p.id
   and p.sku in (
     'PKAES-6811093','PKAES-6811094','PKAES-6811095','PKAES-6811096',
     'PKAES-6812249','PKAES-6811007','PKAES-6812278','PKAES-6812279','PKAES-6812266',
     'PKAES-6812030','PKAES-6812032','PKAES-6812034','PKAES-6812036',
     'PKAES-6812037','PKAES-6812038')
   and p.full_price is distinct from a.total;

-- แพ็กเกจหัตถการเดียว: ช่อง base_* ต้องตามบรรทัดที่เพิ่งเปลี่ยนไอเทม
update promo_packages p
   set base_item_sku = i.item_sku,
       base_item_name = i.item_name,
       base_qty = i.qty,
       base_unit = i.unit,
       base_unit_price = i.unit_price
  from promo_package_items i
 where i.package_id = p.id
   and p.sku in ('PKAES-6811007','PKAES-6812278','PKAES-6812279','PKAES-6812266','PKAES-6812249')
   and (select count(*) from promo_package_items x where x.package_id = p.id) = 1;

-- แพ็กเกจที่เพิ่งกลายเป็นหลายบรรทัด ไม่ใช่ "หัตถการเดียว" อีกต่อไป — ล้าง base_* ทิ้ง
update promo_packages p
   set base_item_sku = null, base_item_name = null,
       base_qty = null, base_unit = null, base_unit_price = null
 where p.sku in ('PKAES-6812030','PKAES-6812032','PKAES-6812034','PKAES-6812036')
   and p.base_item_sku is not null;
