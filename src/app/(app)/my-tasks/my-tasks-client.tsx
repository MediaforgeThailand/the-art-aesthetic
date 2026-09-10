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
 * — โหมดเริ่มต้นจัดกลุ่มตาม **หมวดหมู่ที่ผู้ใช้ตั้งเอง** (list_groups — เพิ่ม/เปลี่ยนชื่อ/
 * เปลี่ยนสี/เรียง/ลบได้แบบ Monday; เปลี่ยนชื่อ inline ที่หัวกลุ่มได้เลย) ส่วนโหมดอื่นเป็น
 * กลุ่มคำนวณจากข้อมูลที่มีอยู่ (ดู buildGroups ใน list-utils)
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
  Pencil,
  Plus,
  Rows3,
  Search,
  Settings2,
  Tags as TagsIcon,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ConfirmDialog } from "@/components/ui";
import {
  LIST_PRIORITY_ORDER,
  LIST_STATUS,
  listTagColor,
  STORAGE_BUCKET_DOCUMENTS,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type {
  ListGroupRow,
  ListOptionKind,
  ListOptionRow,
  ListTagRow,
  ListTaskFileRow,
  ListTaskRow,
} from "@/lib/types";
import { tooLargeSummary, uploadWithProgress } from "@/lib/upload";
import { prepareUploadFiles } from "@/lib/upload-prepare";
import { useHydrated } from "@/lib/use-synced-state";
import { GroupManagerModal } from "./group-manager";
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
  type OptionUi,
  priorityPatch,
  priorityViewOf,
  priorityViews,
  shortDate,
  sortListGroups,
  sortTasks,
  splitOptions,
  statusOf,
  statusPatch,
  statusSelectedKey,
  statusViewOf,
  statusViews,
} from "./list-utils";
import { OptionManagerModal } from "./option-manager";
import {
  nextTagColor,
  OptionPicker,
  TagChip,
  ToolbarMenu,
  type ToolbarOption,
} from "./pickers";
import { TagManagerModal } from "./tag-manager";
import { TaskDetailPanel } from "./task-detail-panel";
import {
  FilesCell,
  FilesChip,
  PickFilesButton,
  type UploadProgress,
} from "./task-files";
import { matchesSearch, searchTerms } from "@/lib/fuzzy";

/** ค่าตัวกรองสถานะ/ความสำคัญ — เป็น string เพราะนอกจากค่าในตัวยังเป็น id ของตัวเลือก
 *  ที่ผู้ใช้เพิ่มเองได้ด้วย (uuid ไม่มีทางชนกับคีย์ในตัวอย่าง "open"/"urgent") */
type Filters = {
  status: string;
  priority: string;
  tagId: string;
  sort: ListSort;
  groupBy: GroupBy;
};

/** คีย์ตัวกรองในตัว — ค่าที่ไม่อยู่ในนี้คือ id ของตัวเลือกที่เพิ่มเอง (ใช้เช็คค่าค้างใน localStorage) */
const BUILTIN_STATUS_FILTERS = new Set([
  "all",
  "open",
  "overdue",
  "soon",
  "done",
]);
const BUILTIN_PRIORITY_FILTERS = new Set<string>(["all", ...LIST_PRIORITY_ORDER]);

const DEFAULT_FILTERS: Filters = {
  // ค่าเริ่มต้นซ่อนงานที่ทำเสร็จแล้ว — ลิสต์ส่วนตัวสะสมของเก่าเร็วมาก
  // (แถบใต้ตัวกรองบอกจำนวนที่ถูกซ่อนอยู่เสมอ จะได้ไม่เข้าใจผิดว่างานหาย)
  status: "open",
  priority: "all",
  tagId: "all",
  sort: "manual",
  // หัวข้อใหญ่ = หมวดหมู่ที่ผู้ใช้ตั้งเอง (สถานะเป็นค่าประจำงานในคอลัมน์ "สถานะ" อยู่แล้ว)
  groupBy: "category",
};

const STATUS_OPTIONS: { value: string; label: string; dot?: string }[] = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "open", label: "ยังไม่เสร็จ", dot: LIST_STATUS.open.bar },
  { value: "overdue", label: "เลยกำหนด", dot: LIST_STATUS.overdue.bar },
  { value: "soon", label: "ใกล้ครบกำหนด", dot: LIST_STATUS.soon.bar },
  { value: "done", label: "เสร็จแล้ว", dot: LIST_STATUS.done.bar },
];

/** คอลัมน์ของตาราง (จอ ≥sm) — ใช้ร่วมกันทั้งหัวตาราง แถวงาน และแถบสรุปท้ายกลุ่ม
    ผลรวมค่าต่ำสุด = 1070px ตรงกับ min-w ของกล่อง (เกินกว่านั้นเลื่อนแนวนอนในกล่องเอง) */
const GRID_COLS =
  "34px minmax(220px,1.5fr) 132px 120px 116px minmax(130px,0.8fr) 130px minmax(150px,1fr) 36px";

/** ชื่อไฟล์ที่ปลอดภัยกับ path ของ storage (ไทย/ช่องว่าง/อักขระพิเศษถูกแทนด้วย _)
    — ชื่อจริงเก็บไว้ในคอลัมน์ file_name แล้ว ตรงนี้แค่กัน path พัง */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// v2: bump ตอนเปลี่ยน default groupBy เป็น "หมวดหมู่" (0067) — บังคับ default ใหม่กับทุกคน
// (ค่า v1 เดิมจำ groupBy: "status" ไว้ ถ้าไม่ bump ผู้ใช้เก่าจะไม่เห็นหมวดหมู่ที่เพิ่งทำ)
const filtersKey = (uid: string) => `my-tasks-filters-v2:${uid}`;

