-- 0098: การ์ดจาก brief ตรวจ 2 ชั้น (ผู้สั่ง brief → ผู้ตรวจจริง) + ระดับความสำคัญของแจ้งเตือน
--
-- ที่มา (ผู้ใช้ 2026-08-29): graphic ที่กดรับ brief ไม่เคยได้แจ้งเตือนตอนถูกตีกลับ เพราะ
-- flow เดิมบังคับให้ "ผู้สั่ง brief" เป็นคนกดส่งตรวจแทน — งานเลยไม่เคยเป็นของ graphic จริง
--
-- flow ใหม่ของการ์ดที่มาจาก brief:
--   ทอด 0 = ผู้สั่ง brief ตรวจก่อน (graphic เป็นคนกดส่งตรวจเอง)
--   ทอด 1 = ผู้ตรวจจริง (ผู้สั่ง brief เป็นคนกด "ส่งตรวจจริง" ต่อให้)
--   ทอด 2 = ผู้ตรวจลำดับ 2 (เหมือนเดิม)
-- review_step เป็น smallint ไม่มี check constraint อยู่แล้ว จึงรับค่า 0 ได้เลย

-- 1) ตีกลับของผู้สั่ง brief = ชนิดใหม่ 'brief' (ไม่มีตัวเลือกให้กด ไม่นับ KPI —
--    KPI นับเฉพาะการตีกลับจากผู้ตรวจจริง แต่ยังบันทึกลงแชทเป็นรอบแก้ตามเดิม)
alter table public.task_comments
  drop constraint if exists task_comments_revision_kind_valid;
alter table public.task_comments
  add constraint task_comments_revision_kind_valid check (
    (is_revision = true and revision_kind in ('mistake', 'addition', 'brief'))
    or (is_revision = false and revision_kind is null)
  );

-- 2) คนที่ตีกลับล่าสุด — ใช้ส่งงานที่แก้แล้วกลับไปหาคนเดิมโดยไม่ต้องไล่ทอดใหม่
alter table public.tasks
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null;
comment on column public.tasks.rejected_by is
  'ผู้ตีกลับล่าสุด — ตีกลับ "เพิ่มเติม" แล้วกด "ส่งตรวจแก้" จะวิ่งกลับมาที่คนนี้ตรงๆ (ข้ามผู้สั่ง brief); ล้างเมื่ออนุมัติ/ยกเลิกส่งตรวจ/เปิดงานใหม่';

-- 3) ระดับความสำคัญของแจ้งเตือน — primary = เรื่องที่ต้องลงมือทำ (เด่น + เด้งเข้าเครื่อง)
--    secondary = แค่เกี่ยวข้อง (ขึ้นในกระดิ่งแบบเงียบๆ ไม่เด้ง)
alter table public.notifications
  add column if not exists priority text not null default 'primary';
alter table public.notifications
  drop constraint if exists notifications_priority_valid;
alter table public.notifications
  add constraint notifications_priority_valid check (priority in ('primary', 'secondary'));
comment on column public.notifications.priority is
  'primary = ต้องลงมือทำ (ป้ายเรืองแสง + Web Push) · secondary = เกี่ยวข้องเฉยๆ (ไม่เด่น ไม่เด้ง)';

-- 4) Web Push เฉพาะเรื่องที่ต้องลงมือทำ — ไม่งั้นคนที่แค่เกี่ยวข้องโดนเด้งรัวจนปิดแจ้งเตือนทิ้ง
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    if new.priority = 'secondary' then
      return null;
    end if;
    v_url := public.get_app_secret('push_function_url');
    v_secret := public.get_app_secret('push_secret');
    if v_url is null or v_secret is null then
      return null;
    end if;
    if not exists (
      select 1 from public.push_subscriptions s where s.user_id = new.recipient_id
    ) then
      return null;
    end if;
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', v_secret
      ),
      body := jsonb_build_object('notification_id', new.id),
      timeout_milliseconds := 15000
    );
  exception
    when others then
      null;
  end;
  return null;
end;
$$;

-- 5) การ์ดจาก brief ที่ยังทำอยู่ (ยังไม่ส่งตรวจ/ยังไม่จบ) เข้าทอด 0 ทันที
--    งานที่ส่งตรวจค้างอยู่กับผู้ตรวจจริงแล้วไม่ถูกแตะ (ปล่อยให้จบทอดเดิมไป)
update public.tasks
set review_step = 0
where brief_source_id is not null
  and review_status = 'none'
  and completed = false
  and deleted_at is null
  and created_by is not null
  and created_by <> assignee_id
  and review_step = 1;
