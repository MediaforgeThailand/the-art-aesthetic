"use client";

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BellRing,
  CheckCircle2,
  FileSignature,
  Phone,
  PhoneCall,
  Timer,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";
import {
  contractEndDate,
  INFLU_SIZE_GROUP_ORDER,
  INFLU_SIZE_GROUPS,
  INFLU_STAGES,
  INFLU_TIERS,
  sizeGroupFromFollowers,
} from "@/lib/influ-constants";
import type { InfluencerRow, InfluSizeGroup, InfluTaskRow } from "@/lib/types";

/** แถว influencer สำหรับหน้า list — ตัด procedure_history ออก
    (jsonb เก็บลายเซน base64 ก้อนใหญ่ ~10-30KB/รายการ หน้า list ไม่ได้ใช้ เลยไม่ต้อง fetch) */
export type InfluencerListRow = Omit<InfluencerRow, "procedure_history">;

export function influName(i: InfluencerListRow): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

export type InfluTaskLite = Pick<
  InfluTaskRow,
  "influencer_id" | "due_date" | "done" | "done_at"
>;

/** สถิติ follow up ต่อ influ: งานเกินกำหนด, กำหนดถัดไป, follow ล่าสุด */
export type InfluStats = {
  overdue: number;
  nextDue: string | null;
  lastDone: string | null;
  pending: number;
};

/** วันที่ตามปฏิทินไทยของ timestamptz (YYYY-MM-DD) —
    กัน done_at ช่วง 00:00-07:00 น. ที่ .slice(0,10) แบบ UTC จะเพี้ยนไปเป็นวันก่อนหน้า */
export const thaiDateISO = (timestamp: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(timestamp)
  );

const dayDiff = (dateISO: string, today: string) =>
  Math.round(
    (new Date(dateISO).getTime() - new Date(today).getTime()) / 86400000
  );

/** กลุ่มขนาดที่การ์ดอยู่จริง — override ที่ลากไว้ชนะ, ไม่มีก็จัดอัตโนมัติจาก followers */
export const effectiveSizeGroup = (i: InfluencerListRow): InfluSizeGroup =>
  i.size_group ?? sizeGroupFromFollowers(i.followers);

/** ลำดับการ์ดในคอลัมน์ — board_position ที่ลากไว้ชนะ; ยังไม่เคยลาก = ใหม่ก่อน
    (fallback ต้องเป็นสูตรเดียวกันทุกที่ เพื่อให้ midpoint ตอนลากคำนวณถูก) */
export const boardPos = (i: InfluencerListRow): number =>
  i.board_position ?? -Date.parse(i.created_at) / 1000;

/** ยอดผู้ติดตามแบบย่อ — 12,300 → 12K · 1,500,000 → 1.5M */
function compactFollowers(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 || Number.isInteger(m) ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return formatNumber(n);
}

/* ---------- ชิปเตือนบนการ์ด ---------- */

/** ชิป countdown แจ้งเตือน follow up — 2 สัปดาห์ / 1 สัปดาห์ / 3,2,1 วัน / เกินกำหนด */
function FollowupCountdownChip({
  daysUntil,
  overdueCount,
}: {
  daysUntil: number;
  overdueCount: number;
}) {
  if (daysUntil < 0) {
    return (
      <Badge className="border border-rose-300 bg-rose-100 font-semibold text-rose-700 animate-fade-in">
        <BellRing size={11} /> เกินกำหนด {Math.abs(daysUntil)} วัน
        {overdueCount > 1 && ` (${overdueCount} งาน)`}
      </Badge>
    );
  }
  if (daysUntil === 0) {
    return (
      <Badge className="border border-rose-300 bg-rose-50 font-semibold text-rose-600">
        <BellRing size={11} /> Follow up วันนี้
      </Badge>
    );
  }
  if (daysUntil <= 3) {
    return (
      <Badge className="border border-amber-300 bg-amber-100 font-semibold text-amber-800">
        <BellRing size={11} /> Follow up อีก {daysUntil} วัน
      </Badge>
    );
  }
  if (daysUntil <= 7) {
    return (
      <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
        <Timer size={11} /> อีก {daysUntil} วัน
      </Badge>
    );
  }
  if (daysUntil <= 14) {
    return (
      <Badge className="border border-sky-200 bg-sky-50 text-sky-700">
        <Timer size={11} /> อีก {daysUntil} วัน
      </Badge>
    );
  }
  return null;
}

