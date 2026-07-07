"use client";

import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, InlineInput } from "@/components/ui";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import {
  isTempId,
  type ProfileOption,
  TaskCard,
  TaskCardContent,
} from "./task-card";

export type QuickAddPlacement = "top" | "bottom";

/* ---------- composer: กดปุ่มเพิ่มงานแล้ว "การ์ดเปล่า" โผล่ทันที ค่อยพิมพ์ชื่อในการ์ด ---------- */

function TaskComposer({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = (keepOpen: boolean) => {
    const title = text.trim();
    if (title !== "") onSubmit(title);
    setText("");
    // Enter ค้างช่องไว้ให้พิมพ์งานถัดไปต่อเนื่อง (แบบ Asana) — blur/Esc ปิด
    if (!keepOpen || title === "") onClose();
  };

  return (
    <div className="rounded-lg border border-brand-300 bg-white p-3 shadow-md ring-2 ring-brand-100 animate-scale-in">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border border-stone-300 bg-white" />
        <textarea
          ref={inputRef}
          value={text}
          rows={2}
          placeholder="พิมพ์ชื่องาน แล้วกด Enter"
          aria-label="ชื่องานใหม่"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit(true);
            }
            if (e.key === "Escape") {
              setText("");
              onClose();
            }
          }}
          onBlur={() => commit(false)}
          className="min-w-0 flex-1 resize-none border-none bg-transparent text-sm font-medium leading-snug text-stone-900 placeholder:text-stone-400 focus:outline-none"
        />
      </div>
      <div className="mt-2 pl-6">
        <span
          title="ยังไม่ระบุผู้รับผิดชอบ"
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-stone-300"
        />
      </div>
    </div>
  );
}

/* ---------- หัวคอลัมน์ — ลากเพื่อเรียงเซคชัน, คลิกชื่อเพื่อเปลี่ยนชื่อ ---------- */

