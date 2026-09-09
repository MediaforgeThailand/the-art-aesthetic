-- ============================================================
-- 0071 — โปรโมชัน/แพ็กเกจที่ขายจริง (นำเข้าจากไฟล์ POS ของโรงพยาบาล)
--
-- หน้า /price-list เปลี่ยนคอนเซปต์เป็น "รวมโปรที่ขายอยู่ตอนนี้" (ตามที่ผู้ใช้กำหนด
-- 2026-08-13): แถวบนหน้าเว็บ = แพ็กเกจ/โปรที่ซื้อได้จริง ไม่ใช่รายการหัตถการเดี่ยว
-- ตารางนี้จึงเก็บ "สิ่งที่ขาย" ส่วน `price_items` (0015) ยังอยู่เหมือนเดิมเพราะ
-- /pricing + ต้นทุน influ (influ_procedure_items.price_item_id) ยังอ้างอยู่
--
-- ที่มาข้อมูล: ชีท "โปรโมชั่น Aesthetics" (แพ็กเกจ) + "โปร-หัตถการ (SKU)" (ประกอบด้วยอะไรบ้าง)
--   + "หัตถการ Aesthetics" (ราคา Price list ต่อหน่วย → ใช้คิดราคาเต็ม/ส่วนลด %)
-- **ต้นทุนหัตถการในไฟล์ไม่ถูกนำเข้า** — ตารางนี้ anon อ่านได้ ห้ามมีข้อมูลต้นทุน
-- ============================================================

create table if not exists public.promo_packages (
  id uuid primary key default gen_random_uuid(),
  -- รหัสแพ็กเกจในระบบ POS เช่น PKAES-6811002 — ใช้เป็นกุญแจตอน re-import
  sku text not null unique,
  name text not null,
  -- หมวดที่ใช้แสดงบนหน้าเว็บ (จัดเอง ไม่ใช่กลุ่มในไฟล์ซึ่งกว้างเกิน — 511/529 เป็น "Aesthetics")
  category text not null,
  -- แท็บ ฉีด/ทรีตเม้น/เครื่อง — ชุดเดียวกับ price_items.groups
  groups text[] not null default '{}'::text[],
  -- promo = โปรช่วงเวลาที่อนุมัติระหว่างปี (มีวันหมดเขตจริง) / package = แพ็กเกจประจำในระบบ
  kind text not null default 'package',
  -- ราคาที่ลูกค้าจ่ายจริง
  sale_price numeric not null,
  -- ราคาเต็ม = ผลรวม (จำนวน × ราคา Price list ต่อหน่วย) ของหัตถการในแพ็กเกจ
  -- null = คำนวณไม่ได้ (ไม่มีราคาต่อหน่วย) → หน้าเว็บไม่โชว์ % ส่วนลด
  full_price numeric,
  starts_on date,
  -- null = ไม่ระบุวันหมดเขต (ขายต่อเนื่อง) — คนละความหมายกับหมดเขตแล้ว
  ends_on date,
  -- แพ็กเกจที่มีหัตถการเดียว: ใช้จับกลุ่มแถวแบบตาราง Price List (1 ครั้ง / คอร์ส 5 / คอร์ส 10)
  -- null = แพ็กเกจรวมหลายหัตถการ → เป็นแถวของตัวเอง
  base_item_sku text,
  base_item_name text,
  base_qty numeric,
  base_unit text,
  base_unit_price numeric,
  -- เลขที่เอกสารอนุมัติ (Memo) — ใช้อ้างอิงในหลังบ้าน ไม่แสดงบนหน้าสาธารณะ
  memo text,
  note text,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_packages_kind_valid check (kind in ('promo', 'package')),
  constraint promo_packages_groups_valid check (
    -- cardinality ไม่ใช่ array_length: array_length ของ array ว่างคืน NULL แล้ว CHECK จะผ่าน
    cardinality(groups) >= 1
    and groups <@ array['injection', 'treatment', 'device']::text[]
  )
);

comment on table public.promo_packages is
  'โปร/แพ็กเกจที่ขายจริง (นำเข้าจากไฟล์ POS) — แหล่งข้อมูลของหน้าสาธารณะ /price-list';
comment on column public.promo_packages.full_price is
  'ราคาเต็มคำนวณจากหัตถการในแพ็กเกจ — ใช้คิด % ส่วนลด; null = ไม่มีข้อมูลพอ';

-- "ได้อะไรบ้าง" ของแต่ละแพ็กเกจ — กดดูในโมดัลบนหน้าเว็บ
create table if not exists public.promo_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.promo_packages(id) on delete cascade,
  item_sku text,
  item_name text not null,
  qty numeric not null default 1,
  unit text,
  -- ราคา Price list ต่อหน่วย (ราคาเต็ม ไม่ใช่ต้นทุน)
  unit_price numeric,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists promo_packages_active_sort_idx
  on public.promo_packages (active, sort);
create index if not exists promo_packages_base_item_idx
  on public.promo_packages (base_item_sku);
create index if not exists promo_package_items_package_idx
  on public.promo_package_items (package_id, position);

drop trigger if exists promo_packages_set_updated_at on public.promo_packages;
create trigger promo_packages_set_updated_at
  before update on public.promo_packages
  for each row execute function public.set_updated_at();

alter table public.promo_packages enable row level security;
alter table public.promo_package_items enable row level security;

-- ทุกคนอ่านได้ (รวม anon — หน้าสาธารณะไม่ต้องล็อกอิน), เขียนได้เฉพาะผู้ล็อกอิน
-- แนวเดียวกับ price_items (0015)
create policy "promo_packages_public_read" on public.promo_packages
  for select using (true);
create policy "promo_packages_auth_insert" on public.promo_packages
  for insert to authenticated with check (true);
create policy "promo_packages_auth_update" on public.promo_packages
  for update to authenticated using (true);
create policy "promo_packages_auth_delete" on public.promo_packages
  for delete to authenticated using (true);

create policy "promo_package_items_public_read" on public.promo_package_items
  for select using (true);
create policy "promo_package_items_auth_insert" on public.promo_package_items
  for insert to authenticated with check (true);
create policy "promo_package_items_auth_update" on public.promo_package_items
  for update to authenticated using (true);
create policy "promo_package_items_auth_delete" on public.promo_package_items
  for delete to authenticated using (true);
