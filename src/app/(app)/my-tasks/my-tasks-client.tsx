"use client";

/**
 * My List (/my-tasks) — ลิสต์งาน/โน้ตส่วนตัวแบบแถว (คล้าย Monday)
 *
 * ขอบเขต: ของ "ฉัน" คนเดียว — RLS ที่ list_tasks ยึด owner_id ไม่ใช่ "authenticated เห็นหมด"
 * แบบตารางอื่นในระบบ จึงไม่ต้องกรอง owner ในโค้ดซ้ำ (และเผื่อวันที่เปิดแชร์ให้คนอื่น
 * รายการที่ถูกแชร์มาจะไหลเข้ามาเองโดยไม่ต้องรื้อ query)
 *
 * mutation ทุกตัวอัปเดต state ทันที (optimistic) แล้วค่อยยิง DB + router.refresh()
 * — client cache 30 วิของ Next ทำให้กลับเข้าหน้านี้ซ้ำไม่โหลดใหม่ ถ้าไม่ refresh ข้อมูลจะค้าง
 */

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  CalendarDays,
  Check,
  GripVertical,
  ListTodo,
  NotebookPen,
  Plus,
  Search,
  Tags as TagsIcon,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { LIST_PRIORITY, LIST_PRIORITY_ORDER } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { ListTagRow, ListTaskRow, TaskPriority } from "@/lib/types";
import {
  dueInfo,
  isOverdue,
  LIST_SORT_OPTIONS,
  type ListSort,
  midPosition,
  type MyTask,
  sortTasks,
} from "./list-utils";
import { nextTagColor, PriorityPicker, TagChip } from "./pickers";
import { TagManagerModal } from "./tag-manager";
import { TaskDetailPanel } from "./task-detail-panel";

type StatusFilter = "all" | "open" | "done" | "overdue";

type Filters = {
  status: StatusFilter;
  priority: "all" | TaskPriority;
  tagId: string;
  sort: ListSort;
};

const DEFAULT_FILTERS: Filters = {
  // ค่าเริ่มต้นซ่อนงานที่ทำเสร็จแล้ว — ลิสต์ส่วนตัวสะสมของเก่าเร็วมาก
  // (แถบใต้ตัวกรองบอกจำนวนที่ถูกซ่อนอยู่เสมอ จะได้ไม่เข้าใจผิดว่างานหาย)
  status: "open",
  priority: "all",
  tagId: "all",
  sort: "manual",
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "ยังไม่เสร็จ" },
  { value: "all", label: "ทั้งหมด" },
  { value: "done", label: "เสร็จแล้ว" },
  { value: "overdue", label: "เลยกำหนด" },
];

const filtersKey = (uid: string) => `my-tasks-filters-v1:${uid}`;

