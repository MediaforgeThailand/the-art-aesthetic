"use client";

/**
 * โมดัลรายละเอียดรายชื่อบนบอร์ด Hunting
 *
 * ศูนย์รวมการทำงานต่อคน: เปลี่ยนสถานะ (pill), บันทึกการติดต่อ, โน้ตรวม,
 * ตั้งนัดตามครั้งถัดไป, ตอบรับ → เข้าระบบ (สร้างโปรไฟล์), ปฏิเสธ, ลบ
 *
 * ลดการกรอกลงตามคำสั่งผู้ใช้ 2026-08-19 ("ใช้งานยากมาก ลดการบันทึกที่ไม่จำเป็น"):
 *   - ประวัติการติดต่อ = **ปุ่มลัด "โทร/ทัก" กดครั้งเดียวบันทึกวันนี้ให้เลย**
 *     (ไม่มีฟอร์มวันที่/ช่องทาง/นัดตาม ให้กรอกก่อนอีกต่อไป) แล้วค่อยกดวันที่บนแถว
 *     เพื่อแก้วัน หรือพิมพ์โน้ตต่อท้ายแถวนั้นทีหลังได้
 *   - "เจอมาจาก" ถูกถอดออกทั้งฟอร์มและหน้านี้ (ข้อมูลที่ไม่ได้ใช้ต่อ)
 *   - ผู้รับผิดชอบ = คนสร้างรายชื่อ แสดงให้อัตโนมัติ (ไม่ต้องเลือกเอง)
 *   - โน้ตรวม = กล่องพิมพ์ในหน้านี้เลย บันทึกตอนคลิกออก (ไม่ต้องเปิดโมดัลแก้ข้อมูล)
 *
 * mutation จริงทั้งหมดอยู่ที่ hunting-client (optimistic list) — ตัวนี้เป็นหน้าตา + ฟอร์มย่อย
 */

import {
  CalendarClock,
  Link2,
  MessageCircle,
  Pencil,
  Phone,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Badge, Button, ConfirmDialog, Modal } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INFLU_CONTACT_QUICK,
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

/** ไอคอนของปุ่มลัด — ตาราง constants เก็บได้แค่คีย์ (เป็นไฟล์ .ts ไม่มี JSX) */
const QUICK_ICONS = { phone: Phone, message: MessageCircle } as const;

/** แก้ไขได้เฉพาะ 2 ช่องนี้บนแถวประวัติ (วันที่ + โน้ตต่อท้าย) */
export type ContactPatch = { contacted_on?: string; note?: string | null };

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
  onSetNote,
  onAccept,
  onDelete,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onCreateCase,
}: {
  prospect: InfluProspectRow;
  contacts: InfluProspectContactRow[];
  /** ผู้รับผิดชอบ = เจ้าของรายชื่อ ไม่มีก็ใช้คนสร้าง (parent เลือกให้แล้ว) */
  ownerName: string | null;
  canEdit: boolean;
  /** ผู้ดูแล หรือเจ้าของรายชื่อ */
  canDelete: boolean;
  savingContact: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSetStatus: (status: InfluProspectStatus) => void;
  onSetNextFollowup: (date: string | null) => void;
  /** โน้ตรวมของรายชื่อนี้ (บันทึกตอนคลิกออกจากกล่อง) */
  onSetNote: (note: string) => void;
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
  const overdue =
    followupOverdue(prospect.next_followup_on) &&
    prospect.status !== "accepted" &&
    prospect.status !== "declined";

  const [confirmAccept, setConfirmAccept] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editNext, setEditNext] = useState(false);

  // ปุ่มลัดที่เพิ่งกด (โชว์สปินเนอร์เฉพาะปุ่มนั้น) — ล้างเองตอน parent บันทึกเสร็จ
  // ด้วยแพตเทิร์น adjust-state-during-render ตามที่ใช้ทั้งหน้านี้ ไม่ใช่ effect sync
  const [pendingQuick, setPendingQuick] = useState<string | null>(null);
  if (pendingQuick !== null && !savingContact) setPendingQuick(null);

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
              className="cursor-pointer text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
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
                className="cursor-pointer text-xs text-stone-400 hover:text-stone-600"
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
          <InfoRow label="ความน่าสนใจ">
            {prospect.rating > 0 ? (
              <RatingStars value={prospect.rating} size={14} />
            ) : (
              "ยังไม่ให้คะแนน"
            )}
          </InfoRow>
          <InfoRow label="ผู้รับผิดชอบ">
            {ownerName || "—"}
            <span className="ml-1.5 text-xs text-stone-400">
              · เพิ่ม {formatDate(prospect.created_at)}
            </span>
          </InfoRow>
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

        {/* โน้ตรวม — พิมพ์ได้ตรงนี้เลย ไม่ต้องเปิดโมดัลแก้ข้อมูล */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
            โน้ตรวมของคนนี้
          </p>
          {canEdit ? (
            <textarea
              // remount เมื่อค่าจริงเปลี่ยน (บันทึกจากที่นี่/โมดัลแก้ข้อมูล) — uncontrolled
              // จึงไม่รับค่าใหม่เองถ้าไม่รีเซ็ต; ตอนนั้นโฟกัสออกไปแล้วไม่กระตุก
              key={prospect.note ?? ""}
              rows={3}
              defaultValue={prospect.note ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (prospect.note ?? "")) onSetNote(v);
              }}
              placeholder="จดอะไรก็ได้เกี่ยวกับคนนี้ — เงื่อนไขที่คุยไว้ / ข้อสังเกต (บันทึกอัตโนมัติเมื่อคลิกออก)"
              className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-base leading-6 text-stone-700 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
            />
          ) : prospect.note ? (
            <p className="whitespace-pre-wrap rounded-xl border border-stone-200 bg-white/60 p-3 text-sm leading-6 text-stone-700">
              {prospect.note}
            </p>
          ) : (
            <p className="text-sm text-stone-400">—</p>
          )}
        </div>

        {/* ประวัติการติดต่อ — ปุ่มลัดกดครั้งเดียวบันทึกวันนี้ */}
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-semibold text-stone-700">
              ประวัติการติดต่อ{" "}
              <span className="font-normal text-stone-400">
                ({contacts.length} ครั้ง)
              </span>
            </p>
            {canEdit && (
              <p className="text-xs text-stone-400">
                กดปุ่มแล้วบันทึกวันนี้ให้ทันที — กดวันที่บนแถวเพื่อแก้ / พิมพ์โน้ตต่อท้ายได้
              </p>
            )}
          </div>

          {canEdit && (
            <div className="mb-3 flex flex-wrap gap-2">
              {INFLU_CONTACT_QUICK.map((q) => {
                const Icon = QUICK_ICONS[q.icon];
                return (
                  <Button
                    key={q.channel}
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
                <p className="text-sm text-stone-400">ยังไม่มีบันทึกการติดต่อ</p>
                <p className="text-xs text-stone-400">
                  {canEdit
                    ? "โทรหรือทักไปแล้วกดปุ่มด้านบน — ระบบจดวันให้เอง"
                    : "ยังไม่มีใครจดว่าติดต่อไปแล้ว"}
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
            // uncontrolled + remount เมื่อค่าจริงเปลี่ยน (แพตเทิร์นเดียวกับโน้ตรวม)
            key={c.note ?? ""}
            defaultValue={c.note ?? ""}
            placeholder="เพิ่มโน้ต (ถ้ามี) — เช่น ทักไปแล้ว รอตอบ"
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
