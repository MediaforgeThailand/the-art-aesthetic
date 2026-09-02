-- 0104: ขั้นย่อยของ Memo (1.0/1.1/1.2) + บทบาทผู้รับผิดชอบแบบใหม่ (owner/follower/memo)
--
-- 1) influencers.memo_submitted_at = เวลาที่ "ผู้ออก Memo" กดยืนยันว่าทำเอกสารส่งแล้ว (ขั้น 1.1 -> 1.2)
--    ขั้นย่อยคำนวณจากคอลัมน์เดิม + คอลัมน์นี้ (เลข stage ยังเป็น 1 ตลอด):
--      1.0 = docs_sent_at is null            (รอผู้ดูแลยืนยันส่งเรื่อง memo)
--      1.1 = docs_sent_at != null && memo_submitted_at is null   (รอผู้ออก memo ทำเอกสาร)
--      1.2 = memo_submitted_at != null && memo_file_path is null (รออัพไฟล์ memo ที่อนุมัติแล้ว)
--    อัพไฟล์ memo = เลื่อนเข้า stage 2 (กลไกเดิมใน uploadMemo)
--    nullable โดยตั้งใจ — บทเรียนถังขยะ 0083: คอลัมน์ NOT NULL ใหม่ทำให้ backup เก่ากู้ไม่ขึ้น
alter table public.influencers
  add column if not exists memo_submitted_at timestamptz;

-- 2) ขยาย check ของ influ_assignees.scopes ให้รองรับบทบาทใหม่ 3 ตัว
--    owner = ผู้ดูแล (สร้างเคส ตามจนเซนสัญญา) / follower = ผู้ติดตาม (สัญญา -> follow up)
--    memo = ผู้ออก Memo (ทำขั้น 1.1, 1.2 — ใช้คีย์เดิม)
--    คงค่าเก่า contract/followup ไว้ใน superset — แถวเดิมและ payload ในถังขยะ
--    (influ_deleted_backups) ยังกู้คืนผ่าน check นี้ได้ ไม่ต้อง rewrite ข้อมูล
--    (โค้ดอ่านค่าเก่าผ่าน normalizeRoles(): contract->owner, followup->follower)
alter table public.influ_assignees
  drop constraint if exists influ_assignees_scopes_valid;
alter table public.influ_assignees
  add constraint influ_assignees_scopes_valid
  check (scopes <@ array['owner', 'follower', 'memo', 'contract', 'followup']::text[]);
