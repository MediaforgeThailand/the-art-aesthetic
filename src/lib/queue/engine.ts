import type { Availability } from "./types";

/**
 * ตัวเลือกคิวฝั่ง TypeScript — สะท้อนลำดับเดียวกับฟังก์ชัน sq_pick_member ใน Postgres
 * ของจริงเลือกใน Transaction ที่ฐานข้อมูล (กัน race) ไฟล์นี้มีไว้เพื่อ
 * 1. เทสต์กติกาการกระจายคิวได้เร็วโดยไม่ต้องยิง DB
 * 2. ให้หน้าจอคำนวณ "คิวถัดไปน่าจะเป็นใคร" แบบ preview ได้
 */

export type QueueCandidate = {
  id: string;
  displayName?: string;
  rank: number | null;
  weight: number;
  dayCount: number;
  monthCount: number;
  /** epoch ms ของคิวล่าสุด — null คือยังไม่เคยได้คิวเลย */
  lastAssignedAt: number | null;
  isActive: boolean;
  queueEnabled: boolean;
  availability: Availability;
};

export function weightForRank(rank: number | null | undefined): number {
  if (rank == null) return 1;
  if (rank <= 3) return 4;
  if (rank <= 5) return 2;
  return 1;
}

export function isEligible(c: QueueCandidate): boolean {
  return c.isActive && c.queueEnabled && c.availability === "available";
}

/**
 * เปรียบเทียบด้วยการคูณไขว้แทนการหาร — ผลลัพธ์เท่ากับ (n+1)/w ทาง SQL
 * แต่ไม่มีปัญหาปัดเศษทศนิยม
 */
function compare(a: QueueCandidate, b: QueueCandidate): number {
  const dayA = (a.dayCount + 1) * b.weight;
  const dayB = (b.dayCount + 1) * a.weight;
  if (dayA !== dayB) return dayA - dayB;

  const monthA = (a.monthCount + 1) * b.weight;
  const monthB = (b.monthCount + 1) * a.weight;
  if (monthA !== monthB) return monthA - monthB;

  const lastA = a.lastAssignedAt ?? -1;
  const lastB = b.lastAssignedAt ?? -1;
  if (lastA !== lastB) return lastA - lastB;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function pickNext(
  candidates: QueueCandidate[],
  excludeIds: string[] = []
): QueueCandidate | null {
  const pool = candidates.filter((c) => isEligible(c) && !excludeIds.includes(c.id));
  if (pool.length === 0) return null;
  return [...pool].sort(compare)[0];
}

export type SimulationEvent = {
  /** ทำงานก่อนแจกเคสลำดับที่ n (นับจาก 1) */
  beforeCase: number;
  apply: (members: QueueCandidate[]) => void;
};

export type SimulationResult = {
  members: QueueCandidate[];
  counts: Record<string, number>;
  order: (string | null)[];
  unassigned: number;
};

/**
 * จำลองการแจกคิวติดต่อกัน n เคส — ใช้ในเทสต์และหน้า preview
 * เวลาเดินทีละ 1 หน่วยเพื่อให้ last_assigned_at เรียงได้แน่นอน ไม่พึ่งนาฬิกาจริง
 */
export function simulate(
  input: QueueCandidate[],
  caseCount: number,
  events: SimulationEvent[] = []
): SimulationResult {
  const members = input.map((m) => ({ ...m }));
  const counts: Record<string, number> = {};
  const order: (string | null)[] = [];
  let unassigned = 0;

  for (const m of members) counts[m.id] = 0;

  for (let i = 1; i <= caseCount; i++) {
    for (const e of events) if (e.beforeCase === i) e.apply(members);

    const picked = pickNext(members);
    if (!picked) {
      order.push(null);
      unassigned += 1;
      continue;
    }
    picked.dayCount += 1;
    picked.monthCount += 1;
    picked.lastAssignedAt = i;
    counts[picked.id] += 1;
    order.push(picked.id);
  }

  return { members, counts, order, unassigned };
}

/** เริ่มวันใหม่: ล้างตัวนับรายวัน แต่เก็บตัวนับรายเดือนไว้ชดเชยความต่าง */
export function startNewDay(members: QueueCandidate[]): QueueCandidate[] {
  return members.map((m) => ({ ...m, dayCount: 0 }));
}

export function makeCandidate(
  id: string,
  rank: number | null,
  overrides: Partial<QueueCandidate> = {}
): QueueCandidate {
  return {
    id,
    rank,
    weight: weightForRank(rank),
    dayCount: 0,
    monthCount: 0,
    lastAssignedAt: null,
    isActive: true,
    queueEnabled: true,
    availability: "available",
    ...overrides,
  };
}