/** ตัวกรองที่จำไว้ในเครื่อง (null = ไม่มี/อ่านไม่ได้)
    อยู่ระดับโมดูลเพราะอ่าน localStorage — เรียกตรงๆ ตอน render จะติดกฎ react-hooks/purity */
function readSavedFilters(
  uid: string,
  options: ListOptionRow[]
): Filters | null {
  try {
    const raw = window.localStorage.getItem(filtersKey(uid));
    if (!raw) return null;
    const saved: Filters = { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
    // ตัวกรองที่ชี้ "ตัวเลือกที่เพิ่มเอง" ซึ่งถูกลบไปแล้ว (จากอีกเครื่อง/อีกแท็บ) จะกรอง
    // ทุกงานทิ้งถาวรโดยที่ปุ่มของมันหายไปจากเมนูแล้ว — ตกกลับเป็น "ทั้งหมด" ให้เอง
    const live = new Set(options.map((o) => o.id));
    if (!BUILTIN_STATUS_FILTERS.has(saved.status) && !live.has(saved.status))
      saved.status = DEFAULT_FILTERS.status;
    if (
      !BUILTIN_PRIORITY_FILTERS.has(saved.priority) &&
      !live.has(saved.priority)
    )
      saved.priority = DEFAULT_FILTERS.priority;
    return saved;
  } catch {
    // localStorage ใช้ไม่ได้ (โหมดส่วนตัว/บล็อค) — ใช้ค่าเริ่มต้นไป
    return null;
  }
}

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
  groups: initialGroups,
  options: initialOptions,
  loadError,
}: {
  uid: string;
  tasks: MyTask[];
  tags: ListTagRow[];
  groups: ListGroupRow[];
  /** ตัวเลือกสถานะ/ความสำคัญที่ผู้ใช้เพิ่มเอง (list_options — migration 0072) */
  options: ListOptionRow[];
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
  // "cats" = หมวดหมู่ที่ผู้ใช้ตั้งเอง (list_groups) — เลี่ยงชื่อ groups ที่ชนกับผลของ buildGroups
  const [cats, setCats] = useState<ListGroupRow[]>(initialGroups);
  useEffect(() => {
    if (pendingMuts.current === 0) setCats(initialGroups);
  }, [initialGroups]);
  // ตัวเลือกสถานะ/ความสำคัญที่เพิ่มเอง — เก็บเป็นแถวดิบ แล้วแยกชนิด/เรียงตอนใช้
  const [opts, setOpts] = useState<ListOptionRow[]>(initialOptions);
  useEffect(() => {
    if (pendingMuts.current === 0) setOpts(initialOptions);
  }, [initialOptions]);
  const options = useMemo(() => splitOptions(opts), [opts]);

  const [err, setErr] = useState<string | null>(loadError);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // uid ที่อ่านตัวกรองจากเครื่องไปแล้ว (null = ยังไม่ได้อ่าน)
  const [prefsFor, setPrefsFor] = useState<string | null>(null);
  const prefsLoaded = prefsFor === uid;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagModal, setTagModal] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [optModal, setOptModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ช่อง "+ เพิ่มงาน" ของแต่ละกลุ่ม — ปุ่ม "งานใหม่" บนแถบเครื่องมือแค่พาโฟกัสมาที่ช่องแรก
  // (ไม่สร้างแถวเปล่าชื่อ "งานใหม่" ทิ้งไว้ในลิสต์)
  // กลุ่มที่ถูกยุบอยู่ยังไม่มีช่องให้โฟกัส — จดคีย์ไว้แล้วให้ callback ref โฟกัสตอนช่องถูก mount
  const addRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const wantFocus = useRef<string | null>(null);

  /* ---------- ตัวกรองจำไว้ในเครื่อง (แยกตามบัญชี) ---------- */
  // อ่านหลัง hydrate เสร็จเท่านั้น (SSR ไม่มี localStorage — อ่านตั้งแต่ render แรกจะได้
  // HTML ไม่ตรงกับที่ server ส่งมา) แล้วปรับ state ระหว่าง render แทน effect ตามกฎ
  // react-hooks/set-state-in-effect; อ่าน initialOptions แค่รอบนี้รอบเดียว (ค่าที่ server
  // ส่งมาครั้งแรก) ไม่ผูกกับ refresh ไม่งั้นจะเขียนทับตัวกรองที่ผู้ใช้เพิ่งเลือก
  const hydrated = useHydrated();
  if (hydrated && !prefsLoaded) {
    setPrefsFor(uid);
    const saved = readSavedFilters(uid, initialOptions);
    if (saved) setFilters(saved);
  }

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
    const row: MyTask = { ...(data as ListTaskRow), tagIds: [], files: [] };
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

  const patchTask = (id: string, raw: Partial<ListTaskRow>) => mutate(async () => {
    // ติ๊กเสร็จ = ล้างสถานะที่เพิ่มเองไปด้วยเสมอ (สถานะพวกนั้นคือ "ระหว่างทาง" — ปล่อยค้างไว้
    // ช่องสถานะจะเถียงกันเองว่า "กำลังทำ" ทั้งที่งานจบแล้ว) ทำที่นี่ที่เดียวเพื่อให้ทุกทาง
    // ที่ติ๊กเสร็จได้ (ช่องติ๊ก / เมนูสถานะ / ปุ่มในแผง / ลากเข้ากลุ่ม "เสร็จแล้ว") ตรงกันหมด
    const patch: Partial<ListTaskRow> =
      raw.done === true && raw.status_id === undefined
        ? { ...raw, status_id: null }
        : raw;
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
    const paths = (items.find((t) => t.id === id)?.files ?? []).map(
      (f) => f.file_path
    );
    setItems((prev) => prev.filter((t) => t.id !== id));
    if (openId === id) setOpenId(null);
    const { error } = await supabase.from("list_tasks").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      setItems(before);
      return;
    }
    // แถว list_task_files ถูก CASCADE ตามไปแล้ว แต่ไฟล์ใน storage ต้องเก็บกวาดเอง
    // (best effort — ลบไม่ผ่านก็แค่เหลือไฟล์กำพร้า ไม่ควรทำให้การลบงานล้มเหลว)
    if (paths.length > 0) {
      await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .remove(paths)
        .catch(() => undefined);
    }
    setErr(null);
    router.refresh();
  });

  /* ---------- ไฟล์แนบ (วิดีโอ/รูป/ไอเดียของงาน) ---------- */

  // งานที่กำลังอัพโหลดอยู่ + ความคืบหน้าไฟล์ปัจจุบัน (แถวในตารางและแผงอ่านค่าเดียวกัน)
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null
  );

  const uploadFiles = (taskId: string, fileList: FileList) => mutate(async () => {
    const chosen = Array.from(fileList);
    if (chosen.length === 0) return;
    // ย่อรูป/บีบวิดีโอก่อนแล้วค่อยเช็คเพดาน — ไฟล์ที่เกินเพดานมักผ่านได้หลังย่อ
    setUploadingId(taskId);
    setUploadProgress({
      index: 0,
      total: chosen.length,
      pct: 0,
      phase: "compress",
    });
    let picked: File[];
    try {
      picked = await prepareUploadFiles(chosen, (p) =>
        setUploadProgress({ ...p, phase: "compress" })
      );
    } finally {
      setUploadingId(null);
      setUploadProgress(null);
    }
    const tooLarge = tooLargeSummary(picked);
    if (tooLarge) {
      setErr(tooLarge);
      return;
    }
    setUploadingId(taskId);
    setUploadProgress({
      index: 0,
      total: picked.length,
      pct: 0,
      phase: "upload",
    });
    const rows: { task_id: string; file_path: string; file_name: string }[] = [];
    // try/finally: ปุ่มต้องกลับมากดได้เสมอแม้ระหว่างทางมี exception
    try {
      for (const [i, file] of picked.entries()) {
        const path = `my-tasks/${taskId}/${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}_${sanitizeFileName(file.name)}`;
        setUploadProgress({
          index: i,
          total: picked.length,
          pct: 0,
          phase: "upload",
        });
        const { error } = await uploadWithProgress(
          STORAGE_BUCKET_DOCUMENTS,
          path,
          file,
          (pct) =>
            setUploadProgress({
              index: i,
              total: picked.length,
              pct,
              phase: "upload",
            })
        );
        if (error) {
          // เก็บกวาดไฟล์ที่อัพไปแล้วในชุดนี้ — ยังไม่มีแถวใน DB อ้างถึง
          if (rows.length > 0) {
            await supabase.storage
              .from(STORAGE_BUCKET_DOCUMENTS)
              .remove(rows.map((r) => r.file_path))
              .catch(() => undefined);
          }
          setErr(`อัพโหลดไฟล์ไม่สำเร็จ: ${error.message}`);
          return;
        }
        rows.push({ task_id: taskId, file_path: path, file_name: file.name });
      }
      const { data, error: insErr } = await supabase
        .from("list_task_files")
        .insert(rows)
        .select("*");
      if (insErr || !data) {
        await supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove(rows.map((r) => r.file_path))
          .catch(() => undefined);
        setErr(`บันทึกไฟล์ไม่สำเร็จ: ${insErr?.message ?? "ไม่ทราบสาเหตุ"}`);
        return;
      }
      const added = data as ListTaskFileRow[];
      setItems((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, files: [...t.files, ...added] } : t
        )
      );
      setErr(null);
      router.refresh();
    } finally {
      setUploadingId(null);
      setUploadProgress(null);
    }
  });

  const removeFile = (taskId: string, file: ListTaskFileRow) => mutate(async () => {
    const before = items;
    setItems((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, files: t.files.filter((f) => f.id !== file.id) }
          : t
      )
    );
    const { error } = await supabase
      .from("list_task_files")
      .delete()
      .eq("id", file.id);
    if (error) {
      setErr(error.message);
      setItems(before);
      return;
    }
    await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .remove([file.file_path])
      .catch(() => undefined);
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

  /* ---------- หมวดหมู่ (หัวข้อใหญ่ที่ผู้ใช้ตั้งเอง — list_groups) ---------- */

  const sortedCats = useMemo(() => sortListGroups(cats), [cats]);

  /** สร้างหมวดใหม่ต่อท้ายบอร์ด — คืน id (null = ล้มเหลว) ให้ฟอร์ม inline รู้ว่าปิดตัวเองได้ไหม */
  const createGroup = (name: string): Promise<string | null> => mutate(async () => {
    const clean = name.trim();
    if (!clean) return null;
    const { data, error } = await supabase
      .from("list_groups")
      .insert({
        owner_id: uid,
        name: clean,
        color: nextTagColor(cats.length),
        position: cats.reduce((m, c) => Math.max(m, c.position), 0) + 1,
      })
      .select("*")
      .single();
    if (error || !data) {
      setErr(error?.message ?? "เพิ่มหมวดหมู่ไม่สำเร็จ");
      return null;
    }
    setErr(null);
    setCats((prev) => [...prev, data as ListGroupRow]);
    router.refresh();
    return (data as ListGroupRow).id;
  });

  const patchGroup = (id: string, patch: Partial<ListGroupRow>) => mutate(async () => {
    const before = cats;
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("list_groups").update(patch).eq("id", id);
    if (error) {
      setErr(error.message);
      setCats(before);
      return;
    }
    setErr(null);
    router.refresh();
  });

  /**
   * ตั้งชื่อให้กลุ่มสำรอง "ยังไม่จัดหมวดหมู่" = สร้างหมวดใหม่ชื่อนั้น แล้วย้ายงานที่ยังไม่มีหมวด
   * เข้าไปทั้งหมด — กดชื่อหัวกลุ่มแล้วพิมพ์ทับได้เลยแบบ Monday โดยไม่ต้องสร้างหมวดแล้วลากงานทีละใบ
   * ย้าย "ทุกงานที่ยังไม่มีหมวด" ไม่ใช่เฉพาะที่ตัวกรองแสดงอยู่ — หัวกลุ่มนี้แทนงานทั้งกองตามชื่อของมัน
   */
  const nameUncategorized = (name: string) => mutate(async () => {
    const clean = name.trim();
    if (!clean) return;
    const beforeCats = cats;
    const beforeItems = items;
    const { data, error } = await supabase
      .from("list_groups")
      .insert({
        owner_id: uid,
        name: clean,
        color: nextTagColor(cats.length),
        position: cats.reduce((m, c) => Math.max(m, c.position), 0) + 1,
      })
      .select("*")
      .single();
    if (error || !data) {
      setErr(error?.message ?? "ตั้งชื่อหมวดหมู่ไม่สำเร็จ");
      return;
    }
    const cat = data as ListGroupRow;
    setCats((prev) => [...prev, cat]);
    setItems((prev) =>
      prev.map((t) => (t.group_id === null ? { ...t, group_id: cat.id } : t))
    );
    const { error: moveErr } = await supabase
      .from("list_tasks")
      .update({ group_id: cat.id })
      .eq("owner_id", uid)
      .is("group_id", null);
    if (moveErr) {
      // ย้ายงานไม่ผ่าน — คืนสภาพเดิมทั้งคู่แล้วลบหมวดที่เพิ่งสร้าง จะได้ไม่เหลือหมวดว่างงอกมา
      setErr(moveErr.message);
      setCats(beforeCats);
      setItems(beforeItems);
      await supabase.from("list_groups").delete().eq("id", cat.id);
      return;
    }
    setErr(null);
    router.refresh();
  });

  const deleteGroup = (id: string) => mutate(async () => {
    const beforeCats = cats;
    const beforeItems = items;
    setCats((prev) => prev.filter((c) => c.id !== id));
    // งานในหมวดไม่ถูกลบ — ตกกลับกลุ่ม "ยังไม่จัดหมวดหมู่" (DB SET NULL ให้เอง, sync state ให้ตรง)
    setItems((prev) =>
      prev.map((t) => (t.group_id === id ? { ...t, group_id: null } : t))
    );
    const { error } = await supabase.from("list_groups").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      setCats(beforeCats);
      setItems(beforeItems);
      return;
    }
    setErr(null);
    router.refresh();
  });

  /** ย้ายหมวดขึ้น/ลงหนึ่งขั้น (ปุ่มลูกศรในโมดัลจัดการหมวด) — ตำแหน่งกึ่งกลางเพื่อนบ้านแบบเดียวกับลากงาน */
  const moveGroup = (id: string, dir: -1 | 1) => {
    const idx = sortedCats.findIndex((c) => c.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sortedCats.length) return;
    const rest = sortedCats.filter((c) => c.id !== id);
    void patchGroup(id, {
      position: midPosition(
        target > 0 ? rest[target - 1].position : null,
        target < rest.length ? rest[target].position : null
      ),
    });
  };

  /* ---------- ตัวเลือกที่ผู้ใช้เพิ่มเอง (สถานะ / ความสำคัญ — list_options) ---------- */

  /** สร้างตัวเลือกใหม่ต่อท้ายชนิดนั้น — คืน id (null = ล้มเหลว) */
  const createOption = (
    kind: ListOptionKind,
    name: string
  ): Promise<string | null> =>
    mutate(async () => {
      const clean = name.trim();
      if (!clean) return null;
      const same = opts.filter((o) => o.kind === kind);
      // ชื่อซ้ำในชนิดเดียวกัน = ใช้ตัวที่มีอยู่ (DB ไม่ได้บังคับ unique เพราะชื่อซ้ำคนละชนิดได้ —
      // กันเมนูมีสองบรรทัดชื่อเหมือนกันเอาเองตรงนี้)
      const existing = same.find(
        (o) => o.name.trim().toLowerCase() === clean.toLowerCase()
      );
      if (existing) return existing.id;
      const { data, error } = await supabase
        .from("list_options")
        .insert({
          owner_id: uid,
          kind,
          name: clean,
          color: nextTagColor(opts.length),
          position: same.reduce((m, o) => Math.max(m, o.position), 0) + 1,
        })
        .select("*")
        .single();
      if (error || !data) {
        setErr(error?.message ?? "เพิ่มตัวเลือกไม่สำเร็จ");
        return null;
      }
      setErr(null);
      setOpts((prev) => [...prev, data as ListOptionRow]);
      router.refresh();
      return (data as ListOptionRow).id;
    });

  /** สร้างตัวเลือกจากในเมนูของงานหนึ่ง แล้วตั้งให้งานนั้นทันที (ไม่ต้องเปิดเมนูซ้ำ) */
  const createOptionFor = async (
    kind: ListOptionKind,
    taskId: string,
    name: string
  ): Promise<string | null> => {
    const id = await createOption(kind, name);
    if (!id) return null;
    await patchTask(
      taskId,
      kind === "status" ? { done: false, status_id: id } : { priority_id: id }
    );
    return id;
  };

  const patchOption = (id: string, patch: Partial<ListOptionRow>) =>
    mutate(async () => {
      const before = opts;
      setOpts((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
      const { error } = await supabase
        .from("list_options")
        .update(patch)
        .eq("id", id);
      if (error) {
        setErr(error.message);
        setOpts(before);
        return;
      }
      setErr(null);
      router.refresh();
    });

  const deleteOption = (id: string) =>
    mutate(async () => {
      const beforeOpts = opts;
      const beforeItems = items;
      setOpts((prev) => prev.filter((o) => o.id !== id));
      // งานที่ใช้ตัวเลือกนี้ไม่หาย — ตกกลับไปใช้ค่าในตัว (DB SET NULL ให้เอง, sync state ให้ตรง)
      setItems((prev) =>
        prev.map((t) =>
          t.status_id === id || t.priority_id === id
            ? {
                ...t,
                status_id: t.status_id === id ? null : t.status_id,
                priority_id: t.priority_id === id ? null : t.priority_id,
              }
            : t
        )
      );
      const { error } = await supabase.from("list_options").delete().eq("id", id);
      if (error) {
        setErr(error.message);
        setOpts(beforeOpts);
        setItems(beforeItems);
        return;
      }
      // ตัวกรองที่ชี้ตัวเลือกนี้อยู่จะกรองทุกงานทิ้งถาวร (ปุ่มของมันหายไปพร้อมตัวเลือกแล้ว) — ปลดให้เอง
      setFilters((f) => ({
        ...f,
        status: f.status === id ? "all" : f.status,
        priority: f.priority === id ? "all" : f.priority,
      }));
      setErr(null);
      router.refresh();
    });

  /** ย้ายตัวเลือกขึ้น/ลงหนึ่งขั้นในชนิดของตัวเอง (ตำแหน่งกึ่งกลางเพื่อนบ้านแบบเดียวกับหมวดหมู่) */
  const moveOption = (id: string, dir: -1 | 1) => {
    const row = opts.find((o) => o.id === id);
    if (!row) return;
    const list = options[row.kind];
    const idx = list.findIndex((o) => o.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const rest = list.filter((o) => o.id !== id);
    void patchOption(id, {
      position: midPosition(
        target > 0 ? rest[target - 1].position : null,
        target < rest.length ? rest[target].position : null
      ),
    });
  };

  /* ---------- กรอง + เรียง + จัดกลุ่ม ---------- */

  const filtered = useMemo(() => {
    const terms = searchTerms(q);
    return items.filter((t) => {
      // "ยังไม่เสร็จ" = ทุกงานที่ยังไม่ติ๊กเสร็จ รวมงานที่ตั้งสถานะเพิ่มเองไว้ (เช่น กำลังทำ)
      // ส่วนค่าที่ไม่ใช่คีย์ในตัว = id ของสถานะที่เพิ่มเอง ต้องตรงกับสถานะที่งานโชว์อยู่จริง
      if (filters.status === "open" && t.done) return false;
      if (filters.status === "done" && !t.done) return false;
      if (filters.status === "overdue" && !isOverdue(t)) return false;
      if (filters.status === "soon" && statusOf(t) !== "soon") return false;
      if (
        !BUILTIN_STATUS_FILTERS.has(filters.status) &&
        statusViewOf(t, options.status).key !== filters.status
      )
        return false;
      // เทียบกับ "ความสำคัญที่โชว์บนแถว" — งานที่ใช้ระดับเพิ่มเองจึงไม่ไปโผล่ในตัวกรองระดับในตัว
      if (
        filters.priority !== "all" &&
        priorityViewOf(t, options.priority).key !== filters.priority
      )
        return false;
      if (filters.tagId !== "all" && !t.tagIds.includes(filters.tagId))
        return false;
      if (!matchesSearch(terms, t.title, t.note)) return false;
      return true;
    });
  }, [items, q, filters, options]);

  const ordered = useMemo(
    () => sortTasks(filtered, filters.sort, options.priority),
    [filtered, filters.sort, options.priority]
  );

  const groups = useMemo(
    () =>
      buildGroups(ordered, filters.groupBy, tags, sortedCats, options).filter(
        (g) => g.tasks.length > 0 || g.keepEmpty
      ),
    [ordered, filters.groupBy, tags, sortedCats, options]
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

  /** จำนวนงานในแต่ละหมวด (เตือนก่อนลบในโมดัลจัดการหมวด) */
  const catUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of items)
      if (t.group_id) m.set(t.group_id, (m.get(t.group_id) ?? 0) + 1);
    return m;
  }, [items]);

  /** จำนวนงานที่ใช้ตัวเลือกที่เพิ่มเองแต่ละอัน (เตือนก่อนลบในโมดัลจัดการตัวเลือก) */
  const optUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of items) {
      if (t.status_id) m.set(t.status_id, (m.get(t.status_id) ?? 0) + 1);
      if (t.priority_id) m.set(t.priority_id, (m.get(t.priority_id) ?? 0) + 1);
    }
    return m;
  }, [items]);

  /* ---------- ชุด dropdown สถานะ/ความสำคัญ ที่ส่งต่อให้ตารางและแผงรายละเอียด ---------- */

  // เมนูสถานะเลือกได้เฉพาะค่าที่ "ตั้งเองได้" — เลยกำหนด/ใกล้ครบกำหนดมาจากวันกำหนดส่ง
  const statusMenu = useMemo(
    () => statusViews(options.status).filter((v) => statusPatch(v) !== null),
    [options.status]
  );
  const priorityMenu = useMemo(
    () => priorityViews(options.priority),
    [options.priority]
  );

  const optionUi: OptionUi = {
    status: options.status,
    priority: options.priority,
    statusMenu,
    priorityMenu,
    onPickStatus: (taskId, v) => {
      const patch = statusPatch(v);
      if (patch) void patchTask(taskId, patch);
    },
    onPickPriority: (taskId, v) => void patchTask(taskId, priorityPatch(v)),
    onCreate: createOptionFor,
    onManage: () => setOptModal(true),
  };

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

  // ตัวกรองมีทั้งค่าในตัวและตัวเลือกที่ผู้ใช้เพิ่มเอง (ต่อท้าย) — กรองด้วยป้ายที่เห็นบนตารางได้เลย
  const statusOptions: ToolbarOption[] = [
    ...STATUS_OPTIONS.map((o) => ({
      key: o.value,
      label: o.label,
      dot: o.dot,
      selected: filters.status === o.value,
      onPick: () => setFilter("status", o.value),
    })),
    ...options.status.map((o) => ({
      key: o.id,
      label: o.name,
      dot: listTagColor(o.color).dot,
      selected: filters.status === o.id,
      onPick: () => setFilter("status", o.id),
    })),
  ];

  const priorityOptions: ToolbarOption[] = [
    {
      key: "all",
      label: "ทุกความสำคัญ",
      selected: filters.priority === "all",
      onPick: () => setFilter("priority", "all"),
    },
    ...priorityMenu.map((v) => ({
      key: v.key,
      label: v.label,
      dot: v.bar,
      selected: filters.priority === v.key,
      onPick: () => setFilter("priority", v.key),
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

  // ป้ายบนปุ่มตัวกรอง — หาจากรายการเดียวกับในเมนู (ครอบทั้งค่าในตัวและตัวเลือกที่เพิ่มเอง)
  const statusLabel =
    filters.status === "all"
      ? "สถานะ"
      : `สถานะ: ${
          statusOptions.find((o) => o.key === filters.status)?.label ?? "—"
        }`;
  const priorityLabel =
    filters.priority === "all"
      ? "ความสำคัญ"
      : `ความสำคัญ: ${
          priorityOptions.find((o) => o.key === filters.priority)?.label ?? "—"
        }`;
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
          <div className="ml-auto flex flex-wrap items-center gap-0.5">
            <Button variant="ghost" onClick={() => setCatModal(true)}>
              <Rows3 size={16} />
              จัดการหมวดหมู่
            </Button>
            <Button variant="ghost" onClick={() => setOptModal(true)}>
              <Settings2 size={16} />
              จัดการตัวเลือก
            </Button>
            <Button variant="ghost" onClick={() => setTagModal(true)}>
              <TagsIcon size={16} />
              จัดการแท็ก
            </Button>
          </div>
        </div>
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
              placeholder="ค้นหา"
              aria-label="ค้นหา"
              /* text-base บนจอเล็ก — ต่ำกว่า 16px แล้ว iOS ซูมหน้าเข้าเองและไม่ซูมกลับ */
              className="w-40 border-none bg-transparent text-base text-stone-900 placeholder:text-stone-500 focus:outline-none sm:w-48 sm:text-sm"
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
                opt={optionUi}
                collapsed={!!collapsed[g.key]}
                dragDisabled={dragDisabled}
                uploadingId={uploadingId}
                onUploadFiles={(taskId, files) => void uploadFiles(taskId, files)}
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
                onDelete={setConfirmDelete}
                /* กดชื่อหัวกลุ่ม = เปลี่ยนชื่อได้เลย ทั้งหมวดจริงและกลุ่มสำรอง
                   (กลุ่มสำรองยังไม่มีแถวใน list_groups — ตั้งชื่อ = สร้างหมวดแล้วย้ายงานเข้า)
                   โหมดจัดกลุ่มอื่นเป็นกลุ่มคำนวณจากข้อมูล เปลี่ยนชื่อไม่ได้ */
                onRename={
                  g.catId
                    ? (name) => void patchGroup(g.catId as string, { name })
                    : filters.groupBy === "category"
                      ? (name) => void nameUncategorized(name)
                      : undefined
                }
              />
            ))}
            {/* เพิ่มหมวดใหม่ต่อท้ายบอร์ดได้เลยแบบ Monday (เฉพาะโหมดหมวดหมู่) */}
            {filters.groupBy === "category" && (
              <AddCategoryInline onCreate={createGroup} />
            )}
          </div>
        </DndContext>

      {openTask && (
        <TaskDetailPanel
          key={openTask.id}
          task={openTask}
          tags={tags}
          groups={sortedCats}
          opt={optionUi}
          uploading={uploadingId === openTask.id}
          uploadProgress={uploadingId === openTask.id ? uploadProgress : null}
          onClose={() => setOpenId(null)}
          onPatch={(patch) => void patchTask(openTask.id, patch)}
          onToggleTag={(tagId, on) => void toggleTag(openTask.id, tagId, on)}
          onCreateTag={(name) => createTagFor(openTask.id, name)}
          onDelete={() => setConfirmDelete(openTask.id)}
          onUploadFiles={(files) => void uploadFiles(openTask.id, files)}
          onRemoveFile={(file) => void removeFile(openTask.id, file)}
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

      <OptionManagerModal
        open={optModal}
        onClose={() => setOptModal(false)}
        options={options}
        usage={optUsage}
        onCreate={createOption}
        onRename={(id, name) => void patchOption(id, { name })}
        onRecolor={(id, color) => void patchOption(id, { color })}
        onMove={moveOption}
        onDelete={(id) => void deleteOption(id)}
      />

      <GroupManagerModal
        open={catModal}
        onClose={() => setCatModal(false)}
        groups={sortedCats}
        usage={catUsage}
        onCreate={createGroup}
        onRename={(id, name) => void patchGroup(id, { name })}
        onRecolor={(id, color) => void patchGroup(id, { color })}
        onMove={moveGroup}
        onDelete={(id) => void deleteGroup(id)}
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

/* ---------- ปุ่ม/ฟอร์ม "เพิ่มหมวดหมู่" ท้ายบอร์ด (เฉพาะโหมดจัดกลุ่มตามหมวดหมู่) ---------- */

function AddCategoryInline({
  onCreate,
}: {
  /** คืน id ของหมวดใหม่ (null = ล้มเหลว — คงฟอร์มไว้ให้แก้/ลองใหม่) */
  onCreate: (name: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const v = name.trim();
    if (!v || saving) return;
    setSaving(true);
    const id = await onCreate(v);
    setSaving(false);
    if (id) {
      setName("");
      setOpen(false);
    }
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700 active:scale-[0.97] max-sm:min-h-11"
      >
        <Plus size={15} strokeWidth={2.5} />
        เพิ่มหมวดหมู่
      </button>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        /* เปิดจากการกดปุ่มเสมอ — โฟกัสให้เลยทุกเครื่อง (คีย์บอร์ดคือสิ่งที่ผู้ใช้ต้องการ)
           text-base บนจอเล็ก: ต่ำกว่า 16px แล้ว iOS ซูมหน้าเข้าเองและไม่ซูมกลับ */
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder="ชื่อหมวดหมู่"
        aria-label="ชื่อหมวดหมู่ใหม่"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            setName("");
            setOpen(false);
          }
        }}
        className="w-64 max-w-full rounded-lg border border-stone-300/80 bg-white/80 px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm"
      />
      <Button onClick={() => void submit()} loading={saving} className="shrink-0">
        <Plus size={16} />
        เพิ่ม
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setName("");
          setOpen(false);
        }}
        className="shrink-0"
      >
        ยกเลิก
      </Button>
    </div>
  );
}

