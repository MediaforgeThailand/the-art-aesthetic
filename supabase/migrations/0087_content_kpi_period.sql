-- 0087: เป้า KPI คอนเทนต์เลือกคาบได้ — 'month' (ชิ้น/เดือน, ค่าเดิมทุกแถว) หรือ 'day' (ชิ้น/วัน)
-- กติกา 'day' บนแดชบอร์ด: เป้าทั้งเดือน = target × จำนวนวันของเดือนนั้น,
-- เป้าถึงวันนี้ = target × วันที่ผ่านไป (ไม่ปัดเศษแบบสูตร prorate ของ month)
alter table public.content_kpis
  add column if not exists period text not null default 'month'
    check (period in ('month', 'day'));

notify pgrst, 'reload schema';
