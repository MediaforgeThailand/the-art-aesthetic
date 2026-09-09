-- 0045: ตั้ง file_size_limit ของ bucket documents ให้เต็ม 50 MB
-- เดิม (0001) สร้าง bucket โดยไม่ตั้ง file_size_limit → ตกไปใช้ค่ากลางของโปรเจกต์
-- ตั้งชัดเป็น 50 MiB เพื่อให้อัปโหลดวิดีโอใน Task ได้ใหญ่สุดเท่าที่แผน Free อนุญาต
-- (วิดีโอชนเพดานเร็วเพราะไฟล์ใหญ่กว่ารูป) — ค่านี้เก็บใน git เพื่อ reproduce ตอน self-host
--
-- ⚠️ 50 MB = เพดานสูงสุดของ Supabase Free plan (ลิมิตกลางล็อกไว้ ดันเกินไม่ได้)
--    ถ้าอัพเป็น Pro แล้วอยากได้ใหญ่กว่านี้: (1) เพิ่มลิมิตกลางที่ Dashboard → Storage → Settings
--    (2) แก้เลขด้านล่างให้ตรง (3) เปลี่ยน upload ฝั่ง client เป็น resumable (TUS) สำหรับไฟล์หลักร้อย MB
--    ไม่งั้น standard upload อาจ timeout ที่ gateway
update storage.buckets
  set file_size_limit = 52428800  -- 50 * 1024 * 1024 ไบต์
  where id = 'documents';
