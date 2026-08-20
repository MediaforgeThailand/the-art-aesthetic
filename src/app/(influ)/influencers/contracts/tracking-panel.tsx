"use client";

/**
 * แผงติดตามผลงานรายเคส — เปิดจากแถวในหน้า "สัญญา & ติดตามผลงาน"
 *
 * เชลล์ลอกแพตเทิร์นจาก prospect-panel (บอร์ด Hunting): portal ไป body,
 * backdrop z-40 + aside z-50, Esc = blur ช่องที่โฟกัสก่อนแล้วค่อยปิด
 * (ให้ commit-on-blur ทำงานทัน), ช่องกรอกเป็น uncontrolled + key = ค่าจริง.
 *
 * เนื้อหาอ้างอิงตารางติดตามของทีม branding เดิม (ไฟล์ Excel "สัญญาการลงช่องทางรีวิว ติดตาม"):
 * เป้าโพสต่อช่องทาง (จำนวนการPost + ช่อง IG/FB/TK) → post_quotas,
 * ลิงก์โพสที่ลงจริงไล่เลข Ig1/Fb2/Tk3 → influ_post_links,
 * ติ๊กรูปติดตาม 7 งวด (7วัน..6เดือน) → influ_tasks หมวด 4 ของ checklist มาตรฐาน.
 */

