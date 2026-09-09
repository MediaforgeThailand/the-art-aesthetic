-- สถานะ "ปฏิเสธ" ของ influencer (ติดต่อแล้วไม่ร่วมงาน) — null = ไม่ได้ปฏิเสธ
-- mark/ยกเลิกจากปุ่มบนการ์ดบอร์ด Influ Management; ตัวกรอง "ยกเว้น" ซ่อนได้ (default ซ่อน)
alter table public.influencers
  add column if not exists declined_at timestamptz;
