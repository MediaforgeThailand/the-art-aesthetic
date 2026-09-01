-- 0101 — ขยาย product team จาก 4 เป็น 9 ทีม + ผูก "ทีม" เข้ากับทะเบียนหมอ
--
-- (1) บริษัทแบ่งทีมสินค้าเป็น 9 หัตถการใหญ่ (ไม่นับกลุ่ม "Other" ของรายงานยอดขาย)
--     ค่าคีย์ = แฮชแท็กของทีม จึงต้องเป็น "ตัวพิมพ์เล็กล้วน ไม่มีขีด/เว้นวรรค"
--     (IG/FB ตัดแฮชแท็กทิ้งที่เครื่องหมาย `-`)
-- (2) doctors.teams = ทีมที่หมอแต่ละท่านทำ — 1 ท่านอยู่ได้หลายทีม
--     ระบบทีมคอนเทนต์ (หน้าจัดการแท็ก + แท็กหมอบนงาน) แสดงเฉพาะหมอที่มี 'aesthetics'
--     ส่วนหน้า /influ-doctors ของระบบ Influ เห็นทุกทีม
--     ค่าเริ่มต้น 'aesthetics' = ทะเบียนเดิมทั้งหมดเป็นหมอฝั่ง Aesthetics อยู่แล้ว

-- ---------- 1) รายชื่อทีมที่ยอมรับได้ ----------

alter table public.influ_services
  drop constraint if exists influ_services_team_valid;
alter table public.influ_services
  add constraint influ_services_team_valid
  check (
    team in (
      'aesthetics', 'breast', 'abdomen', 'lipo',
      'noseopen', 'noseclosed', 'chin', 'eyes', 'facelift'
    )
  );

alter table public.influ_procedure_items
  drop constraint if exists influ_procedure_items_team_valid;
alter table public.influ_procedure_items
  add constraint influ_procedure_items_team_valid
  check (
    product_team in (
      'aesthetics', 'breast', 'abdomen', 'lipo',
      'noseopen', 'noseclosed', 'chin', 'eyes', 'facelift'
    )
  );

-- ---------- 2) ทีมของหมอ ----------

alter table public.doctors
  add column if not exists teams text[] not null default array['aesthetics']::text[];

alter table public.doctors
  drop constraint if exists doctors_teams_valid;
alter table public.doctors
  add constraint doctors_teams_valid
  check (
    array_length(teams, 1) >= 1
    and teams <@ array[
      'aesthetics', 'breast', 'abdomen', 'lipo',
      'noseopen', 'noseclosed', 'chin', 'eyes', 'facelift'
    ]::text[]
  );

create index if not exists doctors_teams_idx on public.doctors using gin (teams);

comment on column public.doctors.teams is
  'ทีม product ที่หมอท่านนี้ทำ (0101) — บังคับอย่างน้อย 1 ทีม; ระบบทีมคอนเทนต์แสดงเฉพาะแถวที่มี aesthetics';
