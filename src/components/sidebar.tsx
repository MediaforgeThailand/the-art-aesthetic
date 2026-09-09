"use client";

import {
  ClipboardList,
  Hash,
  Images,
  LayoutDashboard,
  Link2,
  ListOrdered,
  ListTodo,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Tags,
  Target,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSignedUrl } from "@/lib/use-signed-url";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileSettingsModal } from "@/components/profile-settings";
import { INFLU_APP_URL } from "@/lib/constants";
import type { AppPermission } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/** perm = สิทธิ์ที่ต้องมีถึงจะเห็นเมนู (array = มีสิทธิ์ใดสิทธิ์หนึ่งก็เห็น);
    null = เห็นได้ทุกคน; "admin" = เฉพาะ admin */
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm: AppPermission | AppPermission[] | "admin" | null;
  /** ป้ายสั้นสำหรับแถบเมนูล่างบนมือถือ (ช่องกว้าง ~70px) — ไม่ใส่ = ไม่ขึ้นแถบล่าง */
  short?: string;
  /** ป้ายใต้ไอคอนบนแถบเมนูจอใหญ่ (กว้าง 68px) — ทุกเมนูต้องมี ไม่งั้นตกไปใช้ label เต็มแล้วล้น
      แยกจาก `short` เพราะ short คุมด้วยว่าเมนูนั้นขึ้นแถบล่างมือถือหรือไม่ */
  rail: string;
};

/** ลำดับความสำคัญของแถบเมนูล่างบนมือถือ — หยิบ 4 อันแรกที่ผู้ใช้คนนั้นมีสิทธิ์
    (เรียงตามที่ทีมเปิดบ่อยจริง ไม่ใช่ตามลำดับใน sidebar) */
const MOBILE_NAV_ORDER = [
  "/tasks",
  INFLU_APP_URL,
  "/queue",
  "/my-tasks",
  "/dashboard",
  "/pricing",
  "/files",
];
const MOBILE_NAV_MAX = 4;

/** สิทธิ์ทุกระดับของระบบ Influencer + ทีมคอนเทนต์ที่ดูโปรไฟล์ influ ได้ (ระบบนั้นเป็นแอปแยก
    คนละ repo/โดเมน — ที่นี่เหลือแค่ทางเข้า และแอปนั้นเลือกหน้าแรกตามสิทธิ์ให้เอง) */
const INFLU_PERMS: AppPermission[] = ["influ", "influ_hunter", "influ_view", "team"];

const navItems: NavItem[] = [
  // แดชบอร์ด = รายงานทุก section ในหน้าเดียว (เมนู "รายงาน" /reports ถูกถอดออก 2026-08-07 เพราะซ้ำกับหน้านี้)
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard, perm: "data", short: "แดชบอร์ด", rail: "แดชบอร์ด" },
  { href: "/pricing", label: "Product Pricing", icon: Tags, perm: "pricing", short: "ราคา", rail: "ราคา" },
  // ระบบ Influencer = แอปแยก (repo the-art-influencer, 2026-09-08) — ปุ่มเดียวพาออกไปทั้งระบบ
  // (next/link รับ URL เต็มได้ เบราว์เซอร์นำทางปกติ) แอปนั้น /start เลือกหน้าแรกตามสิทธิ์เอง:
  // ระดับ influ* → บอร์ดเคส, สิทธิ์ team อย่างเดียว → แกลเลอรีโปรไฟล์ (อ่านอย่างเดียว)
  {
    href: INFLU_APP_URL,
    label: "Influencer System",
    icon: Sparkles,
    perm: INFLU_PERMS,
    short: "Influ",
    rail: "Influ",
  },
  { href: "/tasks", label: "Task", icon: ClipboardList, perm: "team", short: "งาน", rail: "Task" },
  // Sales Queue = ระบบคิวลูกค้าออนไลน์ของทีม BC (รวมเข้าแอปนี้ 2026-09-09 — เดิม queue.theartbb.com)
  // แท็บภายในระบบ (คิว/วางข้อมูล/ทีม/อันดับ/ประวัติ) อยู่ที่ (app)/queue/queue-nav.tsx
  { href: "/queue", label: "Sales Queue", icon: ListOrdered, perm: "sales_queue", short: "คิว", rail: "คิว" },
  // ศูนย์รวมแท็กของทีมคอนเทนต์ (0100) — ทะเบียนหมอ + influ ที่ติดแท็กได้ + แฮชแท็กบังคับ
  { href: "/tag-management", label: "จัดการแท็ก", icon: Hash, perm: "team", rail: "แท็ก" },
  // คลังไฟล์รวมของงาน (ดู/ดาวน์โหลดอย่างเดียว — อัพโหลดทำที่การ์ดงาน)
  { href: "/all-media", label: "All Media", icon: Images, perm: "team", rail: "Media" },
  // ลิสต์ส่วนตัว — perm: null เพราะเป็นพื้นที่ของแต่ละบัญชีเอง ไม่ใช่ข้อมูลของแผนก
  // (RLS ที่ list_tasks ยึด owner_id — เปิดเมนูให้ทุกคนก็ไม่มีทางเห็นลิสต์ของคนอื่น)
  { href: "/my-tasks", label: "งานของฉัน", icon: ListTodo, perm: null, short: "ของฉัน", rail: "ของฉัน" },
  { href: "/workload", label: "Team Workload", icon: Users, perm: "team", rail: "ทีม" },
  // แดชบอร์ดติดตาม KPI ทีมคอนเทนต์ (0085) — หน้าตั้งค่า /content-kpi เข้าจากปุ่มบนหน้านี้
  { href: "/content-tracking", label: "KPI คอนเทนต์", icon: Target, perm: "team", rail: "KPI" },
  { href: "/files", label: "คลังลิงก์ไฟล์", icon: Link2, perm: "team", short: "ไฟล์", rail: "ไฟล์" },
  { href: "/accounts", label: "จัดการบัญชี", icon: UserCog, perm: "admin", rail: "บัญชี" },
];

