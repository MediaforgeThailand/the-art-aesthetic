"use client";

import {
  ArrowLeft,
  CalendarDays,
  FileSignature,
  Gauge,
  History,
  IdCard,
  LayoutGrid,
  LogOut,
  Sparkles,
  Trash2,
  Wallet,
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
 * โครงหน้าของ **ระบบ Influencer** — แยกขาดจากแถบเมนูของแอปทีม (`Sidebar`)
 *
 * ทีมอื่นเข้ามาใช้ระบบนี้โดยไม่ได้ทำงานในแอปทีม การเอาเมนูของทีม (Task/แดชบอร์ด/ราคา/ไฟล์)
 * มาแปะข้างๆ จึงรกและชวนกดผิด — ที่นี่จึงมีแถบบนเป็นของตัวเอง เฉพาะหน้าในระบบนี้
 * (URL ทุกหน้ายังเป็นของเดิม เพราะ `(influ)` เป็น route group ไม่ใช่ path จริง)
 */
export function InfluShell({
  userId,
  userName,
  userEmail,
  levelLabel,
  levelBadge,
  canView,
  canManage,
  canGallery,
  backHref,
  children,
}: {
  userId: string | null;
  userName: string;
  userEmail: string;
  /** ป้ายระดับสิทธิ์ (null = ไม่มีระดับในระบบนี้ เช่นคนที่เข้ามาดูโปรไฟล์ด้วยสิทธิ์ team) */
  levelLabel: string | null;
  levelBadge: string | null;
  canView: boolean;
  canManage: boolean;
  canGallery: boolean;
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
    { href: "/influencers", label: "บอร์ดเคส", icon: LayoutGrid, show: canView },
    { href: "/influ-calendar", label: "ปฏิทินคิว", icon: CalendarDays, show: canView },
    { href: "/influ-dashboard", label: "แดชบอร์ด", icon: Gauge, show: canView },
    { href: "/influ-cost", label: "ต้นทุน", icon: Wallet, show: canView },
    { href: "/influencers/contracts", label: "สัญญา", icon: FileSignature, show: canView },
    { href: "/influ-gallery", label: "โปรไฟล์", icon: IdCard, show: canGallery },
    { href: "/influencer-management/logs", label: "Log", icon: History, show: canManage },
    { href: "/influencer-management/trash", label: "ถังขยะ", icon: Trash2, show: canManage },
  ];
  const visibleNav = navItems.filter((n) => n.show);

  // เมนูที่ active = อันที่ prefix ตรงและ "ยาวที่สุด" — ไม่งั้น /influencers/contracts
  // จะทำให้ทั้ง "บอร์ดเคส" และ "สัญญา" สว่างพร้อมกัน (หน้าเคสรายคนยังนับเป็นบอร์ดเคสถูกต้อง)
  const activeHref =
    visibleNav
      .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

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
      {/* ---------- แถบบนของระบบ Influencer ----------
           pt-safe = เผื่อ status bar ตอนติดตั้งเป็น PWA (standalone ไม่มีแถบเบราว์เซอร์) */}
      <header className="shrink-0 border-b border-white/60 bg-white/60 pt-safe backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          <Link
            href={canView ? "/influencers" : "/influ-gallery"}
            className="flex min-w-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
          >
            <LogoMark className="h-9 w-9 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-semibold tracking-wide text-stone-800">
                Influencer System
              </span>
              <span className="block truncate text-[10px] leading-tight text-stone-400">
                The ART — Aesthetic
              </span>
            </span>
          </Link>

          {levelLabel && levelBadge && (
            <span
              className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${levelBadge}`}
              title="ระดับสิทธิ์ของบัญชีนี้ในระบบ Influencer"
            >
              <Sparkles size={11} /> {levelLabel}
            </span>
          )}

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

        {/* แถบเมนูของระบบนี้ — จอเล็กเลื่อนแนวนอน (ห้ามตัดบรรทัดจนแถบสูงกินพื้นที่เนื้อหา) */}
        <nav
          aria-label="เมนูระบบ Influencer"
          className="flex gap-1 overflow-x-auto px-2 pb-1.5 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden"
        >
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200 active:scale-[0.97] max-sm:min-h-11 ${
                  active
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-stone-500 hover:bg-white/70 hover:text-brand-800"
                }`}
              >
                <Icon size={15} className={active ? "text-brand-600" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* แต่ละหน้าคุม scroll เอง (PageContainer) — pb-safe เพราะระบบนี้ไม่มีแถบเมนูล่างมาช่วย
          กัน home indicator เหมือนฝั่งแอปทีม */}
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
