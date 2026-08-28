"use client";

import {
  ArrowLeft,
  CalendarDays,
  HeartPulse,
  LayoutGrid,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileSettingsModal } from "@/components/profile-settings";
import { createClient } from "@/lib/supabase/client";
import { useSignedUrl } from "@/lib/use-signed-url";

type ShellNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  show: boolean;
};

/**
 * แถบเมนูของระบบ — markup ชุดเดียวใช้ทั้ง 2 เลย์เอาต์ (แถวเดียวกับชื่อระบบที่ ≥lg
 * / แถวล่างแยกที่จอเล็ก) ต่างกันแค่ className ที่ส่งเข้ามา (แพตเทิร์นเดียวกับ influ-shell)
 */
function ShellNav({
  items,
  activeHref,
  className = "",
}: {
  items: ShellNavItem[];
  activeHref: string | null;
  className?: string;
}) {
  return (
    <nav
      aria-label="เมนูระบบ Wellness"
      className={`gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 active:scale-[0.97] max-sm:min-h-11 xl:px-3 ${
              active
                ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-100"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-800"
            }`}
          >
            <Icon size={15} className={active ? "text-brand-600" : ""} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** ป้ายบทบาทสั้นๆ ข้างโลโก้ — Wellness เป็นสวิตช์อิสระ คนเดียวมีได้หลายบทบาท */
function roleLabelOf(flags: {
  isAdmin: boolean;
  isBc: boolean;
  isLab: boolean;
  isDoctor: boolean;
}): string | null {
  if (flags.isAdmin) return "Admin";
  const parts: string[] = [];
  if (flags.isBc) parts.push("BC");
  if (flags.isLab) parts.push("Lab");
  if (flags.isDoctor) parts.push("แพทย์");
  return parts.length > 0 ? parts.join(" + ") : null;
}

/**
 * โครงหน้าของ **ระบบ Wellness** — แยกขาดจากแถบเมนูของแอปทีม (`Sidebar`)
 * แถบบนเป็นของตัวเอง เฉพาะหน้าในระบบนี้ (URL จริงไม่เปลี่ยนเพราะ `(wellness)` เป็น route group)
 */
export function WellnessShell({
  userId,
  userName,
  userEmail,
  canView,
  isBc,
  isLab,
  isAdmin,
  isDoctor,
  backHref,
  children,
}: {
  userId: string | null;
  userName: string;
  userEmail: string;
  canView: boolean;
  isBc: boolean;
  isLab: boolean;
  isAdmin: boolean;
  isDoctor: boolean;
  /** ปลายทางตอนกด "แอปหลัก" — เลือกตามสิทธิ์จริงของคนนั้น (ทุกคนอย่างน้อยมี /my-tasks) */
  backHref: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(userName);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const { url: avatarUrl } = useSignedUrl(avatarPath);

  useEffect(() => {
    // ชื่อ/รูปล่าสุดอ่านจาก profiles (JWT claims อาจยังเป็นชื่อเก่า) — ครั้งเดียวตอน mount
    if (!userId) return;
    let alive = true;
    const supabase = createClient();
    void supabase
      .from("profiles")
      .select("full_name, avatar_path, job_title")
      .eq("id", userId)
      .single()
      .then(({ data: profile }) => {
        if (!alive || !profile) return;
        if (profile.full_name) setDisplayName(profile.full_name);
        setAvatarPath(profile.avatar_path ?? null);
        setJobTitle(profile.job_title ?? null);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const navItems: ShellNavItem[] = [
    { href: "/wellness", label: "การ์ดลูกค้า", icon: LayoutGrid, show: canView },
    {
      href: "/wellness-calendar",
      label: "ปฏิทินคิวแพทย์",
      icon: CalendarDays,
      show: canView,
    },
  ];
  const visibleNav = navItems.filter((n) => n.show);

  // เมนู active = prefix ที่ตรงและยาวที่สุด (หน้า /wellness/[id] นับเป็น "การ์ดลูกค้า")
  const activeHref =
    visibleNav
      .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  const roleLabel = roleLabelOf({ isAdmin, isBc, isLab, isDoctor });

  async function handleLogout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // เน็ตล่ม/เซิร์ฟเวอร์ไม่ตอบ — ล้าง session เฉพาะเบราว์เซอร์นี้ ไม่งั้นกดแล้วเหมือนปุ่มเสีย
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // เพิกเฉย — พาไปหน้า login ต่อไม่ว่ากรณีใด
      }
    }
    router.push("/login");
    router.refresh();
  }

  const avatar =
    avatarPath && avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName || "รูปโปรไฟล์"}
        className="h-8 w-8 shrink-0 rounded-full object-cover shadow-sm"
      />
    ) : (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-xs font-semibold text-brand-800">
        {(displayName || userEmail || "?").charAt(0).toUpperCase()}
      </span>
    );

  return (
    // h-dvh กันแถบ address bar มือถือกินความสูง (100vh เพี้ยนบน iOS/Android)
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* pt-safe = เผื่อ status bar ตอนติดตั้งเป็น PWA */}
      <header className="shrink-0 border-b border-white/60 bg-white/60 pt-safe backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4 lg:gap-3">
          <Link
            href="/wellness"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
          >
            <LogoMark className="h-9 w-9 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-semibold tracking-wide text-stone-800">
                Wellness System
              </span>
              {/* บรรทัดรองมีเฉพาะเลย์เอาต์ 2 แถว — แถวเดียวต้องเก็บพื้นที่ไว้ให้เมนู */}
              <span className="block truncate text-[10px] leading-tight text-stone-400 lg:hidden">
                The ART — Aesthetic
              </span>
            </span>
          </Link>

          {roleLabel && (
            <span
              className="hidden shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700 sm:inline-flex lg:hidden xl:inline-flex"
              title="บทบาทของบัญชีนี้ในระบบ Wellness"
            >
              <HeartPulse size={11} /> {roleLabel}
            </span>
          )}

          <span
            aria-hidden
            className="hidden h-7 w-px shrink-0 bg-stone-200/90 lg:block"
          />
          <ShellNav
            items={visibleNav}
            activeHref={activeHref}
            className="hidden min-w-0 flex-1 lg:flex"
          />
          <span
            aria-hidden
            className="hidden h-7 w-px shrink-0 bg-stone-200/90 lg:block"
          />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              href={backHref}
              title="กลับไปแอปหลัก (งาน / แดชบอร์ด / ลิสต์ของฉัน)"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-white/70 hover:text-brand-700 active:scale-95 max-sm:min-h-11"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">แอปหลัก</span>
            </Link>
            {userId && <NotificationBell userId={userId} />}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              title={`${displayName || "ผู้ใช้งาน"} — ตั้งค่าโปรไฟล์`}
              aria-label="ตั้งค่าโปรไฟล์"
              className="inline-flex cursor-pointer items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 max-sm:h-11 max-sm:w-11"
            >
              {avatar}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="ออกจากระบบ"
              aria-label="ออกจากระบบ"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90 max-sm:h-11 max-sm:w-11"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {/* จอเล็กกว่า lg = เมนูอยู่แถวล่าง เลื่อนแนวนอน */}
        <ShellNav
          items={visibleNav}
          activeHref={activeHref}
          className="flex px-2 pb-1.5 sm:px-3 lg:hidden"
        />
      </header>

      {/* แต่ละหน้าคุม scroll เอง (PageContainer) — pb-safe เพราะระบบนี้ไม่มีแถบเมนูล่าง */}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden pb-safe">
        {children}
      </main>

      {userId && (
        <ProfileSettingsModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          userId={userId}
          email={userEmail}
          initialName={displayName}
          initialAvatarPath={avatarPath}
          initialJobTitle={jobTitle}
          onSaved={(name, path, job) => {
            setDisplayName(name);
            setAvatarPath(path);
            setJobTitle(job);
          }}
        />
      )}
    </div>
  );
}
