"use client";

import { Clock3 } from "lucide-react";
import type { TaskWithAssignee } from "@/lib/types";
import { CardChip, PosterCard } from "./poster-card";
import {
  AssigneeAvatar,
  currentReviewerPersons,
  profileName,
  reviewer1PartialApproved,
  reviewWaitStart,
  waitDurationLabel,
} from "./task-card";

/* ============================================================================
   การ์ดของแท็บ "รอตรวจ" — ตัวเดียวใช้ทั้งมือถือและจอใหญ่
   ----------------------------------------------------------------------------
   ผู้ใช้ 2026-08-29: จอใหญ่ต้องเห็นการ์ดแบบเดียวกับมือถือ "แค่ design ในพื้นที่กว้าง"
   ⇒ หน้าตา/ชิป/บรรทัดใต้ชื่อ อยู่ที่ไฟล์นี้ที่เดียว ต่างกันแค่ prop `size`
   (มือถือ sm 2 คอลัมน์ · จอใหญ่ md หลายคอลัมน์) — ห้าม copy markup ไปไว้สองฝั่ง
   ========================================================================== */

/** รอนานเกิน 2 วันไหม — เน้นงานที่ค้างนานให้สะดุดตา (helper นอก component เลี่ยงกฎ purity) */
export function isLongWait(sinceIso: string | null): boolean {
  if (!sinceIso) return false;
  return Date.now() - Date.parse(sinceIso) > 2 * 24 * 3_600_000;
}

/** ชิปมุมขวาบน: ลำดับทอด + เวลาที่รอ (แดงเมื่อค้างเกิน 2 วัน) */
function ReviewChips({ task, mine }: { task: TaskWithAssignee; mine?: boolean }) {
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
      {mine && <CardChip tone="brand">งานของฉัน</CardChip>}
    </>
  );
}

export function ReviewPosterCard({
  task,
  today,
  size = "sm",
  selected,
  variant,
  mine = false,
  onClick,
}: {
  task: TaskWithAssignee;
  today: string;
  size?: "sm" | "md";
  selected: boolean;
  /** queue = งานที่รอ "ฉัน" ตรวจ (บรรทัดล่าง = ผู้ทำงาน) · team = ของทีม (บรรทัดล่าง = ค้างอยู่ที่ใคร) */
  variant: "queue" | "team";
  /** ชิป "งานของฉัน" — ใช้ในกลุ่มของทีม เพื่อให้คนส่งงานหางานตัวเองเจอ */
  mine?: boolean;
  onClick: () => void;
}) {
  // ทอดแรกอาจมีผู้ตรวจร่วม 2 คน — โชว์เฉพาะคนที่ยังไม่อนุมัติ (งานค้างอยู่ที่เขา)
  const stuckWith = currentReviewerPersons(task);
  const partial1 = reviewer1PartialApproved(task);
  const avatarSize = size === "md" ? 6 : 5;

  return (
    <PosterCard
      task={task}
      today={today}
      size={size}
      selected={selected}
      ariaLabel={
        variant === "queue" ? `ตรวจงาน ${task.title}` : `ดูงานรอตรวจ ${task.title}`
      }
      topRight={<ReviewChips task={task} mine={mine} />}
      note={
        variant === "queue" ? (
          partial1 ? (
            <span className="truncate">ผู้ตรวจร่วมอนุมัติแล้ว — เหลือคุณ</span>
          ) : (
            <>
              <AssigneeAvatar assignee={task.assignee} size={avatarSize} />
              <span className="truncate">
                {task.assignee ? profileName(task.assignee) : "ไม่ระบุผู้ทำ"}
              </span>
            </>
          )
        ) : (
          <>
            <span className="shrink-0 opacity-80">ค้างที่</span>
            {stuckWith.length === 0 ? (
              <span className="truncate">ยังไม่ระบุผู้ตรวจ</span>
            ) : (
              <>
                {stuckWith.map((p) => (
                  <AssigneeAvatar key={p.id} assignee={p} size={avatarSize} />
                ))}
                <span className="truncate">
                  {stuckWith.map((p) => profileName(p)).join(" / ")}
                </span>
              </>
            )}
          </>
        )
      }
      onClick={onClick}
    />
  );
}
