"use client";

import {
  BellRing,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  EyeOff,
  FileSignature,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
} from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { formatNumber, todayISO } from "@/lib/format";
import {
  INFLU_STAGES,
  INFLU_TIERS,
  sizeGroupFromFollowers,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluSizeGroup } from "@/lib/types";
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
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const panelW = 264;
      // หนีบขอบจอ — จอแคบเมนูต้องไม่ล้นออกนอกจอ
      setPos({
        x: Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8)),
        y: r.bottom + 6,
      });
    }
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
  onOpen,
}: {
  items: InfluencerListRow[];
  onOpen: (id: string) => void;
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
        คัดลอกข้อความไปทำ Memo แล้วอัพโหลดไฟล์กลับเข้ามา (อัพโหลดแล้วหลุดจากคิวนี้เอง)
      </p>
      <Card className="divide-y divide-stone-100 !p-0">
        {items.map((i) => {
          const late = memoWaitIsLate(i.memo_ready_at!);
          const meta = [
            i.tier ? INFLU_TIERS[i.tier].label : null,
            i.followers !== null ? `${formatNumber(i.followers)} followers` : null,
            i.procedure_text,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => onOpen(i.id)}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/40 active:scale-[0.997]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-800">
                  {influName(i)}
                </p>
                {meta !== "" && (
                  <p className="truncate text-xs text-stone-500">{meta}</p>
                )}
              </div>
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
          );
        })}
      </Card>
    </div>
  );
}

