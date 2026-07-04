"use client";

import {
  AlertCircle,
  ChevronDown,
  Image as ImageIcon,
  Link2,
  Plus,
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
  CompleteToggle,
  isTempId,
  type ProfileOption,
} from "./task-card";

export type QuickAddPlacement = "top" | "bottom";

/* คอลัมน์ของลิสต์ — grid เดียวกันทั้งหัวตารางและแถว ให้ตรงกันเสมอ */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_9.5rem_7.5rem_6.5rem_5.5rem] items-center gap-2";

/**
 * ลิสต์งานแบบ Monday/Asana — จัดกลุ่มตามเซคชัน แถวละงาน
 * ใช้บันทึกงานที่ทำ + เก็บไฟล์/ลิงก์งานที่ได้รับอนุมัติ (ดูรายละเอียดในแผงขวา)
 */
export function TaskListView({
  sections,
  tasksBySection,
  today,
  selectedId,
  profiles,
  onAssign,
  onRowClick,
  onToggleComplete,
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
  onToggleComplete: (task: TaskWithAssignee) => void;
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
    <div className="space-y-4 px-4 pb-6 sm:px-6">
      {sections.map((section) => {
        const rows = tasksBySection[section.id] ?? [];
        const isCollapsed = collapsed.has(section.id);
        return (
          <div key={section.id} className="glass-soft rounded-xl">
            <SectionHeader
              section={section}
              count={rows.length}
              collapsed={isCollapsed}
              onToggleCollapse={() => toggleCollapse(section.id)}
              onRename={(name) => onRenameSection(section.id, name)}
              onDelete={() => onDeleteSection(section.id)}
            />

            {!isCollapsed && (
              <div className="pb-1">
                {/* หัวคอลัมน์ */}
                <div
                  className={`${ROW_GRID} border-b border-stone-200/60 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400`}
                >
                  <span className="pl-7">งาน</span>
                  <span>ผู้รับผิดชอบ</span>
                  <span>กำหนดส่ง</span>
                  <span>ความสำคัญ</span>
                  <span>ไฟล์งาน</span>
                </div>

                {rows.map((task) => (
                  <TaskRowItem
                    key={task.id}
                    task={task}
                    today={today}
                    selected={selectedId === task.id}
                    profiles={profiles}
                    onAssign={(pid) => onAssign(task, pid)}
                    onClick={() => onRowClick(task)}
                    onToggleComplete={() => onToggleComplete(task)}
                  />
                ))}

                {rows.length === 0 && (
                  <p className="px-11 py-2.5 text-xs text-stone-400">
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
          className="w-72 rounded-lg border border-brand-300 bg-white/90 px-3 py-2 text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingSection(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-400 transition-colors hover:bg-white/60 hover:text-brand-700"
        >
          <Plus size={15} />
          เพิ่มเซคชัน
        </button>
      )}
    </div>
  );
}

/* ---------- หัวเซคชัน: พับ/กาง + แก้ชื่อ inline + ลบ ---------- */

function SectionHeader({
  section,
  count,
  collapsed,
  onToggleCollapse,
  onRename,
  onDelete,
}: {
  section: TaskSectionRow;
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
    <div className="group flex items-center gap-1.5 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? "กางเซคชัน" : "พับเซคชัน"}
        aria-label={collapsed ? "กางเซคชัน" : "พับเซคชัน"}
        className="cursor-pointer rounded p-1 text-stone-400 transition-all hover:bg-white/70 hover:text-stone-600"
      >
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </button>
      <input
        value={draft}
        disabled={temp}
        aria-label="ชื่อเซคชัน"
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
        className="min-w-0 max-w-xs flex-shrink rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-stone-800 transition-colors hover:border-stone-200/80 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <span className="text-xs text-stone-400">{count}</span>
      {!temp && (
        <button
          type="button"
          onClick={onDelete}
          title="ลบเซคชัน"
          aria-label="ลบเซคชัน"
          className="ml-auto cursor-pointer rounded p-1.5 text-stone-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 active:scale-90"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

/* ---------- แถวงาน ---------- */

function TaskRowItem({
  task,
  today,
  selected,
  profiles,
  onAssign,
  onClick,
  onToggleComplete,
}: {
  task: TaskWithAssignee;
  today: string;
  selected: boolean;
  profiles: ProfileOption[];
  onAssign: (profileId: string | null) => void;
  onClick: () => void;
  onToggleComplete: () => void;
}) {
  const temp = isTempId(task.id);
  const overdue =
    task.due_date !== null &&
    !task.completed &&
    task.due_date.slice(0, 10) < today;
  const showCategory = task.category && task.category !== DEFAULT_TASK_CATEGORY;
  const hasDeliverable = !!(task.deliverable_url || task.deliverable_file_path);

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
      className={`${ROW_GRID} border-b border-stone-100/80 px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 ${
        temp ? "pointer-events-none opacity-60" : "cursor-pointer"
      } ${
        selected
          ? "bg-brand-50/80 shadow-[inset_2px_0_0_0_theme(colors.brand.500)]"
          : "hover:bg-white/70"
      }`}
    >
      {/* งาน */}
      <div className="flex min-w-0 items-center gap-2.5">
        <CompleteToggle
          completed={task.completed}
          onToggle={temp ? undefined : onToggleComplete}
          size={17}
        />
        <span
          className={`truncate text-sm font-medium ${
            task.completed ? "text-stone-400 line-through" : "text-stone-800"
          }`}
        >
          {task.title}
        </span>
        {showCategory && (
          <Badge className={`shrink-0 ${taskCategoryChipClass(task.category)}`}>
            {task.category}
          </Badge>
        )}
      </div>

      {/* ผู้รับผิดชอบ */}
      <div onClick={(e) => e.stopPropagation()} className="flex items-center">
        {temp ? null : (
          <AssigneePicker
            assignee={task.assignee}
            profiles={profiles}
            onAssign={onAssign}
          />
        )}
      </div>

      {/* กำหนดส่ง */}
      <span
        className={`inline-flex items-center gap-1 text-xs ${
          overdue ? "font-medium text-rose-600" : "text-stone-500"
        }`}
      >
        {overdue && <AlertCircle size={13} />}
        {task.due_date ? formatDate(task.due_date) : "—"}
      </span>

      {/* ความสำคัญ */}
      <span>
        <Badge className={TASK_PRIORITY[task.priority].badge}>
          {TASK_PRIORITY[task.priority].label}
        </Badge>
      </span>

      {/* ไฟล์งานที่ Approve แล้ว */}
      <span className="flex items-center gap-1.5">
        {task.deliverable_url && (
          <a
            href={task.deliverable_url}
            target="_blank"
            rel="noreferrer"
            title="เปิดลิงก์งาน (Google Drive)"
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer rounded p-1 text-sky-600 transition-colors hover:bg-sky-50"
          >
            <Link2 size={15} />
          </a>
        )}
        {task.deliverable_file_path && (
          <span title="มีไฟล์งานแนบ" className="p-1 text-brand-600">
            <ImageIcon size={15} />
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
        className="flex w-full cursor-pointer items-center gap-1.5 px-4 py-2 text-sm text-stone-400 transition-colors hover:bg-white/60 hover:text-brand-700"
      >
        <Plus size={15} />
        เพิ่มงาน
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-4 py-1.5">
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
