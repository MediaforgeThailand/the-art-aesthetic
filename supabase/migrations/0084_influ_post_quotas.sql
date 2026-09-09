-- เป้าจำนวนโพสต่อช่องทางตามสัญญา (อ้างอิงตารางติดตามของทีม branding เดิม:
-- คอลัมน์ "จำนวนการPost" + ช่อง IG/Facebook/Tiktok ช่องละ 12 slot)
-- เก็บเป็น jsonb map { "<platform key>": จำนวนโพสตามสัญญา } เช่น {"tiktok":6,"instagram":6,"facebook":6}
-- คีย์ = platform key ชุดเดียวกับ postPlatformOf() ใน influ-constants.ts (tiktok|instagram|facebook|youtube|lemon8|x|line|other)
-- ยอดที่ลงจริงไม่เก็บซ้ำ — นับจาก influ_post_links (kind='post') โดยแยกช่องทางจาก hostname ของลิงก์
-- ตั้งใจให้ null ได้ (ยังไม่ตั้งเป้า) และไม่มี NOT NULL — backup เก่าใน influ_deleted_backups กู้คืนได้โดยไม่ต้อง jsonb_set
alter table public.influencers
  add column if not exists post_quotas jsonb;

comment on column public.influencers.post_quotas is
  'เป้าจำนวนโพสต่อช่องทางตามสัญญา — jsonb map {platform key: จำนวน} เช่น {"tiktok":6}; null = ยังไม่ตั้งเป้า; ยอดลงจริงนับจาก influ_post_links';

-- PostgREST แคช schema ไว้ — ไม่ reload จะมองไม่เห็นคอลัมน์ใหม่
notify pgrst, 'reload schema';
