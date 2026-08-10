-- ลิงก์โพส/คอมเมนต์ที่ influencer ลงจริง — บันทึกไว้บนสุดของขั้น "ตามงาน" (stage 5)
-- แปะได้หลายลิงก์ต่อคน: โพสหลัก/โพสเสริม และคอมเมนต์รีวิว (เช่น ในกลุ่มปิด) + โน้ตกำกับ
create table if not exists public.influ_post_links (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  kind text not null default 'post' check (kind in ('post', 'comment')),
  url text not null,
  note text,
  position int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.influ_post_links is
  'ลิงก์ผลงานที่ influencer โพสจริง (ขั้นตามงาน) — kind: post = โพส/คลิป, comment = คอมเมนต์รีวิว; note = โน้ตกำกับ';

create index if not exists influ_post_links_influ_idx
  on public.influ_post_links (influencer_id);

alter table public.influ_post_links enable row level security;

drop policy if exists "authenticated full access influ_post_links" on public.influ_post_links;
create policy "authenticated full access influ_post_links"
  on public.influ_post_links
  for all to authenticated using (true) with check (true);

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตารางใหม่ไม่เจอ
notify pgrst, 'reload schema';
