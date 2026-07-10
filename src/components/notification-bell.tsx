"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AssigneeAvatar, profileName } from "@/app/(app)/tasks/task-card";
import { formatDateTime } from "@/lib/format";
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
      return `${actor} ตีกลับงาน ${title} ให้แก้ไข`;
    case "brief_accepted":
      return `${actor} รับงาน brief ${title} แล้ว`;
  }
}

/**
 * กระดิ่งแจ้งเตือนบน sidebar — badge เลขยังไม่อ่าน + แผงรายการ (เปิดออกด้านขวาผ่าน portal)
 * อัพเดทสดผ่าน Supabase Realtime (INSERT/UPDATE ของแถวที่ recipient = ฉัน)
 * คลิกรายการ = ทำเครื่องหมายอ่านแล้ว + เปิดงานนั้นบนบอร์ด (/tasks?task=...)
 */
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<NotificationWithJoins[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** นับยังไม่อ่านจาก DB ตรงๆ (รายการในแผงโหลดแค่ N ล่าสุด นับเองอาจขาด) */
  const refreshUnread = useCallback(() => {
    void supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [supabase, userId]);

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
    refreshUnread();

    // realtime: แจ้งเตือนใหม่เด้งทันที + sync สถานะอ่านข้ามแท็บ/เครื่อง
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
              refreshUnread();
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
            cur.map((n) => (n.id === row.id ? { ...n, read_at: row.read_at } : n))
          );
          refreshUnread();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refreshUnread]);

  /* ---------- เปิด/ปิดแผง ---------- */

  useEffect(() => {
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
      // แผงเปิดชิดขวาของ sidebar — กันทะลุขอบล่างจอ
      setPos({
        x: r.right + 10,
        y: Math.min(r.top - 4, window.innerHeight - 520),
      });
    }
    setOpen((o) => !o);
  };

  /* ---------- อ่านแล้ว ---------- */

  const markRead = (n: NotificationWithJoins) => {
    if (n.read_at) return;
    const at = new Date().toISOString();
    setItems((cur) =>
      cur.map((x) => (x.id === n.id ? { ...x, read_at: at } : x))
    );
    setUnread((u) => Math.max(0, u - 1));
    void supabase.from("notifications").update({ read_at: at }).eq("id", n.id);
  };

  const markAllRead = () => {
    const at = new Date().toISOString();
    setItems((cur) => cur.map((x) => (x.read_at ? x : { ...x, read_at: at })));
    setUnread(0);
    void supabase
      .from("notifications")
      .update({ read_at: at })
      .eq("recipient_id", userId)
      .is("read_at", null);
  };

  const openTask = (n: NotificationWithJoins) => {
    markRead(n);
    setOpen(false);
    if (n.task_id) {
      router.push(`/tasks?task=${n.task_id}`);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="การแจ้งเตือน"
        aria-label={`การแจ้งเตือน${unread > 0 ? ` (ยังไม่อ่าน ${unread})` : ""}`}
        className="relative shrink-0 cursor-pointer rounded-lg p-2 text-stone-400 transition-colors duration-200 hover:bg-white/70 hover:text-brand-700 active:scale-90"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ left: pos.x, top: Math.max(8, pos.y) }}
            className="glass fixed z-[70] flex max-h-[75vh] w-96 flex-col rounded-xl shadow-2xl animate-scale-in"
          >
            <div className="flex items-center gap-2 border-b border-stone-200/60 px-4 py-2.5">
              <p className="text-sm font-semibold text-stone-800">การแจ้งเตือน</p>
              {unread > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                  ใหม่ {unread}
                </span>
              )}
              <button
                type="button"
                onClick={markAllRead}
                disabled={unread === 0}
                className="ml-auto inline-flex cursor-pointer items-center gap-1 text-xs text-stone-400 transition-colors hover:text-brand-700 disabled:cursor-default disabled:opacity-50"
              >
                <CheckCheck size={13} />
                อ่านทั้งหมด
              </button>
            </div>

            <div className="min-h-24 flex-1 overflow-y-auto p-1.5">
              {items.length === 0 && (
                <p className="py-8 text-center text-xs text-stone-400">
                  ยังไม่มีการแจ้งเตือน
                </p>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openTask(n)}
                  className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70 ${
                    n.read_at ? "" : "bg-brand-50/50"
                  }`}
                >
                  <AssigneeAvatar assignee={n.actor} size={7} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[13px] leading-5 ${
                        n.read_at
                          ? "text-stone-500"
                          : "font-medium text-stone-800"
                      }`}
                    >
                      {messageOf(n)}
                    </span>
                    {n.preview && (
                      <span className="mt-0.5 block truncate text-xs text-stone-400">
                        {n.preview}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-stone-300">
                      {formatDateTime(n.created_at)}
                    </span>
                  </span>
                  {!n.read_at && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
