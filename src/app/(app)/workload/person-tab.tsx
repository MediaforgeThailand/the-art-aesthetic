"use client";

/**
 * แท็บ "รายบุคคล" ของ Team Workload — เลือกคน แล้วดูงาน + ไฟล์ (media card) ของคนนั้น
 * ตามช่วงเวลาที่เลือก (7/14 วัน · 1 เดือน · เลือกช่วงเอง) พร้อมกราฟสรุปของคนนั้น
 *
 * "ของคนนั้น" ยึด **ผู้รับผิดชอบการ์ด** (`tasks.assignee_id`) เหมือนหน้า All Media
 */

import { CheckCircle2, CircleDashed, Images, ListTodo, MessageSquarePlus, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MediaGrid } from "@/components/media-grid";
import { Card, EmptyState, Input, Select } from "@/components/ui";
import { DEFAULT_REVISION_KIND, REVISION_KINDS } from "@/lib/constants";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import {
  MEDIA_RANGES,
  type MediaItem,
  type MediaRangeKey,
  rangeStart,
  thaiDayOf,
} from "@/lib/media";
import type { RevisionKind, TaskWithAssignee } from "@/lib/types";

type ProfileOption = { id: string; full_name: string | null; email: string | null };

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e7e5e4",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: 12,
};

function personName(p: ProfileOption): string {
  return p.full_name || p.email || "-";
}

function StatBox({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ListTodo;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
        <Icon size={13} className={tone} />
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">
        {formatNumber(value)}
      </p>
    </div>
  );
}

export function PersonTab({
  tasks,
  profiles,
  media,
  revisions,
  kpiSince,
  initialPersonId,
}: {
  tasks: TaskWithAssignee[];
  profiles: ProfileOption[];
  media: MediaItem[];
  revisions: {
    task_id: string;
    revision_kind: RevisionKind | null;
    created_at: string;
  }[];
  kpiSince: string;
  /** ค่าเริ่มต้น = ตัวผู้ใช้เอง; ไม่อยู่ในรายชื่อ (เช่นไม่มีโปรไฟล์) ตกไปที่คนแรก */
  initialPersonId: string | null;
}) {
  const today = todayISO();
  const [personId, setPersonId] = useState<string>(() =>
    initialPersonId && profiles.some((p) => p.id === initialPersonId)
      ? initialPersonId
      : (profiles[0]?.id ?? "")
  );
  const [range, setRange] = useState<MediaRangeKey>("1m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const person = profiles.find((p) => p.id === personId) ?? null;

  const dateWindow = useMemo(() => {
    const start = range === "custom" ? from || null : rangeStart(range, today);
    const end = range === "custom" ? to || null : null;
    return { start, end };
  }, [range, from, to, today]);

  const inWindow = (ts: string) => {
    const day = thaiDayOf(ts);
    if (dateWindow.start && day < dateWindow.start) return false;
    if (dateWindow.end && day > dateWindow.end) return false;
    return true;
  };

  /** งานของคนนี้ — งานทั้งหมดที่รับผิดชอบ (ไม่ตัดตามช่วง เพราะ "ค้างอยู่" ต้องเห็นครบ) */
  const myTasks = useMemo(
    () => tasks.filter((t) => t.assignee_id === personId),
    [tasks, personId]
  );

  const myMedia = useMemo(
    () =>
      media.filter((m) => m.assigneeId === personId && inWindow(m.uploadedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, personId, dateWindow.start, dateWindow.end]
  );

  /** ตีกลับของคนนี้ (นับตั้งแต่ kpiSince ที่ page ดึงมาแล้ว) แยกคำผิด/เพิ่มเติม */
  const rejectStats = useMemo(() => {
    const mine = new Set(myTasks.map((t) => t.id));
    let mistake = 0;
    let addition = 0;
    for (const r of revisions) {
      if (!mine.has(r.task_id)) continue;
      // ผู้สั่ง brief ขอแก้ก่อนส่งตรวจ — ไม่ใช่การตีกลับของผู้ตรวจจริง จึงไม่นับทั้งสองช่อง
      if (r.revision_kind === "brief") continue;
      if (REVISION_KINDS[r.revision_kind ?? DEFAULT_REVISION_KIND].countsAsError) {
        mistake += 1;
      } else {
        addition += 1;
      }
    }
    return { mistake, addition };
  }, [revisions, myTasks]);

  /** กราฟ: จำนวนไฟล์ที่อัพต่อวันในช่วงที่เลือก — เห็นจังหวะการส่งงานของคนนั้น */
  const chartData = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const m of myMedia) {
      const d = thaiDayOf(m.uploadedAt);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => ({ day: formatDate(day), count }));
  }, [myMedia]);

  const stats = {
    total: myTasks.length,
    pending: myTasks.filter((t) => !t.completed).length,
    done: myTasks.filter((t) => t.completed).length,
  };

  if (profiles.length === 0) {
    return <EmptyState title="ยังไม่มีสมาชิกในทีม" />;
  }

  return (
    <div className="space-y-5">
      {/* ตัวเลือกคน + ช่วงเวลา */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            aria-label="เลือกคน"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            aria-label="ช่วงเวลา"
            value={range}
            onChange={(e) => setRange(e.target.value as MediaRangeKey)}
          >
            {MEDIA_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        {range === "custom" && (
          <>
            <div className="w-40">
              <Input
                type="date"
                aria-label="ตั้งแต่วันที่"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="w-40">
              <Input
                type="date"
                aria-label="ถึงวันที่"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {/* สรุปของคนที่เลือก */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatBox icon={ListTodo} label="งานทั้งหมด" value={stats.total} tone="text-brand-600" />
        <StatBox icon={CircleDashed} label="ค้างอยู่" value={stats.pending} tone="text-stone-500" />
        <StatBox icon={CheckCircle2} label="เสร็จแล้ว" value={stats.done} tone="text-emerald-600" />
        <StatBox
          icon={XCircle}
          label="คำผิด"
          value={rejectStats.mistake}
          tone="text-rose-600"
        />
        <StatBox
          icon={MessageSquarePlus}
          label="เพิ่มเติม"
          value={rejectStats.addition}
          tone="text-sky-600"
        />
        <StatBox
          icon={Images}
          label="ไฟล์ในช่วงนี้"
          value={myMedia.length}
          tone="text-violet-600"
        />
      </div>
      <p className="text-[11px] text-stone-400">
        คำผิด/เพิ่มเติม นับตั้งแต่ {formatDate(kpiSince.slice(0, 10))} เป็นต้นไป
        (จุดที่เริ่มนับ KPI ใหม่)
      </p>

      {/* กราฟการส่งงานของคนนี้ */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-stone-900">
          ไฟล์ที่อัพโหลดต่อวัน{person ? ` — ${personName(person)}` : ""}
        </h3>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">
            ไม่มีไฟล์ในช่วงเวลาที่เลือก
          </p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [
                    `${formatNumber(Number(value))} ไฟล์`,
                    "อัพโหลด",
                  ]}
                />
                <Bar dataKey="count" fill="#a96a58" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* media card ของคนที่เลือก */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900">
          <Images size={15} className="text-brand-600" />
          ไฟล์งานของ {person ? personName(person) : "-"} (
          {formatNumber(myMedia.length)} ไฟล์)
        </h3>
        <MediaGrid
          items={myMedia}
          nameOf={() => (person ? personName(person) : "-")}
          emptyLabel="ยังไม่มีไฟล์ของคนนี้ในช่วงเวลาที่เลือก"
        />
      </div>
    </div>
  );
}
