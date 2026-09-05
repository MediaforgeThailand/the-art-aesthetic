-- ============================================================
-- 0111 — เก็บงานที่เหลือของ audit 2026-09-03: ขั้นย่อย Memo /
-- ข้อมูลตัวบุคคลซิงก์ทุกรอบ / รูปเคส sync ผ่าน helper กลาง / trackNodeOf
--
-- 1) Backfill memo_submitted_at ให้เคสก่อน 0104
--    ความหมายเดิมของ docs_sent_at (ก่อน 0104) คือ "ทำ Memo ยื่นขออนุมัติแล้ว"
--    (ทั้งขั้น 1.1+1.2 รวมเป็นก้อนเดียว) — 0104 แยกเป็น 1.0/1.1/1.2 แต่ไม่ได้
--    backfill คอลัมน์ใหม่ให้เคสเก่า ⇒ ทั้ง 9 เคสที่ docs_sent_at ไม่ว่างและ
--    "มีไฟล์ Memo ที่อนุมัติแล้ว" ค้างที่ 1.1 ทั้งที่จริงผ่านไปหมดแล้ว (memo_file_path
--    ไม่ว่าง = ผ่านขั้น 1.2 ไปแล้วด้วยซ้ำ — ยืนยันจากข้อมูลจริงก่อนรัน migration นี้)
--    เงื่อนไขเวลา (ก่อน 2026-09-01 20:15 ไทย = ตอน apply 0104) กันไม่ให้กระทบเคสที่
--    กดยืนยันขั้น 1.0 ใหม่หลังมีขั้นย่อยแล้วแต่ยังไม่ถึงมือผู้ออก Memo จริง
--
-- 2) ย้อน Stage 2→1 ตั้ง memo_submitted_at กลับเป็น 1.2 ไม่ใช่ 1.1
--    (ของเดิมล้างแต่ contract_start คงค่า memo_submitted_at ไว้อยู่แล้ว ไม่ต้องแก้ SQL
--    — บันทึกไว้เป็นเอกสารเพราะพฤติกรรมนี้เพิ่งถูกยืนยันตอน audit)
--
-- 3) sync ข้อมูลตัวบุคคลจากโปรไฟล์ไปทุกรอบอัตโนมัติ (แทนโค้ด client ที่ sync มือ)
-- ============================================================

/* ---------- 1) backfill memo_submitted_at ---------- */

update public.influencers
   set memo_submitted_at = docs_sent_at
 where docs_sent_at is not null
   and memo_submitted_at is null
   and docs_sent_at < '2026-09-01 20:15:00+07'::timestamptz;

comment on column public.influencers.docs_sent_at is
  'ยืนยันส่งเรื่องขอ Memo แล้ว (ขั้น 1.0 → 1.1) — เคสก่อน migration 0104 ใช้ช่องนี้
   ครอบทั้งขั้น 1.1+1.2 เดิม (backfill แล้วที่ 0110 ด้วย memo_submitted_at)';

/* ---------- 2) ข้อมูลตัวบุคคลซิงก์ทุกรอบอัตโนมัติ ----------
   เดิมพึ่งโค้ด client (NameEditModal, ProfileFormModal) sync มือทุกจุด — พลาดจุดไหน
   ก็ได้ 3 เคสที่ข้อมูลไม่ตรงกันข้ามรอบ (พบระหว่าง audit) ย้ายมาเป็น trigger ที่เดียว */

create or replace function public.influ_profile_data_fanout()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  update public.influencers
     set first_name = new.first_name,
         last_name = new.last_name,
         nickname = new.nickname,
         phone = new.phone,
         occupation = new.occupation,
         followers = new.followers,
         follower_note = new.follower_note,
         tier = new.tier
   where person_id = new.id
     and (
       first_name is distinct from new.first_name or
       last_name is distinct from new.last_name or
       nickname is distinct from new.nickname or
       phone is distinct from new.phone or
       occupation is distinct from new.occupation or
       followers is distinct from new.followers or
       follower_note is distinct from new.follower_note or
       tier is distinct from new.tier
     );
  return new;
end;
$fn$;

drop trigger if exists influ_profiles_data_fanout on public.influ_profiles;
create trigger influ_profiles_data_fanout
  after update of
    first_name, last_name, nickname, phone, occupation, followers, follower_note, tier
  on public.influ_profiles
  for each row execute function public.influ_profile_data_fanout();

/* ---------- 3) กันไว้ก่อน: บังคับทุกรอบให้ตรงกับโปรไฟล์ปัจจุบันครั้งเดียว ----------
   ตรวจแล้วตอนเขียน migration นี้ — ยังไม่มีเคสไหนเพี้ยนจริง (2 คนที่มีหลายรอบ
   ข้อมูลตรงกันหมด) แต่รันเผื่อไว้เป็นตาข่ายความปลอดภัย: WHERE ใช้ `is distinct from`
   จึงเป็น no-op ถ้าไม่มีอะไรต่าง และครอบกรณีที่ข้อมูลเพี้ยนไปแล้วจากบั๊กเก่าก่อน trigger นี้ */
update public.influencers i
   set first_name = p.first_name,
       last_name = p.last_name,
       nickname = p.nickname,
       phone = p.phone,
       occupation = p.occupation,
       followers = p.followers,
       follower_note = p.follower_note,
       tier = p.tier
  from public.influ_profiles p
 where p.id = i.person_id
   and (
     i.first_name is distinct from p.first_name or
     i.last_name is distinct from p.last_name or
     i.nickname is distinct from p.nickname or
     i.phone is distinct from p.phone or
     i.occupation is distinct from p.occupation or
     i.followers is distinct from p.followers or
     i.follower_note is distinct from p.follower_note or
     i.tier is distinct from p.tier
   );
