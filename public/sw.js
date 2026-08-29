/* Service worker — มีไว้เพื่อ "แจ้งเตือนเด้ง" อย่างเดียว (Web Push) เท่านั้น
 *
 * ⚠️ ห้ามเพิ่ม fetch handler / cache ใดๆ ในไฟล์นี้เด็ดขาด
 * ระบบนี้เป็นหลังบ้านที่ต้องล็อกอิน — การ cache HTML ของหน้าที่ล็อกอินแล้วเสี่ยงให้
 * เครื่องที่ใช้ร่วมกันเห็นข้อมูลของคนก่อนหน้า และทำให้ข้อมูลค้างเก่าโดยไม่รู้ตัว
 * (กติกาเดิมของโปรเจกต์: "ยังไม่มี service worker โดยตั้งใจ" — ไฟล์นี้เป็นข้อยกเว้น
 *  เพราะ Web Push ต้องมี service worker เท่านั้น ไม่มีทางอื่น)
 *
 * เนื้อความถูกส่งมาจาก edge function `send-push` เป็น JSON
 * { id, title, body, url }
 */

self.addEventListener("install", () => {
  // เวอร์ชันใหม่ทำงานทันที ไม่ต้องรอปิดทุกแท็บ (ไฟล์นี้ไม่มี state ให้ระวัง)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "The ART — Task";
  const options = {
    body: data.body || "",
    // เปิดหลายเครื่อง/ส่งซ้ำ = ทับใบเดิม ไม่กองซ้อนกันเป็นสิบใบ
    tag: data.id || "the-art-noti",
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/tasks" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/tasks";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        // มีหน้าต่างแอปเปิดอยู่แล้ว — พาไปหน้างานนั้นในหน้าต่างเดิม
        for (const client of list) {
          if (new URL(client.url).origin === self.location.origin) {
            return client.focus().then((c) => (c.navigate ? c.navigate(target) : c));
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
