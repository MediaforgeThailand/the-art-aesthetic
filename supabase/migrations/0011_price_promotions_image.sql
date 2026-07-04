-- รูปภาพประกอบโปรโมชัน (URL ภายนอกหรือ storage path) — null = ใช้ภาพ generate จากระบบ
-- (applied remotely as price_promotions_image)
alter table public.price_promotions add column image_url text;