/* ---------- กลุ่มหนึ่งกลุ่ม (หัวกลุ่ม + ตาราง) ---------- */

function GroupSection({
  group,
  tags,
  opt,
  collapsed,
  dragDisabled,
  uploadingId,
  onToggleCollapse,
  addRef,
  onAdd,
  onOpen,
  onToggleDone,
  onDelete,
  onRename,
  onUploadFiles,
}: {
  group: ListGroup;
  tags: ListTagRow[];
  /** ตัวเลือกสถานะ/ความสำคัญ + callback ของ dropdown ทั้งสองช่อง */
  opt: OptionUi;
  collapsed: boolean;
  dragDisabled: boolean;
  /** id ของงานที่กำลังอัพโหลดไฟล์อยู่ (null = ไม่มี) */
  uploadingId: string | null;
  /** ลิสต์ยังว่างทั้งหน้า — โชว์คำแนะนำในกลุ่มแทนตารางเปล่า */
  onToggleCollapse: () => void;
  addRef: (el: HTMLInputElement | null) => void;
  onAdd: (title: string) => void;
  onOpen: (id: string) => void;
  onToggleDone: (t: MyTask) => void;
  onDelete: (id: string) => void;
  /** เปลี่ยนชื่อกลุ่ม inline แบบ Monday — มีเฉพาะโหมดจัดกลุ่มตามหมวดหมู่ (รวมกลุ่มสำรอง
   *  "ยังไม่จัดหมวดหมู่" ที่การตั้งชื่อ = สร้างหมวดใหม่); กลุ่มคำนวณเปลี่ยนชื่อไม่ได้ */
  onRename?: (name: string) => void;
  onUploadFiles: (taskId: string, files: FileList) => void;
}) {
  // แถบท้ายกลุ่มเป็นเป้ารับงานที่ลากข้ามกลุ่มมา (กลุ่มว่างก็ยังรับได้)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${group.key}`,
  });
  const rowIds = group.tasks.map((t) => rowId(group.key, t.id));
  const [editing, setEditing] = useState(false);

  // หมวดจริง = พิมพ์ทับชื่อเดิม; กลุ่มสำรอง "ยังไม่จัดหมวดหมู่" = ชื่อนี้เป็นแค่ป้ายกำกับ
  // เริ่มจากช่องว่าง (โชว์ชื่อเดิมเป็น placeholder) จะได้ไม่ต้องลบทิ้งก่อนตั้งชื่อจริง
  const isCategory = group.catId !== null;
  const renameSeed = isCategory ? group.name : "";

  const commitRename = (v: string) => {
    setEditing(false);
    const next = v.trim();
    if (next && next !== group.name && onRename) onRename(next);
  };

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
        {editing && onRename ? (
          <input
            /* เปิดจากการกดชื่อกลุ่มเสมอ — โฟกัส+คีย์บอร์ดคือสิ่งที่ผู้ใช้ตั้งใจ (ต่างจากเมนูลอย)
               เลือกข้อความทั้งหมดตอนโฟกัส: กดแล้วพิมพ์ทับได้เลย ไม่ต้องลบชื่อเดิมทีละตัว
               text-base บนจอเล็ก: ต่ำกว่า 16px แล้ว iOS ซูมหน้าเข้าเองและไม่ซูมกลับ */
            autoFocus
            defaultValue={renameSeed}
            placeholder={isCategory ? group.name : "ตั้งชื่อหมวดหมู่"}
            maxLength={60}
            aria-label={
              isCategory ? `เปลี่ยนชื่อหมวด ${group.name}` : "ตั้งชื่อหมวดหมู่"
            }
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => commitRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = renameSeed;
                setEditing(false);
              }
            }}
            className={`min-w-0 max-w-[16rem] border-b-2 border-brand-400 bg-transparent py-0.5 text-base font-bold placeholder:font-normal placeholder:text-stone-500 focus:outline-none sm:text-[17px] ${group.text}`}
          />
        ) : (
          <button
            type="button"
            /* โหมดหมวดหมู่: กดชื่อ = เปลี่ยนชื่อทันที (ยุบ/กางใช้ปุ่มลูกศรซ้ายมือ) แบบ Monday
               กลุ่มคำนวณ (สถานะ/แท็ก/ฯลฯ): กดชื่อ = ยุบ/กาง เหมือนเดิม */
            onClick={onRename ? () => setEditing(true) : onToggleCollapse}
            title={
              onRename
                ? isCategory
                  ? "กดเพื่อเปลี่ยนชื่อหมวด"
                  : "กดเพื่อตั้งชื่อหมวด — งานที่ยังไม่จัดหมวดหมู่ทั้งหมดจะย้ายเข้าหมวดใหม่นี้"
                : undefined
            }
            className={`group/name flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md py-0.5 text-base font-bold transition-colors max-sm:min-h-11 sm:text-[17px] ${
              onRename ? "px-1 hover:bg-white/70" : ""
            } ${group.text}`}
          >
            <span className="truncate">{group.name}</span>
            {/* ดินสอบอกว่าชื่อนี้กดเปลี่ยนได้ — reveal-on-hover ให้โผล่ตลอดบนจอสัมผัสที่ไม่มี hover */}
            {onRename && (
              <Pencil
                size={13}
                aria-hidden
                className="reveal-on-hover shrink-0 opacity-0 transition-opacity group-hover/name:opacity-70"
              />
            )}
          </button>
        )}
        <span className="ml-1.5 shrink-0 text-xs text-stone-400">
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
                <HeadCell>ไฟล์</HeadCell>
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
                    opt={opt}
                    dragDisabled={dragDisabled}
                    uploading={uploadingId === t.id}
                    onOpen={() => onOpen(t.id)}
                    onToggleDone={() => onToggleDone(t)}
                    onDelete={() => onDelete(t.id)}
                    onPickFiles={(files) => onUploadFiles(t.id, files)}
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
                      className="w-full border-none bg-transparent py-2 text-base text-stone-900 placeholder:text-stone-500 focus:outline-none sm:text-sm"
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
                <GroupSummary tasks={group.tasks} opt={opt} />
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

