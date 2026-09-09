-- Price List กลาง — แสดงบนหน้าสาธารณะ /price-list โดยไม่ต้องล็อกอิน
-- ราคาเก็บเป็น text (บางช่องเป็นข้อความ เช่น "3,745/เส้น"), โปร/คอร์สเป็น jsonb [{label,price,start,end}]
create table if not exists price_items (
  id uuid primary key default gen_random_uuid(),
  item_no integer,
  category text not null,
  name text not null,
  benefits text,
  process text,
  price_normal text,
  promos jsonb not null default '[]'::jsonb,
  courses jsonb not null default '[]'::jsonb,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table price_items enable row level security;

-- ทุกคนอ่านได้ (รวม anon — หน้าสาธารณะ), เขียนได้เฉพาะผู้ล็อกอิน
create policy "price_items_public_read" on price_items
  for select using (true);
create policy "price_items_auth_insert" on price_items
  for insert to authenticated with check (true);
create policy "price_items_auth_update" on price_items
  for update to authenticated using (true);
create policy "price_items_auth_delete" on price_items
  for delete to authenticated using (true);
