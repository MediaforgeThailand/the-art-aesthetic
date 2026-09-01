"use client";

/**
 * กระดิ่งแจ้งเตือนของ **ระบบ Influencer** — คนละตัวกับกระดิ่งของระบบ Task
 *
 * ผู้ใช้ 2026-08-29:
 *   "เอาตัวแจ้งเตือน bar แบบนี้ออกให้หมด ตัวแจ้งเตือนผมต้องการให้มันไปแสดงในส่วนของ
 *    noti ของตัวเอง และ ui จะได้ clean"
 *   "การแจ้งเตือนต้องละเอียดและมีการแบ่ง สำคัญไม่สำคัญชัดเจน"
 *
 * ในกระดิ่งมี 2 ก้อนที่มาต่างกัน:
 *   1. **ค้างอยู่ที่คุณ** — คำนวณสดจากข้อมูลจริงตอนเปิดระบบ (ไม่เก็บลง DB) เช่น
 *      follow up ถึงกำหนด / เคสยังไม่ลงคิวหมอ / ยังไม่ตั้งเป้าโพส
 *      *นี่คือที่ที่แบนเนอร์เหลืองเดิมย้ายมาอยู่* — คิดเฉพาะเคสที่ "ฉัน" รับผิดชอบ
 *      จึงตรงกว่าแบนเนอร์เดิมที่นับรวมทั้งทีม
 *   2. **ความเคลื่อนไหว** — แถวใน `influ_notifications` ที่เกิดจากการกระทำของคนอื่น
 *      แยกระดับ `action` (งานในขอบเขตของฉัน — นับใน badge แดง) กับ `update` (รู้ไว้เฉยๆ)
 *
 * กระดิ่งถูก mount ครั้งเดียวใน InfluShell — ย้ายหน้าในระบบไม่ทำให้ query ชุดนี้ยิงซ้ำ
 */

import {
  ArrowRight,
  Ban,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  FileSignature,
  FileText,
  FileX,
  Link2,
  Pencil,
  Repeat,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateTime, todayISO } from "@/lib/format";
import {
  contractEndDate,
  INFLU_PROSPECT_ACTIVE,
  INFLU_STAGE,
  isLaterSection,
  rolesCoverScope,
  type InfluEventScope,
} from "@/lib/influ-constants";
import { influNotiMeta, type InfluNotiTone } from "@/lib/influ-notify";
import { createClient } from "@/lib/supabase/client";
import type { InfluNotificationRow, InfluScope } from "@/lib/types";

const NOTI_LIMIT = 40;
/** สัญญาเหลือน้อยกว่านี้ = ขึ้นเตือนในกระดิ่ง (ตรงกับเกณฑ์ของแดชบอร์ด) */
const CONTRACT_SOON_DAYS = 30;

/* ---------- ไอคอน/สีตามชนิด ---------- */

const ICONS: Record<string, typeof Bell> = {
  "arrow-right": ArrowRight,
  rotate: RotateCcw,
  file: FileText,
  send: Send,
  "file-signature": FileSignature,
  "file-x": FileX,
  "calendar-check": CalendarCheck,
  calendar: Calendar,
  target: Target,
  link: Link2,
  check: Check,
  bell: Bell,
  sparkles: Sparkles,
  "check-circle": CheckCircle2,
  ban: Ban,
  pencil: Pencil,
  trash: Trash2,
  repeat: Repeat,
  "user-plus": UserPlus,
  "user-minus": UserMinus,
  "user-cog": UserCog,
};

const TONE_CLASS: Record<InfluNotiTone, string> = {
  brand: "bg-brand-100 text-brand-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  sky: "bg-sky-100 text-sky-700",
  stone: "bg-stone-100 text-stone-500",
};

/* ---------- งานค้างที่คำนวณสด ---------- */

type LiveAlert = {
  key: string;
  icon: typeof Bell;
  tone: InfluNotiTone;
  title: string;
  body: string;
  href: string;
  /** true = อยู่ในขอบเขตงานของฉัน (นับใน badge) */
  mine: boolean;
};

/** เคส (ย่อ) เท่าที่ต้องใช้คำนวณงานค้าง */
type AlertCase = {
  id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  stage: number;
  completed: boolean;
  declined_at: string | null;
  archived: boolean;
  contract_start: string | null;
  contract_months: number;
  memo_file_path: string | null;
  post_quotas: unknown;
  followup_mode: "standard" | "custom";
};

