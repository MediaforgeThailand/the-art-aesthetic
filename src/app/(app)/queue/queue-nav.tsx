"use client";

import {
  ClipboardPlus,
  ListChecks,
  ScrollText,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * แถบแท็บของระบบคิว — ตั้งแต่รวมเข้าแอปหลัก (2026-09-09) โลโก้/ออกจากระบบ/แถบล่างมือถือ
 * เป็นของ shell แอปหลักแล้ว ที่นี่เหลือแค่แท็บสลับหน้าภายในระบบ (แพตเทิร์นเดียวกับแท็บใน /tasks)
 * จอเล็กเลื่อนแนวนอนในกล่องตัวเอง ไม่ตัดบรรทัด
 */
const ITEMS = [
  { href: "/queue", label: "คิว", icon: ListChecks, adminOnly: false },
  { href: "/queue/new", label: "วางข้อมูล", icon: ClipboardPlus, adminOnly: true },
  { href: "/queue/team", label: "ทีม", icon: Users, adminOnly: false },
  { href: "/queue/ranking", label: "อันดับ", icon: Trophy, adminOnly: true },
  { href: "/queue/audit", label: "ประวัติ", icon: ScrollText, adminOnly: true },
];

export default function QueueNav({
  isAdmin,
  displayName,
  roleLabel = null,
}: {
  isAdmin: boolean;
  displayName: string;
  roleLabel?: string | null;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => isAdmin || !item.adminOnly);

  // "/queue" ต้องเทียบเท่ากันเป๊ะ ไม่งั้นทุกหน้าลูกจะทำให้แท็บแรกสว่างค้าง
  const isActive = (href: string) =>
    href === "/queue" ? pathname === "/queue" : pathname.startsWith(href);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 animate-fade-in-up">
      <nav
        aria-label="เมนูระบบคิว"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97] max-sm:min-h-11 ${
                active
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
                  : "border border-stone-200 bg-white/60 text-stone-600 hover:bg-white"
              }`}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 text-right">
        <p className="truncate text-xs font-medium text-stone-700 sm:max-w-[11rem]">
          {displayName}
        </p>
        {roleLabel && <p className="text-[11px] text-brand-600">{roleLabel}</p>}
      </div>
    </div>
  );
}
