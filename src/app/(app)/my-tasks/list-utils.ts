/**
 * ตัวช่วยของ My List (/my-tasks) — งาน/โน้ตส่วนตัว
 * แยกออกมาจาก client เพราะทั้งลิสต์และแผงรายละเอียดใช้ร่วมกัน
 */

import {
  LIST_PRIORITY,
  LIST_PRIORITY_ORDER,
  LIST_STATUS,
  LIST_STATUS_ORDER,
  type ListStatus,
  listTagColor,
} from "@/lib/constants";
import { formatDate, todayISO } from "@/lib/format";
import type {
  ListGroupRow,
  ListOptionKind,
  ListOptionRow,
  ListTagRow,
  ListTaskFileRow,
  ListTaskRow,
  ListTaskWithTags,
  TaskPriority,
} from "@/lib/types";

/** งานหนึ่งรายการพร้อมของที่ผูกอยู่ — แท็ก (list_task_tags) + ไฟล์แนบ (list_task_files)
 *  ประกอบฝั่ง server ใน page.tsx แล้วส่งมาเป็นก้อนเดียว */
export type MyTask = ListTaskWithTags & { files: ListTaskFileRow[] };

/** ตัวเลือกการเรียงลิสต์ */
export type ListSort = "manual" | "due" | "priority" | "created";

export const LIST_SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "manual", label: "ลำดับของฉัน (ลากเรียงได้)" },
  { value: "due", label: "ใกล้ครบกำหนดก่อน" },
  { value: "priority", label: "ความสำคัญมากก่อน" },
  { value: "created", label: "เพิ่มล่าสุดก่อน" },
];

const DAY_MS = 86_400_000;

/** ลำดับความสำคัญสำหรับการเรียง (ด่วน = 0) */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/* ---------- ตัวเลือกที่ผู้ใช้เพิ่มเอง (list_options — migration 0072) ---------- */

/** ตัวเลือกที่เพิ่มเองแยกตามชนิด เรียงตามลำดับในเมนูแล้ว */
export type ListOptions = Record<ListOptionKind, ListOptionRow[]>;

const EMPTY_OPTIONS: ListOptions = { status: [], priority: [] };

/** แยกตัวเลือกตามชนิด + เรียงตาม position (ชนกันให้อันเก่ากว่าขึ้นก่อน เหมือน sortListGroups) */
export function splitOptions(rows: ListOptionRow[]): ListOptions {
  const sorted = [...rows].sort(
    (a, b) =>
      a.position - b.position ||
      Date.parse(a.created_at) - Date.parse(b.created_at)
  );
  return {
    status: sorted.filter((o) => o.kind === "status"),
    priority: sorted.filter((o) => o.kind === "priority"),
  };
}

/**
 * หน้าตาของค่าที่จะโชว์ในช่องสถานะ/ความสำคัญ — ตัวเลือก "ในตัว" กับที่ผู้ใช้เพิ่มเอง
 * ถูกแปลงเป็นรูปแบบเดียวกัน คนอ่านตารางจึงแยกไม่ออกว่าอันไหนมาจากไหน (แบบ label ของ Monday)
 */
export type OptionView = {
  /** คีย์สำหรับจัดกลุ่ม/เทียบว่าเลือกอยู่ไหม — ในตัว = "open"/"done"/"urgent"…, ที่เพิ่มเอง = id */
  key: string;
  label: string;
  /** ช่องสีทึบเต็มเซลล์ในตาราง */
  cell: string;
  /** จุดสีในเมนู + แถบสีของกลุ่ม/แถบสรุป */
  bar: string;
  /** พื้นแถวอ่อน (เฉพาะความสำคัญ — สถานะไม่ย้อมแถว) */
  row: string;
  /** สีชื่อหัวกลุ่ม */
  text: string;
  /** true = ตัวเลือกที่ผู้ใช้เพิ่มเอง (แก้/ลบได้ในโมดัลจัดการตัวเลือก) */
  custom: boolean;
};

