-- Stage 6 โหมด "แพ็คเกจเฉพาะ" — เคสดารา/คนที่เราจ่ายค่าตัว เงื่อนไขไม่เหมือนเคสมาตรฐาน
-- followup_mode: standard = checklist 5 หมวดตามเอกสารแนบท้ายสัญญา (เดิม)
--                custom   = กรอกเงื่อนไขเอง (package_note + ข้อ checklist ที่ is_custom = true)
-- สลับโหมดไม่ลบข้อมูล — ข้อของอีกโหมดถูกซ่อนไว้เฉยๆ สลับกลับมาเห็นเหมือนเดิม
alter table public.influencers
  add column if not exists followup_mode text not null default 'standard',
  add column if not exists package_note text;

alter table public.influencers
  drop constraint if exists influencers_followup_mode_check;
alter table public.influencers
  add constraint influencers_followup_mode_check
    check (followup_mode in ('standard', 'custom'));

-- ข้อ checklist ที่ทีมพิมพ์เอง (โหมดแพ็คเกจเฉพาะ) — false = ข้อจากเทมเพลตมาตรฐาน/เทมเพลตเดิม
alter table public.influ_tasks
  add column if not exists is_custom boolean not null default false;
