"use client";

/**
 * My List (/my-tasks) — ลิสต์งาน/โน้ตส่วนตัวแบบบอร์ดตาราง (Monday style)
 *
 * ขอบเขต: ของ "ฉัน" คนเดียว — RLS ที่ list_tasks ยึด owner_id ไม่ใช่ "authenticated เห็นหมด"
 * แบบตารางอื่นในระบบ จึงไม่ต้องกรอง owner ในโค้ดซ้ำ (และเผื่อวันที่เปิดแชร์ให้คนอื่น
 * รายการที่ถูกแชร์มาจะไหลเข้ามาเองโดยไม่ต้องรื้อ query)
 *
 * เลย์เอาต์: แถบเครื่องมือไร้กรอบ (งานใหม่ · ค้นหา · ตัวกรอง · จัดกลุ่ม · เรียง) แล้วตามด้วย
 * "กลุ่ม" ที่มีแถบสีซ้าย + ตารางคอลัมน์ (งาน · สถานะ · กำหนดส่ง · ความสำคัญ · แท็ก · โน้ต)
 * — **กลุ่มคำนวณจากข้อมูลที่มีอยู่ ไม่ใช่กลุ่มที่ผู้ใช้ตั้งชื่อเอง** (ดู buildGroups ใน list-utils)
 * จอเล็กกว่า sm ตารางเปลี่ยนเป็นแถวย่อ (ชื่อ + ชิป) — ไม่บังคับให้เลื่อนแนวนอนอ่านงานตัวเอง
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
  useDroppable,
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
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  Filter,
  Flag,
  GripVertical,
  Group as GroupIcon,
  NotebookPen,
  Plus,
  Search,
  Tags as TagsIcon,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ConfirmDialog } from "@/components/ui";
import {
  LIST_PRIORITY,
  LIST_PRIORITY_ORDER,
  LIST_STATUS,
  LIST_STATUS_ORDER,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { ListTagRow, ListTaskRow, TaskPriority } from "@/lib/types";
import {
  buildGroups,
  dueInfo,
  type GroupBy,
  isOverdue,
  LIST_GROUP_OPTIONS,
  LIST_SORT_OPTIONS,
  type ListGroup,
  type ListSort,
  midPosition,
  type MyTask,
  shortDate,
  sortTasks,
  statusOf,
} from "./list-utils";
import {
  nextTagColor,
  PriorityPicker,
  StatusPicker,
  TagChip,
  ToolbarMenu,
  type ToolbarOption,
} from "./pickers";
import { TagManagerModal } from "./tag-manager";
import { TaskDetailPanel } from "./task-detail-panel";

type StatusFilter = "all" | "open" | "overdue" | "soon" | "done";

type Filters = {
  status: StatusFilter;
  priority: "all" | TaskPriority;
  tagId: string;
  sort: ListSort;
  groupBy: GroupBy;
};

const DEFAULT_FILTERS: Filters = {
  // ค่าเริ่มต้นซ่อนงานที่ทำเสร็จแล้ว — ลิสต์ส่วนตัวสะสมของเก่าเร็วมาก
  // (แถบใต้ตัวกรองบอกจำนวนที่ถูกซ่อนอยู่เสมอ จะได้ไม่เข้าใจผิดว่างานหาย)
  status: "open",
  priority: "all",
  tagId: "all",
  sort: "manual",
  groupBy: "status",
};

const STATUS_OPTIONS: { value: StatusFilter; label: string; dot?: string }[] = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "open", label: "ยังไม่เสร็จ", dot: LIST_STATUS.open.bar },
  { value: "overdue", label: "เลยกำหนด", dot: LIST_STATUS.overdue.bar },
  { value: "soon", label: "ใกล้ครบกำหนด", dot: LIST_STATUS.soon.bar },
  { value: "done", label: "เสร็จแล้ว", dot: LIST_STATUS.done.bar },
];

/** คอลัมน์ของตาราง (จอ ≥sm) — ใช้ร่วมกันทั้งหัวตาราง แถวงาน และแถบสรุปท้ายกลุ่ม
    ผลรวมค่าต่ำสุด = 940px ตรงกับ min-w ของกล่อง (เกินกว่านั้นเลื่อนแนวนอนในกล่องเอง) */
const GRID_COLS =
  "34px minmax(220px,1.5fr) 132px 120px 116px minmax(130px,0.8fr) minmax(150px,1fr) 36px";

const filtersKey = (uid: string) => `my-tasks-filters-v1:${uid}`;

