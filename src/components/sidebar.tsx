"use client";

import {
  BarChart3,
  ClipboardList,
  IdCard,
  LayoutDashboard,
  Link2,
  LogOut,
  Sparkles,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { href: "/reports", label: "รายงาน", icon: BarChart3 },
  { href: "/pricing", label: "Product Pricing", icon: Tags },
  { href: "/influencers", label: "Influ Management", icon: Sparkles },
  { href: "/influ-gallery", label: "โปรไฟล์ Influencer", icon: IdCard },
  { href: "/tasks", label: "งาน", icon: ClipboardList },
  { href: "/workload", label: "ภาระงานทีม", icon: Users },
  { href: "/files", label: "คลังลิงก์ไฟล์", icon: Link2 },
];

export function Sidebar({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-white/60 bg-white/55 backdrop-blur-xl">
      <div className="flex items-center gap-3 border-b border-white/60 px-5 py-5">
        <LogoMark className="h-14 w-14" />
        <LogoWordmark />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                active
                  ? "bg-white/75 text-brand-800 shadow-sm"
                  : "text-stone-600 hover:bg-white/55 hover:text-brand-800 hover:translate-x-0.5"
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-400 to-brand-600 transition-all duration-300 ${
                  active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50"
                }`}
              />
              <Icon
                size={18}
                className={`transition-colors duration-200 ${
                  active ? "text-brand-600" : "group-hover:text-brand-500"
                }`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/60 px-3 py-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-xs font-semibold text-brand-800">
            {(userName || userEmail || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-stone-800">
              {userName || "ผู้ใช้งาน"}
            </p>
            <p className="truncate text-xs text-stone-400">{userEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            className="rounded-lg p-1.5 text-stone-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 cursor-pointer active:scale-90"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
