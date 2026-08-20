"use client";

import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Eye,
  EyeOff,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  Stethoscope,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
} from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import { logInflu } from "@/lib/influ-log";
import {
  INFLU_STAGE,
  INFLU_STAGES,
  INFLU_TIERS,
  sizeGroupFromFollowers,
} from "@/lib/influ-constants";
import type { InfluLevel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import type {
  DoctorRow,
  InfluProfileRow,
  InfluServiceRow,
  InfluSizeGroup,
} from "@/lib/types";
import { DoctorManagerModal } from "./doctor-manager";
import type { InfluLinkLite } from "./influ-links";
import { NewCaseModal } from "./new-case-modal";
import type { PriceCatalogEntry } from "./procedure-items-editor";
import { ProfileFormModal } from "./profile-form";
import {
  boardPos,
  INFLU_STATUS_META,
  InfluBoard,
  influName,
  type InfluencerListRow,
  type InfluStats,
  influStatusOf,
  type InfluStatusKey,
  type InfluTaskLite,
  needsDoctorBooking,
  thaiDateISO,
} from "./influ-board";

// ที่อยู่ใหม่ของ type/helper อยู่ใน influ-board.tsx — re-export ให้หน้าอื่น (influ-gallery) import ได้เหมือนเดิม
export { influName } from "./influ-board";
export type { InfluencerListRow } from "./influ-board";

/* ---------- ตัวกรอง "ยกเว้น" (จำค่าใน localStorage — ใช้ร่วมทุกเครื่องที่เปิดหน้านี้) ---------- */

const FILTER_STORAGE_KEY = "influ-filters-v1";
const INFLU_STATUS_ORDER: InfluStatusKey[] = [
  "waiting",
  "accepted",
  "done",
  "declined",
];
/** ค่าเริ่มต้น: ซ่อนคนที่ปฏิเสธออกจากบอร์ด (ดูได้จากชิป "ปฏิเสธ" หรือเอาติ๊กออก) */
const DEFAULT_EXCLUDED: InfluStatusKey[] = ["declined"];

/** รอทำ Memo มานานแค่ไหน — Date.now() ต้องอยู่นอก component ไม่งั้นโดนกฎ react-hooks/purity */
function memoWaitLabel(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `รอมา ${days} วัน`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `รอมา ${hours} ชม.`;
  return "เพิ่งติ๊ก";
}

/** รอเกิน 2 วัน = เริ่มช้า ให้เด่นขึ้น (กติกาเดียวกับป้ายรอตรวจในหน้า Task) */
function memoWaitIsLate(since: string): boolean {
  return Date.now() - new Date(since).getTime() > 2 * 86_400_000;
}

function readSavedExcluded(): Set<InfluStatusKey> {
  if (typeof window === "undefined") return new Set(DEFAULT_EXCLUDED);
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return new Set(DEFAULT_EXCLUDED);
    const parsed = JSON.parse(raw) as { excluded?: unknown };
    if (Array.isArray(parsed.excluded)) {
      return new Set(
        parsed.excluded.filter((s): s is InfluStatusKey =>
          INFLU_STATUS_ORDER.includes(s as InfluStatusKey)
        )
      );
    }
  } catch {
    // ค่าที่เก็บไว้พัง — ใช้ค่าเริ่มต้น
  }
  return new Set(DEFAULT_EXCLUDED);
}

