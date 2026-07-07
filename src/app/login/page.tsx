"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoLockup, LogoMark } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
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
            ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
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

            {/* การสมัครเองถูกปิด — บัญชีใหม่เพิ่มได้จากหน้า "จัดการบัญชี" โดย admin เท่านั้น */}
            <p className="mt-4 text-center text-sm text-stone-500">
              ยังไม่มีบัญชี? ติดต่อผู้ดูแลระบบเพื่อเพิ่มบัญชีให้
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
