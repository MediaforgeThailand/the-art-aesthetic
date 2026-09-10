-- 0130: รูปของ Influencer เป็นของ "ตัวบุคคล" ที่เดียว — ยุบ influ_case_photos เข้า influ_profile_photos
--
-- ผู้ใช้ 2026-09-10: "ในส่วนของ influ ทุกๆเคสตอนนี้รูปแยกกันซึ่งผิด รูปเคสควรมาจาก profile influ
--                     ซึ่งกรณีขึ้นเคสใหม่ของอินฟูที่เคยมาต้องใช้รูปอันเดียวกัน"
--
-- ของเดิมมี 2 ตารางที่ทับซ้อนกัน:
--   * 0082 `influ_profile_photos` — รูปของ "ตัวบุคคล" แก้ที่โมดัลโปรไฟล์ (ไฟล์อยู่ influ-profiles/{profile_id}/)
--   * 0105 `influ_case_photos`    — รูปของ "รอบงาน" แก้ที่แท็บรายละเอียดเคส มี kind photo/channel
--     แล้วตอนเปิดรอบใหม่ระบบ **ก๊อปไฟล์** เข้าโฟลเดอร์เคสใหม่ (copyPhotoIntoCase)
--     ⇒ influ คนเดียวกันมีรูปคนละใบต่อรอบ แก้ที่รอบหนึ่งรอบอื่นไม่ตาม = อาการที่ผู้ใช้เจอ
--
-- ของใหม่: เหลือตารางเดียวคือ `influ_profile_photos` + คอลัมน์ `kind` (photo/channel)
--   * ทุกรอบของคนเดียวกันอ่านรูปชุดเดียวกัน — อัพ/ลบที่ไหนก็เห็นเหมือนกันทุกรอบ
--   * **ไฟล์เดิมไม่ย้าย** (path เดิมใช้ได้ต่อ) รูปที่อัพใหม่ไปอยู่ `influ-profiles/{profile_id}/`
--   * ⚠️ ฝั่งแอปต้องกัน "ลบเคส" ไม่ให้ลบไฟล์ที่ยังถูกอ้างอยู่ (cleanupStorage เช็ค path ก่อนลบ)
--     เพราะแถวเก่าจำนวนหนึ่งยังชี้ไฟล์ใต้ `influencers/{case_id}/`
--   * คอลัมน์ `influencers.photo_path` / `channel_photo_path` ยังอยู่เป็นรูปหน้าปกของรอบ
--     (การ์ดบอร์ด/Memo/sidebar อ่านช่องนี้) แต่แอป sync ให้ทุกรอบของคนเดียวกันเท่ากันแล้ว

alter table public.influ_profile_photos
  add column kind text not null default 'photo'
    check (kind in ('photo', 'channel'));

-- ย้ายรูปของเคสเข้ามาเป็นรูปของคน — ข้ามไฟล์ที่มีอยู่แล้วในโปรไฟล์เดียวกัน
-- (แถว backfill ของ 0082 ชี้ไฟล์เดียวกับรูปหน้าปกของเคสรอบแรกอยู่แล้ว)
insert into public.influ_profile_photos
  (profile_id, kind, file_path, file_name, position, created_by, created_at)
select i.person_id, cp.kind, cp.file_path, cp.file_name, cp.position,
       cp.created_by, cp.created_at
  from public.influ_case_photos cp
  join public.influencers i on i.id = cp.influencer_id
 where not exists (
   select 1 from public.influ_profile_photos pp
    where pp.profile_id = i.person_id
      and pp.file_path = cp.file_path
 );

-- ลบ "สำเนา" ที่เกิดจากการก๊อปรูปตอนเปิดรอบใหม่ — ชื่อไฟล์สำเนาคือ "{ts}-{ชื่อไฟล์ต้นทาง}"
-- (เทียบท้ายสตริงตรงๆ ไม่ใช้ LIKE เพราะชื่อไฟล์มี "_" ซึ่งเป็น wildcard ของ LIKE)
delete from public.influ_profile_photos dup
using public.influ_profile_photos src
where dup.profile_id = src.profile_id
  and dup.kind = src.kind
  and dup.id <> src.id
  and right(
        regexp_replace(dup.file_path, '^.*/', ''),
        length(regexp_replace(src.file_path, '^.*/', '')) + 1
      ) = '-' || regexp_replace(src.file_path, '^.*/', '');

drop table public.influ_case_photos;

drop index if exists public.influ_profile_photos_profile_idx;
create index influ_profile_photos_profile_idx
  on public.influ_profile_photos (profile_id, kind, "position");

comment on table public.influ_profile_photos is
  'รูปของ influencer รายบุคคล (0082 + ยุบ influ_case_photos เข้ามาที่ 0129) — ทุกรอบงานของคนเดียวกันใช้ชุดนี้ร่วมกัน; kind photo = รูปตัวคน, channel = รูปช่องทาง/ยอดผู้ติดตาม';
comment on column public.influ_profile_photos.kind is
  'photo = รูปตัว influencer (โมดัลโปรไฟล์แก้เฉพาะชนิดนี้) · channel = รูปช่องทาง/สกรีนช็อตยอดผู้ติดตาม';

-- รูปหน้าปกของ "ทุกรอบ" ต้องตรงกับรูปชุดของคนนั้น — รอบเก่าที่เคยถูกก๊อปไฟล์ยังชี้สำเนาอยู่
-- (ตรวจก่อนรัน: ไม่มีรอบไหนที่ปกชี้ไฟล์ซึ่งไม่มีแถวรูปของคนรองรับ จึงไม่มีการอ้างอิงหาย)
with cover as (
  select distinct on (profile_id, kind) profile_id, kind, file_path
    from public.influ_profile_photos
   order by profile_id, kind, "position", created_at
)
update public.influencers i
   set photo_path = (select c.file_path from cover c
                      where c.profile_id = i.person_id and c.kind = 'photo'),
       channel_photo_path = (select c.file_path from cover c
                              where c.profile_id = i.person_id and c.kind = 'channel')
 where exists (select 1 from cover c where c.profile_id = i.person_id);
