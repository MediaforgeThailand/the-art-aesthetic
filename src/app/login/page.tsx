"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoLockup, LogoMark } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(
            error.message === "Invalid login credentials"
              ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
              : error.message
          );
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) {
          setError(error.message);
          return;
        }
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setInfo("สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ");
          setMode("login");
        }
      }
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
              ยินดีต้อนรับกลับ
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              เข้าสู่ระบบเพื่อจัดการงานของแผนก
            </p>
          </div>

          <div className="glass rounded-xl p-6 shadow-[0_12px_40px_rgba(94,58,49,0.12)]">
            {!configured && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                ยังไม่ได้ตั้งค่า Supabase ใน .env.local —
                เข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่าเสร็จ
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="fullName">ชื่อ-นามสกุล</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="เช่น สมหญิง ใจดี"
                    required
                  />
                </div>
              )}
              <div>
                <Label htmlFor="email">อีเมล</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="password">รหัสผ่าน</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 animate-fade-in">
                  {info}
                </p>
              )}

              <Button
                type="submit"
                loading={loading}
                disabled={!configured}
                className="w-full"
              >
                {mode === "login" ? "เข้าสู่ระบบ" : "สมัครใช้งาน"}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-stone-500">
              {mode === "login" ? (
                <>
                  ยังไม่มีบัญชี?{" "}
                  <button
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                    className="font-medium text-brand-600 transition-colors hover:text-brand-800 hover:underline cursor-pointer"
                  >
                    สมัครใช้งาน
                  </button>
                </>
              ) : (
                <>
                  มีบัญชีแล้ว?{" "}
                  <button
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="font-medium text-brand-600 transition-colors hover:text-brand-800 hover:underline cursor-pointer"
                  >
                    เข้าสู่ระบบ
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