export function InfluencersClient({
  influencers,
  tasks,
  loadError,
}: {
  influencers: InfluencerListRow[];
  tasks: InfluTaskLite[];
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  // สำเนา state ฝั่งจอ — ลบ/ลากแล้วเห็นผลทันที (optimistic) แล้วค่อย sync กับ server
  const [items, setItems] = useState<InfluencerListRow[]>(influencers);
  useEffect(() => setItems(influencers), [influencers]);

  /** แท็บ: บอร์ดปกติ | คิวรอทำ Memo (stage 3 ที่ติ๊กว่าข้อมูลครบแล้ว) */
  const [tab, setTab] = useState<"board" | "memo">("board");

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<
    number | "all" | "done" | "declined"
  >("all");

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

  const handleDelete = async (target: InfluencerListRow) => {
    setDeletingId(target.id);
    setActionError(null);
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== target.id)); // optimistic
    const { error } = await supabase
      .from("influencers")
      .delete()
      .eq("id", target.id);
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
    }
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
    }
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
     ชิป "ปฏิเสธ" = ดูเฉพาะคนที่ปฏิเสธ (ข้ามตัวกรองยกเว้น ไม่งั้นเลือกแล้วว่างเปล่า) */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const status = influStatusOf(i);
      if (stageFilter === "declined") {
        if (status !== "declined") return false;
      } else {
        if (excluded.has(status)) return false;
        if (stageFilter === "done" && status !== "done") return false;
        if (typeof stageFilter === "number") {
          if (status === "declined" || i.completed || i.stage !== stageFilter)
            return false;
        }
      }
      if (q === "") return true;
      return (
        influName(i).toLowerCase().includes(q) ||
        (i.phone ?? "").includes(q) ||
        (i.procedure_text ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, stageFilter, excluded]);

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
            i.stage === 3 &&
            !i.completed &&
            i.declined_at === null
        )
        .sort((a, b) => (a.memo_ready_at ?? "").localeCompare(b.memo_ready_at ?? "")),
    [items]
  );

  /* ---- modal เพิ่ม influ (stage 1: ชื่อ นามสกุล เบอร์) ---- */
  const [addOpen, setAddOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    const { data, error } = await supabase
      .from("influencers")
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setFormError(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setAddOpen(false);
    router.push(`/influencers/${data.id}`);
    router.refresh();
  };

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

  return (
    <>
      <PageHeader
        title="Influ Management"
        description="บอร์ด Influencer แบ่งตามขนาดผู้ติดตาม — ลากการ์ดย้ายกลุ่ม/เรียงลำดับได้ คลิกการ์ดเพื่อเดินงานทีละ stage"
        action={
          <div className="flex gap-2">
            <Link
              href="/influencers/contracts"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-4 py-2 text-sm font-medium text-brand-700 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97]"
            >
              <FileSignature size={16} />
              อายุสัญญา & Campaign
            </Link>
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} />
              เพิ่ม Influencer
            </Button>
          </div>
        }
      />

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

      {/* ค้นหา + กรอง stage — เฉพาะแท็บบอร์ด (คิว Memo ต้องเห็นครบเสมอ ไม่ผูกตัวกรอง) */}
      {tab === "board" && (
      <div className="mb-4 flex flex-wrap items-center gap-3 animate-fade-in-up">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            type="search"
            placeholder="ค้นหาชื่อ เบอร์ หรือหัตถการ..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stageChips.map((chip) => {
            const active = stageFilter === chip.key;
            const count = countFor(chip.key);
            return (
              <button
                key={String(chip.key)}
                type="button"
                onClick={() => setStageFilter(chip.key)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.95] ${
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
        <InfluExcludeFilter
          excluded={excluded}
          onChange={setExcluded}
          countOf={(s) => items.filter((i) => influStatusOf(i) === s).length}
        />
        {(search !== "" || stageFilter !== "all" || !excludedIsDefault) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStageFilter("all");
              setExcluded(new Set(DEFAULT_EXCLUDED));
            }}
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
          >
            <X size={14} />
            ล้างตัวกรอง
          </button>
        )}
      </div>
      )}

      {actionError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {actionError}
        </div>
      )}

      {tab === "memo" ? (
        <MemoWaitingList
          items={memoWaiting}
          onOpen={(id) => router.push(`/influencers/${id}`)}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={40} strokeWidth={1.5} />}
            title="ยังไม่มี Influencer ในระบบ"
            description="เริ่มจากเพิ่มรายชื่อที่กำลังติดต่อ แล้วเดินงานทีละ stage จนจบสัญญา"
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={16} />
                เพิ่ม Influencer คนแรก
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={40} strokeWidth={1.5} />}
            title="ไม่พบรายชื่อที่ตรงกับตัวกรอง"
            description="ลองเปลี่ยนคำค้นหา, stage หรือเช็คตัวกรอง 'ยกเว้น' (ค่าเริ่มต้นซ่อนคนที่ปฏิเสธ)"
          />
        </Card>
      ) : (
        <InfluBoard
          items={filtered}
          statsByInflu={statsByInflu}
          today={today}
          deletingId={deletingId}
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

      {/* modal เพิ่ม influ — stage 1 เก็บแค่ ชื่อ นามสกุล เบอร์ */}
      <Modal
        open={addOpen}
        onClose={() => !saving && setAddOpen(false)}
        title="เพิ่ม Influencer (เริ่มติดต่อ)"
      >
        <form onSubmit={(e) => void handleAdd(e)} className="space-y-4">
          <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
            <UsersRound size={14} className="shrink-0" />
            Stage 1: กรอกแค่ชื่อกับเบอร์ติดต่อพอ — รายละเอียดเคสไปกรอกใน stage
            ถัดไปหลังยืนยันร่วมงาน
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inf-first">ชื่อ *</Label>
              <Input
                id="inf-first"
                required
                disabled={saving}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="เช่น ภานุเดช"
              />
            </div>
            <div>
              <Label htmlFor="inf-last">นามสกุล</Label>
              <Input
                id="inf-last"
                disabled={saving}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="เช่น อินทร์ศรี"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="inf-phone">เบอร์โทรติดต่อ</Label>
            <Input
              id="inf-phone"
              disabled={saving}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </div>
          {formError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setAddOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit" loading={saving} disabled={!firstName.trim()}>
              เพิ่มและเปิดหน้าเดินงาน
            </Button>
          </div>
        </form>
      </Modal>

      {/* ยืนยันลบ influencer */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบ Influencer"
        message={
          <>
            ลบ{" "}
            <span className="font-medium text-stone-800">
              {deleteTarget ? influName(deleteTarget) : ""}
            </span>{" "}
            ออกจากระบบถาวร? ข้อมูลทุก stage — follow-up, ลายเซน, สัญญา,
            แคมเปญ และไฟล์ที่อัปโหลด — จะถูกลบทั้งหมด (กู้คืนไม่ได้)
            ส่วนงานคอนเทนต์ที่เคยผูกไว้จะยังอยู่ แต่ไม่ผูกกับ influencer คนนี้แล้ว
          </>
        }
        confirmLabel="ลบถาวร"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
