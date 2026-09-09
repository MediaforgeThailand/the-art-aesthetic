-- บันทึกงาน: เก็บไฟล์/ลิงก์งานที่ได้รับอนุมัติบน task + คอมเมนต์แนบไฟล์/ลิงก์
-- และติ๊กเป็น "การแก้ไข" พร้อมเลขครั้ง (ใช้นับจำนวนแก้ไขต่อคนต่อเดือนเพื่อวัด KPI)
alter table tasks
  add column if not exists deliverable_url text,
  add column if not exists deliverable_file_path text;

alter table task_comments
  add column if not exists is_revision boolean not null default false,
  add column if not exists revision_number int,
  add column if not exists file_path text,
  add column if not exists link_url text;