/** ปุ่ม + เมนู "ยกเว้น" — ติ๊กสถานะที่ไม่อยากเห็นบนบอร์ด (render ผ่าน portal กันโดนบอร์ดทับ) */
function InfluExcludeFilter({
  excluded,
  onChange,
  countOf,
}: {
  excluded: Set<InfluStatusKey>;
  onChange: (next: Set<InfluStatusKey>) => void;
  countOf: (status: InfluStatusKey) => number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** ตำแหน่งแผง (fixed) — หนีบขอบจอทั้งแนวนอนและแนวตั้ง จอแคบต้องไม่ล้นออกนอกจอ */
  const placeAt = (btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    const panelW = Math.min(264, window.innerWidth - 16);
    return {
      x: Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8)),
      y: r.bottom + 6,
    };
  };

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
    // แผงเป็น position:fixed — เลื่อนจอ/หมุนเครื่องแล้วต้องย้ายตามปุ่ม ไม่งั้นค้างลอยผิดที่
    const reposition = () => {
      if (btnRef.current) setPos(placeAt(btnRef.current));
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open && btnRef.current) setPos(placeAt(btnRef.current));
    setOpen((o) => !o);
  };

  const toggleStatus = (status: InfluStatusKey) => {
    const next = new Set(excluded);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onChange(next);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        aria-label="ยกเว้นสถานะจากบอร์ด"
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
          excluded.size > 0
            ? "border-brand-300 bg-brand-50/80 text-brand-700"
            : "border-brand-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:bg-brand-50"
        }`}
      >
        <EyeOff size={14} />
        ยกเว้น
        {excluded.size > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-100 px-1.5 text-[11px] font-bold text-brand-700">
            {excluded.size}
          </span>
        )}
        <ChevronDown size={14} className="text-stone-400" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ left: pos.x, top: pos.y }}
            className="fixed z-[70] w-64 max-w-[calc(100vw-16px)] rounded-xl border border-stone-200 bg-white p-2 shadow-xl animate-scale-in"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-stone-400">
              ซ่อนสถานะเหล่านี้จากบอร์ด
            </p>
            {INFLU_STATUS_ORDER.map((s) => (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-stone-700 transition-colors hover:bg-brand-50/60"
              >
                <input
                  type="checkbox"
                  checked={excluded.has(s)}
                  onChange={() => toggleStatus(s)}
                  className="h-4 w-4 cursor-pointer accent-[#a96a58]"
                />
                <span className="flex-1">{INFLU_STATUS_META[s].label}</span>
                <span className="text-xs text-stone-400">{countOf(s)}</span>
              </label>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

/* ---------- แท็บ "รอทำ Memo" — เคสที่ติ๊กว่าข้อมูลครบแล้ว รอ influ manager ลงมือทำ ---------- */

function MemoWaitingList({
  items,
  canEdit,
  onOpen,
  onToggleDocsSent,
}: {
  items: InfluencerListRow[];
  /** ระดับ "ดูเฉยๆ" = ติ๊กไม่ได้ (ยังเห็นคิวและสถานะครบ) */
  canEdit: boolean;
  onOpen: (id: string) => void;
  /** ติ๊ก/ยกเลิก "ส่งเอกสารแล้ว" — บันทึกลง DB กันทีมส่งซ้ำ */
  onToggleDocsSent: (influ: InfluencerListRow) => void;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ClipboardCheck size={40} strokeWidth={1.5} />}
          title="ไม่มีเคสรอทำ Memo"
          description="เมื่อทีมติ๊กว่า 'ข้อมูลพร้อมทำ Memo' ใน Stage 3 เคสนั้นจะมาแสดงที่นี่ — พออัพโหลดไฟล์ Memo แล้วจะหลุดจากคิวเอง"
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <p className="flex items-start gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
        <ClipboardCheck size={14} className="mt-0.5 shrink-0" />
        เคสที่ข้อมูลครบพร้อมทำ Memo แล้ว — กดเพื่อเปิด Stage 3
        คัดลอกข้อความไปทำ Memo แล้วอัพโหลดไฟล์กลับเข้ามา (อัพโหลดแล้วหลุดจากคิวนี้เอง) ·
        ติ๊ก ☑ หน้ารายชื่อเมื่อ<span className="font-semibold">ส่งเอกสารแล้ว</span>
        เพื่อกันทีมส่งซ้ำ
      </p>
      <Card className="divide-y divide-stone-100 !p-0">
        {items.map((i) => {
          const late = memoWaitIsLate(i.memo_ready_at!);
          const sent = i.docs_sent_at !== null;
          const meta = [
            i.tier ? INFLU_TIERS[i.tier].label : null,
            i.followers !== null ? `${formatNumber(i.followers)} followers` : null,
            i.procedure_text,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={i.id}
              className={`flex items-center gap-1 transition-colors hover:bg-brand-50/40 ${
                sent ? "bg-emerald-50/40" : ""
              }`}
            >
              {/* ช่องติ๊ก "ส่งเอกสารแล้ว" — แยกจากปุ่มเปิดเคส (ห้าม button ซ้อน button) */}
              <label
                title={
                  sent
                    ? `ส่งเอกสารแล้วเมื่อ ${formatDate(thaiDateISO(i.docs_sent_at!))} — กดเพื่อยกเลิก`
                    : "ทำเครื่องหมายว่าส่งเอกสารให้ influencer แล้ว"
                }
                className="flex shrink-0 cursor-pointer items-center py-3 pl-4 pr-1"
              >
                <input
                  type="checkbox"
                  checked={sent}
                  disabled={!canEdit}
                  onChange={() => onToggleDocsSent(i)}
                  aria-label={`ส่งเอกสารแล้ว — ${influName(i)}`}
                  className="h-4 w-4 cursor-pointer accent-[#a96a58] disabled:cursor-default disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                onClick={() => onOpen(i.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-2 pr-4 text-left active:scale-[0.997]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">
                    {influName(i)}
                  </p>
                  {meta !== "" && (
                    <p className="truncate text-xs text-stone-500">{meta}</p>
                  )}
                </div>
                {sent && (
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 size={11} />
                    ส่งเอกสารแล้ว
                  </span>
                )}
                <span
                  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    late
                      ? "bg-amber-100 text-amber-800"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  <Clock3 size={11} />
                  {memoWaitLabel(i.memo_ready_at!)}
                </span>
                <ChevronRight size={16} className="shrink-0 text-stone-300" />
              </button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/** ผู้ใช้ปัจจุบัน + ระดับสิทธิ์ในระบบ Influencer (คำนวณฝั่ง server ส่งลงมา) */
export type InfluMe = {
  id: string | null;
  name: string;
  level: InfluLevel;
  /** hunter ขึ้นไป — เพิ่ม/แก้ข้อมูลได้ */
  canEdit: boolean;
  /** ผู้ดูแลระบบ Influ — ทะเบียนหมอ, ลบเคสของคนอื่น, log, ถังขยะ */
  canManage: boolean;
};

export function InfluencersClient({
  influencers,
  tasks,
  doctors,
  sourceLinks,
  bookedInfluIds,
  priceCatalog,
  profiles,
  services,
  people,
  me,
  loadError,
}: {
  influencers: InfluencerListRow[];
  tasks: InfluTaskLite[];
  doctors: DoctorRow[];
  /** ลิงก์ไฟล์ source (Google Drive) ทั้งหมด — ปุ่มเปิดเร็วบนการ์ด */
  sourceLinks: InfluLinkLite[];
  /** influencer ที่มีคิว "เข้ารับบริการ" ในปฏิทินแล้ว = นัดหมอเรียบร้อย */
  bookedInfluIds: string[];
  /** ตัวเลือกหัตถการจาก Price List — เมนูหลักของทีม aesthetics */
  priceCatalog: PriceCatalogEntry[];
  /** โปรไฟล์ตัวบุคคลทั้งหมด (influ_profiles) — ตัวเลือกตอน "สร้างนัดใหม่" */
  profiles: InfluProfileRow[];
  /** เมนูหัตถการที่ทีมเพิ่มเอง แยก product team (influ_services) */
  services: InfluServiceRow[];
  /** ชื่อของทุกบัญชี — แปลง owner_id เป็นชื่อผู้รับผิดชอบบนการ์ด */
  people: { id: string; name: string }[];
  me: InfluMe;
  loadError: string | null;
}) {
  const [doctorsOpen, setDoctorsOpen] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const actor = useMemo(
    () => ({ id: me.id, name: me.name || null }),
    [me.id, me.name]
  );

  /** ชื่อผู้รับผิดชอบจาก owner_id (เคสเก่าที่ยังไม่มีเจ้าของ = null) */
  const nameById = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people]
  );

  /** ลบได้ไหม — ผู้ดูแลลบได้ทุกเคส, Hunter ลบได้เฉพาะเคสที่ตัวเองรับผิดชอบ
      (กติกาเดียวกับ canDeleteInflu ใน permissions.ts แต่คิดจาก me ที่ส่งลงมา) */
  const mayDelete = (i: InfluencerListRow) =>
    me.canManage ||
    (me.level === "hunter" && i.owner_id !== null && i.owner_id === me.id);

  // สำเนา state ฝั่งจอ — ลบ/ลากแล้วเห็นผลทันที (optimistic) แล้วค่อย sync กับ server
  const [items, setItems] = useState<InfluencerListRow[]>(influencers);
  useEffect(() => setItems(influencers), [influencers]);

  /** ทิ้ง cache ของหน้านี้หลังเขียน DB (Next cache 30 วิ · หน้านี้ไม่มี realtime)
      รวบด้วย timeout สั้นๆ — ลากการ์ดรัวๆ จะยิง refresh ทุกครั้งไม่ได้ เพราะ payload ที่
      กลับมาจะ re-seed items ทับตำแหน่งที่เพิ่งลากไปแต่ยังบันทึกไม่เสร็จ (การ์ดเด้งกลับ)
      ออกจากหน้าก่อนครบเวลา = flush ทิ้งท้ายให้ ไม่งั้น cache ค้างเป็นของเก่า */
  const refreshTimer = useRef<number | null>(null);
  const markServerStale = () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 600);
  };
  useEffect(
    () => () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
        router.refresh();
      }
    },
    [router]
  );

  // ลิงก์ไฟล์ source จัดกลุ่มตาม influencer — ปุ่มเปิดเร็วบนการ์ด
  const linksByInflu = useMemo(() => {
    const m = new Map<string, InfluLinkLite[]>();
    for (const l of sourceLinks) {
      const arr = m.get(l.influencer_id);
      if (arr) arr.push(l);
      else m.set(l.influencer_id, [l]);
    }
    return m;
  }, [sourceLinks]);

  /* เคสที่ถึง Memo แล้วแต่ยังไม่มีคิวหมอในปฏิทิน — ป้ายเรืองแสงบนการ์ด + ตัวกรองด้านบน */
  const bookedIds = useMemo(() => new Set(bookedInfluIds), [bookedInfluIds]);
  const bookingAlertIds = useMemo(
    () =>
      new Set(
        items.filter((i) => needsDoctorBooking(i, bookedIds)).map((i) => i.id)
      ),
    [items, bookedIds]
  );

  /** แท็บ: บอร์ดปกติ | คิวรอทำ Memo (stage 3 ที่ติ๊กว่าข้อมูลครบแล้ว) */
  const [tab, setTab] = useState<"board" | "memo">("board");

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<
    number | "all" | "done" | "declined" | "needbooking"
  >("all");
  /** ดูเฉพาะเคสที่ฉันเป็นผู้รับผิดชอบ — หลายทีมใช้บอร์ดเดียวกัน */
  const [mineOnly, setMineOnly] = useState(false);

  // สถานะที่ถูก "ยกเว้น" ออกจากบอร์ด — จำค่าไว้ใน localStorage (เริ่มต้นซ่อนคนปฏิเสธ)
  const [excluded, setExcluded] = useState<Set<InfluStatusKey>>(
    readSavedExcluded
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ excluded: [...excluded] })
      );
    } catch {
      // เก็บค่าไม่ได้ (เช่น private mode) — ตัวกรองยังใช้ได้ แค่ไม่จำข้ามครั้ง
    }
  }, [excluded]);
  const excludedIsDefault =
    excluded.size === DEFAULT_EXCLUDED.length &&
    DEFAULT_EXCLUDED.every((s) => excluded.has(s));

  // ลบ influencer
  const [deleteTarget, setDeleteTarget] = useState<InfluencerListRow | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** ลบไฟล์ใน storage ของ influencer (best-effort) — รูป/memo/สัญญา */
  const cleanupStorage = async (influId: string) => {
    const store = supabase.storage.from(STORAGE_BUCKET_DOCUMENTS);
    for (const prefix of [
      `influencers/${influId}`,
      `influencers/${influId}/memo`,
      `influencers/${influId}/contract`,
    ]) {
      try {
        const { data } = await store.list(prefix, { limit: 1000 });
        const paths = (data ?? [])
          .filter((o) => o.id) // เฉพาะไฟล์จริง ไม่ใช่ชื่อโฟลเดอร์ย่อย
          .map((o) => `${prefix}/${o.name}`);
        if (paths.length > 0) await store.remove(paths);
      } catch {
        // เพิกเฉย — ลบ record สำเร็จแล้ว ไฟล์ค้างไม่กระทบการใช้งาน
      }
    }
  };

  /** ลบเคส — ผ่าน RPC ที่ **สำรองข้อมูลลงถังขยะ 30 วันก่อนเสมอ** แล้วเขียน log ให้ในตัว
      (ลูกทุกตาราง cascade ตามไป แต่ payload ถูกเก็บครบก่อนลบ — กู้คืนได้ที่หน้าถังขยะ) */
  const handleDelete = async (target: InfluencerListRow) => {
    if (!mayDelete(target)) {
      setActionError("บัญชีนี้ลบเคสของคนอื่นไม่ได้ — ให้ผู้ดูแลระบบเป็นคนลบ");
      return;
    }
    setDeletingId(target.id);
    setActionError(null);
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== target.id)); // optimistic
    const { error } = await supabase.rpc("influ_delete_with_backup", {
      p_id: target.id,
    });
    if (error) {
      setItems(prev); // คืนค่าถ้าลบไม่สำเร็จ
      setActionError(`ลบไม่สำเร็จ: ${error.message}`);
      setDeletingId(null);
      return;
    }
    void cleanupStorage(target.id); // fire-and-forget หลังลบ record สำเร็จ
    setDeletingId(null);
    router.refresh();
  };

  /** ลากการ์ดวางเสร็จ — บันทึกกลุ่มขนาด (override เมื่อไม่ตรง auto) + ลำดับในคอลัมน์ */
  const moveInflu = async (
    id: string,
    group: InfluSizeGroup,
    prevId: string | null,
    nextId: string | null
  ) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    const prevPos = prevId
      ? (() => {
          const p = items.find((i) => i.id === prevId);
          return p ? boardPos(p) : null;
        })()
      : null;
    const nextPos = nextId
      ? (() => {
          const n = items.find((i) => i.id === nextId);
          return n ? boardPos(n) : null;
        })()
      : null;
    let position: number;
    if (prevPos !== null && nextPos !== null) position = (prevPos + nextPos) / 2;
    else if (prevPos !== null) position = prevPos + 1;
    else if (nextPos !== null) position = nextPos - 1;
    else position = 0;
    // วางในกลุ่มเดียวกับที่ followers จัดให้อยู่แล้ว = กลับเป็นอัตโนมัติ (ไม่เก็บ override)
    const sizeGroup: InfluSizeGroup | null =
      group === sizeGroupFromFollowers(target.followers) ? null : group;

    const prevItems = items;
    setItems((cur) =>
      cur.map((i) =>
        i.id === id
          ? { ...i, size_group: sizeGroup, board_position: position }
          : i
      )
    );
    const { error } = await supabase
      .from("influencers")
      .update({ size_group: sizeGroup, board_position: position })
      .eq("id", id);
    if (error) {
      setItems(prevItems);
      setActionError(`ย้ายการ์ดไม่สำเร็จ: ${error.message}`);
      return;
    }
    markServerStale();
  };

  /** mark/ยกเลิกสถานะ "ปฏิเสธ" — การ์ดจะหายจากบอร์ดถ้าตัวกรองยกเว้นปฏิเสธอยู่ (ค่าเริ่มต้น)
      ดูรายชื่อที่ปฏิเสธได้จากชิป "ปฏิเสธ" และกดปุ่มเดิมซ้ำเพื่อเอากลับมาติดต่อใหม่ */
  const toggleDeclined = async (target: InfluencerListRow) => {
    const next = target.declined_at ? null : new Date().toISOString();
    const prevItems = items;
    setActionError(null);
    setItems((cur) =>
      cur.map((i) => (i.id === target.id ? { ...i, declined_at: next } : i))
    );
    const { error } = await supabase
      .from("influencers")
      .update({ declined_at: next })
      .eq("id", target.id);
    if (error) {
      setItems(prevItems);
      setActionError(`บันทึกสถานะปฏิเสธไม่สำเร็จ: ${error.message}`);
      return;
    }
    logInflu(supabase, actor, {
      action: "status",
      entityId: target.id,
      influencerId: target.id,
      influencerName: influName(target),
      summary: next
        ? `ทำเครื่องหมายว่า ${influName(target)} ปฏิเสธ (ไม่ร่วมงาน)`
        : `ยกเลิกสถานะปฏิเสธของ ${influName(target)}`,
    });
    markServerStale();
  };

  /** ติ๊ก/ยกเลิก "ส่งเอกสารแล้ว" ในคิวรอทำ Memo — บันทึกลง DB ให้ทั้งทีมเห็นตรงกัน
      (เคสยังอยู่ในคิวจนกว่าจะอัพโหลดไฟล์ Memo — ติ๊กนี้แค่กันส่งเอกสารซ้ำ) */
  const toggleDocsSent = async (target: InfluencerListRow) => {
    const next = target.docs_sent_at ? null : new Date().toISOString();
    const prevItems = items;
    setActionError(null);
    setItems((cur) =>
      cur.map((i) => (i.id === target.id ? { ...i, docs_sent_at: next } : i))
    );
    const { error } = await supabase
      .from("influencers")
      .update({ docs_sent_at: next })
      .eq("id", target.id);
    if (error) {
      setItems(prevItems);
      setActionError(`บันทึกสถานะส่งเอกสารไม่สำเร็จ: ${error.message}`);
      return;
    }
    logInflu(supabase, actor, {
      action: "status",
      entityId: target.id,
      influencerId: target.id,
      influencerName: influName(target),
      summary: next
        ? `ติ๊กว่าส่งเอกสารให้ ${influName(target)} แล้ว`
        : `ยกเลิกการติ๊ก "ส่งเอกสารแล้ว" ของ ${influName(target)}`,
    });
    markServerStale();
  };

  /* ข้อ checklist ของโหมดที่แต่ละเคสไม่ได้ใช้ถูกซ่อนไว้ใน DB — ต้องตัดออกก่อนนับ
     ไม่งั้นชิปเตือนบนการ์ดจะนับข้อของโหมดที่มองไม่เห็นด้วย */
  const activeTasks = useMemo(() => {
    const modeById = new Map(items.map((i) => [i.id, i.followup_mode]));
    return tasks.filter(
      (t) => t.is_custom === (modeById.get(t.influencer_id) === "custom")
    );
  }, [tasks, items]);

  /* สถิติ follow up ต่อคน: เกินกำหนดกี่งาน, งานถัดไปครบกำหนดเมื่อไหร่, follow ล่าสุดเมื่อไหร่ */
  const statsByInflu = useMemo(() => {
    const map = new Map<string, InfluStats>();
    for (const t of activeTasks) {
      const s =
        map.get(t.influencer_id) ??
        ({ overdue: 0, nextDue: null, lastDone: null, pending: 0 } as InfluStats);
      if (!t.done) {
        s.pending += 1;
        if (t.due_date) {
          if (t.due_date < today) s.overdue += 1;
          if (!s.nextDue || t.due_date < s.nextDue) s.nextDue = t.due_date;
        }
      } else if (t.done_at && (!s.lastDone || t.done_at > s.lastDone)) {
        s.lastDone = t.done_at;
      }
      map.set(t.influencer_id, s);
    }
    return map;
  }, [activeTasks, today]);

  const totalDue = useMemo(() => {
    let n = 0;
    for (const t of activeTasks) {
      if (!t.done && t.due_date && t.due_date <= today) n += 1;
    }
    return n;
  }, [activeTasks, today]);

  /* กรองค้นหา + stage + ยกเว้น — ลำดับในคอลัมน์บอร์ดจัดตาม board_position (ลากเรียงเอง)
     ชิป "ปฏิเสธ" / "รอลงคิวหมอ" = ดูเฉพาะกลุ่มนั้น (ข้ามตัวกรองยกเว้น ไม่งั้นเลือกแล้วว่างเปล่า)

     สถานะที่ "เลือกดูอยู่" ต้องชนะรายการยกเว้นเสมอ — ไม่งั้นคนที่ยกเว้น "จบงาน" ไว้
     แล้วกดชิป "จบงาน" จะได้บอร์ดว่างทั้งที่มีเคสอยู่ (บั๊กชนิดเดียวกับที่เคยแก้ใน /tasks) */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    /** สถานะที่ชิปปัจจุบันกำลังเจาะดู — ไม่เอาไปยกเว้นซ้ำ */
    const picked: InfluStatusKey | null =
      stageFilter === "done"
        ? "done"
        : typeof stageFilter === "number"
          ? stageFilter === 1
            ? "waiting"
            : "accepted"
          : null;
    return items.filter((i) => {
      const status = influStatusOf(i);
      if (stageFilter === "needbooking") {
        if (!bookingAlertIds.has(i.id)) return false;
      } else if (stageFilter === "declined") {
        if (status !== "declined") return false;
      } else {
        if (status !== picked && excluded.has(status)) return false;
        if (stageFilter === "done" && status !== "done") return false;
        if (typeof stageFilter === "number") {
          if (status === "declined" || i.completed || i.stage !== stageFilter)
            return false;
        }
      }
      // "เคสของฉัน" = ที่ฉันเป็นผู้รับผิดชอบ (owner_id) — หลายทีมใช้บอร์ดร่วมกัน
      if (mineOnly && i.owner_id !== me.id) return false;
      if (q === "") return true;
      return (
        influName(i).toLowerCase().includes(q) ||
        (i.influ_code ?? "").toLowerCase().includes(q) ||
        (i.phone ?? "").includes(q) ||
        (i.procedure_text ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, stageFilter, excluded, bookingAlertIds, mineOnly, me.id]);

  /** คิว "รอทำ Memo" — ติ๊กว่าข้อมูลครบแล้ว (Stage 3) แต่ยังไม่ได้อัพโหลดไฟล์ Memo
      = ยังไม่มีใครลงมือทำ; อัพโหลดแล้วหลุดจากคิวเอง — เรียงคนที่รอนานสุดขึ้นก่อน
      (ไม่สนตัวกรอง/ยกเว้นของบอร์ด — คิวนี้ต้องเห็นครบเสมอ) */
  const memoWaiting = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.memo_ready_at !== null &&
            i.memo_file_path === null &&
            i.stage === INFLU_STAGE.memo &&
            !i.completed &&
            i.declined_at === null
        )
        .sort((a, b) => (a.memo_ready_at ?? "").localeCompare(b.memo_ready_at ?? "")),
    [items]
  );

  /* ---- modal เพิ่ม influ (stage 1: รหัส Influ ID · ชื่อ · เบอร์ · หัตถการที่รับ) ---- */
  // flow ใหม่ (0080): เพิ่มโปรไฟล์ก่อน → ค่อย "สร้างนัด" (เคสเริ่มที่ขั้น Memo)
  const [profileOpen, setProfileOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  // หัตถการที่เพิ่งถูกลงทะเบียนเข้าเมนูทีมระหว่างเปิดหน้า — โผล่ในโมดัลทันทีไม่ต้องรอ refresh
  const [extraServices, setExtraServices] = useState<InfluServiceRow[]>([]);
  const allServices = useMemo(
    () => [...services, ...extraServices],
    [services, extraServices]
  );

  const stageChips: {
    key: number | "all" | "done" | "declined";
    label: string;
  }[] = [
    { key: "all", label: "ทั้งหมด" },
    ...INFLU_STAGES.map((s) => ({ key: s.step, label: `${s.step}. ${s.short}` })),
    { key: "done", label: "จบงานแล้ว" },
    { key: "declined", label: "ปฏิเสธ" },
  ];

  const countFor = (key: number | "all" | "done" | "declined") =>
    key === "all"
      ? items.length
      : key === "declined"
        ? items.filter((i) => influStatusOf(i) === "declined").length
        : key === "done"
          ? items.filter((i) => influStatusOf(i) === "done").length
          : items.filter(
              (i) =>
                influStatusOf(i) !== "declined" &&
                !i.completed &&
                i.stage === key
            ).length;

  const bookingAlertActive = stageFilter === "needbooking";

  return (
    <>
      {/* ระดับ "ดูเฉยๆ" — บอกให้ชัดตั้งแต่ต้นว่าทำไมไม่มีปุ่มแก้ */}
      {!me.canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-stone-200 bg-white/70 px-4 py-2.5 text-sm text-stone-600 animate-fade-in">
          <Eye size={16} className="shrink-0 text-stone-400" />
          บัญชีนี้เป็นระดับ <span className="font-semibold">Viewer</span> —
          เปิดดูเคสได้ทั้งหมด แต่เพิ่ม/แก้/ลบไม่ได้
        </div>
      )}

      {/* แท็บ: บอร์ด | รอทำ Memo — แยกคิวให้ influ manager เห็นว่ามีเคสไหนข้อมูลครบรออยู่ */}
      <div className="mb-4 flex gap-1 overflow-x-auto [scrollbar-width:none] animate-fade-in-up">
        <button
          type="button"
          onClick={() => setTab("board")}
          className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            tab === "board"
              ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
              : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
          }`}
        >
          <LayoutGrid size={16} />
          บอร์ด
        </button>
        <button
          type="button"
          onClick={() => setTab("memo")}
          className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            tab === "memo"
              ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
              : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
          }`}
        >
          <ClipboardCheck size={16} />
          รอทำ Memo
          {memoWaiting.length > 0 && (
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                tab === "memo"
                  ? "bg-white/25 text-cream"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {memoWaiting.length}
            </span>
          )}
        </button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}

      {tab === "board" && totalDue > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 animate-fade-in">
          <BellRing size={16} className="shrink-0" />
          มีงาน follow up ถึงกำหนดแล้ว {formatNumber(totalDue)} รายการ —
          การ์ดที่ต้องตามมีป้ายเตือนสีเหลือง/แดงบนบอร์ด
        </div>
      )}

      {tab === "board" && bookingAlertIds.size > 0 && !bookingAlertActive && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 animate-fade-in">
          <CalendarClock size={16} className="shrink-0" />
          <span>
            มี {formatNumber(bookingAlertIds.size)} เคสที่ผ่าน Memo แล้วแต่
            <span className="font-semibold">ยังไม่มีคิวหมอในปฏิทิน</span> —
            ตามให้ influ ยืนยันวัน แล้วลงคิวหลังฝั่งโรงพยาบาลลงคิวหมอเรียบร้อย
          </span>
          <button
            type="button"
            onClick={() => setStageFilter("needbooking")}
            className="ml-auto cursor-pointer rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-600 active:scale-[0.97]"
          >
            ดูเฉพาะเคสเหล่านี้
          </button>
        </div>
      )}

      {/* แถวเครื่องมือ: ค้นหา/ตัวกรอง (เฉพาะแท็บบอร์ด — คิว Memo ต้องเห็นครบเสมอ
          ไม่ผูกตัวกรอง) + ปุ่มงานหลักชิดขวา
          หัวข้อหน้า + คำอธิบายถูกถอดออก 2026-08-20 ตามคำสั่งผู้ใช้ (ชื่อหน้าอยู่บนเมนู
          ของระบบอยู่แล้ว) ปุ่ม "สร้างนัดใหม่" จึงย้ายลงมาอยู่แถวเดียวกับตัวกรอง —
          แถวนี้ต้อง render ทุกแท็บ ไม่งั้นแท็บ "รอทำ Memo" จะสร้างนัดไม่ได้ */}
      <div className="mb-4 flex flex-wrap items-center gap-3 animate-fade-in-up">
        {tab === "board" && (
          <>
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <Input
              type="search"
              placeholder="ค้นหาชื่อ รหัส Influ ID เบอร์ หรือหัตถการ..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stageChips.map((chip) => {
              const active = stageFilter === chip.key;
              const count = countFor(chip.key);
              // ขั้นติดต่อ/รายละเอียดย้ายไปบอร์ด Hunting แล้ว (0081) — เคสใหม่เริ่มที่ Memo
              // ชิป 2 ขั้นแรกจึงซ่อนเมื่อว่าง (เคสเก่าที่ถูกย้อน stage ลงมายังโผล่ได้)
              if (
                typeof chip.key === "number" &&
                chip.key <= INFLU_STAGE.caseDetail &&
                count === 0 &&
                !active
              )
                return null;
              return (
                <button
                  key={String(chip.key)}
                  type="button"
                  onClick={() => setStageFilter(chip.key)}
                  className={`cursor-pointer rounded-full px-3.5 py-2.5 text-xs font-medium transition-all duration-200 active:scale-[0.95] sm:py-1.5 ${
                    active
                      ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                      : "border border-brand-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  {chip.label}
                  <span className={active ? "opacity-80" : "text-stone-400"}>
                    {" "}
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
          {/* ตัวกรองเตือน: ถึง Memo แล้วแต่ยังไม่มีคิวหมอในปฏิทิน — ปุ่มเรืองแสงเมื่อมีเคสค้าง */}
          <button
            type="button"
            onClick={() =>
              setStageFilter(bookingAlertActive ? "all" : "needbooking")
            }
            title="เคสที่ผ่าน Stage 3 (Memo) แล้วแต่ยังไม่มีคิว 'เข้ารับบริการ' ในปฏิทิน — ต้องตามให้ influ ยืนยันวัน แล้วลงคิวหลังฝั่งโรงพยาบาลลงคิวหมอ"
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-[0.97] ${
              bookingAlertActive
                ? "border-amber-500 bg-gradient-to-b from-amber-400 to-amber-500 text-white shadow-sm"
                : bookingAlertIds.size > 0
                  ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 animate-glow-amber"
                  : "border-brand-200 bg-white/70 text-stone-500 hover:border-brand-300 hover:bg-brand-50"
            }`}
          >
            <CalendarClock size={14} />
            รอลงคิวหมอ
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                bookingAlertActive
                  ? "bg-white/25 text-white"
                  : bookingAlertIds.size > 0
                    ? "bg-amber-200 text-amber-900"
                    : "bg-stone-100 text-stone-400"
              }`}
            >
              {bookingAlertIds.size}
            </span>
          </button>
          {/* เคสของฉัน — ผู้รับผิดชอบ (owner_id) คือคนที่สร้างการ์ดนั้น */}
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            title="ดูเฉพาะเคสที่ฉันเป็นผู้รับผิดชอบ (คนที่สร้างการ์ด)"
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-[0.97] ${
              mineOnly
                ? "border-brand-400 bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "border-brand-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:bg-brand-50"
            }`}
          >
            <UserRound size={14} />
            เคสของฉัน
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                mineOnly ? "bg-white/25 text-cream" : "bg-stone-100 text-stone-500"
              }`}
            >
              {items.filter((i) => i.owner_id === me.id).length}
            </span>
          </button>
          <InfluExcludeFilter
            excluded={excluded}
            onChange={setExcluded}
            countOf={(s) => items.filter((i) => influStatusOf(i) === s).length}
          />
          {(search !== "" ||
            stageFilter !== "all" ||
            mineOnly ||
            !excludedIsDefault) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStageFilter("all");
                setMineOnly(false);
                setExcluded(new Set(DEFAULT_EXCLUDED));
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
            >
              <X size={14} />
              ล้างตัวกรอง
            </button>
          )}
          </>
        )}
        {/* ปุ่มงานหลัก — ย้ายลงมาจากหัวหน้า (ผู้ใช้ 2026-08-20)
            ทางเข้าอื่น (ปฏิทินคิว / สัญญา) อยู่บนเมนูของระบบแล้ว จึงไม่ทำปุ่มซ้ำที่นี่ */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {/* ทะเบียนหมอ = งานผู้ดูแลระบบ (กันชื่อสะกดเพี้ยนงอกใหม่จากหลายทีม) */}
          {me.canManage && (
            <button
              type="button"
              onClick={() => setDoctorsOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-4 py-2 text-sm font-medium text-brand-700 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97]"
            >
              <Stethoscope size={16} />
              จัดการหมอ
            </button>
          )}
          {me.canEdit && (
            <>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-4 py-2 text-sm font-medium text-brand-700 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97]"
              >
                <UserRoundPlus size={16} />
                เพิ่มโปรไฟล์
              </button>
              <Button onClick={() => setCaseOpen(true)}>
                <Plus size={16} />
                สร้างนัดใหม่
              </Button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {actionError}
        </div>
      )}

      {tab === "memo" ? (
        <MemoWaitingList
          items={memoWaiting}
          canEdit={me.canEdit}
          onOpen={(id) => router.push(`/influencers/${id}`)}
          onToggleDocsSent={(i) => void toggleDocsSent(i)}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={40} strokeWidth={1.5} />}
            title="ยังไม่มี Influencer ในระบบ"
            description="เริ่มจากเพิ่มโปรไฟล์คนที่ตกลงร่วมงาน แล้วกด 'สร้างนัดใหม่' เพื่อเปิดเคสเดินงานทีละ stage"
            action={
              me.canEdit ? (
                <Button onClick={() => setCaseOpen(true)}>
                  <Plus size={16} />
                  สร้างนัดแรก
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          {bookingAlertActive && search === "" ? (
            <EmptyState
              icon={<CalendarClock size={40} strokeWidth={1.5} />}
              title="ทุกเคสที่ผ่าน Memo มีคิวหมอในปฏิทินแล้ว"
              description="ไม่มีเคสไหนค้างรอลงคิว — เคสจะโผล่ที่นี่เมื่อเดินถึง Stage 3 (Memo) แล้วยังไม่มีคิว 'เข้ารับบริการ' ในปฏิทิน"
            />
          ) : (
            <EmptyState
              icon={<Search size={40} strokeWidth={1.5} />}
              title="ไม่พบรายชื่อที่ตรงกับตัวกรอง"
              description="ลองเปลี่ยนคำค้นหา, stage หรือเช็คตัวกรอง 'ยกเว้น' (ค่าเริ่มต้นซ่อนคนที่ปฏิเสธ)"
            />
          )}
        </Card>
      ) : (
        <InfluBoard
          items={filtered}
          statsByInflu={statsByInflu}
          linksByInflu={linksByInflu}
          bookingAlertIds={bookingAlertIds}
          ownerNameById={nameById}
          today={today}
          deletingId={deletingId}
          canEdit={me.canEdit}
          canDelete={mayDelete}
          onOpen={(i) => router.push(`/influencers/${i.id}`)}
          onDelete={(i) => {
            setActionError(null);
            setDeleteTarget(i);
          }}
          onToggleDeclined={(i) => void toggleDeclined(i)}
          onMove={(id, group, prevId, nextId) =>
            void moveInflu(id, group, prevId, nextId)
          }
        />
      )}

      {/* flow ใหม่ (0080): เพิ่มโปรไฟล์ (ตัวบุคคล) → สร้างนัด (เคส เริ่มที่ขั้น Memo) */}
      <ProfileFormModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        actor={actor}
        onSaved={() => router.refresh()}
      />
      <NewCaseModal
        open={caseOpen}
        onClose={() => setCaseOpen(false)}
        profiles={profiles}
        services={allServices}
        priceCatalog={priceCatalog}
        doctors={doctors}
        me={{ id: me.id, name: me.name }}
        actor={actor}
        onServiceCreated={(sv) => setExtraServices((prev) => [...prev, sv])}
      />

      {/* ยืนยันลบ influencer — ลบแล้วเข้าถังขยะ 30 วัน (ผู้ดูแลกู้คืนได้) */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบ Influencer"
        message={
          <>
            ลบ{" "}
            <span className="font-medium text-stone-800">
              {deleteTarget ? influName(deleteTarget) : ""}
            </span>{" "}
            ออกจากบอร์ด? ข้อมูลทุก stage (follow-up, ลายเซน, ต้นทุน, ลิงก์,
            คิวในปฏิทิน) จะถูก
            <span className="font-medium"> สำรองไว้ในถังขยะ 30 วัน </span>
            ให้ผู้ดูแลระบบกู้คืนได้ · ส่วน
            <span className="font-medium"> ไฟล์ที่อัปโหลด </span>
            (รูป/Memo/สัญญา) จะถูกลบถาวรทันที และงานคอนเทนต์ที่เคยผูกไว้จะยังอยู่
            แต่ไม่ผูกกับ influencer คนนี้แล้ว
          </>
        }
        confirmLabel="ลบและเก็บลงถังขยะ"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />

      {/* ทะเบียนแพทย์ — ตัวเลือก "แพทย์ที่รับเคส" ทั้งใน stage 2 และปฏิทินคิว */}
      <DoctorManagerModal
        open={doctorsOpen}
        onClose={() => setDoctorsOpen(false)}
        doctors={doctors}
      />
    </>
  );
}
