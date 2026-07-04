"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DemoBanner } from "@/components/demo-badge";
import { ConfirmDialog, Input, Select } from "@/components/ui";
import { DEFAULT_TASK_CATEGORY } from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  ProfileRow,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import { KanbanBoard, type QuickAddPlacement } from "./board";
import { isTempId, profileName } from "./task-card";
import { TaskPanel, type TaskPatch } from "./task-panel";

type ProfileOption = Pick<ProfileRow, "id" | "full_name" | "email">;

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

export function TasksClient({
  sections: initialSections,
  tasks,
  profiles,
  userId,
  loadError,
}: {
  sections: TaskSectionRow[];
  tasks: TaskWithAssignee[];
  profiles: ProfileOption[];
  userId: string | null;
  loadError: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  // state ฝั่งจอเป็นแหล่งความจริงระหว่างใช้งาน — ทุกการแก้ไข optimistic ทันที
  const [items, setItems] = useState<TaskWithAssignee[]>(tasks);
  const [sections, setSections] = useState<TaskSectionRow[]>(initialSections);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setItems(tasks), [tasks]);
  useEffect(() => setSections(initialSections), [initialSections]);

  const showError = (msg: string) => {
    setError(msg);
    window.setTimeout(() => setError(null), 6000);
  };

  /* ---------- filters ---------- */

  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [hideCompleted, setHideCompleted] = useState(false);

  const hasFilter =
    search.trim() !== "" || assigneeFilter !== "all" || hideCompleted;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (hideCompleted && t.completed) return false;
      if (assigneeFilter === "none") {
        if (t.assignee_id !== null) return false;
      } else if (assigneeFilter !== "all" && t.assignee_id !== assigneeFilter) {
        return false;
      }
      if (q === "") return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, assigneeFilter, hideCompleted]);

  /** งานที่ section หายไป (null/ไม่รู้จัก) ถูกพักไว้ที่คอลัมน์แรก — กติกาเดียวกับตอนลบ section */
  const bucketOf = (t: TaskWithAssignee): string | null => {
    if (t.section_id && sections.some((s) => s.id === t.section_id)) {
      return t.section_id;
    }
    return sections[0]?.id ?? null;
  };

  const tasksBySection = useMemo(() => {
    const map: Record<string, TaskWithAssignee[]> = {};
    for (const s of sections) map[s.id] = [];
    for (const t of filtered) {
      const bucket = bucketOf(t);
      if (bucket) map[bucket].push(t);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position - b.position);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sections]);

  const taskById = useMemo(
    () => new Map(items.map((t) => [t.id, t])),
    [items]
  );

  const hasDemo = items.some((t) => t.description === "demo");
  const today = todayISO();
  const selectedTask = selectedId ? (taskById.get(selectedId) ?? null) : null;

  /* ---------- task mutations (optimistic ทั้งหมด) ---------- */

  const patchTask = (id: string, patch: TaskPatch) => {
    if (isTempId(id)) return; // แถวยังไม่ถึง DB — กัน update ด้วย id ปลอม
    const prev = items.find((t) => t.id === id);
    if (!prev) return;
    const merged = { ...patch.db, ...(patch.local ?? {}) };
    // undo เฉพาะ field ที่แก้ — ไม่ทับการแก้ไขอื่นที่สำเร็จไปแล้ว
    const undo: Record<string, unknown> = {};
    for (const key of Object.keys(merged)) {
      undo[key] = prev[key as keyof TaskWithAssignee];
    }
    setItems((cur) =>
      cur.map((t) => (t.id === id ? ({ ...t, ...merged } as TaskWithAssignee) : t))
    );
    void supabase
      .from("tasks")
      .update(patch.db)
      .eq("id", id)
      .then(({ error: e }) => {
        if (e) {
          setItems((cur) =>
            cur.map((t) =>
              t.id === id ? ({ ...t, ...undo } as TaskWithAssignee) : t
            )
          );
          showError(`บันทึกไม่สำเร็จ: ${e.message}`);
        }
      });
  };

  /** ตำแหน่งใหม่จากเพื่อนบ้านที่มองเห็น — กึ่งกลางระหว่างสองการ์ด */
  const positionBetween = (
    prevPos: number | null,
    nextPos: number | null
  ): number => {
    if (prevPos === null && nextPos === null) return 1024;
    if (prevPos === null) return (nextPos as number) - 1;
    if (nextPos === null) return prevPos + 1;
    return (prevPos + nextPos) / 2;
  };

  const moveTaskTo = (
    taskId: string,
    sectionId: string,
    prevId: string | null,
    nextId: string | null
  ) => {
    if (isTempId(taskId) || isTempId(sectionId)) return;
    const task = taskById.get(taskId);
    if (!task) return;
    const position = positionBetween(
      prevId ? (taskById.get(prevId)?.position ?? null) : null,
      nextId ? (taskById.get(nextId)?.position ?? null) : null
    );
    if (task.section_id === sectionId && task.position === position) return;
    patchTask(taskId, { db: { section_id: sectionId, position } });
  };

  const toggleComplete = (task: TaskWithAssignee) => {
    patchTask(task.id, { db: { completed: !task.completed } });
  };

  /** เปลี่ยนผู้รับผิดชอบจากวงกลมบนการ์ดโดยตรง */
  const assignTask = (task: TaskWithAssignee, profileId: string | null) => {
    if (task.assignee_id === profileId) return;
    const person = profiles.find((p) => p.id === profileId) ?? null;
    patchTask(task.id, {
      db: { assignee_id: profileId },
      local: { assignee: person },
    });
  };

  const quickAdd = async (
    sectionId: string,
    title: string,
    placement: QuickAddPlacement
  ) => {
    if (isTempId(sectionId)) return;
    // ใช้กติกาเดียวกับที่บอร์ดแสดงผล (งานไร้ section ถูกพักไว้คอลัมน์แรก)
    const inSection = items.filter((t) => bucketOf(t) === sectionId);
    const position =
      inSection.length === 0
        ? 1024
        : placement === "top"
          ? Math.min(...inSection.map((t) => t.position)) - 1
          : Math.max(...inSection.map((t) => t.position)) + 1;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: TaskWithAssignee = {
      id: tempId,
      title,
      description: null,
      status: "todo",
      priority: "medium",
      category: DEFAULT_TASK_CATEGORY,
      due_date: null,
      assignee_id: null,
      section_id: sectionId,
      completed: false,
      position,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee: null,
    };
    setItems((cur) => [...cur, optimistic]);

    const { data, error: e } = await supabase
      .from("tasks")
      .insert({
        title,
        section_id: sectionId,
        position,
        created_by: userId,
      })
      .select("*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)")
      .single();

    if (e || !data) {
      setItems((cur) => cur.filter((t) => t.id !== tempId));
      showError(`เพิ่มงานไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    const real = data as unknown as TaskWithAssignee;
    setItems((cur) => cur.map((t) => (t.id === tempId ? real : t)));
    setSelectedId((sel) => (sel === tempId ? real.id : sel));
  };

  const requestDeleteTask = (task: TaskWithAssignee) => {
    if (isTempId(task.id)) return;
    setConfirm({
      title: "ลบงาน",
      message: `ลบงาน "${task.title}" ใช่หรือไม่? การลบย้อนกลับไม่ได้`,
      onConfirm: () => {
        setItems((cur) => cur.filter((t) => t.id !== task.id));
        setSelectedId((sel) => (sel === task.id ? null : sel));
        void supabase
          .from("tasks")
          .delete()
          .eq("id", task.id)
          .then(({ error: e }) => {
            if (e) {
              // คืนเฉพาะแถวที่ลบ — ไม่ทับ state อื่นที่เปลี่ยนไประหว่างรอ
              setItems((cur) =>
                cur.some((t) => t.id === task.id) ? cur : [...cur, task]
              );
              showError(`ลบงานไม่สำเร็จ: ${e.message}`);
            }
          });
      },
    });
  };

  /* ---------- section mutations ---------- */

  const renameSection = (sectionId: string, name: string) => {
    if (isTempId(sectionId)) return;
    const prevName = sections.find((s) => s.id === sectionId)?.name;
    if (prevName === undefined || prevName === name) return;
    setSections((cur) =>
      cur.map((s) => (s.id === sectionId ? { ...s, name } : s))
    );
    void supabase
      .from("task_sections")
      .update({ name })
      .eq("id", sectionId)
      .then(({ error: e }) => {
        if (e) {
          setSections((cur) =>
            cur.map((s) => (s.id === sectionId ? { ...s, name: prevName } : s))
          );
          showError(`เปลี่ยนชื่อไม่สำเร็จ: ${e.message}`);
        }
      });
  };

  const addSection = async (name: string) => {
    const position =
      sections.length > 0
        ? Math.max(...sections.map((s) => s.position)) + 1
        : 1;
    const tempId = `temp-${Date.now()}`;
    setSections((cur) => [
      ...cur,
      { id: tempId, name, position, created_at: new Date().toISOString() },
    ]);
    const { data, error: e } = await supabase
      .from("task_sections")
      .insert({ name, position })
      .select()
      .single();
    if (e || !data) {
      setSections((cur) => cur.filter((s) => s.id !== tempId));
      showError(`สร้างเซคชันไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setSections((cur) => cur.map((s) => (s.id === tempId ? data : s)));
  };

  const reorderSections = (activeId: string, overId: string) => {
    if (isTempId(activeId) || isTempId(overId)) return;
    const from = sections.findIndex((s) => s.id === activeId);
    const to = sections.findIndex((s) => s.id === overId);
    if (from < 0 || to < 0 || from === to) return;

    const list = [...sections];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const position = positionBetween(
      list[to - 1]?.position ?? null,
      list[to + 1]?.position ?? null
    );

    const undo = sections;
    setSections(
      list.map((s) => (s.id === activeId ? { ...s, position } : s))
    );
    void supabase
      .from("task_sections")
      .update({ position })
      .eq("id", activeId)
      .then(({ error: e }) => {
        if (e) {
          setSections(undo);
          showError(`ย้ายเซคชันไม่สำเร็จ: ${e.message}`);
        }
      });
  };

  const requestDeleteSection = (sectionId: string) => {
    if (isTempId(sectionId)) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const remaining = sections.filter((s) => s.id !== sectionId);
    if (remaining.length === 0) {
      showError("ต้องเหลืออย่างน้อย 1 เซคชัน");
      return;
    }
    // นับตามที่ตาเห็นจริง — รวมงานไร้ section ที่ถูกพักไว้คอลัมน์แรกด้วย
    const affected = items.filter((t) => bucketOf(t) === sectionId);
    const target = remaining[0];

    const run = () => void doDeleteSection(section, target, affected);
    if (affected.length > 0) {
      setConfirm({
        title: "ลบเซคชัน",
        message: `เซคชัน "${section.name}" มีงาน ${affected.length} รายการ — งานทั้งหมดจะย้ายไป "${target.name}" แล้วลบเซคชันนี้ ใช่หรือไม่?`,
        onConfirm: run,
      });
    } else {
      run();
    }
  };

  const doDeleteSection = async (
    section: TaskSectionRow,
    target: TaskSectionRow,
    affected: TaskWithAssignee[]
  ) => {
    const index = sections.findIndex((s) => s.id === section.id);
    const wasFirst = index === 0;
    const originalSection = new Map(
      affected.map((t) => [t.id, t.section_id] as const)
    );

    setSections((cur) => cur.filter((s) => s.id !== section.id));
    setItems((cur) =>
      cur.map((t) =>
        originalSection.has(t.id) ? { ...t, section_id: target.id } : t
      )
    );

    const restoreSection = () =>
      setSections((cur) => {
        if (cur.some((s) => s.id === section.id)) return cur;
        const list = [...cur];
        list.splice(Math.min(index, list.length), 0, section);
        return list;
      });

    // ย้ายฝั่ง server เสมอ (no-op ถ้าไม่มีงาน) — กันงานที่เครื่องอื่นเพิ่งเพิ่มค้างอยู่จน FK ห้ามลบ
    let moveErr = (
      await supabase
        .from("tasks")
        .update({ section_id: target.id })
        .eq("section_id", section.id)
    ).error;
    if (!moveErr && wasFirst) {
      // งานไร้ section แสดงอยู่คอลัมน์แรก — ย้ายให้ตรงกับที่ผู้ใช้เห็น
      moveErr = (
        await supabase
          .from("tasks")
          .update({ section_id: target.id })
          .is("section_id", null)
      ).error;
    }
    if (moveErr) {
      setItems((cur) =>
        cur.map((t) =>
          originalSection.has(t.id)
            ? { ...t, section_id: originalSection.get(t.id) ?? null }
            : t
        )
      );
      restoreSection();
      showError(`ย้ายงานไม่สำเร็จ: ${moveErr.message}`);
      return;
    }

    const { error: delErr } = await supabase
      .from("task_sections")
      .delete()
      .eq("id", section.id);
    if (delErr) {
      // งานย้ายสำเร็จแล้ว (ตรงกับ DB) — คืนเฉพาะตัวเซคชัน
      restoreSection();
      showError(`ลบเซคชันไม่สำเร็จ: ${delErr.message}`);
    }
  };

  /* ---------- render ---------- */

  return (
    <div className="flex h-full min-h-0">
      {/* ฝั่งซ้าย: หัวข้อ + ตัวกรอง + บอร์ด — แผงรายละเอียดอยู่นอกคอลัมน์นี้จึงสูงเต็มจอ */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* ส่วนหัว + ตัวกรอง — ชิดซ้าย ให้พื้นที่ที่เหลือเป็นของบอร์ด */}
      <div className="shrink-0 px-4 pt-5 sm:px-6">
        <div className="mb-3 animate-fade-in-up">
          <h1 className="text-xl font-semibold text-stone-900">จัดการงาน</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            ลากการ์ดเพื่อเรียงลำดับหรือย้ายเซคชัน · คลิกการ์ดเพื่อดูรายละเอียด ·
            ลากหัวคอลัมน์เพื่อจัดเรียงเซคชัน
          </p>
        </div>

        {hasDemo && <DemoBanner onWhat="งานบางส่วน" />}

        {loadError && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
            โหลดข้อมูลไม่สำเร็จ: {loadError} — ลองรีเฟรชหน้าอีกครั้ง
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-3 animate-fade-in-up">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <Input
              type="search"
              placeholder="ค้นหางาน..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-44">
            <Select
              aria-label="กรองตามผู้รับผิดชอบ"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="all">ผู้รับผิดชอบ: ทั้งหมด</option>
              <option value="none">ไม่ระบุ</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {profileName(p)}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            ซ่อนงานที่เสร็จแล้ว
          </label>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setAssigneeFilter("all");
                setHideCompleted(false);
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
            >
              <X size={14} />
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
            {error}
          </div>
        )}
      </div>

      {/* บอร์ด (scroll แนวนอน — แถบเลื่อนอยู่ล่างสุดของจอ) */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <KanbanBoard
          sections={sections}
          tasksBySection={tasksBySection}
          taskById={taskById}
          today={today}
          selectedId={selectedId}
          profiles={profiles}
          onAssign={assignTask}
          onMoveTask={moveTaskTo}
          onReorderSections={reorderSections}
          onCardClick={(t) => setSelectedId(t.id)}
          onToggleComplete={toggleComplete}
          onQuickAdd={(sectionId, title, placement) =>
            void quickAdd(sectionId, title, placement)
          }
          onRenameSection={renameSection}
          onAddSection={(name) => void addSection(name)}
          onDeleteSection={requestDeleteSection}
        />
      </div>
      </div>

      {/* แผงรายละเอียด — สูงเต็มจอชนขอบบน */}
      {selectedTask && (
        <TaskPanel
          key={selectedTask.id}
          task={selectedTask}
          sections={sections}
          profiles={profiles}
          userId={userId}
          suspendEsc={confirm !== null}
          onPatch={patchTask}
          onDelete={requestDeleteTask}
          onClose={() => setSelectedId(null)}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
