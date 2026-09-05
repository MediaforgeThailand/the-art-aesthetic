// send-push — ส่ง Web Push ไปยังอุปกรณ์ที่ติดตั้งแอป (PWA) เมื่อมีแถวแจ้งเตือนใหม่
//
// รองรับ 2 ระบบ (แยกด้วย body.source):
//   * ไม่ส่ง / "task" = public.notifications ของระบบ Task (trigger notifications_push_after_insert, 0096)
//   * "influ"        = public.influ_notifications ของระบบ Influencer (trigger influ_notifications_push_after_insert, 0109)
//     แถวของระบบ Influ **เก็บ title/body/href มาพร้อมแล้ว** จึงไม่ต้องมี messageOf ซ้ำอีกชุด
// auth: verify_jwt=false แต่ต้องส่ง header `x-push-secret` ตรงกับ vault secret 'push_secret'
// secrets ใน Vault (อ่านผ่าน RPC get_app_secret — service role เท่านั้น):
//   push_secret / push_function_url / vapid_private_key / vapid_subject
// คีย์สาธารณะอยู่ใน public.app_settings key 'vapid_public_key' (ฝั่งเบราว์เซอร์ต้องใช้ตอน subscribe)
//
// ทำไมเขียน Web Push เอง: ไลบรารี web-push เป็นของ Node (พึ่ง node:https/agent) รันบน edge
// runtime ไม่นิ่ง — โปรโตคอลจริงมีแค่ 2 ส่วนคือ VAPID (JWT ES256) + เข้ารหัส aes128gcm
// (RFC 8291/8188) ซึ่ง WebCrypto ทำได้ครบ ไม่ต้องพึ่ง dependency ภายนอกเลย
//
// ⚠️ ข้อความในแจ้งเตือน (messageOf/headingOf) ต้องตรงกับ `messageOf` ใน src/components/notification-bell.tsx —
// แก้ที่หนึ่งต้องแก้อีกที่ด้วย (ข้ามฝั่ง repo/runtime จึง import กันไม่ได้)

import { createClient } from "jsr:@supabase/supabase-js@2";

/** อายุที่ push service เก็บข้อความไว้ให้ถ้าเครื่องปลายทางออฟไลน์ (วินาที) */
const TTL_SECONDS = 60 * 60 * 24;

const enc = (s: string) => new TextEncoder().encode(s);

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? enc(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** Authorization header ตามสเปก VAPID — JWT ES256 ที่ผูกกับ origin ของ endpoint */
async function vapidAuth(
  endpoint: string,
  publicKey: Uint8Array,
  privateD: Uint8Array,
  subject: string,
): Promise<string> {
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64url(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    }),
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: b64url(privateD),
      x: b64url(publicKey.slice(1, 33)),
      y: b64url(publicKey.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto คืนลายเซ็นเป็น r||s (P1363) ซึ่งเป็นรูปที่ JWS ES256 ต้องการพอดี
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      enc(`${header}.${payload}`),
    ),
  );
  return `vapid t=${header}.${payload}.${b64url(sig)}, k=${b64url(publicKey)}`;
}

/** เข้ารหัสเนื้อความตาม RFC 8291 (aes128gcm) — คืน body ที่พร้อม POST ไป push service */
async function encryptPayload(
  plain: string,
  p256dh: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  const uaPublic = await crypto.subtle.importKey(
    "raw",
    p256dh,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublic },
      pair.privateKey,
      256,
    ),
  );

  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(
    prkKey,
    concat(enc("WebPush: info\0"), p256dh, asPublic, Uint8Array.of(1)),
  );
  const prk = await hmac(salt, ikm);
  const cek = (
    await hmac(
      prk,
      concat(enc("Content-Encoding: aes128gcm\0"), Uint8Array.of(1)),
    )
  ).slice(0, 16);
  const nonce = (
    await hmac(prk, concat(enc("Content-Encoding: nonce\0"), Uint8Array.of(1)))
  ).slice(0, 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  // 0x02 = ตัวปิดท้าย record สุดท้าย (เราส่ง record เดียวเสมอ เนื้อความสั้น)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes,
      concat(enc(plain), Uint8Array.of(2)),
    ),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, Uint8Array.of(asPublic.length), asPublic, cipher);
}

type Row = {
  id: string;
  type: string;
  preview: string | null;
  task_id: string | null;
  recipient_id: string;
  revision_kind: string | null;
  actor: { full_name: string | null; email: string | null } | null;
  task: { title: string | null } | null;
};

function actorName(r: Row): string {
  return r.actor?.full_name?.trim() || r.actor?.email?.split("@")[0] || "ใครบางคน";
}

function messageOf(r: Row): string {
  const who = actorName(r);
  const title = r.task?.title ? `"${r.task.title}"` : "งานที่ถูกลบไปแล้ว";
  switch (r.type) {
    case "mention":
      return `${who} แท็กถึงคุณในงาน ${title}`;
    case "comment":
      return `${who} แสดงความคิดเห็นในงาน ${title}`;
    case "assign":
      return `${who} มอบหมายงาน ${title} ให้คุณ`;
    case "review_request":
      return `${who} ส่งงาน ${title} ให้คุณตรวจ`;
    case "approved":
      return `${who} อนุมัติงาน ${title} แล้ว`;
    case "rejected":
      return r.revision_kind === "brief"
        ? `${who} ขอให้แก้งาน ${title} ก่อนส่งตรวจ`
        : r.revision_kind === "addition"
          ? `${who} ขอให้แก้เพิ่มเติมในงาน ${title}`
          : `${who} ตีกลับงาน ${title} ให้แก้คำผิด`;
    case "brief_accepted":
      return `${who} รับงาน brief ${title} แล้ว`;
    default:
      return `มีความเคลื่อนไหวในงาน ${title}`;
  }
}

