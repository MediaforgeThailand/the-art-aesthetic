-- 0092 — ถอดขั้น "Follow up งาน" ออกจาก pipeline ของเคส Influ (คำสั่งผู้ใช้ 2026-08-29)
--         + บังคับเลือกช่องทางของลิงก์โพส (influ_post_links.platform)
--
-- เหตุผล: การติดตามผลงานถูกยกไปอยู่ที่หน้า **Follow Up** (`/influencers/contracts`)
--   ซึ่งเป็นทั้งที่ "ตั้งเป้าว่าต้องลงคลิปช่องไหนกี่โพส" และที่ "ติดตามจริง" ในหน้าเดียว
--   (ผู้ใช้: "หน้าติดตามเดิมให้เอาออกและให้ใช้หน้านี้เป็นหน้าเพิ่มการติดตามและติดตามไปในตัวเลย")
--   ⇒ ขั้นที่ 3 ในหน้าเคสไม่มีงานเหลือให้ทำ จึงถอดทิ้งทั้งขั้น
--   เคส "เข้าสู่การติดตาม" เมื่ออัพไฟล์สัญญา (contract_start ถูกตั้ง) และ "ปิดงาน" กดจากหน้านั้น
--   ⇒ โค้ดที่เคยเทียบ stage > contractService เปลี่ยนไปเช็ค contract_start แทน (costUsageOf ด้วย)
--
-- ผลคือ Memo = ขั้น 1, สัญญา + วันรับบริการ = ขั้น 2 (ขั้นสุดท้าย)
--
-- หมายเหตุลำดับ deploy (บทเรียนเดียวกับ 0062/0086): push โค้ดก่อนแล้วค่อยรัน migration นี้
-- ระหว่างนั้นแอปเวอร์ชันเก่าจะอ่านเลขขั้นเพี้ยนไป 1 ขั้นชั่วครู่

-- ข้อมูลจริงตอนรัน: stage 1 = 17, stage 2 = 153, stage 3 = 4
-- least() ทำให้เคสขั้น 3 ตกมาอยู่ขั้นสุดท้าย (สัญญา+รับบริการ) ซึ่งเป็นขั้นที่เคยผ่านมาแล้วจริง
update public.influencers set stage = least(stage, 2);

-- ถังขยะ 30 วัน: payload เก็บ stage ดิบไว้ ต้องหนีบเลขตามด้วย
-- ไม่งั้นกู้คืนแล้วชน check constraint ใหม่
update public.influ_deleted_backups
set payload = jsonb_set(
      payload,
      '{influencer,stage}',
      to_jsonb(least(coalesce((payload -> 'influencer' ->> 'stage')::int, 1), 2))
    )
where payload -> 'influencer' ? 'stage';

alter table public.influencers drop constraint if exists influencers_stage_check;
alter table public.influencers
  add constraint influencers_stage_check check (stage between 1 and 2);

-- ---------------------------------------------------------------------------
-- ช่องทางของลิงก์โพส — ฟอร์มแปะลิงก์บังคับให้เลือกจาก "เป้าโพสตามสัญญา" ที่ตั้งไว้
-- (ผู้ใช้: "เพิ่มในช่องเพิ่มลิงค์ ให้บังคับให้เลือกว่าลิงค์โพสเขานั้นเป็นช่องไหน
--   ตัวเลือกต้องแสดงจากเป้าโพสตามสัญญาที่ KPI ตอนแรกตั้งไว้")
--
-- เดิมช่องทางถูกเดาจาก hostname ของลิงก์ (postPlatformOf) ซึ่งพลาดกับลิงก์ย่อ/ครอสโพส
-- คอลัมน์นี้ nullable โดยตั้งใจ: แถวเก่าตกไปใช้การเดาเหมือนเดิมผ่าน postLinkPlatform()
-- และ backup ในถังขยะที่ไม่มีคีย์นี้ยังกู้คืนได้ (บทเรียน NOT NULL จาก 0083)
alter table public.influ_post_links
  add column if not exists platform text;

alter table public.influ_post_links
  drop constraint if exists influ_post_links_platform_check;
alter table public.influ_post_links
  add constraint influ_post_links_platform_check check (
    platform is null
    or platform in (
      'tiktok', 'instagram', 'facebook', 'youtube', 'lemon8', 'x', 'line', 'other'
    )
  );

comment on column public.influ_post_links.platform is
  'ช่องทางที่ทีมเลือกเองตอนแปะลิงก์ (null = แถวเก่า ให้เดาจาก hostname ด้วย postLinkPlatform)';
