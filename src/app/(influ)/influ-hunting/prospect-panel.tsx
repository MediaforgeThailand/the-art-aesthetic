"use client";

/**
 * แผงข้างขวาของบอร์ด Hunting — แทนที่โมดัลฟอร์ม + โมดัลรายละเอียดเดิมทั้งคู่
 * (ผู้ใช้ 2026-08-20: "ทำหน้า set up เหล่านี้เข้าไปอยู่ใน list ให้หมด แล้วเวลากด
 * list ให้เปิด sidebar ด้านขวาลอยขึ้นมาเหมือนตัว task ในระบบ team")
 *
 * ลอยทับเนื้อหาแบบเดียวกับแผงงานของ My List (portal ออก body เสมอ — parent ที่มี
 * backdrop-filter/transform จะทำให้ position:fixed ยึดกับกล่องนั้นแทนทั้งจอ)
 *
 * 2 โหมดในตัวเดียว (หน้าแม่ remount ด้วย key เมื่อสลับคน — state ในฟอร์มรีเซ็ตเอง):
 *   - prospect = null  → เพิ่มรายชื่อใหม่: กรอกครบแล้วกด "เพิ่มเข้าบอร์ด" ทีเดียว
 *     (insert + log อยู่ในไฟล์นี้ เหมือน ProspectFormModal เดิม)
 *   - prospect มีค่า   → แก้ทุกช่อง inline บันทึกอัตโนมัติตอนออกจากช่อง (blur)
 *     ผ่าน onPatchFields; ดาว/วันที่/สถานะ บันทึกทันทีที่กด — ไม่มีปุ่ม "บันทึก" แล้ว
 *     Esc ปิดแผงจะ blur ช่องที่กำลังพิมพ์ก่อนเสมอ ข้อความที่เพิ่งพิมพ์จึงไม่หาย
 *
 * mutation ฝั่งแก้ไขทั้งหมดอยู่ที่ hunting-client (optimistic list) — ตัวนี้เป็นหน้าตา
 */

import {
  CalendarClock,
  ExternalLink,
  Link2,
  MessageCircle,
  Phone,
  Plus,
  Star,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INFLU_CHANNEL_PLATFORMS,
  INFLU_CONTACT_QUICK,
  INFLU_PROSPECT_STATUS_ORDER,
  INFLU_PROSPECT_STATUSES,
} from "@/influ/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/influ/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluProspectChannel,
  InfluProspectContactRow,
  InfluProspectRow,
  InfluProspectStatus,
} from "@/lib/types";

/** วันนี้ตามเวลาไทย (yyyy-mm-dd) — ระดับโมดูลตามกฎ react-hooks/purity */
export function todayBangkok(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** เลยกำหนดนัดตามหรือยัง (เทียบวันแบบ string yyyy-mm-dd — ไม่มีเวลา) */
export function followupOverdue(nextOn: string | null): boolean {
  return nextOn !== null && nextOn < todayBangkok();
}

/** แก้ไขได้เฉพาะ 2 ช่องนี้บนแถวประวัติ (วันที่ + โน้ตต่อท้าย) */
export type ContactPatch = { contacted_on?: string; note?: string | null };

/** ไอคอนของปุ่มลัด — ตาราง constants เก็บได้แค่คีย์ (เป็นไฟล์ .ts ไม่มี JSX) */
const QUICK_ICONS = { phone: Phone, message: MessageCircle } as const;

type ChannelDraft = { platform: string; value: string; followers: string };

const EMPTY_CHANNEL: ChannelDraft = {
  platform: "Instagram",
  value: "",
  followers: "",
};

function parseFollowers(s: string): number | null {
  const n = Number(s.replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** เทียบทีละฟิลด์ ไม่ใช้ JSON.stringify — jsonb เรียง key ของ object ใหม่เสมอ */
function sameChannels(
  a: InfluProspectChannel[],
  b: InfluProspectChannel[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (c, i) =>
        c.platform === b[i].platform &&
        c.value === b[i].value &&
        c.followers === b[i].followers
    )
  );
}

/** แถวดาว 1-5 — กดดาวเดิมซ้ำ = ล้างเป็น 0 (ยังไม่ให้คะแนน) */
export function RatingStars({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  /** ไม่ส่ง = อ่านอย่างเดียว */
  onChange?: (next: number) => void;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Star
            size={size}
            className={
              filled ? "fill-amber-400 text-amber-400" : "text-stone-300"
            }
          />
        );
        if (!onChange) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            aria-label={`ให้ ${n} ดาว`}
            onClick={() => onChange(n === value ? 0 : n)}
            // เป้านิ้วเต็ม 44×44 เฉพาะจอเล็ก (ดาวเรียงติดกัน กดพลาดง่ายสุดในแผงนี้)
            className="flex h-7 w-6 cursor-pointer items-center justify-center transition-transform active:scale-90 max-sm:h-11 max-sm:w-11"
          >
            {star}
          </button>
        );
      })}
    </span>
  );
}

