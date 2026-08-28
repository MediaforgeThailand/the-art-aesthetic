"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoLockup, LogoMark } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "login" | "signup";

/** เรียก edge function domain-auth (ก่อนล็อกอิน) แล้วโยน Error ไทยเมื่อไม่สำเร็จ */
async function callDomainAuth(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("domain-auth", {
    body,
  });
  if (error) {
    let raw = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as { error?: string };
        if (parsed?.error) raw = parsed.error;
      } catch {
        // body ไม่ใช่ JSON — ใช้ message เดิม
      }
    }
    throw new Error(raw);
  }
  return (data ?? {}) as Record<string, unknown>;
}

function authErrorText(raw: string): string {
  const map: Record<string, string> = {
    invalid_email: "รูปแบบอีเมลไม่ถูกต้อง",
    not_allowed:
      "อีเมลนี้ยังไม่ได้รับอนุญาตให้ใช้งาน — ติดต่อผู้ดูแลระบบเพื่อเพิ่มบัญชีให้",
    // อีเมลบริษัทที่ยังไม่มีบัญชี — สร้างเองได้ทาง Google เท่านั้น (migration 0094)
    use_google:
      "อีเมลบริษัทเข้าใช้งานได้เลย — กดปุ่ม “เข้าสู่ระบบด้วย Google” ด้านบน ระบบจะสร้างบัญชีให้อัตโนมัติ แล้วรอผู้ดูแลอนุมัติสิทธิ์",
    already_exists: "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ",
    password_too_short: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร",
    // สามอันล่างมาจาก /auth/callback (Google SSO) ที่ส่งเหตุผลกลับมาทาง query ?error=
    cancelled: "ยกเลิกการเข้าสู่ระบบด้วย Google",
    oauth_failed:
      "เข้าสู่ระบบด้วย Google ไม่สำเร็จ — ลองใหม่อีกครั้ง หรือใช้รหัสผ่านแทน",
    provider_disabled:
      "ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบด้วย Google — แจ้งผู้ดูแลระบบให้เปิดที่ Supabase",
  };
  return map[raw] ?? raw;
}

/**
 * ฟอร์มเข้าสู่ระบบ — แยกจาก page.tsx เพราะ page ต้องเป็น server component
 * เพื่ออ่าน ?error= (ที่ /auth/callback ของ Google SSO ส่งกลับมา) ตั้งแต่ฝั่ง server
 * ถ้าไปอ่านจาก window ฝั่ง client แทน จะได้ HTML ที่ไม่ตรงกับตอน hydrate
 */
