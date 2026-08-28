"use client";

import { Clock, LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * หน้าจอ "รออนุมัติสิทธิ์" — บัญชีเข้าระบบได้แล้วแต่ยังไม่มีสิทธิ์เห็นหน้าไหนเลย
 *
 * เกิดกับคนที่สร้างบัญชีเองด้วยเมลบริษัทผ่าน Google (migration 0093) — บัญชีโผล่ในหน้า
 * "จัดการบัญชีผู้ใช้" ให้ผู้ดูแลติ๊กสิทธิ์ทันที ระหว่างนั้นต้องเห็นว่า "รออยู่" ไม่ใช่
 * หน้าจอ "ไม่มีสิทธิ์เข้าถึง" ที่อ่านแล้วเหมือนสมัครไม่สำเร็จ
 */
export function PendingApprovalClient({ email }: { email: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const signOut = async () => {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // เน็ตล่ม — ล้าง session เฉพาะเบราว์เซอร์นี้แล้วไปหน้า login ต่อ
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // เพิกเฉย
      }
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md rounded-2xl p-7 text-center shadow-lg animate-fade-in-up">
        <div className="mb-6 flex flex-col items-center">
          <LogoMark className="h-14 w-14" />
          <p className="font-display mt-2 text-xl font-bold text-brand-800">
            The ART
          </p>
        </div>

        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
          <Clock size={26} />
        </span>

        <h1 className="text-lg font-semibold text-stone-800">
          รออนุมัติสิทธิ์การใช้งาน
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          บัญชี <span className="font-medium text-stone-700">{email}</span>{" "}
          เข้าสู่ระบบเรียบร้อยแล้ว — ตอนนี้รอผู้ดูแลระบบเปิดสิทธิ์ให้ว่าจะใช้ส่วนไหนได้บ้าง
          <br />
          แจ้งผู้ดูแลได้เลยว่าคุณสมัครเข้ามาแล้ว (ชื่อของคุณขึ้นในหน้าจัดการบัญชีให้เขาเห็นแล้ว)
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            loading={checking}
            onClick={() => {
              setChecking(true);
              router.refresh();
              // ปลดสถานะหลัง refresh เพื่อกดซ้ำได้ (ถ้าได้สิทธิ์แล้ว หน้านี้จะถูกแทนที่เอง)
              window.setTimeout(() => setChecking(false), 1200);
            }}
          >
            <RefreshCw size={15} /> ตรวจสอบอีกครั้ง
          </Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut size={15} /> ออกจากระบบ
          </Button>
        </div>
      </div>
    </main>
  );
}
