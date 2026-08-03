-- ลิงก์ไฟล์ Source ของ influencer (Google Drive ฯลฯ) — แปะได้หลายลิงก์ต่อคน
-- (applied remotely as influ_links)
-- เปิดเร็วจากการ์ดบอร์ด Influ Management / การ์ดโปรไฟล์ /influ-gallery / หน้า detail
create table if not exists public.influ_links (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  title text,
  url text not null,
  position int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.influ_links is
  'ลิงก์ไฟล์ source ของ influencer (Google Drive) — title null = ใช้ hostname แสดงแทน';

create index if not exists influ_links_influ_idx
  on public.influ_links (influencer_id);

alter table public.influ_links enable row level security;

drop policy if exists "authenticated full access influ_links" on public.influ_links;
create policy "authenticated full access influ_links"
  on public.influ_links
  for all to authenticated using (true) with check (true);

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตารางใหม่ไม่เจอ
notify pgrst, 'reload schema';
