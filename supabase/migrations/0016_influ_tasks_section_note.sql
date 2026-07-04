-- Stage 6 แบบ checklist 5 หมวดตามเอกสารโรงพยาบาล: เพิ่มหมวด + หมายเหตุรายข้อ
alter table influ_tasks
  add column if not exists section text,
  add column if not exists note text;
