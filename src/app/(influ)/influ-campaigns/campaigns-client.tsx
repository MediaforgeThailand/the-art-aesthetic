"use client";

/**
 * แคมเปญ + แท็ก tracking (0093)
 *
 * งานหลักของหน้านี้: ตั้งแคมเปญ → ได้ "แท็ก" ประจำแคมเปญ → เอา influ เข้าแคมเปญ
 * แท็กคือกุญแจที่ทีมหลังบ้านจะใช้จับคู่กับข้อมูลจาก Meta API ในอนาคต ⇒ ต้องไม่ซ้ำ
 * และต้องเป็นข้อความที่ IG/FB นับเป็นแฮชแท็กเดียวจริงๆ (ห้ามมีขีดกลาง/ช่องว่าง)
 *
 * กติกา UI ของ (influ): ไม่มี PageHeader — ชื่อหน้าอยู่บนเมนูของระบบแล้ว
 */

import {
  CalendarRange,
  Check,
  Copy,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Shuffle,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FilterChip,
  FilterSection,
  FilterSummary,
  InfluFilterButton,
  useInfluFilters,
} from "@/components/influ-filter-panel";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Textarea,
} from "@/components/ui";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import {
  campaignTagError,
  INFLU_TIERS,
  normalizeCampaignTag,
} from "@/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluCampaignDefRow,
  InfluCampaignMemberRow,
  InfluProfileRow,
} from "@/lib/types";
import { profileName } from "../influencers/profile-form";

export type CampaignMemberWithProfile = InfluCampaignMemberRow & {
  profile: Pick<
    InfluProfileRow,
    "id" | "first_name" | "last_name" | "nickname" | "followers" | "tier" | "photo_path"
  > | null;
};

/** เคสที่ผูกแคมเปญ — ใช้แค่นับยอด ไม่ได้แสดงรายละเอียด */
export type CampaignCaseLite = {
  id: string;
  campaign_id: string | null;
  person_id: string;
  completed: boolean;
  declined_at: string | null;
};

/* ---------- ช่วงเวลาของแคมเปญ ---------- */

type CampaignPhase = "off" | "upcoming" | "running" | "ended";

/** ตัวกรองของหน้าแคมเปญ — ปุ่มเดียวเหมือนทุกหน้าในระบบ (ผู้ใช้ 2026-08-29)
    ว่าง = แสดงทุกช่วง (หน้านี้ข้อมูลน้อย ไม่ต้องซ่อนอะไรเป็นค่าเริ่มต้น) */
type CampaignFilters = { phases: CampaignPhase[]; mineOnly: boolean };
const DEFAULT_CAMPAIGN_FILTERS: CampaignFilters = {
  phases: [],
  mineOnly: false,
};
const CAMPAIGN_PHASE_ORDER: CampaignPhase[] = [
  "running",
  "upcoming",
  "ended",
  "off",
];

const PHASE_META: Record<CampaignPhase, { label: string; chip: string }> = {
  running: {
    label: "กำลังดำเนินการ",
    chip: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  upcoming: {
    label: "ยังไม่เริ่ม",
    chip: "border border-sky-200 bg-sky-50 text-sky-700",
  },
  ended: {
    label: "จบแล้ว",
    chip: "border border-stone-200 bg-stone-100 text-stone-500",
  },
  off: {
    label: "ปิดใช้งาน",
    chip: "border border-stone-200 bg-stone-100 text-stone-400",
  },
};

/** อ่านวันที่ปัจจุบันแบบเวลาไทย — อยู่ระดับโมดูลตามกฎ react-hooks/purity */
function phaseOf(c: InfluCampaignDefRow): CampaignPhase {
  if (!c.active) return "off";
  const today = todayISO();
  if (c.starts_on && c.starts_on > today) return "upcoming";
  if (c.ends_on && c.ends_on < today) return "ended";
  return "running";
}

function dateRangeLabel(c: InfluCampaignDefRow): string {
  if (!c.starts_on && !c.ends_on) return "ไม่ระบุช่วงเวลา";
  const from = c.starts_on ? formatDate(c.starts_on) : "—";
  const to = c.ends_on ? formatDate(c.ends_on) : "ต่อเนื่อง";
  return `${from} → ${to}`;
}

/* ---------- ปุ่มคัดลอกแท็ก ---------- */

function CopyTagButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`คัดลอก ${text}`}
      aria-label={`คัดลอก${label}`}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 sm:h-8 sm:w-8"
    >
      {done ? (
        <Check size={15} className="text-emerald-600" />
      ) : (
        <Copy size={15} />
      )}
    </button>
  );
}

