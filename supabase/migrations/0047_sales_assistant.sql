-- Sales Assistant (iPad PWA) — ชั้นข้อมูลเสริมที่ต่อยอดจาก price_items
--
-- แอปคนละตัวกับระบบหลังบ้าน (repo MediaforgeThailand/the-art-sales-assistant —
-- React+Vite SPA, ออฟไลน์ได้, ติดตั้งลง iPad) แต่ใช้ database เดียวกัน
--
-- หลักการ: ราคาและโปรโมชันมี source of truth เดียวคือ price_items ที่ทีม content
-- แก้ผ่าน /pricing อยู่แล้ว — ตาราง sa_* ด้านล่าง "ไม่เก็บราคาซ้ำ" เก็บเฉพาะสิ่งที่
-- price_items ไม่มี: การจับกลุ่ม SKU, การจับคู่ปัญหาลูกค้า, รูป, เนื้อหาเชิงลึก
--
-- รันซ้ำได้ทั้งไฟล์ (ทุกคำสั่ง idempotent + ครอบ transaction เดียว)

begin;
set local search_path = public, pg_temp;

-- ── หัตถการ (SKU) ────────────────────────────────────────────────────────────
-- price_items 268 แถวยุบเหลือ SKU จริงไม่กี่สิบตัว เพราะหลายแถวคือหัตถการเดียวกัน
-- คนละขนาด (Botox Hutox 1/20/50/100 Unit = SKU เดียว 4 ระดับราคา)
-- ไม่มีคอลัมน์ราคา — ราคามาจาก price_items ผ่าน sa_sku_items เสมอ
create table if not exists sa_sku (
  id      text primary key,
  name    text not null,
  brand   text not null default '',
  type    text not null check (type in ('Injection', 'Device', 'Laser', 'Treatment')),
  helps   text not null default '',
  for_who text not null default '',
  img     text not null default '',
  pop     boolean not null default false,
  rating  numeric not null default 4.8,
  cases   text not null default '',
  active  boolean not null default true,
  sort    int not null default 0
);

-- ── SKU ↔ price_items (many-to-many) ─────────────────────────────────────────
-- role='variant'   แถวราคานี้ "คือ" SKU นี้ที่ขนาดหนึ่ง → เป็นตัวเลือกราคา/โปรของ SKU
-- role='component' แถวราคานี้เป็นแพ็กเกจที่ "มี" SKU นี้รวมอยู่ด้วย
--                  → ใช้แตกแพ็กเกจเป็นรายการหัตถการย่อย และติด tag ว่า SKU นี้อยู่ในโปรไหน
-- แถวแพ็กเกจหนึ่งแถวจึงมีได้หลาย component (เช่น Ulthera 500 Lines + Liftera + Fat Burn)
create table if not exists sa_sku_items (
  price_item_id uuid not null references price_items (id) on delete cascade,
  sku_id        text not null references sa_sku (id) on delete cascade,
  role          text not null default 'variant' check (role in ('variant', 'component')),
  qty_label     text not null default '',
  note          text not null default '',
  primary key (price_item_id, sku_id)
);

create index if not exists sa_sku_items_sku_idx on sa_sku_items (sku_id);

-- ── เนื้อหาเชิงลึกต่อ SKU ────────────────────────────────────────────────────
-- detail = ProcDetail (suitable / results / grid / talk / faq / deep) ตาม types.ts
-- ข้อมูลต้องอ้างอิงแหล่งที่เชื่อถือได้ — เก็บที่มาไว้ใน sources
create table if not exists sa_sku_detail (
  sku_id   text primary key references sa_sku (id) on delete cascade,
  benefits jsonb not null default '[]',
  detail   jsonb not null default '{}',
  sources  jsonb not null default '[]'
);

-- เนื้อหากลางต่อประเภท ใช้เมื่อ SKU ยังไม่มี sa_sku_detail ของตัวเอง
create table if not exists sa_gen_details (
  type   text primary key check (type in ('Injection', 'Device', 'Laser', 'Treatment')),
  detail jsonb not null
);

-- ── ปัญหาลูกค้า → หัตถการ ────────────────────────────────────────────────────
create table if not exists sa_problems (
  id   text primary key,
  seg  text not null check (seg in ('ตัว', 'ใบหน้า')),
  name text not null,
  sub  text not null default '',
  img  text not null default '',
  pop  boolean not null default false,
  sort int not null default 0
);

-- match = คะแนนความเหมาะสม 0-100 ใช้เรียงลำดับที่แนะนำให้ลูกค้า
create table if not exists sa_problem_sku (
  problem_id text not null references sa_problems (id) on delete cascade,
  sku_id     text not null references sa_sku (id) on delete cascade,
  match      int not null default 80 check (match between 0 and 100),
  sort       int not null default 0,
  primary key (problem_id, sku_id)
);

