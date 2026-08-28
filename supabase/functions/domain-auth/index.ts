// domain-auth — login flow ก่อนล็อกอิน (ไม่ต้อง JWT): เช็คอีเมล + ตั้งรหัสผ่านครั้งแรก
// actions: check | signup
// ไฟล์นี้เป็น mirror ของ edge function ที่ deploy บน Supabase แล้ว (verify_jwt = false)
//
// 2026-08-03: ปิดการสมัครเองด้วย domain (@artsurgery.co.th) — ต้องอยู่ใน allowed_emails เท่านั้น
// เหตุผล: endpoint นี้เปิดสาธารณะและสร้างบัญชีแบบ email_confirm=true โดยไม่พิสูจน์ว่าผู้สมัคร
// เป็นเจ้าของอีเมลจริง ใครเดาที่อยู่อีเมลพนักงานได้ก็สร้างบัญชีแทนได้ และเมื่อ RLS ของทุกตาราง
// เป็น "authenticated เข้าถึงได้ทั้งหมด" บัญชีนั้นอ่าน/แก้ข้อมูลทั้งฐานผ่าน REST ได้ทันที
//
// 2026-08-29 (migration 0093): เมลโดเมนบริษัทเข้าระบบเองได้อีกครั้ง — **แต่ผ่าน Google SSO
// เท่านั้น** เพราะ Google เป็นคนพิสูจน์ให้ว่าผู้สมัครเป็นเจ้าของกล่องเมลนั้นจริง ช่องโหว่ข้างบน
// จึงไม่กลับมา; การ "ตั้งรหัสผ่านเอง" ที่ action=signup ยังจำกัดอยู่ที่ allowed_emails เหมือนเดิม
// ทุกประการ (โดเมนที่อนุญาตอยู่ในตาราง allowed_email_domains — trigger handle_new_user
// เป็นคนบังคับกติกาชั้นสุดท้าย ฟังก์ชันนี้แค่บอก UI ว่าควรแสดงทางไหนให้ผู้ใช้)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!validEmail(email)) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }
    // อีเมลนี้ตั้งรหัสผ่านเองได้ไหม — ต้องอยู่ใน allowlist ที่ admin เพิ่มไว้เท่านั้น
    const { data: allowRow } = await admin
      .from("allowed_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    const allowed = allowRow !== null;

    // โดเมนบริษัท = เข้าได้เองผ่าน Google SSO (ไม่ใช่ตั้งรหัสผ่านเอง)
    const domain = email.split("@")[1] ?? "";
    const { data: domainRow } = await admin
      .from("allowed_email_domains")
      .select("domain")
      .ilike("domain", domain)
      .maybeSingle();
    const domainAllowed = domainRow !== null;

    const { data: exists, error: existsErr } = await admin.rpc(
      "email_exists",
      { p_email: email }
    );
    if (existsErr) return json({ ok: false, error: existsErr.message }, 500);

    if (action === "check") {
      return json({
        ok: true,
        exists: exists === true,
        allowed,
        domain_allowed: domainAllowed,
      });
    }

    if (action === "signup") {
      const password = String(body?.password ?? "");
      const fullName = String(body?.full_name ?? "").trim();
      // ⚠️ เจตนาไม่รวม domainAllowed ตรงนี้ — โดเมนบริษัทสร้างบัญชีเองได้เฉพาะทาง Google
      // (ทางนี้ไม่มีอะไรพิสูจน์ว่าคนกรอกเป็นเจ้าของกล่องเมลจริง)
      if (!allowed) {
        return json(
          { ok: false, error: domainAllowed ? "use_google" : "not_allowed" },
          403
        );
      }
      if (exists === true) return json({ ok: false, error: "already_exists" }, 409);
      if (password.length < 6) {
        return json({ ok: false, error: "password_too_short" }, 400);
      }
      // สร้างแบบ confirm อีเมลให้เลย (ไม่ต้องยืนยันทางอีเมล) — permissions เริ่มต้นว่าง รอ admin เปิด
      const { error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : {},
      });
      if (error) {
        return json({ ok: false, error: error.message }, 400);
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
