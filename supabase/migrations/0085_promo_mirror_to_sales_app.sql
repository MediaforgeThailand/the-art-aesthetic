-- 0085 — ต่อท่อ promo_packages → sa_promos ให้ของที่แก้ในหลังบ้านถึง iPad เอง
--
-- ปัญหาที่ปิดในไฟล์นี้ (เจอตอนไล่เคส "ฉีดสิว" — ดู 0084)
-- โปรโมชั่นในระบบอยู่ 2 ชุดตารางที่ไม่คุยกันเลย:
--
--   หน้า /price-list (เว็บ)          แอปขายบน iPad
--   promo_packages                   sa_promos
--   promo_package_items              sa_promo_items
--   ↑ import-promo-packages.mjs      ↑ ไม่มีทางเข้าเลย — ถูก seed ครั้งเดียว
--     + หน้า /pricing แก้ได้เอง        โดย migration sa_promo_catalog_v2 (13 ส.ค. 69)
--
-- ผลคือทุกอย่างที่ทีมกดแก้/กดซ่อนในหลังบ้าน **ไม่มีทางถึง iPad** และไฟล์ POS
-- ที่นำเข้าใหม่ก็ไม่ถึงเช่นกัน · ฝั่ง sa_* เป็น snapshot แช่แข็งมาตั้งแต่ 13 ส.ค.
--
-- ทางแก้: ทำ promo_packages เป็นต้นทางชุดเดียว แล้ว mirror ลง sa_* ด้วย trigger
-- ระดับ statement — ทำงานทั้งตอน import (service_role) และตอนกดแก้ในหน้า /pricing
-- โดยไม่ต้อง deploy ฝั่งไหนเลย (iPad ดึงใหม่เองทุก 15 นาที / ตอนเปิดแอป)
--
-- ── ตรวจก่อนเขียนทับ (20 ส.ค. 69) ───────────────────────────────────────────
-- เทียบของสองฝั่งทีละบรรทัดก่อน แล้วยืนยันว่า backfill นี้ไม่ทำข้อมูลเสียหาย:
--   • หัวโปร 478 ใบที่มีทั้งสองฝั่ง — ราคา/ราคาปกติ/วันเริ่ม/วันหมด/เลขอนุมัติ/
--     ประเภท ตรงกัน 100% · ต่างแค่ชื่อ 36 ใบ ซึ่งเป็นเรื่องเว้นวรรคซ้ำล้วน ๆ
--     ("Super C  IV Drip" → "Super C IV Drip") ฝั่ง promo_packages คือตัวที่
--     ผ่าน clean() แล้วและเป็นตัวที่ลูกค้าเห็นบนหน้าเว็บอยู่แล้ว
--   • บรรทัดของ 607 = 607 เท่ากันเป๊ะ · เหมือนกัน 556 · ต่าง 51 บรรทัด
--     ไล่ดูครบทุกบรรทัดแล้ว = เว้นวรรค/ขึ้นบรรทัดใหม่ในชื่อ กับเลข pos
--     ที่ไม่เรียง (0 บ้าง 1 บ้าง มีเว้นช่วง) — ไม่มีรายการไหนที่ของ/จำนวน/
--     ราคาต่างกันเลยสักบรรทัด
--
-- ── สองเรื่องที่ต้องไม่ทำพัง ─────────────────────────────────────────────────
-- 1) ของแถม (gift) · sa_promo_items มีคอลัมน์ gift แต่ promo_package_items ไม่มี
--    ตรวจแล้วว่า gift = ชื่อรายการขึ้นต้น '[ของแถม' พอดีเป๊ะ 4/4 บรรทัดทั้งสองฝั่ง
--    ไม่มีหลุดและไม่มีเกิน จึงถอดออกมาจากชื่อได้ตรง ๆ ไม่ต้องเพิ่มคอลัมน์ใหม่
-- 2) โปรราคา 0 · import ตั้ง active = (ราคาขาย > 0) โดยตั้งใจ — คอมเมนต์ในสคริปต์
--    เขียนไว้ว่า "ราคา 0 = ของแถม/เงื่อนไขลูกค้าเก่า ไม่ใช่ของขาย นำเข้าไว้แต่ปิด
--    ไม่ให้ขึ้นหน้าเว็บ" · โปร welcome ลูกค้าเก่า 10 ใบเข้าเงื่อนไขนี้ทั้งหมด
--    (เป็น 10 ใบเดียวในระบบที่ active = false) ซึ่งเซลล์ต้องเห็นบน iPad
--    เพราะเป็นเครื่องมือภายใน ไม่ใช่หน้าเว็บสาธารณะ
--    → active ฝั่ง iPad = active หรือ ราคาขาย = 0
--      แปลว่าปุ่ม "ซ่อนจากหน้าเว็บ" ในหน้า /pricing จะซ่อนบน iPad ด้วย
--      (ตามที่ควรเป็น เวลาทีมถอดโปรที่ขายจริงออก) แต่ไม่ไปกลบของแถม 10 ใบนั้น
--
-- ── ที่ไฟล์นี้ตั้งใจไม่ทำ ────────────────────────────────────────────────────
-- • ไม่ mirror การลบ · sa_promos มี 53 ใบที่ไม่มีใน promo_packages แล้ว
--   (หมดอายุทั้งหมด และแอปกรองตามวันที่อยู่แล้ว) ปล่อยค้างไว้ปลอดภัยกว่า —
--   ถ้า mirror การลบด้วย ตอน import ที่ลบ PK% ทิ้งทั้งชุดก่อนใส่ใหม่
--   จะมีช่วงที่ iPad เห็นแคตตาล็อกว่าง ถ้าบังเอิญ sync เข้ามาพอดี
-- • ไม่แตะราคาขาย/วันหมดเขต — ยังเป็นของระบบอนุมัติ ไฟล์นี้แค่ส่งต่อค่าที่มีอยู่
-- • kind / grp / item_count / composition / line_total แอปไม่ได้อ่าน
--   (อ่านแค่ id, name, price, normal_total, start_date, end_date, memo และ
--   บรรทัด promo_id, pos, item_code, item_name, qty, unit, unit_price, gift)
--   แต่เป็น NOT NULL จึงเติมให้สมเหตุสมผลตามรูปแบบเดิมของตาราง

