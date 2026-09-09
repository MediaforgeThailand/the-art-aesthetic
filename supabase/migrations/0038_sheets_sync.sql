-- 0038: Google Sheets sync — ดึงยอดขายจริงจากชีทสำเนาของทีม (ผ่าน service account)
-- เข้า sales_records + RPC aggregate ให้หน้ารายงานไม่ต้องโหลดรายบรรทัดนับหมื่นแถว
-- secrets เก็บใน Vault (google_sa_key, sheets_sync_secret, sheets_sync_function_url)
-- self-host: แก้ค่า sheets_sync_function_url ใน vault ให้ชี้ instance ใหม่ ไม่ต้องแก้โค้ด

-- ── extensions ──────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── sales_records: รองรับข้อมูลรายบรรทัดจากชีท ─────────────
alter table public.sales_records drop constraint sales_records_source_check;
alter table public.sales_records
  add constraint sales_records_source_check check (source in ('manual', 'import', 'sheet'));

alter table public.sales_records
  add column if not exists receipt_no text,
  add column if not exists receipt_total numeric,
  add column if not exists product text,
  add column if not exists doctor_name text,
  add column if not exists hn text,
  add column if not exists lead_source text,
  add column if not exists nationality text,
  add column if not exists customer_type text,
  add column if not exists sales_team text,
  add column if not exists staff_name2 text;

create index if not exists sales_records_source_idx on public.sales_records (source);
create index if not exists sales_records_receipt_idx on public.sales_records (receipt_no);

-- ── staging: edge function เทข้อมูลลงที่นี่ก่อน แล้วค่อย swap แบบ atomic ──
create unlogged table public.sheet_sales_staging (
  record_date date not null,
  branch text,
  category text,
  item_name text,
  quantity numeric,
  amount numeric not null default 0,
  customer_name text,
  staff_name text,
  staff_name2 text,
  sales_team text,
  receipt_no text,
  receipt_total numeric,
  doctor_name text,
  hn text,
  lead_source text,
  nationality text,
  customer_type text,
  product text
);
-- ไม่มี policy = client แตะไม่ได้ (service role bypass RLS)
alter table public.sheet_sales_staging enable row level security;

-- ── log การ sync ────────────────────────────────────────────
create table public.sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  detail text,
  rows_synced integer
);
alter table public.sheet_sync_runs enable row level security;
create policy "authenticated read sync runs"
  on public.sheet_sync_runs for select to authenticated using (true);

