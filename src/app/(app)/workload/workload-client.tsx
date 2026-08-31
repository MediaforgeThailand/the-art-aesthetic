"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  ExternalLink,
  ListTodo,
  PieChart as PieChartIcon,
  SlidersHorizontal,
  Tags,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DemoBadge, DemoBanner } from "@/components/demo-badge";
import { Badge, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import {
  DEFAULT_REVISION_KIND,
  REVISION_KINDS,
  TASK_PRIORITY,
  taskCategoryChipClass,
} from "@/lib/constants";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import type { MediaItem } from "@/lib/media";
import type {
  ProfileRow,
  RevisionKind,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import { PersonTab } from "./person-tab";

type ProfileOption = Pick<ProfileRow, "id" | "full_name" | "email">;

const PENDING_COLOR = "#a8a29e";
const DONE_COLOR = "#10b981";
const SECTION_PALETTE = [
  "#a8a29e",
  "#0ea5e9",
  "#10b981",
  "#a96a58",
  "#f59e0b",
  "#8b5cf6",
  "#cd9a86",
  "#64748b",
];

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e7e5e4",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: 12,
};

function displayName(p: {
  full_name: string | null;
  email: string | null;
}): string {
  return p.full_name || p.email || "-";
}

function isOverdue(t: TaskWithAssignee, today: string): boolean {
  return t.due_date !== null && !t.completed && t.due_date.slice(0, 10) < today;
}

interface PersonStat {
  key: string;
  name: string;
  email: string | null;
  total: number;
  pending: number;
  done: number;
  overdue: number;
  /** ตีกลับแบบ "คำผิด" บนงานของคนนี้ในเดือนปัจจุบัน — ตัวเลข KPI ข้อผิดพลาดจริง */
  revisions: number;
  /** ตีกลับแบบ "เพิ่มเติม" (ผู้ตรวจขอให้ปรับเพื่อคุมคุณภาพ) — แสดงคู่กันแต่ไม่นับเป็นข้อผิดพลาด */
  additions: number;
}

/* ---------- ส่วนประกอบย่อย ---------- */

function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  demo,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: number;
  demo: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon size={19} />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-stone-500">
            {label}
            {demo && <DemoBadge />}
          </p>
          <p className="text-xl font-semibold tabular-nums text-stone-900">
            {formatNumber(value)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  demo,
}: {
  icon: LucideIcon;
  title: string;
  demo: boolean;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon size={16} className="text-brand-600" />
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      {demo && <DemoBadge />}
    </div>
  );
}

/* ---------- หน้า Workload ---------- */

