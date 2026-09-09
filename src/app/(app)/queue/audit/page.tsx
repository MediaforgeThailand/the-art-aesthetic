import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { getAuditLog } from "@/lib/queue/data";
import { FIELD_LABEL, type ParsedField } from "@/lib/queue/parser";
import { requireAdmin } from "@/lib/queue/session";
import {
  ASSIGNMENT_STATUS_LABEL,
  AVAILABILITY_LABEL,
  CASE_TYPE_LABEL,
} from "@/lib/queue/types";

export const metadata: Metadata = { title: "ประวัติการทำรายการ" };

/**
 * ประวัติทุกการกระทำที่เปลี่ยนคิว — สรุปเป็นข้อความสั้นๆ
 * ไม่เก็บและไม่แสดงข้อมูลติดต่อของลูกค้าในบันทึกนี้ (ข้อ 14)
 */
const ACTION_LABEL: Record<string, string> = {
  "case.create": "สร้างเคส",
  "case.update": "แก้ข้อมูลเคส",
  "assignment.acknowledge": "BC รับทราบ",
  "assignment.reassign": "ย้ายคิว",
  "assignment.manual_assign": "จ่ายคิวเอง",
  "assignment.void": "ยกเลิกคิว",
  "member.add": "เพิ่มสมาชิก",
  "member.availability": "เปลี่ยนสถานะสมาชิก",
  "member.update": "แก้ข้อมูลสมาชิก",
  "member.deactivate": "ปิดใช้งานสมาชิก",
  "member.reactivate": "เปิดใช้งานสมาชิก",
  "ranking.publish": "ประกาศอันดับ",
};

/** แสดง summary แบบอ่านออก — คีย์ที่ไม่รู้จักจะโชว์ตามชื่อคีย์ */
const SUMMARY_LABEL: Record<string, string> = {
  case_no: "เคส",
  case_type: "ประเภท",
  member_name: "ผู้รับ",
  from_member: "จาก",
  to_member: "ไป",
  rank: "อันดับ",
  weight: "น้ำหนัก",
  seq_today: "คิวที่",
  period_key: "เดือน",
  version: "เวอร์ชัน",
  entries: "จำนวนรายชื่อ",
  fields: "ช่องที่แก้",
  availability: "สถานะ",
  status: "สถานะ",
  display_name: "ชื่อ",
  is_active: "ใช้งาน",
  queue_enabled: "เข้าคิว",
  open_assignments: "คิวค้าง",
  role: "บทบาท",
};

/** ค่าใน summary ที่เป็น enum — แปลงเป็นคำที่คนอ่านออกด้วยชุดเดียวกับหน้าอื่น */
const VALUE_LABEL: Record<string, Record<string, string>> = {
  case_type: CASE_TYPE_LABEL,
  status: ASSIGNMENT_STATUS_LABEL,
  availability: AVAILABILITY_LABEL,
  role: { bc: "BC", admin: "แอดมิน" },
};

/** id ภายในไม่มีประโยชน์กับคนอ่าน — ซ่อนไว้ */
const HIDDEN_SUMMARY_KEYS = new Set(["user_id"]);

function renderValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "เปิด" : "ปิด";
  if (Array.isArray(value)) return value.map((v) => renderValue(key, v)).join(", ");
  const text = String(value);
  if (key === "fields") return FIELD_LABEL[text as ParsedField] ?? text;
  return VALUE_LABEL[key]?.[text] ?? text;
}

function summarize(summary: Record<string, unknown>): string {
  return Object.entries(summary)
    .filter(([key, value]) => !HIDDEN_SUMMARY_KEYS.has(key) && value !== null && value !== "")
    .map(([key, value]) => `${SUMMARY_LABEL[key] ?? key}: ${renderValue(key, value)}`)
    .join(" · ");
}

export default async function AuditPage() {
  await requireAdmin();
  const rows = await getAuditLog(200);

  return (
    <>
      <PageHeader title="ประวัติการทำรายการ" description="200 รายการล่าสุด" />

      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText size={40} />} title="ยังไม่มีประวัติ" />
      ) : (
        <div className="glass divide-y divide-brand-50 rounded-xl">
          {rows.map((row) => (
            <div key={row.id} className="px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-stone-800">
                  {ACTION_LABEL[row.action] ?? row.action}
                </span>
                <span className="text-xs text-stone-500">{row.actor_name ?? "ระบบ"}</span>
                <span className="ml-auto shrink-0 text-xs text-stone-400">
                  {formatDateTime(row.created_at)}
                </span>
              </div>
              {summarize(row.summary) && (
                <p className="mt-0.5 break-words text-xs text-stone-500">
                  {summarize(row.summary)}
                </p>
              )}
              {row.reason && (
                <p className="mt-0.5 text-xs text-stone-500">เหตุผล: {row.reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