export function ProspectPanel({
  prospect,
  contacts,
  ownerName,
  canEdit,
  canDelete,
  savingContact,
  actor,
  onClose,
  onCreated,
  onPatchFields,
  onSetStatus,
  onAccept,
  onDelete,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onCreateCase,
}: {
  /** null = โหมดเพิ่มรายชื่อใหม่ */
  prospect: InfluProspectRow | null;
  contacts: InfluProspectContactRow[];
  /** ผู้รับผิดชอบ = เจ้าของรายชื่อ ไม่มีก็ใช้คนสร้าง (parent เลือกให้แล้ว) */
  ownerName: string | null;
  canEdit: boolean;
  /** ผู้ดูแล หรือเจ้าของรายชื่อ */
  canDelete: boolean;
  savingContact: boolean;
  actor: InfluLogActor;
  onClose: () => void;
  /** โหมดเพิ่มใหม่ insert สำเร็จ (parent เอาเข้า optimistic list) */
  onCreated: (prospect: InfluProspectRow) => void;
  /** บันทึกช่องที่แก้ (parent = optimistic patch + log + refresh) */
  onPatchFields: (patch: Partial<InfluProspectRow>) => void;
  onSetStatus: (status: InfluProspectStatus) => void;
  /** ตอบรับ → สร้างโปรไฟล์เข้าระบบ (parent ทำ flow ทั้งหมด) */
  onAccept: () => void;
  onDelete: () => void;
  /** กดปุ่มลัด = บันทึกการติดต่อของวันนี้ทันที (channel = "โทร" / "ทัก") */
  onAddContact: (channel: string) => void;
  onUpdateContact: (contactId: string, patch: ContactPatch) => void;
  onDeleteContact: (contactId: string) => void;
  /** เปิด NewCaseModal จากโปรไฟล์ที่ตอบรับแล้ว */
  onCreateCase: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const datalistId = useId();
  const isNew = prospect === null;
  /** โหมดเพิ่มใหม่เข้าได้เฉพาะคนมีสิทธิ์อยู่แล้ว (ปุ่มถูก gate ที่หน้าแม่) */
  const editable = isNew || canEdit;

  // ค่าในฟอร์ม — seed ครั้งเดียวตอน mount (หน้าแม่ remount ด้วย key เมื่อสลับคน)
  const [name, setName] = useState(prospect?.name ?? "");
  const [nickname, setNickname] = useState(prospect?.nickname ?? "");
  const [phone, setPhone] = useState(prospect?.phone ?? "");
  const [occupation, setOccupation] = useState(prospect?.occupation ?? "");
  const [followers, setFollowers] = useState(
    prospect?.followers != null ? String(prospect.followers) : ""
  );
  const [rating, setRating] = useState(prospect?.rating ?? 0);
  const [interested, setInterested] = useState(
    prospect?.interested_services ?? ""
  );
  const [note, setNote] = useState(prospect?.note ?? "");
  const [nextOn, setNextOn] = useState(prospect?.next_followup_on ?? "");
  const [rows, setRows] = useState<ChannelDraft[]>(() =>
    prospect && prospect.channels.length > 0
      ? prospect.channels.map((c) => ({
          platform: c.platform,
          value: c.value,
          followers: c.followers != null ? String(c.followers) : "",
        }))
      : [EMPTY_CHANNEL]
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ปุ่มลัดที่เพิ่งกด (โชว์สปินเนอร์เฉพาะปุ่มนั้น) — ล้างเองตอน parent บันทึกเสร็จ
  // ด้วยแพตเทิร์น adjust-state-during-render ตามที่ใช้ทั้งหน้านี้ ไม่ใช่ effect sync
  const [pendingQuick, setPendingQuick] = useState<string | null>(null);
  if (pendingQuick !== null && !savingContact) setPendingQuick(null);

  // Esc ปิดแผง — blur ช่องที่กำลังพิมพ์ก่อนเสมอให้ commit-on-blur ทำงานทัน;
  // ตอน ConfirmDialog เปิดอยู่ Esc เป็นของ dialog ไม่ใช่ของแผง (ปิดทีละชั้น)
  const closeRef = useRef(onClose);
  const dialogOpenRef = useRef(false);
  useEffect(() => {
    closeRef.current = onClose;
    dialogOpenRef.current = confirmAccept || confirmDelete;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dialogOpenRef.current) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- commit ทีละช่อง (เฉพาะโหมดแก้ไข — โหมดใหม่รอปุ่มเดียวท้ายแผง) ---------- */

  const commit = (patch: Partial<InfluProspectRow>) => {
    if (!isNew) onPatchFields(patch);
  };

  const commitName = (v: string) => {
    const next = v.trim();
    if (isNew) return;
    if (!next) {
      setName(prospect.name); // ชื่อว่างไม่บันทึก — คืนค่าเดิมกลับไป
      return;
    }
    if (next !== prospect.name) commit({ name: next });
  };

  const commitNullable = (
    key: "nickname" | "phone" | "occupation" | "interested_services" | "note",
    v: string
  ) => {
    if (isNew) return;
    const next = v.trim() || null;
    if (next !== prospect[key]) commit({ [key]: next });
  };

  const commitFollowers = (v: string) => {
    if (isNew) return;
    const next = parseFollowers(v);
    if (next !== prospect.followers) commit({ followers: next });
  };

  const channelsOf = (rs: ChannelDraft[]): InfluProspectChannel[] =>
    rs
      .map((r) => ({
        platform: r.platform.trim() || "อื่นๆ",
        value: r.value.trim(),
        followers: parseFollowers(r.followers),
      }))
      .filter((c) => c.value !== "");

  const commitChannels = (rs: ChannelDraft[]) => {
    if (isNew) return;
    const next = channelsOf(rs);
    if (!sameChannels(next, prospect.channels)) commit({ channels: next });
  };

  const setRow = (idx: number, patch: Partial<ChannelDraft>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  /** Enter ในช่องบรรทัดเดียวของโหมดแก้ไข = ออกจากช่อง (commit เลย) */
  const enterBlur = isNew
    ? undefined
    : (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") e.currentTarget.blur();
      };

  /* ---------- insert โหมดเพิ่มใหม่ (กติกาเดียวกับ ProspectFormModal เดิม) ---------- */

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew || saving || !name.trim()) return;
    setSaving(true);
    setErr(null);
    const fields = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      phone: phone.trim() || null,
      occupation: occupation.trim() || null,
      followers: parseFollowers(followers),
      rating,
      interested_services: interested.trim() || null,
      note: note.trim() || null,
      next_followup_on: nextOn || null,
      channels: channelsOf(rows),
    };
    const { data, error } = await supabase
      .from("influ_prospects")
      .insert({ ...fields, owner_id: actor.id, created_by: actor.id })
      .select("*")
      .single();
    if (error || !data) {
      setSaving(false);
      setErr(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    logInflu(supabase, actor, {
      action: "create",
      entity: "prospect",
      entityId: data.id,
      influencerName: fields.name,
      summary: `เพิ่มรายชื่อ Hunting: ${fields.name}`,
      meta: { prospect_id: data.id },
    });
    setSaving(false);
    onCreated(data as InfluProspectRow);
    onClose();
  };

  /* ---------- render ---------- */

  const overdue =
    !isNew &&
    prospect.status !== "accepted" &&
    prospect.status !== "declined" &&
    followupOverdue(nextOn || null);

  const telHref = phone.trim()
    ? `tel:${phone.replace(/[^0-9+]/g, "")}`
    : null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="ปิดแผงรายละเอียด"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-stone-900/15 backdrop-blur-[2px] animate-fade-in"
      />
      {/* pt-safe อยู่ที่ตัว aside (ไม่ใช่หัวแผง) — แพตเทิร์นเดียวกับแผงงาน My List */}
      <aside
        aria-label={
          isNew ? "เพิ่มรายชื่อเข้าบอร์ด Hunting" : `รายละเอียด: ${prospect.name}`
        }
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-white/70 bg-white/95 pt-safe shadow-[0_0_60px_rgba(94,58,49,0.25)] backdrop-blur-2xl animate-slide-in-right sm:inset-y-3 sm:right-3 sm:rounded-2xl sm:border sm:pt-0"
      >
        {/* ---- หัวแผง ---- */}
        <div className="flex shrink-0 items-center gap-2 border-b border-brand-100/70 px-4 py-3">
          {!isNew && (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${INFLU_PROSPECT_STATUSES[prospect.status].dot}`}
              aria-hidden
            />
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
            {isNew
              ? "เพิ่มรายชื่อเข้าบอร์ด Hunting"
              : name.trim() || "รายละเอียดรายชื่อ"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแผง"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 max-sm:h-11 max-sm:w-11"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => void save(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* ---- เนื้อใน ---- */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
            {/* สถานะ — pill กดเปลี่ยนได้เลย (accepted เข้าได้ทางปุ่ม "ตอบรับ" เท่านั้น) */}
            {!isNew && (
              <div className="flex flex-wrap items-center gap-1.5">
                {INFLU_PROSPECT_STATUS_ORDER.map((s) => {
                  const meta = INFLU_PROSPECT_STATUSES[s];
                  const active = prospect.status === s;
                  const locked =
                    !canEdit ||
                    (s === "accepted" && prospect.status !== "accepted") ||
                    prospect.status === "accepted";
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={locked || active}
                      onClick={() => onSetStatus(s)}
                      // max-sm: อย่างเดียว (ไม่ใช่ min-h-11 + sm:min-h-0) — utility ที่คุม
                      // property เดียวกันแพ้ชนะตามลำดับใน CSS ไม่ใช่ลำดับที่เขียนในคลาส
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-[0.97] disabled:cursor-default max-sm:min-h-11 ${
                        active
                          ? meta.chip
                          : "border border-transparent text-stone-400 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}

            {!isNew && prospect.status === "accepted" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 animate-fade-in">
                <p className="text-sm text-emerald-800">
                  <UserRoundCheck
                    size={15}
                    className="mr-1.5 inline-block -mt-0.5"
                  />
                  ตอบรับแล้ว — มีโปรไฟล์ในระบบ
                  {prospect.accepted_at
                    ? ` (${formatDate(prospect.accepted_at)})`
                    : ""}
                </p>
                {canEdit && prospect.profile_id && (
                  <Button
                    type="button"
                    className="px-3 py-1.5"
                    onClick={onCreateCase}
                  >
                    สร้างนัดจากคนนี้
                  </Button>
                )}
              </div>
            )}

            {/* ---- ข้อมูลรายชื่อ (แก้ inline ได้ทุกช่อง) ---- */}
            <div>
              <Label htmlFor="pr-name">ชื่อ / ชื่อช่อง *</Label>
              <Input
                id="pr-name"
                required
                disabled={saving || !editable}
                autoFocus={
                  isNew &&
                  typeof window !== "undefined" &&
                  window.matchMedia("(pointer: fine)").matches
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => commitName(e.target.value)}
                onKeyDown={enterBlur}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pr-nick">ชื่อเล่น</Label>
                <Input
                  id="pr-nick"
                  disabled={saving || !editable}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onBlur={(e) => commitNullable("nickname", e.target.value)}
                  onKeyDown={enterBlur}
                />
              </div>
              <div>
                <Label htmlFor="pr-phone">เบอร์โทร (ถ้ามี)</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="pr-phone"
                    disabled={saving || !editable}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={(e) => commitNullable("phone", e.target.value)}
                    onKeyDown={enterBlur}
                  />
                  {telHref && (
                    <a
                      href={telHref}
                      aria-label={`โทรหา ${name.trim() || "รายชื่อนี้"}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 sm:h-9 sm:w-9"
                    >
                      <Phone size={15} />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="pr-occ">อาชีพ / แนวคอนเทนต์</Label>
                <Input
                  id="pr-occ"
                  disabled={saving || !editable}
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  onBlur={(e) => commitNullable("occupation", e.target.value)}
                  onKeyDown={enterBlur}
                />
              </div>
              <div>
                <Label htmlFor="pr-followers">ยอดผู้ติดตามรวม</Label>
                <Input
                  id="pr-followers"
                  disabled={saving || !editable}
                  inputMode="numeric"
                  value={followers}
                  onChange={(e) => setFollowers(e.target.value)}
                  onBlur={(e) => commitFollowers(e.target.value)}
                  onKeyDown={enterBlur}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div>
                <Label>ความน่าสนใจ</Label>
                <RatingStars
                  value={rating}
                  onChange={
                    saving || !editable
                      ? undefined
                      : (n) => {
                          setRating(n);
                          commit({ rating: n });
                        }
                  }
                />
              </div>
              <div>
                <Label htmlFor="pr-next">นัดตามครั้งถัดไป</Label>
                <Input
                  id="pr-next"
                  type="date"
                  disabled={saving || !editable}
                  value={nextOn}
                  onChange={(e) => {
                    setNextOn(e.target.value);
                    commit({ next_followup_on: e.target.value || null });
                  }}
                />
                {overdue && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                    <CalendarClock size={12} />
                    เลยกำหนดนัดตามแล้ว
                  </p>
                )}
              </div>
            </div>

            {/* ช่องทางโซเชียล — จดลิงก์/handle ไว้เปิดดูผลงานตอนประเมิน */}
            <div>
              <Label>ช่องทางโซเชียล</Label>
              <datalist id={datalistId}>
                {INFLU_CHANNEL_PLATFORMS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {!editable && rows.every((r) => r.value.trim() === "") ? (
                <p className="text-sm text-stone-400">—</p>
              ) : (
                <div className="space-y-2">
                  {rows.map((r, idx) => {
                    const link = /^https?:\/\//i.test(r.value.trim())
                      ? r.value.trim()
                      : null;
                    return (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white/70 p-2"
                      >
                        <Link2 size={14} className="shrink-0 text-stone-300" />
                        <input
                          type="text"
                          list={datalistId}
                          disabled={saving || !editable}
                          value={r.platform}
                          onChange={(e) =>
                            setRow(idx, { platform: e.target.value })
                          }
                          onBlur={() => commitChannels(rows)}
                          placeholder="แพลตฟอร์ม"
                          className="w-28 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:w-32 sm:text-sm"
                        />
                        <input
                          type="text"
                          disabled={saving || !editable}
                          value={r.value}
                          onChange={(e) =>
                            setRow(idx, { value: e.target.value })
                          }
                          onBlur={() => commitChannels(rows)}
                          placeholder="ลิงก์ / @handle"
                          // จอเล็กช่องนี้กินทั้งบรรทัดของตัวเอง — แถวมีแพลตฟอร์ม/ผู้ติดตาม/
                          // ปุ่ม 44px อยู่ด้วย ถ้าปล่อยให้ยืดตามที่เหลือจะเหลือกว้าง ~30px
                          // (ต้องสั่งผ่าน flex ทั้งชุดเพราะ basis-full ตัวเดียวแพ้ flex-1)
                          className="min-w-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none max-sm:flex-[1_1_100%] sm:flex-1 sm:text-sm"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={saving || !editable}
                          value={r.followers}
                          onChange={(e) =>
                            setRow(idx, { followers: e.target.value })
                          }
                          onBlur={() => commitChannels(rows)}
                          placeholder="ผู้ติดตาม"
                          className="w-24 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-base tabular-nums text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm"
                        />
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`เปิดช่องทาง ${r.platform}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-brand-50 hover:text-brand-600 sm:h-8 sm:w-8"
                          >
                            <ExternalLink size={15} />
                          </a>
                        )}
                        {editable && (
                          <button
                            type="button"
                            disabled={saving}
                            aria-label="ลบช่องทางนี้"
                            onClick={() => {
                              const next = rows.filter((_, i) => i !== idx);
                              setRows(next);
                              commitChannels(next);
                            }}
                            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90 sm:h-8 sm:w-8"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {editable && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    setRows((prev) => [...prev, { ...EMPTY_CHANNEL }])
                  }
                  className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 active:scale-[0.97] max-sm:min-h-11"
                >
                  <Plus size={14} />
                  เพิ่มช่องทาง
                </button>
              )}
            </div>

            <div>
              <Label htmlFor="pr-interested">หัตถการที่น่าจะเสนอ / เขาสนใจ</Label>
              <Textarea
                id="pr-interested"
                rows={2}
                disabled={saving || !editable}
                value={interested}
                onChange={(e) => setInterested(e.target.value)}
                onBlur={(e) =>
                  commitNullable("interested_services", e.target.value)
                }
              />
            </div>
            <div>
              <Label htmlFor="pr-note">โน้ต</Label>
              <Textarea
                id="pr-note"
                rows={3}
                disabled={saving || !editable}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={(e) => commitNullable("note", e.target.value)}
              />
            </div>

            {/* ---- ประวัติการติดต่อ (เฉพาะรายชื่อที่มีอยู่แล้ว) ---- */}
            {!isNew && (
              <div>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm font-semibold text-stone-700">
                    ประวัติการติดต่อ{" "}
                    <span className="font-normal text-stone-400">
                      ({contacts.length} ครั้ง)
                    </span>
                  </p>
                </div>

                {canEdit && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {INFLU_CONTACT_QUICK.map((q) => {
                      const Icon = QUICK_ICONS[q.icon];
                      return (
                        <Button
                          key={q.channel}
                          type="button"
                          variant="secondary"
                          disabled={savingContact}
                          loading={savingContact && pendingQuick === q.channel}
                          onClick={() => {
                            setPendingQuick(q.channel);
                            onAddContact(q.channel);
                          }}
                          className="border-brand-200 px-4 text-brand-700 hover:bg-brand-50"
                        >
                          {!(savingContact && pendingQuick === q.channel) && (
                            <Icon size={16} />
                          )}
                          {q.label}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {/* กล่องประวัติสูงคงที่ — ให้ที่ทางกับงานที่ทำบ่อยสุดของหน้านี้ */}
                <div className="min-h-56 rounded-xl border border-stone-200/80 bg-white/40 p-2">
                  {contacts.length === 0 ? (
                    <div className="flex min-h-52 flex-col items-center justify-center gap-1 px-4 text-center">
                      <p className="text-sm text-stone-400">
                        ยังไม่มีบันทึกการติดต่อ
                      </p>
                      <p className="text-xs text-stone-400">
                        ยังไม่มีใครจดว่าติดต่อไปแล้ว
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {contacts.map((c) => (
                        <ContactRow
                          key={c.id}
                          contact={c}
                          canEdit={canEdit}
                          onUpdate={(patch) => onUpdateContact(c.id, patch)}
                          onDelete={() => onDeleteContact(c.id)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {!isNew && (
              <p className="text-xs text-stone-400">
                ผู้รับผิดชอบ: {ownerName || "—"} · เพิ่มเมื่อ{" "}
                {formatDate(prospect.created_at)}
              </p>
            )}
          </div>

          {/* ---- ท้ายแผง ---- */}
          {isNew ? (
            <div className="shrink-0 border-t border-brand-100/70 px-4 pt-3 pb-safe-3">
              {err && (
                <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
                  {err}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={onClose}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" loading={saving} disabled={!name.trim()}>
                  เพิ่มเข้าบอร์ด
                </Button>
              </div>
            </div>
          ) : (
            canEdit && (
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-brand-100/70 px-4 pt-3 pb-safe-3 sm:flex-row sm:items-center">
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    className="text-rose-600 hover:bg-rose-50 sm:mr-auto"
                  >
                    <Trash2 size={15} />
                    ลบรายชื่อ
                  </Button>
                )}
                {prospect.status !== "accepted" && (
                  <Button type="button" onClick={() => setConfirmAccept(true)}>
                    <UserRoundCheck size={15} />
                    ตอบรับ → เข้าระบบ
                  </Button>
                )}
              </div>
            )
          )}
        </form>
      </aside>

      {!isNew && (
        <>
          <ConfirmDialog
            open={confirmAccept}
            onClose={() => setConfirmAccept(false)}
            title="ตอบรับเข้าระบบ"
            confirmLabel="ตอบรับ — สร้างโปรไฟล์"
            confirmVariant="primary"
            message={
              <>
                ยืนยันว่า <strong>{prospect.name}</strong> ตอบรับร่วมงานแล้ว?
                ระบบจะสร้างโปรไฟล์ในระบบ Influencer ให้ทันที
                (ชื่อ/เบอร์/ผู้ติดตาม/ช่องทาง ติดไปด้วย) แล้วไปสร้างนัดต่อได้เลย
              </>
            }
            onConfirm={onAccept}
          />
          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="ลบรายชื่อ"
            message={
              <>
                ลบ <strong>{prospect.name}</strong> ออกจากบอร์ด Hunting ถาวร
                (รวมประวัติการติดต่อทั้งหมด)? รายชื่อบนบอร์ดนี้
                <strong>ไม่มีถังขยะ</strong> — ลบแล้วกู้คืนไม่ได้
              </>
            }
            onConfirm={onDelete}
          />
        </>
      )}
    </>,
    document.body
  );
}

/* ---------- แถวประวัติการติดต่อ (แก้วัน + พิมพ์โน้ตต่อท้ายได้ในแถว) ---------- */

function ContactRow({
  contact: c,
  canEdit,
  onUpdate,
  onDelete,
}: {
  contact: InfluProspectContactRow;
  canEdit: boolean;
  onUpdate: (patch: ContactPatch) => void;
  onDelete: () => void;
}) {
  const [editDate, setEditDate] = useState(false);

  return (
    <li className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white/70 px-3 py-2">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && editDate ? (
            <input
              type="date"
              autoFocus
              defaultValue={c.contacted_on}
              onChange={(e) => {
                if (e.target.value) onUpdate({ contacted_on: e.target.value });
                setEditDate(false);
              }}
              onBlur={() => setEditDate(false)}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-base max-sm:min-h-11 sm:text-sm"
            />
          ) : (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setEditDate(true)}
              title={canEdit ? "กดเพื่อแก้วันที่" : undefined}
              className="inline-flex items-center border-b border-dashed border-stone-300 text-sm font-medium text-stone-700 transition-colors cursor-pointer hover:border-brand-400 hover:text-brand-700 disabled:cursor-default disabled:border-transparent max-sm:min-h-11"
            >
              {formatDate(c.contacted_on)}
            </button>
          )}
          {c.channel && (
            <Badge className="border border-stone-200 bg-stone-50 text-stone-500">
              {c.channel}
            </Badge>
          )}
        </div>
        {canEdit ? (
          <input
            // uncontrolled + remount เมื่อค่าจริงเปลี่ยน (แพตเทิร์นโน้ตของระบบนี้)
            key={c.note ?? ""}
            defaultValue={c.note ?? ""}
            placeholder="เพิ่มโน้ต (ถ้ามี)"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (c.note ?? "")) onUpdate({ note: v || null });
            }}
            className="mt-0.5 w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-base leading-5 text-stone-600 placeholder:text-stone-300 hover:border-stone-200 focus:border-brand-300 focus:bg-white focus:outline-none max-sm:min-h-11 sm:text-sm"
          />
        ) : (
          c.note && (
            <p className="mt-0.5 whitespace-pre-wrap px-1 text-sm leading-5 text-stone-600">
              {c.note}
            </p>
          )
        )}
      </div>
      {canEdit && (
        <button
          type="button"
          aria-label="ลบบันทึกนี้"
          onClick={onDelete}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 sm:h-7 sm:w-7"
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}
