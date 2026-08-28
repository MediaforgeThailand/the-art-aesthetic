"use client";

import {
  ChevronRight,
  HeartPulse,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";
import { ProfileSettingsModal } from "@/components/profile-settings";
import { Modal } from "@/components/ui";
import { WELLNESS_ICONS } from "@/components/wellness/icons";
import { createClient } from "@/lib/supabase/client";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  wellnessExtraPagesFor,
  wellnessHomeHref,
  wellnessLabelOf,
  wellnessTabsFor,
  wellnessWorkspacesFor,
  type WellnessRoleFlags,
  type WellnessWorkspace,
} from "@/lib/wellness-constants";

/** ป้ายบทบาทสั้นๆ (เดสก์ท็อป) — Wellness เป็นสวิตช์อิสระ คนเดียวมีได้หลายบทบาท */
function roleLabelOf(flags: WellnessRoleFlags): string | null {
  if (flags.admin) return "Admin";
  const parts: string[] = [];
  if (flags.bc) parts.push("BC");
  if (flags.lab) parts.push("Lab");
  if (flags.doctor) parts.push("แพทย์");
  return parts.length > 0 ? parts.join(" + ") : null;
}

/** เมนูแนวนอนบนแถบบนของเดสก์ท็อป (≥lg เท่านั้น — จอเล็กใช้แถบแท็บล่าง) */
function DesktopNav({
  items,
  activeHref,
  flags,
}: {
  items: WellnessWorkspace[];
  activeHref: string | null;
  flags: WellnessRoleFlags;
}) {
  return (
    <nav
      aria-label="เมนูระบบ Wellness"
      className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((w) => {
        const Icon = WELLNESS_ICONS[w.icon];
        const active = w.href === activeHref;
        return (
          <Link
            key={w.href}
            href={w.href}
            aria-current={active ? "page" : undefined}
            title={w.detail}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97] xl:px-3 ${
              active
                ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-100"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-800"
            }`}
          >
            <Icon size={16} className={active ? "text-brand-600" : ""} />
            {wellnessLabelOf(w, flags).label}
          </Link>
        );
      })}
    </nav>
  );
}

/** เนื้อในของแท็บ 1 ช่อง — ใช้ทั้งลิงก์และปุ่ม (เพิ่มเติม) ให้หน้าตาตรงกันเป๊ะ */
function TabInner({
  label,
  active,
  step,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  /** เลขขั้นใน flow — โชว์เป็นตัวเลขจิ๋วบนไอคอนให้เห็นลำดับงาน */
  step?: number | null;
  icon: LucideIcon;
}) {
  return (
    <>
      <span
        className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
          active ? "bg-brand-100/90 text-brand-700" : "text-stone-400"
        }`}
      >
        <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
        {step != null && (
          <span
            className={`absolute right-2.5 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold ${
              active
                ? "bg-brand-600 text-white"
                : "bg-stone-200 text-stone-500"
            }`}
          >
            {step}
          </span>
        )}
      </span>
      <span
        className={`max-w-full truncate text-[11px] font-medium leading-none ${
          active ? "text-brand-700" : "text-stone-500"
        }`}
      >
        {label}
      </span>
    </>
  );
}

const TAB_CLASS =
  "flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 py-1.5 active:scale-95";

/**
 * โครงหน้าของ **ระบบ Wellness** — หน้าตาแบบแอปมือถือ (redesign 2026-08-28 รอบสอง
 * ตามผู้ใช้: "เมนูข้างบนยังเป็นของทีมเดิม ทำให้เป็น mobile base อยู่ข้างล่างเหมือน app มือถือ
 * และไม่ต้องมีปุ่มย้อนกลับไปแอปหลักและแจ้งเตือน — ระบบนี้ไม่เกี่ยวกับระบบทีมและ influ")
 *
 * - จอ <lg: **ไม่มีแถบบนเลย** (เนื้อหาแต่ละหน้าชนขอบบนจอ — ปฏิทินไล่เฉดกลืนจากขอบบนได้)
 *   เมนูเป็น **แถบแท็บล่าง** แบบแอปมือถือ + แท็บ "โปรไฟล์" เปิด sheet บัญชีของฉัน
 * - จอ ≥lg: แถบบนแถวเดียว (โลโก้ + เมนู + โปรไฟล์/ออกจากระบบ)
 * - **ไม่มีปุ่ม "แอปหลัก" และไม่มีกระดิ่งแจ้งเตือน** — ห้ามเอากลับมา
 */
export function WellnessShell({
  userId,
  userName,
  userEmail,
  flags,
  children,
}: {
  userId: string | null;
  userName: string;
  userEmail: string;
  /** บทบาทที่ติ๊กไว้จริงของบัญชีนี้ (ดู wellnessRoleFlags) */
  flags: WellnessRoleFlags;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(userName);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
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

  const workspaces = wellnessWorkspacesFor(flags);
  const tabs = wellnessTabsFor(flags); // เรียงตาม flow: ทะเบียน → ผลแลบ → ติดต่อ → ลงคิว → คิวตรวจ
  const extraPages = wellnessExtraPagesFor(flags);
  // หน้าเลือกงานมีจริงเฉพาะคนหลายบทบาท/admin (บทบาทเดียว /wellness เด้งเข้าหน้างานทันที)
  const showHome = wellnessHomeHref(flags) === null;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // เมนู active บนเดสก์ท็อป = prefix ที่ตรงและยาวที่สุด
  const activeHref =
    workspaces
      .filter((w) => isActive(w.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  const roleLabel = roleLabelOf(flags);

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

  const avatarCircle = (size: string, text: string) =>
    avatarPath && avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName || "รูปโปรไฟล์"}
        className={`${size} shrink-0 rounded-full object-cover shadow-sm`}
      />
    ) : (
      <span
        className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-semibold text-brand-800 ${text}`}
      >
        {(displayName || userEmail || "?").charAt(0).toUpperCase()}
      </span>
    );

  return (
    // h-dvh กันแถบ address bar มือถือกินความสูง (100vh เพี้ยนบน iOS/Android)
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ---------- แถบบน: เดสก์ท็อปเท่านั้น ---------- */}
      <header className="hidden shrink-0 border-b border-white/60 bg-white/60 pt-safe backdrop-blur-xl lg:block">
        <div className="flex items-center gap-3 px-4 py-2">
          <Link
            href="/wellness"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
          >
            <LogoMark className="h-9 w-9 shrink-0" />
            <span className="block truncate font-display text-sm font-semibold tracking-wide text-stone-800">
              Wellness System
            </span>
          </Link>

          {roleLabel && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700"
              title="บทบาทของบัญชีนี้ในระบบ Wellness"
            >
              <HeartPulse size={11} /> {roleLabel}
            </span>
          )}

          <span aria-hidden className="h-7 w-px shrink-0 bg-stone-200/90" />
          <DesktopNav items={workspaces} activeHref={activeHref} flags={flags} />
          <span aria-hidden className="h-7 w-px shrink-0 bg-stone-200/90" />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              title={`${displayName || "ผู้ใช้งาน"} — ตั้งค่าโปรไฟล์`}
              aria-label="ตั้งค่าโปรไฟล์"
              className="inline-flex cursor-pointer items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
            >
              {avatarCircle("h-8 w-8", "text-xs")}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="ออกจากระบบ"
              aria-label="ออกจากระบบ"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* แต่ละหน้าคุม scroll เอง — จอเล็กเนื้อหาเริ่มที่ขอบบนจอ (ไม่มีแถบบน) */}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden lg:pb-safe">
        {children}
      </main>

      {/* ---------- แถบแท็บล่างแบบแอปมือถือ: จอ <lg ----------
           เรียงตาม flow เสมอ (ทะเบียน → ผลแลบ → ติดต่อ → ลงคิว → คิวตรวจ)
           แล้วปิดท้ายด้วย "เพิ่มเติม" ที่รวมหน้าเครื่องมือ + บัญชี */}
      <nav
        aria-label="เมนูระบบ Wellness"
        className="flex shrink-0 items-stretch border-t border-stone-200/80 bg-white/95 px-0.5 pb-safe backdrop-blur-xl lg:hidden"
      >
        {tabs.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            aria-current={isActive(w.href) ? "page" : undefined}
            className={TAB_CLASS}
          >
            <TabInner
              label={wellnessLabelOf(w, flags).short}
              active={isActive(w.href)}
              step={w.step}
              icon={WELLNESS_ICONS[w.icon]}
            />
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          aria-label="เพิ่มเติม และบัญชีของฉัน"
          className={TAB_CLASS}
        >
          <TabInner
            label="เพิ่มเติม"
            active={accountOpen || profileOpen}
            icon={MoreHorizontal}
          />
        </button>
      </nav>

      {/* ---------- sheet เพิ่มเติม + บัญชีของฉัน (จากแท็บขวาสุด) ---------- */}
      <Modal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title="เพิ่มเติม"
      >
        <div className="space-y-3">
          {(showHome || extraPages.length > 0) && (
            <div className="space-y-1.5">
              {showHome && (
                <Link
                  href="/wellness"
                  onClick={() => setAccountOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-xl bg-white/70 px-3 text-[15px] text-stone-700 transition-colors hover:bg-brand-50"
                >
                  <LayoutGrid size={18} className="shrink-0 text-brand-500" />
                  หน้าเลือกงาน
                  <ChevronRight size={16} className="ml-auto text-stone-300" />
                </Link>
              )}
              {extraPages.map((w) => {
                const Icon = WELLNESS_ICONS[w.icon];
                return (
                  <Link
                    key={w.href}
                    href={w.href}
                    onClick={() => setAccountOpen(false)}
                    className="flex min-h-12 items-center gap-3 rounded-xl bg-white/70 px-3 text-[15px] text-stone-700 transition-colors hover:bg-brand-50"
                  >
                    <Icon size={18} className="shrink-0 text-brand-500" />
                    {wellnessLabelOf(w, flags).label}
                    <ChevronRight size={16} className="ml-auto text-stone-300" />
                  </Link>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-3">
            {avatarCircle("h-11 w-11", "text-base")}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-stone-800">
                {displayName || "ผู้ใช้งาน"}
              </p>
              <p className="truncate text-[13px] text-stone-400">{userEmail}</p>
              {jobTitle && (
                <p className="truncate text-[13px] text-stone-400">{jobTitle}</p>
              )}
            </div>
            {roleLabel && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                <HeartPulse size={12} /> {roleLabel}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setAccountOpen(false);
              setProfileOpen(true);
            }}
            className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] text-stone-700 transition-colors hover:bg-brand-50"
          >
            <Settings size={18} className="text-stone-400" /> ตั้งค่าโปรไฟล์
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] text-rose-600 transition-colors hover:bg-rose-50"
          >
            <LogOut size={18} /> ออกจากระบบ
          </button>
        </div>
      </Modal>

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
