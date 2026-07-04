-- เป้า KPI รายบุคคลรายเดือน — ทีมขาย (ยอดขาย) และทีมแอดมิน (ยอดปิดจากแชท)
-- (applied remotely as staff_kpis; ข้อมูล demo ทั้งชุด re-seed ผ่าน execute_sql — flag note='demo')
create table public.staff_kpis (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  person_name text not null,
  team text not null check (team in ('sales', 'admin')),
  target_amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create unique index staff_kpis_month_team_person_idx
  on public.staff_kpis (month, team, person_name);

alter table public.staff_kpis enable row level security;
create policy "authenticated full access staff_kpis"
  on public.staff_kpis for all to authenticated
  using (true) with check (true);
