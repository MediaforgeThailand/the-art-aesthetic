-- ผู้ตรวจกด "ไม่ผ่าน (ยกเลิกงาน)" — กรณีงานไม่ต้องแก้แล้ว ทิ้งงานนั้นไปเลย (ผู้ใช้ 2026-10-15)
-- งานถูกย้ายไปถังขยะ (deleted_at — เก็บ 14 วันแล้ว purge เหมือนงานที่ลบเอง)
-- cancelled_by จดว่าใครเป็นคนยกเลิก ถังขยะจึงแยกได้ว่า "ลบเอง" หรือ "ผู้ตรวจไม่ผ่าน"
-- กู้คืนจากถังขยะ = ล้างค่านี้ทิ้ง

alter table public.tasks
  add column if not exists cancelled_by uuid
    references public.profiles(id) on delete set null;

-- แจ้งเตือนชนิดใหม่ 'cancelled' ถึงผู้รับผิดชอบงาน
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type in ('mention', 'comment', 'assign', 'review_request', 'approved', 'rejected', 'brief_accepted', 'cancelled')
  );

-- แก้บั๊กเดิมของ 0098: notifications.revision_kind ไม่รับ 'brief' — แจ้งเตือน "ผู้สั่ง brief ขอให้แก้"
-- ถูก constraint ปฏิเสธเงียบๆ (notify เป็น fire-and-forget) ผู้รับผิดชอบจึงไม่เคยได้แจ้งเตือนนี้
alter table public.notifications drop constraint if exists notifications_revision_kind_check;
alter table public.notifications
  add constraint notifications_revision_kind_check check (
    revision_kind is null or revision_kind in ('mistake', 'addition', 'brief')
  );
