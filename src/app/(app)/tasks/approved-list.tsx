"use client";

import {
  BadgeCheck,
  CheckCircle2,
  Image as ImageIcon,
  Link2,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { TASK_PRIORITY } from "@/lib/constants";
import { formatDateBangkok } from "@/lib/format";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import { AssigneeAvatar, profileName } from "./task-card";

/**
 * แท็บ "ตรวจแล้ว" — งานที่ผ่านการตรวจ (review_status = approved) ทั้งทีม
 * เรียงจากที่ตรวจผ่านล่าสุด · กรองได้จากแถวตัวกรองใน tasks-client
 */
export function ApprovedList({
  tasks,
  totalApproved,
  sections,
  selectedId,
  onRowClick,
}: {
  tasks: TaskWithAssignee[];
  /** จำนวนงานตรวจแล้วทั้งหมด (ก่อนกรอง) — ใช้แยกข้อความ empty state */
  totalApproved: number;
  sections: TaskSectionRow[];
  selectedId: string | null;
  onRowClick: (task: TaskWithAssignee) => void;
}) {
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? null;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <BadgeCheck size={40} strokeWidth={1.5} className="text-emerald-200" />
        <p className="text-sm font-medium text-stone-600">
          {totalApproved === 0
            ? "ยังไม่มีงานที่ตรวจแล้ว"
            : "ไม่พบงานที่ตรงกับตัวกรอง"}
        </p>
        <p className="max-w-sm text-sm text-stone-400">
          {totalApproved === 0
            ? "งานที่ผู้ตรวจกดอนุมัติผ่านการตรวจแล้วจะมาแสดงรวมกันที่นี่"
            : "ลองเปลี่ยนคำค้นหา ผู้รับผิดชอบ ผู้ตรวจ หรือช่วงวันที่"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 px-4 pb-6 sm:px-6">
      <p className="rounded-lg bg-emerald-50/80 px-3 py-2 text-xs text-emerald-700">
        งานที่ผ่านการตรวจแล้ว {tasks.length} รายการ —
        คลิกเพื่อดูรายละเอียด ไฟล์งาน และความคิดเห็น
      </p>

      {tasks.map((task) => {
        const sec = sectionName(task.section_id);
        const approvedOn = task.approved_at ?? task.updated_at;
        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            aria-label={`งานตรวจแล้ว ${task.title}`}
            onClick={() => onRowClick(task)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRowClick(task);
            }}
            className={`flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-white px-4 py-3 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
              selectedId === task.id
                ? "border-brand-400 ring-1 ring-brand-300"
                : "border-stone-200/90 hover:border-brand-300 hover:bg-brand-50/40"
            }`}
          >
            <div className="min-w-0 flex-1 basis-64">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 size={11} />
                  เสร็จสมบูรณ์
                </span>
                {/* ตรึงวันไทยให้ตรงกับตัวกรองช่วงวันที่ (bangkokDay) เสมอ */}
                <span className="text-xs text-stone-400">
                  ตรวจผ่านเมื่อ {formatDateBangkok(approvedOn)}
                </span>
                {sec && <span className="text-xs text-stone-400">· {sec}</span>}
              </div>
              <p className="mt-1 truncate text-sm font-medium text-stone-800">
                {task.title}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1.5">
                  <AssigneeAvatar assignee={task.assignee} size={6} />
                  {task.assignee ? profileName(task.assignee) : "ไม่ระบุผู้ทำ"}
                </span>
                {task.reviewer && (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <BadgeCheck size={12} />
                    ตรวจโดย {profileName(task.reviewer)}
                  </span>
                )}
                <Badge className={TASK_PRIORITY[task.priority].badge}>
                  {TASK_PRIORITY[task.priority].label}
                </Badge>
                {task.deliverable_url && (
                  <a
                    href={task.deliverable_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-sky-600 hover:underline"
                  >
                    <Link2 size={12} />
                    ลิงก์งาน
                  </a>
                )}
                {(task.files?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-brand-600">
                    <ImageIcon size={12} />
                    มีไฟล์แนบ {task.files!.length} ไฟล์
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
