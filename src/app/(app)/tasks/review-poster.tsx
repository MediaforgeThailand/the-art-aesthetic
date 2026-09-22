"use client";

import { Clock3, ExternalLink } from "lucide-react";
import type { TaskWithAssignee } from "@/lib/types";
import { CardChip, PosterCard } from "./poster-card";
import {
  AssigneeAvatar,
  currentReviewerPersons,
  profileName,
  reviewer1PartialApproved,
  reviewStepOf,
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

/* ---------- ปุ่มเปิดไฟล์งานบน Google Drive ----------
   ตั้งแต่ปิดรับอัพคลิปเข้าระบบ (`VIDEO_UPLOAD_ENABLED=false` — แพลน Free) **ลิงก์ Drive
   คือ "ตัวงาน" ของงานคลิปทั้งหมด** ผู้ตรวจจึงต้องเห็นและกดได้ทันทีทุกจอ ห้ามให้ไปซ่อน
   อยู่ในเมนูย่อยอีก (ผู้ใช้ 2026-09-22: "ในส่วนของผู้ตรวจปรับให้มีปุ่มกดเพื่อตามลิงค์ไปชัดๆ")
   ใช้ร่วมกันทั้งลิสต์รอตรวจ (review-list) และหน้าตรวจงานเต็มจอ (review-viewer) */
const DRIVE_VARIANT = {
  /** ใต้การ์ดในลิสต์รอตรวจของจอใหญ่ */
  compact:
    "gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100",
  /** แถบบนของหน้าตรวจงานเต็มจอ (พื้นดำ) */
  bar: "gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-2 text-xs font-medium text-white active:scale-95",
  /** กลางพื้นที่ดูงาน ตอนงานนั้นไม่มีไฟล์ในระบบเลย — เป็นทางเดียวที่จะดูงานได้ */
  hero: "gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/40 active:scale-95",
} as const;

export function DriveLinkButton({
  url,
  variant,
  label = "เปิดไฟล์งานใน Drive",
}: {
  url: string;
  variant: keyof typeof DRIVE_VARIANT;
  label?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      // ปุ่มนี้อยู่บนการ์ด/แถบที่กดแล้วมี action ของตัวเอง — กันไม่ให้เปิดงานซ้อนขึ้นมาด้วย
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex max-sm:min-h-11 cursor-pointer items-center justify-center transition-all ${DRIVE_VARIANT[variant]}`}
    >
      <ExternalLink size={variant === "hero" ? 17 : 13} className="shrink-0" />
      {label}
    </a>
  );
}

/** รอนานเกิน 2 วันไหม — เน้นงานที่ค้างนานให้สะดุดตา (helper นอก component เลี่ยงกฎ purity) */
function isLongWait(sinceIso: string | null): boolean {
  if (!sinceIso) return false;
  return Date.now() - Date.parse(sinceIso) > 2 * 24 * 3_600_000;
}

/** ชิปมุมขวาบน: ลำดับทอด + เวลาที่รอ (แดงเมื่อค้างเกิน 2 วัน) */
function ReviewChips({ task, mine }: { task: TaskWithAssignee; mine?: boolean }) {
  const hasChain = task.reviewer2_id !== null;
  // ทอด 0 = ผู้สั่ง brief ตรวจก่อน (migration 0098) — อ่านเลขทอดผ่าน reviewStepOf
  // เสมอ ห้ามอ่าน task.review_step ดิบ
  const step = reviewStepOf(task);
  const since = reviewWaitStart(task);
  const wait = waitDurationLabel(since);
  return (
    <>
      <CardChip tone="amber">
        {step <= 0
          ? "รอผู้สั่ง brief ตรวจ"
          : hasChain
            ? `รอตรวจ ${step}/2`
            : "รอตรวจ"}
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
