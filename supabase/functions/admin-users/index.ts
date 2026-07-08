// admin-users — จัดการบัญชีผู้ใช้ (เรียกจากหน้า /accounts เท่านั้น, ผู้เรียกต้องเป็น admin)
// actions: list | create | delete | set_role | set_permissions | reset_password
// ไฟล์นี้เป็น mirror ของ edge function ที่ deploy บน Supabase แล้ว (deploy ผ่าน MCP/CLI)
import { createClient } from "npm:@supabase/supabase-js@2";

// สิทธิ์การมองเห็นที่ admin เปิดให้รายคนได้ (admin role = เห็นทุกอย่าง)
const VALID_PERMISSIONS = new Set(["data", "team", "influ", "pricing"]);

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

function sanitizePerms(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const p of input) {
    const key = String(p);
    if (VALID_PERMISSIONS.has(key)) out.add(key);
  }
  return [...out];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ระบุตัวผู้เรียกจาก JWT แล้วเช็คว่าเป็น admin
    const token = (req.headers.get("Authorization") ?? "").replace(
      /^Bearer\s+/i,
      ""
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const caller = userData.user;
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({
        ok: true,
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        })),
      });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim();
      const role = body.role === "admin" ? "admin" : "member";
      const permissions = sanitizePerms(body.permissions);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ ok: false, error: "invalid_email" }, 400);
      }
      if (password.length < 6) {
        return json({ ok: false, error: "password_too_short" }, 400);
      }
      // เปิดทางให้ handle_new_user ผ่าน (ระบบปิดสมัครเองด้วย allowed_emails)
      const { error: allowErr } = await admin
        .from("allowed_emails")
        .upsert({ email, note: `เพิ่มโดย ${caller.email ?? caller.id}` });
      if (allowErr) return json({ ok: false, error: allowErr.message }, 500);

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : {},
      });
      if (error || !created?.user) {
        // สร้างไม่สำเร็จ — ถอนอีเมลออกจาก allowlist ถ้ายังไม่มีบัญชีจริง
        await admin.from("allowed_emails").delete().eq("email", email);
        return json(
          { ok: false, error: error?.message ?? "create_failed" },
          400
        );
      }
      // ตั้ง role/permissions ตามที่ admin เลือก (profile ถูกสร้างโดย trigger แล้ว)
      if (role === "admin" || permissions.length > 0) {
        await admin
          .from("profiles")
          .update({ role, permissions })
          .eq("id", created.user.id);
      }
      return json({ ok: true, user_id: created.user.id });
    }

    if (action === "set_role") {
      const userId = String(body.user_id ?? "");
      const role = body.role === "admin" ? "admin" : "member";
      if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
      const { data: target } = await admin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (!target) return json({ ok: false, error: "user_not_found" }, 404);
      if (target.role === "admin" && role === "member") {
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) {
          return json({ ok: false, error: "last_admin" }, 400);
        }
      }
      const { error } = await admin
        .from("profiles")
        .update({ role })
        .eq("id", userId);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "set_permissions") {
      const userId = String(body.user_id ?? "");
      if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
      const permissions = sanitizePerms(body.permissions);
      const { error } = await admin
        .from("profiles")
        .update({ permissions })
        .eq("id", userId);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const userId = String(body.user_id ?? "");
      const password = String(body.password ?? "");
      if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
      if (password.length < 6) {
        return json({ ok: false, error: "password_too_short" }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
      });
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      const userId = String(body.user_id ?? "");
      if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);
      if (userId === caller.id) {
        return json({ ok: false, error: "cannot_delete_self" }, 400);
      }
      const { data: target } = await admin
        .from("profiles")
        .select("role, email")
        .eq("id", userId)
        .maybeSingle();
      if (target?.role === "admin") {
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) {
          return json({ ok: false, error: "last_admin" }, 400);
        }
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ ok: false, error: error.message }, 500);
      if (target?.email) {
        await admin
          .from("allowed_emails")
          .delete()
          .eq("email", target.email.toLowerCase());
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
