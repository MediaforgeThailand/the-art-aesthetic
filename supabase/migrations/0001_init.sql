-- ============================================================
-- Aesthetic System — initial schema
-- แผนก Aesthetic: งาน / เอกสาร / ยอดขาย (รวม import จากไฟล์ทีม DA)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "authenticated can read profiles"
  on public.profiles for select to authenticated using (true);

create policy "users can update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้สมัครใหม่
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- tasks ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_status_idx on public.tasks (status);
create index tasks_due_date_idx on public.tasks (due_date);

alter table public.tasks enable row level security;

create policy "authenticated full access tasks"
  on public.tasks for all to authenticated
  using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------- documents ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'ทั่วไป',
  file_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index documents_category_idx on public.documents (category);

alter table public.documents enable row level security;

create policy "authenticated full access documents"
  on public.documents for all to authenticated
  using (true) with check (true);

-- ---------- data_imports (log การนำเข้าไฟล์จากทีม DA) ----------
create table public.data_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  total_rows integer,
  imported_rows integer,
  status text not null default 'completed'
    check (status in ('completed', 'failed', 'partial')),
  error text,
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.data_imports enable row level security;

create policy "authenticated full access data_imports"
  on public.data_imports for all to authenticated
  using (true) with check (true);

-- ---------- sales_records ----------
create table public.sales_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  branch text,
  category text,
  item_name text,
  quantity numeric not null default 1,
  unit_price numeric,
  amount numeric not null default 0,
  customer_name text,
  staff_name text,
  payment_method text,
  note text,
  source text not null default 'manual' check (source in ('manual', 'import')),
  import_id uuid references public.data_imports(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index sales_records_date_idx on public.sales_records (record_date);
create index sales_records_category_idx on public.sales_records (category);
create index sales_records_import_idx on public.sales_records (import_id);

alter table public.sales_records enable row level security;

create policy "authenticated full access sales_records"
  on public.sales_records for all to authenticated
  using (true) with check (true);

-- ---------- storage bucket สำหรับเอกสาร ----------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "authenticated can read document files"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents');

create policy "authenticated can upload document files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

create policy "authenticated can update document files"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents');

create policy "authenticated can delete document files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents');
