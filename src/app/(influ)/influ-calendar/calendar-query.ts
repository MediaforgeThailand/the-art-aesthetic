/**
 * select ของคิวปฏิทิน — ใช้ทั้งฝั่ง server (page.tsx) และ client (insert/update แล้ว
 * `.select()` กลับมา) จึงต้องอยู่ในไฟล์ปกติ ไม่ใช่ไฟล์ "use client"
 * (ค่า runtime ที่ export จากไฟล์ client กลายเป็น client-reference proxy เมื่อ server
 * component import — supabase เรียก `.split()` แล้วพังทั้งหน้า: บทเรียน CALENDAR_APPT_SELECT ของ Wellness)
 *
 * embed ที่ join มา:
 * - ชื่อ influ — คิวเก่าอาจผูกกับคนที่ถูก archive แล้ว (ไม่อยู่ในลิสต์ตัวเลือก)
 * - `contract_file_path` — เตือน "มาทำแล้วแต่ยังไม่มีไฟล์สัญญา" ในโมดัลรายละเอียดคิว
 * - `procedures` — หัตถการของเคส (ชื่อ + ทีม product) สำหรับตัวกรอง "หัตถการ / ทีม"
 *   บนปฏิทิน (ระบบใช้หลายทีม — แต่ละทีมดูเฉพาะคิวของหัตถการตัวเอง, ผู้ใช้ 2026-09-02)
 */
export const CALENDAR_EVENT_SELECT =
  "*, influencer:influencers(id, first_name, last_name, nickname, contract_file_path, procedures:influ_procedure_items(name, product_team))";
