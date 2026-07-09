-- Brief workflow: ชนิดของเซคชัน + ฟิลด์สั่งงานบน tasks
-- section type: work (ชิ้นงานปกติ) | brief (สั่งงาน — การ์ดมีปุ่ม "รับงาน" แล้วสร้างการ์ด creative ต่อ)

alter table public.task_sections
  add column if not exists type text not null default 'work';

-- ตั้งเซคชัน "Contents Brief" เป็นชนิด brief
update public.task_sections set type = 'brief' where name ilike '%brief%';

-- ฟิลด์ Brief workflow บน tasks
alter table public.tasks
  add column if not exists brief_content_type text,        -- 'graphic' | 'video'
  add column if not exists brief_accepted_at timestamptz,  -- เวลาที่ผู้รับกด "รับงาน" (null = ยังไม่รับ)
  add column if not exists brief_source_id uuid references public.tasks(id) on delete set null;

comment on column public.task_sections.type is 'work = ชิ้นงานปกติ, brief = สั่งงาน (การ์ดมีปุ่มรับงาน แล้วสร้างการ์ด creative ต่อ)';
comment on column public.tasks.brief_content_type is 'ชนิดงานของ brief/creative: graphic | video';
comment on column public.tasks.brief_accepted_at is 'เวลาที่ผู้รับกด "รับงาน" ในการ์ด brief (null = ยังไม่รับ)';
comment on column public.tasks.brief_source_id is 'บนการ์ด creative — ชี้กลับไปการ์ด brief ต้นทางที่สร้างมัน';
