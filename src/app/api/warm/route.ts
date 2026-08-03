import { NextResponse } from "next/server";

// endpoint อุ่นเครื่องให้ pg_cron ยิงทุก 5 นาที — กัน serverless function เย็น (cold start 1-3 วิ)
// force-dynamic กัน Next ทำเป็น static ตอน build — ต้องวิ่งเข้า function จริงถึงจะอุ่นได้
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}
