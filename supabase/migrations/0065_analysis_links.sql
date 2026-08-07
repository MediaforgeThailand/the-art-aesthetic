-- คลังลิงก์ผลวิเคราะห์ (Canva) — แท็บ "ผลวิเคราะห์" หน้า Task
-- หัวหน้าทีมแปะลิงก์ผลวิเคราะห์ content / ads / artwork รายสัปดาห์+รายเดือน
-- ให้ทีมกดเปิดดูเป็นต้นแบบ (เพิ่ม/แก้/ลบเฉพาะ admin — คุมที่ UI ตามแนวระบบภายใน)
create table if not exists public.analysis_links (
  id uuid primary key default gen_random_uuid(),
  -- ชื่อกำกับลิงก์ (null = แสดงชื่อหมวดแทน)
  title text,
  url text not null,
  category text not null default 'content'
    check (category in ('content', 'ads', 'artwork', 'other')),
  period text not null check (period in ('weekly', 'monthly')),
  -- เก็บปีเป็น ค.ศ. เสมอ — ช่วงกันพลาดกรอกปี พ.ศ. (เช่น 2569) ลงมาตรงๆ
  year int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  -- สัปดาห์ที่ในเดือน (1-5) — บังคับมีเมื่อ weekly และต้องว่างเมื่อ monthly
  week int check (week between 1 and 5),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint analysis_links_week_matches_period check (
    (period = 'weekly' and week is not null)
    or (period = 'monthly' and week is null)
  )
);

comment on table public.analysis_links is
  'ลิงก์ผลวิเคราะห์ (Canva) รายสัปดาห์/รายเดือน — แชร์ให้ทีมเป็นต้นแบบในแท็บ "ผลวิเคราะห์" ของหน้า Task';

create index if not exists analysis_links_month_idx
  on public.analysis_links (year desc, month desc);

alter table public.analysis_links enable row level security;

drop policy if exists "authenticated full access analysis_links" on public.analysis_links;
create policy "authenticated full access analysis_links"
  on public.analysis_links
  for all to authenticated using (true) with check (true);

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตารางใหม่ไม่เจอ
notify pgrst, 'reload schema';
