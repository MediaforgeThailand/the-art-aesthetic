-- ทะเบียนแพทย์ (จัดการหมอ): ชื่อ + รูปโปรไฟล์ ใช้เป็นตัวเลือก "แพทย์ที่รับเคส"
-- ใน Influ Management / Influ Calendar — จับคู่กับ influencers.doctor_name /
-- influ_calendar_events.doctor_name ด้วย "ชื่อ" (คอลัมน์เดิมยังเป็น text เหมือนเดิม
-- ข้อมูลเก่าไม่ต้อง migrate; เปลี่ยนชื่อหมอใน UI จะตามแก้แถวที่ชื่อตรงกันให้)
create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.doctors is
  'ทะเบียนแพทย์สำหรับตัวเลือก "แพทย์ที่รับเคส" (จับคู่กับ doctor_name ด้วยชื่อ; active=false = ซ่อนจากตัวเลือกแต่ชื่อในเคสเก่ายังแสดง)';

create unique index if not exists doctors_name_key on public.doctors (name);

create or replace trigger doctors_set_updated_at
  before update on public.doctors
  for each row execute function public.set_updated_at();

alter table public.doctors enable row level security;

drop policy if exists "authenticated full access doctors" on public.doctors;
create policy "authenticated full access doctors"
  on public.doctors
  for all to authenticated using (true) with check (true);

-- seed จากชื่อแพทย์ที่ทีมเคยพิมพ์ไว้แล้ว (ทั้งในเคสและในคิวปฏิทิน) — ตัวเลือกไม่เริ่มจากศูนย์
insert into public.doctors (name)
select distinct trim(doctor_name)
from (
  select doctor_name from public.influencers where doctor_name is not null
  union all
  select doctor_name from public.influ_calendar_events where doctor_name is not null
) t
where trim(doctor_name) <> ''
on conflict (name) do nothing;

-- PostgREST แคช schema ไว้ — ไม่ reload จะ query ตารางใหม่ไม่เจอ
notify pgrst, 'reload schema';
