"use client";

/**
 * แผงข้างของหน้า Follow Up — มี 2 โหมดในเชลล์เดียวกัน (ผู้ใช้ 2026-08-29)
 *   `quota` = ตั้งเป้าว่า influ คนนี้ต้องลงคลิปช่องไหนกี่โพส (เปิดจากปุ่มเป้าในแถว)
 *   `track` = ติดตามงานจริง: แปะลิงก์โพส/ผลลัพธ์/แคมเปญ/โน้ต/ปิดงาน (เปิดจากการกดแถว)
 *
 * เชลล์ลอกแพตเทิร์นจาก prospect-panel (บอร์ด Hunting): portal ไป body,
 * backdrop z-40 + aside z-50, Esc = blur ช่องที่โฟกัสก่อนแล้วค่อยปิด
 * (ให้ commit-on-blur ทำงานทัน), ช่องกรอกเป็น uncontrolled + key = ค่าจริง.
 *
 * กติกาเนื้อหา:
 * - **การลงคลิปคือส่วนที่ force** — อยู่บนสุด มีแถบความคืบหน้าเทียบเป้า
 * - ฟอร์มเพิ่มลิงก์ **บังคับเลือกช่องทาง** และตัวเลือกมาจากเป้าที่ตั้งไว้เท่านั้น
 *   (ยังไม่ตั้งเป้า = ไม่ให้แปะลิงก์ ชี้ไปตั้งเป้าก่อน — ไม่งั้นนับเข้าเป้าไม่ได้)
 * - ผลลัพธ์/เช็คลิสต์เป็นส่วนรอง พับไว้ ไม่ force
 */

import {
  ArrowUpRight,
  CalendarRange,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Link2,
  Megaphone,
  MessageCircle,
  Plus,
  RotateCcw,
  StickyNote,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  menuBox,
  useAnchoredMenu,
  type MenuBox,
} from "@/components/anchored-menu";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";
import {
  INFLU_FOLLOWUP_MODES,
  INFLU_POST_KIND_ORDER,
  INFLU_POST_KINDS,
  INFLU_POST_PLATFORM_ORDER,
  INFLU_POST_PLATFORM_PRIMARY,
  INFLU_POST_PLATFORMS,
  INFLU_TIERS,
  postLinkPlatform,
  postPlatformLabel,
  roundLabel,
} from "@/influ/lib/influ-constants";
import type {
  InfluencerRow,
  InfluPostKind,
  InfluPostLinkRow,
  InfluPostPlatform,
  InfluPostQuotas,
  InfluTaskRow,
} from "@/lib/types";
import {
  influName,
  TRACK_STATUSES,
  type TrackRow,
} from "./followup-utils";

export type PanelMode = "track" | "quota";

const PANEL_TABS: {
  key: PanelMode;
  label: string;
  icon: typeof Link2;
}[] = [
  { key: "track", label: "ติดตามงาน", icon: Link2 },
  { key: "quota", label: "ตั้งเป้าโพส", icon: Target },
];

/* ------------------------------------------------------------------ */
/* ชิ้นส่วนที่ลิสต์ใช้ร่วม                                              */
/* ------------------------------------------------------------------ */

/** แถวจุดสถานะเช็คพอยต์รูปผลลัพธ์ (เขียว=ส่งแล้ว แดง=เลยกำหนด ว่าง=รอ) — ส่วนรอง ไม่ force */
export function PhotoDots({
  tasks,
  today,
}: {
  tasks: InfluTaskRow[];
  today: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {tasks.map((t) => {
        const overdue = !t.done && t.due_date !== null && t.due_date < today;
        return (
          <span
            key={t.id}
            className={`h-2 w-2 rounded-full ${
              t.done
                ? "bg-emerald-400"
                : overdue
                  ? "bg-rose-300"
                  : "border border-stone-300 bg-white/70"
            }`}
            title={`${t.title}${t.due_date ? ` — กำหนด ${formatDate(t.due_date)}` : ""}${
              t.done ? " · ส่งแล้ว" : overdue ? " · เลยกำหนด" : ""
            }`}
          />
        );
      })}
    </span>
  );
}

