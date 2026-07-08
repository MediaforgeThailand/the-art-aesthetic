// domain-auth — login flow ก่อนล็อกอิน (ไม่ต้อง JWT): เช็คอีเมล + สมัครครั้งแรกเฉพาะ domain artsurgery.co.th
// actions: check | signup
// ไฟล์นี้เป็น mirror ของ edge function ที่ deploy บน Supabase แล้ว (verify_jwt = false)
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_DOMAIN = "artsurgery.co.th";

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
    const domain = email.split("@")[1] ?? "";

    // อีเมลนี้ได้รับอนุญาตหรือไม่ (domain ตรง หรืออยู่ใน allowlist)
    const { data: allowRow } = await admin
      .from("allowed_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    const allowed = domain === ALLOWED_DOMAIN || allowRow !== null;

    const { data: exists, error: existsErr } = await admin.rpc(
      "email_exists",
      { p_email: email }
    );
    if (existsErr) return json({ ok: false, error: existsErr.message }, 500);

    if (action === "check") {
      return json({ ok: true, exists: exists === true, allowed });
    }

    if (action === "signup") {
      const password = String(body?.password ?? "");
      const fullName = String(body?.full_name ?? "").trim();
      if (!allowed) return json({ ok: false, error: "not_allowed" }, 403);
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
