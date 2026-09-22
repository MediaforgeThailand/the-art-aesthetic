"use client";

import {
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { TASK_PRIORITY } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import { DriveLinkButton, ReviewPosterCard } from "./review-poster";
import { currentReviewerIds, reviewStepOf } from "./task-card";

/* ============================================================================
   แท็บ "รอตรวจ" ของจอใหญ่ (≥lg)
   ----------------------------------------------------------------------------
   ผู้ใช้ 2026-08-29: "ทำให้ version desktop เห็นการ์ดตรวจงานเป็นแบบนี้เหมือนกัน
   แต่แค่ design ในพื้นที่กว้าง" ⇒ เลิกใช้แถวลิสต์เดิม เปลี่ยนเป็น **กริดการ์ดโปสเตอร์
   ชุดเดียวกับมือถือ** (review-poster) แค่ขยายเป็น size="md" และวางได้หลายคอลัมน์

   ต่างจากมือถือแค่จุดเดียว: กลุ่ม "รอฉันตรวจ" ยังมีปุ่ม อนุมัติ/ตีกลับ/อนุมัติจบทันที
   อยู่ **ใต้การ์ด (นอกตัวการ์ด)** เพราะจอกว้างมีที่พอ และผู้ตรวจต้องกดรัวได้เหมือนเดิม
   — บนการ์ดยังห้ามมีปุ่ม (กติกาเดิมของ poster-card) และปุ่มชุดเต็มยังอยู่ในแผงรายละเอียด

   แบ่ง 2 กลุ่มเหมือนเดิม:
   1) รอฉันตรวจ (ฉันเป็นผู้ตรวจของทอดปัจจุบัน)
   2) งานรอตรวจอื่นๆ ของทีม — read-only บอกว่า "ค้างอยู่ที่ใคร" + รอมานานเท่าไร
      (ชิป/บรรทัดใต้ชื่อบนการ์ดบอกครบแล้ว) เรียงงานที่รอนานสุดขึ้นก่อน
   ========================================================================== */

/** กริดการ์ด — ปรับคอลัมน์ตามความกว้างที่เหลือ (แผงรายละเอียดเปิดอยู่ก็ยังพอดี) */
const CARD_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-5 xl:grid-cols-3 2xl:grid-cols-4";

/** บรรทัดข้อมูลย่อใต้การ์ดของกลุ่ม "รอฉันตรวจ" — ข้อมูลที่ช่วยตัดสินว่าจะตรวจใบไหนก่อน */
function CardMeta({
  task,
  section,
  today,
}: {
  task: TaskWithAssignee;
  section: string | null;
  today: string;
}) {
  const overdue = task.due_date !== null && task.due_date.slice(0, 10) < today;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 text-[11px] text-stone-500">
      <Badge className={TASK_PRIORITY[task.priority].badge}>
        {TASK_PRIORITY[task.priority].label}
      </Badge>
      {section && <span className="truncate text-stone-400">{section}</span>}
      {task.due_date && (
        <span
          className={`inline-flex items-center gap-1 ${
            overdue ? "font-medium text-rose-600" : ""
          }`}
        >
          {overdue && <AlertCircle size={11} />}
          ส่ง {formatDate(task.due_date)}
        </span>
      )}
      {task.deliverable_url && (
        <DriveLinkButton
          url={task.deliverable_url}
          variant="compact"
          label="เปิดงานใน Drive"
        />
      )}
    </div>
  );
}

