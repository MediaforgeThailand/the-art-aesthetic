-- คลังลิงก์ไฟล์ (File Management) — เก็บที่อยู่ไฟล์ภายนอกเป็นลิงก์ แยกประเภท/หมวดหมู่
-- (applied remotely as 20260704045300_add_file_links)
create table public.file_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text,
  source_type text not null default 'website',
  category text not null default 'ทั่วไป',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index file_links_category_idx on public.file_links (category);
create index file_links_created_at_idx on public.file_links (created_at);

alter table public.file_links enable row level security;

create policy "authenticated full access file_links"
  on public.file_links for all to authenticated
  using (true) with check (true);
