-- 0106: เปิดวงเงินด้วย voucher แทนการรวมราคาสินค้า (ผู้ใช้ 2026-09-03)
--
-- เดิม influencers.case_value = Σ ราคาโปรแกรมที่เลือก + ค่าตัว
-- ใหม่  case_value = (voucher_count × voucher_unit) + ค่าตัว — ราคาสินค้าไม่เข้าสมการอีกแล้ว
-- (ยังเก็บราคาสินค้าไว้ใน influ_procedure_items.price เหมือนเดิม เพราะ /influ-cost ใช้เป็นต้นทุน
--  และหน้ากรอกข้อมูลยังโชว์ยอดนั้นให้คนกรอกดูประกอบตอนเคาะวงเงิน)
--
-- voucher_unit = ราคาต่อใบ "ณ ตอนเปิดวงเงิน" เก็บลงแถวไว้เลย ไม่อ่านจากค่าคงที่ตอนแสดงผล
-- ⚠️ บทเรียน 0104: ค่าคงที่ที่เปลี่ยนทีหลังต้องไม่ย้อนไปเขียนความหมายของข้อมูลเก่า
-- ถ้าวันหนึ่ง voucher เปลี่ยนเป็นใบละ 20,000 เคสเก่าต้องยังอ่านได้ว่าเปิดวงเงินเท่าไหร่จริง

alter table public.influencers
  add column if not exists voucher_count integer not null default 0,
  add column if not exists voucher_unit numeric not null default 10000;

alter table public.influencers
  drop constraint if exists influencers_voucher_count_check;
alter table public.influencers
  add constraint influencers_voucher_count_check check (voucher_count >= 0);

alter table public.influencers
  drop constraint if exists influencers_voucher_unit_check;
alter table public.influencers
  add constraint influencers_voucher_unit_check check (voucher_unit > 0);

comment on column public.influencers.voucher_count is
  'จำนวน voucher ที่เปิดวงเงินให้เคสนี้ (0 = ยังไม่เปิด) — วงเงิน = voucher_count × voucher_unit';
comment on column public.influencers.voucher_unit is
  'ราคาต่อ voucher 1 ใบ ณ ตอนเปิดวงเงิน (บาท) — snapshot ไม่ให้ค่าคงที่ในโค้ดย้อนไปเปลี่ยนวงเงินของเคสเก่า';

-- ⚠️ ถังขยะ: influ_restore_backup ใช้ jsonb_populate_record — คีย์ที่ไม่มีใน payload
-- กลายเป็น NULL ตอน insert กลับ ⇒ คอลัมน์ NOT NULL ใหม่ทำให้ backup เก่ากู้ไม่ขึ้น
-- (บทเรียนเดิมจาก 0083) จึงต้องเติมค่าเริ่มต้นให้ payload ทุกแถวที่มีอยู่แล้ว
update public.influ_deleted_backups
set payload = jsonb_set(
      jsonb_set(payload, '{influencer,voucher_count}', '0'::jsonb, true),
      '{influencer,voucher_unit}', '10000'::jsonb, true
    )
where payload ? 'influencer'
  and not (payload -> 'influencer' ? 'voucher_count');
