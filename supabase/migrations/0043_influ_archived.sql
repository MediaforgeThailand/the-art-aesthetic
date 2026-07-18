-- influencers.archived: true = ข้อมูล influencer เก่าที่นำเข้ามาเพื่อเก็บ/ค้นหา (archive-only)
-- โผล่เฉพาะหน้า "โปรไฟล์ Influencer" (/influ-gallery) + ค้นหาเจอ
-- ไม่โผล่บนบอร์ด Influ Management (/influencers), หน้าอายุสัญญา (/influencers/contracts)
-- และตัวเลือก influ ในหน้า Task — งานที่นำเข้าใช้เก็บประวัติ + ดูว่าใครหมดสัญญาแล้ว
alter table influencers
  add column if not exists archived boolean not null default false;

comment on column influencers.archived is
  'true = ข้อมูล influencer เก่าที่นำเข้ามาเพื่อเก็บ/ค้นหา (archive-only) — ซ่อนจากบอร์ด Influ Management + หน้าอายุสัญญา, แสดงเฉพาะหน้าโปรไฟล์ Influencer';

create index if not exists influencers_archived_idx on influencers (archived);
