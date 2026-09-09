-- 0086 — ยุบ pipeline ของเคส Influ จาก 5 ขั้นเหลือ 3 ขั้น (คำสั่งผู้ใช้ 2026-08-22)
--
-- เหตุผล: ขั้น 1 "ติดต่อ / Follow up" กับขั้น 2 "เก็บรายละเอียดเคส" ไม่ใช่งานของหน้าเคสแล้ว
--   * งานล่า/ทักก่อนตอบรับ ย้ายไปบอร์ด Hunting ตั้งแต่ 0081 (มีโปรไฟล์ = ตอบรับแล้ว)
--   * รายละเอียดเคสถูกกรอกตั้งแต่ตอน "สร้างนัดใหม่" (0080) และแก้ได้ตลอดจนกว่าจะปิดงาน
--     จึงกลายเป็นแท็บ "รายละเอียดเคส" ที่ไม่มีเลขขั้น ไม่ใช่ด่านที่ต้องเดินผ่าน
-- ผลคือ Memo (เดิม 3) = ขั้น 1, สัญญา+รับบริการ (เดิม 4) = 2, Follow up (เดิม 5) = 3
--
-- หมายเหตุลำดับ deploy (บทเรียนเดียวกับ 0062): push โค้ดก่อนแล้วค่อยรัน migration นี้
-- ระหว่างนั้นแอปเวอร์ชันเก่าจะอ่านเลขขั้นเพี้ยนไป 2 ขั้นชั่วครู่

-- ข้อมูลจริงตอนรัน: ไม่มีเคสไหนค้างที่ stage 1-2 แล้ว (3=14, 4=153, 5=3)
-- greatest() กันเคสที่โผล่มาระหว่างนี้ (หรือ replay บนฐานเก่า) ไม่ให้ได้เลขต่ำกว่า 1
update public.influencers set stage = greatest(1, stage - 2);

-- ถังขยะ 30 วัน: payload เก็บ stage ดิบไว้ ต้องเลื่อนเลขตามด้วย
-- ไม่งั้นกู้คืนแล้วเคสไปโผล่ผิดขั้น (และถ้าเกินเพดานใหม่จะติด check constraint)
update public.influ_deleted_backups
set payload = jsonb_set(
      payload,
      '{influencer,stage}',
      to_jsonb(greatest(1, coalesce((payload -> 'influencer' ->> 'stage')::int, 1) - 2))
    )
where payload -> 'influencer' ? 'stage';

alter table public.influencers drop constraint if exists influencers_stage_check;
alter table public.influencers
  add constraint influencers_stage_check check (stage between 1 and 3);