type AlertTask = {
  influencer_id: string;
  due_date: string | null;
  done: boolean;
  is_custom: boolean;
  section: string | null;
};

function caseLabel(c: AlertCase): string {
  return (
    c.nickname || [c.first_name, c.last_name].filter(Boolean).join(" ") || "ไม่ระบุชื่อ"
  );
}

/**
 * งานค้างของฉัน — คิดจากเคสที่ฉันเป็นผู้รับผิดชอบเท่านั้น
 * (แบนเนอร์เดิมบนบอร์ดนับรวมทั้งทีม ทำให้คนที่ไม่เกี่ยวก็เห็นตัวเลขแดงตลอด)
 */
function buildLiveAlerts(
  cases: AlertCase[],
  tasks: AlertTask[],
  bookedIds: Set<string>,
  scopesByCase: Map<string, InfluScope[]>,
  /** รายชื่อบอร์ด Hunting ของฉันที่เลยวันนัดตามแล้ว */
  huntOverdue: { name: string }[],
  today: string
): LiveAlert[] {
  const out: LiveAlert[] = [];
  const active = cases.filter(
    (c) => !c.archived && !c.completed && c.declined_at === null
  );
  // เทียบผ่านบทบาท (normalizeRoles) — แถวเก่าเก็บ scope ดิบ contract/followup
  // ส่วนแถวใหม่เก็บบทบาท owner/follower/memo ต้องอ่านออกทั้งสองแบบ
  const has = (id: string, s: InfluEventScope) =>
    rolesCoverScope(scopesByCase.get(id) ?? [], s);

  /* 1) Memo ค้าง — อยู่ขั้น Memo แล้วยังไม่มีไฟล์ที่อนุมัติ */
  const memoPending = active.filter(
    (c) => c.stage === INFLU_STAGE.memo && !c.memo_file_path
  );
  if (memoPending.length > 0) {
    out.push({
      key: "memo",
      icon: FileText,
      tone: "sky",
      title: `รอทำ Memo ${memoPending.length} เคส`,
      body: memoPending.map(caseLabel).slice(0, 4).join(" · "),
      href: "/influencers",
      mine: memoPending.some((c) => has(c.id, "memo")),
    });
  }

  /* 2) ยังไม่ลงคิวหมอ — เกณฑ์เดียวกับป้ายบนการ์ด (needsDoctorBooking) */
  const needBooking = active.filter(
    (c) =>
      c.stage >= INFLU_STAGE.memo &&
      c.stage <= INFLU_STAGE.contractService &&
      !bookedIds.has(c.id)
  );
  if (needBooking.length > 0) {
    out.push({
      key: "booking",
      icon: CalendarClock,
      tone: "amber",
      title: `รอลงคิวหมอ ${needBooking.length} เคส`,
      body: needBooking.map(caseLabel).slice(0, 4).join(" · "),
      href: "/influencers",
      mine: needBooking.some((c) => has(c.id, "contract")),
    });
  }

  /* 3) เข้าสู่การติดตามแล้วแต่ยังไม่ตั้งเป้าโพส — ตั้งเป้าคือสิ่งแรกที่ต้องทำที่หน้า Follow Up */
  const noQuota = active.filter(
    (c) => c.contract_start !== null && !c.post_quotas
  );
  if (noQuota.length > 0) {
    out.push({
      key: "quota",
      icon: Target,
      tone: "amber",
      title: `ยังไม่ตั้งเป้าโพส ${noQuota.length} เคส`,
      body: noQuota.map(caseLabel).slice(0, 4).join(" · "),
      href: "/influencers/contracts",
      mine: noQuota.some((c) => has(c.id, "followup")),
    });
  }

  /* 4) เช็คลิสต์ผลลัพธ์ถึงกำหนด — ตัดข้อของโหมดที่เคสไม่ได้ใช้ และ "งานรอง" (หมวด 4)
        ออกด้วยกฎเดียวกับการ์ดบนบอร์ด ไม่งั้น 7 งวดของทุกเคสกลบสัญญาณจริง */
  const modeById = new Map(active.map((c) => [c.id, c.followup_mode]));
  const mine = new Set(active.map((c) => c.id));
  const due = tasks.filter(
    (t) =>
      mine.has(t.influencer_id) &&
      t.is_custom === (modeById.get(t.influencer_id) === "custom") &&
      (t.is_custom || !isLaterSection(t.section)) &&
      !t.done &&
      t.due_date !== null &&
      t.due_date <= today
  );
  if (due.length > 0) {
    const ids = new Set(due.map((t) => t.influencer_id));
    out.push({
      key: "followup",
      icon: Bell,
      tone: "amber",
      title: `งานตามถึงกำหนดแล้ว ${due.length} รายการ`,
      body: `${ids.size} เคส — ${[...ids]
        .map((id) => active.find((c) => c.id === id))
        .filter((c): c is AlertCase => !!c)
        .map(caseLabel)
        .slice(0, 4)
        .join(" · ")}`,
      href: "/influencers/contracts",
      mine: [...ids].some((id) => has(id, "followup")),
    });
  }

  /* 5) สัญญาใกล้หมด — ต้องเร่งตามให้ครบเป้าก่อนหมดอายุ */
  const soon = active.filter((c) => {
    if (!c.contract_start) return false;
    const end = contractEndDate(c.contract_start, c.contract_months);
    const left = Math.round(
      (new Date(end).getTime() - new Date(today).getTime()) / 86400000
    );
    return left >= 0 && left <= CONTRACT_SOON_DAYS;
  });
  if (soon.length > 0) {
    out.push({
      key: "contract",
      icon: CalendarClock,
      tone: "rose",
      title: `สัญญาใกล้หมด ${soon.length} เคส`,
      body: soon.map(caseLabel).slice(0, 4).join(" · "),
      href: "/influencers/contracts",
      mine: soon.some((c) => has(c.id, "followup")),
    });
  }

  /* 6) Hunting — รายชื่อที่ฉันตามอยู่และเลยวันนัดแล้ว
        (แบนเนอร์เหลืองบนบอร์ด Hunting ถูกถอดออกและย้ายมาที่นี่) */
  if (huntOverdue.length > 0) {
    out.push({
      key: "hunt",
      icon: CalendarClock,
      tone: "amber",
      title: `ถึงกำหนดตามรายชื่อ ${huntOverdue.length} คน`,
      body: huntOverdue.map((p) => p.name).slice(0, 4).join(" · "),
      href: "/influ-hunting",
      mine: true,
    });
  }

  // งานของฉันขึ้นก่อนเสมอ
  return out.sort((a, b) => Number(b.mine) - Number(a.mine));
}

