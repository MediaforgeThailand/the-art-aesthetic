-- ระบบ Influ Management: pipeline 6 stage + ลายเซนดิจิทัล + follow-up + sub campaign
-- (applied remotely as influencer_management)
-- influencers            ข้อมูลหลัก + stage 1..6 + สัญญา 6 เดือน (contract_start ตั้งเมื่อเซนสัญญาครบ)
-- influ_followups        log การติดต่อ stage 1 (round + comment)
-- influ_signatures       ลายเซนดิจิทัล (doc: memo|contract1|contract2, role: maker|checker1|checker2|approver1|approver2|influencer)
--                        ลายเซนแก้หัตถการหน้างาน (stage 5) เก็บใน influencers.procedure_history (jsonb) แทน
-- influ_tasks            stage 6: follow-up ย่อย 10 step (script preset + channel + due_date + done)
-- influ_campaigns        sub campaign เรียกเข้าร่วมได้เมื่อสัญญายังไม่หมด
create table public.influencers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  nickname text,
  phone text,
  occupation text,
  followers integer,
  follower_note text,
  tier text,
  procedure_text text,
  procedure_history jsonb not null default '[]'::jsonb,
  case_value numeric,
  service_date date,
  doctor_name text,
  photo_path text,
  channel_photo_path text,
  maker_name text,
  stage integer not null default 1 check (stage between 1 and 6),
  completed boolean not null default false,
  contract_start date,
  contract_months integer not null default 6,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger influencers_set_updated_at
  before update on public.influencers
  for each row execute function public.set_updated_at();

create table public.influ_followups (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  round integer not null,
  comment text,
  created_at timestamptz not null default now()
);
create index influ_followups_influ_idx on public.influ_followups (influencer_id);

create table public.influ_signatures (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  doc text not null,
  role text not null,
  signer_name text,
  signature_data text not null,
  signed_at timestamptz not null default now(),
  unique (influencer_id, doc, role)
);
create index influ_signatures_influ_idx on public.influ_signatures (influencer_id);

create table public.influ_tasks (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  step integer not null,
  title text not null,
  script text,
  channel text,
  due_date date,
  description text,
  done boolean not null default false,
  done_at timestamptz,
  unique (influencer_id, step)
);
create index influ_tasks_influ_idx on public.influ_tasks (influencer_id);

create table public.influ_campaigns (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  name text not null,
  detail text,
  campaign_date date,
  created_at timestamptz not null default now()
);
create index influ_campaigns_influ_idx on public.influ_campaigns (influencer_id);

alter table public.influencers enable row level security;
alter table public.influ_followups enable row level security;
alter table public.influ_signatures enable row level security;
alter table public.influ_tasks enable row level security;
alter table public.influ_campaigns enable row level security;

create policy "authenticated full access influencers" on public.influencers for all to authenticated using (true) with check (true);
create policy "authenticated full access influ_followups" on public.influ_followups for all to authenticated using (true) with check (true);
create policy "authenticated full access influ_signatures" on public.influ_signatures for all to authenticated using (true) with check (true);
create policy "authenticated full access influ_tasks" on public.influ_tasks for all to authenticated using (true) with check (true);
create policy "authenticated full access influ_campaigns" on public.influ_campaigns for all to authenticated using (true) with check (true);
