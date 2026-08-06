/**
 * ตัวช่วยของ My List (/my-tasks) — งาน/โน้ตส่วนตัว
 * แยกออกมาจาก client เพราะทั้งลิสต์และแผงรายละเอียดใช้ร่วมกัน
 */

import { formatDate, todayISO } from "@/lib/format";
import type { ListTaskWithTags, TaskPriority } from "@/lib/types";

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