/**
 * ชุดข้อมูล+callback ของ dropdown สถานะ/ความสำคัญ ที่ส่งต่อกันทั้งหน้า (ตาราง + แผงรายละเอียด)
 * รวมเป็นก้อนเดียวเพราะทุกที่ที่โชว์สองช่องนี้ต้องใช้ครบชุดเดียวกันเสมอ
 * — แยกส่งทีละตัวจะกลายเป็น prop 8 ตัวที่ลืมส่งได้ง่าย
 */
export type OptionUi = {
  /** ตัวเลือกที่เพิ่มเอง (ไว้แปลค่าบนแถวเป็นชื่อ/สี) */
  status: ListOptionRow[];
  priority: ListOptionRow[];
  /** ตัวเลือกที่ "เลือกได้" ในเมนู — สถานะที่มาจากวันกำหนดส่งถูกกรองออกแล้ว */
  statusMenu: OptionView[];
  priorityMenu: OptionView[];
  onPickStatus: (taskId: string, v: OptionView) => void;
  onPickPriority: (taskId: string, v: OptionView) => void;
  /** สร้างตัวเลือกใหม่จากในเมนู แล้วตั้งให้งานนั้นเลย (คืน id ใหม่ / null = ล้มเหลว) */
  onCreate: (
    kind: ListOptionKind,
    taskId: string,
    name: string
  ) => Promise<string | null>;
  /** เปิดโมดัลจัดการตัวเลือก (เปลี่ยนชื่อ/สี/ลำดับ/ลบ) */
  onManage: () => void;
};

/** ตัวเลือกที่ผู้ใช้เพิ่มเอง → รูปแบบเดียวกับตัวเลือกในตัว (สีมาจากชุด LIST_TAG_COLORS) */
function optionView(o: ListOptionRow): OptionView {
  const c = listTagColor(o.color);
  return {
    key: o.id,
    label: o.name,
    cell: c.cell,
    bar: c.dot,
    row: c.row,
    text: c.text,
    custom: true,
  };
}

const builtinStatusView = (s: ListStatus): OptionView => ({
  key: s,
  label: LIST_STATUS[s].label,
  cell: LIST_STATUS[s].cell,
  bar: LIST_STATUS[s].bar,
  row: "",
  text: LIST_STATUS[s].text,
  custom: false,
});

const builtinPriorityView = (p: TaskPriority): OptionView => ({
  key: p,
  label: LIST_PRIORITY[p].label,
  cell: LIST_PRIORITY[p].cell,
  bar: LIST_PRIORITY[p].bar,
  row: LIST_PRIORITY[p].row,
  text: LIST_PRIORITY[p].text,
  custom: false,
});

/** ตัวเลือกทั้งเมนู "สถานะ" — ในตัว (ยังไม่เสร็จ…เสร็จแล้ว) + ที่เพิ่มเองแทรกก่อน "เสร็จแล้ว"
 *  (ที่เพิ่มเองเป็นสถานะระหว่างทางเสมอ — วางไว้ก่อนปลายทางให้อ่านเรียงเป็นเส้นเดียว) */
export function statusViews(custom: ListOptionRow[]): OptionView[] {
  const builtin = LIST_STATUS_ORDER.map(builtinStatusView);
  const at = builtin.findIndex((v) => v.key === "done");
  const customs = custom.map(optionView);
  return at < 0
    ? [...builtin, ...customs]
    : [...builtin.slice(0, at), ...customs, ...builtin.slice(at)];
}

/** ตัวเลือกทั้งเมนู "ความสำคัญ" — 4 ระดับในตัวก่อน แล้วต่อด้วยที่เพิ่มเอง */
export function priorityViews(custom: ListOptionRow[]): OptionView[] {
  return [...LIST_PRIORITY_ORDER.map(builtinPriorityView), ...custom.map(optionView)];
}

/**
 * สถานะที่โชว์บนแถว — สถานะที่ผู้ใช้เลือกเองมาก่อน ถ้าไม่ได้เลือกค่อยคำนวณจาก done + due_date
 *
 * **ติ๊กเสร็จชนะเสมอ**: งานที่ done=true แสดง "เสร็จแล้ว" แม้ status_id ยังค้างอยู่
 * (ปกติ client ล้างให้ตอนติ๊ก — กันข้อมูลที่มาจากทางอื่น เช่น SQL มือ ไม่ให้โชว์ป้ายขัดกัน)
 */