export default function LoginClient({
  initialError,
  googleEnabled,
}: {
  /** คีย์ error ดิบจาก query — แปลงเป็นข้อความไทยด้วย authErrorText */
  initialError: string | null;
  /** เปิด provider google ที่ Supabase แล้วหรือยัง — ยังไม่เปิด = ไม่โชว์ปุ่ม (กดแล้วตาย) */
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? authErrorText(initialError) : null
  );
  // แยกจาก loading ของฟอร์ม — ปุ่ม Google กับปุ่มส่งฟอร์มต้องหมุนคนละตัว
  const [googleLoading, setGoogleLoading] = useState(false);

  const configured = isSupabaseConfigured();

  // ล้าง ?error= ออกจาก URL หลังอ่านค่าไปแสดงแล้ว — ไม่งั้นข้อความค้างตอน refresh
  // หรือกดย้อนกลับมาหน้านี้ (แตะแค่ History API ไม่ได้ตั้ง state จึงไม่ชนกฎ
  // react-hooks/set-state-in-effect ที่ห้าม setState ตรงๆ ใน effect)
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function resetToEmail() {
    setStep("email");
    setPassword("");
    setConfirm("");
    setError(null);
  }

  // เข้าสู่ระบบด้วย Google (SSO) — Supabase พาไปหน้ายืนยันตัวตนของ Google
  // แล้วส่งกลับมาที่ /auth/callback ซึ่งแลก code เป็น session ให้
  // **กติกาสิทธิ์ไม่เปลี่ยน** — อีเมลที่ไม่อยู่ใน allowed_emails ยังถูกปฏิเสธที่ DB เหมือนเดิม
  // (trigger handle_new_user, migration 0056) Google เป็นแค่วิธียืนยันว่าเป็นเจ้าของอีเมลจริง
  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // เครื่องที่ใช้ร่วมกันมักค้าง session Google ของคนก่อนหน้า — บังคับเลือกบัญชีทุกครั้ง
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(
        authErrorText(
          /not enabled|unsupported provider/i.test(error.message)
            ? "provider_disabled"
            : "oauth_failed"
        )
      );
      setGoogleLoading(false);
      return;
    }
    // ไม่ error = เบราว์เซอร์กำลังเด้งไป Google แล้ว — คง loading ไว้ ห้ามปลดให้กดซ้ำได้
  }

  // ขั้นที่ 1 — กรอกอีเมลแล้วเช็คว่ามีบัญชีหรือยัง / ได้รับอนุญาตไหม
  async function handleEmailNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await callDomainAuth({ action: "check", email });
      if (res.exists) {
        setStep("login");
      } else if (res.allowed) {
        setStep("signup");
      } else if (res.domain_allowed) {
        // อีเมลบริษัทที่ยังไม่มีบัญชี — สร้างบัญชีเองได้ แต่ต้องผ่าน Google
        // (Google เป็นคนพิสูจน์ว่าเป็นเจ้าของกล่องเมลจริง — ดู migration 0094)
        setError(authErrorText("use_google"));
      } else {
        setError(authErrorText("not_allowed"));
      }
    } catch (err) {
      setError(authErrorText(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  // ขั้นเข้าสู่ระบบ (มีบัญชีแล้ว)
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "รหัสผ่านไม่ถูกต้อง"
            : error.message
        );
        return;
      }
      // /start เลือกหน้าแรกตามสิทธิ์ของคนนั้น — เดิมชี้ /dashboard ตายตัว
      // คนที่ไม่มีสิทธิ์ data เจอ "ไม่มีสิทธิ์เข้าถึง" ทุกครั้งที่ล็อกอิน
      router.push("/start");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // ขั้นตั้งรหัสผ่านครั้งแรก (ยังไม่มีบัญชี, domain ได้รับอนุญาต)
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(authErrorText("password_too_short"));
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    try {
      await callDomainAuth({
        action: "signup",
        email,
        password,
        full_name: fullName,
      });
      // สร้างบัญชีแล้ว — เข้าสู่ระบบต่อทันที
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      // /start เลือกหน้าแรกตามสิทธิ์ของคนนั้น — เดิมชี้ /dashboard ตายตัว
      // คนที่ไม่มีสิทธิ์ data เจอ "ไม่มีสิทธิ์เข้าถึง" ทุกครั้งที่ล็อกอิน
      router.push("/start");
      router.refresh();
    } catch (err) {
      setError(authErrorText(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    // min-h-dvh ไม่ใช่ min-h-screen: 100vh บนมือถือคือความสูง "ตอนแถบ address ยุบ"
    // การ์ดฟอร์มเลยถูกจัดกึ่งกลางของกล่องที่สูงเกินจริง ปุ่มตกใต้ fold ตั้งแต่เปิดหน้าแรก
    <div className="flex min-h-dvh">
      {/* แผงแบรนด์ฝั่งซ้าย — desktop (ไล่เฉดตาม artwork โลโก้) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#dcab9c] via-[#c48b78] to-[#a3634f] lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-cream/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-brand-800/20 blur-3xl" />
        <div className="animate-fade-in-up">
          <LogoLockup />
        </div>
        <p
          className="mt-10 max-w-sm text-center text-sm leading-6 text-cream/90 animate-fade-in-up"
          style={{ animationDelay: "120ms" }}
        >
          ระบบจัดการหลังบ้านแผนก Aesthetic
          <br />
          งาน · เอกสาร · รายงาน · แดชบอร์ดยอดขาย
        </p>
      </div>

      {/* ฟอร์มฝั่งขวา */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in-up">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <LogoMark className="h-14 w-14" />
            <h1 className="font-display mt-3 text-2xl font-bold text-brand-800">
              The ART
            </h1>
            <p className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.3em] text-brand-500">
              Plastic Surgery Hospital
            </p>
          </div>

          <div className="hidden lg:mb-8 lg:block">
            <h1 className="text-xl font-semibold text-stone-900">
              {step === "signup" ? "ตั้งรหัสผ่านครั้งแรก" : "ยินดีต้อนรับ"}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {step === "email" && "กรอกอีเมลเพื่อเข้าสู่ระบบหรือเริ่มใช้งานครั้งแรก"}
              {step === "login" && "กรอกรหัสผ่านเพื่อเข้าสู่ระบบ"}
              {step === "signup" &&
                "อีเมลนี้ยังไม่มีบัญชี — ตั้งรหัสผ่านที่ต้องการเพื่อเริ่มใช้งาน"}
            </p>
          </div>

          <div className="glass rounded-xl p-6 shadow-[0_12px_40px_rgba(94,58,49,0.12)]">
            {!configured && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                ยังไม่ได้ตั้งค่า Supabase ใน .env.local —
                เข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่าเสร็จ
              </div>
            )}

            {/* เข้าสู่ระบบด้วย Google — อยู่บนสุดของการ์ดเพื่อให้กดได้ทุกขั้นของฟอร์ม
                (คนส่วนใหญ่ใช้ทางนี้ ส่วนอีเมล+รหัสผ่านเก็บไว้เป็นทางสำรอง) */}
            {googleEnabled && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGoogle}
                  loading={googleLoading}
                  disabled={!configured}
                  className="w-full"
                >
                  {!googleLoading && <GoogleLogo />}
                  เข้าสู่ระบบด้วย Google
                </Button>

                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-stone-200" />
                  <span className="text-xs text-stone-400">หรือ</span>
                  <span className="h-px flex-1 bg-stone-200" />
                </div>
              </>
            )}

            {/* กล่องข้อความผิดพลาดรวมที่เดียว — ใช้ทั้ง 3 ขั้นของฟอร์มและ Google SSO
                (เดิมเป็นกล่องซ้ำกัน 3 ชุดในแต่ละฟอร์ม ซึ่ง error จาก Google ไม่มีที่ลง) */}
            {error && (
              <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
                {error}
              </p>
            )}

            {/* ขั้นที่ 1 — อีเมล */}
            {step === "email" && (
              <form onSubmit={handleEmailNext} className="space-y-4">
                <div>
                  <Label htmlFor="email">อีเมล</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@artsurgery.co.th"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  loading={loading}
                  disabled={!configured}
                  className="w-full"
                >
                  ถัดไป
                </Button>
                <p className="text-center text-xs text-stone-400">
                  ใช้อีเมลที่ผู้ดูแลระบบเพิ่มบัญชีให้แล้วเท่านั้น
                  <br />
                  ยังไม่มีบัญชี — ติดต่อผู้ดูแลระบบเพื่อเปิดให้
                </p>
              </form>
            )}

            {/* ขั้นเข้าสู่ระบบ */}
            {step === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <EmailRow email={email} onChange={resetToEmail} />
                <div>
                  <Label htmlFor="password">รหัสผ่าน</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    autoComplete="current-password"
                  />
                </div>
                <Button
                  type="submit"
                  loading={loading}
                  disabled={!configured}
                  className="w-full"
                >
                  เข้าสู่ระบบ
                </Button>
              </form>
            )}

            {/* ขั้นตั้งรหัสผ่านครั้งแรก */}
            {step === "signup" && (
              <form onSubmit={handleSignup} className="space-y-4">
                <EmailRow email={email} onChange={resetToEmail} />
                <div>
                  <Label htmlFor="fullName">ชื่อ-นามสกุล</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="เช่น สมหญิง ใจดี"
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="password">ตั้งรหัสผ่าน</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm">ยืนยันรหัสผ่าน</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  loading={loading}
                  disabled={!configured}
                  className="w-full"
                >
                  ตั้งรหัสผ่านและเข้าใช้งาน
                </Button>
                <p className="text-center text-xs text-stone-400">
                  เริ่มต้นบัญชีจะยังไม่เห็นเมนูรายงาน/งาน จนกว่าผู้ดูแลระบบจะเปิดสิทธิ์ให้
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** โลโก้ G สี่สีของ Google — ฝังเป็น SVG ในไฟล์ (lucide ไม่มีโลโก้แบรนด์
    และระบบต้อง self-host ได้ ห้ามดึงรูปจาก CDN ภายนอก) */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** แถวแสดงอีเมลที่เลือกไว้ + ปุ่มเปลี่ยน (กลับไปขั้นกรอกอีเมล) */
function EmailRow({
  email,
  onChange,
}: {
  email: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white/70 py-1 pl-3 pr-1 text-sm">
      <span className="min-w-0 truncate text-stone-700">{email}</span>
      {/* ทางเดียวที่จะย้อนไปแก้อีเมลที่พิมพ์ผิด — ของเดิมไม่มี padding เลย เป้ากดสูง 16px */}
      <button
        type="button"
        onClick={onChange}
        className="ml-2 flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-3 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800 active:scale-95 sm:min-h-0 sm:py-1.5"
      >
        <ArrowLeft size={14} /> เปลี่ยน
      </button>
    </div>
  );
}