/* ---------- ฟอร์มสร้าง/แก้แคมเปญ ---------- */

function CampaignFormModal({
  open,
  campaign,
  onClose,
  onSaved,
  actor,
}: {
  open: boolean;
  /** null = สร้างใหม่ */
  campaign: InfluCampaignDefRow | null;
  onClose: () => void;
  onSaved: () => void;
  actor: InfluLogActor;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [name, setName] = useState(campaign?.name ?? "");
  const [tag, setTag] = useState(campaign?.tag ?? "");
  const [detail, setDetail] = useState(campaign?.detail ?? "");
  const [startsOn, setStartsOn] = useState(campaign?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(campaign?.ends_on ?? "");
  const [active, setActive] = useState(campaign?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generateTag = async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("next_campaign_tag");
    if (error || !data) {
      setErr(`ออกรหัสแท็กไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setTag(data);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanName = name.trim();
    const cleanTag = normalizeCampaignTag(tag);
    if (!cleanName) {
      setErr("ตั้งชื่อแคมเปญก่อน");
      return;
    }
    const tagErr = campaignTagError(cleanTag);
    if (tagErr) {
      setErr(tagErr);
      return;
    }
    if (startsOn && endsOn && endsOn < startsOn) {
      setErr("วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = {
      name: cleanName,
      tag: cleanTag,
      detail: detail.trim() || null,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      active,
    };
    const { data, error } = campaign
      ? await supabase
          .from("influ_campaign_defs")
          .update(payload)
          .eq("id", campaign.id)
          .select("id")
          .single()
      : await supabase
          .from("influ_campaign_defs")
          .insert({ ...payload, created_by: actor.id })
          .select("id")
          .single();
    if (error || !data) {
      setBusy(false);
      // 23505 = ชนกับ unique index บน upper(tag)
      setErr(
        error?.code === "23505"
          ? `แท็ก #${cleanTag} ถูกใช้กับแคมเปญอื่นแล้ว — ใช้แท็กอื่น`
          : `บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`
      );
      return;
    }
    logInflu(supabase, actor, {
      action: campaign ? "update" : "create",
      entity: "campaign",
      entityId: data.id,
      summary: campaign
        ? `แก้ไขแคมเปญ "${cleanName}" (#${cleanTag})`
        : `สร้างแคมเปญ "${cleanName}" (#${cleanTag})`,
      meta: { tag: cleanTag, active },
    });
    setBusy(false);
    onSaved();
    onClose();
    router.refresh();
  };

  const tagPreview = normalizeCampaignTag(tag);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={campaign ? "แก้ไขแคมเปญ" : "แคมเปญใหม่"}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <Label htmlFor="cmp-name">ชื่อแคมเปญ *</Label>
          <Input
            id="cmp-name"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Social Warrior 2569"
          />
        </div>

        <div>
          <Label htmlFor="cmp-tag">แท็กประจำแคมเปญ *</Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold text-brand-500 sm:text-sm">
                #
              </span>
              <Input
                id="cmp-tag"
                value={tag}
                disabled={busy}
                onChange={(e) => setTag(e.target.value)}
                onBlur={() => setTag(normalizeCampaignTag(tag))}
                placeholder="SOCIALWARRIOR"
                className="pl-7 font-mono tracking-wide"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void generateTag()}
              className="shrink-0"
              title="ให้ระบบออกรหัสแท็กให้"
            >
              <Shuffle size={15} /> สุ่มรหัส
            </Button>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-400">
            แท็กที่บังคับให้ influ ติดในโพส — ใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดล่าง
            (IG/FB ตัดคำที่ขีดกลาง แท็กที่มีขีดจะ track ไม่ได้)
            {tagPreview && (
              <>
                {" · จะบันทึกเป็น "}
                <span className="font-mono font-semibold text-brand-600">
                  #{tagPreview}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cmp-start">วันเริ่ม</Label>
            <Input
              id="cmp-start"
              type="date"
              value={startsOn}
              disabled={busy}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cmp-end">วันสิ้นสุด</Label>
            <Input
              id="cmp-end"
              type="date"
              value={endsOn}
              disabled={busy}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cmp-detail">รายละเอียด</Label>
          <Textarea
            id="cmp-detail"
            rows={3}
            value={detail}
            disabled={busy}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="สิ่งที่ influ ต้องทำในแคมเปญนี้ / เงื่อนไขที่ตกลงกัน"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-stone-200 bg-white/70 px-3 py-2.5 max-sm:min-h-11">
          <input
            type="checkbox"
            checked={active}
            disabled={busy}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-brand-600"
          />
          <span className="text-sm text-stone-700">
            เปิดใช้งาน
            <span className="ml-1 text-xs text-stone-400">
              (ปิดแล้วจะไม่ขึ้นเป็นตัวเลือกในเคสใหม่ ของเดิมไม่กระทบ)
            </span>
          </span>
        </label>

        {err && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" loading={busy}>
            {campaign ? "บันทึก" : "สร้างแคมเปญ"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- แผงสมาชิกแคมเปญ (portal ตามกติกาแผงข้างของระบบ) ---------- */

function MemberPanel({
  campaign,
  members,
  profiles,
  caseCountByPerson,
  canEdit,
  actor,
  onClose,
}: {
  campaign: InfluCampaignDefRow;
  members: CampaignMemberWithProfile[];
  profiles: InfluProfileRow[];
  caseCountByPerson: Map<string, number>;
  canEdit: boolean;
  actor: InfluLogActor;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.profile_id)),
    [members]
  );

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles
      .filter((p) => !memberIds.has(p.id))
      .filter((p) =>
        q
          ? [p.first_name, p.last_name, p.nickname, p.phone]
              .filter(Boolean)
              .some((s) => (s as string).toLowerCase().includes(q))
          : true
      )
      .slice(0, 8);
  }, [profiles, memberIds, query]);

  const addMember = async (p: InfluProfileRow) => {
    if (busyId) return;
    setBusyId(p.id);
    setErr(null);
    const { error } = await supabase.from("influ_campaign_members").insert({
      campaign_id: campaign.id,
      profile_id: p.id,
      created_by: actor.id,
    });
    setBusyId(null);
    if (error) {
      setErr(`เพิ่มเข้าแคมเปญไม่สำเร็จ: ${error.message}`);
      return;
    }
    logInflu(supabase, actor, {
      action: "update",
      entity: "campaign_member",
      entityId: campaign.id,
      summary: `เพิ่ม ${profileName(p)} เข้าแคมเปญ "${campaign.name}"`,
      meta: { campaign_tag: campaign.tag, profile_id: p.id },
    });
    setQuery("");
    router.refresh();
  };

  const removeMember = async (m: CampaignMemberWithProfile) => {
    if (busyId) return;
    setBusyId(m.id);
    setErr(null);
    const { error } = await supabase
      .from("influ_campaign_members")
      .delete()
      .eq("id", m.id);
    setBusyId(null);
    if (error) {
      setErr(`เอาออกจากแคมเปญไม่สำเร็จ: ${error.message}`);
      return;
    }
    logInflu(supabase, actor, {
      action: "update",
      entity: "campaign_member",
      entityId: campaign.id,
      summary: `เอา ${
        m.profile ? profileName(m.profile) : "influ"
      } ออกจากแคมเปญ "${campaign.name}"`,
      meta: { campaign_tag: campaign.tag, profile_id: m.profile_id },
    });
    router.refresh();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="glass fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] animate-slide-in-right flex-col shadow-2xl max-sm:pb-safe max-sm:pt-safe"
        role="dialog"
        aria-label={`สมาชิกแคมเปญ ${campaign.name}`}
      >
        <header className="flex items-start gap-2 border-b border-stone-200/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-stone-800">
              {campaign.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-semibold text-brand-600">
              #{campaign.tag}
            </p>
          </div>
          <CopyTagButton text={`#${campaign.tag}`} label="แท็กแคมเปญ" />
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแผง"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 sm:h-8 sm:w-8"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {campaign.detail && (
            <p className="whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-[13px] leading-6 text-stone-600">
              {campaign.detail}
            </p>
          )}

          {canEdit && (
            <div>
              <Label htmlFor="cmp-add">เพิ่ม influ เข้าแคมเปญ</Label>
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <Input
                  id="cmp-add"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาชื่อ / ชื่อเล่น / เบอร์"
                  className="pl-9"
                />
              </div>
              {query.trim() !== "" && (
                <div className="mt-1.5 overflow-hidden rounded-xl border border-stone-200 bg-white/95">
                  {candidates.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-stone-400">
                      ไม่พบโปรไฟล์ที่ยังไม่อยู่ในแคมเปญนี้
                    </p>
                  ) : (
                    candidates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void addMember(p)}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-brand-50 disabled:opacity-50"
                      >
                        <UserRound size={15} className="shrink-0 text-brand-500" />
                        <span className="min-w-0 flex-1 truncate text-sm text-stone-700">
                          {profileName(p)}
                        </span>
                        {p.followers !== null && (
                          <span className="shrink-0 text-xs text-stone-400">
                            {formatNumber(p.followers)}
                          </span>
                        )}
                        <UserPlus size={14} className="shrink-0 text-brand-500" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {err && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {err}
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-stone-700">
              influ ในแคมเปญ ({members.length})
            </p>
            {members.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-200 px-3 py-6 text-center text-sm text-stone-400">
                ยังไม่มีใครในแคมเปญนี้
              </p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const cases = caseCountByPerson.get(m.profile_id) ?? 0;
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white/90 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-800">
                          {m.profile ? profileName(m.profile) : "(โปรไฟล์ถูกลบ)"}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-400">
                          {m.profile?.followers != null && (
                            <span>{formatNumber(m.profile.followers)} followers</span>
                          )}
                          {m.profile?.tier && (
                            <span>{INFLU_TIERS[m.profile.tier].label}</span>
                          )}
                          <span
                            className={cases > 0 ? "text-brand-600" : undefined}
                            title="จำนวนเคสที่ผูกกับแคมเปญนี้"
                          >
                            {cases > 0 ? `${cases} เคสในแคมเปญ` : "ยังไม่มีเคส"}
                          </span>
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void removeMember(m)}
                          aria-label={`เอา ${
                            m.profile ? profileName(m.profile) : "influ"
                          } ออกจากแคมเปญ`}
                          title="เอาออกจากแคมเปญ"
                          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 sm:h-8 sm:w-8"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs leading-5 text-brand-700">
            เตรียมไว้สำหรับอนาคต: แท็ก{" "}
            <span className="font-mono font-semibold">#{campaign.tag}</span>{" "}
            คือกุญแจที่ระบบจะใช้จับคู่กับข้อมูลจาก Meta API
            เพื่อบอกว่ายอดที่ได้มาจากแคมเปญนี้เท่าไหร่ —
            ตอนนี้ยังไม่ได้ต่อ API ทีมต้องเช็คยอดเองไปก่อน
          </p>
        </div>
      </aside>
    </>,
    document.body
  );
}

/* ---------- หน้าหลัก ---------- */

export function CampaignsClient({
  campaigns,
  members,
  profiles,
  cases,
  canEdit,
  canManage,
  actor,
}: {
  campaigns: InfluCampaignDefRow[];
  members: CampaignMemberWithProfile[];
  profiles: InfluProfileRow[];
  cases: CampaignCaseLite[];
  canEdit: boolean;
  canManage: boolean;
  actor: InfluLogActor;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filterApi = useInfluFilters<CampaignFilters>({
    page: "campaigns",
    userId: actor.id,
    factory: DEFAULT_CAMPAIGN_FILTERS,
  });
  const { filters, setFilters } = filterApi;
  /** null = ปิด, {campaign: null} = สร้างใหม่ */
  const [formFor, setFormFor] = useState<{
    campaign: InfluCampaignDefRow | null;
  } | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InfluCampaignDefRow | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const membersByCampaign = useMemo(() => {
    const map = new Map<string, CampaignMemberWithProfile[]>();
    for (const m of members) {
      const list = map.get(m.campaign_id) ?? [];
      list.push(m);
      map.set(m.campaign_id, list);
    }
    return map;
  }, [members]);

  const caseCountByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cases) {
      if (!c.campaign_id) continue;
      map.set(c.campaign_id, (map.get(c.campaign_id) ?? 0) + 1);
    }
    return map;
  }, [cases]);

  const caseCountByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cases) {
      map.set(c.person_id, (map.get(c.person_id) ?? 0) + 1);
    }
    return map;
  }, [cases]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (filters.phases.length && !filters.phases.includes(phaseOf(c)))
        return false;
      if (filters.mineOnly && c.created_by !== actor.id) return false;
      if (!q) return true;
      return [c.name, c.tag, c.detail ?? ""].some((s) =>
        s.toLowerCase().includes(q)
      );
    });
  }, [campaigns, query, filters, actor.id]);

  const phaseCounts = useMemo(() => {
    const m = new Map<CampaignPhase, number>();
    for (const c of campaigns) {
      const ph = phaseOf(c);
      m.set(ph, (m.get(ph) ?? 0) + 1);
    }
    return m;
  }, [campaigns]);

  const panelCampaign = campaigns.find((c) => c.id === panelId) ?? null;

  const doDelete = async () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    const target = confirmDelete;
    const { error } = await supabase
      .from("influ_campaign_defs")
      .delete()
      .eq("id", target.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) return;
    logInflu(supabase, actor, {
      action: "delete",
      entity: "campaign",
      entityId: target.id,
      summary: `ลบแคมเปญ "${target.name}" (#${target.tag})`,
      meta: { tag: target.tag },
    });
    if (panelId === target.id) setPanelId(null);
    router.refresh();
  };

  return (
    <div className="mx-auto w-full px-3 py-4 sm:px-4">
      {/* แถบเครื่องมือแถวเดียวตามแพตเทิร์นหน้าอื่นในระบบ */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาแคมเปญ / แท็ก"
            className="rounded-full pl-9"
          />
        </div>
        <InfluFilterButton
          api={filterApi}
          count={
            (filters.phases.length ? 1 : 0) + (filters.mineOnly ? 1 : 0)
          }
          factory={DEFAULT_CAMPAIGN_FILTERS}
        >
          <FilterSection title="ช่วงเวลา" hint="ไม่เลือก = แสดงทุกแคมเปญ">
            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_PHASE_ORDER.map((ph) => (
                <FilterChip
                  key={ph}
                  active={filters.phases.includes(ph)}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      phases: filters.phases.includes(ph)
                        ? filters.phases.filter((x) => x !== ph)
                        : [...filters.phases, ph],
                    })
                  }
                >
                  {PHASE_META[ph].label}
                  <span className="tabular-nums text-stone-400">
                    {phaseCounts.get(ph) ?? 0}
                  </span>
                </FilterChip>
              ))}
            </div>
          </FilterSection>
          <FilterSection title="ผู้สร้าง">
            <FilterChip
              active={filters.mineOnly}
              onClick={() =>
                setFilters({ ...filters, mineOnly: !filters.mineOnly })
              }
            >
              แคมเปญที่ฉันสร้าง
            </FilterChip>
          </FilterSection>
        </InfluFilterButton>
        {canManage && (
          <Button
            className="sm:ml-auto"
            onClick={() => setFormFor({ campaign: null })}
          >
            <Plus size={16} /> แคมเปญใหม่
          </Button>
        )}
      </div>

      <FilterSummary
        chips={[
          ...(filters.phases.length
            ? [
                {
                  key: "phases",
                  label: `ช่วง: ${CAMPAIGN_PHASE_ORDER.filter((p) =>
                    filters.phases.includes(p)
                  )
                    .map((p) => PHASE_META[p].label)
                    .join(", ")}`,
                  next: { ...filters, phases: [] as CampaignPhase[] },
                },
              ]
            : []),
          ...(filters.mineOnly
            ? [
                {
                  key: "mine",
                  label: "แคมเปญที่ฉันสร้าง",
                  next: { ...filters, mineOnly: false },
                },
              ]
            : []),
        ]}
        onChange={setFilters}
        onClear={() => {
          setQuery("");
          setFilters(DEFAULT_CAMPAIGN_FILTERS);
        }}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={40} />}
          title={
            campaigns.length === 0 ? "ยังไม่มีแคมเปญ" : "ไม่พบแคมเปญที่ค้นหา"
          }
          description={
            campaigns.length === 0
              ? "สร้างแคมเปญเพื่อออกแท็กประจำแคมเปญ แล้วเอา influ เข้ามาเพื่อติดตามผลงานเป็นชุดเดียวกัน"
              : "ลองคำค้นอื่น"
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const phase = phaseOf(c);
            const memberCount = membersByCampaign.get(c.id)?.length ?? 0;
            const caseCount = caseCountByCampaign.get(c.id) ?? 0;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={`เปิดแคมเปญ ${c.name}`}
                onClick={() => setPanelId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPanelId(c.id);
                  }
                }}
                className={`glass cursor-pointer rounded-xl p-4 text-left shadow-sm transition-shadow duration-200 hover:shadow-md ${
                  phase === "off" || phase === "ended" ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-stone-800">
                      {c.name}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5">
                      <span className="truncate rounded-md bg-brand-50 px-2 py-0.5 font-mono text-sm font-semibold tracking-wide text-brand-700">
                        #{c.tag}
                      </span>
                    </p>
                  </div>
                  <CopyTagButton text={`#${c.tag}`} label="แท็กแคมเปญ" />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Badge className={PHASE_META[phase].chip}>
                    {PHASE_META[phase].label}
                  </Badge>
                  <Badge className="border border-stone-200 bg-white/70 text-stone-600">
                    <UserRound size={11} /> {memberCount} คน
                  </Badge>
                  <Badge className="border border-stone-200 bg-white/70 text-stone-600">
                    {caseCount} เคส
                  </Badge>
                </div>

                <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-400">
                  <CalendarRange size={12} /> {dateRangeLabel(c)}
                </p>

                {canManage && (
                  <div className="mt-2 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      title="แก้ไขแคมเปญ"
                      aria-label={`แก้ไขแคมเปญ ${c.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormFor({ campaign: c });
                      }}
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 sm:h-8 sm:w-8"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      title="ลบแคมเปญ"
                      aria-label={`ลบแคมเปญ ${c.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(c);
                      }}
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formFor && (
        <CampaignFormModal
          // remount ทุกครั้งที่เปลี่ยนเป้าหมาย — state ในฟอร์มเริ่มจากค่าของแคมเปญนั้น
          key={formFor.campaign?.id ?? "new"}
          open
          campaign={formFor.campaign}
          actor={actor}
          onClose={() => setFormFor(null)}
          onSaved={() => setFormFor(null)}
        />
      )}

      {panelCampaign && (
        <MemberPanel
          key={panelCampaign.id}
          campaign={panelCampaign}
          members={membersByCampaign.get(panelCampaign.id) ?? []}
          profiles={profiles}
          caseCountByPerson={caseCountByPerson}
          canEdit={canEdit}
          actor={actor}
          onClose={() => setPanelId(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="ลบแคมเปญนี้?"
        message={
          confirmDelete
            ? `"${confirmDelete.name}" (#${confirmDelete.tag}) จะถูกลบถาวร — สมาชิกในแคมเปญถูกลบตาม และเคสที่ผูกไว้จะกลายเป็น "ไม่มีแคมเปญ" (ข้อมูลเคสไม่หาย)`
            : ""
        }
        confirmLabel="ลบถาวร"
        onConfirm={() => void doDelete()}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
