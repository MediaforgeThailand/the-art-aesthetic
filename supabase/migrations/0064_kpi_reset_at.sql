-- จุดเริ่มนับ KPI การตีกลับใหม่ (คำสั่งผู้ใช้ 2026-08-08: "ให้เริ่มนับใหม่เลย หลังแก้ไป")
--
-- เก็บใน app_settings เพื่อให้รีเซ็ตรอบใหม่ได้โดยไม่ต้องแก้โค้ด:
--   update public.app_settings set value = now()::text where key = 'kpi_reset_at';
-- หน้า Team Workload นับเฉพาะการตีกลับที่ created_at >= ค่านี้
-- (การตีกลับก่อนหน้ายังอยู่ในแชทของงานครบ — แค่ไม่ถูกนับเป็น KPI รอบนี้)

insert into public.app_settings (key, value)
values ('kpi_reset_at', now()::text)
on conflict (key) do nothing;
