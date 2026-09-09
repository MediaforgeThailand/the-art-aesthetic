-- Influ Calendar: ปฏิทินคิวงาน Influencer รายเดือน (/influ-calendar)
-- (applied remotely as influ_calendar)
-- influ manager กดใส่คิว (วัน + เวลา + ประเภท) ลงในช่องวันของปฏิทินได้เอง
--   influencer_id null ได้ = คิวทั่วไปที่ไม่ผูกกับ influencer คนใดคนหนึ่ง (เช่น ประชุมทีม)
--   start_time null    = คิวทั้งวัน (ยังไม่เคาะเวลา)
create table if not exists public.influ_calendar_events (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid references public.influencers(id) on delete cascade,
  title text not null,
  kind text not null default 'service'
    check (kind in ('service', 'shoot', 'post', 'meeting', 'followup', 'other')),
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  note text,
  done boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.influ_calendar_events is
  'คิวงาน Influencer บนปฏิทินรายเดือน (/influ-calendar) — influencer_id null = คิวทั่วไป, start_time null = ทั้งวัน';

create index if not exists influ_calendar_events_date_idx
  on public.influ_calendar_events (event_date);
create index if not exists influ_calendar_events_influ_idx
  on public.influ_calendar_events (influencer_id);

create or replace trigger influ_calendar_events_set_updated_at
  before update on public.influ_calendar_events
  for each row execute function public.set_updated_at();

alter table public.influ_calendar_events enable row level security;

drop policy if exists "authenticated full access influ_calendar_events"
  on public.influ_calendar_events;
create policy "authenticated full access influ_calendar_events"
  on public.influ_calendar_events
  for all to authenticated using (true) with check (true);

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตารางใหม่ไม่เจอ
notify pgrst, 'reload schema';