import {
  ArrowUpRight,
  CalendarRange,
  Camera,
  Check,
  ExternalLink,
  Link2,
  Megaphone,
  MessageCircle,
  Plus,
  StickyNote,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";
import {
  INFLU_POST_KIND_ORDER,
  INFLU_POST_KINDS,
  INFLU_POST_PLATFORM_ORDER,
  INFLU_POST_PLATFORM_PRIMARY,
  INFLU_POST_PLATFORMS,
  INFLU_TIERS,
  postPlatformLabel,
  postPlatformOf,
  roundLabel,
} from "@/lib/influ-constants";
import type {
  InfluCampaignRow,
  InfluencerRow,
  InfluPostKind,
  InfluPostLinkRow,
  InfluPostPlatform,
  InfluPostQuotas,
  InfluTaskRow,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* สถานะการติดตามของแต่ละเคส — ใช้ทั้งการ์ดสรุป/หัวกลุ่ม/แผง            */
/* ------------------------------------------------------------------ */

export type TrackStatus = "overdue" | "ontrack" | "complete" | "expired";

export const TRACK_STATUSES: Record<
  TrackStatus,
  { label: string; hint: string; dot: string; chip: string }
> = {
  overdue: {
    label: "เลยกำหนดตาม",
    hint: "มีเช็คพอยต์รูปติดตามที่เลยกำหนดแล้วยังไม่ติ๊ก",
    dot: "bg-rose-400",
    chip: "border border-rose-200 bg-rose-50 text-rose-600",
  },
  ontrack: {
    label: "กำลังเดินสัญญา",
    hint: "สัญญายังไม่หมด และไม่มีอะไรเลยกำหนด",
    dot: "bg-sky-400",
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
  },
  complete: {
    label: "ส่งงานครบ",
    hint: "โพสครบเป้าทุกช่องทาง + รูปติดตามครบทุกงวด",
    dot: "bg-emerald-400",
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  expired: {
    label: "สัญญาหมดแล้ว",
    hint: "หมดอายุสัญญาโดยงานยังไม่ครบเป้า",
    dot: "bg-stone-300",
    chip: "border border-stone-200 bg-stone-100 text-stone-500",
  },
};

export const TRACK_STATUS_ORDER: TrackStatus[] = [
  "overdue",
  "ontrack",
  "complete",
  "expired",
];

/** ข้อมูลพร้อมใช้ต่อเคส — contracts-client เป็นคนประกอบ (คำนวณครั้งเดียวใช้ทั้งตาราง+แผง) */
export type TrackRow = {
  influ: InfluencerRow;
  end: string;
  daysLeft: number;
  expired: boolean;
  usedPct: number;
  status: TrackStatus;
  /** จำนวนลิงก์ kind=post แยกตามช่องทาง (จาก hostname ของลิงก์) */
  postCounts: Partial<Record<InfluPostPlatform, number>>;
  postTotal: number;
  commentCount: number;
  quotas: InfluPostQuotas;
  quotaTotal: number;
  /** เช็คพอยต์รูปติดตาม (หมวด 4 ของ checklist มาตรฐาน) — เคสโหมด custom = [] เสมอ */
  photoTasks: InfluTaskRow[];
  photoDone: number;
  photoOverdue: boolean;
  links: InfluPostLinkRow[];
  campaigns: InfluCampaignRow[];
  ownerName: string | null;
};

export function influName(i: InfluencerRow): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

/** แถวจุดสถานะรูปติดตาม 7 งวด — ใช้ทั้งในตารางและแผง (เขียว=ส่งแล้ว แดง=เลยกำหนด ว่าง=รอ) */
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
            className={`h-2.5 w-2.5 rounded-full ${
              t.done
                ? "bg-emerald-400"
                : overdue
                  ? "bg-rose-400"
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

export function TrackingPanel({
  row,
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
  today: string;
  canEdit: boolean;
  onClose: () => void;
  onPatchInflu: (patch: Partial<InfluencerRow>, summary: string) => void;
  onAddLink: (
    kind: InfluPostKind,
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
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- เป้าโพส: ช่องทางเสริมที่กด "+ ตั้งเป้าช่องทางอื่น" ในรอบนี้ ---- */
  const [extraPlatforms, setExtraPlatforms] = useState<InfluPostPlatform[]>([]);

  const quotaPlatforms = INFLU_POST_PLATFORM_ORDER.filter(
    (p) =>
      (INFLU_POST_PLATFORM_PRIMARY as readonly InfluPostPlatform[]).includes(
        p
      ) ||
      (row.quotas[p] ?? 0) > 0 ||
      (row.postCounts[p] ?? 0) > 0 ||
      extraPlatforms.includes(p)
  );
  // "other" ตั้งเป้าไม่ได้ (แยกช่องทางจากลิงก์ไม่ออก — นับรวมโชว์เฉยๆ)
  const morePlatforms = INFLU_POST_PLATFORM_ORDER.filter(
    (p) => p !== "other" && !quotaPlatforms.includes(p)
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
      val > 0 ? `ตั้งเป้าโพส ${label} = ${val} โพส` : `ลบเป้าโพส ${label}`
    );
  };

  /* ---- ลิงก์โพส: ฟอร์มเพิ่ม ---- */
  const [linkKind, setLinkKind] = useState<InfluPostKind>("post");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  const submitLink = async () => {
    if (linkBusy || !linkUrl.trim()) return;
    setLinkBusy(true);
    setLinkErr(null);
    const err = await onAddLink(linkKind, linkUrl, linkNote.trim());
    setLinkBusy(false);
    if (err) {
      setLinkErr(err);
      return;
    }
    setLinkUrl("");
    setLinkNote("");
  };

  // เรียงโพสตามช่องทาง (ลำดับเดียวกับตาราง) แล้วไล่เลขต่อช่องทางแบบ Ig1/Fb2/Tk3 ของไฟล์เดิม
  const posts = row.links
    .filter((l) => l.kind === "post")
    .sort((a, b) => {
      const pa = INFLU_POST_PLATFORM_ORDER.indexOf(postPlatformOf(a.url));
      const pb = INFLU_POST_PLATFORM_ORDER.indexOf(postPlatformOf(b.url));
      return pa !== pb ? pa - pb : a.position - b.position;
    });
  const comments = row.links.filter((l) => l.kind === "comment");
  const runningNo: Partial<Record<InfluPostPlatform, number>> = {};

  /* ---- Sub Campaign: ฟอร์ม inline ---- */
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

  const meta = TRACK_STATUSES[row.status];
  const customMode = i.followup_mode === "custom";

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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 pb-safe-4">
          {/* สถานะ + ลิงก์ไปหน้าเคส */}
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
            <Link
              href={`/influencers/${i.id}`}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              เปิดหน้าเคส
              <ArrowUpRight size={13} />
            </Link>
          </div>

          {/* อายุสัญญา */}
          <section className="space-y-2">
            <SectionTitle icon={CalendarRange}>อายุสัญญา</SectionTitle>
            <div className="rounded-xl bg-white/70 px-3 py-2.5 text-sm">
              <p className="text-stone-700">
                {formatDate(i.contract_start)} – {formatDate(row.end)}
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
                  <span className="text-stone-400">
                    {" "}
                    · ดูแลโดย {row.ownerName}
                  </span>
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
          </section>

          {/* เป้าโพสตามสัญญา */}
          <section className="space-y-2">
            <SectionTitle icon={Target}>เป้าโพสตามสัญญา</SectionTitle>
            <div className="space-y-1.5">
              {quotaPlatforms.map((p) => {
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
                    {p === "other" ? (
                      <span className="text-xs text-stone-400">
                        ไม่ตั้งเป้า (แยกช่องทางจากลิงก์ไม่ได้)
                      </span>
                    ) : (
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
                        className="w-16 rounded-lg border border-stone-200 bg-white px-2 py-1 text-base text-stone-800 focus:border-brand-300 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400 sm:text-sm"
                      />
                    )}
                    <span className="text-xs text-stone-400">โพส</span>
                    {met && (
                      <Check size={14} className="ml-auto text-emerald-500" />
                    )}
                  </div>
                );
              })}
            </div>
            {canEdit && morePlatforms.length > 0 && (
              <Select
                value=""
                onChange={(e) => {
                  const p = e.target.value as InfluPostPlatform;
                  if (p) setExtraPlatforms((prev) => [...prev, p]);
                }}
                className="text-xs"
              >
                <option value="">+ ตั้งเป้าช่องทางอื่น...</option>
                {morePlatforms.map((p) => (
                  <option key={p} value={p}>
                    {INFLU_POST_PLATFORMS[p].label}
                  </option>
                ))}
              </Select>
            )}
          </section>

          {/* ลิงก์โพสที่ลงจริง */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionTitle icon={Link2}>ลิงก์โพสที่ลงจริง</SectionTitle>
              <span className="text-[11px] text-stone-400">
                {formatNumber(row.postTotal)} โพส ·{" "}
                {formatNumber(row.commentCount)} คอมเมนต์
              </span>
            </div>

            {posts.length === 0 && comments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-3 py-3 text-center text-xs text-stone-400">
                ยังไม่มีลิงก์ — วางลิงก์โพสจริงของ influ ด้านล่างเพื่อเริ่มนับ
              </p>
            ) : (
              <div className="space-y-1">
                {posts.map((l) => {
                  const p = postPlatformOf(l.url);
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

            {canEdit && (
              <div className="space-y-1.5 rounded-xl bg-white/60 p-2.5">
                <div className="flex gap-1.5">
                  {INFLU_POST_KIND_ORDER.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setLinkKind(k)}
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
                <Input
                  value={linkUrl}
                  disabled={linkBusy}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitLink();
                  }}
                  placeholder="วางลิงก์โพส เช่น https://www.tiktok.com/@.../video/..."
                />
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
                    disabled={!linkUrl.trim()}
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
            )}
          </section>

          {/* รูปติดตามผลลัพธ์ 7 งวด */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionTitle icon={Camera}>
                รูปติดตามผลลัพธ์ (7 งวดตามสัญญา)
              </SectionTitle>
              {row.photoTasks.length > 0 && (
                <span className="text-[11px] text-stone-400">
                  {row.photoDone}/{row.photoTasks.length} งวด
                </span>
              )}
            </div>
            {customMode ? (
              <p className="rounded-xl bg-sky-50/70 px-3 py-2.5 text-xs text-sky-800">
                เคสนี้ใช้ checklist แบบ &quot;แพ็คเกจเฉพาะ&quot; —
                ติดตามงานตามเงื่อนไขที่ตกลงกันได้ในหน้าเคส (ขั้นตามงาน)
              </p>
            ) : row.photoTasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-200 bg-white/50 px-3 py-3 text-center text-xs text-stone-400">
                เช็คพอยต์รูปจะถูกสร้างอัตโนมัติเมื่อเคสเดินถึงขั้น
                &quot;ตามงาน&quot; — ตอนนี้เคสยังอยู่ระหว่างเซนสัญญา/รับบริการ
              </p>
            ) : (
              <div className="space-y-0.5">
                {row.photoTasks.map((t) => {
                  const overdue =
                    !t.done && t.due_date !== null && t.due_date < today;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/60"
                    >
                      {/* เป้านิ้ว 44px บนจอเล็ก — วงที่มองเห็นคงขนาดเดิมใน span ข้างใน */}
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => onToggleTask(t)}
                        className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center sm:h-8 sm:w-8"
                        title={t.done ? "ยกเลิกติ๊ก" : "ติ๊กว่าส่งรูปแล้ว"}
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
                            t.done
                              ? "text-stone-400 line-through"
                              : "text-stone-700"
                          }`}
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
                            ? `ส่งแล้ว ${t.done_at ? formatDate(t.done_at) : ""}`
                            : overdue
                              ? `เลยกำหนด — ${formatDate(t.due_date)}`
                              : t.due_date
                                ? `กำหนด ${formatDate(t.due_date)}`
                                : "ยังไม่ตั้งกำหนด"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Sub Campaign */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionTitle icon={Megaphone}>Sub Campaign</SectionTitle>
              {canEdit && !row.expired && !campOpen && (
                <button
                  type="button"
                  onClick={() => setCampOpen(true)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline max-sm:min-h-11"
                >
                  + เพิ่ม
                </button>
              )}
            </div>
            {row.campaigns.length === 0 && !campOpen ? (
              <p className="text-xs text-stone-400">
                ยังไม่มี Sub Campaign
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
                  placeholder="ชื่อ Campaign เช่น แคมเปญเปิดตัวสาขาสยาม *"
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
                  <p className="text-xs text-rose-600 animate-fade-in">
                    {campErr}
                  </p>
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

          {/* หมายเหตุการติดตาม */}
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
                  onPatchInflu({ note: v }, "แก้หมายเหตุการติดตามผลงาน");
              }}
            />
            <p className="text-[11px] text-stone-400">
              บันทึกอัตโนมัติเมื่อออกจากช่อง — โน้ตเดียวกับช่อง
              &quot;หมายเหตุ&quot; ของเคส
            </p>
          </section>
        </div>
      </aside>
    </>,
    document.body
  );
}
