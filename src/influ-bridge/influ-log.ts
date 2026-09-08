/**
 * ประวัติการใช้งานระบบ Influencer (influ_activity_log)
 *
 * ทีมหลายทีมเข้ามาใช้ระบบเดียวกัน — ทุกการกระทำที่เปลี่ยนข้อมูลต้องรู้ว่า "ใครทำอะไรกับเคสไหน"
 * เขียน log จากฝั่ง client ตอนเกิดเหตุการณ์ (แพทเทิร์นเดียวกับ notify() ในหน้า Task)
 *
 * กติกา:
 * - เป็น fire-and-forget แต่ **ต้องมี .then() ปิดท้ายเสมอ** — supabase builder เป็น lazy thenable
 *   ถ้าไม่มีจะไม่ยิง request เลย (บั๊กเดิมของระบบแจ้งเตือน)
 * - log ล้มเหลวห้ามทำให้งานหลักพัง — กลืน error ทิ้ง (บันทึกไม่ได้ ≠ งานไม่สำเร็จ)
 * - ตาราง log ไม่มี policy update/delete → เขียนแล้วลบไม่ได้จากแอป
 */

import type { InfluLogAction, Json } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

/** ป้าย/สีของแต่ละการกระทำ — ใช้ในหน้าประวัติการใช้งาน */
export const INFLU_LOG_ACTIONS: Record<
  InfluLogAction,
  { label: string; chip: string }
> = {
  create: {
    label: "สร้าง",
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  update: {
    label: "แก้ไข",
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
  },
  delete: {
    label: "ลบ",
    chip: "border border-rose-200 bg-rose-50 text-rose-700",
  },
  restore: {
    label: "กู้คืน",
    chip: "border border-violet-200 bg-violet-50 text-violet-700",
  },
  stage: {
    label: "เดินขั้นงาน",
    chip: "border border-brand-200 bg-brand-50 text-brand-700",
  },
  upload: {
    label: "อัปโหลดไฟล์",
    chip: "border border-amber-200 bg-amber-50 text-amber-700",
  },
  status: {
    label: "เปลี่ยนสถานะ",
    chip: "border border-stone-200 bg-stone-50 text-stone-600",
  },
};

export const INFLU_LOG_ACTION_ORDER: InfluLogAction[] = [
  "create",
  "update",
  "stage",
  "status",
  "upload",
  "delete",
  "restore",
];

/** ป้ายของ action ที่ไม่รู้จัก (DB เป็น text อิสระ — ของเก่า/ของใหม่ที่ยังไม่ได้ประกาศ) */
const INFLU_LOG_FALLBACK = {
  label: "อื่นๆ",
  chip: "border border-stone-200 bg-stone-50 text-stone-500",
};

export function influLogActionMeta(action: string) {
  return INFLU_LOG_ACTIONS[action as InfluLogAction] ?? INFLU_LOG_FALLBACK;
}

export type InfluLogEntry = {
  action: InfluLogAction;
  /** influencer | procedure_item | calendar_event | doctor | link | followup ... */
  entity?: string;
  entityId?: string | null;
  influencerId?: string | null;
  influencerName?: string | null;
  /** ข้อความไทยสั้นๆ ที่คนอ่านรู้เรื่องทันที เช่น "เปลี่ยนขั้นงานเป็น 3. Memo ขออนุมัติ" */
  summary: string;
  meta?: Json;
};

/** ผู้ทำ — ส่งมาจากหน้าที่เรียก (server รู้ uid/ชื่ออยู่แล้ว ไม่ต้องยิง query ซ้ำ) */
export type InfluLogActor = { id: string | null; name: string | null };

/** บันทึก log — เรียกได้เลยโดยไม่ต้อง await (มี .then ปิดท้ายให้แล้ว) */
export function logInflu(
  supabase: SupabaseClient,
  actor: InfluLogActor,
  entry: InfluLogEntry
): void {
  void supabase
    .from("influ_activity_log")
    .insert({
      actor_id: actor.id,
      actor_name: actor.name,
      action: entry.action,
      entity: entry.entity ?? "influencer",
      entity_id: entry.entityId ?? null,
      influencer_id: entry.influencerId ?? null,
      influencer_name: entry.influencerName ?? null,
      summary: entry.summary,
      meta: entry.meta ?? {},
    })
    .then(() => {
      // ตั้งใจไม่ทำอะไรต่อ — log เป็นข้อมูลประกอบ ไม่ควรรบกวนงานหลักถ้าเขียนไม่สำเร็จ
    });
}
