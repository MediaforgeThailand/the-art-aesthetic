"use client";

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
import { formatCurrency, formatMonthKey, formatNumber } from "@/lib/format";

/** โทนสี rose gold/copper ตาม CI ของ The ART Aesthetic */
export const CHART_COLORS = [
  "#a96a58",
  "#cd9a86",
  "#ddb9aa",
  "#8d5647",
  "#bd8070",
  "#ead4c9",
  "#73463a",
];

export type MonthlyPoint = { month: string; total: number };
export type NamedValue = { name: string; value: number };

const AXIS_TICK = { fontSize: 12, fill: "#78716c" };

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e7e5e4",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: 12,
};

/** ย่อจำนวนเงินบนแกน เช่น 1.2M / 350K */
function compactBaht(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${formatNumber(Math.round((value / 1_000_000) * 10) / 10)}M`;
  }
  if (abs >= 1_000) {
    return `${formatNumber(Math.round(value / 1_000))}K`;
  }
  return formatNumber(value);
}

/* ---------- กราฟยอดขายรายเดือน ---------- */

export function MonthlySalesChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(value) => formatMonthKey(String(value))}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => compactBaht(Number(value))}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "#faf6f3" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => formatCurrency(Number(value))}
            labelFormatter={(label) => formatMonthKey(String(label))}
          />
          <Bar
            dataKey="total"
            name="ยอดขาย"
            fill="#a96a58"
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- กราฟสัดส่วนตามหมวดหมู่ (donut + legend เปอร์เซ็นต์) ---------- */

export function CategoryDonutChart({ data }: { data: NamedValue[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2.5 text-sm">
        {data.map((entry, i) => {
          const pct = total > 0 ? (entry.value / total) * 100 : 0;
          return (
            <li key={entry.name} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-stone-600">
                {entry.name}
              </span>
              <span className="text-xs text-stone-400">
                {formatCurrency(entry.value)}
              </span>
              <span className="w-12 text-right font-medium tabular-nums text-stone-900">
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- กราฟเทียบยอดขายรายสาขา (แนวนอน) ---------- */

export function BranchBarChart({ data }: { data: NamedValue[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e7e5e4"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickFormatter={(value) => compactBaht(Number(value))}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            tick={{ fontSize: 12, fill: "#57534e" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "#faf6f3" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => formatCurrency(Number(value))}
          />
          <Bar
            dataKey="value"
            name="ยอดขาย"
            fill="#cd9a86"
            radius={[0, 6, 6, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