-- ── อ่าน secret จาก Vault — service role เท่านั้น ───────────
create or replace function public.get_app_secret(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
revoke all on function public.get_app_secret(text) from public, anon, authenticated;
grant execute on function public.get_app_secret(text) to service_role;

-- ── ล้าง staging ก่อนเริ่มรอบใหม่ ───────────────────────────
create or replace function public.reset_sales_sheet_staging()
returns void
language sql
security definer
set search_path = public
as $$
  truncate table public.sheet_sales_staging;
$$;
revoke all on function public.reset_sales_sheet_staging() from public, anon, authenticated;
grant execute on function public.reset_sales_sheet_staging() to service_role;

-- ── swap ข้อมูลชีทชุดเก่าออก ชุดใหม่เข้า ใน transaction เดียว ──
create or replace function public.apply_sales_sheet_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- กัน sync ซ้อนกัน (cron + สั่งมือพร้อมกัน)
  perform pg_advisory_xact_lock(hashtext('sheets-sync-apply'));
  delete from public.sales_records where source = 'sheet';
  insert into public.sales_records
    (record_date, branch, category, item_name, quantity, amount, customer_name,
     staff_name, staff_name2, sales_team, receipt_no, receipt_total, doctor_name,
     hn, lead_source, nationality, customer_type, product, source)
  select
    record_date, branch, category, item_name, quantity, amount, customer_name,
    staff_name, staff_name2, sales_team, receipt_no, receipt_total, doctor_name,
    hn, lead_source, nationality, customer_type, product, 'sheet'
  from public.sheet_sales_staging;
  get diagnostics n = row_count;
  truncate table public.sheet_sales_staging;
  return n;
end;
$$;
revoke all on function public.apply_sales_sheet_sync() from public, anon, authenticated;
grant execute on function public.apply_sales_sheet_sync() to service_role;

-- ── RPC aggregate สำหรับหน้ารายงาน ──────────────────────────
-- "บิล" = จำนวนใบเสร็จ (distinct receipt_no) ไม่ใช่จำนวนบรรทัดรายการ
-- แถว manual เก่าที่ไม่มี receipt_no นับ 1 แถว = 1 บิล

create or replace function public.sales_dash_summary(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = public
as $$
with rows as (
  select * from sales_records
  where record_date >= p_from and record_date <= p_to
),
tot as (
  select coalesce(sum(amount), 0) as total,
         count(*) as lines,
         count(distinct coalesce(receipt_no, id::text)) as bills
  from rows
),
cat as (
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc), '[]'::jsonb) as j
  from (
    select coalesce(nullif(trim(category), ''), 'ไม่ระบุ') as name, sum(amount) as total
    from rows group by 1
  ) c
),
br as (
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc), '[]'::jsonb) as j
  from (
    select coalesce(nullif(trim(branch), ''), 'ไม่ระบุ') as name, sum(amount) as total
    from rows group by 1
  ) b
),
items as (
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total, 'lines', lines) order by total desc), '[]'::jsonb) as j
  from (
    select coalesce(nullif(trim(item_name), ''), 'ไม่ระบุ') as name,
           sum(amount) as total, count(*) as lines
    from rows group by 1
    order by sum(amount) desc
    limit 8
  ) i
),
person as (
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total, 'bills', bills, 'lines', lines) order by total desc), '[]'::jsonb) as j
  from (
    select coalesce(nullif(trim(staff_name), ''), 'ไม่ระบุ') as name,
           sum(amount) as total,
           count(distinct coalesce(receipt_no, id::text)) as bills,
           count(*) as lines
    from rows group by 1
  ) p
)
select jsonb_build_object(
  'total', tot.total,
  'lines', tot.lines,
  'bills', tot.bills,
  'by_category', cat.j,
  'by_branch', br.j,
  'top_items', items.j,
  'by_person', person.j
)
from tot, cat, br, items, person;
$$;

create or replace function public.sales_totals(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'total', coalesce(sum(amount), 0),
    'lines', count(*),
    'bills', count(distinct coalesce(receipt_no, id::text))
  )
  from sales_records
  where record_date >= p_from and record_date <= p_to;
$$;

create or replace function public.sales_monthly_series(p_from date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('month', m, 'total', total, 'bills', bills) order by m), '[]'::jsonb)
  from (
    select to_char(record_date, 'YYYY-MM') as m,
           sum(amount) as total,
           count(distinct coalesce(receipt_no, id::text)) as bills
    from sales_records
    where record_date >= p_from
    group by 1
  ) s;
$$;

create or replace function public.sales_staff_detail(p_name text, p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = public
as $$
with rows as (
  select * from sales_records
  where record_date >= p_from and record_date <= p_to
    and coalesce(nullif(trim(staff_name), ''), 'ไม่ระบุ') = p_name
),
cat as (
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc), '[]'::jsonb) as j
  from (
    select coalesce(nullif(trim(category), ''), 'ไม่ระบุ') as name, sum(amount) as total
    from rows group by 1
  ) c
),
items as (
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total, 'lines', lines) order by total desc), '[]'::jsonb) as j
  from (
    select coalesce(nullif(trim(item_name), ''), 'ไม่ระบุ') as name,
           sum(amount) as total, count(*) as lines
    from rows group by 1
    order by sum(amount) desc
    limit 5
  ) i
)
select jsonb_build_object('categories', cat.j, 'top_items', items.j)
from cat, items;
$$;

-- ── cron: sync ทุกวัน 00:30 UTC = 07:30 เวลาไทย (หลัง Apps Script 06:00-07:00 จบ) ──
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sheets-sync-daily') then
    perform cron.unschedule('sheets-sync-daily');
  end if;
end;
$$;

select cron.schedule(
  'sheets-sync-daily',
  '30 0 * * *',
  $cron$
  select net.http_post(
    url := public.get_app_secret('sheets_sync_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', public.get_app_secret('sheets_sync_secret')
    ),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
