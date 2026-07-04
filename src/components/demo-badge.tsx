import { FlaskConical } from "lucide-react";

/** ป้ายกำกับส่วนที่กำลังแสดง "ข้อมูลตัวอย่าง (mockup)" — หายเองเมื่อลบข้อมูล demo ออก */
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="ส่วนนี้กำลังแสดงข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง — ลบข้อมูล demo แล้วป้ายนี้จะหายไป"
      className={`inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ${className}`}
    >
      <FlaskConical size={11} />
      Mockup
    </span>
  );
}

/** แถบแจ้งเตือนระดับหน้า เมื่อข้อมูลที่แสดงส่วนใหญ่เป็นข้อมูลตัวอย่าง */
export function DemoBanner({ onWhat }: { onWhat: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 animate-fade-in">
      <FlaskConical size={16} className="shrink-0" />
      <span>
        {onWhat}ที่แสดงอยู่เป็น <strong>ข้อมูลตัวอย่าง (Mockup)</strong> —
        เมื่อมีข้อมูลจริงเข้าระบบหรือลบข้อมูลตัวอย่างออก ป้ายนี้จะหายไปอัตโนมัติ
      </span>
    </div>
  );
}
