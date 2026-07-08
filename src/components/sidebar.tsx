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
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark, LogoWordmark } from "@/components/logo";
import type { AppPermission } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/** perm = สิทธิ์ที่ต้องมีถึงจะเห็นเมนู; null = เห็นได้ทุกคน; "admin" = เฉพาะ admin */
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm: AppPermission | "admin" | null;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard, perm: "data" },
  { href: "/reports", label: "รายงาน", icon: BarChart3, perm: "data" },
  { href: "/pricing", label: "Product Pricing", icon: Tags, perm: "pricing" },
  { href: "/influencers", label: "Influ Management", icon: Sparkles, perm: "influ" },
  { href: "/influ-gallery", label: "โปรไฟล์ Influencer", icon: IdCard, perm: "influ" },
  { href: "/tasks", label: "งาน", icon: ClipboardList, perm: "team" },
  { href: "/workload", label: "ภาระงานทีม", icon: Users, perm: "team" },
  { href: "/files", label: "คลังลิงก์ไฟล์", icon: Link2, perm: "team" },
  { href: "/accounts", label: "จัดการบัญชี", icon: UserCog, perm: "admin" },
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<AppPermission[]>([]);

  useEffect(() => {
    // อ่าน role + permissions ครั้งเดียวตอน mount (sidebar อยู่ยาวข้ามการนำทางฝั่ง client)
    let alive = true;
    const supabase = createClient();
    void supabase.auth.getClaims().then(({ data }) => {
      const uid = data?.claims?.sub;
      if (!uid || typeof uid !== "string") return;
      void supabase
        .from("profiles")
        .select("role, permissions")
        .eq("id", uid)
        .single()
        .then(({ data: profile }) => {
          if (!alive || !profile) return;
          if (profile.role === "admin") setIsAdmin(true);
          setPermissions((profile.permissions ?? []) as AppPermission[]);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  // แต่ละเมนูขึ้นกับสิทธิ์ของเมนูนั้นแยกอิสระ (แบบ Discord)
  // เมนู "จัดการบัญชี" (perm 'admin') = เฉพาะ role admin; ที่เหลือดูจาก permissions รายคน
  const visibleNav = navItems.filter((item) => {
    if (item.perm === null) return true;
    if (item.perm === "admin") return isAdmin;
    return permissions.includes(item.perm);
  });

  async function handleLogout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // เซิร์ฟเวอร์ไม่ตอบ/เน็ตล่ม — ล้าง session เฉพาะเบราว์เซอร์นี้แทน
      // ไม่งั้น session ยังอยู่ proxy จะเด้งกลับเข้าหน้าเดิม เหมือนปุ่มไม่ทำงาน
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // เพิกเฉย — พาไปหน้า login ต่อไม่ว่ากรณีใด
      }
    }
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
        {visibleNav.map(({ href, label, icon: Icon }) => {
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
