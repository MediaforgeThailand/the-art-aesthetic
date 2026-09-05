-- ============================================================
-- 0109 — แจ้งเตือนของระบบ Influencer: Web Push + "เห็นแล้ว" (seen_at)
--
-- ปัญหาเดิม (audit 2026-09-03): ระบบ Task มี Web Push ตั้งแต่ 0096 แต่ระบบ Influ
-- ไม่มีเลย ⇒ ปิดแท็บแล้วไม่รู้เรื่องอะไรทั้งนั้น (ทีมทำงานจากมือถือเป็นหลัก)
-- และกระดิ่ง Influ ยังนับ badge จาก read_at ⇒ ตัวเลขไม่ดับจนกว่าจะกดอ่านทีละใบ
-- ต่างจากกระดิ่ง Task ที่แยก "เห็นแล้ว" (badge ดับตอนเปิดแผง) ออกจาก "อ่านแล้ว"
--
-- กติกา push ของระบบนี้: **ส่งเฉพาะ level = 'action'** — ระดับ 'update' คือ
-- "รู้ไว้เฉยๆ" (รวมทุกอย่างของผู้เกี่ยวข้อง) ไม่ควรเด้งขึ้นจอใคร
-- (ตรงกับกติกาของ Task ที่ priority='secondary' ไม่ push)
-- ============================================================

alter table public.influ_notifications
  add column if not exists seen_at timestamptz;

comment on column public.influ_notifications.seen_at is
  'เห็นแล้ว (เปิดแผงกระดิ่ง) — คนละเรื่องกับ read_at ที่แปลว่ากดเข้าไปดูแล้ว';

-- badge บนกระดิ่งนับจาก "ยังไม่เห็น" — index บางเพื่อให้ count เร็ว
create index if not exists influ_notifications_unseen_idx
  on public.influ_notifications (recipient_id)
  where seen_at is null;

create or replace function public.influ_notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text;
  v_secret text;
begin
  begin
    -- 'update' = รู้ไว้เฉยๆ (และเป็นระดับของ "ผู้เกี่ยวข้อง" เสมอ) — ไม่เด้ง
    if new.level is distinct from 'action' then
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
      -- source = influ ⇒ edge function ไปอ่านจากตาราง influ_notifications
      -- (ข้อความ/ปลายทางเก็บอยู่บนแถวอยู่แล้ว ไม่ต้องมี messageOf ซ้ำอีกชุด)
      body := jsonb_build_object('notification_id', new.id, 'source', 'influ'),
      timeout_milliseconds := 15000
    );
  exception
    when others then
      -- push พังห้ามทำให้ insert แจ้งเตือนในแอปล้มตาม (กติกาเดิมของ 0096)
      null;
  end;
  return null;
end;
$fn$;

drop trigger if exists influ_notifications_push_after_insert on public.influ_notifications;
create trigger influ_notifications_push_after_insert
  after insert on public.influ_notifications
  for each row execute function public.influ_notify_push();
