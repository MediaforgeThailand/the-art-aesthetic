"use client";

import {
  AlertCircle,
  ChevronDown,
  Image as ImageIcon,
  Link2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import {
  DEFAULT_TASK_CATEGORY,
  TASK_PRIORITY,
  taskCategoryChipClass,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import {
  AssigneePicker,
  isTempId,
  type ProfileOption,
  ReviewStatusDot,
} from "./task-card";

export type QuickAddPlacement = "top" | "bottom";

/* สีประจำเซคชันแบบ Monday — วนตามลำดับ */
const SECTION_COLORS = [
  "#a96a58", // brand copper
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ec4899", // pink
  "#64748b", // slate
];

/* คอลัมน์ของลิสต์ — grid เดียวกันทั้งหัวตารางและแถว ให้ตรงกันเสมอ */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_7rem_5.5rem] items-stretch";
/* เซลล์คอลัมน์ (ตั้งแต่คอลัมน์ 2 เป็นต้นไปมีเส้นแบ่งซ้าย) */
const CELL = "flex items-center border-l border-stone-200/70 px-3";

/**
 * ลิสต์งานแบบ Monday — ชื่อเซคชันอยู่นอกกล่อง กล่องมีเฉพาะหัวคอลัมน์+แถวงาน
 * เส้นแบ่งคอลัมน์/แถวชัดเจน แถวสลับสีอ่านง่าย
 */
export function TaskListView({
  sections,
  tasksBySection,
  today,
  selectedId,
  profiles,
  onAssign,
  onRowClick,
  onQuickAdd,
  onRenameSection,
  onAddSection,
  onDeleteSection,
}: {
  sections: TaskSectionRow[];
  tasksBySection: Record<string, TaskWithAssignee[]>;
  today: string;
  selectedId: string | null;
  profiles: ProfileOption[];
  onAssign: (task: TaskWithAssignee, profileId: string | null) => void;
  onRowClick: (task: TaskWithAssignee) => void;
  onQuickAdd: (
    sectionId: string,
    title: string,
    placement: QuickAddPlacement
  ) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onAddSection: (name: string) => void;
  onDeleteSection: (sectionId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingSection, setAddingSection] = useState(false);
  const [sectionDraft, setSectionDraft] = useState("");

  const toggleCollapse = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5 px-4 pb-6 sm:px-6">
      {sections.map((section, si) => {
        const rows = tasksBySection[section.id] ?? [];
        const isCollapsed = collapsed.has(section.id);
        const color = SECTION_COLORS[si % SECTION_COLORS.length];
        return (
          <div key={section.id}>
            {/* หัวเซคชัน — อยู่นอกกล่อง */}
            <SectionHeader
              section={section}
              color={color}
              count={rows.length}
              collapsed={isCollapsed}
              onToggleCollapse={() => toggleCollapse(section.id)}
              onRename={(name) => onRenameSection(section.id, name)}
              onDelete={() => onDeleteSection(section.id)}
            />

            {/* กล่องงาน — มีเฉพาะหัวคอลัมน์ + แถวงาน */}
            {!isCollapsed && (
              <div
                style={{ borderLeftColor: color }}
                className="overflow-hidden rounded-lg border border-l-4 border-stone-200/90 bg-white/95 shadow-sm"
              >
                <div
                  className={`${ROW_GRID} border-b border-stone-200/80 bg-stone-50/90 text-[11px] font-medium uppercase tracking-wide text-stone-400`}
                >
                  <span className="px-3 py-1.5 pl-10">งาน</span>
                  <span className={`${CELL} py-1.5`}>ผู้รับผิดชอบ</span>
                  <span className={`${CELL} py-1.5`}>กำหนดส่ง</span>
                  <span className={`${CELL} py-1.5`}>ความสำคัญ</span>
                  <span className={`${CELL} py-1.5`}>ไฟล์งาน</span>
                </div>

                {rows.map((task, idx) => (
                  <TaskRowItem
                    key={task.id}
                    task={task}
                    today={today}
                    striped={idx % 2 === 1}
                    selected={selectedId === task.id}
                    profiles={profiles}
                    onAssign={(pid) => onAssign(task, pid)}
                    onClick={() => onRowClick(task)}
                  />
                ))}

                {rows.length === 0 && (
                  <p className="px-10 py-2 text-xs text-stone-400">
                    ยังไม่มีงานในเซคชันนี้
                  </p>
                )}

                <QuickAddRow
                  onAdd={(title) => onQuickAdd(section.id, title, "bottom")}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* เพิ่มเซคชัน */}
      {addingSection ? (
        <input
          autoFocus
          value={sectionDraft}
          placeholder="ชื่อเซคชันใหม่ แล้วกด Enter"
          onChange={(e) => setSectionDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const name = sectionDraft.trim();
              setSectionDraft("");
              setAddingSection(false);
              if (name !== "") onAddSection(name);
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setSectionDraft("");
              setAddingSection(false);
            }
          }}
          onBlur={() => {
            const name = sectionDraft.trim();
            setSectionDraft("");
            setAddingSection(false);
            if (name !== "") onAddSection(name);
          }}
          className="w-72 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingSection(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-stone-400 transition-colors hover:bg-white/70 hover:text-brand-700"
        >
          <Plus size={15} />
          เพิ่มเซคชัน
        </button>
      )}
    </div>
  );
}

/* ---------- หัวเซคชัน (นอกกล่อง): พับ/กาง + แก้ชื่อ inline + ลบ ---------- */

function SectionHeader({
  section,
  color,
  count,
  collapsed,
  onToggleCollapse,
  onRename,
  onDelete,
}: {
  section: TaskSectionRow;
  color: string;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(section.name);
  useEffect(() => setDraft(section.name), [section.name]);
  const temp = isTempId(section.id);

  return (
    <div className="group mb-1 flex items-center gap-1">
      <button
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? "กางเซคชัน" : "พับเซคชัน"}
        aria-label={collapsed ? "กางเซคชัน" : "พับเซคชัน"}
        style={{ color }}
        className="cursor-pointer rounded p-0.5 transition-all hover:bg-white/70"
      >
        <ChevronDown
          size={17}
          className={`transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </button>
      <input
        value={draft}
        disabled={temp}
        aria-label="ชื่อเซคชัน"
        size={Math.max(draft.length, 4)}
        style={{ color }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const name = draft.trim();
          if (name === "") setDraft(section.name);
          else onRename(name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(section.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="max-w-xs rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-bold transition-colors hover:border-stone-200/80 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <span className="text-xs font-medium text-stone-400">{count} งาน</span>
      {!temp && (
        <button
          type="button"
          onClick={onDelete}
          title="ลบเซคชัน"
          aria-label="ลบเซคชัน"
          className="cursor-pointer rounded p-1 text-stone-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 active:scale-90"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

/* ---------- แถวงาน ---------- */

function TaskRowItem({
  task,
  today,
  striped,
  selected,
  profiles,
  onAssign,
  onClick,
}: {
  task: TaskWithAssignee;
  today: string;
  striped: boolean;
  selected: boolean;
  profiles: ProfileOption[];
  onAssign: (profileId: string | null) => void;
  onClick: () => void;
}) {
  const temp = isTempId(task.id);
  const overdue =
    task.due_date !== null &&
    !task.completed &&
    task.due_date.slice(0, 10) < today;
  const showCategory = task.category && task.category !== DEFAULT_TASK_CATEGORY;
  const fileCount = task.files?.length ?? 0;
  const hasDeliverable = !!(task.deliverable_url || fileCount > 0);
  const influ = task.influencer;
  const influName = influ
    ? (influ.nickname ??
      [influ.first_name, influ.last_name].filter(Boolean).join(" "))
    : null;

  return (
    <div
      role="button"
      tabIndex={temp ? -1 : 0}
      aria-label={`งาน ${task.title}`}
      onClick={temp ? undefined : onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !temp) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`${ROW_GRID} border-b border-stone-100 transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 ${
        temp ? "pointer-events-none opacity-60" : "cursor-pointer"
      } ${
        selected
          ? "bg-brand-50 shadow-[inset_2px_0_0_0_theme(colors.brand.500)]"
          : striped
            ? "bg-stone-50/60 hover:bg-brand-50/50"
            : "bg-white hover:bg-brand-50/50"
      }`}
    >
      {/* งาน */}
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-1.5">
        <ReviewStatusDot status={task.review_status} size={17} />
        <span
          className={`truncate text-sm ${
            task.completed
              ? "text-stone-400 line-through"
              : "font-medium text-stone-800"
          }`}
        >
          {task.title}
        </span>
        {task.review_status === "pending" && (
          <Badge className="shrink-0 border border-amber-200 bg-amber-50 text-amber-700">
            รอตรวจ
          </Badge>
        )}
        {task.review_status === "approved" && (
          <Badge className="shrink-0 border border-emerald-200 bg-emerald-50 text-emerald-700">
            เสร็จสมบูรณ์
          </Badge>
        )}
        {showCategory && (
          <Badge className={`shrink-0 ${taskCategoryChipClass(task.category)}`}>
            {task.category}
          </Badge>
        )}
        {influName && (
          <Badge className="shrink-0 border border-brand-200 bg-brand-50 text-brand-700">
            <Sparkles size={10} /> {influName}
          </Badge>
        )}
      </div>

      {/* ผู้รับผิดชอบ */}
      <div onClick={(e) => e.stopPropagation()} className={`${CELL} py-1.5`}>
        {temp ? null : (
          <span className="flex items-center gap-1.5">
            <AssigneePicker
              assignee={task.assignee}
              profiles={profiles}
              onAssign={onAssign}
            />
            {task.assignee && (
              <span className="max-w-20 truncate text-xs text-stone-500">
                {task.assignee.full_name ?? task.assignee.email}
              </span>
            )}
          </span>
        )}
      </div>

      {/* กำหนดส่ง */}
      <span
        className={`${CELL} gap-1 py-1.5 text-xs ${
          overdue ? "font-medium text-rose-600" : "text-stone-500"
        }`}
      >
        {overdue && <AlertCircle size={13} />}
        {task.due_date ? formatDate(task.due_date) : "—"}
      </span>

      {/* ความสำคัญ */}
      <span className={`${CELL} py-1.5`}>
        <Badge className={TASK_PRIORITY[task.priority].badge}>
          {TASK_PRIORITY[task.priority].label}
        </Badge>
      </span>

      {/* ไฟล์งานที่ Approve แล้ว */}
      <span className={`${CELL} gap-1 py-1.5`}>
        {task.deliverable_url && (
          <a
            href={task.deliverable_url}
            target="_blank"
            rel="noreferrer"
            title="เปิดลิงก์งาน (Google Drive)"
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer rounded p-1 text-sky-600 transition-colors hover:bg-sky-50"
          >
            <Link2 size={14} />
          </a>
        )}
        {fileCount > 0 && (
          <span
            title={`มีไฟล์งานแนบ ${fileCount} ไฟล์`}
            className="inline-flex items-center gap-0.5 p-1 text-brand-600"
          >
            <ImageIcon size={14} />
            {fileCount > 1 && (
              <span className="text-[10px] font-semibold">{fileCount}</span>
            )}
          </span>
        )}
        {!hasDeliverable && <span className="text-xs text-stone-300">—</span>}
      </span>
    </div>
  );
}

/* ---------- แถวเพิ่มงานเร็ว ---------- */

function QuickAddRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState("");

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 text-[13px] text-stone-400 transition-colors hover:bg-brand-50/50 hover:text-brand-700"
      >
        <Plus size={14} />
        เพิ่มงาน
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5">
      <span className="h-[17px] w-[17px] shrink-0 rounded-full border border-stone-300" />
      <input
        autoFocus
        value={draft}
        placeholder="พิมพ์ชื่องาน แล้วกด Enter — Esc เพื่อปิด"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const t = draft.trim();
            setDraft("");
            if (t !== "") onAdd(t);
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft("");
            setActive(false);
          }
        }}
        onBlur={() => {
          const t = draft.trim();
          setDraft("");
          setActive(false);
          if (t !== "") onAdd(t);
        }}
        className="min-w-0 flex-1 border-none bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none"
      />
    </div>
  );
}
