"use client";

/**
 * โมดัลรายละเอียดรายชื่อบนบอร์ด Hunting
 *
 * ศูนย์รวมการทำงานต่อคน: เปลี่ยนสถานะ (pill), จด log การติดต่อรายครั้ง,
 * ตั้งนัดตามครั้งถัดไป, ตอบรับ → เข้าระบบ (สร้างโปรไฟล์), ปฏิเสธ, ลบ
 *
 * mutation จริงทั้งหมดอยู่ที่ hunting-client (optimistic list) — ตัวนี้เป็นหน้าตา + ฟอร์มย่อย
 */

import {
  CalendarClock,
  Link2,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useId, useState } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Label,
  Modal,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INFLU_CONTACT_CHANNELS,
  INFLU_PROSPECT_STATUS_ORDER,
  INFLU_PROSPECT_STATUSES,
} from "@/lib/influ-constants";
import type {
  InfluProspectContactRow,
  InfluProspectRow,
  InfluProspectStatus,
} from "@/lib/types";
import { RatingStars } from "./prospect-form";

/** วันนี้ตามเวลาไทย (yyyy-mm-dd) — ระดับโมดูลตามกฎ react-hooks/purity */
export function todayBangkok(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** เลยกำหนดนัดตามหรือยัง (เทียบวันแบบ string yyyy-mm-dd — ไม่มีเวลา) */
export function followupOverdue(nextOn: string | null): boolean {
  return nextOn !== null && nextOn < todayBangkok();
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <div className="mt-0.5 text-sm text-stone-800">{children}</div>
    </div>
  );
}

export type NewContactInput = {
  contactedOn: string;
  channel: string;
  note: string;
  /** ตั้งนัดตามครั้งถัดไปพร้อมกัน (ไม่กรอก = ไม่แตะ next_followup_on) */
  nextFollowupOn: string;
};