/** ชิปอายุสัญญา — เขียวปกติ / เหลือง ≤30 วัน / แดงหมดแล้ว */
function ContractChip({
  contractStart,
  months,
  today,
}: {
  contractStart: string;
  months: number;
  today: string;
}) {
  const end = contractEndDate(contractStart, months);
  const daysLeft = dayDiff(end, today);
  if (daysLeft < 0) {
    return (
      <Badge className="border border-rose-200 bg-rose-50 text-rose-600">
        <FileSignature size={11} /> สัญญาหมดแล้ว
      </Badge>
    );
  }
  return (
    <span title={`สัญญาถึง ${formatDate(end)}`}>
      <Badge
        className={
          daysLeft <= 30
            ? "border border-amber-200 bg-amber-50 text-amber-700"
            : "border border-emerald-200 bg-emerald-50 text-emerald-700"
        }
      >
        <FileSignature size={11} /> สัญญาเหลือ {formatNumber(daysLeft)} วัน
      </Badge>
    </span>
  );
}

/* ---------- เนื้อการ์ด ----------
   โทนสีแยกสถานะชัดเจน:
   · ติดต่ออยู่ (stage 1 — ยังไม่ตอบรับ) = พื้นหม่น เส้นประ + ชิปเหลือง "รอตอบรับ"
   · ตอบรับแล้ว (stage 2 ขึ้นไป)        = พื้นขาว แถบซ้ายเขียว + ชิปเขียว "ตอบรับแล้ว"
   · จบงานแล้ว                           = พื้นเขียวอ่อนทั้งใบ */