-- ── ตัวหลัก: sync ตาม sku ที่ระบุ (null = ทั้งหมด) ──────────────────────────
-- security definer เพราะ RLS ของ sa_* เปิดอยู่ และคนเรียกคือ session ของทีม
-- ที่กดแก้ในหน้า /pricing ซึ่งไม่มีสิทธิ์เขียน sa_* โดยตรง
create or replace function public.promo_mirror_sync(p_skus text[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n integer;
begin
  if p_skus is not null and cardinality(p_skus) = 0 then
    return 0;
  end if;

  -- เผื่อรอบก่อนพังกลางคัน แล้วตารางชั่วคราวค้างอยู่ใน transaction เดียวกัน
  drop table if exists _mirror_src;
  drop table if exists _mirror_lines;

  create temp table _mirror_src on commit drop as
    select p.id, p.sku, p.name, p.kind, p.category,
           coalesce(p.sale_price, 0) as sale_price,
           coalesce(p.full_price, p.sale_price, 0) as normal_total,
           p.starts_on, p.ends_on, coalesce(p.memo, '') as memo,
           (p.active or coalesce(p.sale_price, 0) = 0) as sa_active
      from promo_packages p
     where p_skus is null or p.sku = any(p_skus);

  -- pos เรียงใหม่ให้ต่อเนื่องจาก 1 · ต้นทางเก็บ position เริ่มที่ 0 บ้าง 1 บ้าง
  -- และมีเว้นช่วง ซึ่งไม่มีความหมายอะไรนอกจากลำดับ
  create temp table _mirror_lines on commit drop as
    select s.sku,
           (row_number() over (partition by s.sku order by i.position, i.id))::int as pos,
           i.item_sku, i.item_name, i.qty,
           coalesce(i.unit, '') as unit,
           coalesce(i.unit_price, 0) as unit_price,
           (i.item_name like '[ของแถม%') as gift
      from _mirror_src s
      join promo_package_items i on i.package_id = s.id;

  insert into sa_promos
    (id, name, kind, grp, price, normal_total, start_date, end_date,
     item_count, composition, memo, active)
  select s.sku, s.name,
         case s.kind when 'promo' then 'year' else 'standing' end,
         case s.category
           when 'Botox' then 'Botox'
           when 'Filler & Skin Booster' then 'Filler'
           else 'Aesthetics'
         end,
         s.sale_price, s.normal_total, s.starts_on, s.ends_on,
         coalesce(a.n, 1), coalesce(a.comp, ''), s.memo, s.sa_active
    from _mirror_src s
    left join (
      select l.sku, count(*)::int as n,
             string_agg(
               (case when l.qty = trunc(l.qty)
                     then trunc(l.qty)::bigint::text
                     else l.qty::text end) || '× ' || l.item_name,
               ' + ' order by l.pos) as comp
        from _mirror_lines l group by l.sku
    ) a on a.sku = s.sku
  on conflict (id) do update set
    name         = excluded.name,
    kind         = excluded.kind,
    -- grp มาจากชีท POS ฝั่ง sa_* เดิม ซึ่งฝั่ง promo_packages ไม่มีให้ลอก
    -- ของเดิมที่ลงไว้แล้วละเอียดกว่า (Filler / Ultraformer lll / …) จึงไม่ทับ
    grp          = coalesce(nullif(sa_promos.grp, ''), excluded.grp),
    price        = excluded.price,
    normal_total = excluded.normal_total,
    start_date   = excluded.start_date,
    end_date     = excluded.end_date,
    item_count   = excluded.item_count,
    composition  = excluded.composition,
    memo         = excluded.memo,
    active       = excluded.active;

  -- ลบแล้วใส่ใหม่ทั้งใบ ไม่ใช่ upsert ทีละบรรทัด — ถ้าต้นทางตัดรายการออก
  -- บรรทัดเก่าต้องหายตาม · อยู่ใน transaction เดียวกัน จึงไม่มีช่วงที่โปรว่าง
  delete from sa_promo_items l
   where exists (select 1 from _mirror_src s where s.sku = l.promo_id);

  insert into sa_promo_items
    (promo_id, pos, item_code, item_name, qty, unit, unit_price, line_total, gift)
  select l.sku, l.pos, coalesce(l.item_sku, ''), l.item_name, l.qty,
         l.unit, l.unit_price,
         -- เฉลี่ยราคาโปรตามสัดส่วนราคาปกติของบรรทัด (สูตรเดียวกับ 0079)
         -- ของแถมไม่คิดส่วนแบ่ง — ปล่อย null ตามของเดิมในตาราง
         case when l.gift then null
              else round(p.price * (l.qty * l.unit_price)
                         / nullif(p.normal_total, 0), 2) end,
         l.gift
    from _mirror_lines l
    join sa_promos p on p.id = l.sku;

  select count(*)::int into n from _mirror_src;
  drop table _mirror_src;
  drop table _mirror_lines;
  return n;
end;
$fn$;

comment on function public.promo_mirror_sync(text[]) is
  'คัดลอก promo_packages/promo_package_items → sa_promos/sa_promo_items (ตารางที่แอปขายบน iPad อ่าน) · ยิงเองได้เวลาต้องซ่อมมือ: select promo_mirror_sync();';

-- ── trigger: ระดับ statement + transition table ────────────────────────────
-- ระดับ statement เพราะ import ยัดทีเดียว ~478 แถว / ~607 บรรทัด
-- ถ้าเป็น for each row จะเรียกฟังก์ชันพันกว่ารอบโดยไม่จำเป็น
create or replace function public.promo_mirror_pkg_tg()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $fn$
begin
  perform public.promo_mirror_sync(array(select sku from new_rows));
  return null;
end;
$fn$;

create or replace function public.promo_mirror_item_tg()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    -- join กับ promo_packages คัดใบที่ถูกลบทิ้งไปแล้วออกเอง (cascade)
    -- จึงไม่ไปล้างบรรทัดฝั่ง iPad ตอน import ลบ PK% ทั้งชุดก่อนใส่ใหม่
    perform public.promo_mirror_sync(array(
      select distinct p.sku from promo_packages p
       where p.id in (select package_id from old_rows)));
  else
    perform public.promo_mirror_sync(array(
      select distinct p.sku from promo_packages p
       where p.id in (select package_id from new_rows)));
  end if;
  return null;
end;
$fn$;

drop trigger if exists promo_packages_mirror_ins on promo_packages;
drop trigger if exists promo_packages_mirror_upd on promo_packages;
drop trigger if exists promo_package_items_mirror_ins on promo_package_items;
drop trigger if exists promo_package_items_mirror_upd on promo_package_items;
drop trigger if exists promo_package_items_mirror_del on promo_package_items;

create trigger promo_packages_mirror_ins after insert on promo_packages
  referencing new table as new_rows
  for each statement execute function public.promo_mirror_pkg_tg();

create trigger promo_packages_mirror_upd after update on promo_packages
  referencing new table as new_rows
  for each statement execute function public.promo_mirror_pkg_tg();

create trigger promo_package_items_mirror_ins after insert on promo_package_items
  referencing new table as new_rows
  for each statement execute function public.promo_mirror_item_tg();

create trigger promo_package_items_mirror_upd after update on promo_package_items
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.promo_mirror_item_tg();

create trigger promo_package_items_mirror_del after delete on promo_package_items
  referencing old table as old_rows
  for each statement execute function public.promo_mirror_item_tg();

-- ── backfill รอบแรก: ดันของที่ค้างมาตั้งแต่ 13 ส.ค. ให้ตรงกันทั้งระบบ ───────
select public.promo_mirror_sync();
