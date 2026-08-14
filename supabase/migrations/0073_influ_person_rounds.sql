-- แยก "ตัวบุคคล (โปรไฟล์)" ออกจาก "การ์ด/เคส" ใน Influ Management:
-- influ 1 คนเข้ามาทำได้หลายรอบ — แต่ละรอบ = แถว influencers 1 แถว (การ์ด 1 ใบ, memo/สัญญา/checklist ของตัวเอง)
-- ทุกรอบของคนเดียวกันแชร์ person_id เดียวกัน; round_no = รอบที่เท่าไหร่ (เริ่ม 1)

alter table public.influencers
  add column if not exists person_id uuid,
  add column if not exists round_no integer not null default 1;

-- แถวเดิม = คนละคนกันหมด (ยังไม่เคยมีระบบรอบ) — ใช้ id ของแถวเป็น person_id ตั้งต้น
update public.influencers set person_id = id where person_id is null;

-- เพิ่ม influ ใหม่ตามปกติ = คนใหม่เสมอ (ได้ person_id ของตัวเอง)
-- เปิดรอบใหม่ = client ส่ง person_id ของคนเดิมมาเอง
alter table public.influencers
  alter column person_id set default gen_random_uuid();
alter table public.influencers
  alter column person_id set not null;

alter table public.influencers
  add constraint influencers_round_no_positive check (round_no >= 1);

create index if not exists influencers_person_id_idx
  on public.influencers (person_id);
