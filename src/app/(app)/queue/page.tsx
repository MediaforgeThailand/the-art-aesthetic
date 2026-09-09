import { ClipboardPlus, Eye } from "lucide-react";
import Link from "next/link";
import { Button, PageHeader } from "@/components/ui";
import {
  bangkokToday,
  getMembersWithStats,
  getMyAssignments,
  getRecentAssignments,
  getUnqueuedCases,
} from "@/lib/queue/data";
import { getQueueSession } from "@/lib/queue/session";
import { AssignmentList } from "./_components/assignment-list";
import { NextUpStrip } from "./_components/next-up";
import { AvailabilityDot, RankBadge, Stat } from "./_components/pieces";
import { UnqueuedList } from "./_components/unqueued-list";
import AvailabilityToggle from "./availability-toggle";

/** วันนี้แบบไทยสั้นๆ ไว้ใต้หัวข้อ เช่น "พฤหัสบดี 27 ส.ค. 2569" */
function todayLabel(): string {
  return new Date().toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/**
 * หน้าแรก แบ่งตามสิทธิ์ (RLS บังคับซ้ำที่ฐานข้อมูล)
 * - BC: เห็นเฉพาะเคสของตัวเอง กดรับทราบได้
 * - ผู้ดูอย่างเดียว: เห็นคิวทั้งทีมแบบอ่านอย่างเดียว ไม่ถูกจ่ายลูกค้าให้
 * - แอดมิน: เห็นทั้งทีม ปุ่มจัดการทั้งหมดอยู่หลังฟันเฟืองของแต่ละแถว
 */
export default async function QueuePage() {
  const session = await getQueueSession();
  if (!session) return null;
  const today = bangkokToday();

  if (!session.canViewAll) {
    const [rows, members] = await Promise.all([
      getMyAssignments(),
      getMembersWithStats(),
    ]);
    const me = members.find((m) => m.id === session.member?.id);
    const waiting = rows.filter((r) => r.status === "assigned").length;

    return (
      <>
        <PageHeader
          title="คิวของฉัน"
          description={todayLabel()}
          action={
            session.member ? (
              <AvailabilityToggle current={session.member.availability} />
            ) : undefined
          }
        />
        <NextUpStrip members={members} myMemberId={session.member?.id} />
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="วันนี้" value={me?.today ?? 0} />
          <Stat label="เดือนนี้" value={me?.month ?? 0} />
          <Stat label="รอรับทราบ" value={waiting} tone={waiting ? "warn" : "default"} />
        </div>
        <AssignmentList
          rows={rows}
          canAcknowledge
          todayKey={today}
          emptyText="ยังไม่มีคิวที่จ่ายให้คุณ"
        />
      </>
    );
  }

  const canManage = session.isAdmin;

  const [rows, members, unqueued] = await Promise.all([
    getRecentAssignments(),
    getMembersWithStats(),
    getUnqueuedCases(),
  ]);

  const active = members.filter((m) => m.is_active);
  // ผู้ดูอย่างเดียวไม่ได้อยู่ในรอบจ่ายคิว จึงไม่ต้องขึ้นในรายชื่อ "ทีมวันนี้"
  const roster = active.filter((m) => m.role !== "viewer");
  const eligible = active.filter((m) => m.queue_enabled);
  const todayCount = roster.reduce((sum, m) => sum + m.today, 0);
  const waitingAck = rows.filter((r) => r.status === "assigned").length;
  const pendingManual = rows.filter(
    (r) => r.status === "pending_manual_assignment"
  ).length;

  return (
    <>
      <PageHeader
        title="คิววันนี้"
        description={todayLabel()}
        action={
          canManage ? (
            <Link href="/queue/new">
              <Button>
                <ClipboardPlus size={16} /> วางข้อมูลลูกค้า
              </Button>
            </Link>
          ) : undefined
        }
      />

      {!canManage && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs text-stone-600">
          <Eye size={14} /> สิทธิ์ผู้ดูอย่างเดียว — เห็นคิวทั้งทีม แต่ไม่ได้รับคิวลูกค้า
        </p>
      )}

      <NextUpStrip
        members={members}
        myMemberId={session.member?.queue_enabled ? session.member.id : undefined}
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="แจกวันนี้" value={todayCount} />
        <Stat label="รอรับทราบ" value={waitingAck} tone={waitingAck ? "warn" : "default"} />
        <Stat
          label="รอจ่ายเอง"
          value={pendingManual}
          tone={pendingManual ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <AssignmentList
            rows={rows}
            canManage={canManage}
            myMemberId={session.member?.id}
            members={eligible.map((m) => ({ id: m.id, display_name: m.display_name }))}
            todayKey={today}
            emptyText="ยังไม่มีคิววันนี้"
          />

          {/* เคสประเภทอื่นไม่มีแถวคิว ถ้าไม่โชว์ตรงนี้จะบันทึกแล้วหาไม่เจอ */}
          {unqueued.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-1.5 text-sm font-semibold text-stone-800">
                เคสที่ไม่เข้าคิวรัน
              </h2>
              <UnqueuedList rows={unqueued} />
            </section>
          )}
        </div>

        <aside className="glass h-fit rounded-xl p-3 lg:sticky lg:top-20">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-800">ทีมวันนี้</h2>
            <Link href="/queue/team" className="text-xs text-brand-600 hover:underline">
              {canManage ? "จัดการ" : "ดูทีม"}
            </Link>
          </div>
          <ul className="space-y-1.5">
            {roster.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/60"
              >
                <AvailabilityDot availability={m.availability} />
                <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                  {m.display_name}
                </span>
                <RankBadge rank={m.rank} weight={m.weight} />
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-stone-700">
                  {m.today}
                </span>
              </li>
            ))}
            {roster.length === 0 && (
              <li className="px-2 py-3 text-sm text-stone-400">ยังไม่มีใครในทีม</li>
            )}
          </ul>
          <p className="mt-2 px-2 text-xs text-stone-400">ตัวเลขขวาสุด = คิวที่ได้วันนี้</p>
        </aside>
      </div>
    </>
  );
}
