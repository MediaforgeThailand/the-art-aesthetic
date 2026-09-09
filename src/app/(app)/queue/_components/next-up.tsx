import { ListOrdered } from "lucide-react";
import type { MemberWithStats } from "@/lib/queue/data";
import { pickNext, type QueueCandidate } from "@/lib/queue/engine";

/**
 * แถบ "คิวถัดไป" — พรีวิวว่าระบบจะจ่ายคิวให้ใครตามลำดับ
 * ใช้กติกาเดียวกับ sq_pick_member ใน Postgres (engine.ts สะท้อนสูตรไว้)
 * เป็นการคาดการณ์เพื่อให้ทีมเห็นภาพ — ตัวจ่ายจริงตัดสินใน transaction ที่ฐานข้อมูลเสมอ
 */
export function previewQueueOrder(
  members: MemberWithStats[],
  count = 5
): { id: string; name: string }[] {
  const pool: QueueCandidate[] = members
    .filter((m) => m.role !== "viewer")
    .map((m) => ({
      id: m.id,
      displayName: m.display_name,
      rank: m.rank,
      weight: m.weight,
      dayCount: m.today,
      monthCount: m.month,
      lastAssignedAt: m.last_assigned_at ? Date.parse(m.last_assigned_at) : null,
      isActive: m.is_active,
      queueEnabled: m.queue_enabled,
      availability: m.availability,
    }));

  // เดินเวลาต่อจากปัจจุบัน — ให้คนที่เพิ่งถูกเลือกในพรีวิวถือว่า "ได้คิวล่าสุด" จริงๆ
  let clock = Date.now();
  const order: { id: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const picked = pickNext(pool);
    if (!picked) break;
    order.push({ id: picked.id, name: picked.displayName ?? "" });
    picked.dayCount += 1;
    picked.monthCount += 1;
    picked.lastAssignedAt = clock++;
  }
  return order;
}

export function NextUpStrip({
  members,
  myMemberId,
}: {
  members: MemberWithStats[];
  /** ส่งมาเมื่อผู้ดูเป็น BC — ไฮไลต์ตำแหน่งของตัวเองในลำดับ */
  myMemberId?: string;
}) {
  const order = previewQueueOrder(members, 5);

  if (order.length === 0) {
    return (
      <section className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
        ตอนนี้ไม่มีใครพร้อมรับคิว — เคสใหม่จะเข้าสถานะ “รอจ่ายคิวเอง” ให้แอดมินจ่าย
      </section>
    );
  }

  const [first, ...rest] = order;

  return (
    <section className="mb-4">
      <div className="glass flex items-center gap-2 overflow-x-auto rounded-xl px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ListOrdered size={16} className="shrink-0 text-brand-400" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-3 py-1.5 text-white shadow-sm">
          <span className="text-[11px] font-medium opacity-85">คิวถัดไป</span>
          <span className="text-sm font-bold">
            {first.name}
            {myMemberId && first.id === myMemberId && " (คุณ)"}
          </span>
        </div>
        {rest.map((entry, i) => {
          const mine = myMemberId != null && entry.id === myMemberId;
          return (
            <span
              key={`${entry.id}-${i}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                mine
                  ? "border-brand-300 bg-brand-50 font-semibold text-brand-800"
                  : "border-stone-200/80 bg-white/70 text-stone-600"
              }`}
            >
              <span className="text-xs font-semibold text-stone-400">{i + 2}</span>
              {entry.name}
              {mine && " (คุณ)"}
            </span>
          );
        })}
        <span className="ml-auto hidden shrink-0 pl-2 text-xs text-stone-400 md:block">
          ระบบจ่ายอัตโนมัติตามลำดับนี้
        </span>
      </div>
    </section>
  );
}