/** แถบความคืบหน้าคลิปตามเป้า + ขีดบอก "เป้าที่ควรได้ ณ วันนี้" — ใช้ทั้งแถวและแผง */
export function ClipProgressBar({ row }: { row: TrackRow }) {
  if (row.quotaTotal === 0)
    return (
      <span className="block h-1.5 rounded-full border border-dashed border-amber-300 bg-amber-50" />
    );
  const pct = (row.metCount / row.quotaTotal) * 100;
  const expectedPct = (row.expectedByNow / row.quotaTotal) * 100;
  const behind = row.metCount < row.expectedByNow;
  return (
    <span className="relative block h-1.5 overflow-hidden rounded-full bg-stone-200/70">
      <span
        className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${
          row.metCount >= row.quotaTotal
            ? "from-emerald-400 to-emerald-500"
            : behind
              ? "from-rose-400 to-rose-500"
              : "from-brand-400 to-brand-600"
        }`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
      <span
        className="absolute inset-y-0 w-0.5 bg-stone-600/60"
        style={{ left: `${Math.min(100, expectedPct)}%` }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* แผงข้าง                                                             */
/* ------------------------------------------------------------------ */

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
      <Icon size={14} className="text-brand-500" />
      {children}
    </h3>
  );
}

/** แจ้งเตือนที่แผงขอให้หน้าแม่ส่งหลังบันทึกสำเร็จ (หน้าแม่รู้ว่าใครรับผิดชอบเคสไหน) */
type PanelNoti = {
  type: string;
  title: string;
  body?: string | null;
  baseLevel?: "action" | "update";
};

export function TrackingPanel({
  row,
  mode,
  onModeChange,
  today,
  canEdit,
  onClose,
  onPatchInflu,
  onAddLink,
  onRemoveLink,
  onToggleTask,
  onAddCampaign,
}: {
  row: TrackRow;
  mode: PanelMode;
  onModeChange: (m: PanelMode) => void;
  today: string;
  canEdit: boolean;
  onClose: () => void;
  onPatchInflu: (
    patch: Partial<InfluencerRow>,
    summary: string,
    noti?: PanelNoti
  ) => void;
  onAddLink: (
    kind: InfluPostKind,
    platform: InfluPostPlatform,
    url: string,
    note: string
  ) => Promise<string | null>;
  onRemoveLink: (link: InfluPostLinkRow) => void;
  onToggleTask: (task: InfluTaskRow) => void;
  onAddCampaign: (f: {
    name: string;
    date: string;
    detail: string;
  }) => Promise<string | null>;
}) {
  const i = row.influ;

  // Esc = blur ช่องที่โฟกัสอยู่ก่อน (ให้ commit-on-blur ทำงาน) แล้วค่อยปิดแผง
  const closeRef = useRef(onClose);
  // เขียน ref ใน effect ไม่ใช่ระหว่าง render (กฎ react-hooks/refs) — handler อ่านค่า
  // ตอนกด Esc อยู่แล้ว จึงได้ onClose ล่าสุดเหมือนเดิม
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const meta = TRACK_STATUSES[row.status];

  return createPortal(
    <>
      <button
        type="button"
        aria-label="ปิดแผง"
        className="fixed inset-0 z-40 cursor-default bg-stone-900/20 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-white/70 bg-white/95 pt-safe shadow-[0_0_60px_rgba(94,58,49,0.25)] backdrop-blur-2xl animate-slide-in-right sm:inset-y-3 sm:right-3 sm:rounded-2xl sm:border sm:pt-0">
        {/* หัวแผง */}
        <div className="flex items-center gap-2.5 border-b border-brand-100/60 px-4 py-3">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">
            {influName(i)}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 max-sm:h-11 max-sm:w-11"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        {/* สลับโหมด: ตั้งเป้า ↔ ติดตาม */}
        <div className="flex gap-1 border-b border-brand-100/60 bg-white/60 px-4 py-2">
          {PANEL_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onModeChange(key)}
              className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97] max-sm:min-h-11 ${
                mode === key
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 pb-safe-4">
          {/* ป้ายสถานะ + ลิงก์ไปหน้าเคส (โชว์ทั้ง 2 โหมด) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={meta.chip}>{meta.label}</Badge>
            {roundLabel(i.round_no) && (
              <Badge className="border border-stone-200 bg-stone-50 text-stone-500">
                {roundLabel(i.round_no)}
              </Badge>
            )}
            {i.tier && (
              <Badge className={INFLU_TIERS[i.tier].badge}>
                {INFLU_TIERS[i.tier].label}
              </Badge>
            )}
            {i.completed && (
              <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Check size={11} /> ปิดงานแล้ว
              </Badge>
            )}
            <Link
              href={`/influencers/${i.id}`}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              เปิดหน้าเคส
              <ArrowUpRight size={13} />
            </Link>
          </div>

          {mode === "quota" ? (
            <QuotaMode row={row} canEdit={canEdit} onPatchInflu={onPatchInflu} />
          ) : (
            <TrackMode
              row={row}
              today={today}
              canEdit={canEdit}
              onModeChange={onModeChange}
              onPatchInflu={onPatchInflu}
              onAddLink={onAddLink}
              onRemoveLink={onRemoveLink}
              onToggleTask={onToggleTask}
              onAddCampaign={onAddCampaign}
            />
          )}
        </div>
      </aside>
    </>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* โหมด "ตั้งเป้าโพส" — KPI ตามสัญญา                                    */
/* ------------------------------------------------------------------ */

function QuotaMode({
  row,
  canEdit,
  onPatchInflu,
}: {
  row: TrackRow;
  canEdit: boolean;
  onPatchInflu: (
    patch: Partial<InfluencerRow>,
    summary: string,
    noti?: PanelNoti
  ) => void;
}) {
  const i = row.influ;
  const [extraPlatforms, setExtraPlatforms] = useState<InfluPostPlatform[]>([]);

  // "other" ตั้งเป้าไม่ได้ (แยกช่องทางจากลิงก์ไม่ออก) — ช่องหลักโชว์เสมอ
  const shown = INFLU_POST_PLATFORM_ORDER.filter(
    (p) =>
      p !== "other" &&
      ((INFLU_POST_PLATFORM_PRIMARY as readonly InfluPostPlatform[]).includes(
        p
      ) ||
        (row.quotas[p] ?? 0) > 0 ||
        (row.postCounts[p] ?? 0) > 0 ||
        extraPlatforms.includes(p))
  );
  const more = INFLU_POST_PLATFORM_ORDER.filter(
    (p) => p !== "other" && !shown.includes(p)
  );

  const commitQuota = (p: InfluPostPlatform, raw: string) => {
    const n = Math.round(Number(raw));
    const next: InfluPostQuotas = { ...(i.post_quotas ?? {}) };
    const cur = next[p] ?? 0;
    const val = Number.isFinite(n) && n > 0 ? n : 0;
    if (val === cur) return;
    if (val > 0) next[p] = val;
    else delete next[p];
    const label = INFLU_POST_PLATFORMS[p].label;
    onPatchInflu(
      { post_quotas: Object.keys(next).length > 0 ? next : null },
      val > 0 ? `ตั้งเป้าโพส ${label} = ${val} โพส` : `ลบเป้าโพส ${label}`,
      {
        type: "quota_set",
        title:
          val > 0
            ? `ตั้งเป้าโพส ${label} ของ ${influName(i)} = ${val} โพส`
            : `ลบเป้าโพส ${label} ของ ${influName(i)}`,
      }
    );
  };

  return (
    <>
      <section className="space-y-2">
        <SectionTitle icon={Target}>เป้าโพสคลิปตามสัญญา</SectionTitle>
        <div className="space-y-1.5">
          {shown.map((p) => {
            const pm = INFLU_POST_PLATFORMS[p];
            const quota = row.quotas[p] ?? 0;
            const count = row.postCounts[p] ?? 0;
            const met = quota > 0 && count >= quota;
            return (
              <div
                key={p}
                className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm"
              >
                <span
                  className={`inline-flex w-24 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-medium ${pm.chip}`}
                >
                  {pm.label}
                </span>
                <span className="font-medium text-stone-800">{count}</span>
                <span className="text-stone-400">/</span>
                <input
                  key={`q-${p}-${quota}`}
                  type="number"
                  min={0}
                  defaultValue={quota > 0 ? quota : ""}
                  placeholder="เป้า"
                  disabled={!canEdit}
                  onBlur={(e) => commitQuota(p, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  aria-label={`เป้าโพส ${pm.label}`}
                  className="w-16 rounded-lg border border-stone-200 bg-white px-2 py-1 text-base text-stone-800 focus:border-brand-300 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400 sm:text-sm"
                />
                <span className="text-xs text-stone-400">โพส</span>
                {met && <Check size={14} className="ml-auto text-emerald-500" />}
              </div>
            );
          })}
        </div>
        {canEdit && more.length > 0 && (
          <Select
            value=""
            onChange={(e) => {
              const p = e.target.value as InfluPostPlatform;
              if (p) setExtraPlatforms((prev) => [...prev, p]);
            }}
            className="text-xs"
            aria-label="เพิ่มช่องทางที่จะตั้งเป้า"
          >
            <option value="">+ ตั้งเป้าช่องทางอื่น...</option>
            {more.map((p) => (
              <option key={p} value={p}>
                {INFLU_POST_PLATFORMS[p].label}
              </option>
            ))}
          </Select>
        )}
        <p className="rounded-xl bg-brand-50/70 px-3 py-2 text-xs text-brand-800">
          รวมเป้าทั้งหมด{" "}
          <b className="tabular-nums">{formatNumber(row.quotaTotal)}</b> โพส ·
          ลงจริงแล้ว{" "}
          <b className="tabular-nums">{formatNumber(row.metCount)}</b> โพส
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle icon={CalendarRange}>อายุสัญญา</SectionTitle>
        <ContractBox row={row} />
      </section>
    </>
  );
}

function ContractBox({ row }: { row: TrackRow }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2.5 text-sm">
      <p className="text-stone-700">
        {formatDate(row.start)} – {formatDate(row.end)}
      </p>
      <p
        className={`mt-0.5 text-xs ${
          row.expired
            ? "text-rose-600"
            : row.daysLeft <= 30
              ? "text-amber-700"
              : "text-emerald-700"
        }`}
      >
        {row.expired
          ? "สัญญาหมดแล้ว"
          : `เหลืออีก ${formatNumber(row.daysLeft)} วัน`}
        {row.ownerName && (
          <span className="text-stone-400"> · สร้างโดย {row.ownerName}</span>
        )}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200/70">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${
            row.expired
              ? "from-rose-400 to-rose-500"
              : row.daysLeft <= 30
                ? "from-amber-400 to-amber-500"
                : "from-emerald-400 to-emerald-500"
          }`}
          style={{ width: `${row.usedPct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ปุ่มเลือกช่องทางของลิงก์                                             */
/* ------------------------------------------------------------------ */

/**
 * dropdown ช่องทางที่เกาะอยู่ท้ายช่องกรอกลิงก์ (ผู้ใช้ 2026-09-01 —
 * เดิมเป็น Select เต็มแถวเหนือช่องลิงก์) — ตัวเลือกยังมาจากเป้าที่ตั้งไว้
 * ตามกติกาเดิม และโชว์ "ลงแล้ว x/เป้า" ต่อช่องทางในเมนู
 */
function PlatformDropdown({
  value,
  options,
  showQuota,
  quotas,
  postCounts,
  disabled,
  onChange,
}: {
  value: InfluPostPlatform | "";
  options: InfluPostPlatform[];
  /** โหมดโพส = โชว์เป้า/ลงแล้วของแต่ละช่องทาง (คอมเมนต์ไม่นับเข้าเป้า) */
  showQuota: boolean;
  quotas: InfluPostQuotas;
  postCounts: Partial<Record<InfluPostPlatform, number>>;
  disabled?: boolean;
  onChange: (p: InfluPostPlatform) => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = (a: HTMLElement) =>
    setBox(menuBox(a, { width: 260, maxHeight: 280 }));

  useAnchoredMenu({
    open,
    anchorRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: place,
  });

  const pm = value ? INFLU_POST_PLATFORMS[value] : null;

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          if (anchorRef.current) place(anchorRef.current);
          setOpen(true);
        }}
        aria-label="ช่องทางของลิงก์"
        aria-expanded={open}
        className="flex shrink-0 cursor-pointer items-center gap-1 self-stretch rounded-lg border border-stone-300/80 bg-white/80 px-2.5 text-base transition-colors hover:bg-stone-50 disabled:cursor-default disabled:bg-stone-50 sm:text-sm max-sm:min-h-11"
      >
        {pm ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pm.chip}`}
          >
            {pm.short}
          </span>
        ) : (
          <span className="text-stone-500">ช่องทาง *</span>
        )}
        <ChevronDown size={14} className="shrink-0 text-stone-400" />
      </button>
      {open &&
        box &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[60] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl animate-scale-in"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              maxHeight: box.height,
            }}
          >
            {options.map((p) => {
              const o = INFLU_POST_PLATFORMS[p];
              const selected = p === value;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50 max-sm:min-h-11 ${
                    selected ? "font-semibold text-brand-700" : "text-stone-700"
                  }`}
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.chip}`}
                  >
                    {o.short}
                  </span>
                  <span className="truncate">{o.label}</span>
                  {selected && (
                    <Check size={14} className="shrink-0 text-brand-600" />
                  )}
                  {showQuota && (
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-stone-400">
                      ลงแล้ว {postCounts[p] ?? 0}/{quotas[p] ?? 0}
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* โหมด "ติดตามงาน"                                                    */
/* ------------------------------------------------------------------ */

function TrackMode({
  row,
  today,
  canEdit,
  onModeChange,
  onPatchInflu,
  onAddLink,
  onRemoveLink,
  onToggleTask,
  onAddCampaign,
}: {
  row: TrackRow;
  today: string;
  canEdit: boolean;
  onModeChange: (m: PanelMode) => void;
  onPatchInflu: (
    patch: Partial<InfluencerRow>,
    summary: string,
    noti?: PanelNoti
  ) => void;
  onAddLink: (
    kind: InfluPostKind,
    platform: InfluPostPlatform,
    url: string,
    note: string
  ) => Promise<string | null>;
  onRemoveLink: (link: InfluPostLinkRow) => void;
  onToggleTask: (task: InfluTaskRow) => void;
  onAddCampaign: (f: {
    name: string;
    date: string;
    detail: string;
  }) => Promise<string | null>;
}) {
  const i = row.influ;

  /* ---- ฟอร์มเพิ่มลิงก์ (บังคับเลือกช่องทางจากเป้าที่ตั้งไว้) ---- */
  const [linkKind, setLinkKind] = useState<InfluPostKind>("post");
  const [linkPlatform, setLinkPlatform] = useState<InfluPostPlatform | "">(
    row.quotaPlatforms[0] ?? ""
  );
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  // คอมเมนต์ไม่ได้นับเข้าเป้า จึงเลือกได้ทุกช่องทาง (รวม "อื่นๆ")
  const platformOptions =
    linkKind === "post"
      ? row.quotaPlatforms
      : INFLU_POST_PLATFORM_ORDER.slice();

  const submitLink = async () => {
    if (linkBusy || !linkUrl.trim()) return;
    if (!linkPlatform) {
      setLinkErr("เลือกช่องทางของลิงก์นี้ก่อน");
      return;
    }
    setLinkBusy(true);
    setLinkErr(null);
    const err = await onAddLink(
      linkKind,
      linkPlatform,
      linkUrl,
      linkNote.trim()
    );
    setLinkBusy(false);
    if (err) {
      setLinkErr(err);
      return;
    }
    setLinkUrl("");
    setLinkNote("");
  };

  // เรียงโพสตามช่องทาง แล้วไล่เลขต่อช่องทางแบบ Ig1/Fb2/Tk3 ของไฟล์ติดตามเดิม
  const posts = row.links
    .filter((l) => l.kind === "post")
    .sort((a, b) => {
      const pa = INFLU_POST_PLATFORM_ORDER.indexOf(postLinkPlatform(a));
      const pb = INFLU_POST_PLATFORM_ORDER.indexOf(postLinkPlatform(b));
      return pa !== pb ? pa - pb : a.position - b.position;
    });
  const comments = row.links.filter((l) => l.kind === "comment");
  const runningNo: Partial<Record<InfluPostPlatform, number>> = {};

  /* ---- Sub Campaign ---- */
  const [campOpen, setCampOpen] = useState(false);
  const [campName, setCampName] = useState("");
  const [campDate, setCampDate] = useState("");
  const [campDetail, setCampDetail] = useState("");
  const [campBusy, setCampBusy] = useState(false);
  const [campErr, setCampErr] = useState<string | null>(null);

  const submitCampaign = async () => {
    if (campBusy || !campName.trim()) return;
    setCampBusy(true);
    setCampErr(null);
    const err = await onAddCampaign({
      name: campName.trim(),
      date: campDate,
      detail: campDetail.trim(),
    });
    setCampBusy(false);
    if (err) {
      setCampErr(err);
      return;
    }
    setCampOpen(false);
    setCampName("");
    setCampDate("");
    setCampDetail("");
  };

  /* ---- ส่วนรอง: ผลลัพธ์ / เช็คลิสต์ (พับไว้) ---- */
  const [resultsOpen, setResultsOpen] = useState(false);
  const customMode = i.followup_mode === "custom";

  return (
    <>
      {/* ---------- ส่วนที่ force: คลิปตามสัญญา ---------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Target}>คลิปตามสัญญา</SectionTitle>
          <button
            type="button"
            onClick={() => onModeChange("quota")}
            className="cursor-pointer text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline max-sm:min-h-11"
          >
            {row.quotaTotal > 0 ? "แก้เป้า" : "ตั้งเป้า"}
          </button>
        </div>

        {row.quotaTotal === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 px-3 py-3 text-xs leading-5 text-amber-800">
            เคสนี้<b>ยังไม่ได้ตั้งเป้าโพส</b> — กด &quot;ตั้งเป้า&quot;
            เพื่อกำหนดว่าต้องลงคลิปช่องไหนกี่โพสก่อน
            แล้วถึงจะแปะลิงก์โพสให้ระบบนับความคืบหน้าได้
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-white/70 px-3 py-2.5">
              <p className="flex items-baseline gap-1.5 text-sm">
                <b className="text-lg tabular-nums text-stone-900">
                  {formatNumber(row.metCount)}
                </b>
                <span className="text-stone-400">
                  / {formatNumber(row.quotaTotal)} โพส
                </span>
                <span
                  className={`ml-auto text-xs ${
                    row.metCount < row.expectedByNow
                      ? "text-rose-600"
                      : "text-stone-400"
                  }`}
                >
                  ควรได้แล้ว {formatNumber(row.expectedByNow)} โพส
                </span>
              </p>
              <div className="mt-2">
                <ClipProgressBar row={row} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {row.quotaPlatforms.map((p) => {
                  const pm = INFLU_POST_PLATFORMS[p];
                  const q = row.quotas[p] ?? 0;
                  const c = row.postCounts[p] ?? 0;
                  return (
                    <span
                      key={p}
                      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${pm.chip}`}
                    >
                      {pm.short} {c}/{q}
                      {c >= q && <Check size={10} strokeWidth={3} />}
                    </span>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ---------- ลิงก์โพสที่ลงจริง ---------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Link2}>ลิงก์ที่ลงจริง</SectionTitle>
          <span className="text-[11px] text-stone-400">
            {formatNumber(row.postTotal)} โพส ·{" "}
            {formatNumber(row.commentCount)} คอมเมนต์
          </span>
        </div>

        {posts.length === 0 && comments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-3 py-3 text-center text-xs text-stone-400">
            ยังไม่มีลิงก์
          </p>
        ) : (
          <div className="space-y-1">
            {posts.map((l) => {
              const p = postLinkPlatform(l);
              const no = (runningNo[p] = (runningNo[p] ?? 0) + 1);
              const pm = INFLU_POST_PLATFORMS[p];
              return (
                <div key={l.id} className="flex items-center gap-1">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm transition-colors hover:bg-brand-50/60"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${pm.chip}`}
                    >
                      {pm.short}
                      {no}
                    </span>
                    <span className="truncate font-medium text-stone-700">
                      {postPlatformLabel(l.url)}
                    </span>
                    {l.note && (
                      <span className="min-w-0 truncate text-xs text-stone-400">
                        {l.note}
                      </span>
                    )}
                    <ExternalLink
                      size={13}
                      className="ml-auto shrink-0 text-stone-300"
                    />
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onRemoveLink(l)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 sm:h-8 sm:w-8"
                      title="ลบลิงก์"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
            {comments.map((l) => (
              <div key={l.id} className="flex items-center gap-1">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm transition-colors hover:bg-brand-50/60"
                >
                  <MessageCircle
                    size={14}
                    className="shrink-0 text-amber-500"
                  />
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${INFLU_POST_KINDS.comment.chip}`}
                  >
                    {INFLU_POST_KINDS.comment.label}
                  </span>
                  <span className="truncate font-medium text-stone-700">
                    {postPlatformLabel(l.url)}
                  </span>
                  {l.note && (
                    <span className="min-w-0 truncate text-xs text-stone-400">
                      {l.note}
                    </span>
                  )}
                  <ExternalLink
                    size={13}
                    className="ml-auto shrink-0 text-stone-300"
                  />
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onRemoveLink(l)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 sm:h-8 sm:w-8"
                    title="ลบลิงก์"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit &&
          (platformOptions.length === 0 ? (
            <button
              type="button"
              onClick={() => onModeChange("quota")}
              className="w-full cursor-pointer rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 max-sm:min-h-11"
            >
              ตั้งเป้าโพสก่อน แล้วถึงจะแปะลิงก์ได้ →
            </button>
          ) : (
            <div className="space-y-1.5 rounded-xl bg-white/60 p-2.5">
              <div className="flex gap-1.5">
                {INFLU_POST_KIND_ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setLinkKind(k);
                      // โพส = เลือกได้เฉพาะช่องที่ตั้งเป้าไว้ — ค่าที่ค้างอยู่อาจหลุดออกนอกลิสต์
                      if (k === "post" && linkPlatform && !row.quotaPlatforms.includes(linkPlatform))
                        setLinkPlatform(row.quotaPlatforms[0] ?? "");
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors max-sm:min-h-11 ${
                      linkKind === k
                        ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream"
                        : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    }`}
                  >
                    {INFLU_POST_KINDS[k].label}
                  </button>
                ))}
              </div>
              {/* บังคับเลือกช่องทาง — ตัวเลือกมาจากเป้าที่ตั้งไว้ (ผู้ใช้ 2026-08-29)
                  เลือกจากปุ่ม dropdown ท้ายช่องกรอกลิงก์ (ผู้ใช้ 2026-09-01) */}
              <div className="flex gap-1.5">
                <Input
                  value={linkUrl}
                  disabled={linkBusy}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitLink();
                  }}
                  placeholder="วางลิงก์โพส เช่น https://www.tiktok.com/@.../video/..."
                  className="min-w-0 flex-1"
                />
                <PlatformDropdown
                  value={linkPlatform}
                  options={platformOptions}
                  showQuota={linkKind === "post"}
                  quotas={row.quotas}
                  postCounts={row.postCounts}
                  disabled={linkBusy}
                  onChange={setLinkPlatform}
                />
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={linkNote}
                  disabled={linkBusy}
                  maxLength={120}
                  onChange={(e) => setLinkNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitLink();
                  }}
                  placeholder="โน้ต (ไม่บังคับ)"
                />
                <Button
                  type="button"
                  loading={linkBusy}
                  disabled={!linkUrl.trim() || !linkPlatform}
                  onClick={() => void submitLink()}
                >
                  <Plus size={14} />
                  เพิ่ม
                </Button>
              </div>
              {linkErr && (
                <p className="text-xs text-rose-600 animate-fade-in">
                  {linkErr}
                </p>
              )}
            </div>
          ))}
      </section>

      {/* ---------- อายุสัญญา ---------- */}
      <section className="space-y-2">
        <SectionTitle icon={CalendarRange}>อายุสัญญา</SectionTitle>
        <ContractBox row={row} />
      </section>

      {/* ---------- Sub Campaign ---------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Megaphone}>Sub Campaign</SectionTitle>
          {canEdit && !row.expired && !campOpen && (
            <button
              type="button"
              onClick={() => setCampOpen(true)}
              className="cursor-pointer text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline max-sm:min-h-11"
            >
              + เพิ่ม
            </button>
          )}
        </div>
        {row.campaigns.length === 0 && !campOpen ? (
          <p className="text-xs leading-5 text-stone-400">
            กรณีมีการ commit ว่า influ ต้องทำส่วนไหนเพิ่มนอกเหนือจากปกติ
            {row.expired && " — สัญญาหมดอายุแล้ว เพิ่มใหม่ไม่ได้"}
          </p>
        ) : (
          <div className="space-y-1">
            {row.campaigns.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm"
              >
                <Megaphone size={13} className="shrink-0 text-brand-500" />
                <span className="font-medium text-stone-800">{c.name}</span>
                {c.campaign_date && (
                  <span className="text-xs text-stone-400">
                    {formatDate(c.campaign_date)}
                  </span>
                )}
                {c.detail && (
                  <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                    {c.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {campOpen && (
          <div className="space-y-1.5 rounded-xl bg-white/60 p-2.5">
            <Input
              value={campName}
              disabled={campBusy}
              onChange={(e) => setCampName(e.target.value)}
              placeholder="สิ่งที่ commit เพิ่ม เช่น ถ่ายรีวิวสาขาใหม่ 1 คลิป *"
            />
            <div className="flex gap-1.5">
              <Input
                type="date"
                value={campDate}
                disabled={campBusy}
                onChange={(e) => setCampDate(e.target.value)}
              />
              <Input
                value={campDetail}
                disabled={campBusy}
                onChange={(e) => setCampDetail(e.target.value)}
                placeholder="รายละเอียด (ไม่บังคับ)"
              />
            </div>
            {campErr && (
              <p className="text-xs text-rose-600 animate-fade-in">{campErr}</p>
            )}
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="secondary"
                disabled={campBusy}
                onClick={() => setCampOpen(false)}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                loading={campBusy}
                disabled={!campName.trim()}
                onClick={() => void submitCampaign()}
              >
                <Megaphone size={14} />
                เพิ่ม Campaign
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ---------- ส่วนรอง: ผลลัพธ์ & เช็คลิสต์ (ไม่ force) ---------- */}
      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setResultsOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg py-1 text-left transition-colors hover:bg-white/60 max-sm:min-h-11"
        >
          {resultsOpen ? (
            <ChevronDown size={14} className="text-stone-400" />
          ) : (
            <ChevronRight size={14} className="text-stone-400" />
          )}
          <Camera size={14} className="text-brand-500" />
          <span className="text-xs font-semibold text-stone-500">
            ผลลัพธ์ &amp; เช็คลิสต์ (ไม่บังคับ)
          </span>
          <span className="ml-auto text-[11px] text-stone-400">
            {customMode
              ? INFLU_FOLLOWUP_MODES.custom.label
              : `รูปติดตาม ${row.photoDone}/${row.photoTasks.length} งวด`}
          </span>
        </button>

        {resultsOpen &&
          (row.checklistTasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-3 py-3 text-center text-xs text-stone-400">
              {customMode
                ? "เคสนี้ใช้เงื่อนไขแบบแพ็คเกจเฉพาะ — ยังไม่มีข้อติดตามที่พิมพ์ไว้"
                : "ยังไม่มีเช็คลิสต์ของเคสนี้"}
            </p>
          ) : (
            <div className="space-y-2.5">
              {groupBySection(row.checklistTasks).map((g) => (
                <div key={g.section}>
                  <p className="mb-0.5 text-[11px] font-medium text-stone-400">
                    {g.section}
                  </p>
                  <div className="space-y-0.5">
                    {g.rows.map((t) => (
                      <TaskLine
                        key={t.id}
                        t={t}
                        today={today}
                        canEdit={canEdit}
                        onToggle={() => onToggleTask(t)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </section>

      {/* ---------- หมายเหตุ ---------- */}
      <section className="space-y-2">
        <SectionTitle icon={StickyNote}>หมายเหตุการติดตาม</SectionTitle>
        <Textarea
          key={`note-${i.note ?? ""}`}
          rows={3}
          defaultValue={i.note ?? ""}
          disabled={!canEdit}
          placeholder="สถานะการตาม เช่น ทักไปแล้วรอตอบ / ขอเลื่อนลงโพส..."
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== i.note)
              onPatchInflu({ note: v }, "แก้หมายเหตุการติดตามผลงาน", {
                type: "case_updated",
                baseLevel: "update",
                title: `แก้หมายเหตุการติดตามของ ${influName(i)}`,
                body: v,
              });
          }}
        />
      </section>

      {/* ---------- ปิดงาน (ย้ายมาจากขั้นตามงานเดิม — 0092) ---------- */}
      {canEdit && (
        <section className="border-t border-brand-100/60 pt-3">
          {i.completed ? (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                onPatchInflu(
                  { completed: false },
                  "เปิดเคสที่ปิดงานแล้วกลับมาติดตามต่อ",
                  {
                    type: "case_reopened",
                    title: `เปิดเคส ${influName(i)} กลับมาติดตามต่อ`,
                  }
                )
              }
            >
              <RotateCcw size={15} />
              เปิดเคสกลับมาติดตามต่อ
            </Button>
          ) : (
            <>
              <Button
                className="w-full"
                onClick={() =>
                  onPatchInflu({ completed: true }, "ปิดงานเคสนี้ (จบงาน)", {
                    type: "case_completed",
                    title: `ปิดงานเคส ${influName(i)} แล้ว`,
                    body:
                      row.quotaTotal > 0
                        ? `คลิปตามสัญญา ${row.metCount}/${row.quotaTotal}`
                        : null,
                  })
                }
              >
                <CheckCircle2 size={15} />
                ปิดงานเคสนี้
              </Button>
              {row.quotaTotal > 0 && row.metCount < row.quotaTotal && (
                <p className="mt-1.5 text-center text-[11px] text-amber-700">
                  ยังลงคลิปไม่ครบเป้า ({row.metCount}/{row.quotaTotal}) —
                  ปิดงานได้ แต่ยอดจะค้างไว้เท่านี้
                </p>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}

function groupBySection(
  tasks: InfluTaskRow[]
): { section: string; rows: InfluTaskRow[] }[] {
  const out: { section: string; rows: InfluTaskRow[] }[] = [];
  for (const t of tasks) {
    const section = t.section ?? "รายการติดตามงาน (เทมเพลตเดิม)";
    const last = out[out.length - 1];
    if (last && last.section === section) last.rows.push(t);
    else out.push({ section, rows: [t] });
  }
  return out;
}

function TaskLine({
  t,
  today,
  canEdit,
  onToggle,
}: {
  t: InfluTaskRow;
  today: string;
  canEdit: boolean;
  onToggle: () => void;
}) {
  const overdue = !t.done && t.due_date !== null && t.due_date < today;
  return (
    <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/60">
      {/* เป้านิ้ว 44px บนจอเล็ก — วงที่มองเห็นคงขนาดเดิมใน span ข้างใน */}
      <button
        type="button"
        disabled={!canEdit}
        onClick={onToggle}
        className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center sm:h-8 sm:w-8"
        title={t.done ? "ยกเลิกติ๊ก" : "ติ๊กว่าทำแล้ว"}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
            t.done
              ? "border-emerald-400 bg-emerald-400 text-white"
              : overdue
                ? "border-rose-300 text-transparent"
                : "border-stone-300 text-transparent"
          } ${canEdit && !t.done ? "hover:border-emerald-400" : ""}`}
        >
          <Check size={14} strokeWidth={3} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            t.done ? "text-stone-400 line-through" : "text-stone-700"
          }`}
          title={t.title}
        >
          {t.title}
        </p>
        <p
          className={`text-[11px] ${
            t.done
              ? "text-emerald-600"
              : overdue
                ? "text-rose-600"
                : "text-stone-400"
          }`}
        >
          {t.done
            ? `ทำแล้ว ${t.done_at ? formatDate(t.done_at) : ""}`
            : overdue
              ? `เลยกำหนด — ${formatDate(t.due_date)}`
              : t.due_date
                ? `กำหนด ${formatDate(t.due_date)}`
                : "ไม่มีกำหนด"}
        </p>
      </div>
    </div>
  );
}