export function statusViewOf(t: MyTask, custom: ListOptionRow[]): OptionView {
  if (!t.done && t.status_id) {
    const o = custom.find((x) => x.id === t.status_id);
    if (o) return optionView(o);
  }
  return builtinStatusView(statusOf(t));
}

/**
 * ค่าที่ให้ติ๊กถูกในเมนูสถานะ — ต่างจาก statusViewOf ตรงงานที่ "เลยกำหนด/ใกล้ครบกำหนด"
 * ซึ่งเป็นป้ายที่มาจากวันที่ ไม่มีในเมนู: งานพวกนี้ยังถือว่าเลือก "ยังไม่เสร็จ" อยู่
 * (ไม่งั้นเปิดเมนูแล้วไม่มีอะไรถูกติ๊กเลย แล้วกด "ยังไม่เสร็จ" ก็ยิง update ที่ไม่เปลี่ยนอะไร)
 */
export function statusSelectedKey(t: MyTask): string {
  if (t.done) return "done";
  return t.status_id ?? "open";
}

/** ความสำคัญที่โชว์บนแถว — ที่เพิ่มเองมาก่อน ไม่มีค่อยใช้คอลัมน์ priority เดิม */
export function priorityViewOf(t: MyTask, custom: ListOptionRow[]): OptionView {
  if (t.priority_id) {
    const o = custom.find((x) => x.id === t.priority_id);
    if (o) return optionView(o);
  }
  return builtinPriorityView(t.priority);
}

/** ลำดับสำหรับเรียง "ความสำคัญมากก่อน" — ที่เพิ่มเองต่อท้าย 4 ระดับในตัวตามลำดับในเมนู */
function priorityRank(t: MyTask, custom: ListOptionRow[]): number {
  if (t.priority_id) {
    const i = custom.findIndex((o) => o.id === t.priority_id);
    if (i >= 0) return PRIORITY_RANK.low + 1 + i;
  }
  return PRIORITY_RANK[t.priority];
}

type DueInfo = {
  /** จำนวนวันจากวันนี้ (ลบ = เลยกำหนด) */
  days: number;
  label: string;
  chip: string;
  overdue: boolean;
};

/**
 * ป้ายกำหนดส่ง — "YYYY-MM-DD" ทั้งสองฝั่งถูก parse เป็นเที่ยงคืน UTC เท่ากัน
 * ผลต่างจึงเป็นจำนวนวันเป๊ะ ไม่เพี้ยนตาม timezone ของเครื่องผู้ชม
 * (todayISO ตรึงเวลาไทยเสมอ — server เป็น UTC ถ้าไม่ตรึงจะนับคนละวันกับ client)
 *
 * อยู่ระดับโมดูล (ไม่ใช่ใน component) เพราะเรียก new Date() ผ่าน todayISO —
 * กฎ react-hooks/purity ห้ามอ่านเวลาปัจจุบันระหว่าง render ของ component
 */
export function dueInfo(due: string | null, done: boolean): DueInfo | null {
  if (!due) return null;
  const days = Math.round((Date.parse(due) - Date.parse(todayISO())) / DAY_MS);
  if (Number.isNaN(days)) return null;
  // ติ๊กเสร็จแล้วไม่ต้องเตือนสีแดงอีก — งานจบแล้ว ป้ายแค่บอกว่ากำหนดคือวันไหน
  if (done)
    return {
      days,
      label: formatDate(due),
      chip: "bg-stone-100 text-stone-500",
      overdue: false,
    };
  if (days < 0)
    return {
      days,
      label: `เลยกำหนด ${Math.abs(days)} วัน`,
      chip: "bg-rose-100 text-rose-700",
      overdue: true,
    };
  if (days === 0)
    return {
      days,
      label: "วันนี้",
      chip: "bg-amber-100 text-amber-700",
      overdue: false,
    };
  if (days === 1)
    return {
      days,
      label: "พรุ่งนี้",
      chip: "bg-amber-100 text-amber-700",
      overdue: false,
    };
  if (days <= 7)
    return {
      days,
      label: `อีก ${days} วัน`,
      chip: "bg-brand-100 text-brand-800",
      overdue: false,
    };
  return {
    days,
    label: formatDate(due),
    chip: "bg-stone-100 text-stone-600",
    overdue: false,
  };
}