function GroupSummary({ tasks, opt }: { tasks: MyTask[]; opt: OptionUi }) {
  const seg = (parts: { color: string; n: number }[]) => {
    const total = parts.reduce((m, p) => m + p.n, 0) || 1;
    return parts
      .filter((p) => p.n > 0)
      .map((p) => ({ color: p.color, w: `${(100 * p.n) / total}%` }));
  };
  // นับตาม "ค่าที่โชว์บนแถว" — สัดส่วนในแถบสรุปจึงรวมตัวเลือกที่ผู้ใช้เพิ่มเองด้วย
  const statusSeg = seg(
    statusViews(opt.status).map((v) => ({
      color: v.bar,
      n: tasks.filter((t) => statusViewOf(t, opt.status).key === v.key).length,
    }))
  );
  const prioSeg = seg(
    opt.priorityMenu.map((v) => ({
      color: v.bar,
      n: tasks.filter((t) => priorityViewOf(t, opt.priority).key === v.key).length,
    }))
  );
  const fileCount = tasks.reduce((m, t) => m + t.files.length, 0);
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
      <div className="flex items-center justify-center px-2">
        {fileCount > 0 && (
          <span className="truncate text-[11px] text-stone-400">
            {fileCount} ไฟล์
          </span>
        )}
      </div>
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
  opt,
  dragDisabled,
  uploading,
  onOpen,
  onToggleDone,
  onDelete,
  onPickFiles,
}: {
  id: string;
  task: MyTask;
  tags: ListTagRow[];
  opt: OptionUi;
  dragDisabled: boolean;
  /** งานนี้กำลังอัพโหลดไฟล์อยู่ — ล็อกปุ่มแนบไฟล์ของแถวไว้ก่อน */
  uploading: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
  onPickFiles: (files: FileList) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: dragDisabled });

  // ค่าที่โชว์จริงบนแถว — ตัวเลือกที่ผู้ใช้เพิ่มเองมาก่อน ไม่มีค่อยใช้ค่าในตัว
  const statusMeta = statusViewOf(task, opt.status);
  const prio = priorityViewOf(task, opt.priority);
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
          {/* dropdown เลือกจงใจ ไม่สลับทันทีตอนกด — เดิมคลิกเดียว done เลย ผู้ใช้เผลอกดบ่อย
              (ท้ายเมนูเพิ่มสถานะของตัวเองได้ เช่น "กำลังทำ" — migration 0072) */}
          <OptionPicker
            label="สถานะ"
            view={statusMeta}
            views={opt.statusMenu}
            selectedKey={statusSelectedKey(task)}
            onPick={(v) => opt.onPickStatus(task.id, v)}
            onCreate={(name) => opt.onCreate("status", task.id, name)}
            addLabel="เพิ่มสถานะ"
            placeholder="ชื่อสถานะ"
            onManage={opt.onManage}
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
          <OptionPicker
            label="ความสำคัญ"
            view={prio}
            views={opt.priorityMenu}
            onPick={(v) => opt.onPickPriority(task.id, v)}
            onCreate={(name) => opt.onCreate("priority", task.id, name)}
            addLabel="เพิ่มความสำคัญ"
            placeholder="ชื่อระดับความสำคัญ"
            onManage={opt.onManage}
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

        <FilesCell
          taskTitle={task.title}
          files={task.files}
          uploading={uploading}
          onPick={onPickFiles}
        />

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
          /* ชื่อปุ่มบนแถวย่อรวมชิปสถานะ/ความสำคัญ/ไฟล์ไปด้วย — ตั้ง aria-label กำกับ
             ไม่งั้น screen reader อ่านเป็นก้อนยาวที่ไม่บอกว่ากดแล้วเกิดอะไร */
          aria-label={`เปิดรายละเอียด: ${task.title}`}
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
            <FilesChip count={task.files.length} />
          </span>
        </button>
        {/* จอเล็กไม่มีคอลัมน์ไฟล์ — ปุ่มแนบอยู่ท้ายแถวย่อแทน (เป้านิ้ว 44px) */}
        <PickFilesButton
          taskTitle={task.title}
          uploading={uploading}
          onPick={onPickFiles}
        />
      </div>
    </div>
  );
}
