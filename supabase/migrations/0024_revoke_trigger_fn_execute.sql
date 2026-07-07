-- ============================================================
-- 0024 — กัน client เรียก trigger function (SECURITY DEFINER) ผ่าน PostgREST RPC
-- (เรียกตรงๆ ไม่ได้อยู่แล้วเพราะ return type เป็น trigger แต่ revoke ให้ชัดตาม advisor)
-- ============================================================

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_role_change() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