/** วันที่แบบสั้นไม่มีปี เช่น "7 ส.ค." — ใช้ในแถบสรุปท้ายกลุ่มที่พื้นที่แคบ
    ตรึงเวลาไทยเหมือน format.ts (due_date เป็น date ล้วน ต้อง parse เป็น UTC ก่อน) */
export function shortDate(due: string): string {
  const d = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return due;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });
}

/** งานที่เลยกำหนดและยังไม่เสร็จ (ใช้ทั้งการ์ดสรุปและชิปตัวกรอง) */
export function isOverdue(t: MyTask): boolean {
  return !t.done && !!t.due_date && t.due_date < todayISO();
}

/** เรียงลิสต์ตามตัวเลือก — ที่ติ๊กเสร็จแล้วจมลงล่างสุดเสมอทุกโหมด
 *  (prioOpts = ความสำคัญที่ผู้ใช้เพิ่มเอง ใช้จัดลำดับต่อท้าย 4 ระดับในตัว) */
export function sortTasks(
  items: MyTask[],
  sort: ListSort,
  prioOpts: ListOptionRow[] = []
): MyTask[] {
  const byCreatedDesc = (a: MyTask, b: MyTask) =>
    Date.parse(b.created_at) - Date.parse(a.created_at);
  const rank = (t: MyTask) => priorityRank(t, prioOpts);

  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    switch (sort) {
      case "manual":
        return a.position - b.position || byCreatedDesc(a, b);
      case "due": {
        // ไม่ได้ตั้งกำหนดส่ง = ไปอยู่ท้ายกลุ่ม (ไม่ใช่หน้าสุดเพราะค่าว่าง)
        if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
        if (a.due_date && b.due_date && a.due_date !== b.due_date)
          return a.due_date < b.due_date ? -1 : 1;
        return rank(a) - rank(b);
      }
      case "priority": {
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
        if (a.due_date && b.due_date && a.due_date !== b.due_date)
          return a.due_date < b.due_date ? -1 : 1;
        return byCreatedDesc(a, b);
      }
      case "created":
        return byCreatedDesc(a, b);
    }
  });
}

/* ---------- สถานะ (คำนวณจาก done + due_date — ไม่มีคอลัมน์นี้ใน DB) ---------- */

/**
 * สถานะที่แสดงในคอลัมน์ "สถานะ" ของตาราง
 * อยู่ระดับโมดูลเพราะอ่านวันนี้ผ่าน todayISO (กฎ react-hooks/purity เหมือน dueInfo)
 */
export function statusOf(t: MyTask): ListStatus {
  if (t.done) return "done";
  if (!t.due_date) return "open";
  const today = todayISO();
  if (t.due_date < today) return "overdue";
  const days = Math.round((Date.parse(t.due_date) - Date.parse(today)) / DAY_MS);
  // วันนี้/พรุ่งนี้ = ใกล้ครบกำหนด (ตรงกับป้าย "วันนี้"/"พรุ่งนี้" ของ dueInfo)
  return days <= 1 ? "soon" : "open";
}

/* ---------- จัดกลุ่มแบบบอร์ด Monday ----------
   โหมดเริ่มต้นคือ "หมวดหมู่" = หัวข้อใหญ่ที่ผู้ใช้ตั้งเอง (ตาราง list_groups + คอลัมน์
   list_tasks.group_id — migration 0067) เพิ่ม/เปลี่ยนชื่อ/เปลี่ยนสี/เรียง/ลบได้แบบ Monday
   ส่วนโหมดที่เหลือเป็น "กลุ่มคำนวณจากข้อมูลที่มีอยู่" (สถานะ/ความสำคัญ/แท็ก/กำหนดส่ง)
   — เปลี่ยนเกณฑ์จัดกลุ่มได้จากปุ่ม "จัดกลุ่ม" บนแถบเครื่องมือ */