function SectionHeader({
  section,
  count,
  disabled,
  dragHandleProps,
  onRename,
  onDelete,
  onQuickAddTop,
}: {
  section: TaskSectionRow;
  count: number;
  disabled: boolean;
  dragHandleProps: Record<string, unknown>;
  onRename: (name: string) => void;
  onDelete: () => void;
  onQuickAddTop: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);

  const openEditor = () => {
    setName(section.name); // เริ่มจากชื่อจริงเสมอ — กัน draft ค้างจากรอบก่อน
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed !== "" && trimmed !== section.name) {
      onRename(trimmed);
    } else {
      setName(section.name);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <InlineInput
          autoFocus
          value={name}
          aria-label="ชื่อเซคชัน"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(section.name);
              setEditing(false);
            }
          }}
          onBlur={commit}
          className="px-2 py-1 text-sm font-semibold"
        />
      </div>
    );
  }

  return (
    <div
      {...dragHandleProps}
      className={`group flex items-center gap-2 px-3 pb-2 pt-3 ${
        disabled ? "" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <button
        type="button"
        onClick={disabled ? undefined : openEditor}
        title="คลิกเพื่อเปลี่ยนชื่อเซคชัน"
        onKeyDown={(e) => e.stopPropagation()}
        className="min-w-0 cursor-text truncate text-sm font-semibold text-stone-700 hover:text-stone-900"
      >
        {section.name}
      </button>
      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-500 shadow-sm">
        {count}
      </span>
      {!disabled && (
        <div
          onKeyDown={(e) => e.stopPropagation()}
          className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={onQuickAddTop}
            title="เพิ่มงานบนสุด"
            aria-label="เพิ่มงานบนสุดของเซคชันนี้"
            className="cursor-pointer rounded-md p-1 text-stone-400 transition-colors hover:bg-white hover:text-brand-700 active:scale-90"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={openEditor}
            title="เปลี่ยนชื่อ"
            aria-label="เปลี่ยนชื่อเซคชัน"
            className="cursor-pointer rounded-md p-1 text-stone-400 transition-colors hover:bg-white hover:text-brand-700 active:scale-90"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="ลบเซคชัน"
            aria-label="ลบเซคชัน"
            className="cursor-pointer rounded-md p-1 text-stone-400 transition-colors hover:bg-white hover:text-rose-600 active:scale-90"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- คอลัมน์ ---------- */

function BoardColumn({
  section,
  tasks,
  today,
  selectedId,
  highlight,
  profiles,
  onAssign,
  onCardClick,
  onQuickAdd,
  onRename,
  onDelete,
}: {
  section: TaskSectionRow;
  tasks: TaskWithAssignee[];
  today: string;
  selectedId: string | null;
  highlight: boolean;
  profiles: ProfileOption[];
  onAssign: (task: TaskWithAssignee, profileId: string | null) => void;
  onCardClick: (task: TaskWithAssignee) => void;
  onQuickAdd: (title: string, placement: QuickAddPlacement) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const temp = isTempId(section.id);
  const [composer, setComposer] = useState<QuickAddPlacement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `sec:${section.id}`,
    data: { type: "section", sectionId: section.id },
    disabled: temp,
  });

  const { setNodeRef: setBodyDropRef } = useDroppable({
    id: `body:${section.id}`,
    data: { type: "body", sectionId: section.id },
    disabled: temp,
  });

  // เปิด composer แล้วเลื่อนให้เห็นการ์ดเปล่าเสมอ
  useEffect(() => {
    if (!composer || !bodyRef.current) return;
    bodyRef.current.scrollTop =
      composer === "bottom" ? bodyRef.current.scrollHeight : 0;
  }, [composer]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex max-h-full w-[280px] shrink-0 flex-col rounded-xl transition-colors duration-200 ${
        highlight
          ? "border border-brand-300/60 bg-brand-100/50 ring-2 ring-brand-300 backdrop-blur-md"
          : "glass-soft"
      } ${isDragging ? "z-10 opacity-90 shadow-2xl" : ""} ${
        temp ? "opacity-60" : ""
      }`}
    >
      <SectionHeader
        section={section}
        count={tasks.length}
        disabled={temp}
        dragHandleProps={{ ...attributes, ...listeners }}
        onRename={onRename}
        onDelete={onDelete}
        onQuickAddTop={() => setComposer("top")}
      />

      <div
        ref={(el) => {
          setBodyDropRef(el);
          bodyRef.current = el;
        }}
        className="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2"
      >
        {composer === "top" && (
          <TaskComposer
            onSubmit={(title) => onQuickAdd(title, "top")}
            onClose={() => setComposer(null)}
          />
        )}

        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 && composer === null && (
            <div
              className={`flex items-center justify-center rounded-lg border-2 border-dashed py-6 text-xs transition-colors duration-200 ${
                highlight
                  ? "border-brand-300 text-brand-500"
                  : "border-stone-200 text-stone-300"
              }`}
            >
              วางการ์ดที่นี่
            </div>
          )}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              sectionId={section.id}
              today={today}
              selected={selectedId === task.id}
              onClick={() => onCardClick(task)}
              profiles={profiles}
              onAssign={(profileId) => onAssign(task, profileId)}
            />
          ))}
        </SortableContext>

        {composer === "bottom" && (
          <TaskComposer
            onSubmit={(title) => onQuickAdd(title, "bottom")}
            onClose={() => setComposer(null)}
          />
        )}
      </div>

      {!temp && (
        <div className="px-2.5 pb-2.5">
          <button
            type="button"
            onClick={() => setComposer("bottom")}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-stone-400 transition-colors duration-200 hover:bg-white hover:text-brand-700 active:scale-[0.98]"
          >
            <Plus size={15} />
            เพิ่มงาน
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- เพิ่มเซคชันใหม่ ---------- */

function AddSectionColumn({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const commit = () => {
    const trimmed = name.trim();
    setOpen(false);
    setName("");
    if (trimmed !== "") onAdd(trimmed);
  };

  return (
    <div className="w-64 shrink-0">
      {open ? (
        <div className="glass-soft rounded-xl p-2.5">
          <div className="flex items-center gap-1.5">
            <InlineInput
              autoFocus
              value={name}
              placeholder="ชื่อเซคชัน เช่น งานด่วน"
              aria-label="ชื่อเซคชันใหม่"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setName("");
                  setOpen(false);
                }
              }}
              onBlur={commit}
              className="px-2 py-1.5 text-sm font-semibold"
            />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit();
              }}
              className="cursor-pointer rounded-md p-1.5 text-emerald-600 hover:bg-white active:scale-90"
              title="สร้าง"
              aria-label="สร้างเซคชัน"
            >
              <Check size={15} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setName("");
                setOpen(false);
              }}
              className="cursor-pointer rounded-md p-1.5 text-stone-400 hover:bg-white active:scale-90"
              title="ยกเลิก"
              aria-label="ยกเลิก"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-200/70 px-3 py-4 text-sm text-stone-400 transition-all duration-200 hover:border-brand-300 hover:bg-white/40 hover:text-brand-700 active:scale-[0.98]"
        >
          <Plus size={15} />
          เพิ่มเซคชัน
        </button>
      )}
    </div>
  );
}

