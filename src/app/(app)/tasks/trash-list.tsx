"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import { AssigneeAvatar, profileName } from "./task-card";

/** จำนวนวันที่เก็บงานในถังขยะก่อนถูกลบถาวร */
export const TRASH_KEEP_DAYS = 14;

/** จำนวนวันที่เหลือก่อนถูกลบถาวร (ปัดลงเป็นวันเต็ม, ต่ำสุด 0) */
function daysLeft(deletedAt: string): number {
  const gone = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, TRASH_KEEP_DAYS - Math.floor(gone / 86_400_000));
}

/**
 * แท็บ "ถังขยะ" — งานที่ถูกลบใน 14 วันล่าสุด เรียงล่าสุดก่อน
 * กู้คืน = งานกลับไปเซคชัน/สถานะเดิม; ลบถาวร = ลบแถว DB + ไฟล์ storage (ย้อนกลับไม่ได้)
 */
export function TrashList({
  tasks,
  sections,
  profiles,
  onRestore,
  onHardDelete,
}: {
  tasks: TaskWithAssignee[];
  sections: TaskSectionRow[];
  /** ไว้หาชื่อผู้ตรวจที่กด "ไม่ผ่าน (ยกเลิกงาน)" จาก cancelled_by */
  profiles: { id: string; full_name: string | null; email: string | null }[];
  onRestore: (task: TaskWithAssignee) => void;
  onHardDelete: (task: TaskWithAssignee) => void;
}) {
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? "-";
  const cancellerName = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p ? profileName(p) : "ผู้ตรวจ";
  };

  if (tasks.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <EmptyState
          icon={<Trash2 size={40} />}
          title="ถังขยะว่าง"
          description={`งานที่ลบจะถูกเก็บไว้ ${TRASH_KEEP_DAYS} วันเพื่อให้กู้คืนได้ ก่อนถูกลบถาวรพร้อมไฟล์ทั้งหมด`}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-2 px-4 pb-6 pt-2 sm:px-6 animate-fade-in">
      <p className="px-1 text-xs text-stone-400">
        งานที่ลบถูกเก็บไว้ {TRASH_KEEP_DAYS} วันนับจากวันที่ลบ
        จากนั้นจะถูกลบถาวรพร้อมไฟล์และความคิดเห็นทั้งหมด
      </p>
      {tasks.map((t) => {
        const left = t.deleted_at ? daysLeft(t.deleted_at) : 0;
        return (
          <div
            key={t.id}
            className="glass flex items-center gap-3 rounded-xl px-4 py-3"
          >
            <AssigneeAvatar assignee={t.assignee} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-800">
                {t.title}
              </p>
              {t.cancelled_by && (
                <p className="mt-0.5 truncate text-xs font-medium text-rose-600">
                  ไม่ผ่าน (ยกเลิกงาน) โดย {cancellerName(t.cancelled_by)}
                </p>
              )}
              <p className="mt-0.5 truncate text-xs text-stone-400">
                {sectionName(t.section_id)} · ผู้รับผิดชอบ{" "}
                {t.assignee ? profileName(t.assignee) : "ไม่ระบุ"} · ลบเมื่อ{" "}
                {t.deleted_at ? formatDateTime(t.deleted_at) : "-"}
              </p>
            </div>
            <span
              title="เหลือเวลาก่อนถูกลบถาวร"
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                left <= 3
                  ? "bg-rose-100 text-rose-600"
                  : "bg-stone-100 text-stone-500"
              }`}
            >
              เหลือ {left} วัน
            </span>
            <button
              type="button"
              onClick={() => onRestore(t)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 active:scale-95"
            >
              <RotateCcw size={13} />
              กู้คืน
            </button>
            <button
              type="button"
              onClick={() => onHardDelete(t)}
              title="ลบถาวร (ย้อนกลับไม่ได้)"
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 active:scale-95"
            >
              <Trash2 size={13} />
              ลบถาวร
            </button>
          </div>
        );
      })}
    </div>
  );
}
