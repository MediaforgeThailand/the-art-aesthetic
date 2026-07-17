-- Stage 3 (Memo ขออนุมัติ): ติ๊กว่า "ข้อมูลสำหรับทำ memo ครบแล้ว"
-- ใช้รวมรายชื่อที่รอ influ manager ทำ memo ในแท็บ "รอทำ Memo" ของหน้า /influencers
alter table influencers
  add column if not exists memo_ready_at timestamptz;

comment on column influencers.memo_ready_at is
  'เวลาที่ติ๊กว่าข้อมูลสำหรับทำ memo ครบแล้ว (null = ยังไม่ติ๊ก) — แท็บ "รอทำ Memo" = stage 3 + ติ๊กแล้ว + ยังไม่ได้อัพโหลดไฟล์ memo';

-- แท็บ "รอทำ Memo" กรองด้วย stage + memo_ready_at เป็นหลัก
create index if not exists influencers_memo_ready_idx
  on influencers (memo_ready_at)
  where memo_ready_at is not null;

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query คอลัมน์ใหม่ไม่เจอ (column does not exist)
notify pgrst, 'reload schema';