-- ── เคส Before / After ───────────────────────────────────────────────────────
create table if not exists sa_ba_cases (
  id        text primary key,
  sku_id    text references sa_sku (id) on delete set null,
  area      text not null,
  proc      text not null default '',
  qty       text not null default '',
  times     text not null default '',
  after_txt text not null default '',
  age       text not null default '',
  kind      text not null check (kind in ('ตัว', 'ใบหน้า')),
  img       text not null default '',
  sort      int not null default 0
);

-- ── ตะกร้าที่ sales บันทึก ───────────────────────────────────────────────────
create table if not exists sa_consultations (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  problems     jsonb not null default '[]',
  plan         jsonb not null,
  item_count   int not null default 0,
  total_normal int not null default 0,
  total_net    int not null default 0,
  device       text not null default ''
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table sa_sku           enable row level security;
alter table sa_sku_items     enable row level security;
alter table sa_sku_detail    enable row level security;
alter table sa_gen_details   enable row level security;
alter table sa_problems      enable row level security;
alter table sa_problem_sku   enable row level security;
alter table sa_ba_cases      enable row level security;
alter table sa_consultations enable row level security;

-- Postgres ไม่มี CREATE POLICY IF NOT EXISTS (PG17 ก็ยังไม่มี) — drop ก่อนเสมอ
-- ไม่งั้นรันไฟล์ซ้ำจะพังที่ SQLSTATE 42710
drop policy if exists "sa content read"   on sa_sku;
drop policy if exists "sa content read"   on sa_sku_items;
drop policy if exists "sa content read"   on sa_sku_detail;
drop policy if exists "sa content read"   on sa_gen_details;
drop policy if exists "sa content read"   on sa_problems;
drop policy if exists "sa content read"   on sa_problem_sku;
drop policy if exists "sa content read"   on sa_ba_cases;
drop policy if exists "sa consult insert" on sa_consultations;
drop policy if exists "sa consult read"   on sa_consultations;
drop policy if exists "sa content write"  on sa_sku;
drop policy if exists "sa content write"  on sa_sku_items;
drop policy if exists "sa content write"  on sa_sku_detail;
drop policy if exists "sa content write"  on sa_gen_details;
drop policy if exists "sa content write"  on sa_problems;
drop policy if exists "sa content write"  on sa_problem_sku;
drop policy if exists "sa content write"  on sa_ba_cases;

-- อ่านเนื้อหา: เปิดเท่ากับ price_items (anon อ่านได้) เพราะแอป iPad ยังไม่มี login
-- ถ้าวันหนึ่งเพิ่ม Supabase Auth ให้ sales แล้ว ให้ตัด anon ออกจาก 7 policy นี้
create policy "sa content read" on sa_sku         for select to anon, authenticated using (active);
create policy "sa content read" on sa_sku_items   for select to anon, authenticated using (true);
create policy "sa content read" on sa_sku_detail  for select to anon, authenticated using (true);
create policy "sa content read" on sa_gen_details for select to anon, authenticated using (true);
create policy "sa content read" on sa_problems    for select to anon, authenticated using (true);
create policy "sa content read" on sa_problem_sku for select to anon, authenticated using (true);
create policy "sa content read" on sa_ba_cases    for select to anon, authenticated using (true);

-- แก้เนื้อหา: เฉพาะผู้ล็อกอิน (ทีม content ผ่านหลังบ้าน) — เหมือน price_items
create policy "sa content write" on sa_sku         for all to authenticated using (true) with check (true);
create policy "sa content write" on sa_sku_items   for all to authenticated using (true) with check (true);
create policy "sa content write" on sa_sku_detail  for all to authenticated using (true) with check (true);
create policy "sa content write" on sa_gen_details for all to authenticated using (true) with check (true);
create policy "sa content write" on sa_problems    for all to authenticated using (true) with check (true);
create policy "sa content write" on sa_problem_sku for all to authenticated using (true) with check (true);
create policy "sa content write" on sa_ba_cases    for all to authenticated using (true) with check (true);

-- ตะกร้า: iPad เขียนได้อย่างเดียว อ่านไม่ได้ (กันคนที่มี anon key ดึงข้อมูลลูกค้ากลับ)
-- ทีมงานที่ล็อกอินแล้วอ่านได้ เผื่อทำหน้าสถิติภายหลัง
create policy "sa consult insert" on sa_consultations for insert to anon, authenticated with check (true);
create policy "sa consult read"   on sa_consultations for select to authenticated using (true);

commit;
