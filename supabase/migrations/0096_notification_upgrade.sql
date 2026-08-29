-- ยกระดับระบบแจ้งเตือน (2026-08-29)
--
-- 1) seen_at — แยก "เห็นแล้ว" (ตัวเลขบนกระดิ่ง) ออกจาก "อ่านแล้ว" (สถานะรายแถวแบบอีเมล)
--    เปิดแผงกระดิ่ง = ตัวเลขรีเซ็ตทันที แต่แต่ละแถวยังเป็น "ยังไม่อ่าน" (เส้นขอบเด่น)
--    จนกว่าจะกดเข้าไปดูหรือกด "อ่านทั้งหมด" — พฤติกรรมเดียวกับกล่องอีเมล/Facebook
-- 2) revision_kind — กระดิ่งต้องติดป้ายแยกได้ว่าตีกลับเพราะ "แก้คำผิด" หรือ "แก้เพิ่มเติม"
--    (เดิมยัดคำนำหน้าไว้ในข้อความ preview — อ่านยากและเอามาทำป้ายไม่ได้)
-- 3) push_subscriptions + trigger — ส่ง Web Push ให้เครื่องที่ติดตั้งแอป (PWA) ได้
--    แม้ไม่ได้เปิดเว็บค้างไว้ ผ่าน edge function `send-push`

-- ── 1) seen_at ────────────────────────────────────────────────
alter table public.notifications
  add column if not exists seen_at timestamptz;

-- แถวที่เคยอ่านแล้ว = เห็นแล้วแน่นอน (กันตัวเลขเด้งย้อนหลังตอน deploy)
update public.notifications
set seen_at = read_at
where read_at is not null and seen_at is null;

-- ตัวนับบนกระดิ่งนับจากเงื่อนไขนี้ทุกครั้ง — index บางส่วนให้เบาที่สุด
create index if not exists notifications_unseen_idx
  on public.notifications (recipient_id)
  where seen_at is null;

-- ── 2) revision_kind ──────────────────────────────────────────
alter table public.notifications
  add column if not exists revision_kind text
  check (revision_kind is null or revision_kind in ('mistake', 'addition'));

-- ย้ายคำนำหน้าเดิม "[คำผิด] ..." / "[เพิ่มเติม] ..." ออกจาก preview มาเป็นคอลัมน์
update public.notifications
set
  revision_kind = case
    when preview like '[คำผิด]%' then 'mistake'
    else 'addition'
  end,
  preview = nullif(btrim(regexp_replace(preview, '^\[(คำผิด|เพิ่มเติม)\]', '')), '')
where type = 'rejected'
  and revision_kind is null
  and preview ~ '^\[(คำผิด|เพิ่มเติม)\]';

-- ── 3) Web Push ───────────────────────────────────────────────
-- 1 แถว = 1 เบราว์เซอร์/อุปกรณ์ที่กดอนุญาตแจ้งเตือน (endpoint เป็นความลับของเครื่องนั้น
-- จึงไม่เปิดให้ authenticated อ่านทั้งตารางแบบตารางอื่นในระบบ — เห็นเฉพาะของตัวเอง)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ค่าคีย์สาธารณะ VAPID ให้ฝั่งเบราว์เซอร์ใช้ตอน subscribe
-- (เก็บใน DB ไม่ใช่ env: ย้าย/ส่งมอบระบบแล้วคีย์ตามฐานข้อมูลไปด้วยเป็นชุดเดียวกัน
--  ส่วนคีย์ลับอยู่ใน Vault ชื่อ vapid_private_key / push_secret / push_function_url)
insert into public.app_settings (key, value)
values ('vapid_public_key', null)
on conflict (key) do nothing;

-- ยิง edge function ให้ส่ง push ทุกครั้งที่มีแถวแจ้งเตือนใหม่
-- (ทำที่ DB ไม่ใช่ฝั่ง client เพราะ push ต้องส่งได้แม้คนที่ทำให้เกิดเหตุการณ์ปิดแท็บไปแล้ว)
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
  -- push เป็นของแถม: พังตรงไหนก็ห้ามทำให้การ insert แจ้งเตือนในแอปล้มตาม
  begin
    v_url := public.get_app_secret('push_function_url');
    v_secret := public.get_app_secret('push_secret');
    if v_url is null or v_secret is null then
      return null;
    end if;
    -- ยังไม่มีอุปกรณ์ไหนสมัครไว้ = ไม่ต้องเสียเที่ยวเรียก function
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

drop trigger if exists notifications_push_after_insert on public.notifications;
create trigger notifications_push_after_insert
  after insert on public.notifications
  for each row execute function public.notify_push();
