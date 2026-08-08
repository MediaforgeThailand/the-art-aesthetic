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
  ListTagRow,
  ListTaskRow,
  ListTaskWithTags,
  TaskPriority,
} from "@/lib/types";

export type MyTask = ListTaskWithTags;

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

export type DueInfo = {
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

/** เรียงลิสต์ตามตัวเลือก — ที่ติ๊กเสร็จแล้วจมลงล่างสุดเสมอทุกโหมด */
export function sortTasks(items: MyTask[], sort: ListSort): MyTask[] {
  const byCreatedDesc = (a: MyTask, b: MyTask) =>
    Date.parse(b.created_at) - Date.parse(a.created_at);

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
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      }
      case "priority": {
        const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
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
   หมายเหตุสำคัญ: **กลุ่มในหน้านี้คำนวณจากข้อมูลที่มีอยู่ ไม่ใช่กลุ่มที่ผู้ใช้สร้างเอง**
   (list_tasks ไม่มีคอลัมน์ group_id) — เปลี่ยนเกณฑ์จัดกลุ่มได้จากปุ่ม "จัดกลุ่ม" บนแถบเครื่องมือ
   ถ้าวันหนึ่งอยากได้กลุ่มที่ตั้งชื่อเองแบบ Monday ต้องเพิ่มตาราง list_groups + migration ก่อน */

export type GroupBy = "status" | "priority" | "tag" | "due" | "none";

export const LIST_GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "status", label: "สถานะ" },
  { value: "priority", label: "ความสำคัญ" },
  { value: "tag", label: "แท็ก" },
  { value: "due", label: "กำหนดส่ง" },
  { value: "none", label: "ไม่จัดกลุ่ม" },
];

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
  tags: ListTagRow[]
): ListGroup[] {
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
    const groups = LIST_PRIORITY_ORDER.map((p) =>
      emptyGroup({
        key: p,
        name: LIST_PRIORITY[p].label,
        bar: LIST_PRIORITY[p].bar,
        text: LIST_PRIORITY[p].text,
        // ทั้ง 4 กลุ่มโชว์เสมอ — เป็นเป้าหมายให้ลากงานมาเปลี่ยนความสำคัญได้
        keepEmpty: true,
        add: { patch: { priority: p }, tagId: null },
        drop: { priority: p },
      })
    );
    const byKey = new Map(groups.map((g) => [g.key, g]));
    for (const t of items) byKey.get(t.priority)?.tasks.push(t);
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

  // สถานะ (ค่าเริ่มต้น)
  const groups = LIST_STATUS_ORDER.map((s) =>
    emptyGroup({
      key: s,
      name: LIST_STATUS[s].label,
      bar: LIST_STATUS[s].bar,
      text: LIST_STATUS[s].text,
      // เลยกำหนด/ใกล้ครบกำหนด ตั้งให้งานใหม่ตรงๆ ไม่ได้ (มาจากวันที่) — ไม่มีช่องเพิ่ม
      add: s === "open" ? { patch: {}, tagId: null } : null,
      // ลากเข้า "เสร็จแล้ว" = ติ๊กเสร็จ, ลากเข้า "ยังไม่เสร็จ" = เอาติ๊กออก
      // ส่วน เลยกำหนด/ใกล้ครบกำหนด มาจากวันที่ ลากเข้าไปตั้งอะไรให้ไม่ได้ = ไม่รับ drop
      // (เดิมตั้ง {done:false} ให้ทุกกลุ่ม — ลากงานค้างไปวาง "เลยกำหนด" แล้วเด้งกลับเฉยๆ ดูเหมือนบัค)
      drop: s === "done" ? { done: true } : s === "open" ? { done: false } : null,
      keepEmpty: s === "open",
    })
  );
  const byKey = new Map(groups.map((g) => [g.key, g]));
  for (const t of items) byKey.get(statusOf(t))?.tasks.push(t);
  return groups;
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
