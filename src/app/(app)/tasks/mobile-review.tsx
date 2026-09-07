"use client";

import { ClipboardCheck } from "lucide-react";
import type { TaskWithAssignee } from "@/lib/types";
import { ReviewPosterCard } from "./review-poster";

/* ============================================================================
   แท็บ "รอตรวจ" เวอร์ชันมือถือ (<lg)
   ----------------------------------------------------------------------------
   ผู้ใช้ 2026-08-29: "อยากให้มันขึ้น card รูปภาพเหมือนตัวอื่นๆ ที่ดูง่ายๆ แล้วพวกปุ่ม
   ก็ให้เป็นกดคลิ๊กเข้าไปอยู่ใน sidebar setting ด่านบนแทน"

   ⇒ ใช้การ์ดโปสเตอร์ชุดเดียวกับบอร์ด (review-poster → poster-card) เรียง 2 คอลัมน์
   **และไม่มีปุ่มอนุมัติ/ตีกลับบนการ์ด** — กดการ์ดเปิด viewer ตรวจงานเต็มจอ
   (review-viewer: ตัวเล่นวิดีโอ + ลิงก์/ดาวน์โหลด/ผู้รับผิดชอบ/แชท + ปุ่มอนุมัติ-ตีกลับ)
   ชุดเดียวกับจอใหญ่ — แผงรายละเอียดเต็ม (task-panel) เปิดต่อได้จากปุ่มใน viewer
   ========================================================================== */

function GroupHeading({
  title,
  count,
  tone,
  hint,
}: {
  title: string;
  count: number;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="mb-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-stone-700">
        {title}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
        >
          {count}
        </span>
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-stone-400">{hint}</p>}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-4 py-3 text-xs text-stone-400">
      {children}
    </p>
  );
}

export function MobileReviewList({
  queue,
  teamPending,
  userId,
  today,
  selectedId,
  onRowClick,
}: {
  /** งานที่รอ "ฉัน" ตรวจในทอดปัจจุบัน */
  queue: TaskWithAssignee[];
  /** งานรอตรวจที่เหลือของทีม (ค้างอยู่ที่คนอื่น) — เรียงรอนานสุดก่อน */
  teamPending: TaskWithAssignee[];
  userId: string | null;
  today: string;
  selectedId: string | null;
  onRowClick: (task: TaskWithAssignee) => void;
}) {
  if (queue.length === 0 && teamPending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <ClipboardCheck size={36} strokeWidth={1.5} className="text-brand-200" />
        <p className="text-sm font-medium text-stone-600">ไม่มีงานรอตรวจ</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-3 pb-4 pt-1">
      {/* ---------- กลุ่ม 1: รอฉันตรวจ ---------- */}
      <section>
        <GroupHeading
          title="รอฉันตรวจ"
          count={queue.length}
          tone="bg-amber-100 text-amber-700"
          // คำใบ้ตำแหน่งปุ่มมีค่าเฉพาะตอนมีการ์ดให้กด — กลุ่มว่างไม่ต้องกินอีกบรรทัด
        />
        {queue.length === 0 ? (
          <EmptyRow>ไม่มีงานที่รอคุณตรวจตอนนี้</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {queue.map((task) => (
              <ReviewPosterCard
                key={task.id}
                task={task}
                today={today}
                selected={selectedId === task.id}
                variant="queue"
                onClick={() => onRowClick(task)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------- กลุ่ม 2: งานรอตรวจของทีม (ค้างอยู่ที่คนอื่น) ---------- */}
      <section>
        <GroupHeading
          title="งานรอตรวจของทีม"
          count={teamPending.length}
          tone="bg-stone-200/80 text-stone-600"
        />
        {teamPending.length === 0 ? (
          <EmptyRow>ไม่มีงานอื่นที่รอตรวจอยู่</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {teamPending.map((task) => (
              <ReviewPosterCard
                key={task.id}
                task={task}
                today={today}
                selected={selectedId === task.id}
                variant="team"
                mine={
                  userId !== null &&
                  (task.assignee_id === userId || task.created_by === userId)
                }
                onClick={() => onRowClick(task)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
