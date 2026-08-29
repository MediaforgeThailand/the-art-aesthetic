"use client";

/* Web Push — ให้แจ้งเตือนเด้งบนมือถือ/คอมแม้ไม่ได้เปิดเว็บค้างไว้ (migration 0095)
 *
 * ชิ้นส่วนทั้งเส้น:
 *   public/sw.js .................. service worker รับ push แล้ว showNotification
 *   supabase/functions/send-push .. เข้ารหัส + ยิงไป push service ของเบราว์เซอร์
 *   public.push_subscriptions ..... ทะเบียนอุปกรณ์ที่กดอนุญาต (1 แถว = 1 เบราว์เซอร์)
 *   app_settings.vapid_public_key . คีย์สาธารณะที่ต้องใช้ตอน subscribe
 *
 * ⚠️ iOS: ต้อง "เพิ่มไปยังหน้าจอโฮม" ก่อน แล้วเปิดจากไอคอนนั้นถึงจะขออนุญาตได้
 *    และ Notification.requestPermission() ต้องถูกเรียกจากการกดปุ่มของผู้ใช้เท่านั้น
 *    (เรียกลอยๆ ตอนโหลดหน้าแบบเดิม Safari เมิน) — จึงมีปุ่มในแผงกระดิ่งให้กดเปิดเอง
 */

import { createClient } from "@/lib/supabase/client";

export type PushState = "unsupported" | "default" | "granted" | "denied";

/** เบราว์เซอร์นี้รองรับ Web Push ไหม (iOS < 16.4 / โหมดส่วนตัวบางตัวไม่รองรับ) */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushState(): PushState {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushState;
}

/** เปิดจากไอคอนที่ติดตั้งไว้ (PWA) หรือยัง — iOS ต้องเป็น true ถึงจะขอสิทธิ์ได้ */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari รุ่นเก่ายังใช้ property นอกมาตรฐานตัวนี้
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function b64url(buf: ArrayBuffer | null): string | null {
  if (!buf) return null;
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // scope "/" — sw.js อยู่ที่ root และ **ต้องถูกปล่อยผ่านใน proxy.ts** ไม่งั้นโดนเด้งไป /login
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** สมัคร/ต่ออายุการสมัคร push ของเครื่องนี้ แล้วบันทึกลงทะเบียนอุปกรณ์
    (เจ้าของแถวมาจาก auth.uid() ฝั่ง DB — ไม่ต้องส่ง userId มาให้ปลอมได้)
    คืน true เมื่อพร้อมรับ push จริง */
async function subscribeAndSave(): Promise<boolean> {
  const supabase = createClient();
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "vapid_public_key")
    .maybeSingle();
  const publicKey = setting?.value;
  if (!publicKey) {
    console.warn("ยังไม่ได้ตั้ง vapid_public_key — ข้ามการสมัคร push");
    return false;
  }

  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // คีย์เซิร์ฟเวอร์เปลี่ยน (ย้ายระบบ/ออกคีย์ใหม่) = subscription เดิมใช้ไม่ได้ ต้องสมัครใหม่
    const current = b64url(sub.options.applicationServerKey ?? null);
    if (current && current !== publicKey) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  // ผ่าน RPC ไม่ใช่ upsert ตรง — endpoint เป็นของ "เบราว์เซอร์" ไม่ใช่ของ "คน"
  // เครื่องที่ทีมใช้ร่วมกันแล้วสลับคนล็อกอินจะได้ endpoint เดิมที่มีเจ้าของเป็นคนก่อนหน้า
  // ซึ่ง RLS มองไม่เห็น (ดู migration 0096)
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) {
    console.warn("บันทึกอุปกรณ์รับแจ้งเตือนไม่สำเร็จ:", error.message);
    return false;
  }
  return true;
}

/** เรียกตอนโหลดหน้า — เครื่องที่เคยอนุญาตไว้แล้วต่ออายุให้เงียบๆ (ไม่มี popup) */
export async function syncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    await subscribeAndSave();
  } catch (e) {
    console.warn("ต่ออายุการแจ้งเตือนไม่สำเร็จ:", (e as Error).message);
  }
}

/** ปุ่ม "เปิดแจ้งเตือนบนอุปกรณ์นี้" — ต้องเรียกจากการกดของผู้ใช้เท่านั้น (ข้อบังคับของ iOS) */
export async function enablePush(): Promise<{
  ok: boolean;
  state: PushState;
  message?: string;
}> {
  if (!pushSupported()) {
    return {
      ok: false,
      state: "unsupported",
      message: isStandalone()
        ? "อุปกรณ์นี้ไม่รองรับการแจ้งเตือน"
        : "บน iPhone/iPad ต้องกด 'เพิ่มไปยังหน้าจอโฮม' แล้วเปิดจากไอคอนนั้นก่อน",
    };
  }
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      state: permission as PushState,
      message:
        permission === "denied"
          ? "เบราว์เซอร์ปิดการแจ้งเตือนของเว็บนี้ไว้ — เปิดใหม่ได้ที่การตั้งค่าเว็บไซต์"
          : "ยังไม่ได้อนุญาตการแจ้งเตือน",
    };
  }
  try {
    const ok = await subscribeAndSave();
    return {
      ok,
      state: "granted",
      message: ok ? undefined : "เปิดแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง",
    };
  } catch (e) {
    return { ok: false, state: "granted", message: (e as Error).message };
  }
}

/** ปิดแจ้งเตือนเฉพาะเครื่องนี้ (สิทธิ์ของเบราว์เซอร์ยังอยู่ — เปิดกลับได้ทันที) */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await createClient()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .then(({ error }) => {
        if (error) console.warn("ถอนอุปกรณ์ไม่สำเร็จ:", error.message);
      });
  } catch (e) {
    console.warn("ปิดแจ้งเตือนไม่สำเร็จ:", (e as Error).message);
  }
}

/** มีการสมัคร push ของเครื่องนี้อยู่จริงไหม (ใช้ตัดสินป้าย "เปิดอยู่/ปิดอยู่") */
export async function hasPushSubscription(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return Boolean(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}
