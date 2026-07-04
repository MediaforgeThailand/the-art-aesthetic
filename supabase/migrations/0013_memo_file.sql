-- ไฟล์ Memo ที่อนุมัติแล้ว (อัพโหลดใน Stage 3 — memo ทำนอกระบบตามฟอร์มบริษัท)
alter table influencers
  add column if not exists memo_file_path text,
  add column if not exists memo_file_name text,
  add column if not exists memo_uploaded_at timestamptz;
