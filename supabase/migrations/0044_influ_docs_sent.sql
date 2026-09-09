-- ติ๊ก "ส่งเอกสารแล้ว" ในคิวรอทำ Memo (แท็บ "รอทำ Memo" ของ /influencers)
-- null = ยังไม่ได้ส่ง · มีค่า = เวลาที่ติ๊กว่าส่งเอกสารให้ influencer แล้ว
-- ใช้กันงานซ้ำ: ทีมเห็นได้ว่าเคสไหนส่งเอกสารไปแล้ว ระหว่างที่ยังรอทำ Memo อยู่
alter table influencers
  add column if not exists docs_sent_at timestamptz;

comment on column influencers.docs_sent_at is
  'เวลาที่ทำเครื่องหมายว่า "ส่งเอกสารแล้ว" ในคิวรอทำ Memo (null = ยังไม่ส่ง)';
