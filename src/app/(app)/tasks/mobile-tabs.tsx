"use client";

import {
  BadgeCheck,
  ClipboardCheck,
  ListTodo,
  Send,
  Trash2,
  UserCog,
} from "lucide-react";

/* ============================================================================
   แถบแท็บเวอร์ชันมือถือ (<lg)
   ----------------------------------------------------------------------------
   ของเดิมเป็นแถวเดียวเลื่อนแนวนอน — บนมือถือแท็บที่ 4-5 อยู่นอกจอ คนไม่รู้ว่ามี
   และการเลื่อนแนวนอนซ้อนกับท่าปาดเปลี่ยนเซคชันของบอร์ด. เวอร์ชันนี้เป็น
   grid 5 ช่องพอดีจอ (ไอคอน + ป้ายสั้นใต้ไอคอน) **ห้ามกลับไปเป็นแถวเลื่อน**
   — เพิ่มแท็บใหม่ต้องหาที่ให้พอดีจอ 375px หรือย้ายของเดิมไปที่อื่นแทน
   ========================================================================== */

export type TaskTabKey =
  | "work"
  | "review"
  | "posting"
  | "approved"
  | "analysis"
  | "trash";

type TabDef = {
  key: TaskTabKey;
  label: string;
  icon: React.ReactNode;
  count: number;
  /** สีป้ายจำนวนตอนแท็บนั้นไม่ได้ถูกเลือก */
  badge: string;
};

export function MobileTabs({
  tab,
  onChange,
  reviewCount,
  postingCount,
  approvedCount,
  trashCount,
  isAdmin,
  onManageReviewers,
}: {
  tab: TaskTabKey;
  onChange: (key: TaskTabKey) => void;
  reviewCount: number;
  postingCount: number;
  approvedCount: number;
  trashCount: number;
  isAdmin: boolean;
  onManageReviewers: () => void;
}) {
  const tabs: TabDef[] = [
    {
      key: "work",
      label: "บันทึกงาน",
      icon: <ListTodo size={19} />,
      count: 0,
      badge: "",
    },
    {
      key: "review",
      label: "รอตรวจ",
      icon: <ClipboardCheck size={19} />,
      count: reviewCount,
      badge: "bg-amber-100 text-amber-700",
    },
    {
      key: "posting",
      label: "รอโพส",
      icon: <Send size={19} />,
      count: postingCount,
      badge: "bg-sky-100 text-sky-700",
    },
    {
      key: "approved",
      label: "งานเสร็จ",
      icon: <BadgeCheck size={19} />,
      count: approvedCount,
      badge: "bg-emerald-100 text-emerald-700",
    },
    {
      key: "trash",
      label: "ถังขยะ",
      icon: <Trash2 size={19} />,
      count: trashCount,
      badge: "bg-stone-200 text-stone-600",
    },
  ];

  return (
    <div className="flex items-stretch gap-1">
      <div className="grid min-w-0 flex-1 grid-cols-5 gap-0.5">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={active}
              className={`relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 transition-colors ${
                active
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                  : "text-stone-500 active:bg-white/70"
              }`}
            >
              {t.icon}
              <span className="max-w-full truncate text-[10px] font-medium leading-none">
                {t.label}
              </span>
              {t.count > 0 && (
                <span
                  className={`absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                    active ? "bg-white/25 text-cream" : t.badge
                  }`}
                >
                  {t.count > 99 ? "99+" : t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* จัดการผู้ตรวจ = การกระทำ ไม่ใช่แท็บ — แยกออกมานอก grid ให้เข้าถึงได้ทุกแท็บ */}
      {isAdmin && (
        <button
          type="button"
          onClick={onManageReviewers}
          aria-label="จัดการผู้ตรวจงาน"
          className="flex h-auto w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-stone-300/80 bg-white/70 text-stone-500 transition-colors active:bg-white"
        >
          <UserCog size={18} />
        </button>
      )}
    </div>
  );
}
