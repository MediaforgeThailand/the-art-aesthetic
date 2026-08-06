-- ซ่อม mirror: คอลัมน์ที่มีอยู่บนโปรเจกต์จริงแต่ไม่เคยถูกเขียนเป็นไฟล์ migration
--
-- ตรวจพบตอน full audit 2026-08-03 โดยเทียบ information_schema ของโปรเจกต์จริงกับไฟล์ในรีโป
-- ถ้าไม่มีไฟล์นี้ ฐานข้อมูลที่สร้างใหม่จาก git จะขาดคอลัมน์ทั้งสอง (ขัดเป้าหมาย self-host
-- ที่ระบุไว้ใน AGENTS.md ว่า "ทุกอย่าง reproduce จาก git ได้")
--
-- ทั้งคู่ใช้ if not exists — รันบนโปรเจกต์จริงแล้วไม่มีผลอะไร

-- 1) price_promotions.is_featured — มาจาก remote migration `20260707040117_price_promotions_featured`
--    ที่ไม่เคยถูก mirror; ปัจจุบันโค้ดยังไม่ได้ใช้คอลัมน์นี้ (เก็บไว้ให้ schema ตรงกัน)
alter table public.price_promotions
  add column if not exists is_featured boolean not null default false;

comment on column public.price_promotions.is_featured is
  'ปักหมุดโปรโมชัน — ยังไม่มีโค้ดใช้งาน (เพิ่มไว้ตอนซ่อม mirror 2026-08-05)';

-- 2) influencers.product_categories — ไม่พบทั้ง migration และการใช้งานในโค้ด
--    (บนโปรดักชันมี CHECK constraint กำกับค่าอยู่ด้วย ต้อง mirror มาให้ครบ)
alter table public.influencers
  add column if not exists product_categories text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.influencers'::regclass
      and conname = 'influencers_product_categories_check'
  ) then
    alter table public.influencers
      add constraint influencers_product_categories_check
      check (product_categories <@ array['inject', 'device', 'treatment']);
  end if;
end $$;

comment on column public.influencers.product_categories is
  'หมวดสินค้าของเคส — ยังไม่มีโค้ดใช้งาน (เพิ่มไว้ตอนซ่อม mirror 2026-08-05)';

-- หมายเหตุ: `tasks.posted_by` เคยอยู่ในไฟล์นี้ตอนตรวจ (เจอในโปรดักชันแต่ไม่มี migration)
-- ระหว่างนั้น session อื่นทำฟีเจอร์ "ใครกดโพสแล้ว" พอดีและเขียน mirror ไว้ที่ 0053_task_posted_by
-- จึงถอดออกจากที่นี่ ปล่อยให้ 0053 เป็นเจ้าของคอลัมน์นั้นแต่ไฟล์เดียว