/** พาดหัวสั้นๆ บนแจ้งเตือนของระบบ — บอกชนิดงานให้รู้ตั้งแต่ยังไม่ปลดล็อกจอ */
function headingOf(r: Row): string {
  switch (r.type) {
    case "review_request":
      return "ตรวจงาน";
    case "rejected":
      return r.revision_kind === "brief"
        ? "แก้ก่อนส่งตรวจ"
        : r.revision_kind === "addition"
          ? "แก้เพิ่มเติม"
          : "แก้คำผิด";
    case "mention":
      return "มีคนกล่าวถึงคุณ";
    case "assign":
      return "งานใหม่ของคุณ";
    case "approved":
      return "อนุมัติแล้ว";
    case "comment":
      return "ความคิดเห็นใหม่";
    case "brief_accepted":
      return "รับงาน brief แล้ว";
    default:
      return "การแจ้งเตือน";
  }
}

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const { data: expected } = await admin.rpc("get_app_secret", {
      p_name: "push_secret",
    });
    if (!expected || req.headers.get("x-push-secret") !== expected) {
      return json(401, { error: "unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const notificationId: string | null = body.notification_id ?? null;
    const source: string = body.source ?? "task";
    if (!notificationId) return json(400, { error: "missing notification_id" });

    // ---- ระบบ Influencer: ข้อความอยู่บนแถวแล้ว (title/body/href) ----
    if (source === "influ") {
      const { data: iRow, error: iErr } = await admin
        .from("influ_notifications")
        .select("id, recipient_id, title, body, href, level")
        .eq("id", notificationId)
        .maybeSingle();
      if (iErr) return json(500, { error: iErr.message });
      if (!iRow) return json(404, { error: "notification not found" });
      if (iRow.level !== "action") return json(200, { sent: 0, reason: "update level" });
      return await pushTo(
        admin,
        json,
        iRow.recipient_id as string,
        JSON.stringify({
          id: iRow.id,
          title: (iRow.title as string) || "ระบบ Influencer",
          body: (iRow.body as string) ?? "",
          url: (iRow.href as string) ?? "/influencers",
        }),
      );
    }

    const { data: row, error: rowErr } = await admin
      .from("notifications")
      .select(
        "id, type, preview, task_id, recipient_id, revision_kind, actor:profiles!notifications_actor_id_fkey(full_name, email), task:tasks!notifications_task_id_fkey(title)",
      )
      .eq("id", notificationId)
      .maybeSingle();
    if (rowErr) return json(500, { error: rowErr.message });
    if (!row) return json(404, { error: "notification not found" });
    const noti = row as unknown as Row;

    const payload = JSON.stringify({
      id: noti.id,
      title: headingOf(noti),
      body: noti.preview
        ? `${messageOf(noti)}\n${noti.preview}`
        : messageOf(noti),
      url: noti.task_id ? `/tasks?task=${noti.task_id}` : "/tasks",
    });

    return await pushTo(admin, json, noti.recipient_id, payload);
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});

/** ส่ง payload ไปทุกอุปกรณ์ของผู้รับ + เก็บกวาด endpoint ที่ตายแล้ว
    (ใช้ร่วมกันทั้งแจ้งเตือนของระบบ Task และของระบบ Influencer) */
async function pushTo(
  admin: ReturnType<typeof createClient>,
  json: (status: number, body: unknown) => Response,
  recipientId: string,
  payload: string,
): Promise<Response> {
  const { data: subs, error: subErr } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", recipientId);
  if (subErr) return json(500, { error: subErr.message });
  if (!subs || subs.length === 0) return json(200, { sent: 0, reason: "no devices" });

  const [{ data: privRaw }, { data: subjRaw }, { data: pubRow }] = await Promise.all([
    admin.rpc("get_app_secret", { p_name: "vapid_private_key" }),
    admin.rpc("get_app_secret", { p_name: "vapid_subject" }),
    admin.from("app_settings").select("value").eq("key", "vapid_public_key").maybeSingle(),
  ]);
  const publicKeyB64 = pubRow?.value ?? null;
  if (!privRaw || !publicKeyB64) {
    return json(500, { error: "ยังไม่ได้ตั้งคีย์ VAPID" });
  }
  const publicKey = unb64url(publicKeyB64);
  const privateD = unb64url(privRaw);
  const subject = subjRaw || "mailto:admin@artsurgery.co.th";

  let sent = 0;
  const dead: string[] = [];
  const ok: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const encrypted = await encryptPayload(
          payload,
          unb64url(s.p256dh as string),
          unb64url(s.auth as string),
        );
        const res = await fetch(s.endpoint as string, {
          method: "POST",
          headers: {
            Authorization: await vapidAuth(
              s.endpoint as string,
              publicKey,
              privateD,
              subject,
            ),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: String(TTL_SECONDS),
            Urgency: "normal",
          },
          body: encrypted,
        });
        if (res.status === 404 || res.status === 410) {
          // เครื่องถอนการติดตั้ง/ล้างสิทธิ์แล้ว — เก็บกวาดแถวทิ้ง
          dead.push(s.id as string);
        } else if (res.ok) {
          sent++;
          ok.push(s.id as string);
        } else {
          console.warn("push ล้มเหลว", res.status, await res.text());
        }
      } catch (e) {
        console.warn("push error", (e as Error).message);
      }
    }),
  );

  if (dead.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", dead);
  }
  if (ok.length > 0) {
    await admin
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", ok);
  }
  return json(200, { sent, removed: dead.length });
}
