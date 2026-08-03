"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
    already_exists: "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ",
    password_too_short: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร",
  };
  return map[raw] ?? raw;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  function resetToEmail() {
    setStep("email");
    setPassword("");
    setConfirm("");
    setError(null);
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
      router.push("/dashboard");
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
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(authErrorText(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
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
                {error && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
                    {error}
                  </p>
                )}
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
                {error && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
                    {error}
                  </p>
                )}
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
                {error && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
                    {error}
                  </p>
                )}
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

/** แถวแสดงอีเมลที่เลือกไว้ + ปุ่มเปลี่ยน (กลับไปขั้นกรอกอีเมล) */
function EmailRow({
  email,
  onChange,
}: {
  email: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white/70 px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-stone-700">{email}</span>
      <button
        type="button"
        onClick={onChange}
        className="ml-2 flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-800 cursor-pointer"
      >
        <ArrowLeft size={12} /> เปลี่ยน
      </button>
    </div>
  );
}