export function ProspectDetailModal({
  prospect,
  contacts,
  ownerName,
  canEdit,
  canDelete,
  savingContact,
  onClose,
  onEdit,
  onSetStatus,
  onSetNextFollowup,
  onAccept,
  onDelete,
  onAddContact,
  onDeleteContact,
  onCreateCase,
}: {
  prospect: InfluProspectRow;
  contacts: InfluProspectContactRow[];
  ownerName: string | null;
  canEdit: boolean;
  /** ผู้ดูแล หรือเจ้าของรายชื่อ */
  canDelete: boolean;
  savingContact: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSetStatus: (status: InfluProspectStatus) => void;
  onSetNextFollowup: (date: string | null) => void;
  /** ตอบรับ → สร้างโปรไฟล์เข้าระบบ (parent ทำ flow ทั้งหมด) */
  onAccept: () => void;
  onDelete: () => void;
  onAddContact: (input: NewContactInput) => void;
  onDeleteContact: (contactId: string) => void;
  /** เปิด NewCaseModal จากโปรไฟล์ที่ตอบรับแล้ว */
  onCreateCase: () => void;
}) {
  const channelListId = useId();
  const overdue =
    followupOverdue(prospect.next_followup_on) &&
    prospect.status !== "accepted" &&
    prospect.status !== "declined";

  const [confirmAccept, setConfirmAccept] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editNext, setEditNext] = useState(false);

  // ฟอร์มจด log การติดต่อ
  const [cOn, setCOn] = useState(() => todayBangkok());
  const [cChannel, setCChannel] = useState("");
  const [cNote, setCNote] = useState("");
  const [cNext, setCNext] = useState("");

  const submitContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (savingContact || !cOn) return;
    onAddContact({
      contactedOn: cOn,
      channel: cChannel.trim(),
      note: cNote.trim(),
      nextFollowupOn: cNext,
    });
    setCChannel("");
    setCNote("");
    setCNext("");
  };

  return (
    <Modal open onClose={onClose} title={prospect.name} wide>
      <div className="space-y-5">
        {/* สถานะ — pill กดเปลี่ยนได้เลย (accepted เข้าได้ทางปุ่ม "ตอบรับ" เท่านั้น) */}
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
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-[0.97] disabled:cursor-default sm:min-h-0 ${
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

        {prospect.status === "accepted" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 animate-fade-in">
            <p className="text-sm text-emerald-800">
              <UserRoundCheck size={15} className="mr-1.5 inline-block -mt-0.5" />
              ตอบรับแล้ว — มีโปรไฟล์ในระบบ
              {prospect.accepted_at
                ? ` (${formatDate(prospect.accepted_at)})`
                : ""}
            </p>
            {canEdit && prospect.profile_id && (
              <Button className="px-3 py-1.5" onClick={onCreateCase}>
                สร้างนัดจากคนนี้
              </Button>
            )}
          </div>
        )}

        {/* นัดตามครั้งถัดไป */}
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${
            overdue
              ? "border-rose-200 bg-rose-50/70"
              : "border-stone-200 bg-white/60"
          }`}
        >
          <CalendarClock
            size={15}
            className={overdue ? "text-rose-500" : "text-stone-400"}
          />
          <span
            className={`text-sm ${overdue ? "font-medium text-rose-700" : "text-stone-600"}`}
          >
            {prospect.next_followup_on
              ? `นัดตามครั้งถัดไป: ${formatDate(prospect.next_followup_on)}${overdue ? " — เลยกำหนดแล้ว" : ""}`
              : "ยังไม่ได้ตั้งนัดตามครั้งถัดไป"}
          </span>
          {canEdit && !editNext && (
            <button
              type="button"
              onClick={() => setEditNext(true)}
              className="inline-flex cursor-pointer items-center text-xs font-medium text-brand-700 underline-offset-2 hover:underline max-sm:min-h-11"
            >
              {prospect.next_followup_on ? "เปลี่ยนวัน" : "ตั้งวัน"}
            </button>
          )}
          {canEdit && editNext && (
            <span className="flex items-center gap-1.5">
              <input
                type="date"
                autoFocus
                defaultValue={prospect.next_followup_on ?? ""}
                onChange={(e) => {
                  onSetNextFollowup(e.target.value || null);
                  setEditNext(false);
                }}
                className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setEditNext(false)}
                className="inline-flex cursor-pointer items-center text-xs text-stone-400 hover:text-stone-600 max-sm:min-h-11"
              >
                ยกเลิก
              </button>
            </span>
          )}
        </div>

        {/* ข้อมูลหลัก */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <InfoRow label="ชื่อเล่น">{prospect.nickname || "—"}</InfoRow>
          <InfoRow label="เบอร์โทร">
            {prospect.phone ? (
              <a
                href={`tel:${prospect.phone.replace(/[^0-9+]/g, "")}`}
                className="inline-flex items-center gap-1 text-brand-700 hover:underline"
              >
                <Phone size={13} />
                {prospect.phone}
              </a>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow label="ผู้ติดตามรวม">
            {prospect.followers != null ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users size={13} className="text-stone-400" />
                {prospect.followers.toLocaleString("en-US")}
              </span>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow label="อาชีพ / แนวคอนเทนต์">
            {prospect.occupation || "—"}
          </InfoRow>
          <InfoRow label="เจอมาจาก">{prospect.source || "—"}</InfoRow>
          <InfoRow label="ผู้รับผิดชอบ">{ownerName || "—"}</InfoRow>
          <InfoRow label="ความน่าสนใจ">
            {prospect.rating > 0 ? (
              <RatingStars value={prospect.rating} size={14} />
            ) : (
              "ยังไม่ให้คะแนน"
            )}
          </InfoRow>
          <InfoRow label="เพิ่มเมื่อ">{formatDate(prospect.created_at)}</InfoRow>
        </div>

        {/* ช่องทางโซเชียล */}
        {prospect.channels.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
              ช่องทางโซเชียล
            </p>
            <div className="flex flex-wrap gap-1.5">
              {prospect.channels.map((c, i) => {
                const isLink = /^https?:\/\//i.test(c.value);
                const inner = (
                  <>
                    <Link2 size={12} />
                    <span className="font-medium">{c.platform}</span>
                    <span className="max-w-48 truncate">{c.value}</span>
                    {c.followers != null && (
                      <span className="tabular-nums text-stone-400">
                        · {c.followers.toLocaleString("en-US")}
                      </span>
                    )}
                  </>
                );
                const cls =
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs text-stone-700 sm:min-h-0";
                return isLink ? (
                  <a
                    key={i}
                    href={c.value}
                    target="_blank"
                    rel="noreferrer"
                    className={`${cls} transition-colors hover:border-brand-300 hover:text-brand-700`}
                  >
                    {inner}
                  </a>
                ) : (
                  <span key={i} className={cls}>
                    {inner}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {(prospect.interested_services || prospect.note) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {prospect.interested_services && (
              <div className="rounded-xl border border-stone-200 bg-white/60 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                  หัตถการที่น่าจะเสนอ
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                  {prospect.interested_services}
                </p>
              </div>
            )}
            {prospect.note && (
              <div className="rounded-xl border border-stone-200 bg-white/60 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                  โน้ต
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                  {prospect.note}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ประวัติการติดต่อ */}
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">
            ประวัติการติดต่อ{" "}
            <span className="font-normal text-stone-400">
              ({contacts.length} ครั้ง)
            </span>
          </p>
          {canEdit && (
            <form
              onSubmit={submitContact}
              className="mb-3 space-y-2 rounded-xl border border-dashed border-stone-300 bg-white/50 p-3"
            >
              <datalist id={channelListId}>
                {INFLU_CONTACT_CHANNELS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <Label htmlFor="ct-on">วันที่ติดต่อ</Label>
                  <Input
                    id="ct-on"
                    type="date"
                    required
                    disabled={savingContact}
                    value={cOn}
                    onChange={(e) => setCOn(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="ct-channel">ช่องทาง</Label>
                  <Input
                    id="ct-channel"
                    list={channelListId}
                    disabled={savingContact}
                    value={cChannel}
                    onChange={(e) => setCChannel(e.target.value)}
                    placeholder="เช่น Instagram DM"
                  />
                </div>
                <div>
                  <Label htmlFor="ct-next">นัดตามครั้งถัดไป (ถ้ามี)</Label>
                  <Input
                    id="ct-next"
                    type="date"
                    disabled={savingContact}
                    value={cNext}
                    onChange={(e) => setCNext(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="ct-note">คุยว่าอะไร / ผลลัพธ์</Label>
                  <Input
                    id="ct-note"
                    disabled={savingContact}
                    value={cNote}
                    onChange={(e) => setCNote(e.target.value)}
                    placeholder="เช่น ทักไปแนะนำตัว รอตอบ / ตอบแล้ว ขอดูรายละเอียด"
                  />
                </div>
                <Button type="submit" loading={savingContact}>
                  <Plus size={14} />
                  จดไว้
                </Button>
              </div>
            </form>
          )}
          {contacts.length === 0 ? (
            <p className="text-sm text-stone-400">
              ยังไม่มีบันทึกการติดต่อ — จดไว้ทุกครั้งจะได้รู้ว่าตามถึงไหนแล้ว
            </p>
          ) : (
            <ul className="space-y-1.5">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white/60 px-3 py-2"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-stone-700">
                      {formatDate(c.contacted_on)}
                    </span>
                    {c.channel && (
                      <Badge className="ml-2 border border-stone-200 bg-stone-50 text-stone-500">
                        {c.channel}
                      </Badge>
                    )}
                    {c.note && (
                      <p className="mt-0.5 whitespace-pre-wrap leading-5 text-stone-600">
                        {c.note}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="ลบบันทึกนี้"
                      onClick={() => onDeleteContact(c.id)}
                      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 sm:h-7 sm:w-7"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ปุ่มการทำงาน */}
        {canEdit && (
          <div className="flex flex-col-reverse gap-2 border-t border-stone-200/70 pt-4 sm:flex-row sm:items-center">
            {canDelete && (
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="text-rose-600 hover:bg-rose-50 sm:mr-auto"
              >
                <Trash2 size={15} />
                ลบรายชื่อ
              </Button>
            )}
            <Button variant="secondary" onClick={onEdit}>
              <Pencil size={15} />
              แก้ไขข้อมูล
            </Button>
            {prospect.status !== "accepted" && (
              <Button onClick={() => setConfirmAccept(true)}>
                <UserRoundCheck size={15} />
                ตอบรับ → เข้าระบบ
              </Button>
            )}
          </div>
        )}
      </div>

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
    </Modal>
  );
}
