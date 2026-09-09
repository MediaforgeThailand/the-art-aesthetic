-- 0085: ระบบ KPI ทีมคอนเทนต์ — หมวดเนื้อหา + เป้ารายคน + ติดประเภทชิ้นงานบน task
-- โจทย์ผู้ใช้ 2026-08-22: content แต่ละคนถูกกำหนด KPI (เช่น 4 ชิ้น = ภาพ 2 + วิดีโอ 2 และวิดีโอต้องเป็นคลิปหมอ 1)
-- แต่ระบบ task เดิมไม่มีที่ระบุว่าชิ้นงานเป็นประเภทไหน — หัวหน้าทีมจึงตามไม่ได้ว่าทำครบตามเป้าหรือยัง

-- หมวดเนื้อหา (ขาย / Value / หมอ / สวย ...) — ทีมเพิ่ม/แก้เองได้จากหน้า KPI คอนเทนต์
create table if not exists public.content_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position double precision not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.content_categories enable row level security;
create policy "content_categories_all" on public.content_categories
  for all to authenticated using (true) with check (true);

-- กติกา KPI รายคน — เป้าต่อเดือน (ไม่มีคอลัมน์เดือน: ตั้งครั้งเดียวเป็นกติกายืน
-- แดชบอร์ดคำนวณผลของเดือนที่เลือกจาก tasks.posted_at เอง)
-- format null = นับทุกฟอร์แมต, category_id null = นับทุกหมวด — กติกา 1 แถวนับงานที่ match ทุกเงื่อนไขที่ระบุ
-- ตัวอย่าง KPI ข้างบนแตกเป็น 3-4 แถว: {image,null,2} {video,null,2} {video,หมอ,1} (+{null,null,4} ถ้าอยากตั้งเป้ารวม)
-- งานชิ้นเดียว match ได้หลายกติกา = นับให้ทุกแถวที่ตรง (ตั้งใจ)
create table if not exists public.content_kpis (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  format text check (format in ('image','video')),
  category_id uuid references public.content_categories(id) on delete cascade,
  target integer not null check (target > 0),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists content_kpis_profile_idx on public.content_kpis (profile_id);

alter table public.content_kpis enable row level security;
create policy "content_kpis_all" on public.content_kpis
  for all to authenticated using (true) with check (true);

-- ติดประเภทชิ้นงานบนการ์ดงาน — nullable โดยตั้งใจ (งานเก่า/งานที่ไม่ใช่คอนเทนต์ไม่ต้องติด)
-- content_format คนละช่องกับ brief_content_type (graphic|video ของ brief) — อันนี้คือชิ้นงานจริงที่โพส
alter table public.tasks
  add column if not exists content_format text check (content_format in ('image','video')),
  add column if not exists content_category_id uuid references public.content_categories(id) on delete set null;

-- seed หมวดตั้งต้นตามตัวอย่างของผู้ใช้ — ทีมแก้ชื่อ/ลบ/เพิ่มเองได้ในหน้า KPI คอนเทนต์
insert into public.content_categories (name, position)
values ('ขาย', 1), ('Value', 2), ('หมอ', 3), ('สวย', 4);

-- PostgREST แคช schema ไว้ — ไม่ reload จะมองไม่เห็นตาราง/คอลัมน์ใหม่
notify pgrst, 'reload schema';