export function ReviewList({
  queue,
  teamPending,
  sections,
  today,
  userId,
  selectedId,
  onRowClick,
  onApprove,
  onApproveBypass,
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
  /** อนุมัติจบทันที (bypass) — ข้ามทุกคนที่ยังไม่ได้ตรวจ (ผู้ตรวจร่วม/ลำดับ 2) ให้งานเสร็จเลย (มี confirm) */
  onApproveBypass: (task: TaskWithAssignee) => void;
  /** ตีกลับให้แก้ไข — บันทึกจำนวนรอบแก้ไขไว้เป็นสถิติของผู้รับผิดชอบ */
  onReject: (task: TaskWithAssignee) => void;
}) {
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? null;

  if (queue.length === 0 && teamPending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <ClipboardCheck size={40} strokeWidth={1.5} className="text-brand-200" />
        <p className="text-sm font-medium text-stone-600">ไม่มีงานรอตรวจ</p>
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
          <div className={CARD_GRID}>
            {queue.map((task) => {
              // งานตรวจ 2 ทอด — บอกว่าใบนี้อยู่ทอดไหน และอนุมัติแล้วจะเกิดอะไรต่อ
              const hasChain = task.reviewer2_id !== null;
              const step = reviewStepOf(task);
              // ทอดแรกยังมีผู้ตรวจร่วมคนอื่นที่ยังไม่อนุมัติ — กดอนุมัติของฉันแล้วงานยังรอเขา
              // (ช่องที่ผู้ตรวจเป็นเจ้าของงานเองผ่านอัตโนมัติ ไม่นับว่ารอ)
              const pendingOthers =
                step < 2
                  ? currentReviewerIds(task).filter(
                      (id) => id !== userId && id !== task.assignee_id
                    )
                  : [];
              // ทอด 0 = ผู้สั่ง brief ตรวจก่อน — อนุมัติแล้วงานเพิ่งจะเข้าสายตรวจจริง ยังไม่จบ
              const briefStage = step <= 0;
              const isFinalStep =
                !briefStage && (!hasChain || step >= 2) && pendingOthers.length === 0;
              return (
                <div key={task.id} className="flex flex-col gap-2">
                  <ReviewPosterCard
                    task={task}
                    today={today}
                    size="md"
                    selected={selectedId === task.id}
                    variant="queue"
                    onClick={() => onRowClick(task)}
                  />
                  <CardMeta
                    task={task}
                    section={sectionName(task.section_id)}
                    today={today}
                  />
                  {/* ปุ่มลงมือตรวจ — อยู่นอกการ์ด กดรัวได้โดยไม่ต้องเปิดแผงทีละใบ */}
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => onApprove(task)}
                      title={
                        briefStage
                          ? "ผ่านแล้ว — ส่งงานเข้าสายตรวจจริงต่อ"
                          : pendingOthers.length > 0
                            ? "ทอดแรกต้องอนุมัติครบทุกคน — อนุมัติแล้วงานจะรอผู้ตรวจร่วมอีกคนก่อนไปต่อ"
                            : isFinalStep
                              ? undefined
                              : "อนุมัติแล้วงานจะถูกส่งต่อให้ผู้ตรวจลำดับ 2 ตรวจขั้นสุดท้าย"
                      }
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-xs font-medium text-white transition-all hover:bg-emerald-600 active:scale-95"
                    >
                      <CheckCircle2 size={14} />
                      {briefStage
                        ? "ผ่าน → ส่งเข้าสายตรวจจริง"
                        : pendingOthers.length > 0
                          ? "อนุมัติ (รอผู้ตรวจร่วมอีกคน)"
                          : isFinalStep
                            ? "อนุมัติ"
                            : "อนุมัติ → ส่งต่อลำดับ 2"}
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onReject(task)}
                        title={
                          briefStage
                            ? "ส่งกลับให้ผู้รับงานแก้ก่อนเข้าสายตรวจจริง (ไม่นับเป็นข้อผิดพลาดใน KPI)"
                            : "ตีกลับให้ผู้รับผิดชอบแก้ไข (นับเป็นการแก้ไข 1 ครั้ง)"
                        }
                        className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-600 transition-all hover:bg-rose-50 active:scale-95"
                      >
                        <Undo2 size={14} />
                        {briefStage ? "ขอให้แก้ก่อน" : "ตีกลับ"}
                      </button>
                      {/* bypass — ทอดแรกที่ยังมีคนอื่นต้องตรวจต่อ: ปิดงานเลย ข้ามคนที่ยังไม่ได้ตรวจ
                          (ทอด 0 ไม่มี — ผู้สั่ง brief ปิดงานแทนผู้ตรวจจริงไม่ได้) */}
                      {!briefStage && !isFinalStep && (
                        <button
                          type="button"
                          onClick={() => onApproveBypass(task)}
                          title="อนุมัติจบทันทีโดยไม่ต้องรอคนที่ยังไม่ได้ตรวจ (มีกล่องยืนยันก่อน)"
                          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-500 bg-white px-3 py-2 text-xs font-medium text-emerald-600 transition-all hover:bg-emerald-50 active:scale-95"
                        >
                          <CheckCheck size={14} />
                          จบทันที
                        </button>
                      )}
                    </div>
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
        {teamPending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-4 py-3 text-sm text-stone-400">
            ไม่มีงานอื่นที่รอตรวจอยู่
          </p>
        ) : (
          <div className={CARD_GRID}>
            {teamPending.map((task) => (
              <div key={task.id} className="flex flex-col gap-2">
                <ReviewPosterCard
                  task={task}
                  today={today}
                  size="md"
                  selected={selectedId === task.id}
                  variant="team"
                  mine={
                    userId !== null &&
                    (task.assignee_id === userId || task.created_by === userId)
                  }
                  onClick={() => onRowClick(task)}
                />
                <CardMeta
                  task={task}
                  section={sectionName(task.section_id)}
                  today={today}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