/* ---------- component ---------- */

type Tab = "action" | "all";

export function InfluNotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  const [items, setItems] = useState<InfluNotificationRow[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [unreadAction, setUnreadAction] = useState(0);
  const [unreadUpdate, setUnreadUpdate] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("action");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** นับยังไม่อ่านจาก DB ตรงๆ (รายการในแผงโหลดแค่ N ล่าสุด นับเองอาจขาด) */
  const refreshUnread = useCallback(() => {
    void supabase
      .from("influ_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("level", "action")
      .is("read_at", null)
      .then(({ count }) => setUnreadAction(count ?? 0));
    void supabase
      .from("influ_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("level", "update")
      .is("read_at", null)
      .then(({ count }) => setUnreadUpdate(count ?? 0));
  }, [supabase, userId]);

  /* ---- โหลดรายการ + realtime ---- */
  useEffect(() => {
    let alive = true;
    void supabase
      .from("influ_notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTI_LIMIT)
      .then(({ data }) => {
        if (alive && data) setItems(data as InfluNotificationRow[]);
      });
    refreshUnread();

    const channel = supabase
      .channel(`influ-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "influ_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as InfluNotificationRow;
          setItems((cur) =>
            cur.some((n) => n.id === row.id)
              ? cur
              : [row, ...cur].slice(0, NOTI_LIMIT)
          );
          refreshUnread();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "influ_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as InfluNotificationRow;
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

  /* ---- งานค้างของฉัน (คำนวณสด ครั้งเดียวตอนเข้าระบบ) ---- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      // Hunting — รายชื่อที่ฉันเป็นเจ้าของและเลยวันนัดตาม (สถานะที่ยังเดินอยู่เท่านั้น)
      const { data: prospects } = await supabase
        .from("influ_prospects")
        .select("name, status, next_followup_on, owner_id, created_by")
        .not("next_followup_on", "is", null)
        .lte("next_followup_on", today);
      const huntOverdue = (prospects ?? [])
        .filter(
          (p) =>
            (p.owner_id ?? p.created_by) === userId &&
            INFLU_PROSPECT_ACTIVE.includes(p.status)
        )
        .map((p) => ({ name: p.name }));

      const { data: mine } = await supabase
        .from("influ_assignees")
        .select("influencer_id, scopes")
        .eq("user_id", userId);
      if (!alive) return;
      if (!mine || mine.length === 0) {
        // ไม่มีเคสที่รับผิดชอบ แต่ยังอาจมีรายชื่อ Hunting ค้างอยู่
        setAlerts(
          buildLiveAlerts([], [], new Set(), new Map(), huntOverdue, today)
        );
        return;
      }
      const ids = mine.map((a) => a.influencer_id);
      const scopesByCase = new Map<string, InfluScope[]>(
        mine.map((a) => [a.influencer_id, (a.scopes ?? []) as InfluScope[]])
      );
      const [{ data: cases }, { data: tasks }, { data: booked }] =
        await Promise.all([
          supabase
            .from("influencers")
            .select(
              "id, first_name, last_name, nickname, stage, completed, declined_at, archived, contract_start, contract_months, memo_file_path, post_quotas, followup_mode"
            )
            .in("id", ids),
          supabase
            .from("influ_tasks")
            .select("influencer_id, due_date, done, is_custom, section")
            .in("influencer_id", ids),
          supabase
            .from("influ_calendar_events")
            .select("influencer_id")
            .eq("kind", "service")
            .in("influencer_id", ids),
        ]);
      if (!alive) return;
      setAlerts(
        buildLiveAlerts(
          (cases ?? []) as unknown as AlertCase[],
          (tasks ?? []) as AlertTask[],
          new Set(
            (booked ?? [])
              .map((b) => b.influencer_id)
              .filter((id): id is string => id !== null)
          ),
          scopesByCase,
          huntOverdue,
          today
        )
      );
    })();
    return () => {
      alive = false;
    };
  }, [supabase, userId, today]);

  /* ---- เปิด/ปิดแผง ---- */
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

  const mineAlerts = alerts.filter((a) => a.mine);
  // badge = งานที่ต้องลงมือจริงๆ เท่านั้น (อัพเดทเงียบไม่นับ ไม่งั้นเลขแดงไม่มีความหมาย)
  const badge = unreadAction + mineAlerts.length;

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const panelW = Math.min(400, window.innerWidth - 16);
      setPos({
        x: Math.max(
          8,
          Math.min(r.right - panelW, window.innerWidth - panelW - 8)
        ),
        y: r.bottom + 8,
      });
      // มีงานต้องลงมือ = เปิดมาที่แท็บนั้น ไม่งั้นเปิดมาเห็นทุกอย่าง
      setTab(badge > 0 ? "action" : "all");
    }
    setOpen((o) => !o);
  };

  const markRead = (n: InfluNotificationRow) => {
    if (n.read_at) return;
    const at = new Date().toISOString();
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read_at: at } : x)));
    if (n.level === "action") setUnreadAction((u) => Math.max(0, u - 1));
    else setUnreadUpdate((u) => Math.max(0, u - 1));
    // (ต้องมี .then เสมอ: supabase builder เป็น lazy thenable — ไม่ then = ไม่ยิง request)
    void supabase
      .from("influ_notifications")
      .update({ read_at: at })
      .eq("id", n.id)
      .then(({ error }) => {
        if (error) console.warn("บันทึกสถานะอ่านไม่สำเร็จ:", error.message);
      });
  };

  const markAllRead = () => {
    const at = new Date().toISOString();
    setItems((cur) => cur.map((x) => (x.read_at ? x : { ...x, read_at: at })));
    setUnreadAction(0);
    setUnreadUpdate(0);
    void supabase
      .from("influ_notifications")
      .update({ read_at: at })
      .eq("recipient_id", userId)
      .is("read_at", null)
      .then(({ error }) => {
        if (error) console.warn("บันทึกสถานะอ่านไม่สำเร็จ:", error.message);
      });
  };

  const openItem = (n: InfluNotificationRow) => {
    markRead(n);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const shown = tab === "action" ? items.filter((n) => n.level === "action") : items;
  const shownAlerts = tab === "action" ? mineAlerts : alerts;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="การแจ้งเตือนของระบบ Influencer"
        aria-label={`การแจ้งเตือน${badge > 0 ? ` (ต้องลงมือ ${badge})` : ""}`}
        className="relative shrink-0 cursor-pointer rounded-lg p-2 text-stone-400 transition-colors duration-200 hover:bg-white/70 hover:text-brand-700 active:scale-90 max-sm:h-11 max-sm:w-11"
      >
        <Bell size={18} className="mx-auto" />
        {badge > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : (
          unreadUpdate > 0 && (
            // อัพเดทเงียบ = จุดเล็กๆ ไม่ใช่เลขแดง (แยก "สำคัญ/ไม่สำคัญ" ตั้งแต่บนปุ่ม)
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-400" />
          )
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ left: pos.x, top: Math.max(8, pos.y) }}
            className="glass fixed z-[70] flex max-h-[78vh] w-100 max-w-[calc(100vw-16px)] flex-col rounded-xl shadow-2xl animate-scale-in"
          >
            <div className="flex items-center gap-2 border-b border-stone-200/60 px-4 py-2.5">
              <p className="text-sm font-semibold text-stone-800">
                แจ้งเตือน Influencer
              </p>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadAction + unreadUpdate === 0}
                className="ml-auto inline-flex cursor-pointer items-center gap-1 text-xs text-stone-400 transition-colors hover:text-brand-700 disabled:cursor-default disabled:opacity-50 max-sm:min-h-11"
              >
                <CheckCheck size={13} />
                อ่านทั้งหมด
              </button>
            </div>

            {/* แยก "ต้องลงมือ" ออกจาก "ทั้งหมด" ให้ชัด — โจทย์หลักของผู้ใช้ */}
            <div className="flex gap-1 border-b border-stone-200/60 px-2 py-1.5">
              {(
                [
                  { key: "action" as Tab, label: "ต้องลงมือ", n: badge },
                  {
                    key: "all" as Tab,
                    label: "ทั้งหมด",
                    n: unreadAction + unreadUpdate,
                  },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors max-sm:min-h-11 max-sm:text-sm ${
                    tab === t.key
                      ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-100"
                      : "text-stone-500 hover:bg-white/60"
                  }`}
                >
                  {t.label}
                  {t.n > 0 && (
                    <span
                      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
                        t.key === "action"
                          ? "bg-rose-100 text-rose-600"
                          : "bg-stone-200 text-stone-600"
                      }`}
                    >
                      {t.n}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="min-h-24 flex-1 overflow-y-auto p-1.5">
              {/* ---- งานค้างของฉัน (คำนวณสด — แทนแบนเนอร์เหลืองเดิมบนหน้าบอร์ด) ---- */}
              {shownAlerts.length > 0 && (
                <>
                  <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
                    ค้างอยู่
                  </p>
                  {shownAlerts.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push(a.href);
                      }}
                      className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[a.tone]}`}
                      >
                        <a.icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-5 text-stone-800">
                          {a.title}
                        </span>
                        {a.body && (
                          <span className="mt-0.5 block truncate text-xs text-stone-400">
                            {a.body}
                          </span>
                        )}
                      </span>
                      {a.mine && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                      )}
                    </button>
                  ))}
                  {shown.length > 0 && (
                    <p className="mt-1 border-t border-stone-200/60 px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-stone-400">
                      ความเคลื่อนไหว
                    </p>
                  )}
                </>
              )}

              {shown.length === 0 && shownAlerts.length === 0 && (
                <p className="py-8 text-center text-xs text-stone-400">
                  {tab === "action"
                    ? "ไม่มีงานที่ต้องลงมือตอนนี้"
                    : "ยังไม่มีการแจ้งเตือน"}
                </p>
              )}

              {shown.map((n) => {
                const meta = influNotiMeta(n.type);
                const Icon = ICONS[meta.icon] ?? Bell;
                const isAction = n.level === "action";
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70 ${
                      n.read_at ? "" : isAction ? "bg-rose-50/40" : "bg-brand-50/40"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[meta.tone]}`}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[13px] leading-5 ${
                          n.read_at
                            ? "text-stone-500"
                            : "font-medium text-stone-800"
                        }`}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block truncate text-xs text-stone-400">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-300">
                        {n.influencer_name && (
                          <span className="text-stone-400">
                            {n.influencer_name}
                          </span>
                        )}
                        {n.actor_name && <span>· โดย {n.actor_name}</span>}
                        <span>· {formatDateTime(n.created_at)}</span>
                      </span>
                    </span>
                    {!n.read_at && (
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          isAction ? "bg-rose-500" : "bg-brand-400"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
