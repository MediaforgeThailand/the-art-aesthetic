-- ลงทะเบียนอุปกรณ์รับ push ผ่าน RPC แทน upsert ตรง (2026-08-29)
--
-- เหตุผล: endpoint ของ push service เป็นของ "เบราว์เซอร์" ไม่ใช่ของ "คน" — เครื่องที่ทีม
-- ใช้ร่วมกันแล้วสลับคนล็อกอิน จะได้ endpoint เดิมซึ่งมีเจ้าของเป็นคนก่อนหน้า; upsert ตรงจาก
-- client จึงถูก RLS ตีตก (แถวเดิมมองไม่เห็น → ตกไป insert → ชน unique constraint)
-- SECURITY DEFINER ที่ตั้ง user_id = auth.uid() ให้เองจึงย้ายเจ้าของได้ถูกต้อง
-- และ client ก็ปลอมชื่อเจ้าของไม่ได้ด้วย (ไม่ต้องเปิด policy update ให้กว้างขึ้น)
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องล็อกอินก่อนจึงจะลงทะเบียนอุปกรณ์ได้';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text)
  from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text)
  to authenticated;