export function MyTasksClient({
  uid,
  tasks,
  tags: initialTags,
  loadError,
}: {
  uid: string;
  tasks: MyTask[];
  tags: ListTagRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<MyTask[]>(tasks);
  useEffect(() => setItems(tasks), [tasks]);
  const [tags, setTags] = useState<ListTagRow[]>(initialTags);
  useEffect(() => setTags(initialTags), [initialTags]);

  const [err, setErr] = useState<string | null>(loadError);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagModal, setTagModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /* ---------- ตัวกรองจำไว้ในเครื่อง (แยกตามบัญชี) ---------- */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(filtersKey(uid));
      if (raw) setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(raw) });
    } catch {
      // localStorage ใช้ไม่ได้ (โหมดส่วนตัว/บล็อค) — ใช้ค่าเริ่มต้นไป
    }
    setPrefsLoaded(true);
  }, [uid]);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      window.localStorage.setItem(filtersKey(uid), JSON.stringify(filters));
    } catch {
      // เพิกเฉย — จำค่าไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย
    }
  }, [filters, prefsLoaded, uid]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  /* ---------- mutation ---------- */

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    // งานใหม่ไปอยู่บนสุดของลิสต์เสมอ (เหมือน composer ของบอร์ด Task)
    const minPos = items.reduce((m, t) => Math.min(m, t.position), 0);
    const { data, error } = await supabase
      .from("list_tasks")
      .insert({ owner_id: uid, title, position: minPos - 1 })
      .select("*")
      .single();
    setAdding(false);
    if (error || !data) {
      setErr(error?.message ?? "เพิ่มงานไม่สำเร็จ");
      return;
    }
    setErr(null);
    setNewTitle("");
    setItems((prev) => [{ ...(data as ListTaskRow), tagIds: [] }, ...prev]);
    router.refresh();
  };

  const patchTask = async (id: string, patch: Partial<ListTaskRow>) => {
    const before = items;
    setItems((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              // done_at ของจริงมาจาก trigger ฝั่ง DB — ใส่ค่าคาดเดาไว้ให้ UI ไม่กระพริบ
              ...(patch.done === undefined
                ? {}
                : { done_at: patch.done ? new Date().toISOString() : null }),
              updated_at: new Date().toISOString(),
            }
          : t
      )
    );
    const { error } = await supabase.from("list_tasks").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      setItems(before);
      return;
    }
    setErr(null);
    router.refresh();
  };

  const deleteTask = async (id: string) => {
    const before = items;
    setItems((prev) => prev.filter((t) => t.id !== id));
    if (openId === id) setOpenId(null);
    const { error } = await supabase.from("list_tasks").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      setItems(before);
      return;
    }
    setErr(null);
    router.refresh();
  };

  const toggleTag = async (taskId: string, tagId: string, on: boolean) => {
    const before = items;
    setItems((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              tagIds: on
                ? [...t.tagIds, tagId]
                : t.tagIds.filter((x) => x !== tagId),
            }
          : t
      )
    );
    const { error } = on
      ? await supabase
          .from("list_task_tags")
          .insert({ task_id: taskId, tag_id: tagId })
      : await supabase
          .from("list_task_tags")
          .delete()
          .eq("task_id", taskId)
          .eq("tag_id", tagId);
    if (error) {
      setErr(error.message);
      setItems(before);
      return;
    }
    setErr(null);
    router.refresh();
  };

  /** สร้างแท็กใหม่ — ชื่อซ้ำ (unique owner_id + lower(name)) ให้ใช้ตัวที่มีอยู่แทน */
  const createTag = async (name: string): Promise<string | null> => {
    const clean = name.trim();
    if (!clean) return null;
    const existing = tags.find(
      (t) => t.name.trim().toLowerCase() === clean.toLowerCase()
    );
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from("list_tags")
      .insert({ owner_id: uid, name: clean, color: nextTagColor(tags.length) })
      .select("*")
      .single();
    if (error || !data) {
      // 23505 = ชนดัชนี unique (owner_id, lower(name)) — แท็กชื่อนี้ถูกสร้างจากอีกแท็บ/
      // อีกเครื่องไปแล้ว แต่ state ในหน้านี้ยังไม่รู้ → ดึงของจริงมาใช้แทนการเด้ง error
      if (error?.code === "23505") {
        const { data: all } = await supabase.from("list_tags").select("*");
        const found = ((all ?? []) as ListTagRow[]).find(
          (t) =>
            t.owner_id === uid &&
            t.name.trim().toLowerCase() === clean.toLowerCase()
        );
        if (found) {
          setErr(null);
          setTags((prev) =>
            prev.some((t) => t.id === found.id) ? prev : [...prev, found]
          );
          return found.id;
        }
      }
      setErr(error?.message ?? "สร้างแท็กไม่สำเร็จ");
      return null;
    }
    setErr(null);
    setTags((prev) => [...prev, data as ListTagRow]);
    router.refresh();
    return (data as ListTagRow).id;
  };

  /** สร้างแท็กแล้วติดให้รายการนั้นเลย (ใช้จาก TagPicker ในแผงรายละเอียด) */
  const createTagFor = async (taskId: string, name: string) => {
    const id = await createTag(name);
    if (id) await toggleTag(taskId, id, true);
    return id;
  };

  const patchTag = async (id: string, patch: Partial<ListTagRow>) => {
    const before = tags;
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("list_tags").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      setTags(before);
      return;
    }
    setErr(null);
    router.refresh();
  };

  const deleteTag = async (id: string) => {
    const beforeTags = tags;
    const beforeItems = items;
    setTags((prev) => prev.filter((t) => t.id !== id));
    // แถวใน list_task_tags ถูก DB ลบตามให้เอง (FK on delete cascade)
    setItems((prev) =>
      prev.map((t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id) }))
    );
    const { error } = await supabase.from("list_tags").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      setTags(beforeTags);
      setItems(beforeItems);
      return;
    }
    setErr(null);
    router.refresh();
  };

  /* ---------- กรอง + เรียง ---------- */

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return items.filter((t) => {
      if (filters.status === "open" && t.done) return false;
      if (filters.status === "done" && !t.done) return false;
      if (filters.status === "overdue" && !isOverdue(t)) return false;
      if (filters.priority !== "all" && t.priority !== filters.priority)
        return false;
      if (filters.tagId !== "all" && !t.tagIds.includes(filters.tagId))
        return false;
      if (
        keyword &&
        !t.title.toLowerCase().includes(keyword) &&
        !(t.note ?? "").toLowerCase().includes(keyword)
      )
        return false;
      return true;
    });
  }, [items, q, filters]);

  const ordered = useMemo(
    () => sortTasks(filtered, filters.sort),
    [filtered, filters.sort]
  );

  const stats = useMemo(() => {
    let open = 0;
    let overdue = 0;
    let done = 0;
    for (const t of items) {
      if (t.done) done += 1;
      else open += 1;
      if (isOverdue(t)) overdue += 1;
    }
    return { total: items.length, open, overdue, done };
  }, [items]);

  const tagUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of items)
      for (const id of t.tagIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [items]);

  const hidden = items.length - filtered.length;
  const openTask = openId ? items.find((t) => t.id === openId) ?? null : null;
  const pendingDelete = confirmDelete
    ? items.find((t) => t.id === confirmDelete) ?? null
    : null;

  /* ---------- ลากเรียง (เฉพาะโหมด "ลำดับของฉัน") ---------- */

  const dragDisabled = filters.sort !== "manual";

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // ลำดับใหม่หลังวาง แล้วอ่านเพื่อนบ้านจากลำดับนั้น (ไม่ใช่ลำดับเดิม)
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    const idx = next.indexOf(String(active.id));
    const posOf = (i: number) =>
      i >= 0 && i < next.length
        ? items.find((t) => t.id === next[i])?.position ?? null
        : null;
    const position = midPosition(posOf(idx - 1), posOf(idx + 1));
    await patchTask(String(active.id), { position });
  };

  return (
    <>
      <PageHeader
        title="งานของฉัน"
        description="โน้ตและงานส่วนตัว — เห็นเฉพาะบัญชีของคุณคนเดียว"
        action={
          <Button variant="secondary" onClick={() => setTagModal(true)}>
            <TagsIcon size={16} />
            จัดการแท็ก
          </Button>
        }
      />

      {err && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{err}</span>
          <button
            type="button"
            onClick={() => setErr(null)}
            aria-label="ปิดข้อความ"
            className="shrink-0 cursor-pointer rounded p-1 hover:bg-rose-100 active:scale-90"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ---------- สรุปตัวเลข ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard label="ทั้งหมด" value={stats.total} tone="stone" />
        <StatCard label="ยังไม่เสร็จ" value={stats.open} tone="brand" />
        <StatCard label="เลยกำหนด" value={stats.overdue} tone="rose" />
        <StatCard label="เสร็จแล้ว" value={stats.done} tone="emerald" />
      </div>

      {/* ---------- เพิ่มงานใหม่ ---------- */}
      <Card className="mb-4 p-3">
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTask();
              }
            }}
            placeholder="เพิ่มงาน/โน้ตใหม่ แล้วกด Enter…"
            maxLength={200}
            aria-label="ชื่องานใหม่"
          />
          <Button
            onClick={() => void addTask()}
            loading={adding}
            disabled={!newTitle.trim()}
            className="shrink-0"
          >
            <Plus size={16} />
            <span className="max-sm:hidden">เพิ่ม</span>
          </Button>
        </div>
      </Card>

      {/* ---------- ตัวกรอง ---------- */}
      <Card className="mb-3 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่องาน/โน้ต"
              aria-label="ค้นหา"
              className="pl-9"
            />
          </div>
          <Select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value as StatusFilter)}
            aria-label="กรองตามสถานะ"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.priority}
            onChange={(e) =>
              setFilter("priority", e.target.value as "all" | TaskPriority)
            }
            aria-label="กรองตามความสำคัญ"
          >
            <option value="all">ทุกความสำคัญ</option>
            {LIST_PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {LIST_PRIORITY[p].label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.tagId}
            onChange={(e) => setFilter("tagId", e.target.value)}
            aria-label="กรองตามแท็ก"
          >
            <option value="all">ทุกแท็ก</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            value={filters.sort}
            onChange={(e) => setFilter("sort", e.target.value as ListSort)}
            aria-label="เรียงลำดับ"
            className="sm:col-span-2 lg:col-span-4"
          >
            {LIST_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                เรียง: {o.label}
              </option>
            ))}
          </Select>
        </div>
        {hidden > 0 && (
          <p className="mt-2 text-xs text-stone-400">
            แสดง {filtered.length} จาก {items.length} รายการ · ตัวกรองซ่อนอยู่{" "}
            {hidden} รายการ
          </p>
        )}
      </Card>

      {/* ---------- ลิสต์ ---------- */}
      <Card className="p-2 sm:p-3">
        {ordered.length === 0 ? (
          items.length === 0 ? (
            <EmptyState
              icon={<ListTodo size={40} />}
              title="ยังไม่มีงานในลิสต์"
              description="พิมพ์ชื่องานในช่องด้านบนแล้วกด Enter — กดที่แถวเพื่อใส่กำหนดส่ง ความสำคัญ แท็ก และโน้ต"
            />
          ) : (
            <EmptyState
              icon={<Search size={40} />}
              title="ไม่พบงานที่ตรงกับตัวกรอง"
              description="ลองล้างคำค้นหรือเปลี่ยนตัวกรองด้านบน"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ("");
                    setFilters(DEFAULT_FILTERS);
                  }}
                >
                  ล้างตัวกรอง
                </Button>
              }
            />
          )
        ) : (
          <DndContext
            id="my-tasks-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void handleDragEnd(e)}
          >
            <SortableContext
              items={ordered.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-1.5">
                {ordered.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    tags={tags}
                    dragDisabled={dragDisabled}
                    onOpen={() => setOpenId(t.id)}
                    onToggleDone={() => void patchTask(t.id, { done: !t.done })}
                    onPriority={(p) => void patchTask(t.id, { priority: p })}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      {openTask && (
        <TaskDetailPanel
          key={openTask.id}
          task={openTask}
          tags={tags}
          onClose={() => setOpenId(null)}
          onPatch={(patch) => void patchTask(openTask.id, patch)}
          onToggleTag={(tagId, on) => void toggleTag(openTask.id, tagId, on)}
          onCreateTag={(name) => createTagFor(openTask.id, name)}
          onDelete={() => setConfirmDelete(openTask.id)}
        />
      )}

      <TagManagerModal
        open={tagModal}
        onClose={() => setTagModal(false)}
        tags={tags}
        usage={tagUsage}
        onCreate={createTag}
        onRename={(id, name) => void patchTag(id, { name })}
        onRecolor={(id, color) => void patchTag(id, { color })}
        onDelete={(id) => void deleteTag(id)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ลบงาน"
        message={
          pendingDelete
            ? `ลบ “${pendingDelete.title}” ออกจากลิสต์ใช่ไหม? ลบแล้วกู้คืนไม่ได้`
            : ""
        }
        onConfirm={() => {
          if (pendingDelete) void deleteTask(pendingDelete.id);
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}

/* ---------- การ์ดตัวเลขสรุป ---------- */

const STAT_TONES: Record<string, string> = {
  stone: "text-stone-700",
  brand: "text-brand-700",
  rose: "text-rose-600",
  emerald: "text-emerald-600",
};

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <Card className="px-3 py-2.5">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${STAT_TONES[tone]}`}>{value}</p>
    </Card>
  );
}

/* ---------- แถวหนึ่งรายการ ---------- */

function TaskRow({
  task,
  tags,
  dragDisabled,
  onOpen,
  onToggleDone,
  onPriority,
}: {
  task: MyTask;
  tags: ListTagRow[];
  dragDisabled: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onPriority: (p: TaskPriority) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: dragDisabled });

  const meta = LIST_PRIORITY[task.priority];
  const due = dueInfo(task.due_date, task.done);
  const taskTags = task.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is ListTagRow => t !== undefined);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-1.5 rounded-lg border border-white/70 border-l-4 px-1.5 py-1.5 transition-shadow hover:shadow-sm sm:gap-2 sm:px-2 ${meta.row} ${
        task.done ? "opacity-60" : ""
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {!dragDisabled && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`ลากเพื่อจัดลำดับ: ${task.title}`}
          title="ลากเพื่อจัดลำดับ"
          /* touch-none จำเป็นกับ TouchSensor — ไม่งั้นนิ้วเลื่อนหน้าจอแทนการลาก */
          className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-300 transition-colors hover:text-brand-500 active:cursor-grabbing max-sm:h-11 max-sm:w-11"
        >
          <GripVertical size={15} />
        </button>
      )}

      <button
        type="button"
        onClick={onToggleDone}
        aria-pressed={task.done}
        aria-label={task.done ? `ยกเลิกเสร็จ: ${task.title}` : `ทำเสร็จ: ${task.title}`}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-transform active:scale-90 max-sm:h-11 max-sm:w-11"
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
            task.done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-stone-300 bg-white/70 text-transparent hover:border-brand-400"
          }`}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 cursor-pointer py-1 text-left"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              task.done ? "text-stone-400 line-through" : "text-stone-800"
            }`}
          >
            {task.title}
          </span>
          {task.note && (
            <NotebookPen
              size={13}
              className="shrink-0 text-stone-300"
              aria-label="มีโน้ต"
            />
          )}
        </span>
        {/* จอเล็ก: ชิปข้อมูลย่อใต้ชื่อ (แสดงอย่างเดียว — แก้ได้ในแผงรายละเอียด
            เพื่อไม่ต้องยัดปุ่มเป้า 44px เข้ามาในแถวจนล้นจอ 375px) */}
        <span className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
          {taskTags.slice(0, 2).map((t) => (
            <TagChip key={t.id} tag={t} size="xs" />
          ))}
          {taskTags.length > 2 && (
            <span className="text-[11px] text-stone-400">+{taskTags.length - 2}</span>
          )}
          {due && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${due.chip}`}
            >
              <CalendarDays size={10} />
              {due.label}
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}
          >
            {meta.label}
          </span>
        </span>
      </button>

      {/* จอ ≥sm: คอลัมน์ขวาแบบตาราง (แท็ก · กำหนดส่ง · ความสำคัญที่กดเปลี่ยนได้ทันที) */}
      <div className="hidden shrink-0 items-center gap-2 py-0.5 sm:flex">
        <span className="flex max-w-[16rem] flex-wrap items-center justify-end gap-1">
          {taskTags.slice(0, 3).map((t) => (
            <TagChip key={t.id} tag={t} size="xs" />
          ))}
          {taskTags.length > 3 && (
            <span className="text-[11px] text-stone-400">+{taskTags.length - 3}</span>
          )}
        </span>
        {/* min-w (ไม่ใช่ w) — คอลัมน์ยังเรียงตรงกันทุกแถว แต่ป้ายยาวอย่าง
            "เลยกำหนด 120 วัน" ยืดออกได้แทนที่จะล้นออกนอกกล่อง */}
        <span className="min-w-28 text-right">
          {due ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${due.chip}`}
            >
              <CalendarDays size={11} />
              {due.label}
            </span>
          ) : (
            <span className="text-xs text-stone-300">—</span>
          )}
        </span>
        <PriorityPicker value={task.priority} onChange={onPriority} />
      </div>
    </li>
  );
}