export function InfluCardContent({
  influ: i,
  stats,
  today,
  overlay = false,
  deleting = false,
  onDelete,
}: {
  influ: InfluencerListRow;
  stats: InfluStats | undefined;
  today: string;
  /** true = การ์ดลอยใน DragOverlay ระหว่างลาก */
  overlay?: boolean;
  deleting?: boolean;
  onDelete?: (influ: InfluencerListRow) => void;
}) {
  const accepted = i.completed || i.stage >= 2;
  const stageInfo = INFLU_STAGES.find((s) => s.step === i.stage);
  const nextDueDays =
    !i.completed && i.stage === 6 && stats?.nextDue
      ? dayDiff(stats.nextDue, today)
      : null;
  const daysSinceDone =
    stats?.lastDone != null
      ? Math.max(0, -dayDiff(thaiDateISO(stats.lastDone), today))
      : null;
  const showFollowedChip =
    !i.completed &&
    i.stage === 6 &&
    (nextDueDays === null || nextDueDays > 14) &&
    daysSinceDone !== null;
  const movedManually =
    i.size_group !== null && i.size_group !== sizeGroupFromFollowers(i.followers);

  const tone = i.completed
    ? "border border-emerald-300/80 bg-emerald-50/80"
    : accepted
      ? "border border-emerald-300/70 border-l-4 border-l-emerald-400 bg-white"
      : "border-2 border-dashed border-stone-300/90 bg-stone-100/70";

  return (
    <div
      className={`rounded-xl p-3.5 shadow-sm transition-shadow duration-200 hover:shadow-md ${tone} ${
        overlay ? "rotate-1 shadow-2xl ring-2 ring-brand-300" : ""
      }`}
    >
      {/* แถวบน: avatar + ชื่อ + ยอดผู้ติดตาม/เบอร์ + ปุ่มลบ */}
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b text-sm font-semibold text-cream ${
            accepted
              ? "from-brand-400 to-brand-600"
              : "from-stone-300 to-stone-400"
          }`}
        >
          {i.first_name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-medium ${
              accepted ? "text-stone-900" : "text-stone-600"
            }`}
          >
            {influName(i)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
            {i.followers !== null && (
              <span className="inline-flex items-center gap-1 font-medium text-stone-600">
                <UsersRound size={11} /> {compactFollowers(i.followers)}
              </span>
            )}
            {i.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={11} /> {i.phone}
              </span>
            )}
          </p>
        </div>
        {onDelete && (
          <button
            type="button"
            title="ลบ Influencer"
            aria-label={`ลบ ${influName(i)}`}
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(i);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="-mr-1.5 -mt-1.5 shrink-0 cursor-pointer rounded-lg p-1.5 text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-90 disabled:opacity-40"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* สถานะตอบรับ + tier */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {i.completed ? (
          <Badge className="border border-emerald-300 bg-emerald-100 font-semibold text-emerald-700">
            <CheckCircle2 size={11} /> จบงานแล้ว
          </Badge>
        ) : accepted ? (
          <Badge className="border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700">
            <CheckCircle2 size={11} /> ตอบรับแล้ว · {i.stage}.{" "}
            {stageInfo?.short ?? ""}
          </Badge>
        ) : (
          <Badge className="border border-amber-300 bg-amber-100 font-semibold text-amber-800">
            <PhoneCall size={11} /> ติดต่ออยู่ · รอตอบรับ
          </Badge>
        )}
        {i.tier && (
          <Badge className={INFLU_TIERS[i.tier].badge}>
            {INFLU_TIERS[i.tier].label}
          </Badge>
        )}
        {movedManually && (
          <span title="การ์ดถูกลากย้ายกลุ่มเอง ไม่ตรงกับกลุ่มอัตโนมัติจากยอดผู้ติดตาม — ลากกลับกลุ่มเดิมเพื่อให้จัดอัตโนมัติอีกครั้ง">
            <Badge className="border border-stone-200 bg-white/80 text-stone-400">
              ย้ายกลุ่มเอง
            </Badge>
          </span>
        )}
      </div>

      {i.procedure_text && (
        <p className="mt-1.5 truncate text-xs text-stone-500">
          {i.procedure_text}
        </p>
      )}

      {/* ชิปเตือน follow up / follow แล้ว / อายุสัญญา */}
      {((!i.completed && nextDueDays !== null) ||
        showFollowedChip ||
        i.contract_start !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {!i.completed && nextDueDays !== null && (
            <FollowupCountdownChip
              daysUntil={nextDueDays}
              overdueCount={stats?.overdue ?? 0}
            />
          )}
          {showFollowedChip && (
            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={11} /> follow แล้ว ·{" "}
              {daysSinceDone === 0 ? "วันนี้" : `${daysSinceDone} วันก่อน`}
            </Badge>
          )}
          {i.contract_start && (
            <ContractChip
              contractStart={i.contract_start}
              months={i.contract_months}
              today={today}
            />
          )}
        </div>
      )}

      {/* stepper จิ๋ว 6 stage */}
      <div className="mt-2.5 flex items-center gap-1">
        {INFLU_STAGES.map((s) => (
          <span
            key={s.step}
            title={s.title}
            className={`h-1.5 flex-1 rounded-full ${
              i.completed || i.stage > s.step
                ? "bg-emerald-400"
                : i.stage === s.step
                  ? "bg-gradient-to-r from-brand-400 to-brand-600"
                  : "bg-stone-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- การ์ดแบบลากได้ ---------- */

function SortableInfluCard({
  influ,
  stats,
  today,
  deleting,
  onClick,
  onDelete,
}: {
  influ: InfluencerListRow;
  stats: InfluStats | undefined;
  today: string;
  deleting: boolean;
  onClick: () => void;
  onDelete: (influ: InfluencerListRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: influ.id, data: { type: "influ" } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onKeyDown={(e) => {
        // ส่งต่อให้ dnd-kit KeyboardSensor ก่อน (Space = ยก/วางการ์ด) แล้วค่อยจัดการ Enter เอง
        (listeners?.onKeyDown as React.KeyboardEventHandler | undefined)?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`เปิดหน้าเดินงานของ ${influName(influ)}`}
      className={`touch-manipulation cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <InfluCardContent
        influ={influ}
        stats={stats}
        today={today}
        deleting={deleting}
        onDelete={onDelete}
      />
    </div>
  );
}

/* ---------- คอลัมน์กลุ่มขนาด ---------- */

function BoardColumn({
  group,
  influs,
  statsByInflu,
  today,
  highlight,
  deletingId,
  onCardClick,
  onDelete,
}: {
  group: InfluSizeGroup;
  influs: InfluencerListRow[];
  statsByInflu: Map<string, InfluStats>;
  today: string;
  highlight: boolean;
  deletingId: string | null;
  onCardClick: (influ: InfluencerListRow) => void;
  onDelete: (influ: InfluencerListRow) => void;
}) {
  const meta = INFLU_SIZE_GROUPS[group];
  const { setNodeRef } = useDroppable({
    id: `col:${group}`,
    data: { type: "col", group },
  });

  return (
    <div
      className={`flex min-w-0 flex-col rounded-xl transition-colors duration-200 ${
        highlight
          ? "border border-brand-300/60 bg-brand-100/50 ring-2 ring-brand-300 backdrop-blur-md"
          : "glass-soft"
      }`}
    >
      <div className="flex items-center gap-2 px-4 pb-1.5 pt-3.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
        <span className={`text-sm font-semibold ${meta.headerText}`}>
          {meta.label}
        </span>
        <span className="truncate text-xs text-stone-400">{meta.range}</span>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-500 shadow-sm">
          {influs.length}
        </span>
      </div>

      <div ref={setNodeRef} className="min-h-[140px] space-y-2.5 px-3 pb-3 pt-1">
        <SortableContext
          items={influs.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {influs.length === 0 && (
            <div
              className={`flex items-center justify-center rounded-lg border-2 border-dashed py-12 text-xs transition-colors duration-200 ${
                highlight
                  ? "border-brand-300 text-brand-500"
                  : "border-stone-200 text-stone-300"
              }`}
            >
              วางการ์ดที่นี่
            </div>
          )}
          {influs.map((i) => (
            <SortableInfluCard
              key={i.id}
              influ={i}
              stats={statsByInflu.get(i.id)}
              today={today}
              deleting={deletingId === i.id}
              onClick={() => onCardClick(i)}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

/* ---------- บอร์ด 3 คอลัมน์ (เล็ก / กลาง / ใหญ่) ---------- */

export function InfluBoard({
  items,
  statsByInflu,
  today,
  deletingId,
  onOpen,
  onDelete,
  onMove,
}: {
  /** รายชื่อหลังกรอง (ค้นหา/stage) แล้ว — บอร์ดจัดกลุ่ม+เรียงเอง */
  items: InfluencerListRow[];
  statsByInflu: Map<string, InfluStats>;
  today: string;
  deletingId: string | null;
  onOpen: (influ: InfluencerListRow) => void;
  onDelete: (influ: InfluencerListRow) => void;
  /** ลากวางเสร็จ — ย้ายกลุ่ม/เรียงลำดับ (prev/next = เพื่อนบ้านใหม่ในคอลัมน์ปลายทาง) */
  onMove: (
    id: string,
    group: InfluSizeGroup,
    prevId: string | null,
    nextId: string | null
  ) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [order, setOrder] = useState<Record<InfluSizeGroup, string[]> | null>(
    null
  );
  const [overGroup, setOverGroup] = useState<InfluSizeGroup | null>(null);
  const suppressClickRef = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Space = ยก/วางการ์ดด้วยคีย์บอร์ด — เว้น Enter ไว้สำหรับเปิดหน้าเดินงาน
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const itemById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  const baseOrder = useMemo(() => {
    const m: Record<InfluSizeGroup, string[]> = { s: [], m: [], l: [] };
    for (const i of [...items].sort((a, b) => boardPos(a) - boardPos(b))) {
      m[effectiveSizeGroup(i)].push(i.id);
    }
    return m;
  }, [items]);

  const currentOrder = order ?? baseOrder;

  const findGroup = (
    id: string,
    o: Record<InfluSizeGroup, string[]>
  ): InfluSizeGroup | null =>
    INFLU_SIZE_GROUP_ORDER.find((g) => o[g].includes(id)) ?? null;

  const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : rectIntersection(args);
  };

  const releaseClickSuppression = () => {
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleDragStart = (event: DragStartEvent) => {
    suppressClickRef.current = true;
    setActiveId(String(event.active.id));
    setOrder(baseOrder);
  };

  const resolveOverGroup = (
    over: DragOverEvent["over"]
  ): InfluSizeGroup | null => {
    if (!over) return null;
    const data = over.data.current;
    if (data?.type === "influ") {
      return findGroup(String(over.id), order ?? baseOrder);
    }
    if (data?.type === "col") return (data.group as InfluSizeGroup) ?? null;
    return null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const activeInflu = String(event.active.id);
    const target = resolveOverGroup(event.over);
    setOverGroup(target);
    if (!target) return;

    setOrder((prev) => {
      const o = prev ?? baseOrder;
      const source = findGroup(activeInflu, o);
      if (!source || source === target) return prev;
      const dst = [...o[target]];
      let insertAt = dst.length;
      if (event.over?.data.current?.type === "influ") {
        const idx = dst.indexOf(String(event.over.id));
        if (idx >= 0) insertAt = idx;
      }
      dst.splice(insertAt, 0, activeInflu);
      return {
        ...o,
        [source]: o[source].filter((id) => id !== activeInflu),
        [target]: dst,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    releaseClickSuppression();
    const o = order ?? baseOrder;
    const id = String(active.id);
    setActiveId(null);
    setOverGroup(null);
    setOrder(null);

    const container = findGroup(id, o);
    if (!container) return;

    let arr = o[container];
    if (over && over.data.current?.type === "influ") {
      const overId = String(over.id);
      if (findGroup(overId, o) === container && overId !== id) {
        arr = arrayMove(arr, arr.indexOf(id), arr.indexOf(overId));
      }
    }

    // ไม่มีอะไรเปลี่ยน (คอลัมน์เดิม ลำดับเดิม) — ไม่ต้องยิง DB
    if (baseOrder[container].join("\n") === arr.join("\n")) return;

    const idx = arr.indexOf(id);
    onMove(
      id,
      container,
      idx > 0 ? arr[idx - 1] : null,
      idx < arr.length - 1 ? arr[idx + 1] : null
    );
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverGroup(null);
    setOrder(null);
    // ยกเลิกด้วย Esc: ปุ่มเมาส์อาจยังกดค้าง — กัน click ที่จะตามมาหลังปล่อย
    window.addEventListener("pointerup", releaseClickSuppression, {
      once: true,
    });
    window.setTimeout(releaseClickSuppression, 350);
  };

  const handleCardClick = (influ: InfluencerListRow) => {
    if (suppressClickRef.current) return;
    onOpen(influ);
  };

  const activeInflu = activeId ? itemById.get(activeId) : undefined;

  return (
    <DndContext
      id="influ-board-dnd"
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* จอแคบ: คอลัมน์เรียงลงมา (ลากข้ามกลุ่มยังได้ด้วยการลากลง/ขึ้น) */}
      <div className="grid grid-cols-1 items-start gap-4 animate-fade-in-up md:grid-cols-3">
        {INFLU_SIZE_GROUP_ORDER.map((g) => {
          const ids = currentOrder[g];
          const influs = ids
            .map((id) => itemById.get(id))
            .filter((i): i is InfluencerListRow => i !== undefined);
          return (
            <BoardColumn
              key={g}
              group={g}
              influs={influs}
              statsByInflu={statsByInflu}
              today={today}
              highlight={activeId !== null && overGroup === g}
              deletingId={deletingId}
              onCardClick={handleCardClick}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeInflu && (
          <InfluCardContent
            influ={activeInflu}
            stats={statsByInflu.get(activeInflu.id)}
            today={today}
            overlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
