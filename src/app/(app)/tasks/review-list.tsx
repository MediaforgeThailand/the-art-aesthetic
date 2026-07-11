"use client";

import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Image as ImageIcon,
  Link2,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { TASK_PRIORITY } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import { AssigneeAvatar, profileName } from "./task-card";

/**
 * แท็บ "รอฉันตรวจ" — งานที่ฉันเป็นผู้ตรวจและอยู่สถานะรอตรวจ
 * กด "อนุมัติผ่านการตรวจ" = task เสร็จสมบูรณ์ · ถ้าไม่ผ่านให้เปิดงานแล้วคอมเมนต์แก้
 */
export function ReviewList({
  queue,
  sections,
  today,
  selectedId,
  onRowClick,
  onApprove,
  onReject,
}: {
  queue: TaskWithAssignee[];
  sections: TaskSectionRow[];
  today: string;
  selectedId: string | null;
  onRowClick: (task: TaskWithAssignee) => void;
  onApprove: (task: TaskWithAssignee) => void;
  /** ตีกลับให้แก้ไข — บันทึกจำนวนรอบแก้ไขไว้เป็นสถิติของผู้รับผิดชอบ */
  onReject: (task: TaskWithAssignee) => void;
}) {
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? null;

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <ClipboardCheck size={40} strokeWidth={1.5} className="text-brand-200" />
        <p className="text-sm font-medium text-stone-600">
          ไม่มีงานรอตรวจ
        </p>
        <p className="max-w-sm text-sm text-stone-400">
          เมื่อมีคนส่งงานมาให้คุณตรวจ (เลือกคุณเป็นผู้ตรวจงานแล้วกดส่งตรวจ)
          งานจะมาแสดงที่นี่ให้กดอนุมัติ
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 px-4 pb-6 pt-1 sm:px-6">
      {queue.map((task) => {
        const overdue =
          task.due_date !== null &&
          task.due_date.slice(0, 10) < today;
        const sec = sectionName(task.section_id);
        // งานตรวจ 2 ทอด — บอกว่าใบนี้อยู่ทอดไหน และอนุมัติแล้วจะเกิดอะไรต่อ
        const hasChain = task.reviewer2_id !== null;
        const step = task.review_step ?? 1;
        const isFinalStep = !hasChain || step >= 2;
        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            aria-label={`ตรวจงาน ${task.title}`}
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
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  {hasChain ? `รอตรวจ · ลำดับ ${step}/2` : "รอตรวจ"}
                </span>
                {hasChain && step >= 2 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    ลำดับ 1 อนุมัติแล้ว
                  </span>
                )}
                {sec && (
                  <span className="text-xs text-stone-400">{sec}</span>
                )}
              </div>
              <p className="mt-1 truncate text-sm font-medium text-stone-800">
                {task.title}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1.5">
                  <AssigneeAvatar assignee={task.assignee} size={6} />
                  {task.assignee ? profileName(task.assignee) : "ไม่ระบุผู้ทำ"}
                </span>
                {task.due_date && (
                  <span
                    className={`inline-flex items-center gap-1 ${
                      overdue ? "font-medium text-rose-600" : ""
                    }`}
                  >
                    {overdue && <AlertCircle size={12} />}
                    กำหนดส่ง {formatDate(task.due_date)}
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

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(task);
                }}
                title="ตีกลับให้ผู้รับผิดชอบแก้ไข (นับเป็นการแก้ไข 1 ครั้ง)"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-sm font-medium text-rose-600 transition-all hover:bg-rose-50 active:scale-95"
              >
                <Undo2 size={15} />
                ตีกลับ
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(task);
                }}
                title={
                  isFinalStep
                    ? undefined
                    : "อนุมัติแล้วงานจะถูกส่งต่อให้ผู้ตรวจลำดับ 2 ตรวจขั้นสุดท้าย"
                }
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-emerald-600 active:scale-95"
              >
                <CheckCircle2 size={15} />
                {isFinalStep ? "อนุมัติ" : "อนุมัติ → ส่งต่อลำดับ 2"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
