-- 0091: Wellness System — ระบบใหม่แยกส่วน (BC สร้างการ์ดลูกค้า → Lab อัพผลเลือด PDF →
-- Admin โทรนัด + ลงคิวปรึกษาแพทย์ wellness → หมอดูปฏิทิน/ผล lab)
--
-- ตาราง 3 ตัว: wellness_customers (การ์ดลูกค้า), wellness_lab_files (ไฟล์ผลตรวจ PDF),
-- wellness_appointments (คิวปรึกษาแพทย์ — มี exclusion constraint กันเวลาทับกัน)

create table if not exists public.wellness_customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  -- หัตถการศัลยกรรมที่ลูกค้าทำ (ที่มาของการตรวจเลือด)
  procedure_text text not null default '',
  note text not null default '',
  -- Lab กดยืนยันผลครบแล้ว = ส่งต่อให้ Admin โทรนัด (null = ยังรอผล/ยังอัพไม่ครบ)
  lab_confirmed_at timestamptz,
  lab_confirmed_by uuid references public.profiles(id) on delete set null,
  -- ปิดเคส (ฟังผล + ปรึกษาแพทย์เสร็จแล้ว)
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wellness_lab_files (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.wellness_customers(id) on delete cascade,
  -- ไฟล์จริงอยู่ bucket documents path wellness/{customer_id}/ — ลบแถวต้องลบไฟล์ storage เอง (best effort)
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists wellness_lab_files_customer_idx
  on public.wellness_lab_files (customer_id);

create table if not exists public.wellness_appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.wellness_customers(id) on delete cascade,
  appt_date date not null,
  start_time time not null,
  -- Admin เลือกช่วงเวลา 1 / 2 / 3 ชั่วโมง (กติกาผู้ใช้)
  duration_hours int not null check (duration_hours between 1 and 3),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'done', 'cancelled')),
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ล็อคคิวกันเวลาทับกัน (หมอมีคนเดียว): ช่วง [เริ่ม, เริ่ม+ชั่วโมง) ของคิวที่ยัง scheduled
  -- ห้ามซ้อนกัน — insert/update ที่ชนจะได้ error 23P01 (client แปลงเป็นข้อความไทย)
  -- ใช้ tsrange คอลัมน์เดียวจึงใช้ gist ปกติได้ ไม่ต้องเปิด btree_gist
  constraint wellness_appointments_no_overlap exclude using gist (
    tsrange(
      (appt_date::timestamp + start_time),
      (appt_date::timestamp + start_time + make_interval(hours => duration_hours))
    ) with &&
  ) where (status = 'scheduled')
);

create index if not exists wellness_appointments_customer_idx
  on public.wellness_appointments (customer_id);
create index if not exists wellness_appointments_date_idx
  on public.wellness_appointments (appt_date);

-- updated_at อัตโนมัติ (ฟังก์ชันกลางมีตั้งแต่ 0001)
create or replace trigger wellness_customers_set_updated_at
  before update on public.wellness_customers
  for each row execute function public.set_updated_at();
create or replace trigger wellness_appointments_set_updated_at
  before update on public.wellness_appointments
  for each row execute function public.set_updated_at();

-- RLS: authenticated เข้าถึงได้ทั้งหมด (แนวเดียวกับตารางอื่นของระบบภายใน —
-- การมองเห็น/ปุ่มแก้ไขคุมที่ permission ฝั่งแอป)
alter table public.wellness_customers enable row level security;
alter table public.wellness_lab_files enable row level security;
alter table public.wellness_appointments enable row level security;

create policy "authenticated all wellness_customers"
  on public.wellness_customers for all to authenticated
  using (true) with check (true);
create policy "authenticated all wellness_lab_files"
  on public.wellness_lab_files for all to authenticated
  using (true) with check (true);
create policy "authenticated all wellness_appointments"
  on public.wellness_appointments for all to authenticated
  using (true) with check (true);
