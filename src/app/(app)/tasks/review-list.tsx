"use client";

import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Image as ImageIcon,
  Link2,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { TASK_PRIORITY } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import {
  AssigneeAvatar,
  currentReviewerPerson,
  profileName,
  reviewWaitStart,
  waitDurationLabel,
} from "./task-card";

/** รอนานเกิน 2 วันไหม — ไว้เน้นงานที่ค้างนานให้สะดุดตา (helper นอก component เลี่ยงกฎ purity) */
function isLongWait(sinceIso: string | null): boolean {
  if (!sinceIso) return false;
  return Date.now() - Date.parse(sinceIso) > 2 * 24 * 3_600_000;
}

/**
 * แท็บ "รอตรวจ" — เห็นภาพรวมงานรอตรวจทั้งทีม แบ่ง 2 กลุ่ม:
 * 1) รอฉันตรวจ (ฉันเป็นผู้ตรวจของทอดปัจจุบัน) — กดอนุมัติ/ตีกลับได้เลย
 * 2) งานรอตรวจอื่นๆ ของทีม — read-only บอกชัดว่า "ค้างอยู่ที่ใคร" (ผู้ตรวจทอดไหน) + รอมานานเท่าไร
 *    เรียงงานที่รอนานสุดขึ้นก่อน — ทั้งผู้ส่งงานและผู้ตรวจเปิดดูได้เหมือนกัน
 */
export function ReviewList({
  queue,
  teamPending,
  sections,
  today,
  userId,
  selectedId,
  onRowClick,
  onApprove,
  onReject,
}: {
  /** งานที่รอ "ฉัน" ตรวจในทอดปัจจุบัน */
  queue: TaskWithAssignee[];
  /** งานรอตรวจที่เหลือของทีม (ค้างอยู่ที่คนอื่น) — เรียงรอนานสุดก่อน */
  teamPending: TaskWithAssignee[];
  sections: TaskSectionRow[];
  today: string;
  userId: string | null;
  selectedId: string | null;
  onRowClick: (task: TaskWithAssignee) => void;
  onApprove: (task: TaskWithAssignee) => void;
  /** ตีกลับให้แก้ไข — บันทึกจำนวนรอบแก้ไขไว้เป็นสถิติของผู้รับผิดชอบ */
  onReject: (task: TaskWithAssignee) => void;
}) {
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? null;

  if (queue.length === 0 && teamPending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <ClipboardCheck size={40} strokeWidth={1.5} className="text-brand-200" />
        <p className="text-sm font-medium text-stone-600">
          ไม่มีงานรอตรวจ
        </p>
        <p className="max-w-sm text-sm text-stone-400">
          เมื่อมีใครส่งงานเข้าตรวจ งานจะมาแสดงที่นี่ —
          ทั้งงานที่รอคุณตรวจ และงานของทีมที่ค้างอยู่ที่ผู้ตรวจคนอื่น
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-6 pt-1 sm:px-6">
      {/* ---------- กลุ่ม 1: รอฉันตรวจ ---------- */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-700">
          รอฉันตรวจ
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            {queue.length}
          </span>
        </p>
        {queue.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-4 py-3 text-sm text-stone-400">
            ไม่มีงานที่รอคุณตรวจตอนนี้
          </p>
        ) : (
          <div className="space-y-2.5">
            {queue.map((task) => {
              const overdue =
                task.due_date !== null &&
                task.due_date.slice(0, 10) < today;
              const sec = sectionName(task.section_id);
              // งานตรวจ 2 ทอด — บอกว่าใบนี้อยู่ทอดไหน และอนุมัติแล้วจะเกิดอะไรต่อ
              const hasChain = task.reviewer2_id !== null;
              const step = task.review_step ?? 1;
              const isFinalStep = !hasChain || step >= 2;
              const wait = waitDurationLabel(reviewWaitStart(task));
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
                      {wait && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                          <Clock3 size={11} />
                          {wait}
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
        )}
      </div>

      {/* ---------- กลุ่ม 2: งานรอตรวจของทีม (ค้างอยู่ที่คนอื่น) ---------- */}
      <div>
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-700">
          งานรอตรวจของทีม
          <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-xs font-semibold text-stone-600">
            {teamPending.length}
          </span>
        </p>
        <p className="mb-2 text-xs text-stone-400">
          งานที่ค้างอยู่ที่ผู้ตรวจคนอื่น — คนส่งงานเปิดดูได้ว่างานตัวเองไปค้างที่ใคร
          รอมานานเท่าไร (เรียงรอนานสุดขึ้นก่อน)
        </p>
        {teamPending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-4 py-3 text-sm text-stone-400">
            ไม่มีงานอื่นที่รอตรวจอยู่
          </p>
        ) : (
          <div className="space-y-2">
            {teamPending.map((task) => {
              const sec = sectionName(task.section_id);
              const hasChain = task.reviewer2_id !== null;
              const step = task.review_step ?? 1;
              const stuckWith = currentReviewerPerson(task);
              const wait = waitDurationLabel(reviewWaitStart(task));
              const mine =
                userId !== null &&
                (task.assignee_id === userId || task.created_by === userId);
              // รอนานเกิน 2 วัน = เน้นเหลืองเข้มให้สะดุดตา
              const longWait = isLongWait(reviewWaitStart(task));
              return (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`ดูงานรอตรวจ ${task.title}`}
                  onClick={() => onRowClick(task)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onRowClick(task);
                  }}
                  className={`flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border bg-white/80 px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    selectedId === task.id
                      ? "border-brand-400 ring-1 ring-brand-300"
                      : "border-stone-200/70 hover:border-brand-300 hover:bg-brand-50/40"
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
                      {mine && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                          งานของฉัน
                        </span>
                      )}
                      {sec && (
                        <span className="text-xs text-stone-400">{sec}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-stone-800">
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={`ผู้รับผิดชอบ: ${
                          task.assignee ? profileName(task.assignee) : "ไม่ระบุ"
                        }`}
                      >
                        <AssigneeAvatar assignee={task.assignee} size={5} />
                        {task.assignee ? profileName(task.assignee) : "ไม่ระบุผู้ทำ"}
                      </span>
                    </div>
                  </div>

                  {/* ค้างอยู่ที่ใคร + รอมานานเท่าไร — จุดที่ทีมต้องเห็นชัดสุด */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-800">
                      ค้างอยู่ที่
                      <AssigneeAvatar assignee={stuckWith} size={5} />
                      <span className="max-w-28 truncate">
                        {stuckWith ? profileName(stuckWith) : "ยังไม่ระบุผู้ตรวจ"}
                      </span>
                      {hasChain && (
                        <span className="text-[10px] font-semibold text-amber-600">
                          (ลำดับ {step})
                        </span>
                      )}
                    </span>
                    {wait && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] ${
                          longWait
                            ? "font-semibold text-amber-600"
                            : "text-stone-400"
                        }`}
                      >
                        <Clock3 size={11} />
                        {wait}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
