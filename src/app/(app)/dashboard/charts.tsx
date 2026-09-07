"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";

/** โทนสี rose gold/copper ตาม CI ของ The ART Aesthetic */
const CHART_COLORS = [
  "#a96a58",
  "#cd9a86",
  "#ddb9aa",
  "#8d5647",
  "#bd8070",
  "#ead4c9",
  "#73463a",
];

type NamedValue = { name: string; value: number };

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e7e5e4",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: 12,
};

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

