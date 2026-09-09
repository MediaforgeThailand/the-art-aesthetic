-- 0039: ขยาย statement_timeout ของ service_role
-- apply_sales_sheet_sync ต้อง insert ~90k แถวรวดเดียว (swap ข้อมูลชีท) —
-- ค่า default 8s ของ Supabase ทำให้ "canceling statement due to statement timeout"
-- service_role ใช้เฉพาะฝั่ง backend (edge functions) ไม่มีผลกับ client ผู้ใช้
alter role service_role set statement_timeout = '5min';
