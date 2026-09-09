-- Stage 4 (สัญญา): เก็บไฟล์สัญญาที่เซนแล้ว (อัพโหลดเหมือน memo)
alter table influencers
  add column if not exists contract_file_path text,
  add column if not exists contract_file_name text,
  add column if not exists contract_uploaded_at timestamptz;