/** id ของ sortable แต่ละแถว — งานหนึ่งตัวโผล่ได้หลายกลุ่ม (โหมดจัดกลุ่มตามแท็ก) จึงต้องมี key กลุ่มนำหน้า */
const rowId = (groupKey: string, taskId: string) => `${groupKey}::${taskId}`;
const parseRowId = (id: string): [string, string] => {
  const at = id.lastIndexOf("::");
  return at < 0 ? ["", id] : [id.slice(0, at), id.slice(at + 2)];
};

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

  /**
   * นับ mutation ที่ยังทำงานอยู่ — ระหว่างนั้น "ห้าม" sync props ทับ state
   * เหตุผล: กดติ๊กหลายช่องเร็วๆ payload จาก router.refresh() ของ mutation แรก
   * อาจถ่ายภาพ DB ก่อน mutation ถัดไป commit → sync ทับแล้วติ๊กที่เพิ่งกดเด้งกลับชั่วขณะ
   * (mutation ตัวท้ายสุดจะ refresh ของตัวเองเสมอ payload สุดท้ายจึงสดครบแน่นอน)
   */
  const pendingMuts = useRef(0);
  const mutate = async <T,>(fn: () => Promise<T>): Promise<T> => {
    pendingMuts.current += 1;
    try {
      return await fn();
    } finally {
      pendingMuts.current -= 1;
    }
  };

  const [items, setItems] = useState<MyTask[]>(tasks);
  useEffect(() => {
    if (pendingMuts.current === 0) setItems(tasks);
  }, [tasks]);
  const [tags, setTags] = useState<ListTagRow[]>(initialTags);
  useEffect(() => {
    if (pendingMuts.current === 0) setTags(initialTags);
  }, [initialTags]);

  const [err, setErr] = useState<string | null>(loadError);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagModal, setTagModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ช่อง "+ เพิ่มงาน" ของแต่ละกลุ่ม — ปุ่ม "งานใหม่" บนแถบเครื่องมือแค่พาโฟกัสมาที่ช่องแรก
  // (ไม่สร้างแถวเปล่าชื่อ "งานใหม่" ทิ้งไว้ในลิสต์)
  // กลุ่มที่ถูกยุบอยู่ยังไม่มีช่องให้โฟกัส — จดคีย์ไว้แล้วให้ callback ref โฟกัสตอนช่องถูก mount
  const addRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const wantFocus = useRef<string | null>(null);

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

  /** ลำดับ manual ทั้งลิสต์ (ไม่สนตัวกรอง) — ใช้หาตำแหน่งของงานที่เพิ่มท้ายกลุ่ม */
  const manualOrder = useMemo(
    () => [...items].sort((a, b) => a.position - b.position),
    [items]
  );

  /** ตำแหน่งของงานใหม่ที่ต่อท้ายงาน `after` (null = ท้ายสุดของทั้งลิสต์) */
  const positionAfter = (after: MyTask | null): number => {
    if (!after) return items.reduce((m, t) => Math.max(m, t.position), 0) + 1;
    const idx = manualOrder.findIndex((t) => t.id === after.id);
    const next = idx >= 0 ? manualOrder[idx + 1] : undefined;
    return midPosition(after.position, next?.position ?? null);
  };

  /** เพิ่มงานจากช่องท้ายกลุ่ม — ค่าตั้งต้นมาจากเกณฑ์ของกลุ่มนั้น (ความสำคัญ/แท็ก/กำหนดส่ง) */
  const addTask = (rawTitle: string, group: ListGroup) => mutate(async () => {
    const title = rawTitle.trim();
    if (!title || !group.add) return;
    const last = group.tasks.length ? group.tasks[group.tasks.length - 1] : null;
    const { data, error } = await supabase
      .from("list_tasks")
      .insert({
        owner_id: uid,
        title,
        position: positionAfter(last),
        ...group.add.patch,
      })
      .select("*")
      .single();
    if (error || !data) {
      setErr(error?.message ?? "เพิ่มงานไม่สำเร็จ");
      return;
    }
    const row: MyTask = { ...(data as ListTaskRow), tagIds: [] };
    const tagId = group.add.tagId;
    if (tagId) {
      const { error: tagErr } = await supabase
        .from("list_task_tags")
        .insert({ task_id: row.id, tag_id: tagId });
      // ติดแท็กไม่สำเร็จไม่ใช่เหตุให้ทิ้งงานที่เพิ่งสร้าง — บอกให้รู้แล้วปล่อยงานไว้
      if (tagErr) setErr(tagErr.message);
      else row.tagIds = [tagId];
    } else {
      setErr(null);
    }
    setItems((prev) => [...prev, row]);
    router.refresh();
  });

  const patchTask = (id: string, patch: Partial<ListTaskRow>) => mutate(async () => {
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
  });

  const deleteTask = (id: string) => mutate(async () => {
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
  });

  const toggleTag = (taskId: string, tagId: string, on: boolean) => mutate(async () => {
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
  });

  /** สร้างแท็กใหม่ — ชื่อซ้ำ (unique owner_id + lower(name)) ให้ใช้ตัวที่มีอยู่แทน */
  const createTag = (name: string): Promise<string | null> => mutate(async () => {
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
  });

  /** สร้างแท็กแล้วติดให้รายการนั้นเลย (ใช้จาก TagPicker ในแผงรายละเอียด) */
  const createTagFor = async (taskId: string, name: string) => {
    const id = await createTag(name);
    if (id) await toggleTag(taskId, id, true);
    return id;
  };

  const patchTag = (id: string, patch: Partial<ListTagRow>) => mutate(async () => {
    const before = tags;
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("list_tags").update(patch).eq("id", id);
    if (error) {
      // 23505 = ชนดัชนี unique (owner_id, lower(name)) — แปลเป็นภาษาคนแทน error ดิบ
      setErr(
        error.code === "23505"
          ? `มีแท็กชื่อ “${patch.name ?? ""}” อยู่แล้ว — ใช้ชื่ออื่น หรือลบแท็กเดิมก่อน`
          : error.message
      );
      setTags(before);
      return;
    }
    setErr(null);
    router.refresh();
  });

  const deleteTag = (id: string) => mutate(async () => {
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
    // ตัวกรองที่ชี้แท็กนี้อยู่จะกรองทุกงานทิ้งอย่างถาวร (แท็กหายจากเมนูแล้ว แก้คืนไม่ได้) — ปลดให้เอง
    setFilters((f) => (f.tagId === id ? { ...f, tagId: "all" } : f));
    setErr(null);
    router.refresh();
  });

  /* ---------- กรอง + เรียง + จัดกลุ่ม ---------- */

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return items.filter((t) => {
      if (filters.status === "open" && t.done) return false;
      if (filters.status === "done" && !t.done) return false;
      if (filters.status === "overdue" && !isOverdue(t)) return false;
      if (filters.status === "soon" && statusOf(t) !== "soon") return false;
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

  const groups = useMemo(
    () =>
      buildGroups(ordered, filters.groupBy, tags).filter(
        (g) => g.tasks.length > 0 || g.keepEmpty
      ),
    [ordered, filters.groupBy, tags]
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

  const hiddenCount = items.length - filtered.length;
  const openTask = openId ? items.find((t) => t.id === openId) ?? null : null;
  const pendingDelete = confirmDelete
    ? items.find((t) => t.id === confirmDelete) ?? null
    : null;

  /** ตัวกรอง/คำค้นซ่อนงานจนหมด — เปิดดูทุกอย่าง (คงโหมดจัดกลุ่ม/เรียงไว้)
      อย่ารีเซ็ตเป็น DEFAULT_FILTERS: ค่า default เองก็ซ่อนงานที่เสร็จแล้ว
      เคยทำให้กด "ล้างตัวกรอง" แล้วบอร์ดยังว่างเหมือนเดิม (งานเดียวที่มีถูกติ๊กเสร็จไปแล้ว) */
  const showEverything = () => {
    setQ("");
    setSearchOpen(false);
    setFilters((f) => ({ ...f, status: "all", priority: "all", tagId: "all" }));
  };

  /** ปุ่ม "งานใหม่" — กางกลุ่มแรกที่พิมพ์เพิ่มได้ แล้วโฟกัสช่องของกลุ่มนั้น */
  const focusNewTask = () => {
    const g = groups.find((x) => x.add);
    if (!g) return;
    const el = addRefs.current[g.key];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    wantFocus.current = g.key;
    setCollapsed((c) => ({ ...c, [g.key]: false }));
  };

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
    const [fromKey, taskId] = parseRowId(String(active.id));
    const overId = String(over.id);
    // วางบนแถวอื่น = ย้าย/สลับที่กับแถวนั้น · วางบนแถบท้ายกลุ่ม (id ขึ้นต้น "drop:") = ลงกลุ่มนั้น
    const [toKey, overTaskId] = overId.startsWith("drop:")
      ? [overId.slice(5), null]
      : parseRowId(overId);
    const from = groups.find((g) => g.key === fromKey);
    const to = groups.find((g) => g.key === toKey);
    if (!from || !to) return;

    if (from.key === to.key) {
      // วางบนแถบท้ายกลุ่มของตัวเอง = ย้ายไปท้ายกลุ่ม
      if (!overTaskId) {
        const last = to.tasks[to.tasks.length - 1];
        if (!last || last.id === taskId) return;
        await patchTask(taskId, { position: positionAfter(last) });
        return;
      }
      const ids = to.tasks.map((t) => t.id);
      const at = ids.indexOf(taskId);
      const target = ids.indexOf(overTaskId);
      if (at < 0 || target < 0) return;
      // ลำดับใหม่หลังวาง แล้วอ่านเพื่อนบ้านจากลำดับนั้น (ไม่ใช่ลำดับเดิม)
      const next = [...ids];
      next.splice(target, 0, next.splice(at, 1)[0]);
      const idx = next.indexOf(taskId);
      const posOf = (i: number) =>
        i >= 0 && i < next.length
          ? items.find((t) => t.id === next[i])?.position ?? null
          : null;
      await patchTask(taskId, {
        position: midPosition(posOf(idx - 1), posOf(idx + 1)),
      });
      return;
    }

    // ข้ามกลุ่ม = เปลี่ยนค่าที่ทำให้งานอยู่กลุ่มนั้น (สถานะ/ความสำคัญ) หรือย้ายแท็ก
    if (to.drop) {
      await patchTask(taskId, to.drop);
      return;
    }
    if (filters.groupBy === "tag") {
      const task = items.find((t) => t.id === taskId);
      if (!task) return;
      if (to.tagId && !task.tagIds.includes(to.tagId))
        await toggleTag(taskId, to.tagId, true);
      if (from.tagId) await toggleTag(taskId, from.tagId, false);
    }
  };

  /* ---------- ตัวเลือกบนแถบเครื่องมือ ---------- */

  const statusOptions: ToolbarOption[] = STATUS_OPTIONS.map((o) => ({
    key: o.value,
    label: o.label,
    dot: o.dot,
    selected: filters.status === o.value,
    onPick: () => setFilter("status", o.value),
  }));

  const priorityOptions: ToolbarOption[] = [
    {
      key: "all",
      label: "ทุกความสำคัญ",
      selected: filters.priority === "all",
      onPick: () => setFilter("priority", "all"),
    },
    ...LIST_PRIORITY_ORDER.map((p) => ({
      key: p,
      label: LIST_PRIORITY[p].label,
      dot: LIST_PRIORITY[p].dot,
      selected: filters.priority === p,
      onPick: () => setFilter("priority", p),
    })),
  ];

  const tagOptions: ToolbarOption[] = [
    {
      key: "all",
      label: "ทุกแท็ก",
      selected: filters.tagId === "all",
      onPick: () => setFilter("tagId", "all"),
    },
    ...tags.map((t) => ({
      key: t.id,
      label: t.name,
      selected: filters.tagId === t.id,
      onPick: () => setFilter("tagId", t.id),
    })),
  ];

  const groupOptions: ToolbarOption[] = LIST_GROUP_OPTIONS.map((o) => ({
    key: o.value,
    label: o.label,
    selected: filters.groupBy === o.value,
    onPick: () => setFilter("groupBy", o.value),
  }));

  const sortOptions: ToolbarOption[] = LIST_SORT_OPTIONS.map((o) => ({
    key: o.value,
    label: o.label,
    selected: filters.sort === o.value,
    onPick: () => setFilter("sort", o.value),
  }));

  const statusLabel =
    filters.status === "all"
      ? "สถานะ"
      : `สถานะ: ${STATUS_OPTIONS.find((o) => o.value === filters.status)?.label}`;
  const priorityLabel =
    filters.priority === "all"
      ? "ความสำคัญ"
      : `ความสำคัญ: ${LIST_PRIORITY[filters.priority].label}`;
  const tagLabel =
    filters.tagId === "all"
      ? "แท็ก"
      : `แท็ก: ${tags.find((t) => t.id === filters.tagId)?.name ?? "—"}`;

  return (
    <>
      {/* ---------- หัวหน้า: ชื่อ + ชิปสรุป + ปุ่มจัดการแท็ก ---------- */}
      <div className="mb-4 animate-fade-in-up">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold text-stone-900">งานของฉัน</h1>
          {/* ชิปกดได้ = ทางลัดสลับตัวกรองสถานะ — ตอบคำถาม "งานที่ติ๊กเสร็จหายไปไหน"
              ได้ในคลิกเดียว (default ซ่อนงานเสร็จ ทำให้งานหายจากบอร์ดทันทีที่ติ๊ก) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <StatChip
              dot="bg-stone-400"
              label="ทั้งหมด"
              value={stats.total}
              active={filters.status === "all"}
              onClick={() => setFilter("status", "all")}
            />
            <StatChip
              dot={LIST_STATUS.open.bar}
              label="ยังไม่เสร็จ"
              value={stats.open}
              active={filters.status === "open"}
              onClick={() => setFilter("status", "open")}
            />
            <StatChip
              dot={LIST_STATUS.overdue.bar}
              label="เลยกำหนด"
              value={stats.overdue}
              active={filters.status === "overdue"}
              onClick={() => setFilter("status", "overdue")}
            />
            <StatChip
              dot={LIST_STATUS.done.bar}
              label="เสร็จแล้ว"
              value={stats.done}
              active={filters.status === "done"}
              onClick={() => setFilter("status", "done")}
            />
          </div>
          <div className="ml-auto">
            <Button variant="ghost" onClick={() => setTagModal(true)}>
              <TagsIcon size={16} />
              จัดการแท็ก
            </Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-stone-400">
          โน้ตและงานส่วนตัว — เห็นเฉพาะบัญชีของคุณคนเดียว
        </p>
      </div>

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

      {/* ---------- แถบเครื่องมือ (ไร้กรอบ) ----------
           จอเล็กเลื่อนแนวนอนแทนการตัดบรรทัด — 7 ปุ่มสูง 44px ที่ตัดบรรทัดกินความสูงเกิน 200px
           (bleed ออกนอก padding ของ PageContainer ด้วย -mx-3/px-3 ให้ปุ่มสุดท้ายโผล่ครึ่งตัวเป็นสัญญาณว่าเลื่อนได้) */}
      <div className="flex items-center gap-0.5 max-sm:-mx-3 max-sm:overflow-x-auto max-sm:px-3 max-sm:pb-1 sm:flex-wrap">
        <Button onClick={focusNewTask} className="mr-1.5 shrink-0">
          <Plus size={16} strokeWidth={2.5} />
          งานใหม่
        </Button>
        <span className="mr-1.5 h-5 w-px bg-brand-900/15 max-sm:hidden" />

        {searchOpen ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-brand-500 px-2 py-1.5">
            <Search size={15} className="shrink-0 text-stone-400" />
            <input
              // เปิดช่องนี้ได้ด้วยการกดปุ่ม "ค้นหา" เท่านั้น — โฟกัสให้เลยทุกเครื่อง
              // (ต่างจากช่องค้นหาในเมนูลอย ที่ห้ามโฟกัสอัตโนมัติบนมือถือ)
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQ("");
                  setSearchOpen(false);
                }
              }}
              placeholder="ค้นหาชื่องาน/โน้ต"
              aria-label="ค้นหา"
              /* text-base บนจอเล็ก — ต่ำกว่า 16px แล้ว iOS ซูมหน้าเข้าเองและไม่ซูมกลับ */
              className="w-40 border-none bg-transparent text-base text-stone-900 placeholder:text-stone-400 focus:outline-none sm:w-48 sm:text-sm"
            />
            <button
              type="button"
              onClick={() => {
                setQ("");
                setSearchOpen(false);
              }}
              aria-label="ปิดช่องค้นหา"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-stone-400 transition-colors hover:text-brand-700 max-sm:h-9 max-sm:w-9"
            >
              <X size={14} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors active:scale-[0.97] max-sm:min-h-11 ${
              q
                ? "bg-brand-100/90 text-brand-800"
                : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            <Search size={15} />
            {q ? `ค้นหา: ${q}` : "ค้นหา"}
          </button>
        )}

        <ToolbarMenu
          icon={<Filter size={15} />}
          text={statusLabel}
          ariaLabel="กรองตามสถานะ"
          active={filters.status !== "all"}
          options={statusOptions}
        />
        <ToolbarMenu
          icon={<Flag size={15} />}
          text={priorityLabel}
          ariaLabel="กรองตามความสำคัญ"
          active={filters.priority !== "all"}
          options={priorityOptions}
        />
        {tags.length > 0 && (
          <ToolbarMenu
            icon={<TagsIcon size={15} />}
            text={tagLabel}
            ariaLabel="กรองตามแท็ก"
            active={filters.tagId !== "all"}
            options={tagOptions}
          />
        )}
        <ToolbarMenu
          icon={<GroupIcon size={15} />}
          text={`จัดกลุ่ม: ${
            LIST_GROUP_OPTIONS.find((o) => o.value === filters.groupBy)?.label
          }`}
          ariaLabel="จัดกลุ่ม"
          active={filters.groupBy !== DEFAULT_FILTERS.groupBy}
          options={groupOptions}
        />
        <ToolbarMenu
          icon={<ArrowUpDown size={15} />}
          text={`เรียง: ${
            LIST_SORT_OPTIONS.find((o) => o.value === filters.sort)?.label
          }`}
          ariaLabel="เรียงลำดับ"
          active={filters.sort !== "manual"}
          options={sortOptions}
          width={260}
        />
      </div>

      {hiddenCount > 0 && ordered.length > 0 && (
        <p className="mt-2 text-xs text-stone-400">
          แสดง {filtered.length} จาก {items.length} รายการ · ตัวกรองซ่อนอยู่{" "}
          {hiddenCount} รายการ
        </p>
      )}

      {/* ตัวกรอง/คำค้นซ่อนงานจนหมดบอร์ด — บอร์ดด้านล่างยังอยู่ครบ (ช่องเพิ่มงานใช้ได้ปกติ)
          ห้ามกลับไปแทนที่บอร์ดด้วย EmptyState ทั้งแผง: เคยทำให้ติ๊กงานสุดท้ายเสร็จแล้ว
          ช่องเพิ่มงานหายทั้งหน้า + ปุ่ม "งานใหม่" กดแล้วไม่เกิดอะไร = เข้าทางตัน */}
      {ordered.length === 0 && items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-800 animate-fade-in">
          <Search size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {q.trim()
              ? "ไม่มีงานที่ตรงกับคำค้น/ตัวกรองตอนนี้"
              : "ตัวกรองซ่อนงานทั้งหมดอยู่"}{" "}
            — งานทั้ง {items.length} รายการยังอยู่ครบ ไม่ได้หายไปไหน
          </span>
          <Button variant="secondary" onClick={showEverything} className="shrink-0">
            แสดงทั้งหมด
          </Button>
        </div>
      )}

      {/* ---------- กลุ่ม + ตาราง (แสดงเสมอ — กลุ่ม keepEmpty ทำให้มีช่องเพิ่มงานตลอด) ---------- */}
      <DndContext
          id="my-tasks-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <div className="mt-5 flex flex-col gap-6">
            {groups.map((g) => (
              <GroupSection
                key={g.key}
                group={g}
                tags={tags}
                collapsed={!!collapsed[g.key]}
                dragDisabled={dragDisabled}
                emptyHint={items.length === 0}
                onToggleCollapse={() =>
                  setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))
                }
                addRef={(el) => {
                  addRefs.current[g.key] = el;
                  if (el && wantFocus.current === g.key) {
                    wantFocus.current = null;
                    el.focus();
                  }
                }}
                onAdd={(title) => void addTask(title, g)}
                onOpen={setOpenId}
                onToggleDone={(t) => void patchTask(t.id, { done: !t.done })}
                onSetDone={(t, d) => void patchTask(t.id, { done: d })}
                onPriority={(id, p) => void patchTask(id, { priority: p })}
                onDelete={setConfirmDelete}
              />
            ))}
          </div>
        </DndContext>

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

