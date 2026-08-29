"use client";

import { ClipboardCheck, Clock3 } from "lucide-react";
import type { TaskWithAssignee } from "@/lib/types";
import { CardChip, PosterCard } from "./mobile-card";
import {
  AssigneeAvatar,
  currentReviewerPersons,
  profileName,
  reviewer1PartialApproved,
  reviewWaitStart,
  waitDurationLabel,
} from "./task-card";

/* ============================================================================
   แท็บ "รอตรวจ" เวอร์ชันมือถือ (<lg)
   ----------------------------------------------------------------------------
   ผู้ใช้ 2026-08-29: "อยากให้มันขึ้น card รูปภาพเหมือนตัวอื่นๆ ที่ดูง่ายๆ แล้วพวกปุ่ม
   ก็ให้เป็นกดคลิ๊กเข้าไปอยู่ใน sidebar setting ด่านบนแทน"

   ⇒ ใช้การ์ดโปสเตอร์ชุดเดียวกับบอร์ด (mobile-card) เรียง 2 คอลัมน์ **และไม่มีปุ่ม
   อนุมัติ/ตีกลับบนการ์ด** — กดการ์ดแล้วชีตรายละเอียดเลื่อนขึ้นมา ปุ่มตรวจงานอยู่
   บนสุดของชีตนั้น (task-panel) ซึ่งเป็นที่เดียวกับจอใหญ่ ไม่ต้องดูแลปุ่มสองชุด
   ปุ่มบนแถวเดิมกินความสูงใบละ ~3 บรรทัด ทำให้เห็นงานได้ทีละ 2 ใบเท่านั้น
   ========================================================================== */

/** รอนานเกิน 2 วันไหม — เน้นงานที่ค้างนานให้สะดุดตา (helper นอก component เลี่ยงกฎ purity) */
function isLongWait(sinceIso: string | null): boolean {
  if (!sinceIso) return false;
  return Date.now() - Date.parse(sinceIso) > 2 * 24 * 3_600_000;
}

/** ชิปมุมขวาบน: ลำดับทอด + เวลาที่รอ (แดงเมื่อค้างเกิน 2 วัน) */
function ReviewChips({ task }: { task: TaskWithAssignee }) {
  const hasChain = task.reviewer2_id !== null;
  const step = task.review_step ?? 1;
  const since = reviewWaitStart(task);
  const wait = waitDurationLabel(since);
  return (
    <>
      <CardChip tone="amber">
        {hasChain ? `รอตรวจ ${step}/2` : "รอตรวจ"}
      </CardChip>
      {wait && (
        <CardChip tone={isLongWait(since) ? "rose" : "neutral"}>
          <Clock3 size={10} />
          {wait}
        </CardChip>
      )}
    </>
  );
}

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
        <p className="max-w-xs text-xs text-stone-400">
          เมื่อมีใครส่งงานเข้าตรวจ งานจะมาแสดงที่นี่ — ทั้งงานที่รอคุณตรวจ
          และงานของทีมที่ค้างอยู่ที่ผู้ตรวจคนอื่น
        </p>
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
          hint={
            queue.length > 0
              ? "กดการ์ดเพื่อดูงาน — ปุ่มอนุมัติ/ตีกลับอยู่บนสุดของแผงที่เลื่อนขึ้นมา"
              : undefined
          }
        />
        {queue.length === 0 ? (
          <EmptyRow>ไม่มีงานที่รอคุณตรวจตอนนี้</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {queue.map((task) => {
              const partial1 = reviewer1PartialApproved(task);
              return (
                <PosterCard
                  key={task.id}
                  task={task}
                  today={today}
                  selected={selectedId === task.id}
                  ariaLabel={`ตรวจงาน ${task.title}`}
                  topRight={<ReviewChips task={task} />}
                  note={
                    partial1 ? (
                      <span className="truncate">
                        ผู้ตรวจร่วมอนุมัติแล้ว — เหลือคุณ
                      </span>
                    ) : (
                      <>
                        <AssigneeAvatar assignee={task.assignee} size={5} />
                        <span className="truncate">
                          {task.assignee
                            ? profileName(task.assignee)
                            : "ไม่ระบุผู้ทำ"}
                        </span>
                      </>
                    )
                  }
                  onClick={() => onRowClick(task)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- กลุ่ม 2: งานรอตรวจของทีม (ค้างอยู่ที่คนอื่น) ---------- */}
      <section>
        <GroupHeading
          title="งานรอตรวจของทีม"
          count={teamPending.length}
          tone="bg-stone-200/80 text-stone-600"
          hint="ค้างอยู่ที่ผู้ตรวจคนอื่น — เรียงรอนานสุดขึ้นก่อน"
        />
        {teamPending.length === 0 ? (
          <EmptyRow>ไม่มีงานอื่นที่รอตรวจอยู่</EmptyRow>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {teamPending.map((task) => {
              // ทอดแรกอาจมีผู้ตรวจร่วม 2 คน — โชว์เฉพาะคนที่ยังไม่อนุมัติ (งานค้างอยู่ที่เขา)
              const stuckWith = currentReviewerPersons(task);
              const mine =
                userId !== null &&
                (task.assignee_id === userId || task.created_by === userId);
              return (
                <PosterCard
                  key={task.id}
                  task={task}
                  today={today}
                  selected={selectedId === task.id}
                  ariaLabel={`ดูงานรอตรวจ ${task.title}`}
                  topRight={
                    <>
                      <ReviewChips task={task} />
                      {mine && <CardChip tone="brand">งานของฉัน</CardChip>}
                    </>
                  }
                  note={
                    <>
                      <span className="shrink-0 opacity-80">ค้างที่</span>
                      {stuckWith.length === 0 ? (
                        <span className="truncate">ยังไม่ระบุผู้ตรวจ</span>
                      ) : (
                        <>
                          {stuckWith.map((p) => (
                            <AssigneeAvatar key={p.id} assignee={p} size={5} />
                          ))}
                          <span className="truncate">
                            {stuckWith.map((p) => profileName(p)).join(" / ")}
                          </span>
                        </>
                      )}
                    </>
                  }
                  onClick={() => onRowClick(task)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