/**
 * เมนูหลักของแอป
 * - จอใหญ่ (≥lg): **แถบไอคอนแคบ 84px** (ไอคอนบน + ป้ายสั้นใต้ไอคอน) — คืนพื้นที่แนวนอน
 *   ให้เนื้อหาของทุกหน้า; ชื่อเมนูเต็มอยู่ใน `title` ของแต่ละปุ่ม
 * - มือถือ/จอแคบ: topbar (ปุ่มเมนู + โลโก้ + กระดิ่ง) + drawer เลื่อนเข้าจากซ้าย + แถบเมนูล่าง
 *   (drawer ยังใช้เมนูแบบ "ไอคอน + ชื่อเต็ม" เพราะกว้างพอและอ่านง่ายกว่าบนจอเล็ก)
 */
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
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { url: avatarUrl } = useSignedUrl(avatarPath);

  // กระดิ่งต้อง mount ตัวเดียว (realtime channel ชื่อซ้ำกันชนกัน) — เลือกจุดวางตาม
  // ขนาดจอ; ค่าเริ่มอ่านจาก matchMedia ตอน mount (bell render หลัง mount อยู่แล้ว
  // เพราะรอ userId เลยไม่มีปัญหา hydration)
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    // ฟังทั้ง change ของ media query และ resize — บางเบราว์เซอร์/webview
    // ไม่ยิง change event ตอน viewport เปลี่ยน (เช่น หมุนจอ/ย่อหน้าต่าง)
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // ปิด drawer ด้วย Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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
        .select("role, permissions, full_name, avatar_path, job_title")
        .eq("id", uid)
        .single()
        .then(({ data: profile }) => {
          if (!alive || !profile) return;
          if (profile.role === "admin") setIsAdmin(true);
          setPermissions((profile.permissions ?? []) as AppPermission[]);
          // ชื่อใน profiles คือค่าจริงล่าสุด (JWT claims อาจยังเป็นชื่อเก่า)
          if (profile.full_name) setDisplayName(profile.full_name);
          setAvatarPath(profile.avatar_path ?? null);
          setJobTitle(profile.job_title ?? null);
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
    if (Array.isArray(item.perm))
      return item.perm.some((p) => permissions.includes(p));
    return permissions.includes(item.perm);
  });

  /** เมนูนี้ active ไหม (ระบบ Influencer อยู่คนละโครงแล้ว — แถบนี้ไม่ถูก render ที่นั่น)
      /content-kpi (หน้าตั้งค่า) นับเป็นเมนู KPI คอนเทนต์ด้วย — เข้าจากปุ่มบนแดชบอร์ดติดตาม */
  const isActive = (item: Pick<NavItem, "href">) =>
    pathname.startsWith(item.href) ||
    (item.href === "/content-tracking" && pathname.startsWith("/content-kpi"));

  /** เมนูของแถบล่างบนมือถือ — 4 อันแรกตาม MOBILE_NAV_ORDER ที่ผู้ใช้คนนี้มีสิทธิ์เห็น
      (ใช้ป้ายสั้น `short` เพราะช่องกว้างแค่ ~70px) */
  const mobileNav = MOBILE_NAV_ORDER.map((href) =>
    visibleNav.find((n) => n.href === href && n.short)
  )
    .filter((n): n is NavItem => n !== undefined)
    .slice(0, MOBILE_NAV_MAX)
    .map((n) => ({ ...n, label: n.short ?? n.label }));

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

  /** รูปโปรไฟล์ (หรือตัวอักษรแรก) — ใช้ทั้งแถบไอคอนจอใหญ่และแถบโปรไฟล์ใน drawer */
  const renderAvatar = (className: string) =>
    avatarPath && avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName || "รูปโปรไฟล์"}
        className={`shrink-0 rounded-full object-cover shadow-sm ${className}`}
      />
    ) : (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-xs font-semibold text-brand-800 ${className}`}
      >
        {(displayName || userEmail || "?").charAt(0).toUpperCase()}
      </span>
    );

  /** เมนูแบบแถบไอคอนของจอใหญ่ — ป้ายสั้นใต้ไอคอน, ชื่อเต็มอยู่ใน tooltip */
  const renderRail = () => (
    <nav
      aria-label="เมนูหลัก"
      className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-1.5"
    >
      {visibleNav.map((item) => {
        const { href, label, icon: Icon, rail } = item;
        const active = isActive(item);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-current={active ? "page" : undefined}
            className={`group relative flex w-[68px] shrink-0 flex-col items-center gap-0.5 rounded-[10px] px-1 py-2 text-center transition-all duration-200 active:scale-[0.97] ${
              active
                ? "bg-white/85 text-brand-700 shadow-sm"
                : "text-stone-600 hover:bg-white/70 hover:text-brand-800"
            }`}
          >
            <span
              className={`absolute -left-2 top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-400 to-brand-600 transition-opacity duration-300 ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
            <Icon
              size={20}
              className={`transition-colors duration-200 ${
                active ? "text-brand-600" : "group-hover:text-brand-500"
              }`}
            />
            <span
              className={`w-full truncate text-[10px] leading-tight ${
                active ? "font-semibold" : "font-medium"
              }`}
            >
              {rail}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  /** ท้ายแถบไอคอน — กระดิ่ง · รูปโปรไฟล์ (เปิดตั้งค่า) · ออกจากระบบ */
  const renderRailFooter = () => (
    <div className="flex w-full flex-col items-center gap-1.5 border-t border-white/60 px-2 py-3">
      {userId && isDesktop && <NotificationBell userId={userId} />}
      <button
        type="button"
        onClick={() => setProfileOpen(true)}
        title={`${displayName || "ผู้ใช้งาน"} — ตั้งค่าโปรไฟล์`}
        aria-label="ตั้งค่าโปรไฟล์"
        className="cursor-pointer rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
      >
        {renderAvatar("h-9 w-9")}
      </button>
      <button
        onClick={handleLogout}
        title="ออกจากระบบ"
        aria-label="ออกจากระบบ"
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90"
      >
        <LogOut size={17} />
      </button>
    </div>
  );

  /** ลิสต์เมนู — ใช้ใน drawer มือถือ (คลิกแล้วปิด drawer) */
  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {visibleNav.map((item) => {
        const { href, label, icon: Icon } = item;
        const active = isActive(item);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
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
  );

  /** แถบโปรไฟล์ + ปุ่มออกจากระบบ ท้ายเมนู */
  const renderFooter = () => (
    <div className="border-t border-white/60 px-3 py-3">
      <div className="flex items-center gap-1 rounded-lg px-1 py-2">
        {/* กดที่ชื่อ/รูป = เปิดตั้งค่าโปรไฟล์ (เปลี่ยนชื่อ + รูป) */}
        <button
          type="button"
          onClick={() => {
            // ปิด drawer ก่อน — ไม่งั้นโมดัลโผล่ทับ/ใต้ drawer แล้วดูเหมือนกดไม่ติด
            setDrawerOpen(false);
            setProfileOpen(true);
          }}
          title="ตั้งค่าโปรไฟล์ (เปลี่ยนชื่อ/รูป)"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors duration-200 hover:bg-white/60 active:scale-[0.98]"
        >
          {renderAvatar("h-9 w-9")}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-stone-800">
              {displayName || "ผู้ใช้งาน"}
            </span>
            <span className="block truncate text-xs text-stone-400">
              {jobTitle || userEmail}
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
          aria-label="ออกจากระบบ"
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90 max-lg:h-11 max-lg:w-11"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ---------- จอใหญ่: แถบไอคอนแคบ 84px ---------- */}
      <aside className="hidden h-dvh w-[5.25rem] shrink-0 flex-col items-center border-r border-white/60 bg-white/55 backdrop-blur-xl lg:flex">
        <div className="shrink-0 px-2 pb-2.5 pt-3.5">
          <LogoMark className="h-10 w-10" />
        </div>
        {renderRail()}
        {renderRailFooter()}
      </aside>

      {/* ---------- มือถือ: topbar (เมนู + โลโก้ + กระดิ่ง) ----------
           pt-safe = เผื่อ status bar ตอนติดตั้งเป็น PWA (standalone ไม่มีแถบเบราว์เซอร์
           เนื้อหาจะไหลขึ้นไปใต้ notch ถ้าไม่กันพื้นที่ แถบนี้จะจมจนกดเมนูไม่ได้) */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-white/60 bg-white/55 px-3 py-2 pt-safe backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="เปิดเมนู"
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-white/70 hover:text-brand-700 active:scale-90"
        >
          <Menu size={22} />
        </button>
        <LogoMark className="h-9 w-9" />
        <LogoWordmark />
        {userId && !isDesktop && (
          <span className="ml-auto">
            <NotificationBell userId={userId} />
          </span>
        )}
      </header>

      {/* ---------- มือถือ: แถบเมนูล่าง ----------
           หน้าที่ทีมเปิดบ่อยที่สุดอยู่ในระยะนิ้วโป้ง ไม่ต้องเปิด drawer ทุกครั้ง
           เลือกเมนูตามสิทธิ์จริงของแต่ละคน (ดู mobileNav) + ช่องสุดท้ายเปิด drawer เมนูเต็ม */}
      {/* z-40 = ชั้น "โครงแอป" ตั้งใจให้ต่ำกว่าทุกอย่างที่กินเต็มจอ (แผงงาน/แผงคิว/โมดัล = 50+)
          แถบนี้จึงถูกแผงเหล่านั้นคลุมทับตอนเปิด แทนที่จะลอยค้างขวางปุ่มในแผง */}
      <nav
        aria-label="เมนูหลัก"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/60 bg-cream-soft/95 pb-safe backdrop-blur-xl lg:hidden"
      >
        {mobileNav.map((item) => {
          const { href, label, icon: Icon } = item;
          const active = isActive(item);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors active:scale-95 ${
                active ? "text-brand-700" : "text-stone-500"
              }`}
            >
              <Icon size={21} className={active ? "text-brand-600" : ""} />
              <span className="w-full truncate px-0.5 text-center text-[10px] font-medium leading-tight">
                {label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="เปิดเมนูทั้งหมด"
          className="flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 py-1.5 text-stone-500 transition-colors active:scale-95"
        >
          <Menu size={21} />
          <span className="text-[10px] font-medium leading-tight">เมนู</span>
        </button>
      </nav>

      {/* ---------- drawer เมนูมือถือ ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-brand-900/30 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/70 bg-cream-soft/95 pt-safe pb-safe shadow-2xl backdrop-blur-2xl animate-slide-in-left">
            <div className="flex items-center gap-3 border-b border-white/60 px-4 py-4">
              <LogoMark className="h-11 w-11" />
              <LogoWordmark />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="ปิดเมนู"
                className="ml-auto cursor-pointer rounded-lg p-2 text-stone-400 transition-colors hover:bg-white/70 hover:text-brand-700 active:scale-90"
              >
                <X size={18} />
              </button>
            </div>
            {renderNav(() => setDrawerOpen(false))}
            {renderFooter()}
          </aside>
        </div>
      )}

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
    </>
  );
}
