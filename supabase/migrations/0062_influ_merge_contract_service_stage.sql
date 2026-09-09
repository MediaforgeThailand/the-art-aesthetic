-- Influ pipeline: 6 ขั้น → 5 ขั้น (คำสั่งผู้ใช้ 2026-08-07)
--
-- 1) เคสที่มีไฟล์ Memo ที่อนุมัติแล้ว = ถือว่าผ่านขั้น Memo ต้องไปอยู่ขั้นสัญญา
--    (ต่อจากนี้หน้าเว็บพาไปให้เองตอนอัพไฟล์ — ตรงนี้คือไล่ข้อมูลเก่าที่ค้างอยู่)
-- 2) รวมขั้น "เซนสัญญา" (4) กับ "วันเข้ารับบริการ" (5) เป็นขั้นเดียว = 4
--    เพราะสัญญาถูกเซน/อัพโหลดตอน influ เข้ามารับบริการอยู่แล้ว เป็นงานวันเดียวกัน
--    ⇒ ขั้น "Follow up งาน" เลื่อนจาก 6 → 5
--
-- ต้องรันพร้อมกับโค้ดที่ใช้ INFLU_STAGE (src/lib/influ-constants.ts) —
-- ถ้ารันก่อน deploy แอปเดิมจะอ่านเลขขั้นผิดไป 1 ขั้น

-- 1) มีไฟล์ Memo แล้วแต่ยังค้างขั้น Memo → ขั้นสัญญา (เลข 4 เท่าเดิม ยังไม่ถูกเลื่อน)
update public.influencers
   set stage = 4
 where stage = 3
   and memo_file_path is not null;

-- 2) เลื่อนเลขขั้นที่อยู่หลังจุดรวม: 5 (วันรับบริการ) → 4, 6 (ตามงาน) → 5
--    เคสที่ปิดงานแล้ว/archive (stage 6) ย้ายมาที่ 5 ซึ่งเป็นขั้นสุดท้ายใหม่
update public.influencers
   set stage = stage - 1
 where stage >= 5;

-- 3) ขอบเขตใหม่ของ stage = 1..5 (ของเดิม 1..6 จาก migration 0012)
alter table public.influencers
  drop constraint if exists influencers_stage_check;
alter table public.influencers
  add constraint influencers_stage_check check (stage between 1 and 5);
