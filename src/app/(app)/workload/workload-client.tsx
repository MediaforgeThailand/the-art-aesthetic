"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  ExternalLink,
  ListTodo,
  PieChart as PieChartIcon,
  Tags,
  Users,
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
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { TASK_PRIORITY, taskCategoryChipClass } from "@/lib/constants";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import type {
  ProfileRow,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";

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
}: {
  tasks: TaskWithAssignee[];
  profiles: ProfileOption[];
  sections: TaskSectionRow[];
}) {
  const today = todayISO();
  const hasDemo = tasks.some((t) => t.description === "demo");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  /* ---- ภาพรวม ---- */
  const summary = useMemo(
    () => ({
      total: tasks.length,
      pending: tasks.filter((t) => !t.completed).length,
      done: tasks.filter((t) => t.completed).length,
      overdue: tasks.filter((t) => isOverdue(t, today)).length,
    }),
    [tasks, today]
  );

  /* ---- donut: งานตาม section ---- */
  const sectionData = useMemo(() => {
    const rows = sections.map((s, i) => ({
      key: s.id,
      name: s.name,
      value: tasks.filter((t) => t.section_id === s.id).length,
      color: SECTION_PALETTE[i % SECTION_PALETTE.length],
    }));
    const orphan = tasks.filter(
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
  }, [tasks, sections]);
  const sectionTotal = sectionData.reduce((sum, d) => sum + d.value, 0);

  /* ---- งานตามหมวดหมู่ (stack เสร็จ/ค้าง) ---- */
  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; pending: number; done: number }>();
    for (const t of tasks) {
      const key = t.category?.trim() || "ทั่วไป";
      const row = map.get(key) ?? { name: key, pending: 0, done: 0 };
      if (t.completed) row.done += 1;
      else row.pending += 1;
      map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) => b.pending + b.done - (a.pending + a.done)
    );
  }, [tasks]);

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
    }));
    const unassigned: PersonStat = {
      key: "none",
      name: "ไม่ระบุผู้รับผิดชอบ",
      email: null,
      total: 0,
      pending: 0,
      done: 0,
      overdue: 0,
    };
    const byId = new Map(rows.map((r) => [r.key, r]));

    for (const t of tasks) {
      const row = (t.assignee_id && byId.get(t.assignee_id)) || unassigned;
      row.total += 1;
      if (t.completed) row.done += 1;
      else row.pending += 1;
      if (isOverdue(t, today)) row.overdue += 1;
    }

    const result = [...rows];
    if (unassigned.total > 0) result.push(unassigned);
    return result.sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, "th")
    );
  }, [tasks, profiles, today]);

  /* ---- งานค้างของคนที่เลือก ---- */
  const selected = personStats.find((p) => p.key === selectedKey) ?? null;
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? "-";
  const selectedTasks = useMemo(() => {
    if (!selectedKey) return [];
    return tasks
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
  }, [tasks, selectedKey, today]);

  if (tasks.length === 0) {
    return (
      <div>
        <PageHeader
          title="ภาระงานทีม"
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
        title="ภาระงานทีม"
        description="ภาพรวมภาระงานและผลงานรายบุคคลของแผนก"
      />

      {hasDemo && <DemoBanner onWhat="งานบางส่วน" />}

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
                  <th className="px-4 py-3 text-right font-medium">ยังไม่เสร็จ</th>
                  <th className="px-4 py-3 text-right font-medium">เสร็จแล้ว</th>
                  <th className="px-4 py-3 text-right font-medium">เลยกำหนด</th>
                  <th className="px-5 py-3 font-medium">อัตราเสร็จ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {personStats.map((p) => {
                  const rate = p.total > 0 ? (p.done / p.total) * 100 : null;
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
                          colSpan={4}
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
                              p.overdue > 0
                                ? "font-semibold text-rose-600"
                                : "text-stone-400"
                            }`}
                          >
                            {formatNumber(p.overdue)}
                          </td>
                        </>
                      )}
                      <td className="px-5 py-3">
                        {rate === null ? (
                          <span className="text-stone-300">-</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs font-medium tabular-nums text-stone-700">
                              {rate.toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </td>
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
    </div>
  );
}
