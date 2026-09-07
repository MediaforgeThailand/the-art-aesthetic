/**
 * ค่าคงที่ของระบบ Influencer ที่ "ฝั่ง Team" ใช้ได้ — ทางเข้าเดียวจากนอกโมดูล Influ
 *
 * ทีมคอนเทนต์ต้องติดแท็ก influencer/หมอ/ทีม product ลงงานใน /tasks และดูแฮชแท็กบังคับ
 * ของแต่ละเคส จึงต้องรู้จักชุดค่าเหล่านี้ — แต่ **ห้าม import จาก @/influ/lib/* ตรงๆ**
 * (กฎ ESLint `no-restricted-imports` ใน eslint.config.mjs) เพื่อให้เห็นชัดว่า Team พึ่ง
 * Influ อยู่กี่อย่าง และวันที่ Influ แยกเป็น repo ของตัวเอง ไฟล์ในโฟลเดอร์ public/ นี้คือ
 * ชุดที่ต้องคัดลอกกลับมาอยู่ฝั่ง Team (ดู src/influ/README.md)
 */
export {
  DEFAULT_PRODUCT_TEAM,
  hashtagText,
  INFLU_PRODUCT_TEAM_ORDER,
  INFLU_PRODUCT_TEAMS,
  influLabel,
  influTagHashtags,
  missingHashtagCount,
  type CaseHashtag,
} from "@/influ/lib/influ-constants";
