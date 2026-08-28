import { Check } from "lucide-react";
import {
  WELLNESS_STATUS,
  WELLNESS_STATUS_ORDER,
  type WellnessStatusKey,
} from "@/lib/wellness-constants";

/** ชิปสถานะเคส — สีเดียวกันทุกหน้า (การ์ด / หัวเคส / คิว) */
export function WellnessStatusChip({
  status,
  className = "",
}: {
  status: WellnessStatusKey;
  className?: string;
}) {
  const meta = WELLNESS_STATUS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge} ${className}`}
    >
      {meta.label}
    </span>
  );
}

/**
 * เส้นบอกขั้นของเคส — 4 ขั้นตาม flow (รอผลแลบ → ผลพร้อม·รอนัด → นัดแล้ว → ปิดเคส)
 * แบบเดียวกับ StageTracker ของการ์ด Influ: ผ่านแล้ว = จุดทึบ + ติ๊กถูก,
 * ขั้นปัจจุบัน = จุดใหญ่มีวงรอบ, ยังไม่ถึง = วงเปล่า
 *
 * ใช้บอก "งานอยู่ตรงไหนของสายพาน" ให้ทุกบทบาทเห็นตรงกัน โดยไม่ต้องเอาปุ่มของบทบาทอื่นมาแปะ
 */
export function WellnessStageTracker({
  status,
  className = "",
}: {
  status: WellnessStatusKey;
  className?: string;
}) {
  const current = WELLNESS_STATUS_ORDER.indexOf(status);
  return (
    <ol className={`flex items-start gap-1 ${className}`}>
      {WELLNESS_STATUS_ORDER.map((key, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={key} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* เส้นเชื่อมซ้าย — ช่องแรกไม่มี */}
              <span
                aria-hidden
                className={`h-0.5 flex-1 rounded-full ${
                  i === 0
                    ? "bg-transparent"
                    : done || active
                      ? "bg-brand-300"
                      : "bg-stone-200"
                }`}
              />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  done
                    ? "bg-brand-400 text-white"
                    : active
                      ? "bg-brand-600 text-white ring-4 ring-brand-100"
                      : "border border-stone-300 bg-white text-stone-400"
                }`}
              >
                {done ? <Check size={11} /> : i + 1}
              </span>
              <span
                aria-hidden
                className={`h-0.5 flex-1 rounded-full ${
                  i === WELLNESS_STATUS_ORDER.length - 1
                    ? "bg-transparent"
                    : done
                      ? "bg-brand-300"
                      : "bg-stone-200"
                }`}
              />
            </div>
            <span
              className={`mt-1 w-full truncate text-center text-[10px] leading-tight sm:text-[11px] ${
                active ? "font-semibold text-brand-700" : "text-stone-400"
              }`}
              title={WELLNESS_STATUS[key].label}
            >
              {WELLNESS_STATUS[key].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
