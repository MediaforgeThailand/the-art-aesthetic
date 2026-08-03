-- Influencer Cost: แตก "โปรแกรมที่รับ" จาก text ก้อนเดียวเป็นรายการทีละโปรแกรม
-- (applied remotely as influ_procedure_items)
-- เก็บต้นทุนค่าบริการ (price) + ติ๊ก "แบรนด์ support" รายรายการ (ต้นทุนรายการนั้น = 0)
-- price_item_id = ลิงก์ไป Price List กลาง (เลือกจาก dropdown) — ลบ price item แล้วรายการยังอยู่
create table if not exists public.influ_procedure_items (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  is_supported boolean not null default false,
  price_item_id uuid references public.price_items(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.influ_procedure_items is
  'รายการโปรแกรม/หัตถการของ influencer รายรายการ (Influencer Cost) — price = ต้นทุนค่าบริการ, is_supported = แบรนด์สินค้า support ของ (ต้นทุนรายการนี้เป็น 0)';

create index if not exists influ_procedure_items_influ_idx
  on public.influ_procedure_items (influencer_id);

create or replace trigger influ_procedure_items_set_updated_at
  before update on public.influ_procedure_items
  for each row execute function public.set_updated_at();

alter table public.influ_procedure_items enable row level security;

drop policy if exists "authenticated full access influ_procedure_items"
  on public.influ_procedure_items;
create policy "authenticated full access influ_procedure_items"
  on public.influ_procedure_items
  for all to authenticated using (true) with check (true);

-- Backfill: แตก procedure_text เดิมเป็นรายการ ราคา 0 (ทีมมาเติมต้นทุนทีหลัง)
-- ตัวคั่นตามข้อมูลจริง: / , + และขึ้นบรรทัดใหม่; ตัด bullet "- " หัวบรรทัดออก
-- idempotent: ข้ามคนที่มีรายการแล้ว
insert into public.influ_procedure_items (influencer_id, name, price, position)
select i.id,
       left(regexp_replace(btrim(t.part), '^[-•]\s*', ''), 100),
       0,
       t.ord
from public.influencers i
cross join lateral regexp_split_to_table(i.procedure_text, '\s*[/,+\n]\s*')
  with ordinality as t(part, ord)
where i.procedure_text is not null
  and btrim(regexp_replace(btrim(t.part), '^[-•]\s*', '')) <> ''
  and not exists (
    select 1 from public.influ_procedure_items p where p.influencer_id = i.id
  );

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตารางใหม่ไม่เจอ
notify pgrst, 'reload schema';