export function WorkloadClient({
  tasks,
  profiles,
  sections,
  monthRevisions,
  kpiSince,
  media,
  userId,
}: {
  tasks: TaskWithAssignee[];
  profiles: ProfileOption[];
  sections: TaskSectionRow[];
  /** การตีกลับของเดือนนี้ (เวลาไทย) — นับต่อคนจาก task ที่ตนรับผิดชอบ
      revision_kind: mistake = ข้อผิดพลาด (นับ KPI) · addition = ขอเพิ่มเติม (ไม่นับ)
      null = แถวก่อน migration 0063 ถือเป็นคำผิดตามเดิม */
  monthRevisions: {
    task_id: string;
    revision_kind: RevisionKind | null;
    created_at: string;
  }[];
  /** จุดเริ่มนับ KPI การตีกลับ (app_settings.kpi_reset_at) — ผู้ใช้สั่งรีเซ็ตตัวนับ 2026-08-08 */
  kpiSince: string;
  /** ไฟล์ทั้งหมดของงาน — แท็บ "รายบุคคล" แสดงเป็น media card ของคนที่เลือก */
  media: MediaItem[];
  /** ผู้ใช้ที่ล็อกอินอยู่ — แท็บรายบุคคลเปิดมาที่ตัวเองก่อน */
  userId: string | null;
}) {
  const today = todayISO();
  const hasDemo = tasks.some((t) => t.description === "demo");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** แท็บ: ภาพรวมทีม | รายบุคคล (งาน + ไฟล์ของคนที่เลือก) */
  const [tab, setTab] = useState<"team" | "person">("team");

  /* ---- ตัวกรอง — เลือกดู performance เฉพาะกลุ่ม (คน / section / หมวดหมู่ / สถานะ) ---- */
  const [personFilter, setPersonFilter] = useState<string>("all"); // all | none | <profileId>
  const [sectionFilter, setSectionFilter] = useState<string>("all"); // all | none | <sectionId>
  const [categoryFilter, setCategoryFilter] = useState<string>("all"); // all | <category>
  const [statusFilter, setStatusFilter] = useState<string>("all"); // all | pending | done | overdue

  // ตัวเลือกหมวดหมู่ + มีงานไร้ section ไหม — คิดจากงานทั้งหมดเพื่อให้ตัวเลือกคงที่
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) set.add(t.category?.trim() || "ทั่วไป");
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }, [tasks]);
  const hasOrphanSection = useMemo(
    () =>
      tasks.some(
        (t) => !t.section_id || !sections.some((s) => s.id === t.section_id)
      ),
    [tasks, sections]
  );

  const hasFilter =
    personFilter !== "all" ||
    sectionFilter !== "all" ||
    categoryFilter !== "all" ||
    statusFilter !== "all";

  const clearFilters = () => {
    setPersonFilter("all");
    setSectionFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  // ชุดงานหลังกรอง — เป็นฐานของ KPI/กราฟ/ตารางทั้งหมด
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (personFilter === "none") {
        if (t.assignee_id !== null) return false;
      } else if (personFilter !== "all" && t.assignee_id !== personFilter) {
        return false;
      }
      if (sectionFilter !== "all") {
        const known =
          t.section_id && sections.some((s) => s.id === t.section_id);
        const bucket = known ? t.section_id : "none";
        if (bucket !== sectionFilter) return false;
      }
      if (categoryFilter !== "all") {
        if ((t.category?.trim() || "ทั่วไป") !== categoryFilter) return false;
      }
      if (statusFilter === "pending" && t.completed) return false;
      if (statusFilter === "done" && !t.completed) return false;
      if (statusFilter === "overdue" && !isOverdue(t, today)) return false;
      return true;
    });
  }, [tasks, personFilter, sectionFilter, categoryFilter, statusFilter, sections, today]);

  /* ---- ภาพรวม ---- */
  const summary = useMemo(
    () => ({
      total: filteredTasks.length,
      pending: filteredTasks.filter((t) => !t.completed).length,
      done: filteredTasks.filter((t) => t.completed).length,
      overdue: filteredTasks.filter((t) => isOverdue(t, today)).length,
    }),
    [filteredTasks, today]
  );

  /* ---- donut: งานตาม section ---- */
  const sectionData = useMemo(() => {
    const rows = sections.map((s, i) => ({
      key: s.id,
      name: s.name,
      value: filteredTasks.filter((t) => t.section_id === s.id).length,
      color: SECTION_PALETTE[i % SECTION_PALETTE.length],
    }));
    const orphan = filteredTasks.filter(
      (t) => !t.section_id || !sections.some((s) => s.id === t.section_id)
    ).length;
    if (orphan > 0) {
      rows.push({
        key: "none",
        name: "ไม่มี section",
        value: orphan,
        color: "#d6d3d1",
      });
    }
    return rows.filter((r) => r.value > 0);
  }, [filteredTasks, sections]);
  const sectionTotal = sectionData.reduce((sum, d) => sum + d.value, 0);

  /* ---- งานตามหมวดหมู่ (stack เสร็จ/ค้าง) ---- */
  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; pending: number; done: number }>();
    for (const t of filteredTasks) {
      const key = t.category?.trim() || "ทั่วไป";
      const row = map.get(key) ?? { name: key, pending: 0, done: 0 };
      if (t.completed) row.done += 1;
      else row.pending += 1;
      map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) => b.pending + b.done - (a.pending + a.done)
    );
  }, [filteredTasks]);

  /* ---- Stats รายบุคคล ---- */
  const personStats = useMemo<PersonStat[]>(() => {
    const rows: PersonStat[] = profiles.map((p) => ({
      key: p.id,
      name: displayName(p),
      email: p.email,
      total: 0,
      pending: 0,
      done: 0,
      overdue: 0,
      revisions: 0,
      additions: 0,
    }));
    const unassigned: PersonStat = {
      key: "none",
      name: "ไม่ระบุผู้รับผิดชอบ",
      email: null,
      total: 0,
      pending: 0,
      done: 0,
      overdue: 0,
      revisions: 0,
      additions: 0,
    };
    const byId = new Map(rows.map((r) => [r.key, r]));

    for (const t of filteredTasks) {
      // ?? ไม่ใช่ || เพราะ (id && get(id)) คืนตัว id เองเมื่อ id ว่าง — ค่าที่มาจาก prop
      // ซึ่งถูก freeze ทำให้ compiler มองว่าเรากำลังแก้ของที่แก้ไม่ได้ (react-hooks/immutability)
      const row = (t.assignee_id ? byId.get(t.assignee_id) : undefined) ?? unassigned;
      row.total += 1;
      if (t.completed) row.done += 1;
      else row.pending += 1;
      if (isOverdue(t, today)) row.overdue += 1;
    }

    // นับการตีกลับเดือนนี้ต่อคน — ผูกกับผู้รับผิดชอบของ task ที่ถูกตีกลับ
    // เฉพาะงานที่อยู่ในชุดหลังกรอง (งานที่ถูกกรองออกไม่นับ)
    const assigneeById = new Map(filteredTasks.map((t) => [t.id, t.assignee_id]));
    for (const r of monthRevisions) {
      if (!assigneeById.has(r.task_id)) continue;
      // การขอแก้ของ "ผู้สั่ง brief" เป็นการคุยกันก่อนส่งตรวจจริง — ไม่เข้า KPI ทั้งสองช่อง
      if (r.revision_kind === "brief") continue;
      const assigneeId = assigneeById.get(r.task_id) ?? null;
      const row = (assigneeId ? byId.get(assigneeId) : undefined) ?? unassigned;
      // "เพิ่มเติม" เป็นคำแนะนำเพื่อคุมคุณภาพ ไม่ใช่ความผิด — แยกช่องไม่ปนกับ KPI ข้อผิดพลาด
      if (REVISION_KINDS[r.revision_kind ?? DEFAULT_REVISION_KIND].countsAsError) {
        row.revisions += 1;
      } else {
        row.additions += 1;
      }
    }

    const result = [...rows];
    if (unassigned.total > 0 || unassigned.revisions > 0 || unassigned.additions > 0) {
      result.push(unassigned);
    }
    return result.sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, "th")
    );
  }, [filteredTasks, profiles, today, monthRevisions]);

  // แถวที่แสดงในตาราง — เมื่อเจาะจงคน ให้เหลือเฉพาะคนนั้น เพื่อโฟกัส performance รายคน
  const visibleStats = useMemo(
    () =>
      personFilter === "all"
        ? personStats
        : personStats.filter((p) => p.key === personFilter),
    [personStats, personFilter]
  );

  /* ---- งานค้างของคนที่เลือก ---- */
  const selected = visibleStats.find((p) => p.key === selectedKey) ?? null;
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? "-";
  const selectedTasks = useMemo(() => {
    if (!selectedKey) return [];
    return filteredTasks
      .filter(
        (t) =>
          !t.completed &&
          (selectedKey === "none"
            ? t.assignee_id === null
            : t.assignee_id === selectedKey)
      )
      .sort((a, b) => {
        const ao = isOverdue(a, today) ? 0 : 1;
        const bo = isOverdue(b, today) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return (a.due_date ?? "9999-99-99").localeCompare(
          b.due_date ?? "9999-99-99"
        );
      });
  }, [filteredTasks, selectedKey, today]);

  if (tasks.length === 0) {
    return (
      <div>
        <PageHeader
          title="Team Workload"
          description="ภาพรวมภาระงานและผลงานรายบุคคลของแผนก"
        />
        <Card>
          <EmptyState
            icon={<Users size={40} strokeWidth={1.5} />}
            title="ยังไม่มีงานในระบบ"
            description="เพิ่มงานและมอบหมายผู้รับผิดชอบก่อน แล้วสถิติจะแสดงที่นี่"
            action={
              <Link
                href="/tasks"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-cream shadow-sm transition-all duration-200 hover:from-brand-600 hover:to-brand-700 hover:shadow-md active:scale-[0.97]"
              >
                <ClipboardList size={16} />
                ไปที่บอร์ดงาน
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Team Workload"
        description="ภาพรวมภาระงานและผลงานรายบุคคลของแผนก"
      />

      {hasDemo && <DemoBanner onWhat="งานบางส่วน" />}

      {/* แท็บ: ภาพรวมทั้งทีม / เจาะรายคน (งาน + ไฟล์) */}
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            { key: "team" as const, label: "ภาพรวมทีม" },
            { key: "person" as const, label: "รายบุคคล" },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
              tab === t.key
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
                : "border border-stone-200 bg-white/60 text-stone-600 hover:bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "person" && (
        <PersonTab
          tasks={tasks}
          profiles={profiles}
          media={media}
          revisions={monthRevisions}
          kpiSince={kpiSince}
          initialPersonId={userId}
        />
      )}

      {tab === "team" && (
      <>
      {/* ตัวกรอง — เจาะดู performance เฉพาะกลุ่ม (คน / section / หมวดหมู่ / สถานะ) */}
      <div className="mb-6 flex flex-wrap items-center gap-3 animate-fade-in-up">
        <div className="flex items-center gap-1.5 text-sm text-stone-500">
          <SlidersHorizontal size={15} className="text-brand-600" />
          <span className="font-medium">ตัวกรอง</span>
        </div>
        <div className="w-48">
          <Select
            aria-label="กรองตามผู้รับผิดชอบ"
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
          >
            <option value="all">ผู้รับผิดชอบ: ทั้งทีม</option>
            <option value="none">ไม่ระบุผู้รับผิดชอบ</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            aria-label="กรองตาม section"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="all">Section: ทั้งหมด</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {hasOrphanSection && <option value="none">ไม่มี section</option>}
          </Select>
        </div>
        <div className="w-44">
          <Select
            aria-label="กรองตามหมวดหมู่"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">หมวดหมู่: ทั้งหมด</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            aria-label="กรองตามสถานะ"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">สถานะ: ทั้งหมด</option>
            <option value="pending">ยังไม่เสร็จ</option>
            <option value="done">เสร็จแล้ว</option>
            <option value="overdue">เลยกำหนด</option>
          </Select>
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
          >
            <X size={14} />
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={40} strokeWidth={1.5} />}
            title="ไม่มีงานที่ตรงกับตัวกรอง"
            description="ลองปรับหรือล้างตัวกรองเพื่อดูข้อมูลของทีม"
          />
        </Card>
      ) : (
      <div className="space-y-6">
        {/* KPI */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              {
                icon: ListTodo,
                iconClass: "bg-brand-50 text-brand-600",
                label: "งานทั้งหมด",
                value: summary.total,
              },
              {
                icon: CircleDashed,
                iconClass: "bg-stone-100 text-stone-600",
                label: "ยังไม่เสร็จ",
                value: summary.pending,
              },
              {
                icon: CheckCircle2,
                iconClass: "bg-emerald-50 text-emerald-600",
                label: "เสร็จแล้ว",
                value: summary.done,
              },
              {
                icon: AlertTriangle,
                iconClass: "bg-rose-50 text-rose-600",
                label: "เลยกำหนด",
                value: summary.overdue,
              },
            ] as const
          ).map((kpi, i) => (
            <div
              key={kpi.label}
              className="animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <KpiCard
                icon={kpi.icon}
                iconClass={kpi.iconClass}
                label={kpi.label}
                value={kpi.value}
                demo={hasDemo}
              />
            </div>
          ))}
        </div>

        {/* กราฟ */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <SectionHeader
              icon={PieChartIcon}
              title="งานตาม Section"
              demo={hasDemo}
            />
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <div className="h-52 w-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectionData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {sectionData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => formatNumber(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-2.5 text-sm">
                {sectionData.map((entry) => {
                  const pct =
                    sectionTotal > 0 ? (entry.value / sectionTotal) * 100 : 0;
                  return (
                    <li key={entry.key} className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-stone-600">
                        {entry.name}
                      </span>
                      <span className="text-xs text-stone-400">
                        {formatNumber(entry.value)} งาน
                      </span>
                      <span className="w-12 text-right font-medium tabular-nums text-stone-900">
                        {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader icon={Tags} title="งานตามหมวดหมู่" demo={hasDemo} />
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e7e5e4"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#78716c" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={104}
                    tick={{ fontSize: 12, fill: "#57534e" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#faf6f3" }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => formatNumber(Number(value))}
                  />
                  <Bar
                    dataKey="pending"
                    name="ยังไม่เสร็จ"
                    stackId="a"
                    fill={PENDING_COLOR}
                    maxBarSize={20}
                  />
                  <Bar
                    dataKey="done"
                    name="เสร็จแล้ว"
                    stackId="a"
                    fill={DONE_COLOR}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Stats รายบุคคล */}
        <Card className="overflow-hidden">
          <div className="px-5 pt-5">
            <SectionHeader
              icon={Users}
              title="ผลงานรายบุคคล — คลิกชื่อเพื่อดูงานค้างของคนนั้น"
              demo={hasDemo}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="px-5 py-3 font-medium">ผู้รับผิดชอบ</th>
                  <th className="px-4 py-3 text-right font-medium">ทั้งหมด</th>
                  <th className="px-4 py-3 text-right font-medium">ค้างอยู่</th>
                  <th className="px-4 py-3 text-right font-medium">เสร็จแล้ว</th>
                  <th
                    className="px-4 py-3 text-right font-medium"
                    title="ตีกลับแบบ 'คำผิด' เดือนนี้ — ความผิดพลาดของงานจริง"
                  >
                    คำผิด (เดือนนี้)
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium"
                    title="ตีกลับแบบ 'เพิ่มเติม' เดือนนี้ — ผู้ตรวจขอให้ปรับเพื่อคุมคุณภาพ ไม่นับเป็นข้อผิดพลาด"
                  >
                    เพิ่มเติม (เดือนนี้)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibleStats.map((p) => {
                  const active = selectedKey === p.key;
                  return (
                    <tr
                      key={p.key}
                      onClick={() => setSelectedKey(active ? null : p.key)}
                      className={`cursor-pointer transition-colors ${
                        active ? "bg-brand-50" : "hover:bg-brand-50/40"
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              p.key === "none"
                                ? "border-2 border-dashed border-stone-300 text-stone-400"
                                : "bg-gradient-to-b from-brand-400 to-brand-600 text-cream"
                            }`}
                          >
                            {p.key === "none"
                              ? "?"
                              : p.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-stone-800">
                              {p.name}
                            </p>
                            {p.email && (
                              <p className="truncate text-xs text-stone-400">
                                {p.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      {p.total === 0 ? (
                        <td
                          colSpan={5}
                          className="px-4 py-3 text-right text-stone-300"
                        >
                          ยังไม่มีงานที่ได้รับมอบหมาย
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-right font-medium tabular-nums text-stone-900">
                            {formatNumber(p.total)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                            {formatNumber(p.pending)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                            {formatNumber(p.done)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              p.revisions > 0
                                ? "font-semibold text-rose-600"
                                : "text-stone-400"
                            }`}
                          >
                            {formatNumber(p.revisions)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              p.additions > 0 ? "text-sky-600" : "text-stone-400"
                            }`}
                          >
                            {formatNumber(p.additions)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* งานค้างของคนที่เลือก */}
        {selected && (
          <Card className="p-5 animate-fade-in">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <SectionHeader
                icon={ClipboardList}
                title={`งานค้างของ ${selected.name} (${formatNumber(selectedTasks.length)} งาน)`}
                demo={hasDemo}
              />
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-800 hover:underline"
              >
                ไปที่บอร์ดงาน
                <ExternalLink size={13} />
              </Link>
            </div>
            {selectedTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-400">
                ไม่มีงานค้าง 🎉
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {selectedTasks.map((t) => {
                  const pr = TASK_PRIORITY[t.priority];
                  const overdue = isOverdue(t, today);
                  return (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center gap-2 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                        {t.title}
                      </span>
                      <Badge className="bg-stone-100 text-stone-600">
                        {sectionName(t.section_id)}
                      </Badge>
                      {t.category !== "ทั่วไป" && (
                        <Badge className={taskCategoryChipClass(t.category)}>
                          {t.category}
                        </Badge>
                      )}
                      {(t.priority === "high" || t.priority === "urgent") && (
                        <Badge className={pr.badge}>{pr.label}</Badge>
                      )}
                      <span
                        className={`w-24 text-right text-xs ${
                          overdue
                            ? "font-medium text-rose-600"
                            : "text-stone-400"
                        }`}
                      >
                        {t.due_date ? formatDate(t.due_date) : "-"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
      )}
      </>
      )}
    </div>
  );
}
