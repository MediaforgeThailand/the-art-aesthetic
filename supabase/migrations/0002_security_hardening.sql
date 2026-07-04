-- ปิดช่องตาม security advisor
-- (applied remotely as 20260703122156_security_hardening)
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