export type GroupBy = "category" | "status" | "priority" | "tag" | "due" | "none";

export const LIST_GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "category", label: "หมวดหมู่" },
  { value: "status", label: "สถานะ" },
  { value: "priority", label: "ความสำคัญ" },
  { value: "tag", label: "แท็ก" },
  { value: "due", label: "กำหนดส่ง" },
  { value: "none", label: "ไม่จัดกลุ่ม" },
];

/** เรียงหมวดตาม position (ชนกันให้หมวดเก่ากว่าขึ้นก่อน) — ใช้ทั้งบอร์ดและโมดัลจัดการหมวด */
export function sortListGroups(groups: ListGroupRow[]): ListGroupRow[] {
  return [...groups].sort(
    (a, b) =>
      a.position - b.position ||
      Date.parse(a.created_at) - Date.parse(b.created_at)
  );
}

export type ListGroup = {
  key: string;
  name: string;
  /** คลาสพื้นสีของแถบซ้ายกลุ่ม (ต้องเป็นคลาสเต็ม — Tailwind v4 ไม่เห็นคลาสที่ต่อสตริงเอง) */
  bar: string;
  /** คลาสสีของชื่อกลุ่ม */
  text: string;
  tasks: MyTask[];
  /** ค่าตั้งต้นของงานที่พิมพ์เพิ่มในกลุ่มนี้ (null = กลุ่มนี้ไม่มีช่อง "+ เพิ่มงาน"
   *  เพราะเงื่อนไขของกลุ่มไม่ใช่สิ่งที่ตั้งให้งานใหม่ได้ เช่น "เลยกำหนด") */
  add: { patch: Partial<ListTaskRow>; tagId: string | null } | null;
  /** ลากงานจากกลุ่มอื่นมาวาง = แก้ฟิลด์นี้ (null = ไม่รับงานข้ามกลุ่ม) */
  drop: Partial<ListTaskRow> | null;
  /** แท็กประจำกลุ่ม (เฉพาะโหมดจัดกลุ่มตามแท็ก) — ใช้ตอนลากข้ามกลุ่ม */
  tagId: string | null;
  /** id ของหมวดหมู่ (เฉพาะโหมดจัดกลุ่มตามหมวดหมู่) — กลุ่มที่มีค่านี้เปลี่ยนชื่อ inline ที่หัวกลุ่มได้ */
  catId: string | null;
  /** กลุ่มที่ต้องโชว์แม้ไม่มีงาน — ที่ทางของงานใหม่/เป้าหมายที่ลากไปวางได้ */
  keepEmpty: boolean;
};

const emptyGroup = (
  g: Pick<ListGroup, "key" | "name" | "bar" | "text"> &
    Partial<Omit<ListGroup, "key" | "name" | "bar" | "text">>
): ListGroup => ({
  tasks: [],
  add: null,
  drop: null,
  tagId: null,
  catId: null,
  keepEmpty: false,
  ...g,
});

/**
 * แบ่งงานเป็นกลุ่มตามเกณฑ์ที่เลือก — ลำดับงานภายในกลุ่มคือลำดับที่ส่งเข้ามา (เรียงมาแล้ว)
 * โหมด "แท็ก" งานที่ติดหลายแท็กจะโผล่ในทุกกลุ่มที่ติดไว้ (เหมือนกลุ่มหัตถการของ Price List)
 */