/* ---------- ชิปตัวเลขสรุปบนหัวหน้า ---------- */

function StatChip({
  dot,
  label,
  value,
  active,
  onClick,
}: {
  dot: string;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`กรอง: ${label}`}
      /* เป้านิ้วบนจอเล็กใช้ 36px ไม่ใช่ 44px — ชิปสรุปเป็นทางลัดรอง (ตัวกรองหลักอยู่บน
         แถบเครื่องมือที่สูง 44px เต็ม) และแถวหัวหน้าไม่ควรบวมจนดันเนื้อหา */
      className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors active:scale-95 max-sm:min-h-9 ${
        active
          ? "border-brand-300 bg-brand-100/90 text-brand-800"
          : "border-white/75 bg-white/70 text-stone-600 hover:bg-white"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}{" "}
      <b className={`font-semibold ${active ? "text-brand-900" : "text-stone-800"}`}>
        {value}
      </b>
    </button>
  );
}

/* ---------- กลุ่มหนึ่งกลุ่ม (หัวกลุ่ม + ตาราง) ---------- */

function GroupSection({
  group,
  tags,
  collapsed,
  dragDisabled,
  emptyHint,
  onToggleCollapse,
  addRef,
  onAdd,
  onOpen,
  onToggleDone,
  onSetDone,
  onPriority,
  onDelete,
}: {
  group: ListGroup;
  tags: ListTagRow[];
  collapsed: boolean;
  dragDisabled: boolean;
  /** ลิสต์ยังว่างทั้งหน้า — โชว์คำแนะนำในกลุ่มแทนตารางเปล่า */
  emptyHint: boolean;
  onToggleCollapse: () => void;
  addRef: (el: HTMLInputElement | null) => void;
  onAdd: (title: string) => void;
  onOpen: (id: string) => void;
  onToggleDone: (t: MyTask) => void;
  onSetDone: (t: MyTask, done: boolean) => void;
  onPriority: (id: string, p: TaskPriority) => void;
  onDelete: (id: string) => void;
}) {
  // แถบท้ายกลุ่มเป็นเป้ารับงานที่ลากข้ามกลุ่มมา (กลุ่มว่างก็ยังรับได้)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${group.key}`,
  });
  const rowIds = group.tasks.map((t) => rowId(group.key, t.id));

  return (
    <section className="animate-fade-in">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `กางกลุ่ม ${group.name}` : `ยุบกลุ่ม ${group.name}`}
          className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-white/70 max-sm:h-11 max-sm:w-11 ${group.text}`}
        >
          <ChevronDown
            size={17}
            strokeWidth={2.4}
            className={`transition-transform duration-150 ${
              collapsed ? "-rotate-90" : ""
            }`}
          />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`cursor-pointer text-base font-bold max-sm:min-h-11 sm:text-[17px] ${group.text}`}
        >
          {group.name}
        </button>
        <span className="ml-1.5 text-xs text-stone-400">
          {group.tasks.length} งาน
        </span>
      </div>

      {!collapsed && (
        <div className="flex">
          <div className={`w-1.5 shrink-0 rounded-l-lg ${group.bar}`} />
          {/* borderLeftWidth ต้องเป็น inline — คลาส border-l-0 กับ utility `glass` (ที่ตั้ง border: 1px)
              แพ้ชนะกันตามลำดับใน CSS ไม่ใช่ลำดับใน class แล้วเหลือเส้นคั่นบางๆ ระหว่างแถบสีกับกล่อง */}
          <div
            style={{ borderLeftWidth: 0 }}
            className="glass min-w-0 flex-1 overflow-x-auto rounded-l-none rounded-r-lg"
          >
            <div className="sm:min-w-[940px]">
              {/* ---- หัวตาราง (จอ ≥sm) ---- */}
              <div
                className="hidden border-b border-brand-100/70 text-xs text-stone-500 sm:grid"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <div />
                <HeadCell>งาน</HeadCell>
                <HeadCell center>สถานะ</HeadCell>
                <HeadCell center>กำหนดส่ง</HeadCell>
                <HeadCell center>ความสำคัญ</HeadCell>
                <HeadCell>แท็ก</HeadCell>
                <HeadCell>โน้ต</HeadCell>
                <div className="border-l border-brand-100/70" />
              </div>

              <SortableContext
                items={rowIds}
                strategy={verticalListSortingStrategy}
              >
                {group.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    id={rowId(group.key, t.id)}
                    task={t}
                    tags={tags}
                    dragDisabled={dragDisabled}
                    onOpen={() => onOpen(t.id)}
                    onToggleDone={() => onToggleDone(t)}
                    onSetDone={(d) => onSetDone(t, d)}
                    onPriority={(p) => onPriority(t.id, p)}
                    onDelete={() => onDelete(t.id)}
                  />
                ))}
              </SortableContext>

              {/* ---- แถวท้ายกลุ่ม: เพิ่มงาน / จุดวางงานที่ลากข้ามกลุ่มมา ---- */}
              <div
                ref={setDropRef}
                className={`grid min-h-11 items-stretch transition-colors sm:min-h-9 ${
                  isOver ? "bg-brand-100/60" : ""
                }`}
                style={{ gridTemplateColumns: "34px 1fr" }}
              >
                <div className="flex items-center justify-center">
                  <span className="h-[15px] w-[15px] rounded border border-stone-200 bg-white/50" />
                </div>
                <div className="flex items-center border-l border-brand-100/70 px-3">
                  {group.add ? (
                    <input
                      ref={addRef}
                      placeholder="+ เพิ่มงาน"
                      maxLength={200}
                      aria-label={`เพิ่มงานในกลุ่ม ${group.name}`}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const el = e.currentTarget;
                        if (!el.value.trim()) return;
                        onAdd(el.value);
                        el.value = "";
                      }}
                      className="w-full border-none bg-transparent py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none sm:text-sm"
                    />
                  ) : group.drop || group.tagId ? (
                    // ชวนให้ลากเฉพาะกลุ่มที่รับ drop ได้จริง — กลุ่มที่เงื่อนไขมาจากวันที่
                    // (เลยกำหนด/ใกล้ครบกำหนด/ช่วงกำหนดส่ง) ลากเข้าไปตั้งค่าอะไรให้ไม่ได้
                    <span className="truncate text-xs text-stone-300">
                      ลากงานมาวางที่นี่เพื่อย้ายเข้ากลุ่มนี้
                    </span>
                  ) : (
                    <span className="truncate text-xs text-stone-200">
                      กลุ่มนี้จัดตามวันที่ของงานโดยอัตโนมัติ
                    </span>
                  )}
                </div>
              </div>

              {/* ---- แถบสรุปท้ายกลุ่ม (จอ ≥sm) ---- */}
              {group.tasks.length > 0 && (
                <GroupSummary tasks={group.tasks} />
              )}

              {group.tasks.length === 0 && emptyHint && (
                <p className="px-3 py-3 text-center text-xs text-stone-400">
                  ยังไม่มีงานในลิสต์ — พิมพ์ชื่องานในช่องด้านบนแล้วกด Enter
                  แล้วกดที่แถวเพื่อใส่กำหนดส่ง ความสำคัญ แท็ก และโน้ต
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function HeadCell({
  children,
  center = false,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={`flex h-9 items-center border-l border-brand-100/70 px-3 ${
        center ? "justify-center" : ""
      }`}
    >
      {children}
    </div>
  );
}

/* ---------- แถบสรุปท้ายกลุ่ม (สัดส่วนสถานะ/ความสำคัญ + ช่วงกำหนดส่ง) ---------- */

function GroupSummary({ tasks }: { tasks: MyTask[] }) {
  const seg = (parts: { color: string; n: number }[]) => {
    const total = parts.reduce((m, p) => m + p.n, 0) || 1;
    return parts
      .filter((p) => p.n > 0)
      .map((p) => ({ color: p.color, w: `${(100 * p.n) / total}%` }));
  };
  const statusSeg = seg(
    LIST_STATUS_ORDER.map((s) => ({
      color: LIST_STATUS[s].bar,
      n: tasks.filter((t) => statusOf(t) === s).length,
    }))
  );
  const prioSeg = seg(
    LIST_PRIORITY_ORDER.map((p) => ({
      color: LIST_PRIORITY[p].bar,
      n: tasks.filter((t) => t.priority === p).length,
    }))
  );
  const dues = tasks
    .map((t) => t.due_date)
    .filter((d): d is string => !!d)
    .sort();
  const dueLabel =
    dues.length === 0
      ? "—"
      : dues[0] === dues[dues.length - 1]
        ? shortDate(dues[0])
        : `${shortDate(dues[0])} – ${shortDate(dues[dues.length - 1])}`;

  return (
    <div
      className="hidden items-center border-t border-brand-100/70 bg-white/40 py-2.5 sm:grid"
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      <div />
      <div />
      <div className="px-2.5">
        <SegmentBar parts={statusSeg} />
      </div>
      <div className="flex justify-center px-2">
        <span className="truncate rounded-full bg-stone-700 px-2.5 py-1 text-[11px] font-medium text-white">
          {dueLabel}
        </span>
      </div>
      <div className="px-2.5">
        <SegmentBar parts={prioSeg} />
      </div>
      <div />
      <div />
      <div />
    </div>
  );
}

function SegmentBar({ parts }: { parts: { color: string; w: string }[] }) {
  return (
    <div className="flex h-5 overflow-hidden rounded bg-stone-200/60">
      {parts.map((p) => (
        <span
          key={p.color}
          className={p.color}
          style={{ width: p.w }}
          aria-hidden
        />
      ))}
    </div>
  );
}

/* ---------- แถวหนึ่งรายการ ---------- */

function TaskRow({
  id,
  task,
  tags,
  dragDisabled,
  onOpen,
  onToggleDone,
  onSetDone,
  onPriority,
  onDelete,
}: {
  id: string;
  task: MyTask;
  tags: ListTagRow[];
  dragDisabled: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onSetDone: (done: boolean) => void;
  onPriority: (p: TaskPriority) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: dragDisabled });

  const status = statusOf(task);
  const statusMeta = LIST_STATUS[status];
  const prio = LIST_PRIORITY[task.priority];
  const due = dueInfo(task.due_date, task.done);
  const taskTags = task.tagIds
    .map((tid) => tags.find((t) => t.id === tid))
    .filter((t): t is ListTagRow => t !== undefined);

  const checkbox = (
    <button
      type="button"
      onClick={onToggleDone}
      aria-pressed={task.done}
      aria-label={task.done ? `ยกเลิกเสร็จ: ${task.title}` : `ทำเสร็จ: ${task.title}`}
      className="flex h-full w-full cursor-pointer items-center justify-center transition-transform active:scale-90 max-sm:min-h-11"
    >
      <span
        className={`flex h-[15px] w-[15px] items-center justify-center rounded border transition-colors ${
          task.done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-stone-300 bg-white text-transparent hover:border-brand-400"
        }`}
      >
        <Check size={10} strokeWidth={3.5} />
      </span>
    </button>
  );

  const handle = !dragDisabled && (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`ลากเพื่อจัดลำดับ: ${task.title}`}
      title="ลากเพื่อจัดลำดับ"
      /* touch-none จำเป็นกับ TouchSensor — ไม่งั้นนิ้วเลื่อนหน้าจอแทนการลาก */
      className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-300 transition-colors hover:text-brand-500 active:cursor-grabbing max-sm:h-11 max-sm:w-11"
    >
      <GripVertical size={14} />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      /* พื้นแถวติดสีอ่อนตามความสำคัญ (prio.row) — คำใบ้ในแผงสัญญาไว้ว่า
         "สีของแถวในลิสต์เปลี่ยนตามค่านี้"; งานที่เสร็จแล้วไม่ย้อมสี ให้ลิสต์ส่วนที่จบดูสงบ */
      className={`group border-b border-brand-100/50 transition-colors last:border-b-0 hover:bg-white/70 ${
        task.done ? "" : prio.row
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {/* ---- จอ ≥sm: แถวตารางเต็มคอลัมน์ ---- */}
      <div
        className="hidden items-stretch sm:grid"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div className="flex min-h-9 items-center justify-center">{checkbox}</div>

        <div className="flex min-w-0 items-center gap-1.5 border-l border-brand-100/70 px-2">
          {handle}
          <button
            type="button"
            onClick={onOpen}
            className={`min-w-0 flex-1 cursor-pointer truncate py-2 text-left text-sm ${
              task.done ? "text-stone-400 line-through" : "text-stone-800"
            }`}
          >
            {task.title}
          </button>
          {task.note && (
            <NotebookPen
              size={13}
              className="shrink-0 text-stone-300"
              aria-label="มีโน้ต"
            />
          )}
        </div>

        <div className="border-l border-brand-100/70">
          {/* dropdown เลือกจงใจ ไม่สลับทันทีตอนกด — เดิมคลิกเดียว done เลย ผู้ใช้เผลอกดบ่อย */}
          <StatusPicker
            status={status}
            done={task.done}
            hasDue={!!task.due_date}
            onSetDone={onSetDone}
          />
        </div>

        <div className="flex items-center justify-center gap-1 border-l border-brand-100/70 px-2">
          {due ? (
            <span
              className={`truncate text-xs ${
                due.overdue
                  ? "font-medium text-rose-600"
                  : task.done
                    ? "text-stone-400 line-through"
                    : "text-stone-600"
              }`}
            >
              {due.label}
            </span>
          ) : (
            <span className="text-xs text-stone-300">—</span>
          )}
        </div>

        <div className="border-l border-brand-100/70">
          <PriorityPicker
            value={task.priority}
            variant="cell"
            onChange={onPriority}
          />
        </div>

        <div className="flex min-w-0 items-center gap-1 overflow-hidden border-l border-brand-100/70 px-2">
          {taskTags.slice(0, 2).map((t) => (
            <TagChip key={t.id} tag={t} size="xs" />
          ))}
          {taskTags.length > 2 && (
            <span className="shrink-0 text-[11px] text-stone-400">
              +{taskTags.length - 2}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onOpen}
          aria-label={`เปิดรายละเอียด: ${task.title}`}
          className="flex min-w-0 cursor-pointer items-center border-l border-brand-100/70 px-3 text-left"
        >
          <span className="min-w-0 truncate text-xs text-stone-500">
            {task.note ?? ""}
          </span>
        </button>

        <div className="flex items-center justify-center border-l border-brand-100/70">
          <button
            type="button"
            onClick={onDelete}
            aria-label={`ลบงาน: ${task.title}`}
            title="ลบงานนี้"
            /* reveal-on-hover = โผล่ตลอดบนเครื่องที่ไม่มี hover (ทัชสกรีนกดไม่ได้ถ้าซ่อนไว้เฉยๆ) */
            className="reveal-on-hover flex h-7 w-7 cursor-pointer items-center justify-center rounded text-stone-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ---- จอเล็ก: แถวย่อ (ชื่อ + ชิป) — ไม่ต้องเลื่อนแนวนอนเพื่ออ่านงานตัวเอง ---- */}
      <div className="flex items-start gap-1 px-1.5 py-1 sm:hidden">
        {handle}
        <div className="flex w-11 shrink-0 items-center justify-center">
          {checkbox}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 cursor-pointer py-1.5 text-left"
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
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${statusMeta.cell}`}
            >
              {statusMeta.label}
            </span>
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${prio.cell}`}
            >
              {prio.label}
            </span>
            {due && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${due.chip}`}
              >
                <CalendarDays size={10} />
                {due.label}
              </span>
            )}
            {taskTags.slice(0, 2).map((t) => (
              <TagChip key={t.id} tag={t} size="xs" />
            ))}
            {taskTags.length > 2 && (
              <span className="text-[11px] text-stone-400">
                +{taskTags.length - 2}
              </span>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
