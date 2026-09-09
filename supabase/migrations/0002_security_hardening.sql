-- ปิดช่องตาม security advisor
-- (applied remotely as 20260703122156_security_hardening)
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- rls_auto_enable() เป็น event trigger ที่ "แพลตฟอร์ม Supabase" สร้างให้เอง ไม่ได้มาจาก
-- migration ในรีโปนี้ — บน Postgres เปล่า/self-host ที่ยังไม่มีฟังก์ชันนี้ คำสั่ง revoke
-- จะ error แล้วทำให้ migration ทั้งชุดหยุดตั้งแต่ไฟล์ที่สอง จึงต้องข้ามอย่างปลอดภัย
-- (ผลลัพธ์บนโปรเจกต์จริงเหมือนเดิมทุกประการ — ที่นั่นมีฟังก์ชันอยู่แล้ว revoke จึงทำงาน)
do $$
begin
  execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
exception
  when undefined_function then
    raise notice 'ข้าม revoke rls_auto_enable() — ไม่มีฟังก์ชันนี้ (ไม่ได้รันบน Supabase cloud)';
end $$;