/* ---------- บอร์ด ---------- */

export function KanbanBoard({
  sections,
  tasksBySection,
  taskById,
  today,
  selectedId,
  profiles,
  onAssign,
  onMoveTask,
  onReorderSections,
  onCardClick,
  onQuickAdd,
  onRenameSection,
  onAddSection,
  onDeleteSection,
}: {
  sections: TaskSectionRow[];
  tasksBySection: Record<string, TaskWithAssignee[]>;
  taskById: Map<string, TaskWithAssignee>;
  today: string;
  selectedId: string | null;
  profiles: ProfileOption[];
  onAssign: (task: TaskWithAssignee, profileId: string | null) => void;
  onMoveTask: (
    taskId: string,
    sectionId: string,
    prevId: string | null,
    nextId: string | null
  ) => void;
  onReorderSections: (activeId: string, overId: string) => void;
  onCardClick: (task: TaskWithAssignee) => void;
  onQuickAdd: (
    sectionId: string,
    title: string,
    placement: QuickAddPlacement
  ) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onAddSection: (name: string) => void;
  onDeleteSection: (sectionId: string) => void;
}) {
  const [activeTask, setActiveTask] = useState<TaskWithAssignee | null>(null);
  const [order, setOrder] = useState<Record<string, string[]> | null>(null);
  const [overSectionId, setOverSectionId] = useState<string | null>(null);
  const suppressClickRef = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Space = ยก/วางการ์ดด้วยคีย์บอร์ด — เว้น Enter ไว้สำหรับเปิดแผงรายละเอียด
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const baseOrder = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const s of sections) {
      m[s.id] = (tasksBySection[s.id] ?? []).map((t) => t.id);
    }
    return m;
  }, [sections, tasksBySection]);

  const currentOrder = order ?? baseOrder;

  const findContainer = (
    id: string,
    o: Record<string, string[]>
  ): string | null =>
    Object.keys(o).find((key) => o[key].includes(id)) ?? null;

  // ลาก section ให้ชนกันเฉพาะ section ด้วยกัน — ลากการ์ดใช้ตำแหน่ง pointer ก่อน
  const collisionDetection: CollisionDetection = (args) => {
    if (args.active.data.current?.type === "section") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.type === "section"
        ),
      });
    }
    const within = pointerWithin(args);
    return within.length > 0 ? within : rectIntersection(args);
  };

  const releaseClickSuppression = () => {
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleDragStart = (event: DragStartEvent) => {
    suppressClickRef.current = true;
    const data = event.active.data.current;
    if (data?.type === "task") {
      setActiveTask(taskById.get(String(event.active.id)) ?? null);
      setOrder(baseOrder);
    }
  };

  const resolveOverSection = (over: DragOverEvent["over"]): string | null => {
    if (!over) return null;
    const data = over.data.current;
    if (data?.type === "task") {
      return findContainer(String(over.id), order ?? baseOrder);
    }
    if (data?.type === "body" || data?.type === "section") {
      return (data.sectionId as string) ?? null;
    }
    return null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (event.active.data.current?.type !== "task") return;
    const activeId = String(event.active.id);
    const target = resolveOverSection(event.over);
    setOverSectionId(target);
    if (!target || isTempId(target)) return;

    setOrder((prev) => {
      const o = prev ?? baseOrder;
      const source = findContainer(activeId, o);
      if (!source || source === target) return prev;
      const dst = [...(o[target] ?? [])];
      let insertAt = dst.length;
      if (event.over?.data.current?.type === "task") {
        const idx = dst.indexOf(String(event.over.id));
        if (idx >= 0) insertAt = idx;
      }
      dst.splice(insertAt, 0, activeId);
      return {
        ...o,
        [source]: o[source].filter((id) => id !== activeId),
        [target]: dst,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    releaseClickSuppression();
    const type = active.data.current?.type;

    if (type === "section") {
      const activeSec = String(active.id).replace(/^sec:/, "");
      const overSec = over ? String(over.id).replace(/^sec:/, "") : null;
      if (overSec && overSec !== activeSec) {
        onReorderSections(activeSec, overSec);
      }
      return;
    }

    const o = order ?? baseOrder;
    const activeId = String(active.id);
    setActiveTask(null);
    setOverSectionId(null);
    setOrder(null);

    const container = findContainer(activeId, o);
    if (!container) return;

    // ตัด id ที่ตายไปแล้วออกจาก snapshot (เช่นแถว optimistic ที่เพิ่งสลับเป็น id จริงระหว่างลาก)
    // ไม่งั้นเพื่อนบ้านชี้ไปแถวที่ไม่มีอยู่ แล้ว position ตกไปค่า fallback ผิดที่
    let arr = o[container].filter(
      (id) => id === activeId || taskById.has(id)
    );
    if (over && over.data.current?.type === "task") {
      const overId = String(over.id);
      if (findContainer(overId, o) === container && overId !== activeId) {
        arr = arrayMove(arr, arr.indexOf(activeId), arr.indexOf(overId));
      }
    }

    // ไม่มีอะไรเปลี่ยน (คอลัมน์เดิม ลำดับเดิม) — ไม่ต้องยิง DB
    const original = baseOrder[container];
    if (original && original.join("\n") === arr.join("\n")) return;

    const idx = arr.indexOf(activeId);
    onMoveTask(
      activeId,
      container,
      idx > 0 ? arr[idx - 1] : null,
      idx < arr.length - 1 ? arr[idx + 1] : null
    );
  };

  const handleDragCancel = () => {
    setActiveTask(null);
    setOverSectionId(null);
    setOrder(null);
    // ยกเลิกด้วย Esc: ปุ่มเมาส์อาจยังกดค้าง — กัน click ที่จะตามมาหลังปล่อย
    window.addEventListener("pointerup", releaseClickSuppression, {
      once: true,
    });
    window.setTimeout(releaseClickSuppression, 350);
  };

  const handleCardClick = (task: TaskWithAssignee) => {
    if (suppressClickRef.current) return;
    onCardClick(task);
  };

  if (sections.length === 0) {
    return (
      <div className="flex h-full items-start gap-4 px-4 pt-1 sm:px-6">
        <div className="w-80">
          <EmptyState
            icon={<ListPlus size={40} />}
            title="ยังไม่มีเซคชัน"
            description="สร้างเซคชันแรก เช่น To do / Doing / Done เพื่อเริ่มจัดการงาน"
          />
        </div>
        <AddSectionColumn onAdd={onAddSection} />
      </div>
    );
  }

  return (
    <DndContext
      id="tasks-board-dnd"
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full items-start gap-3 px-4 pb-3 pt-1 sm:px-6 animate-fade-in">
        <SortableContext
          items={sections.map((s) => `sec:${s.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          {sections.map((section) => {
            const ids = currentOrder[section.id] ?? [];
            const tasks = ids
              .map((id) => taskById.get(id))
              .filter((t): t is TaskWithAssignee => t !== undefined);
            return (
              <BoardColumn
                key={section.id}
                section={section}
                tasks={tasks}
                today={today}
                selectedId={selectedId}
                highlight={
                  activeTask !== null && overSectionId === section.id
                }
                profiles={profiles}
                onAssign={onAssign}
                onCardClick={handleCardClick}
                onQuickAdd={(title, placement) =>
                  onQuickAdd(section.id, title, placement)
                }
                onRename={(name) => onRenameSection(section.id, name)}
                onDelete={() => onDeleteSection(section.id)}
              />
            );
          })}
        </SortableContext>
        <AddSectionColumn onAdd={onAddSection} />
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskCardContent task={activeTask} today={today} overlay />
        )}
      </DragOverlay>
    </DndContext>
  );
}
