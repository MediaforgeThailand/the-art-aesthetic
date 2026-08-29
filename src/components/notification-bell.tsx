"use client";

import { Bell, BellOff, BellRing, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AssigneeAvatar, profileName } from "@/app/(app)/tasks/task-card";
import {
  NOTIFICATION_BADGES,
  notificationBadgeKey,
} from "@/lib/constants";
import { formatNotiTime } from "@/lib/format";
import {
  disablePush,
  enablePush,
  hasPushSubscription,
  isStandalone,
  pushState,
  syncPush,
  type PushState,
} from "@/lib/push";
import { createClient } from "@/lib/supabase/client";
import type { NotificationWithJoins } from "@/lib/types";

/** select ของการแจ้งเตือนพร้อม join (คนทำ + ชื่องาน) */
const NOTI_SELECT =
  "*, actor:profiles!notifications_actor_id_fkey(id, full_name, email, avatar_path), task:tasks!notifications_task_id_fkey(id, title)";

/** จำนวนรายการล่าสุดที่โหลดมาแสดงในแผง */
const NOTI_LIMIT = 30;

function messageOf(n: NotificationWithJoins): string {
  const actor = n.actor ? profileName(n.actor) : "ใครบางคน";
  const title = n.task ? `"${n.task.title}"` : "งานที่ถูกลบไปแล้ว";
  switch (n.type) {
    case "mention":
      return `${actor} แท็กถึงคุณในงาน ${title}`;
    case "comment":
      return `${actor} แสดงความคิดเห็นในงาน ${title}`;
    case "assign":
      return `${actor} มอบหมายงาน ${title} ให้คุณ`;
    case "review_request":
      return `${actor} ส่งงาน ${title} ให้คุณตรวจ`;
    case "approved":
      return `${actor} อนุมัติงาน ${title} แล้ว`;
    case "rejected":
      return n.revision_kind === "addition"
        ? `${actor} ขอให้แก้เพิ่มเติมในงาน ${title}`
        : `${actor} ตีกลับงาน ${title} ให้แก้คำผิด`;
    case "brief_accepted":
      return `${actor} รับงาน brief ${title} แล้ว`;
  }
}

