import { redirect } from "next/navigation";

/**
 * หน้ารวมเดิมถูกถอดออกแล้ว (ผู้ใช้ 2026-08-19: "หน้าบอร์ดเคสทำให้เป็นหน้ารวม
 * ส่วนหน้ารวมเดิมเอาออกไม่จำเป็นตอนนี้") — บอร์ดเคส `/influencers` คือหน้าแรกของระบบ
 * URL นี้คง redirect ไว้เพราะลิงก์/บุ๊กมาร์กเก่าทั่วระบบยังชี้มาที่นี่
 * (subroutes `logs/` และ `trash/` ยังใช้งานตามเดิม)
 */
export default function InfluencerManagementPage() {
  redirect("/influencers");
}
