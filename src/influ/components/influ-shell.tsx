"use client";

import {
  ArrowLeft,
  CalendarDays,
  Crosshair,
  Gauge,
  History,
  IdCard,
  LayoutGrid,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  Sparkles,
  Stethoscope,
  Trash2,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";
import { InfluNotificationBell } from "@/influ/components/influ-notification-bell";
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
 * แถบเมนูของระบบ — ใช้ตัวเดียวกันทั้ง 2 เลย์เอาต์ (บรรทัดเดียวกับชื่อระบบที่ ≥lg
 * / แถวล่างแยกที่จอเล็ก) ต่างกันแค่ className ที่ส่งเข้ามา จึงไม่มีเมนูสองชุดให้หลุดกัน
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
      aria-label="เมนูระบบ Influencer"
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
  /** drawer เมนูของจอเล็ก (เปิดจากปุ่ม hamburger มุมขวาบน)
      เก็บ pathname ที่เปิดไว้ด้วย — เปลี่ยนหน้าแล้วต้องปิดเอง ไม่งั้น drawer ค้างทับหน้าใหม่
      (ใช้แพตเทิร์น adjust-state-during-render ของโปรเจกต์ แทน setState ใน effect) */
  const [menu, setMenu] = useState({ open: false, path: pathname });
  if (menu.open && menu.path !== pathname) setMenu({ open: false, path: pathname });
  const menuOpen = menu.open;
  const setMenuOpen = (open: boolean) => setMenu({ open, path: pathname });
  const { url: avatarUrl } = useSignedUrl(avatarPath);

  // Esc ปิด drawer
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu((m) => ({ ...m, open: false }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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
    // Hunting = งานก่อนตอบรับ (0081) มาก่อนบอร์ดเคสตามลำดับ flow จริง
    { href: "/influ-hunting", label: "Hunting", icon: Crosshair, show: canView },
    { href: "/influencers", label: "เคสดำเนินงาน", icon: LayoutGrid, show: canView },
    { href: "/influ-calendar", label: "ปฏิทินคิว", icon: CalendarDays, show: canView },
    // แคมเปญ = ที่ตั้งแท็ก tracking (0093) — อยู่ก่อนแดชบอร์ดเพราะเป็นงานตั้งค่าที่ใช้บ่อยกว่า
    { href: "/influ-campaigns", label: "แคมเปญ", icon: Megaphone, show: canView },
    { href: "/influ-dashboard", label: "แดชบอร์ด", icon: Gauge, show: canView },
    { href: "/influ-cost", label: "ต้นทุน", icon: Wallet, show: canView },
    // "Follow Up" = ทั้งที่ตั้งเป้าโพสและที่ติดตามผลงาน (0092 — ขั้นตามงานในหน้าเคสถูกถอด)
    // งานหลักของทีมตอนนี้คือการตามให้ influ โพส จึงต้องอยู่ในเมนูเสมอ (ผู้ใช้ 2026-08-29)
    { href: "/influencers/contracts", label: "Follow Up", icon: ListChecks, show: canView },
    { href: "/influ-gallery", label: "โปรไฟล์", icon: IdCard, show: canGallery },
    // ทะเบียนหมอ = งานผู้ดูแล (เดิมเป็นปุ่มบนหัวบอร์ดเคส — ย้ายมาเป็นหน้าของตัวเอง 2026-08-19)
    { href: "/influ-doctors", label: "จัดการหมอ", icon: Stethoscope, show: canManage },
    {
      href: "/influencer-management/profiles",
      label: "โปรไฟล์",
      icon: UsersRound,
      show: canManage,
    },
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

  /** ชื่อหน้าที่เปิดอยู่ — โชว์กลางแถบบนของจอเล็กแทนโลโก้/เมนู */
  const activeLabel =
    visibleNav.find((n) => n.href === activeHref)?.label ?? "Influencer System";

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
        {/* ≥lg = แถวเดียว: [ชื่อระบบ] │ [เมนู] │ [ปุ่มบัญชี] — คั่นด้วยเส้นแบ่งให้เห็น
              สัดส่วนชัด (ผู้ใช้ 2026-08-20)
            <lg = แถวเดียวเหมือนกันแต่เป็นแบบแอปมือถือ: [กระดิ่ง] [ชื่อหน้าที่เปิดอยู่] [☰]
              (ผู้ใช้ 2026-08-30: "เอา logo ออกและเอาแจ้งเตือนไปไว้แทน · menu tab ด้านบน
              ทำให้เป็น berger ขวาบนสุด") — เมนูแถวล่างที่เลื่อนแนวนอนถูกถอดออกแล้ว
            ลำดับซ้าย→ขวาคุมด้วย `lg:order-*` เพราะกระดิ่งต้องอยู่ซ้ายสุดบนมือถือ แต่ไป
            อยู่กลุ่มปุ่มบัญชีทางขวาบนจอใหญ่ — **ห้าม mount กระดิ่งสองตัว**
            (realtime channel ชื่อชนกัน) จึงย้ายด้วย order ไม่ใช่ render ซ้ำ */}
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4 lg:gap-3">
          {userId && (
            <span className="order-first shrink-0 lg:order-5">
              <InfluNotificationBell userId={userId} canManage={canManage} />
            </span>
          )}

          {/* ชื่อหน้าที่เปิดอยู่ — บนมือถือเมนูถูกยุบเข้า drawer แล้ว ถ้าไม่บอกตรงนี้
              จะไม่เหลืออะไรบอกว่ากำลังอยู่หน้าไหน */}
          <span className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-stone-800 lg:hidden">
            {activeLabel}
          </span>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="เปิดเมนูระบบ Influencer"
            aria-expanded={menuOpen}
            className="ml-auto inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-white/70 hover:text-brand-700 active:scale-90 lg:hidden"
          >
            <Menu size={22} />
          </button>

          <Link
            href={canView ? "/influencers" : "/influ-gallery"}
            className="hidden min-w-0 shrink-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80 lg:order-1 lg:flex"
          >
            <LogoMark className="h-9 w-9 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-semibold tracking-wide text-stone-800">
                Influencer System
              </span>
            </span>
          </Link>

          {levelLabel && levelBadge && (
            // ซ่อนช่วง lg (แถวเดียวแต่ยังแคบ) แล้วกลับมาโชว์ที่ xl ขึ้นไป
            <span
              className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium lg:order-2 xl:inline-flex ${levelBadge}`}
              title="ระดับสิทธิ์ของบัญชีนี้ในระบบ Influencer"
            >
              <Sparkles size={11} /> {levelLabel}
            </span>
          )}

          <span
            aria-hidden
            className="hidden h-7 w-px shrink-0 bg-stone-200/90 lg:order-2 lg:block"
          />
          <ShellNav
            items={visibleNav}
            activeHref={activeHref}
            className="hidden min-w-0 flex-1 lg:order-3 lg:flex"
          />
          <span
            aria-hidden
            className="hidden h-7 w-px shrink-0 bg-stone-200/90 lg:order-3 lg:block"
          />

          <Link
            href={backHref}
            title="กลับไปแอปหลัก (งาน / แดชบอร์ด / ลิสต์ของฉัน)"
            className="hidden items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-white/70 hover:text-brand-700 active:scale-95 lg:order-4 lg:inline-flex"
          >
            <ArrowLeft size={16} />
            แอปหลัก
          </Link>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            title={`${displayName || "ผู้ใช้งาน"} — ตั้งค่าโปรไฟล์`}
            aria-label="ตั้งค่าโปรไฟล์"
            className="hidden cursor-pointer items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 lg:order-6 lg:inline-flex"
          >
            {avatar}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
            className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90 lg:order-7 lg:inline-flex"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* ---------- drawer เมนูของจอเล็ก (เลื่อนเข้าจากขวา = ฝั่งเดียวกับปุ่ม hamburger) ----------
          z-[60] ตามสเกลของระบบ (drawer/เมนูลอย) — โมดัลที่ z-[80] ยังทับได้ตามที่ควรเป็น */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-brand-900/30 backdrop-blur-sm animate-fade-in"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="เมนูระบบ Influencer"
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-white/70 bg-cream-soft/95 pt-safe pb-safe shadow-2xl backdrop-blur-2xl animate-slide-in-right"
          >
            <div className="flex items-center gap-2 border-b border-white/60 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-semibold tracking-wide text-stone-800">
                  Influencer System
                </span>
                <span className="block truncate text-[10px] leading-tight text-stone-400">
                  The ART — Aesthetic
                </span>
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="ปิดเมนู"
                className="-mr-1.5 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white/70 hover:text-brand-700 active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* บัญชีของฉัน — กดเพื่อตั้งค่าโปรไฟล์ (บนมือถือไม่มีรูปโปรไฟล์บนแถบบนแล้ว) */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setProfileOpen(true);
              }}
              className="flex cursor-pointer items-center gap-3 border-b border-white/60 px-4 py-3 text-left transition-colors hover:bg-white/60 active:scale-[0.99]"
            >
              {avatar}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-stone-800">
                  {displayName || userEmail || "ผู้ใช้งาน"}
                </span>
                <span className="block truncate text-xs text-stone-400">
                  {jobTitle || "ตั้งค่าโปรไฟล์"}
                </span>
              </span>
              {levelLabel && levelBadge && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${levelBadge}`}
                >
                  {levelLabel}
                </span>
              )}
            </button>

            <nav
              aria-label="เมนูระบบ Influencer"
              className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3"
            >
              {visibleNav.map(({ href, label, icon: Icon }) => {
                const active = href === activeHref;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors active:scale-[0.98] ${
                      active
                        ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-100"
                        : "text-stone-600 hover:bg-white/70 hover:text-brand-800"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={active ? "text-brand-600" : "text-stone-400"}
                    />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="shrink-0 space-y-1 border-t border-white/60 px-2 py-2">
              <Link
                href={backHref}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium text-stone-600 transition-colors hover:bg-white/70 hover:text-brand-800 active:scale-[0.98]"
              >
                <ArrowLeft size={18} className="text-stone-400" />
                กลับไปแอปหลัก
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 active:scale-[0.98]"
              >
                <LogOut size={18} />
                ออกจากระบบ
              </button>
            </div>
          </aside>
        </div>
      )}

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
