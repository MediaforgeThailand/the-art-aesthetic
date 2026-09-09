-- 0046: ถอน file_size_limit ของ bucket documents กลับเป็น null — rollback ของ 0045
-- หลังรัน 0045 (ตั้ง 52428800) ทีมรายงานทันทีว่าอัปโหลดไฟล์ใน Task ไม่ได้เลย "ทุกขนาดไฟล์"
-- ไม่ใช่แค่ไฟล์ใหญ่ → rollback กลับค่าเดิม; null = ใช้ลิมิตกลางของโปรเจกต์
-- ซึ่งเป็นสภาพที่ใช้งานได้ปกติมาตลอดตั้งแต่ 0001
--
-- ตอน rollback ตรวจแล้วว่าไม่ใช่สาเหตุอื่น: deploy READY ทุกตัว, โค้ดอัปโหลดไม่ถูกแก้,
-- storage service ปกติ (ปฏิเสธ anon ด้วย RLS ตามที่ควร), พื้นที่ใช้ไป 461MB/1GB (ไม่เต็ม)
--
-- ⚠️ ห้ามตั้ง storage.buckets.file_size_limit ด้วย SQL ตรงๆ อีก
--    ค่านี้ต้องตั้งผ่าน Storage API / Dashboard ซึ่งมี validation เทียบกับลิมิตกลางของโปรเจกต์
--    การ update ตารางตรงๆ ข้าม validation นั้น แล้วทำให้ bucket อยู่ในสถานะที่ service ไม่ยอมรับ
--    อยากเพิ่มเพดานขนาดไฟล์: ทำที่ Dashboard → Storage → Settings
--    (Free plan ตันที่ 50MB — เกินกว่านั้นต้องอัพเป็น Pro)
update storage.buckets
  set file_size_limit = null
  where id = 'documents';
