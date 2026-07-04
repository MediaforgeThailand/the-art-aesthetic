import { Database } from "lucide-react";

/** แสดงเมื่อยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL / ANON_KEY จริง */
export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-soft p-6">
      <div className="w-full max-w-lg rounded-xl border border-brand-100 bg-white p-8 shadow-sm animate-fade-in-up">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
          <Database className="text-brand-500" size={24} />
        </div>
        <h1 className="text-lg font-semibold text-stone-900">
          ยังไม่ได้เชื่อมต่อ Supabase
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          ระบบยังไม่พบค่าเชื่อมต่อฐานข้อมูล กรุณาตั้งค่าในไฟล์{" "}
          <code className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-800">
            .env.local
          </code>{" "}
          ให้เรียบร้อยก่อน:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-brand-900 p-4 text-xs leading-6 text-cream">
          {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
        </pre>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          ดูค่าได้ที่ Supabase Dashboard → Project Settings → API
          จากนั้นรีสตาร์ท dev server แล้วรีเฟรชหน้านี้
        </p>
      </div>
    </div>
  );
}
