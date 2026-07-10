"use client";

import {
  BarChart3,
  ClipboardList,
  IdCard,
  LayoutDashboard,
  Link2,
  LogOut,
  Settings,
  Sparkles,
  Tags,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSignedUrl } from "@/app/(app)/influencers/use-signed-url";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { ProfileSettingsModal } from "@/components/profile-settings";
import type { AppPermission } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/** perm = สิทธิ์ที่ต้องมีถึงจะเห็นเมนู (array = มีสิทธิ์ใดสิทธิ์หนึ่งก็เห็น);
    null = เห็นได้ทุกคน; "admin" = เฉพาะ admin */
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm: AppPermission | AppPermission[] | "admin" | null;
};

/** เมนูจัดเป็นหมวด — หัวข้อหมวด + เส้นแบ่ง ให้เห็นการแบ่งส่วนชัด
    หมวดที่ผู้ใช้ไม่มีสิทธิ์เห็นสักเมนูจะถูกซ่อนทั้งหมวด */
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "ข้อมูล & รายงาน",
    items: [
      { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard, perm: "data" },
      { href: "/reports", label: "รายงาน", icon: BarChart3, perm: "data" },
    ],
  },
  {
    label: "งานทีม",
    items: [
      { href: "/tasks", label: "Task", icon: ClipboardList, perm: "team" },
      { href: "/workload", label: "Team Workload", icon: Users, perm: "team" },
      { href: "/files", label: "คลังลิงก์ไฟล์", icon: Link2, perm: "team" },
    ],
  },
  {
    label: "Influencer",
    items: [
      { href: "/influencers", label: "Influ Management", icon: Sparkles, perm: "influ" },
      // โปรไฟล์ Influencer เห็นได้ทั้งทีมและ influ manager
      { href: "/influ-gallery", label: "โปรไฟล์ Influencer", icon: IdCard, perm: ["team", "influ"] },
    ],
  },
  {
    label: "ราคา",
    items: [
      { href: "/pricing", label: "Product Pricing", icon: Tags, perm: "pricing" },
    ],
  },
  {
    label: "ผู้ดูแลระบบ",
    items: [
      { href: "/accounts", label: "จัดการบัญชี", icon: UserCog, perm: "admin" },
    ],
  },
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
  // โปรไฟล์ของฉัน — ชื่อ/รูปที่แก้ได้จาก modal ตั้งค่าโปรไฟล์ (ค่าเริ่มจาก props/DB)
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(userName);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const { url: avatarUrl } = useSignedUrl(avatarPath);

  useEffect(() => {
    // อ่าน role + permissions + โปรไฟล์ ครั้งเดียวตอน mount (sidebar อยู่ยาวข้ามการนำทางฝั่ง client)
    let alive = true;
    const supabase = createClient();
    void supabase.auth.getClaims().then(({ data }) => {
      const uid = data?.claims?.sub;
      if (!uid || typeof uid !== "string") return;
      if (alive) setUserId(uid);
      void supabase
        .from("profiles")
        .select("role, permissions, full_name, avatar_path")
        .eq("id", uid)
        .single()
        .then(({ data: profile }) => {
          if (!alive || !profile) return;
          if (profile.role === "admin") setIsAdmin(true);
          setPermissions((profile.permissions ?? []) as AppPermission[]);
          // ชื่อใน profiles คือค่าจริงล่าสุด (JWT claims อาจยังเป็นชื่อเก่า)
          if (profile.full_name) setDisplayName(profile.full_name);
          setAvatarPath(profile.avatar_path ?? null);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  // แต่ละเมนูขึ้นกับสิทธิ์ของเมนูนั้นแยกอิสระ (แบบ Discord)
  // เมนู "จัดการบัญชี" (perm 'admin') = เฉพาะ role admin; ที่เหลือดูจาก permissions รายคน
  const canSee = (item: NavItem) => {
    if (item.perm === null) return true;
    if (item.perm === "admin") return isAdmin;
    if (Array.isArray(item.perm))
      return item.perm.some((p) => permissions.includes(p));
    return permissions.includes(item.perm);
  };
  // หมวดที่ไม่เหลือเมนูให้เห็นเลย ซ่อนทั้งหมวด (หัวข้อ+เส้นแบ่งไม่โผล่)
  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

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

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {visibleGroups.map((group, gi) => (
          <div
            key={group.label}
            className={
              gi > 0 ? "mt-3 border-t border-stone-200/70 pt-3" : undefined
            }
          >
            {/* หัวข้อหมวด */}
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400/90">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
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
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/60 px-3 py-3">
        <div className="flex items-center gap-1 rounded-lg px-1 py-2">
          {/* กดที่ชื่อ/รูป = เปิดตั้งค่าโปรไฟล์ (เปลี่ยนชื่อ + รูป) */}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            title="ตั้งค่าโปรไฟล์ (เปลี่ยนชื่อ/รูป)"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors duration-200 hover:bg-white/60 active:scale-[0.98]"
          >
            {avatarPath && avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName || "รูปโปรไฟล์"}
                className="h-9 w-9 shrink-0 rounded-full object-cover shadow-sm"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-xs font-semibold text-brand-800">
                {(displayName || userEmail || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-stone-800">
                {displayName || "ผู้ใช้งาน"}
              </span>
              <span className="block truncate text-xs text-stone-400">
                {userEmail}
              </span>
            </span>
            <Settings
              size={14}
              className="shrink-0 text-stone-300 transition-colors group-hover:text-brand-500"
            />
          </button>
          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            className="rounded-lg p-1.5 text-stone-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 cursor-pointer active:scale-90"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {userId && (
        <ProfileSettingsModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          userId={userId}
          email={userEmail}
          initialName={displayName}
          initialAvatarPath={avatarPath}
          onSaved={(name, path) => {
            setDisplayName(name);
            setAvatarPath(path);
          }}
        />
      )}
    </aside>
  );
}
