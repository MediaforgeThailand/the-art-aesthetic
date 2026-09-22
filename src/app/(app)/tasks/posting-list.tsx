"use client";

import { BadgeCheck, Paperclip, Send } from "lucide-react";
import { CONTENT_FORMATS, postOwnerIdOf } from "@/lib/constants";
import { formatDateBangkok } from "@/lib/format";
import type {
  ContentCategoryRow,
  ProfileRow,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import {
  AssigneeAvatar,
  CardMediaPreview,
  profileName,
  waitDurationLabel,
} from "./task-card";
import { DriveLinkButton } from "./review-poster";

/** เวลาที่ถือว่างานตรวจผ่าน — เริ่มนับคิวรอโพสจากจุดนี้ */
function approvedAtOf(t: TaskWithAssignee): string {
  return t.approved_at ?? t.updated_at;
}

/**
 * คนที่ต้องเป็นคนโพสการ์ดใบนี้ (กติกาผู้ใช้ 2026-08-29) — การ์ดที่มาจาก Brief เป็นของ
 * ผู้สั่ง Brief ส่วนการ์ดที่ไม่มี Brief (ตัดเอง/สร้างเอง) เป็นของผู้รับผิดชอบการ์ด
 * เกณฑ์อยู่ที่ `postOwnerIdOf` ที่เดียว (ระบบ KPI ใช้ตัวเดียวกัน)
 */
function postOwnerOf(t: TaskWithAssignee): {
  person: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  fromBrief: boolean;
} {
  const fromBrief = t.brief_source_id !== null;
  const ownerId = postOwnerIdOf(t);
  if (ownerId === null) return { person: null, fromBrief };
  const person = fromBrief ? (t.creator ?? null) : (t.assignee ?? null);
  return { person, fromBrief };
}

/** รอโพสเกิน 2 วัน = ป้ายเตือนเหลืองเข้ม (เกณฑ์เดียวกับคิวรอตรวจ)
    — เรียก Date.now() จึงต้องอยู่ระดับโมดูล (กฎ react-hooks/purity) */
function postWaitIsLate(sinceIso: string): boolean {
  const ms = Date.now() - Date.parse(sinceIso);
  return !Number.isNaN(ms) && ms > 2 * 24 * 3_600_000;
}

/**
 * แท็บ "รอโพส" — คิวงานที่ผ่านการตรวจแล้ว (approved) แต่ยังไม่ถูกทำเครื่องหมายว่าโพส
 * เรียงงานที่รอนานสุดขึ้นก่อน · ปุ่ม "โพสแล้ว" ใหญ่ชัดบนการ์ด กดแล้วงานออกจากคิวทันที
 * (ยังดู/ยกเลิกสถานะโพสย้อนหลังได้ในแท็บ "งานเสร็จ" พร้อมชื่อคนที่กดโพส)
 * ตัวกรองผู้รับผิดชอบอยู่ที่ tasks-client (เริ่มต้น = คิวของฉัน) — ที่นี่รับมาเป็น tasks ที่กรองแล้ว
 */
export function PostingList({
  tasks,
  totalPending,
  sections,
  contentCategories,
  selectedId,
  onRowClick,
  onMarkPosted,
}: {
  /** งานรอโพส (approved + ยังไม่โพส) หลังกรองผู้รับผิดชอบ เรียงรอนานสุดก่อน */
  tasks: TaskWithAssignee[];
  /** จำนวนงานค้างโพสทั้งทีม (ก่อนกรอง) — ใช้แยกข้อความ empty state */
  totalPending: number;
  sections: TaskSectionRow[];
  /** หมวดเนื้อหาคอนเทนต์ — ใช้แปลง content_category_id เป็นชื่อบนชิป */
  contentCategories: ContentCategoryRow[];
  selectedId: string | null;
  onRowClick: (task: TaskWithAssignee) => void;
  /** ทำเครื่องหมายว่าโพสแล้ว (ตั้ง posted_at) — การ์ดจะหายจากคิวนี้ */
  onMarkPosted: (task: TaskWithAssignee) => void;
}) {
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? null;
  const contentCategoryName = (id: string | null) =>
    id === null
      ? null
      : (contentCategories.find((c) => c.id === id)?.name ?? null);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <Send size={40} strokeWidth={1.5} className="text-sky-200" />
        <p className="text-sm font-medium text-stone-600">
          {totalPending === 0
            ? "ไม่มีงานค้างโพส 🎉"
            : "ไม่มีงานรอโพสของคนที่เลือก"}
        </p>
        <p className="max-w-sm text-sm text-stone-400">
          {totalPending === 0
            ? 'งานที่ผู้ตรวจอนุมัติแล้วแต่ยังไม่ได้กด "โพสแล้ว" จะมาเข้าคิวรอที่นี่'
            : `ทั้งทีมยังค้างโพสอยู่ ${totalPending} งาน — เปลี่ยนตัวกรองด้านบนเพื่อดูคิวของคนอื่น`}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-1 sm:px-6">
      <p className="mb-3 text-xs text-stone-400">
        งานที่ตรวจผ่านแล้วและยังไม่ได้โพส {tasks.length} งาน
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tasks.map((task) => (
          <PostingCard
            key={task.id}
            task={task}
            section={sectionName(task.section_id)}
            contentCategoryName={contentCategoryName(task.content_category_id)}
            selected={selectedId === task.id}
            onClick={() => onRowClick(task)}
            onMarkPosted={() => onMarkPosted(task)}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- การ์ดงานรอโพสหนึ่งใบ — preview รูป + ปุ่ม "โพสแล้ว" ใหญ่ชัด ---------- */

function PostingCard({
  task,
  section,
  contentCategoryName,
  selected,
  onClick,
  onMarkPosted,
}: {
  task: TaskWithAssignee;
  section: string | null;
  /** ชื่อหมวดเนื้อหาของงาน (แปลงจาก content_category_id แล้ว) — null = ไม่ได้ระบุ */
  contentCategoryName: string | null;
  selected: boolean;
  onClick: () => void;
  onMarkPosted: () => void;
}) {
  const files = task.files ?? [];
  const since = approvedAtOf(task);
  const wait = waitDurationLabel(since);
  const late = postWaitIsLate(since);
  const owner = postOwnerOf(task);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`งานรอโพส ${task.title}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`flex cursor-pointer flex-col rounded-lg border p-3 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        selected
          ? "border-brand-400 bg-white/85 ring-1 ring-brand-300"
          : "border-white/80 bg-white/85 hover:border-sky-300"
      }`}
    >
      <div className="flex items-start gap-2">
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-stone-800">
          {task.title}
        </p>
        {/* รอนานแค่ไหนแล้ว — เกิน 2 วันเน้นเหลืองเข้มให้รีบเคลียร์ */}
        {wait && (
          <span
            title={`ตรวจผ่านเมื่อ ${formatDateBangkok(since)}`}
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
              late
                ? "bg-amber-100 text-amber-700"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            {wait}
          </span>
        )}
      </div>

      <CardMediaPreview files={files} />

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
        {/* ใครต้องเป็นคนโพส — การ์ดจาก Brief = ผู้สั่ง Brief, ไม่งั้น = ผู้รับผิดชอบการ์ด */}
        {owner.person ? (
          <span
            className="inline-flex items-center gap-1.5"
            title={
              owner.fromBrief
                ? "การ์ดนี้มาจาก Brief — ผู้สั่ง Brief เป็นคนโพส"
                : "การ์ดนี้ไม่มี Brief — ผู้รับผิดชอบเป็นคนโพสเอง"
            }
          >
            <AssigneeAvatar assignee={owner.person} size={5} />
            {profileName(owner.person)}
            {owner.fromBrief && (
              <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                ผู้สั่ง Brief
              </span>
            )}
          </span>
        ) : (
          <span className="text-amber-700">ไม่รู้ว่าใครต้องโพส</span>
        )}
        <span
          className="inline-flex items-center gap-1 text-emerald-700"
          title="ตรวจผ่านเมื่อ"
        >
          <BadgeCheck size={12} />
          {formatDateBangkok(since)}
        </span>
        {section && <span className="text-stone-400">· {section}</span>}
        {task.deliverable_url && (
          <DriveLinkButton
            url={task.deliverable_url}
            variant="compact"
            label="เปิดงานใน Drive"
          />
        )}
        {files.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-brand-600">
            <Paperclip size={11} />
            {files.length}
          </span>
        )}
        {/* ประเภทชิ้นงาน + หมวดเนื้อหา (KPI คอนเทนต์) — ทั้งคู่บังคับตอนกดโพส
            ระบุไม่ครบ = แจ้งไว้ว่าตอนกดโพสจะมีกล่องถามก่อน */}
        {task.content_format !== null && contentCategoryName !== null ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONTENT_FORMATS[task.content_format].chip}`}
          >
            {CONTENT_FORMATS[task.content_format].label} · {contentCategoryName}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {task.content_format === null
              ? "ยังไม่ระบุประเภท"
              : `${CONTENT_FORMATS[task.content_format].label} · ยังไม่ระบุหมวด`}
          </span>
        )}
      </div>

      {/* ปุ่มหลักของแท็บนี้ — ใหญ่ชัด กดแล้วงานออกจากคิวรอโพสทันที
          (mt-auto ดันปุ่มชิดท้ายการ์ด ให้ทุกใบในแถวปุ่มตรงแนวกัน) */}
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMarkPosted();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={`ทำเครื่องหมายว่างาน ${task.title} โพสแล้ว`}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 py-3 text-base font-bold text-white shadow-md shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97]"
        >
          <Send size={18} />
          โพสแล้ว
        </button>
      </div>
    </div>
  );
}
