-- ตารางราคาโปรโมชันที่อนุมัติแล้ว (Product Pricing)
-- (applied remotely as price_promotions; seed demo flag note='demo')
create table public.price_promotions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  detail text,
  normal_price numeric not null,
  promo_price numeric not null,
  starts_on date,
  expires_on date,
  approved_by text,
  note text,
  created_at timestamptz not null default now()
);

create index price_promotions_category_idx on public.price_promotions (category);
create index price_promotions_expires_idx on public.price_promotions (expires_on);

alter table public.price_promotions enable row level security;
create policy "authenticated full access price_promotions"
  on public.price_promotions for all to authenticated
  using (true) with check (true);
