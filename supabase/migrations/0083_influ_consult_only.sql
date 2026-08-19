-- เคส "รอปรึกษา" + ค่าตัว influencer + ความหมายใหม่ของ docs_sent_at (ผู้ใช้ 2026-08-19)
--
-- 1) consult_only = เปิดเคสได้โดยยังไม่ระบุหัตถการ (influ เข้ามาปรึกษาแพทย์ก่อน
--    แล้วค่อยเคาะว่าจะทำอะไร) — ปกติ "สร้างนัดใหม่" บังคับเลือกหัตถการอย่างน้อย 1 รายการ
--    ธงนี้คือทางออกเดียวที่ข้ามข้อบังคับนั้นได้ และเป็นตัวบอกทีมว่าทำไมเคสยังไม่มีหัตถการ
-- 2) talent_fee = ค่าตัวที่ต้องจ่ายให้ influencer (คนละก้อนกับ case_value ที่เป็นมูลค่าหัตถการ)
--    — คอลัมน์นี้มีอยู่บน remote แล้ว (มาจากงานอีกสายที่ทำพร้อมกัน) จึงเป็น if not exists
--    เพื่อให้ชุด migration replay บน stack เปล่าได้ครบเหมือนกัน
-- 3) docs_sent_at เปลี่ยนความหมายเป็น "ส่ง Memo แล้ว" — แท็บ "รอทำ Memo" ถูกถอดออกจากบอร์ด
--    (เคสที่สร้างจากฟอร์มใหม่ = พร้อมทำ Memo ทันที ไม่ต้องมีคิวแยก) ติ๊กนี้ย้ายไปอยู่ในหน้าเคส
--    และโชว์เป็นติ๊กถูกเล็กๆ บนการ์ดบอร์ด — ข้อมูลเดิมความหมายเดียวกัน ไม่ต้อง backfill
alter table influencers
  add column if not exists consult_only boolean not null default false,
  add column if not exists talent_fee numeric;

comment on column influencers.consult_only is
  'true = เคส "รอปรึกษา" (เปิดเคส/ทำ Memo ได้โดยยังไม่ระบุหัตถการ) — ปกติต้องมีหัตถการอย่างน้อย 1 รายการ';

comment on column influencers.talent_fee is
  'ค่าตัวที่จ่ายให้ influencer (บาท) — null/0 = เคสแลกหัตถการไม่มีค่าตัว; ไม่รวมใน case_value';

comment on column influencers.docs_sent_at is
  'เวลาที่ติ๊กว่า "ส่ง Memo แล้ว" (null = ยังไม่ส่ง) — ติ๊กในหน้าเคส แสดงเป็นติ๊กถูกบนการ์ดบอร์ด';

-- ถังขยะ 30 วัน (influ_deleted_backups) เก็บเคสเป็น jsonb ก้อนเดียว แล้วกู้คืนด้วย
-- jsonb_populate_record → คีย์ที่ไม่มีใน payload กลายเป็น NULL ตอน insert กลับ
-- ⇒ consult_only ที่เป็น NOT NULL จะทำให้ backup ที่ถูกลบ "ก่อน" migration นี้กู้คืนไม่ได้
-- (นี่เป็นคอลัมน์ NOT NULL ตัวแรกที่เพิ่มหลังระบบถังขยะเกิด — คอลัมน์ NOT NULL ตัวต่อไป
--  ต้องเติม payload เก่าแบบนี้ทุกครั้ง ไม่งั้นของในถังกู้ไม่ขึ้นเงียบๆ)
update influ_deleted_backups
set payload = jsonb_set(payload, '{influencer,consult_only}', 'false'::jsonb, true)
where entity = 'influencer'
  and payload ? 'influencer'
  and not (payload -> 'influencer' ? 'consult_only');
