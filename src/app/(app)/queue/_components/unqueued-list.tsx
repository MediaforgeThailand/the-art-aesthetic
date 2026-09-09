import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import type { QueueCaseSummary } from "@/lib/queue/data";
import { CASE_TYPE_LABEL } from "@/lib/queue/types";

/**
 * เคสที่บันทึกไว้แต่ไม่เข้าคิวรัน — ไม่มีผู้รับคิวจึงไม่มีปุ่มจัดการ
 * มีไว้เพื่อให้เคสประเภทอื่นไม่หายไปเฉยๆ หลังกดบันทึก
 */
export function UnqueuedList({ rows }: { rows: QueueCaseSummary[] }) {
  return (
    <div className="glass overflow-hidden rounded-xl">
      <ul className="divide-y divide-stone-200/60">
        {rows.map((row) => {
          const time = row.appointment_time ? ` ${row.appointment_time.slice(0, 5)}` : "";
          const meta = [
            row.appointment_date
              ? `นัด ${formatDateShort(row.appointment_date)}${time}`
              : null,
            row.treatment_main,
            row.doctor,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              key={row.id}
              className="relative flex items-center gap-2.5 px-3 py-2.5 transition-colors duration-150 hover:bg-white/70"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link
                    href={`/queue/cases/${row.id}`}
                    className="min-w-0 truncate text-sm font-semibold text-stone-900 before:absolute before:inset-0 before:content-['']"
                  >
                    {row.customer_name || "—"}
                  </Link>
                  <Badge className="shrink-0 bg-stone-100 text-stone-600">
                    {CASE_TYPE_LABEL[row.case_type] ?? row.case_type}
                  </Badge>
                  {row.status === "cancelled" && (
                    <Badge className="shrink-0 bg-stone-100 text-stone-500">ยกเลิกแล้ว</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-stone-500">{meta || "—"}</p>
              </div>
              <span className="shrink-0 text-xs text-stone-400">#{row.case_no}</span>
              <ChevronRight size={16} className="shrink-0 text-stone-300" aria-hidden />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
