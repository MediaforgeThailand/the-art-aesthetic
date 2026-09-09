-- ==== mirror ย้อนหลัง (กู้เข้า repo นี้ 2026-09-09) ====================================
-- 0118 = migration "acne_injection_rows" (version 20260820073705) ที่ apply บน Supabase แล้วเมื่อ 2026-08-20
-- ที่มาของไฟล์: branch `claude/promo-mirror-sales-app` ของ repo นี้ (ไฟล์ 0084/0085 บน branch นั้น ซึ่งไม่เคย merge เข้า main) — ชื่อเดิม 0084_acne_injection_rows.sql
-- เลขไฟล์คือลำดับที่กู้เข้ามา ไม่ใช่ลำดับที่ apply จริง (apply จริงอยู่ระหว่าง 0083–0088 ตามวันที่ข้างบน)
-- ห้าม apply ซ้ำบนโปรดักชัน — ใช้เฉพาะตอน replay ชุด 0001..N บน Supabase stack เปล่า
-- =================================================================================
-- 0084 — ฉีดสิว: เติมของที่หายไปให้ครบทั้งสองฝั่ง
--
-- "Skin-ฉีดสิว" มีอยู่ในชีทราคาของไฟล์ POS (AES-6811133 ต่อจุด 200 ·
-- AES-6812035 เหมาทั่วหน้า 500) แต่ **ไม่มีอยู่ในชีทโปรโมชั่นเลยสักใบ**
-- ทีมจึงเพิ่มกลับเข้า promo_packages เองเมื่อ 19 ส.ค. 69 (รหัส MANUAL-1787084001133
-- และ MANUAL-1787084002035 — ดู note ในแถว) แต่เพิ่มไปได้ครึ่งเดียว:
--
--   • ไม่มีบรรทัดใน promo_package_items → โมดัลบนหน้า /price-list ขึ้นว่า
--     "ไม่มีรายละเอียดในระบบ — สอบถามเจ้าหน้าที่" · สองใบนี้เป็นแพ็กเกจ
--     ชุดเดียวใน 478 ใบที่ไม่มีบรรทัดของตัวเอง
--   • ไม่ได้ลงใน sa_promos / sa_promo_items ซึ่งเป็นตารางที่แอปขายบน iPad อ่าน
--     (คนละชุดกับหน้าเว็บ — ดูหมายเหตุหัวไฟล์ 0077) แท็บโปรของหัตถการ "ฉีดสิว"
--     จึงขึ้น "ไม่พบโปรโมชั่นที่กำลังใช้งาน" ทั้งที่การ์ดนี้เป็นตัวแนะนำอันดับ 2
--     ของหัวข้อ "สิว" (match 94) และอันดับ 1 ของ "สิวหลัง/สิวหน้าอก" (match 92)
--
-- migration นี้ **ไม่ตั้งราคาหรือวันที่ใหม่เอง** — ลอกค่าที่เผยแพร่บนหน้า
-- /price-list อยู่แล้วไปอีกฝั่งให้ตรงกัน (ราคาขาย/วันหมดเขตยังเป็นของระบบอนุมัติ)
-- ราคาปกติ = ราคาขาย จึงไม่ขึ้นป้าย "ประหยัด" — ถูกต้องแล้ว เพราะนี่คือราคา
-- Price List ไม่ใช่โปรลดราคา
--
-- ใช้ id เดียวกับ promo_packages.sku เพื่อให้ join ข้ามสองชุดตารางได้เหมือนของนำเข้า
-- ทุกคำสั่งรันซ้ำได้ (idempotent)

-- ── 1. หน้า /price-list: บรรทัด "ได้อะไรบ้าง" ────────────────────────────────
-- ลอกจาก base_item_* ของแถวเดียวกัน (รูปแบบเดียวกับแพ็กเกจหัตถการเดี่ยวใบอื่น)
insert into promo_package_items
  (package_id, item_sku, item_name, qty, unit, unit_price, position)
select p.id, p.base_item_sku, p.base_item_name, p.base_qty, p.base_unit,
       p.base_unit_price, 0
  from promo_packages p
 where p.sku in ('MANUAL-1787084001133', 'MANUAL-1787084002035')
   and p.base_item_sku is not null
   and not exists (
     select 1 from promo_package_items i where i.package_id = p.id
   );

-- ── 2. แอปขายบน iPad: ลง sa_promos / sa_promo_items ให้ตรงกับสองใบข้างบน ────
insert into sa_promos
  (id, name, kind, grp, price, normal_total, start_date, end_date,
   item_count, composition, memo, active)
-- memo = เลขเอกสารอนุมัติ · สองใบนี้ไม่มี (ไม่ได้มาจากชีทโปร) จึงเว้นว่าง
-- ('' ไม่ใช่ null — คอลัมน์เป็น not null) แอปจะไม่ขึ้นบรรทัด "เอกสารอนุมัติ …"
values
  ('MANUAL-1787084001133', 'Skin-ฉีดสิว (ต่อจุด)', 'standing', 'Aesthetics',
   200, 200, '2026-01-01', '2026-12-31', 1, '1× Skin-ฉีดสิว (ต่อจุด)', '', true),
  ('MANUAL-1787084002035', 'Skin-ฉีดสิว (เหมาทั่วหน้า)', 'standing', 'Aesthetics',
   500, 500, '2026-01-01', '2026-12-31', 1, '1× Skin-ฉีดสิว (เหมาทั่วหน้า)', '', true)
on conflict (id) do update set
  name         = excluded.name,
  kind         = excluded.kind,
  grp          = excluded.grp,
  price        = excluded.price,
  normal_total = excluded.normal_total,
  start_date   = excluded.start_date,
  end_date     = excluded.end_date,
  item_count   = excluded.item_count,
  composition  = excluded.composition,
  active       = excluded.active;

-- หน่วยตามที่ Item Master ลงไว้ ('ครั้ง') — ชื่อรายการบอก "ต่อจุด" อยู่แล้ว
-- และห้ามแก้ unit ของไอเทมลอย ๆ โดยไม่ไล่ qty ของทุกบรรทัดที่อ้างไอเทมนั้น (ดู 0079)
insert into sa_promo_items
  (promo_id, pos, item_code, item_name, qty, unit, unit_price, line_total, gift)
values
  ('MANUAL-1787084001133', 1, 'AES-6811133', 'Skin-ฉีดสิว (ต่อจุด)',
   1, 'ครั้ง', 200, 200, false),
  ('MANUAL-1787084002035', 1, 'AES-6812035', 'Skin-ฉีดสิว (เหมาทั่วหน้า)',
   1, 'ครั้ง', 500, 500, false)
on conflict (promo_id, pos) do update set
  item_code  = excluded.item_code,
  item_name  = excluded.item_name,
  qty        = excluded.qty,
  unit       = excluded.unit,
  unit_price = excluded.unit_price,
  line_total = excluded.line_total,
  gift       = excluded.gift;