export function buildGroups(
  items: MyTask[],
  groupBy: GroupBy,
  tags: ListTagRow[],
  cats: ListGroupRow[],
  opts: ListOptions = EMPTY_OPTIONS
): ListGroup[] {
  if (groupBy === "category") {
    const groups = sortListGroups(cats).map((c) => {
      const color = listTagColor(c.color);
      return emptyGroup({
        key: `cat:${c.id}`,
        name: c.name,
        bar: color.dot,
        text: color.text,
        catId: c.id,
        add: { patch: { group_id: c.id }, tagId: null },
        drop: { group_id: c.id },
        // หมวดที่เพิ่งสร้าง/ยังว่างต้องโชว์เสมอ — เป็นเป้าให้ลาก/เพิ่มงานเข้า
        keepEmpty: true,
      });
    });
    const none = emptyGroup({
      key: "cat:none",
      name: "ยังไม่จัดหมวดหมู่",
      bar: "bg-stone-300",
      text: "text-stone-500",
      add: { patch: {}, tagId: null },
      drop: { group_id: null },
      // ยังไม่มีหมวดเลย = กลุ่มสำรองคือช่องเพิ่มงานเดียวของบอร์ด ต้องโชว์แม้ว่าง
      // (มีหมวดจริงแล้วค่อยซ่อนตอนว่าง — ทุกหมวดมีช่องเพิ่มงานของตัวเอง ไม่เกิดทางตัน)
      keepEmpty: groups.length === 0,
    });
    const byId = new Map(groups.map((g) => [g.catId, g]));
    for (const t of items) {
      const g = t.group_id ? byId.get(t.group_id) : undefined;
      // group_id ชี้หมวดที่เพิ่งถูกลบ (แถวยังไม่ทัน SET NULL ใน payload เก่า) = ถือว่าไม่มีหมวด
      (g ?? none).tasks.push(t);
    }
    return [...groups, none];
  }

  if (groupBy === "none") {
    return [
      emptyGroup({
        key: "all",
        name: "งานทั้งหมด",
        bar: "bg-brand-500",
        text: "text-brand-800",
        tasks: items,
        add: { patch: {}, tagId: null },
        keepEmpty: true,
      }),
    ];
  }

  if (groupBy === "priority") {
    const groups = priorityViews(opts.priority).map((v) =>
      emptyGroup({
        key: v.key,
        name: v.label,
        bar: v.bar,
        text: v.text,
        // ทุกกลุ่มโชว์เสมอ (รวมที่เพิ่มเอง) — เป็นเป้าหมายให้ลากงานมาเปลี่ยนความสำคัญได้
        keepEmpty: true,
        add: { patch: priorityPatch(v), tagId: null },
        drop: priorityPatch(v),
      })
    );
    const byKey = new Map(groups.map((g) => [g.key, g]));
    for (const t of items)
      byKey.get(priorityViewOf(t, opts.priority).key)?.tasks.push(t);
    return groups;
  }

  if (groupBy === "tag") {
    const groups = tags.map((tag) => {
      const color = listTagColor(tag.color);
      return emptyGroup({
        key: `tag:${tag.id}`,
        name: tag.name,
        bar: color.dot,
        text: color.text,
        tagId: tag.id,
        add: { patch: {}, tagId: tag.id },
        // แท็กที่ยังไม่มีงานต้องโชว์กลุ่มว่างไว้ — ไม่งั้นแท็กใหม่หายจากบอร์ด
        // ทั้งที่ตั้งใจสร้างมาเพื่อลาก/เพิ่มงานเข้า
        keepEmpty: true,
      });
    });
    const none = emptyGroup({
      key: "tag:none",
      name: "ไม่มีแท็ก",
      bar: "bg-stone-300",
      text: "text-stone-500",
      add: { patch: {}, tagId: null },
      keepEmpty: true,
    });
    const byId = new Map(groups.map((g) => [g.tagId, g]));
    for (const t of items) {
      if (t.tagIds.length === 0) {
        none.tasks.push(t);
        continue;
      }
      for (const id of t.tagIds) byId.get(id)?.tasks.push(t);
    }
    return [...groups, none];
  }

  if (groupBy === "due") {
    const today = todayISO();
    const past = emptyGroup({
      key: "due:past",
      name: "ก่อนวันนี้",
      bar: "bg-rose-500",
      text: "text-rose-600",
    });
    const todayG = emptyGroup({
      key: "due:today",
      name: "วันนี้",
      bar: "bg-amber-400",
      text: "text-amber-600",
      add: { patch: { due_date: today }, tagId: null },
      // ต้องโชว์แม้ว่าง — เป็นกลุ่มเดียวในโหมดนี้ที่เพิ่มงาน "ครบกำหนดวันนี้" ได้
      keepEmpty: true,
    });
    const week = emptyGroup({
      key: "due:week",
      name: "ใน 7 วัน",
      bar: "bg-brand-500",
      text: "text-brand-700",
    });
    const later = emptyGroup({
      key: "due:later",
      name: "หลังจากนั้น",
      bar: "bg-sky-400",
      text: "text-sky-600",
    });
    const none = emptyGroup({
      key: "due:none",
      name: "ไม่มีกำหนด",
      bar: "bg-stone-300",
      text: "text-stone-500",
      add: { patch: {}, tagId: null },
      keepEmpty: true,
    });
    for (const t of items) {
      if (!t.due_date) {
        none.tasks.push(t);
        continue;
      }
      if (t.due_date < today) past.tasks.push(t);
      else if (t.due_date === today) todayG.tasks.push(t);
      else if (
        Math.round((Date.parse(t.due_date) - Date.parse(today)) / DAY_MS) <= 7
      )
        week.tasks.push(t);
      else later.tasks.push(t);
    }
    return [past, todayG, week, later, none];
  }

  // สถานะ — ในตัว + ที่ผู้ใช้เพิ่มเอง (ที่เพิ่มเองแทรกก่อน "เสร็จแล้ว")
  const groups = statusViews(opts.status).map((v) => {
    const patch = statusPatch(v);
    return emptyGroup({
      key: v.key,
      name: v.label,
      bar: v.bar,
      text: v.text,
      // เลยกำหนด/ใกล้ครบกำหนด ตั้งให้งานใหม่ตรงๆ ไม่ได้ (มาจากวันที่) — ไม่มีช่องเพิ่ม
      add: patch ? { patch, tagId: null } : null,
      // ลากเข้า "เสร็จแล้ว" = ติ๊กเสร็จ, "ยังไม่เสร็จ"/สถานะที่เพิ่มเอง = เอาติ๊กออกแล้วตั้งป้าย
      // ส่วน เลยกำหนด/ใกล้ครบกำหนด มาจากวันที่ ลากเข้าไปตั้งอะไรให้ไม่ได้ = ไม่รับ drop
      // (เดิมตั้ง {done:false} ให้ทุกกลุ่ม — ลากงานค้างไปวาง "เลยกำหนด" แล้วเด้งกลับเฉยๆ ดูเหมือนบัค)
      drop: patch,
      keepEmpty: v.key === "open" || v.custom,
    });
  });
  const byKey = new Map(groups.map((g) => [g.key, g]));
  for (const t of items) byKey.get(statusViewOf(t, opts.status).key)?.tasks.push(t);
  return groups;
}