/**
 * กระดิ่งแจ้งเตือน — badge เลข "ยังไม่เห็น" + แผงรายการ (เปิดออกด้านขวาผ่าน portal)
 * อัพเดทสดผ่าน Supabase Realtime (INSERT/UPDATE ของแถวที่ recipient = ฉัน)
 *
 * "เห็นแล้ว" กับ "อ่านแล้ว" เป็นคนละเรื่องกันโดยตั้งใจ (migration 0095):
 * - เปิดแผง = ทุกแถวถูกทำเครื่องหมาย seen_at → ตัวเลขบนกระดิ่งรีเซ็ตทันที
 * - แถวที่ยังไม่ได้กดเข้าไปดูยังเป็น "ยังไม่อ่าน" (แถบสีซ้ายเด่น + ตัวหนา) จนกว่าจะ
 *   คลิกหรือกด "อ่านทั้งหมด" — พฤติกรรมเดียวกับกล่องอีเมล/Facebook
 */
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<NotificationWithJoins[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // handler ของ realtime ถูกสร้างครั้งเดียว — อ่านสถานะแผงผ่าน ref แทน state
  const openRef = useRef(false);

  /* ---------- แจ้งเตือนเด้งบนอุปกรณ์ (Web Push) ---------- */
  const [push, setPush] = useState<PushState>("unsupported");
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const unread = items.filter((n) => !n.read_at).length;

  /** นับยังไม่เห็นจาก DB ตรงๆ (รายการในแผงโหลดแค่ N ล่าสุด นับเองอาจขาด) */
  const refreshUnseen = useCallback(() => {
    void supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("seen_at", null)
      .then(({ count }) => setUnseen(count ?? 0));
  }, [supabase, userId]);

  /** เปิดแผง = เห็นแล้วทั้งหมด (ตัวเลขบนกระดิ่งดับ แต่สถานะ "อ่านแล้ว" ไม่ถูกแตะ) */
  const markAllSeen = useCallback(() => {
    const at = new Date().toISOString();
    setUnseen(0);
    setItems((cur) => cur.map((x) => (x.seen_at ? x : { ...x, seen_at: at })));
    // (ต้องมี .then เสมอ: builder ของ supabase-js เป็น lazy thenable — ไม่ then = ไม่ยิง request)
    void supabase
      .from("notifications")
      .update({ seen_at: at })
      .eq("recipient_id", userId)
      .is("seen_at", null)
      .then(({ error }) => {
        if (error) console.warn("บันทึกสถานะเห็นแล้วไม่สำเร็จ:", error.message);
      });
  }, [supabase, userId]);

  /** เด้งแจ้งเตือนของเบราว์เซอร์จากแท็บที่เปิดอยู่ (เมื่อผู้ใช้ไม่ได้โฟกัสหน้าเว็บ)
      — ใช้ tag เดียวกับฝั่ง push ของ service worker ใบเดียวกันจึงทับกัน ไม่เด้งซ้ำ */
  const showBrowserNotification = useCallback(
    (n: NotificationWithJoins) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      // กำลังใช้งานหน้าเว็บอยู่ — เห็นกระดิ่งในแอปอยู่แล้ว ไม่ต้องเด้งซ้ำ
      if (document.hasFocus()) return;
      const badge = NOTIFICATION_BADGES[
        notificationBadgeKey(n.type, n.revision_kind)
      ];
      try {
        const noti = new Notification(`${badge.label} — The ART`, {
          body: n.preview ? `${messageOf(n)}\n${n.preview}` : messageOf(n),
          tag: n.id,
          icon: "/icon-192.png",
        });
        noti.onclick = () => {
          window.focus();
          if (n.task_id) router.push(`/tasks?task=${n.task_id}`);
          noti.close();
        };
      } catch {
        // บางเบราว์เซอร์ไม่ให้สร้าง Notification ตรงๆ — ข้าม (กระดิ่งในแอปยังทำงานปกติ)
      }
    },
    [router]
  );

  // เครื่องที่เคยอนุญาตไว้แล้ว: ต่ออายุการสมัคร push เงียบๆ (ไม่มี popup)
  // ส่วนเครื่องที่ยังไม่เคยอนุญาต **ห้ามขอสิทธิ์เอง** — iOS บังคับให้ขอจากการกดปุ่มเท่านั้น
  // (โค้ดเดิมเรียก requestPermission() ตอนโหลดหน้า ซึ่ง Safari เมินมาตลอด)
  useEffect(() => {
    let alive = true;
    void (async () => {
      const state = pushState();
      await syncPush();
      const on = await hasPushSubscription();
      if (!alive) return;
      setPush(state);
      setPushOn(on);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("notifications")
      .select(NOTI_SELECT)
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTI_LIMIT)
      .then(({ data }) => {
        if (alive && data) {
          setItems(data as unknown as NotificationWithJoins[]);
        }
      });
    refreshUnseen();

    // realtime: แจ้งเตือนใหม่เด้งทันที + sync สถานะเห็น/อ่านข้ามแท็บ/เครื่อง
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const id = (payload.new as { id?: string }).id;
          if (!id) return;
          // แถวจาก realtime ไม่มี join — ดึงกลับพร้อม actor/task ก่อนแสดง
          void supabase
            .from("notifications")
            .select(NOTI_SELECT)
            .eq("id", id)
            .single()
            .then(({ data }) => {
              if (!data) return;
              const row = data as unknown as NotificationWithJoins;
              setItems((cur) =>
                cur.some((n) => n.id === row.id)
                  ? cur
                  : [row, ...cur].slice(0, NOTI_LIMIT)
              );
              // กำลังเปิดแผงค้างอยู่ = เห็นกับตาแล้ว ไม่ต้องเด้งตัวเลขให้ต้องปิด-เปิดใหม่
              if (openRef.current) markAllSeen();
              else refreshUnseen();
              showBrowserNotification(row);
            });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationWithJoins;
          setItems((cur) =>
            cur.map((n) =>
              n.id === row.id
                ? { ...n, read_at: row.read_at, seen_at: row.seen_at }
                : n
            )
          );
          refreshUnseen();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [
    supabase,
    userId,
    refreshUnseen,
    markAllSeen,
    showBrowserNotification,
  ]);

  /* ---------- เปิด/ปิดแผง ---------- */

  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const panelW = Math.min(400, window.innerWidth - 16); // = w-100 หรือเต็มจอแคบ
      const fitsRight = r.right + 10 + panelW <= window.innerWidth;
      // จอใหญ่ (กระดิ่งใน sidebar): เปิดชิดขวาของ sidebar — กันทะลุขอบล่างจอ
      // จอแคบ (กระดิ่งบน topbar): เปิดใต้ปุ่ม หนีบไม่ให้หลุดขอบจอ
      setPos(
        fitsRight
          ? { x: r.right + 10, y: Math.min(r.top - 4, window.innerHeight - 520) }
          : {
              x: Math.max(
                8,
                Math.min(r.right - panelW, window.innerWidth - panelW - 8)
              ),
              y: r.bottom + 8,
            }
      );
      // เปิดแผง = ตัวเลขรีเซ็ตทันที ไม่ต้องรอกด "อ่านทั้งหมด" (คำสั่งผู้ใช้ 2026-08-29)
      if (unseen > 0) markAllSeen();
    }
    setOpen((o) => !o);
  };

  /* ---------- อ่านแล้ว ---------- */

  const markRead = (n: NotificationWithJoins) => {
    if (n.read_at) return;
    const at = new Date().toISOString();
    setItems((cur) =>
      cur.map((x) => (x.id === n.id ? { ...x, read_at: at, seen_at: x.seen_at ?? at } : x))
    );
    void supabase
      .from("notifications")
      .update({ read_at: at, seen_at: n.seen_at ?? at })
      .eq("id", n.id)
      .then(({ error }) => {
        if (error) console.warn("บันทึกสถานะอ่านไม่สำเร็จ:", error.message);
      });
  };

  const markAllRead = () => {
    const at = new Date().toISOString();
    setItems((cur) =>
      cur.map((x) => (x.read_at ? x : { ...x, read_at: at, seen_at: x.seen_at ?? at }))
    );
    setUnseen(0);
    void supabase
      .from("notifications")
      .update({ read_at: at, seen_at: at })
      .eq("recipient_id", userId)
      .is("read_at", null)
      .then(({ error }) => {
        if (error) console.warn("บันทึกสถานะอ่านไม่สำเร็จ:", error.message);
      });
  };

  const openTask = (n: NotificationWithJoins) => {
    markRead(n);
    setOpen(false);
    if (n.task_id) {
      router.push(`/tasks?task=${n.task_id}`);
    }
  };

  /* ---------- ปุ่มเปิด/ปิดแจ้งเตือนเด้ง ---------- */

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMsg(null);
    if (pushOn) {
      await disablePush();
      setPushOn(false);
      setPush(pushState());
    } else {
      const res = await enablePush();
      setPush(res.state);
      setPushOn(res.ok);
      setPushMsg(res.message ?? null);
    }
    setPushBusy(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="การแจ้งเตือน"
        aria-label={`การแจ้งเตือน${unseen > 0 ? ` (ใหม่ ${unseen})` : ""}`}
        className="relative shrink-0 cursor-pointer rounded-lg p-2 text-stone-400 transition-colors duration-200 hover:bg-white/70 hover:text-brand-700 active:scale-90"
      >
        <Bell size={18} />
        {unseen > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ left: pos.x, top: Math.max(8, pos.y) }}
            className="glass fixed z-[70] flex max-h-[75dvh] w-100 max-w-[calc(100vw-16px)] flex-col rounded-xl shadow-2xl animate-scale-in"
          >
            <div className="flex items-center gap-2 border-b border-stone-200/60 px-4 py-2.5">
              <p className="text-sm font-semibold text-stone-800">การแจ้งเตือน</p>
              {unread > 0 && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                  ยังไม่อ่าน {unread}
                </span>
              )}
              <button
                type="button"
                onClick={markAllRead}
                disabled={unread === 0}
                className="ml-auto inline-flex cursor-pointer items-center gap-1 text-xs text-stone-400 transition-colors hover:text-brand-700 disabled:cursor-default disabled:opacity-50 max-sm:min-h-11"
              >
                <CheckCheck size={13} />
                อ่านทั้งหมด
              </button>
            </div>

            {/* แถวเปิดแจ้งเตือนเด้งบนเครื่องนี้ — โผล่เฉพาะตอนยังไม่ได้เปิด
                (เปิดแล้วเหลือบรรทัดจางท้ายแผง ไม่กินที่ด้านบนตลอดไป) */}
            {!pushOn && (
              <div className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-50/70 px-3 py-2">
                <BellRing size={15} className="shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1 text-[12px] leading-4 text-amber-800">
                  {push === "denied"
                    ? "เบราว์เซอร์ปิดแจ้งเตือนของเว็บนี้ไว้ — เปิดใหม่ได้ที่การตั้งค่าเว็บไซต์"
                    : push !== "unsupported"
                      ? "เปิดแจ้งเตือนเด้งบนอุปกรณ์นี้ — รู้ทันทีแม้ไม่ได้เปิดเว็บค้างไว้"
                      : isStandalone()
                        ? "อุปกรณ์นี้ไม่รองรับแจ้งเตือนเด้ง (iPhone ต้องเป็น iOS 16.4 ขึ้นไป)"
                        : "อยากให้เด้งบนมือถือ? กด “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอนแอป"}
                </span>
                {push !== "denied" && push !== "unsupported" && (
                  <button
                    type="button"
                    onClick={togglePush}
                    disabled={pushBusy}
                    className="shrink-0 cursor-pointer rounded-lg bg-amber-500 px-2.5 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 max-sm:min-h-11"
                  >
                    {pushBusy ? "กำลังเปิด…" : "เปิด"}
                  </button>
                )}
              </div>
            )}
            {pushMsg && (
              <p className="border-b border-stone-200/60 px-3 py-1.5 text-[11px] text-rose-600">
                {pushMsg}
              </p>
            )}

            <div className="min-h-24 flex-1 space-y-1 overflow-y-auto p-1.5">
              {items.length === 0 && (
                <p className="py-8 text-center text-xs text-stone-400">
                  ยังไม่มีการแจ้งเตือน
                </p>
              )}
              {items.map((n) => {
                const badge =
                  NOTIFICATION_BADGES[
                    notificationBadgeKey(n.type, n.revision_kind)
                  ];
                const isUnread = !n.read_at;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openTask(n)}
                    className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg border-l-4 py-2 pl-2 pr-2.5 text-left transition-colors hover:bg-brand-50/70 ${
                      isUnread
                        ? "border-brand-500 bg-brand-50/60"
                        : "border-transparent bg-transparent"
                    }`}
                  >
                    <AssigneeAvatar assignee={n.actor} size={7} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[13px] leading-5 ${
                          isUnread
                            ? "font-semibold text-stone-800"
                            : "text-stone-500"
                        }`}
                      >
                        {messageOf(n)}
                      </span>
                      {n.preview && (
                        <span className="mt-0.5 block truncate text-xs text-stone-400">
                          {n.preview}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-stone-400">
                        {formatNotiTime(n.created_at)}
                      </span>
                    </span>
                    {/* ป้ายชนิดงานชิดขวา — เรื่องที่ต้องลงมือทำจะเรืองแสงตามสีตัวเอง */}
                    <span
                      className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.chip} ${
                        badge.loud && isUnread ? "animate-glow-pulse" : ""
                      }`}
                    >
                      {badge.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {pushOn && (
              <div className="flex items-center gap-1.5 border-t border-stone-200/60 px-3 py-1.5 text-[11px] text-stone-400">
                <BellRing size={12} className="text-emerald-500" />
                แจ้งเตือนเด้งเปิดอยู่บนอุปกรณ์นี้
                <button
                  type="button"
                  onClick={togglePush}
                  disabled={pushBusy}
                  className="ml-auto inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-rose-600 disabled:opacity-60 max-sm:min-h-11"
                >
                  <BellOff size={12} />
                  ปิดบนเครื่องนี้
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
