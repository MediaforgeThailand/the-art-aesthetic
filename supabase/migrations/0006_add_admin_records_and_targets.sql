-- ผลงานทีมแอดมินรายวัน (ลูกค้าทักใหม่ / จองนัด / ยอดปิดจากแชท)
-- (applied remotely as 20260704062946_add_admin_records_and_targets)
create table public.admin_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  admin_name text,
  channel text,
  new_leads integer not null default 0,
  chats_handled integer not null default 0,
  bookings integer not null default 0,
  closed_amount numeric not null default 0,
  note text,
  source text not null default 'manual' check (source in ('manual', 'import')),
  import_id uuid references public.data_imports(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index admin_records_date_idx on public.admin_records (record_date);
create index admin_records_admin_idx on public.admin_records (admin_name);

alter table public.admin_records enable row level security;
create policy "authenticated full access admin_records"
  on public.admin_records for all to authenticated
  using (true) with check (true);

-- เป้ายอดขายรายเดือน (branch = null คือเป้ารวมทั้งแผนก)
create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  branch text,
  target_amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create unique index sales_targets_month_branch_idx
  on public.sales_targets (month, coalesce(branch, ''));

alter table public.sales_targets enable row level security;
create policy "authenticated full access sales_targets"
  on public.sales_targets for all to authenticated
  using (true) with check (true);