/** patch ที่ทำให้งานเข้ากลุ่มสถานะนั้น — null = กลุ่มที่ตั้งค่าเองไม่ได้ (มาจากวันกำหนดส่ง)
 *  สถานะที่เพิ่มเองบังคับ done=false เสมอ: มันคือสถานะ "ระหว่างทาง" ไม่ใช่ปลายทาง */
export function statusPatch(v: OptionView): Partial<ListTaskRow> | null {
  if (v.custom) return { done: false, status_id: v.key };
  if (v.key === "done") return { done: true, status_id: null };
  if (v.key === "open") return { done: false, status_id: null };
  return null;
}

/** patch ที่ทำให้งานเข้ากลุ่มความสำคัญนั้น (ที่เพิ่มเอง = ตั้ง priority_id, ในตัว = ล้างทิ้ง) */
export function priorityPatch(v: OptionView): Partial<ListTaskRow> {
  return v.custom
    ? { priority_id: v.key }
    : { priority: v.key as TaskPriority, priority_id: null };
}

/**
 * ตำแหน่งใหม่ของรายการที่ลากไปวางระหว่าง prev/next — ใช้ค่ากึ่งกลางเหมือนบอร์ด Task/Influ
 * (ไม่ต้องเขียนทับลำดับทั้งลิสต์ทุกครั้งที่ลาก)
 */
export function midPosition(
  prev: number | null,
  next: number | null
): number {
  if (prev === null && next === null) return 0;
  if (prev === null) return (next as number) - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}
