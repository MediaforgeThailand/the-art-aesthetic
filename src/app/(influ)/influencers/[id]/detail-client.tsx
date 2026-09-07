"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Hash,
  History,
  FileSignature,
  ImagePlus,
  LayoutList,
  Link2,
  ListChecks,
  MessageCircleQuestion,
  PenLine,
  Repeat,
  Undo2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  InfluLogProvider,
  useInfluLog,
  useInfluNotify,
} from "@/influ/components/influ-log-provider";
import { SignaturePad } from "@/influ/components/signature-pad";
import {
  AssigneeEditor,
  AssigneeStack,
  PersonAvatar,
  type AssigneeChange,
  type CaseAssignee,
  type InfluPerson,
} from "../assignees";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  Select,
  Modal,
  Textarea,
} from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNotiTime,
  formatNumber,
} from "@/lib/format";
import {
  activeFollowupTasks,
  calendarTimeLabel,
  type CaseHashtag,
  caseHashtags,
  caseValueOf,
  contractEndDate,
  hashtagText,
  INFLU_BUDGET_CAPS,
  INFLU_STAGE,
  INFLU_STAGE_LAST,
  INFLU_STAGES,
  INFLU_TIERS,
  INFLU_VOUCHER_UNIT,
  itemEffectiveCost,
  memoStepOf,
  procedureSummaryText,
  roleSummary,
  scopeOfStage,
  tierFromFollowers,
  voucherCreditOf,
  voucherLabelOf,
} from "@/influ/lib/influ-constants";
import { influLogActionMeta, logInflu } from "@/influ/lib/influ-log";
import { notifyInflu } from "@/influ/lib/influ-notify";
import { createClient } from "@/lib/supabase/client";
import { tooLargeSummary } from "@/lib/upload";
import { prepareUploadFiles } from "@/lib/upload-prepare";
import type {
  DoctorRow,
  InfluActivityLogRow,
  InfluCalendarEventRow,
  InfluCampaignDefRow,
  InfluCasePhotoRow,
  InfluencerRow,
  InfluRoundLite,
  InfluProcedureItemRow,
  InfluProfileChannelRow,
  InfluProfileRow,
  InfluServiceRow,
  InfluTaskRow,
  ProcedureChange,
  TaskWithAssignee,
} from "@/lib/types";
import { DoctorNameChip, DoctorSelect } from "../doctor-select";
import { NewCaseModal } from "../new-case-modal";
import { ProfileFormModal } from "../profile-form";
import {
  ProcedureItemsEditor,
  type PriceCatalogEntry,
  type PromoCatalogEntry,
} from "../procedure-items-editor";
import { ProcedurePicker, type PickedProcedure } from "../procedure-picker";
import { VoucherPicker } from "../voucher-picker";
import { useSignedUrl } from "@/lib/use-signed-url";
import { ContractStage, MemoStage } from "./docs-stages";

/** หัตถการของเคส + รหัสแพ็กเกจของโปรที่ผูกไว้ (embed จาก promo_packages)
    ใช้สร้างแฮชแท็ก #โปรโมชัน — embed มาจาก query ของ page.tsx ไม่ใช่คอลัมน์จริงในตาราง */
export type ProcedureItemWithPromo = InfluProcedureItemRow & {
  promo?: { sku: string } | null;
};

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** ชื่อเคสที่จะไปโผล่ในประวัติการใช้งาน (นิยามซ้ำจาก influName ในบอร์ด —
    ไม่ import จาก influ-board.tsx เพราะไฟล์นั้นดึง dnd-kit มาทั้งก้อน) */
function logNameOf(
  i: Pick<InfluencerRow, "first_name" | "last_name" | "nickname">
): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

/** สถานะของรอบงานหนึ่งรอบ — ใช้แทน "ขั้น N/M" ด้วยชื่อขั้นจริง (ผู้ใช้ 2026-09-02:
    ไม่ต้องบอก stage แบบเศษส่วน ให้บอกว่ากำลังอยู่ขั้นอะไรแทน) */
function roundStatusLabel(r: InfluRoundLite): string {
  if (r.declined_at) return "ปฏิเสธ";
  if (r.completed) return "จบงานแล้ว";
  return INFLU_STAGES.find((s) => s.step === r.stage)?.title ?? `ขั้นที่ ${r.stage}`;
}

/** วันก่อนหน้าของ YYYY-MM-DD (เลขคณิตบน Date.UTC — ไม่แตะ timezone เครื่อง) */
function yesterdayOf(todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) - 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** เวลาบนไทม์ไลน์ sidebar — วันนี้/เมื่อวานเป็นคำ เก่ากว่านั้นใช้รูปแบบเดียวกับกระดิ่ง */
function logTimeLabel(createdAt: string, today: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
  }).format(d);
  if (day !== today && day !== yesterdayOf(today)) return formatNotiTime(createdAt);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${day === today ? "วันนี้" : "เมื่อวาน"} ${time}`;
}

/** รูปบน sidebar โปรไฟล์ — ตัวย่อรูปเดียว ไม่ใช่จุดอัพโหลด (อัพ/เปลี่ยนรูปทำในแท็บภาพรวมเหมือนเดิม) */
function SidebarPhoto({ path, name }: { path: string | null; name: string }) {
  const { url, failed } = useSignedUrl(path);
  if (path && !url && !failed)
    return <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-stone-200" />;
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200"
      />
    );
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300 text-xl font-semibold text-brand-700">
      {name.trim().charAt(0) || "?"}
    </div>
  );
}

/** sidebar โปรไฟล์ฝั่งซ้าย — ข้อมูลหลักของ influ + ผู้รับผิดชอบ + ประวัติการแก้ไขล่าสุด
    ติดตามตลอดตอนเลื่อน (lg:sticky) และเห็นเหมือนกันทุกแท็บ — งานส่งต่อกันหลายคน
    คนที่เพิ่งเปิดเคสต้องรู้ทันทีว่าใครทำอะไรไปล่าสุด โดยไม่ต้องกดเข้าหน้า LOG กลาง */
function ProfileSidebar({
  influencer,
  fullName,
  assignees,
  peopleById,
  activityLog,
  today,
}: {
  influencer: InfluencerRow;
  fullName: string;
  assignees: CaseAssignee[];
  peopleById: Map<string, InfluPerson>;
  activityLog: InfluActivityLogRow[];
  today: string;
}) {
  const tier = influencer.tier ? INFLU_TIERS[influencer.tier] : null;
  const stageTitle =
    INFLU_STAGES.find((s) => s.step === influencer.stage)?.title ?? null;
  const contractEnd =
    influencer.contract_start && influencer.contract_months
      ? contractEndDate(influencer.contract_start, influencer.contract_months)
      : null;
  // ประวัติการแก้ไข — แต่ละแถวย่อเหลือ 1 บรรทัด กดดูรายละเอียดเต็มในป็อปอัพ
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const openLog = activityLog.find((l) => l.id === openLogId) ?? null;
  const openLogMeta = openLog ? influLogActionMeta(openLog.action) : null;
  // ไม่มี Card ห่อตัวเองแล้ว (2026-09-03) — parent (<aside>) เป็นคนให้พื้นหลัง glass/มุมโค้ง
  // เพราะต้องยืดเต็มความสูงแถวให้กลืนกับคอลัมน์เนื้อหาขวา ส่วนกล่องนี้แค่เป็น sticky scroller
  return (
    <>
      {/* ตัวตน: รูป + ชื่อ + สถานะปัจจุบัน */}
      <div className="flex items-start gap-3 p-4">
        <SidebarPhoto path={influencer.photo_path} name={fullName} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-stone-900">
            คุณ{fullName || "-"}
          </p>
          {influencer.nickname && (
            <p className="truncate text-sm text-stone-500">
              ({influencer.nickname})
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {influencer.influ_code && (
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600">
                {influencer.influ_code}
              </span>
            )}
            {influencer.declined_at ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                ปฏิเสธ
              </span>
            ) : influencer.completed ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                จบงานแล้ว
              </span>
            ) : stageTitle ? (
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                {stageTitle}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ข้อมูลหลัก — เอาเฉพาะที่ต้องเหลือบดูตอนทำงาน ไม่ยกการ์ดภาพรวมมาทั้งชุด */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-stone-100 p-4">
        <Field
          label="ผู้ติดตาม"
          value={
            influencer.followers ? (
              <>
                {formatNumber(influencer.followers)}
                {tier && (
                  <span className="ml-1 text-xs text-stone-400">
                    · {tier.label}
                  </span>
                )}
              </>
            ) : null
          }
        />
        <Field label="เบอร์ติดต่อ" value={influencer.phone} />
        <div className="col-span-2">
          <Field
            label="หัตถการ"
            value={
              influencer.procedure_text ? (
                <span className="line-clamp-2">{influencer.procedure_text}</span>
              ) : null
            }
          />
        </div>
        <Field
          label="วันรับบริการ"
          value={
            influencer.service_date ? formatDate(influencer.service_date) : null
          }
        />
        <Field label="แพทย์" value={influencer.doctor_name} />
        <div className="col-span-2">
          <Field
            label="อายุสัญญา"
            value={
              influencer.contract_start ? (
                <>
                  {formatDate(influencer.contract_start)}
                  {contractEnd && ` – ${formatDate(contractEnd)}`}
                </>
              ) : null
            }
          />
        </div>
      </dl>

      {/* ผู้รับผิดชอบ — ใครดูขั้นไหน (แก้/มอบหมายทำที่การ์ดในแท็บภาพรวมเหมือนเดิม) */}
      <div className="border-t border-stone-100 p-4">
        <p className="mb-2 text-xs font-medium text-stone-400">ผู้รับผิดชอบ</p>
        {assignees.length === 0 ? (
          <p className="text-sm text-stone-400">ยังไม่มีผู้รับผิดชอบ</p>
        ) : (
          <ul className="space-y-2">
            {assignees.map((a) => {
              const p = peopleById.get(a.userId);
              return (
                <li key={a.userId} className="flex items-center gap-2">
                  <PersonAvatar
                    person={
                      p ?? {
                        id: a.userId,
                        name: "ไม่ทราบชื่อ",
                        avatarPath: null,
                        jobTitle: null,
                      }
                    }
                    size={24}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-800">
                      {p?.name ?? "ไม่ทราบชื่อ"}
                    </p>
                    <p className="truncate text-[11px] text-stone-400">
                      {roleSummary(a.scopes)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* การแก้ไขล่าสุด — ไทม์ไลน์ให้คนที่รับช่วงงานตามสถานะทัน (เช่น "เมื่อวาน 13:00 ส่ง Memo แล้ว") */}
      <div className="border-t border-stone-100 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-400">
          <History className="h-3.5 w-3.5" />
          การแก้ไขล่าสุด
        </p>
        {activityLog.length === 0 ? (
          <p className="text-sm text-stone-400">ยังไม่มีประวัติการแก้ไข</p>
        ) : (
          <ol className="max-h-96 space-y-0.5 overflow-y-auto lg:max-h-none">
            {activityLog.map((l) => {
              const meta = influLogActionMeta(l.action);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setOpenLogId(l.id)}
                    className="flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-stone-50 max-sm:py-2"
                  >
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${meta.chip}`}
                    >
                      {meta.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-stone-700">
                      {l.summary}
                    </span>
                    <span className="shrink-0 text-[11px] text-stone-400">
                      {logTimeLabel(l.created_at, today)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <Modal
        open={openLog !== null}
        onClose={() => setOpenLogId(null)}
        title="รายละเอียดการแก้ไข"
      >
        {openLog && openLogMeta && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${openLogMeta.chip}`}
              >
                {openLogMeta.label}
              </span>
              <span className="text-xs text-stone-400">
                {formatNotiTime(openLog.created_at)}
              </span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line text-stone-800">
              {openLog.summary}
            </p>
            {openLog.actor_name && (
              <p className="text-xs text-stone-500">
                โดย {openLog.actor_name}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** แกลเลอรีรูปของเคส (0105) — อัพได้หลายรูป, รูปแรก (position ต่ำสุด) = รูปหน้าปกที่ใช้
    โชว์ทุกที่ (การ์ดบอร์ด/sidebar/หัวเอกสารภาพรวม) — ทุกทิ้งเป็น module scope กัน remount
    ทุก keystroke ของฟอร์ม; แสดงรูปด้วย object-contain (สูงคงที่ กว้างตามสัดส่วนจริง)
    ไม่บังคับครอปเป็นสี่เหลี่ยมจัตุรัสแบบเดิม */
function CasePhotoGallery({
  label,
  photos,
  disabled,
  onAddFiles,
  onRemove,
}: {
  label: string;
  photos: InfluCasePhotoRow[];
  disabled: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (photo: InfluCasePhotoRow) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, idx) => (
          <CasePhotoTile
            key={p.id}
            photo={p}
            cover={idx === 0}
            disabled={disabled}
            onRemove={() => onRemove(p)}
          />
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex h-28 w-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 bg-white/60 text-stone-400 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-600 disabled:cursor-default disabled:opacity-60"
        >
          <ImagePlus size={20} />
          <span className="text-xs font-medium">เพิ่มรูป</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onAddFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function CasePhotoTile({
  photo,
  cover,
  disabled,
  onRemove,
}: {
  photo: InfluCasePhotoRow;
  cover: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { url, failed } = useSignedUrl(photo.file_path);
  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- object-contain คงสัดส่วนจริง ไม่ crop
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : failed ? (
        <span className="px-2 text-center text-[11px] text-stone-400">
          เปิดรูปไม่ได้
        </span>
      ) : (
        <div className="h-full w-full animate-pulse bg-stone-200" />
      )}
      {cover && (
        <span className="absolute bottom-1 left-1 rounded-full bg-brand-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
          หน้าปก
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label="ลบรูปนี้"
        onClick={onRemove}
        className="absolute -right-2 -top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-stone-500 shadow ring-1 ring-stone-200 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-90 disabled:cursor-default disabled:opacity-60"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** แก้ชื่อ-นามสกุล-ชื่อเล่นของ influencer — เดิมกรอกได้ครั้งเดียวตอนสร้างการ์ด แก้ทีหลังไม่ได้
    เปิดได้ทุก stage รวมถึงเคสที่ปิดงานแล้ว (เป็นข้อมูลตัวบุคคล ไม่ใช่สถานะงาน — พิมพ์ผิดต้องแก้ได้เสมอ)
    คอมโพเนนต์แม่ mount ให้เฉพาะตอนเปิด — ค่าตั้งต้นจึงอ่านจาก props ใหม่ทุกครั้ง ไม่ต้อง sync ด้วย effect */
function NameEditModal({
  influencer,
  onClose,
}: {
  influencer: InfluencerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const [firstName, setFirstName] = useState(influencer.first_name);
  const [lastName, setLastName] = useState(influencer.last_name ?? "");
  const [nickname, setNickname] = useState(influencer.nickname ?? "");
  /** รหัส Influ ID — อ่านอย่างเดียว: 0107 ทำให้เป็นรหัส "ประจำตัวบุคคล" ที่ระบบออกให้
      ตอนสร้างโปรไฟล์ และ trigger sync ลงทุกรอบ (ไม่มีปุ่มออกรหัส/ช่องกรอกอีกแล้ว) */
  const code = influencer.influ_code ?? "";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const first = firstName.trim();
    if (!first) {
      setErr("ชื่อห้ามเว้นว่าง");
      return;
    }
    setBusy(true);
    setErr(null);
    // ชื่อเป็นข้อมูล "ตัวบุคคล" — แก้ครั้งเดียวเปลี่ยนให้ทุกรอบของคนนี้ (person_id เดียวกัน)
    // ไม่งั้นคนที่เข้ามาทำหลายรอบจะชื่อไม่ตรงกันข้ามการ์ด
    const { error } = await supabase
      .from("influencers")
      .update({
        first_name: first,
        last_name: lastName.trim() || null,
        nickname: nickname.trim() || null,
      })
      .eq("person_id", influencer.person_id);
    if (error) {
      setBusy(false);
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    // โปรไฟล์ตัวบุคคล (0080) ต้องตามชื่อใหม่ด้วย — best effort (เคสเก่าบางแถวอาจไม่มีโปรไฟล์)
    await supabase
      .from("influ_profiles")
      .update({
        first_name: first,
        last_name: lastName.trim() || null,
        nickname: nickname.trim() || null,
      })
      .eq("id", influencer.person_id);
    setBusy(false);
    const changed: string[] = [];
    const nextName = logNameOf({
      first_name: first,
      last_name: lastName.trim() || null,
      nickname: nickname.trim() || null,
    });
    if (nextName !== logNameOf(influencer)) changed.push(`ชื่อ → ${nextName}`);
    if (changed.length > 0) {
      log({
        action: "update",
        entityId: influencer.id,
        influencerId: influencer.id,
        influencerName: nextName,
        summary: `แก้ข้อมูลตัวบุคคล: ${changed.join(" · ")}`,
      });
    }
    onClose();
    router.refresh();
  };

  return (
    <Modal open onClose={onClose} title="แก้ไขชื่อ Influencer">
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="influ-first">ชื่อ *</Label>
          <Input
            id="influ-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="influ-last">นามสกุล</Label>
          <Input
            id="influ-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="influ-nick">ชื่อเล่น</Label>
          <Input
            id="influ-nick"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="ใช้แสดงบนการ์ดบอร์ดและในเอกสาร"
          />
        </div>
        {/* รหัส Influ ID = รหัสประจำตัวบุคคล (0107) — ทุกรอบของคนนี้ใช้รหัสเดียวกัน
            ระบบออกให้ตอนสร้างโปรไฟล์ ไม่มีทางแก้/ออกใหม่จากหน้าเคส */}
        <div>
          <Label>รหัส Influ ID</Label>
          <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5">
            <Hash size={15} className="shrink-0 text-brand-500" />
            <span className="font-mono text-sm font-semibold text-stone-700">
              {code || "ยังไม่มีรหัส"}
            </span>
          </div>
        </div>
        {err && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" loading={busy}>
            บันทึกชื่อ
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** แก้ "วันเข้ารับบริการ + แพทย์ที่รับเคส + ช่องทางการติดต่อ" ได้ทุก stage — ช่องพวกนี้ไม่บังคับ
    ตอนกรอกรายละเอียดเคส (influ มักยังไม่เคาะวัน / ยังไม่รู้ว่าแพทย์ท่านไหนรับเคส /
    ยังไม่ได้เปิดกลุ่มไลน์) แล้วมาเคาะทีหลังตอนอยู่ stage อื่น — เป็นข้อมูลนัดหมาย ไม่ใช่สถานะงาน
    จึงเปิดแก้ได้เสมอแบบเดียวกับ NameEditModal */
function CaseInfoEditModal({
  influencer,
  doctors,
  onClose,
}: {
  influencer: InfluencerRow;
  doctors: DoctorRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const notify = useInfluNotify();
  const [serviceDate, setServiceDate] = useState(influencer.service_date ?? "");
  const [doctorName, setDoctorName] = useState(influencer.doctor_name ?? "");
  const [contactChannel, setContactChannel] = useState(
    influencer.contact_channel ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const nextDate = serviceDate === "" ? null : serviceDate;
    const nextDoctor = doctorName.trim() || null;
    const nextChannel = contactChannel.trim() || null;
    const { error } = await supabase
      .from("influencers")
      .update({
        service_date: nextDate,
        doctor_name: nextDoctor,
        contact_channel: nextChannel,
      })
      .eq("id", influencer.id);
    setBusy(false);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    log({
      action: "update",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `แก้ข้อมูลนัด: ${
        nextDate ? formatDate(nextDate) : "ยังไม่กำหนดวัน"
      } · ${nextDoctor ?? "ยังไม่ระบุแพทย์"} · ช่องทาง ${
        nextChannel ?? "ยังไม่ระบุ"
      }`,
    });
    notify({
      type: "case_updated",
      scope: "contract",
      title: `แก้ข้อมูลนัดของ ${logNameOf(influencer)}`,
      body: `${nextDate ? formatDate(nextDate) : "ยังไม่กำหนดวัน"} · ${nextDoctor ?? "ยังไม่ระบุแพทย์"}`,
    });
    onClose();
    router.refresh();
  };

  return (
    <Modal open onClose={onClose} title="แก้ไขข้อมูลนัดหมาย">
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="ci-date">วันเข้ารับบริการ</Label>
          <Input
            id="ci-date"
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ci-doc">แพทย์ที่รับเคส</Label>
          <DoctorSelect
            id="ci-doc"
            doctors={doctors}
            value={doctorName}
            onChange={setDoctorName}
          />
        </div>
        <div>
          <Label htmlFor="ci-contact">ช่องทางการติดต่อ</Label>
          <Input
            id="ci-contact"
            value={contactChannel}
            onChange={(e) => setContactChannel(e.target.value)}
            placeholder="เช่น กลุ่มไลน์ ART x คุณเอ"
          />
        </div>
        {err && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" loading={busy}>
            บันทึก
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ================================================================== */

export function InfluDetailClient({
  influencer,
  personRounds,
  tasks,
  contentTasks,
  procedureItems,
  priceCatalog,
  promoCatalog,
  serviceBookings,
  services,
  personProfile,
  profileChannels,
  casePhotos,
  ownerName,
  userId,
  userName,
  doctors,
  campaigns,
  assignees,
  people,
  activityLog,
  today,
  canManage,
  canManageSystem = false,
  initialStage = null,
}: {
  influencer: InfluencerRow;
  /** รอบงานทั้งหมดของคนเดียวกัน (person_id เดียวกัน รวมเคสนี้ + เคสเก่า archived) เรียงรอบแรก→ล่าสุด */
  personRounds: InfluRoundLite[];
  tasks: InfluTaskRow[];
  contentTasks: TaskWithAssignee[];
  /** รายการโปรแกรม + ต้นทุน (Influencer Cost) ของเคสนี้ */
  procedureItems: ProcedureItemWithPromo[];
  /** ตัวเลือกโปรแกรมจาก Price List กลาง (dropdown ในแท็บรายละเอียดเคส) */
  priceCatalog: PriceCatalogEntry[];
  /** โปรที่ขึ้นหน้า /price-list (promo_packages — 0090) — ต้องค้นเจอในช่องหัตถการด้วย */
  promoCatalog: PromoCatalogEntry[];
  /** คิว "เข้ารับบริการ" (kind=service) ของเคสนี้ในปฏิทิน — ขั้นสัญญาบังคับให้ลงคิวก่อน
      ถึงจะไปขั้นตามงานได้ (เกณฑ์เดียวกับป้าย "รอลงคิวหมอ" บนบอร์ด: needsDoctorBooking) */
  serviceBookings: InfluCalendarEventRow[];
  /** เมนูหัตถการที่ทีมเพิ่มเอง แยก product team (influ_services, 0080) */
  services: InfluServiceRow[];
  /** โปรไฟล์ตัวบุคคล (influ_profiles — id = person_id); เคสก่อนระบบโปรไฟล์อาจไม่มีแถว */
  personProfile: InfluProfileRow | null;
  profileChannels: InfluProfileChannelRow[];
  /** ลิงก์ไฟล์ source (Google Drive) ของเคสนี้ */
  /** รูปภาพหลายรูปของเคสนี้ (0105) — แยก kind photo/channel ในแท็บรายละเอียดเคส */
  casePhotos: InfluCasePhotoRow[];
  /** ชื่อผู้รับผิดชอบเคส (owner_id — คนที่สร้างการ์ด); null = เคสเก่าที่ยังไม่มีเจ้าของ */
  ownerName: string | null;
  /** ผู้ใช้ที่กำลังเปิดหน้านี้ — ใช้เป็น "ผู้ทำ" ของประวัติการใช้งาน (influ_activity_log) */
  userId: string | null;
  userName: string;
  doctors: DoctorRow[];
  /** แคมเปญทั้งหมด (0093) — ตัวเลือกในแท็บรายละเอียดเคส + ที่มาของแฮชแท็ก */
  campaigns: InfluCampaignDefRow[];
  /** ผู้รับผิดชอบของเคสนี้ (0095) — คนที่ได้รับแจ้งเตือนเมื่อมีความเคลื่อนไหว */
  assignees: CaseAssignee[];
  /** บัญชีทั้งหมด — ตัวเลือกตอนมอบหมายงาน */
  people: InfluPerson[];
  /** ประวัติการใช้งานล่าสุดของเคส (30 รายการ) — ไทม์ไลน์ท้าย sidebar โปรไฟล์ */
  activityLog: InfluActivityLogRow[];
  /** วันนี้ตามเวลาไทย (YYYY-MM-DD จาก server — กฎ react-hooks/purity ห้ามอ่านเวลาตอน render) */
  today: string;
  /** true = สิทธิ์ `influ` (เดินงานได้เต็ม) · false = สิทธิ์ `team` ที่เข้ามาจากแกลเลอรี
      ให้ดูอย่างเดียว — หน้านี้เปิดให้ทั้งสองสิทธิ์ตามที่ตั้งใจไว้ แต่การเดิน stage /
      อัปโหลดสัญญา-memo / เซนเอกสาร / ปิดงาน เป็นงานของ Influ Manager เท่านั้น */
  canManage: boolean;
  /** ผู้ดูแลระบบ Influencer (สิทธิ์ influ) — ทำแทนขั้นที่ผูกบทบาทได้เสมอ */
  canManageSystem?: boolean;
  /** ?view=<เลขขั้น> จากบอร์ดตอนกรอง stage — เปิดหน้ามาที่ขั้นนั้นเลยแทนภาพรวม
      (clamp ที่นี่เพราะฝั่ง client รู้ stage จริงของเคส; เกินที่เคสเดินถึง = ตกไปภาพรวม) */
  initialStage?: number | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const actor = useMemo(() => ({ id: userId, name: userName }), [userId, userName]);
  // view = "overview" (หน้าสรุป) · "detail" (รายละเอียดเคส — ไม่มีเลขขั้น แก้ได้เสมอ)
  // หรือเลข stage 1-3 — เปิดหน้ามาเจอภาพรวม เว้นแต่บอร์ดส่ง ?view= มา (ดู initialStage)
  const [view, setView] = useState<"overview" | "detail" | number>(() => {
    const max = influencer.completed ? INFLU_STAGE_LAST : influencer.stage;
    return initialStage !== null &&
      initialStage !== undefined &&
      Number.isInteger(initialStage) &&
      initialStage >= 1 &&
      initialStage <= INFLU_STAGE_LAST &&
      initialStage <= max
      ? initialStage
      : "overview";
  });
  // เมื่อ stage เลื่อนจริง (หลัง router.refresh หลังกด next) ให้พาไปหน้าของ stage ใหม่
  // แต่ตอน mount ครั้งแรกให้อยู่ที่ภาพรวมเสมอ
  const prevStageRef = useRef(influencer.stage);
  useEffect(() => {
    if (prevStageRef.current !== influencer.stage) {
      prevStageRef.current = influencer.stage;
      setView(influencer.stage);
    }
  }, [influencer.stage]);
  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");

  const maxStage = influencer.completed ? INFLU_STAGE_LAST : influencer.stage;
  const readOnly =
    !canManage ||
    influencer.completed ||
    (typeof view === "number" && view < influencer.stage);
  /** แก้ข้อมูลเคสได้หรือไม่ — ใช้กับส่วนที่ปกติแก้ได้จนกว่าจะปิดงาน (รายละเอียดเคส, ไฟล์, ชื่อ) */
  const canEdit = canManage && !influencer.completed;
  const [nameOpen, setNameOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);

  // ย้อนกลับ 1 stage — ใช้เมื่อเงื่อนไขเคสเปลี่ยน (เช่น influ ขอเปลี่ยนโปรแกรมที่รับ)
  // แล้วต้องกลับไปแก้ข้อมูล/ยื่นเอกสารรอบใหม่; ข้อมูล-ไฟล์ที่กรอกไว้แล้วไม่ถูกลบ
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackErr, setRollbackErr] = useState<string | null>(null);
  const rollbackStage = async () => {
    const target = influencer.stage - 1;
    if (target < 1) return;
    setRollbackErr(null);
    const { error } = await supabase
      .from("influencers")
      .update({
        stage: target,
        // เคสที่ปิดงานไปแล้วต้องกลับมาเป็น "กำลังดำเนินการ" ด้วย ไม่งั้นย้อนมาแล้วยังแก้อะไรไม่ได้
        // (readOnly/canEdit ทั้งหน้าผูกกับ completed) — เช่นเพิ่งรู้ว่าไฟล์สัญญาผิดฉบับหลังปิดงาน
        ...(influencer.completed ? { completed: false } : {}),
        // ถอยออกจากขั้นสัญญา+รับบริการ (4→3): ล้างวันเริ่มสัญญา —
        // จะถูกตั้งใหม่เมื่ออัพไฟล์สัญญาในขั้นนั้นอีกครั้ง
        ...(influencer.stage === INFLU_STAGE.contractService
          ? { contract_start: null }
          : {}),
      })
      .eq("id", influencer.id);
    if (error) {
      setRollbackErr(`ย้อน stage ไม่สำเร็จ: ${error.message}`);
      return;
    }
    // หน้านี้อยู่นอก InfluLogProvider (เป็นตัวที่ render provider เอง) จึงเรียก logInflu ตรงๆ
    logInflu(supabase, actor, {
      action: "stage",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `ย้อนขั้นงานจาก ${INFLU_STAGES[influencer.stage - 1]?.title ?? influencer.stage} กลับไป ${INFLU_STAGES[target - 1]?.title ?? target}${influencer.completed ? " (เปิดเคสที่ปิดงานแล้วกลับมาทำต่อ)" : ""}`,
      meta: { from: influencer.stage, to: target, reopened: influencer.completed },
    });
    // ผู้รับผิดชอบขั้นที่ถูกย้อนกลับไปคือคนที่ต้องทำงานต่อ — เขาได้ระดับ "ต้องลงมือ"
    notifyInflu(supabase, actor, {
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      assignees: notifyTargets,
      type: "stage_back",
      scope: scopeOfStage(target),
      title: `เคส ${logNameOf(influencer)} ถูกย้อนกลับไปขั้น ${
        INFLU_STAGES[target - 1]?.title ?? target
      }`,
      body: influencer.completed
        ? "เปิดเคสที่ปิดงานแล้วกลับมาทำต่อ"
        : `เดิมอยู่ขั้น ${INFLU_STAGES[influencer.stage - 1]?.title ?? influencer.stage}`,
      href: `/influencers/${influencer.id}?view=${target}`,
      meta: { from: influencer.stage, to: target },
    });
    // effect ที่เฝ้า influencer.stage จะพา view ไปหน้า stage ใหม่เองหลัง refresh
    router.refresh();
  };

  /* ---- เปิดรอบใหม่ = โมดัล "สร้างนัดใหม่" ตัวเดียวกับบอร์ด (audit 2026-09-03) ----
     เดิมมีโค้ดสร้างรอบของตัวเองที่นี่ ผลจึงไม่เท่ากับการสร้างนัดจากบอร์ด: รอบที่เปิดจากปุ่มนี้
     ไม่มีหัตถการ ไม่มีผู้รับผิดชอบ (หายจากบอร์ดของคนกดทันทีเพราะตัวกรอง "เคสของฉัน")
     ⇒ ลบทิ้ง ใช้ NewCaseModal ที่เลือกโปรไฟล์ไว้ให้แล้วแทน — ทางเดียวในการเปิดเคสใหม่
     เงื่อนไขเปิด: ผู้ดูแลแก้ได้ + รู้จักโปรไฟล์ของคนนี้ (ไม่บังคับว่ารอบเดิมต้องจบก่อน —
     ผู้ใช้ยอมรับว่ามี 2 รอบพร้อมกันได้ โมดัลเตือนให้เองตอนเลือกโปรไฟล์ที่ยังมีเคสเปิดอยู่) */
  const [newRoundOpen, setNewRoundOpen] = useState(false);
  const canStartNewRound = canManage && personProfile !== null;

  /* ---------- ผู้รับผิดชอบเคส (0095) ----------
     การ์ดบนบอร์ดแสดงคนกลุ่มนี้ (ไม่ใช่ผู้สร้างอีกต่อไป) และเป็นตัวตัดสินว่าใครได้แจ้งเตือน
     ระดับ "ต้องลงมือ" เมื่อขั้นที่ตัวเองถือมีความเคลื่อนไหว */
  const [assignedList, setAssignedList] = useState<CaseAssignee[]>(assignees);
  // sync กับ props แบบ adjust-state-during-render (ไม่ใช่ effect) ตามกติกาของระบบ —
  // ค่าใหม่จาก server ทับสำเนาฝั่งจอในรอบ render เดียว ไม่ต้อง render ซ้ำอีกรอบ
  const [assigneesBase, setAssigneesBase] = useState(assignees);
  if (assigneesBase !== assignees) {
    setAssigneesBase(assignees);
    setAssignedList(assignees);
  }
  const [assigneeBusy, setAssigneeBusy] = useState<string | null>(null);
  const [assigneeErr, setAssigneeErr] = useState<string | null>(null);
  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people]
  );
  // ไม่ห่อ useMemo — React Compiler memo ให้เอง และ assignedList เปลี่ยน identity ทุกครั้ง
  // ที่แก้อยู่แล้ว (การห่อมือทำให้ compiler ข้ามการ optimize ทั้ง component)
  const notifyTargets = assignedList.map((a) => ({
    userId: a.userId,
    scopes: a.scopes,
  }));

  const applyAssigneeChange = async (change: AssigneeChange) => {
    setAssigneeErr(null);
    setAssigneeBusy(change.userId);
    const prev = assignedList;
    const who = peopleById.get(change.userId)?.name ?? "ไม่ทราบชื่อ";
    const caseName = logNameOf(influencer);

    if (change.kind === "add") {
      setAssignedList((cur) => [
        ...cur,
        { userId: change.userId, scopes: change.scopes },
      ]);
      const { error } = await supabase.from("influ_assignees").insert({
        influencer_id: influencer.id,
        user_id: change.userId,
        scopes: change.scopes,
        created_by: userId,
      });
      if (error) {
        setAssignedList(prev);
        setAssigneeErr(`เพิ่มผู้รับผิดชอบไม่สำเร็จ: ${error.message}`);
        setAssigneeBusy(null);
        return;
      }
      logInflu(supabase, actor, {
        action: "update",
        entity: "assignee",
        entityId: influencer.id,
        influencerId: influencer.id,
        influencerName: caseName,
        summary: `เพิ่ม ${who} เป็นผู้รับผิดชอบของ ${caseName} (${roleSummary(change.scopes)})`,
        meta: { user_id: change.userId, scopes: change.scopes },
      });
      // คนที่เพิ่งถูกมอบหมายต้องรู้ทันทีเสมอ ไม่ว่าจะถือขอบเขตไหน
      notifyInflu(supabase, actor, {
        influencerId: influencer.id,
        influencerName: caseName,
        assignees: notifyTargets,
        extra: [change.userId],
        forceAction: [change.userId],
        type: "assigned",
        title: `คุณได้รับมอบหมายเคส ${caseName}`,
        body: `บทบาท: ${roleSummary(change.scopes)}`,
        meta: { user_id: change.userId, scopes: change.scopes },
      });
    } else if (change.kind === "remove") {
      setAssignedList((cur) => cur.filter((a) => a.userId !== change.userId));
      const { error } = await supabase
        .from("influ_assignees")
        .delete()
        .eq("influencer_id", influencer.id)
        .eq("user_id", change.userId);
      if (error) {
        setAssignedList(prev);
        setAssigneeErr(`ถอดผู้รับผิดชอบไม่สำเร็จ: ${error.message}`);
        setAssigneeBusy(null);
        return;
      }
      logInflu(supabase, actor, {
        action: "update",
        entity: "assignee",
        entityId: influencer.id,
        influencerId: influencer.id,
        influencerName: caseName,
        summary: `ถอด ${who} ออกจากผู้รับผิดชอบของ ${caseName}`,
        meta: { user_id: change.userId },
      });
      notifyInflu(supabase, actor, {
        influencerId: influencer.id,
        influencerName: caseName,
        // ส่งถึงคนที่เหลือ + คนที่เพิ่งถูกถอด (เขาต้องรู้ว่าไม่ต้องตามเคสนี้แล้ว)
        assignees: prev.filter((a) => a.userId !== change.userId),
        extra: [change.userId],
        type: "unassigned",
        title: `${who} ถูกถอดออกจากผู้รับผิดชอบเคส ${caseName}`,
        meta: { user_id: change.userId },
      });
    } else {
      setAssignedList((cur) =>
        cur.map((a) =>
          a.userId === change.userId ? { ...a, scopes: change.scopes } : a
        )
      );
      const { error } = await supabase
        .from("influ_assignees")
        .update({ scopes: change.scopes })
        .eq("influencer_id", influencer.id)
        .eq("user_id", change.userId);
      if (error) {
        setAssignedList(prev);
        setAssigneeErr(`บันทึกขอบเขตงานไม่สำเร็จ: ${error.message}`);
        setAssigneeBusy(null);
        return;
      }
      logInflu(supabase, actor, {
        action: "update",
        entity: "assignee",
        entityId: influencer.id,
        influencerId: influencer.id,
        influencerName: caseName,
        summary: `เปลี่ยนบทบาทของ ${who} ในเคส ${caseName} เป็น ${roleSummary(change.scopes)}`,
        meta: { user_id: change.userId, scopes: change.scopes },
      });
      notifyInflu(supabase, actor, {
        influencerId: influencer.id,
        influencerName: caseName,
        assignees: notifyTargets,
        forceAction: [change.userId],
        type: "scope_changed",
        title: `บทบาทของ ${who} ในเคส ${caseName} เปลี่ยนเป็น ${roleSummary(change.scopes)}`,
        meta: { user_id: change.userId, scopes: change.scopes },
      });
    }
    setAssigneeBusy(null);
    router.refresh();
  };

  // follow-up ที่เหลือ (checklist ขั้นตามงานที่ยังไม่ทำ) — นับเฉพาะข้อของโหมดที่ใช้อยู่
  // ตัวเลข/badge สรุปย้ายไปอยู่ในหัวเอกสาร "ภาพรวม" ทั้งหมดแล้ว (OverviewPanel คำนวณเอง
  // จาก prop นี้) — ที่นี่เหลือแค่ส่งรายการดิบต่อไปให้
  const activeTasks = useMemo(
    () => activeFollowupTasks(influencer.followup_mode, tasks),
    [influencer.followup_mode, tasks]
  );

  return (
    // ทุกจุดที่แก้ข้อมูลในหน้านี้เรียก useInfluLog() เอง — ไม่ต้องส่ง actor เป็น prop ทีละชั้น
    <InfluLogProvider
      userId={userId}
      userName={userName}
      notifyCase={{
        id: influencer.id,
        name: logNameOf(influencer),
        assignees: notifyTargets,
      }}
    >
    <div>
      {/* header + แท็บนำทาง รวมเป็นแถวเดียวกัน (ผู้ใช้ 2026-09-03: เดิมแยกเป็น 2 แถวมีช่องว่าง
          คั่นทำให้ดูเป็นคนละส่วน) — อยู่เต็มความกว้างหน้า เหนือ 2 คอลัมน์ ไม่ถูกบีบด้วย sidebar
          จึงมีที่พอให้ชื่อ+แท็บอยู่แถวเดียวกันบนจอเดสก์ท็อป (จอแคบ flex-wrap ตกบรรทัดเอง)
          ข้อมูลระบุตัวตน/สถานะ (Influ ID, Tier, สถานะงาน, ส่ง Memo แล้ว, รอปรึกษา, เช็คลิสต์,
          จำนวนคอนเทนต์) ย้ายไปรวมไว้ที่หัวเอกสาร "ภาพรวม" จุดเดียวแทน กันซ้ำซ้อนกับตรงนี้ —
          แถวนี้เหลือแค่สิ่งที่ต้องกดได้จากทุกที่ (นำทาง/ผู้รับผิดชอบ/เปิดรอบใหม่) */}
      <div className="mb-5 flex flex-wrap items-center gap-2 animate-fade-in-up">
        {/* จอเล็ก: แถวแรกกระชับ [กลับ][ชื่อ][ปุ่มแก้ชื่อ] แล้วดันแท็บลงบรรทัดถัดไป
            (w-full ในแถบ flex-wrap) — ที่ ≥sm ใช้ display:contents ให้ลูกกลับไปเป็น flex item
            ของแถบเดิมตรงๆ หน้าตาเดสก์ท็อปจึงไม่เปลี่ยนเลย */}
        <div className="flex min-w-0 items-center gap-2 max-sm:w-full sm:contents">
          <Link
            href="/influencers"
            // ทางกลับหลักของมือถือ (เมนูระบบย้ายเข้า drawer แล้ว) — เป้านิ้วต้องเต็ม 44px
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-stone-500 transition-colors hover:bg-white/60 hover:text-brand-700 max-sm:min-h-11 max-sm:px-3"
          >
            <ArrowLeft size={16} />
            รายชื่อ
          </Link>
          <h1 className="flex min-w-0 items-center gap-1.5 text-xl font-semibold text-stone-900">
            <span className="min-w-0 break-words">
              คุณ{fullName}
              {influencer.nickname && (
                <span className="text-stone-400"> ({influencer.nickname})</span>
              )}
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => setNameOpen(true)}
                title="แก้ไขชื่อ / นามสกุล / ชื่อเล่น"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-300 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90 sm:h-7 sm:w-7"
              >
                <PenLine size={15} />
              </button>
            )}
          </h1>
        </div>
        {/* ผู้รับผิดชอบ = รูปโปรไฟล์ (0095) — ชื่อผู้สร้างย้ายไปอยู่ในการ์ด "ผู้รับผิดชอบ" ข้างล่าง */}
        <AssigneeStack
          assignees={assignedList}
          peopleById={peopleById}
          size={24}
        />
        <span className="mx-1 hidden h-6 w-px shrink-0 bg-stone-200 sm:block" />
        {/* แท็บนำทาง — ภาพรวม / รายละเอียดเคส / ขั้นตอนงาน */}
        <button
          type="button"
          onClick={() => setView("overview")}
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.97] max-sm:min-h-11 ${
            view === "overview"
              ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
              : "border border-stone-200 bg-white/60 text-stone-600 hover:bg-white"
          }`}
        >
          <LayoutList size={15} />
          ภาพรวม
        </button>
        {/* รายละเอียดเคส = แท็บไม่มีเลขขั้น (0086): เป็นข้อมูลเคสไม่ใช่สถานะงาน
            เปิดแก้ได้เสมอจนกว่าจะปิดงาน จึงไม่อยู่ในเส้น stage อีกต่อไป */}
        <button
          type="button"
          onClick={() => setView("detail")}
          title="ข้อมูลเคส (โปรแกรมที่รับ / ยอดผู้ติดตาม / วัน-แพทย์ / ค่าตัว) — แก้ได้เสมอจนกว่าจะปิดงาน"
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.97] max-sm:min-h-11 ${
            view === "detail"
              ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
              : "border border-stone-200 bg-white/60 text-stone-600 hover:bg-white"
          }`}
        >
          <ClipboardList size={15} />
          {/* จอเล็กใช้ชื่อสั้นให้แถบขั้นเหลือ 1-2 แถว (ที่ ≥sm คำเต็มเหมือนเดิม) */}
          <span className="sm:hidden">รายละเอียด</span>
          <span className="max-sm:hidden">รายละเอียดเคส</span>
        </button>
        {INFLU_STAGES.map((s) => {
          const passed = influencer.completed || influencer.stage > s.step;
          const current = !influencer.completed && influencer.stage === s.step;
          const clickable = s.step <= maxStage;
          return (
            <button
              key={s.step}
              type="button"
              disabled={!clickable}
              onClick={() => setView(s.step)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 max-sm:min-h-11 ${
                clickable ? "cursor-pointer active:scale-[0.97]" : "cursor-not-allowed opacity-50"
              } ${
                view === s.step
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
                  : passed
                    ? "border border-emerald-200 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100"
                    : current
                      ? "border border-brand-300 bg-white/80 text-brand-700"
                      : "border border-stone-200 bg-white/50 text-stone-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  view === s.step
                    ? "bg-white/25"
                    : passed
                      ? "bg-emerald-500 text-white"
                      : "bg-stone-200 text-stone-500"
                }`}
              >
                {passed ? <Check size={12} strokeWidth={3} /> : s.step}
              </span>
              {/* จอเล็กใช้ชื่อขั้นแบบสั้น (field `short` ของ INFLU_STAGES) — ชื่อเต็ม
                  "เซนสัญญา + วันรับบริการ" ทำให้แถบขั้นล้นเป็นหลายแถวที่ 375px */}
              <span className="sm:hidden">{s.short}</span>
              <span className="max-sm:hidden">{s.title}</span>
            </button>
          );
        })}
        {/* ย้อนกลับ 1 ขั้น — เคสขอเปลี่ยนโปรแกรม/เงื่อนไข หรือเอกสารขั้นก่อนหน้าผิด ต้องกลับไปทำใหม่
            เปิดให้เคสที่ปิดงานแล้วด้วย (ย้อนแล้วเคสกลับมาเป็น "กำลังดำเนินการ") — ไม่งั้นพอปิดงาน
            แล้วเจอว่าไฟล์สัญญาผิดฉบับ จะไม่เหลือทางแก้เลย
            พื้นต่ำสุด = Stage 1 Memo (0086): ขั้นติดต่อย้ายไปบอร์ด Hunting และรายละเอียดเคส
            กลายเป็นแท็บที่แก้ได้เสมอ — ไม่มีขั้นก่อน Memo ให้ถอยไปอีกแล้ว */}
        {canManage && influencer.stage > INFLU_STAGE.memo && (
          <button
            type="button"
            onClick={() => setRollbackOpen(true)}
            title={`ย้อนจาก Stage ${influencer.stage} กลับไป Stage ${influencer.stage - 1} — ใช้เมื่อต้องกลับไปแก้ข้อมูล/เอกสารของขั้นก่อนหน้า${
              influencer.completed ? " (เคสจะกลับมาเป็นกำลังดำเนินการ)" : ""
            }`}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50/70 px-3.5 py-2 text-xs font-medium text-amber-700 transition-all hover:border-amber-400 hover:bg-amber-100 active:scale-[0.97] max-sm:min-h-11"
          >
            <Undo2 size={13} />
            ย้อน Stage {influencer.stage} → {influencer.stage - 1}
          </button>
        )}
        {/* เปิดรอบใหม่ — influ คนเดิมกลับมาทำอีกครั้ง ต้องออก Memo ใหม่ + การ์ดใหม่ */}
        {canStartNewRound && (
          <button
            type="button"
            onClick={() => setNewRoundOpen(true)}
            title="influ คนนี้กลับมาทำอีกรอบ — เปิดโมดัลสร้างนัดโดยเลือกโปรไฟล์คนนี้ไว้ให้แล้ว (รอบเดิมไม่ถูกแตะ)"
            className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-brand-700 transition-all hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97] max-sm:min-h-11"
          >
            <Repeat size={14} />
            เปิดรอบใหม่
          </button>
        )}
      </div>

      {/* เริ่มนับสัญญาไปแล้วแต่ไม่มีไฟล์สัญญาในระบบ (ถูกลบเพราะอัพผิดฉบับ / เคสเก่าที่ข้ามมา)
          — เตือนให้ชัดพร้อมทางแก้ ไม่งั้นเคสไปโผล่หน้า Follow Up โดยไม่มีสัญญาแบบเงียบๆ */}
      {canManage &&
        !influencer.contract_file_path &&
        influencer.contract_start !== null && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 animate-fade-in">
            <AlertTriangle size={16} className="shrink-0 text-amber-600" />
            <p className="min-w-0 flex-1 text-xs leading-5 text-amber-800">
              เคสนี้เริ่มนับสัญญาแล้ว แต่<b>ยังไม่มีไฟล์สัญญา</b>ในระบบ —
              อัพไฟล์ฉบับที่ถูกต้องได้เลยที่ขั้นสัญญา
            </p>
            <Button
              variant="secondary"
              onClick={() => setView(INFLU_STAGE.contractService)}
              className="!px-3 !py-1.5 !text-xs"
            >
              <FileSignature size={13} />
              ไปขั้นสัญญา
            </Button>
          </div>
        )}
      {rollbackErr && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
          {rollbackErr}
        </p>
      )}

      {/* 2 คอลัมน์บนจอ ≥lg: sidebar โปรไฟล์ซ้าย (sticky ติดตามตอนเลื่อน) + เนื้อหางานขวา
          จอเล็ก sidebar ตกไปต่อท้าย (order-last) — งานที่ต้องลงมือทำยังอยู่บนสุด
          wrapper อยู่นอก key={view} โดยตั้งใจ ให้ sidebar คงอยู่ตอนสลับแท็บ ไม่ re-mount */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        {/* aside ยืดเต็มความสูงแถว (lg:items-stretch ของ parent) ให้พื้นหลัง glass กลืนกับ
            คอลัมน์เนื้อหาขวา ไม่เห็นเป็นกล่องสั้นๆ ลอยเหนือช่องว่างเปล่าด้านล่าง (ผู้ใช้ 2026-09-03)
            — ตัวเนื้อหาจริง (ProfileSidebar) อยู่ใน div sticky ชั้นในซึ่งลอยติดขอบบนระหว่างเลื่อน
            หน้า ไม่ใช่ตัว aside เอง (ห้ามรวมเป็นชั้นเดียว — max-h ของกล่องที่ถูกยืดจะไปตัด
            "รางเลื่อน" ของ sticky ให้สั้นแค่ 1 จอ แล้วหลุดสติกกี้เร็วเกินไป) */}
        <aside className="glass order-last w-full shrink-0 rounded-xl shadow-[0_8px_28px_rgba(94,58,49,0.08)] transition-shadow duration-300 hover:shadow-[0_12px_36px_rgba(94,58,49,0.14)] lg:order-first lg:w-80">
          <div className="lg:sticky lg:top-0 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
            <ProfileSidebar
              influencer={influencer}
              fullName={fullName}
              assignees={assignedList}
              peopleById={peopleById}
              activityLog={activityLog}
              today={today}
            />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
      <div className="animate-fade-in" key={String(view)}>
        {view === "overview" && (
          <OverviewPanel
            influencer={influencer}
            personRounds={personRounds}
            followupTasks={activeTasks}
            contentTasks={contentTasks}
            procedureItems={procedureItems}
            personProfile={personProfile}
            profileChannels={profileChannels}
            onEditProfile={
              canManage && personProfile
                ? () => setProfileEditOpen(true)
                : null
            }
            doctors={doctors}
            campaigns={campaigns}
            canManage={canManage}
            onGoStage={(step) => setView(step)}
            assignees={assignedList}
            people={people}
            peopleById={peopleById}
            canEditAssignees={canEdit}
            assigneeBusy={assigneeBusy}
            assigneeErr={assigneeErr}
            onAssigneeChange={(c) => void applyAssigneeChange(c)}
            ownerName={ownerName}
          />
        )}
        {view === "detail" && (
          // รายละเอียดเคสแก้ได้เสมอจนกว่าจะปิดงาน (ไม่ใช้ readOnly รวมที่ล็อก stage ที่ผ่านแล้ว) —
          // เป็นข้อมูลเคสไม่ใช่สถานะงาน มักต้องกลับมาเติมวัน/แพทย์/มูลค่าทีหลัง
          <CaseDetailStage
            influencer={influencer}
            initialItems={procedureItems}
            priceCatalog={priceCatalog}
            promoCatalog={promoCatalog}
            services={services}
            doctors={doctors}
            campaigns={campaigns}
            casePhotos={casePhotos}
            readOnly={!canEdit}
          />
        )}
        {view === INFLU_STAGE.memo && (
          // ไฟล์ Memo แก้ได้ (เปลี่ยนไฟล์) จนกว่าเคสจะปิดงาน แม้ stage นี้ผ่านไปแล้ว —
          // เป็นเอกสารของเคส ไม่ใช่สถานะงาน; ส่วนปุ่มเดิน stage ยังล็อกด้วย readOnly ตามเดิม
          <MemoStage
            influencer={influencer}
            userName={userName}
            readOnly={readOnly}
            fileEditable={canEdit}
            canManageSystem={canManageSystem}
            userId={userId}
            assignees={assignedList}
            people={people}
            peopleById={peopleById}
            busyUserId={assigneeBusy}
            onAssigneeChange={(c) => void applyAssigneeChange(c)}
            procedureItems={procedureItems}
          />
        )}
        {view === INFLU_STAGE.contractService && (
          // ขั้นรวม: เซนสัญญา + วันเข้ารับบริการ เป็นงานวันเดียวกัน (ผู้ใช้ 2026-08-07)
          // — สัญญาอยู่บน, หัตถการหน้างาน + ปุ่มไปขั้นตามงานอยู่ล่าง
          <div className="space-y-6">
            <ContractStage
              influencer={influencer}
              readOnly={readOnly}
              // ไฟล์สัญญาแก้/ลบได้จนกว่าเคสจะปิดงาน แม้ stage นี้ผ่านไปแล้ว
              // (กติกาเดียวกับไฟล์ Memo) — ปุ่มเดิน stage ยังล็อกด้วย readOnly ตามเดิม
              fileEditable={canEdit}
            />
            <ServiceDayStage
              influencer={influencer}
              readOnly={readOnly}
              bookings={serviceBookings}
              doctors={doctors}
              userId={userId}
              procedureItems={procedureItems}
              catalog={priceCatalog}
              promos={promoCatalog}
              services={services}
              // ลงคิวเข้าปฏิทินได้ตราบที่เคสยังไม่ปิดงาน (เป็นข้อมูลเคส ไม่ใช่การเดิน stage)
              canBook={canEdit}
            />
          </div>
        )}
      </div>

        </div>
      </div>

      {nameOpen && (
        <NameEditModal
          influencer={influencer}
          onClose={() => setNameOpen(false)}
        />
      )}

      {/* แก้โปรไฟล์ตัวบุคคล + ช่องทางติดต่อ (0080) — บันทึกแล้ว sync ชื่อ/เบอร์ให้ทุกรอบ */}
      {personProfile && (
        <ProfileFormModal
          open={profileEditOpen}
          onClose={() => setProfileEditOpen(false)}
          profile={personProfile}
          channels={profileChannels}
          actor={actor}
          onSaved={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={rollbackOpen}
        title={`ย้อนกลับไป Stage ${influencer.stage - 1}?`}
        message={
          <>
            เคสจะถอยจาก Stage {influencer.stage} กลับไป Stage{" "}
            {influencer.stage - 1} — ใช้เมื่อเงื่อนไขเปลี่ยน เช่น influ
            ขอเปลี่ยนโปรแกรมที่รับ แล้วต้องแก้ข้อมูล/ยื่นเอกสารขออนุมัติรอบใหม่
            <br />
            ข้อมูลและไฟล์ที่กรอกไว้แล้วไม่ถูกลบ — กลับมาแก้แล้วเดินหน้าต่อได้เลย
            {influencer.completed && (
              <>
                <br />
                <span className="text-amber-700">
                  เคสนี้ปิดงานแล้ว — การย้อน stage จะเปิดเคสกลับมาเป็น
                  &quot;กำลังดำเนินการ&quot; (ปิดงานใหม่ได้เมื่อทำครบ)
                </span>
              </>
            )}
            {influencer.stage === INFLU_STAGE.contractService && (
              <>
                <br />
                <span className="text-amber-700">
                  วันเริ่มสัญญาจะถูกล้าง และตั้งใหม่เมื่ออัพไฟล์สัญญาอีกครั้ง —
                  เคสจะหายจากหน้า Follow Up และต้นทุนกลับไปนับเป็น
                  &quot;กำลังจะมา&quot; จนกว่าจะอัพสัญญาใหม่
                </span>
              </>
            )}
          </>
        }
        confirmLabel="ย้อน Stage"
        confirmVariant="primary"
        onConfirm={() => void rollbackStage()}
        onClose={() => setRollbackOpen(false)}
      />

      {/* เปิดรอบใหม่ = โมดัลเดียวกับบอร์ด (เลือกโปรไฟล์คนนี้ไว้ให้แล้ว)
          key = remount ทุกครั้งที่เปิด เพราะ NewCaseModal อ่าน initialProfile ตอน mount */}
      {personProfile && (
        <NewCaseModal
          key={newRoundOpen ? "round-open" : "round-closed"}
          open={newRoundOpen}
          onClose={() => setNewRoundOpen(false)}
          profiles={[personProfile]}
          initialProfile={personProfile}
          copyFrom={{
            photo_path: influencer.photo_path,
            channel_photo_path: influencer.channel_photo_path,
          }}
          openRoundsByPerson={
            new Map([
              [
                influencer.person_id,
                personRounds
                  .filter((r) => !r.completed && r.declined_at === null)
                  .map((r) => r.round_no),
              ],
            ])
          }
          services={services}
          priceCatalog={priceCatalog}
          promoCatalog={promoCatalog}
          doctors={doctors}
          campaigns={campaigns}
          people={people}
          me={{ id: userId, name: userName }}
          actor={actor}
        />
      )}
    </div>
    </InfluLogProvider>
  );
}

/* ============ ภาพรวม (overview) — สรุปข้อมูลที่กรอกแล้ว + ความคืบหน้า stage ============ */

/** ช่องแสดงข้อมูล 1 คู่ (หัวข้อ + ค่า) — ค่าว่างแสดงขีด */
function Field({ label, value }: { label: string; value: ReactNode }) {
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value));
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd className="text-sm text-stone-800">
        {empty ? <span className="text-stone-300">—</span> : value}
      </dd>
    </div>
  );
}

function OverviewPhoto({ path }: { path: string }) {
  const { url, failed } = useSignedUrl(path);
  if (failed) return null;
  if (!url)
    return <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-stone-100" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="รูป influencer"
      className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-sm"
    />
  );
}

/**
 * แฮชแท็กบังคับของเคส (0093) — ชุดที่ influ ต้องติดในโพสทุกครั้ง
 *
 * แสดงทั้งแท็กที่พร้อมใช้และแท็กที่ยังขาดข้อมูล (พร้อมบอกว่าต้องไปเติมที่ไหน)
 * ปุ่มคัดลอกส่งเฉพาะแท็กที่พร้อมแล้ว — ทีมส่งข้อความให้ influ ได้เลยโดยไม่ต้องพิมพ์เอง
 * (พิมพ์เองเสี่ยงพิมพ์ผิด แล้วโพสนั้นจะ track ไม่เจอ)
 */
function HashtagBlock({ tags }: { tags: CaseHashtag[] }) {
  const [copied, setCopied] = useState(false);
  const ready = tags.filter((t) => t.tag !== null);
  const missing = tags.filter((t) => t.tag === null);
  const text = hashtagText(tags);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {ready.map((t) => (
          <span
            key={`${t.key}-${t.tag}`}
            title={t.source ? `${t.label}: ${t.source}` : t.label}
            // แท็กเป็นคำเดียวยาวๆ (ชื่อแคมเปญ/ชื่อ influ ต่อกัน) — ต้อง break ได้ไม่งั้นดันจอที่ 375px
            className="min-w-0 break-words rounded-lg bg-brand-50 px-2.5 py-1 font-mono text-sm font-semibold text-brand-700 ring-1 ring-brand-100"
          >
            {t.tag}
          </span>
        ))}
        {ready.length > 0 && (
          <Button
            variant="secondary"
            className="ml-auto shrink-0 !py-1.5 text-xs"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "คัดลอกแล้ว" : "คัดลอกแฮชแท็ก"}
          </Button>
        )}
      </div>

      {missing.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
          {missing.map((t) => (
            <li
              key={`miss-${t.key}`}
              className="flex items-start gap-2 text-xs leading-5 text-amber-800"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                ยังไม่มีแท็ก<span className="font-semibold">{t.label}</span>
                {t.missingHint ? ` — ${t.missingHint}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}

/** section ของเอกสารภาพรวมแนว A4 — เส้นคั่นบน + หัวข้อ (+ปุ่ม action ชิดขวา) ใช้ซ้ำทุกหมวด */
function DocSection({
  icon,
  title,
  action,
  children,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-stone-200/60 px-5 py-5 sm:px-8">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function OverviewPanel({
  influencer,
  personRounds,
  followupTasks,
  contentTasks,
  procedureItems,
  personProfile,
  profileChannels,
  onEditProfile,
  doctors,
  campaigns,
  canManage,
  onGoStage,
  assignees,
  people,
  peopleById,
  canEditAssignees,
  assigneeBusy,
  assigneeErr,
  onAssigneeChange,
  ownerName,
}: {
  influencer: InfluencerRow;
  /** รอบงานทั้งหมดของคนเดียวกัน — โชว์เป็นแถบสลับรอบท้ายหัวเอกสาร (ผู้ใช้ 2026-09-02:
      ย้ายจากเดิมที่อยู่บนหัวหน้าเคสมาไว้ในการ์ดภาพรวมแทน) */
  personRounds: InfluRoundLite[];
  followupTasks: InfluTaskRow[];
  contentTasks: TaskWithAssignee[];
  procedureItems: ProcedureItemWithPromo[];
  /** โปรไฟล์ตัวบุคคล + ช่องทางติดต่อ (0080) — ใช้ร่วมกันทุกรอบของคนนี้ */
  personProfile: InfluProfileRow | null;
  profileChannels: InfluProfileChannelRow[];
  /** null = ไม่มีสิทธิ์แก้ (team/Viewer) หรือเคสเก่าที่ยังไม่มีโปรไฟล์ */
  onEditProfile: (() => void) | null;
  doctors: DoctorRow[];
  /** แคมเปญทั้งหมด (0093) — หาแท็กของแคมเปญที่เคสนี้สังกัด */
  campaigns: InfluCampaignDefRow[];
  /** false = สิทธิ์ team ที่เข้ามาดูจากแกลเลอรี — ซ่อนปุ่มแก้ไขทั้งหมด */
  canManage: boolean;
  onGoStage: (step: number) => void;
  /* ผู้รับผิดชอบเคส (0095) — อยู่ท้ายเอกสารแทนการ์ดแยก (ผู้ใช้ 2026-09-01) */
  assignees: CaseAssignee[];
  people: InfluPerson[];
  peopleById: Map<string, InfluPerson>;
  canEditAssignees: boolean;
  assigneeBusy: string | null;
  assigneeErr: string | null;
  onAssigneeChange: (change: AssigneeChange) => void;
  /** ชื่อคนสร้างการ์ด (owner_id) — คนละเรื่องกับผู้รับผิดชอบ */
  ownerName: string | null;
}) {
  const [caseInfoOpen, setCaseInfoOpen] = useState(false);
  // ต้นทุนค่าบริการ (Influencer Cost) — รายการ support ของแบรนด์นับเป็น 0
  const costTotal = procedureItems.reduce(
    (s, i) => s + itemEffectiveCost(i),
    0
  );
  const costSaved = procedureItems.reduce(
    (s, i) => s + (i.is_supported ? Number(i.price) || 0 : 0),
    0
  );
  const fullName =
    [influencer.first_name, influencer.last_name].filter(Boolean).join(" ") ||
    null;
  const tier = influencer.tier ? INFLU_TIERS[influencer.tier] : null;
  // ขั้นย่อยของ Memo — มีความหมายเฉพาะตอนยังอยู่ stage นี้ (เช็ค stage ก่อนเรียกเสมอ
  // ตามกติกาของ memoStepOf — เคสที่เลยไปแล้วค่าที่ได้ไม่มีความหมาย)
  const memoSubStep =
    influencer.stage === INFLU_STAGE.memo && !influencer.completed
      ? memoStepOf(influencer)
      : null;
  const followupLeft = followupTasks.filter((t) => !t.done).length;
  const followupTotal = followupTasks.length;
  const contractEnd =
    influencer.contract_start && influencer.contract_months
      ? contractEndDate(influencer.contract_start, influencer.contract_months)
      : null;
  const maxStage = influencer.completed ? INFLU_STAGE_LAST : influencer.stage;

  // แฮชแท็กบังคับของเคส (0093) — ประกอบจากรหัสเคส · เลขใบ ปว. ของหมอ (จับคู่ด้วยชื่อ
  // เพราะ doctor_name เป็น text ไม่มี FK) · แท็กแคมเปญ · ทีมสินค้า + โปรของหัตถการ
  const campaign = influencer.campaign_id
    ? (campaigns.find((c) => c.id === influencer.campaign_id) ?? null)
    : null;
  const hashtags = caseHashtags({
    influCode: influencer.influ_code,
    doctorName: influencer.doctor_name,
    doctorLicense: influencer.doctor_name
      ? (doctors.find((d) => d.name === influencer.doctor_name)?.license_no ??
        null)
      : null,
    campaignTag: campaign?.tag ?? null,
    campaignName: campaign?.name ?? null,
    teams: procedureItems.map((i) => i.product_team),
    promoSkus: procedureItems
      .map((i) => i.promo?.sku)
      .filter((s): s is string => Boolean(s)),
  });

  return (
    <div className="space-y-5">
      {/* เอกสารแนวตั้งใบเดียวแบบ A4 (ผู้ใช้ 2026-08-27 — เดิมแยก 4+ การ์ดอ่านยาก):
          หัวเอกสาร = ตัวตน + สถานะรวม แล้วไล่หมวดลงมาด้วยเส้นคั่น (DocSection) */}
      <Card className="mx-auto w-full max-w-3xl overflow-hidden p-0">
        {/* หัวเอกสาร: รูป + ชื่อ + Tier + สถานะรวม */}
        <div className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-8 sm:py-6">
          {influencer.photo_path && (
            <OverviewPhoto path={influencer.photo_path} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-stone-900">
                {influencer.nickname || fullName || "—"}
              </h2>
              {tier && <Badge className={tier.badge}>{tier.label}</Badge>}
              {influencer.influ_code && (
                <span
                  title="รหัส Influ ID"
                  className="rounded-md border border-stone-200 bg-white/70 px-2 py-0.5 font-mono text-xs text-stone-500"
                >
                  {influencer.influ_code}
                </span>
              )}
            </div>
            {influencer.nickname && fullName && (
              <p className="text-sm text-stone-500">{fullName}</p>
            )}
            <p className="mt-1 text-xs text-stone-400">
              {influencer.completed
                ? "จบงานแล้ว"
                : `กำลังอยู่ขั้นที่ ${influencer.stage} จาก ${INFLU_STAGES.length}`}
              {influencer.followers != null && (
                <> · ผู้ติดตาม {formatNumber(influencer.followers)}</>
              )}
              {influencer.updated_at && (
                <> · อัปเดตล่าสุด {formatDateTime(influencer.updated_at)}</>
              )}
            </p>
            {/* สถานะเสริม — ย้ายมารวมจากหัวหน้าเคส (ผู้ใช้ 2026-09-03: กันซ้ำซ้อนกับด้านบน
                ให้ "ภาพรวม" เป็นที่เดียวที่บอกสถานะพวกนี้)
                ⚠️ docs_sent_at / memo_submitted_at คนละเหตุการณ์ (0104) ห้ามยุบเป็นป้ายเดียว:
                  docs_sent_at      = ผู้ดูแลยื่นเรื่องขอ Memo (ขั้น 1 → 1.1)
                  memo_submitted_at = ผู้ออก Memo ทำเอกสารส่งขออนุมัติแล้ว (ขั้น 1.1 → 1.2)
                ก่อนแก้ 2026-09-03 ป้ายนี้อ่าน docs_sent_at แต่เขียนว่า "ส่ง Memo แล้ว"
                (คำของความหมายเก่าก่อน 0104) ทำให้เคสที่เพิ่งยื่นเรื่องดูเหมือนส่งขออนุมัติไปแล้ว */}
            {(influencer.docs_sent_at ||
              (influencer.consult_only && !influencer.procedure_text) ||
              (influencer.contract_start !== null &&
                !influencer.completed &&
                followupTotal > 0) ||
              contentTasks.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* ป้ายคู่นี้มีความหมายเฉพาะตอนยังอยู่ขั้น Memo — เคสที่เดินผ่านไปแล้ว
                    StageTracker บอกอยู่แล้ว ปล่อยไว้จะเป็นสัญญาณค้างตลอดกาล (0111) */}
                {memoSubStep !== null && influencer.memo_submitted_at ? (
                  <span
                    title={`ผู้ออก Memo ทำเอกสารส่งขออนุมัติแล้วเมื่อ ${formatDateTime(
                      influencer.memo_submitted_at
                    )}`}
                  >
                    <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                      <CheckCircle2 size={12} /> ส่ง Memo ขออนุมัติแล้ว
                    </Badge>
                  </span>
                ) : (
                  memoSubStep !== null &&
                  influencer.docs_sent_at && (
                    <span
                      title={`ยื่นเรื่องขอ Memo แล้วเมื่อ ${formatDateTime(
                        influencer.docs_sent_at
                      )} — รอผู้ออก Memo ทำเอกสาร`}
                    >
                      <Badge className="border border-stone-200 bg-stone-50 text-stone-600">
                        <CheckCircle2 size={12} /> ส่งเรื่องขอ Memo แล้ว
                      </Badge>
                    </span>
                  )
                )}
                {influencer.consult_only && !influencer.procedure_text && (
                  <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                    <MessageCircleQuestion size={12} /> รอปรึกษา
                  </Badge>
                )}
                {influencer.contract_start !== null &&
                  !influencer.completed &&
                  followupTotal > 0 && (
                    <Link href="/influencers/contracts" title="ไปหน้า Follow Up">
                      {followupLeft > 0 ? (
                        <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                          <ListChecks size={12} /> เช็คลิสต์เหลือ {followupLeft}/
                          {followupTotal} ข้อ
                        </Badge>
                      ) : (
                        <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                          <CheckCircle2 size={12} /> เช็คลิสต์ครบทุกข้อ
                        </Badge>
                      )}
                    </Link>
                  )}
                {contentTasks.length > 0 && (
                  <Badge className="border border-brand-200 bg-brand-50 text-brand-700">
                    <ClipboardList size={12} /> คอนเทนต์ {contentTasks.length} งาน
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* รอบงานของคนนี้ — ย้ายมาจากหัวหน้าเคส (ผู้ใช้ 2026-09-02: ให้อยู่ในการ์ดภาพรวมแทน
            แต่ละชิปไม่บอก "ขั้น N/M" อีกต่อไป ใช้ชื่อขั้นจริง + ไฮไลต์รอบที่เปิดอยู่ตอนนี้ชัดๆ) */}
        {personRounds.length > 1 && (
          <DocSection
            icon={<Repeat size={15} className="text-brand-600" />}
            title={`รอบงานของคนนี้ (${personRounds.length} รอบ)`}
          >
            <ul className="flex flex-wrap gap-2">
              {personRounds.map((r) => {
                const current = r.id === influencer.id;
                const label = `รอบ ${r.round_no} · ${roundStatusLabel(r)}`;
                return (
                  <li key={r.id}>
                    {current ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-3.5 py-1.5 text-xs font-medium text-cream shadow-sm max-sm:min-h-11">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cream" />
                        {label} · กำลังดูอยู่
                      </span>
                    ) : (
                      <Link
                        href={`/influencers/${r.id}`}
                        title={
                          r.service_date
                            ? `เข้ารับบริการ ${formatDate(r.service_date)}`
                            : undefined
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 max-sm:min-h-11"
                      >
                        {label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </DocSection>
        )}

        {/* แฮชแท็กบังคับ (0093) — ชุดที่ influ ต้องติดในโพส ทีมกดคัดลอกส่งให้ได้ทันที
            วางไว้บนสุดเพราะเป็นสิ่งที่ต้องส่งให้ influ ทุกเคส ไม่ใช่ข้อมูลอ้างอิงท้ายเอกสาร */}
        <DocSection
          icon={<Hash size={15} className="text-brand-600" />}
          title="แฮชแท็กที่ต้องติดในโพส"
        >
          <HashtagBlock tags={hashtags} />
        </DocSection>

        {/* ความคืบหน้า stage — กดขั้นที่เดินถึงแล้วเพื่อเปิดหน้าขั้นนั้น */}
        <DocSection
          icon={<ListChecks size={15} className="text-brand-600" />}
          title="ความคืบหน้าตามขั้นตอน"
        >
          <ol className="grid gap-2 sm:grid-cols-3">
          {INFLU_STAGES.map((s) => {
            const passed = influencer.completed || influencer.stage > s.step;
            const current = !influencer.completed && influencer.stage === s.step;
            const clickable = s.step <= maxStage;
            return (
              <li key={s.step}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onGoStage(s.step)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    clickable
                      ? "cursor-pointer hover:bg-white"
                      : "cursor-not-allowed opacity-60"
                  } ${
                    current
                      ? "border-brand-300 bg-brand-50/60"
                      : passed
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-stone-200 bg-white/50"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      passed
                        ? "bg-emerald-500 text-white"
                        : current
                          ? "bg-brand-500 text-cream"
                          : "bg-stone-200 text-stone-500"
                    }`}
                  >
                    {passed ? <Check size={13} strokeWidth={3} /> : s.step}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-800">
                      {s.title}
                    </span>
                    <span
                      className={`text-xs ${
                        passed
                          ? "text-emerald-600"
                          : current
                            ? "text-brand-600"
                            : "text-stone-400"
                      }`}
                    >
                      {passed ? "ผ่านแล้ว" : current ? "กำลังทำ" : "ยังไม่ถึง"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        </DocSection>

        {/* ข้อมูลตัวบุคคล — ชื่อ/Tier/ผู้ติดตามขึ้นหัวเอกสารแล้ว เหลือช่องที่ยังไม่ได้โชว์ */}
        <DocSection
          icon={<UserRound size={15} className="text-brand-600" />}
          title="ข้อมูล Influencer"
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 min-[420px]:grid-cols-2">
            <Field label="ชื่อเล่น" value={influencer.nickname} />
            <Field label="ชื่อ-นามสกุล" value={fullName} />
            <Field label="เบอร์โทร" value={influencer.phone} />
            <Field label="อาชีพ" value={influencer.occupation} />
            {/* ระดับกำหนดเพดานงบที่ขออนุมัติได้ (0114) — ต้องเห็นตั้งแต่หน้าสรุป */}
            <Field
              label="ระดับ (Tier)"
              value={
                influencer.tier ? (
                  <span>
                    {INFLU_TIERS[influencer.tier].label}{" "}
                    <span className="text-xs text-stone-400">
                      ({INFLU_TIERS[influencer.tier].range} · เพดานงบ{" "}
                      {formatCurrency(INFLU_BUDGET_CAPS[influencer.tier].cap)})
                    </span>
                  </span>
                ) : null
              }
            />
            <Field label="ช่องทาง/หมายเหตุผู้ติดตาม" value={influencer.follower_note} />
            <Field label="ผู้ดูแล (ผู้จัดทำ)" value={influencer.maker_name} />
          </dl>
        </DocSection>

        <DocSection
          icon={<ClipboardList size={15} className="text-brand-600" />}
          title="รายละเอียดเคส"
          action={
            canManage &&
            !influencer.completed && (
              <button
                type="button"
                onClick={() => setCaseInfoOpen(true)}
                title="แก้ไขวันเข้ารับบริการ / แพทย์ที่รับเคส / ช่องทางการติดต่อ"
                className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-stone-400 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90 max-sm:min-h-11"
              >
                <PenLine size={13} />
                แก้ข้อมูลนัด
              </button>
            )
          }
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 min-[420px]:grid-cols-2">
            <Field
              label="หัตถการที่รับ"
              value={
                influencer.procedure_text ||
                (influencer.consult_only ? "รอปรึกษาแพทย์ (ยังไม่ระบุ)" : null)
              }
            />
            <Field
              label="วงเงิน (Voucher)"
              value={voucherLabelOf(influencer)}
            />
            <Field
              label="มูลค่าเคสรวม"
              value={
                influencer.case_value != null
                  ? formatCurrency(influencer.case_value)
                  : null
              }
            />
            <Field
              label="ค่าตัว"
              value={
                influencer.talent_fee != null
                  ? formatCurrency(influencer.talent_fee)
                  : null
              }
            />
            <Field
              label="วันเข้ารับบริการ"
              value={
                influencer.service_date
                  ? formatDate(influencer.service_date)
                  : null
              }
            />
            <Field
              label="แพทย์ที่รับเคส"
              value={
                influencer.doctor_name ? (
                  <DoctorNameChip
                    name={influencer.doctor_name}
                    doctors={doctors}
                  />
                ) : null
              }
            />
            {/* ช่องทางคุยงานของรอบนี้ (ชื่อกลุ่มไลน์) — คนละชุดกับการ์ด
                "ช่องทางการติดต่อ (โปรไฟล์)" ที่เป็น IG/TikTok ระดับตัวบุคคล */}
            <Field
              label="ช่องทางการติดต่อ"
              value={influencer.contact_channel}
            />
            <Field
              label="ต้นทุนค่าบริการ (Cost)"
              value={
                procedureItems.length > 0 ? (
                  <span>
                    {formatCurrency(costTotal)}{" "}
                    <span className="text-xs text-stone-400">
                      · {procedureItems.length} รายการ
                    </span>
                    {costSaved > 0 && (
                      <span className="text-xs text-pink-600">
                        {" "}
                        · Support ประหยัด {formatCurrency(costSaved)}
                      </span>
                    )}
                  </span>
                ) : null
              }
            />
          </dl>
          {influencer.procedure_history.length > 0 && (
            <p className="mt-3 text-xs text-stone-400">
              มีการแก้ไขหัตถการหน้างาน {influencer.procedure_history.length} ครั้ง
              (ดูใน &quot;วันเข้ารับบริการ&quot;)
            </p>
          )}
        </DocSection>

        <DocSection
          icon={<FileSignature size={15} className="text-brand-600" />}
          title="เอกสาร & สัญญา"
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 min-[420px]:grid-cols-2">
            <Field
              label="Memo ขออนุมัติ"
              value={
                influencer.memo_file_path ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <Check size={13} /> อัปโหลดแล้ว
                  </span>
                ) : (
                  "ยังไม่มี"
                )
              }
            />
            <Field
              label="สัญญาที่เซนแล้ว"
              value={
                influencer.contract_file_path ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <Check size={13} /> อัปโหลดแล้ว
                  </span>
                ) : (
                  "ยังไม่มี"
                )
              }
            />
            <Field
              label="เริ่มสัญญา"
              value={
                influencer.contract_start
                  ? formatDate(influencer.contract_start)
                  : null
              }
            />
            <Field
              label="ครบกำหนดสัญญา"
              value={
                contractEnd
                  ? `${formatDate(contractEnd)} (${influencer.contract_months} เดือน)`
                  : null
              }
            />
          </dl>
        </DocSection>

        {/* สถานะรวม/อัปเดตล่าสุดขึ้นหัวเอกสารแล้ว — หมวดนี้เหลือเฉพาะตัวเลขติดตามงาน */}
        <DocSection
          icon={<CheckCircle2 size={15} className="text-brand-600" />}
          title="การติดตามงาน"
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 min-[420px]:grid-cols-2">
            <Field
              label="Follow-up (ขั้นตามงาน)"
              value={
                followupTotal > 0
                  ? `เหลือ ${followupLeft} / ${followupTotal} ข้อ`
                  : "ยังไม่เริ่ม"
              }
            />
            <Field
              label="งานคอนเทนต์ที่ผูก"
              value={`${contentTasks.length} งาน`}
            />
          </dl>
        </DocSection>

        {/* ลิงก์ไฟล์ source (Google Drive) — แก้ได้เสมอแม้ปิดงานแล้ว (คลังไฟล์อ้างอิง)
            แต่สิทธิ์ team ที่เข้ามาดูจากแกลเลอรีให้เปิดลิงก์ได้อย่างเดียว —
            bare = ตัดกรอบ Card/หัวข้อของการ์ดออก ใช้หัวข้อของ DocSection แทน */}
        {/* โปรไฟล์ตัวบุคคล + ช่องทางติดต่อ (influ_profiles, 0080) — ข้อมูลกลางของทุกรอบ */}
        <DocSection
          icon={<Link2 size={15} className="text-brand-600" />}
          title="ช่องทางการติดต่อ (โปรไฟล์)"
          action={
            onEditProfile && (
              <button
                type="button"
                onClick={onEditProfile}
                className="ml-auto cursor-pointer rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 active:scale-[0.97] max-sm:min-h-11"
              >
                แก้โปรไฟล์
              </button>
            )
          }
        >
          {personProfile ? (
            <>
              {profileChannels.length > 0 ? (
                <ul className="space-y-1.5">
                  {profileChannels.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                        {c.platform}
                      </span>
                      {/^https?:\/\//i.test(c.value) ? (
                        <a
                          href={c.value}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-brand-700 underline-offset-2 hover:underline"
                        >
                          {c.value}
                        </a>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-stone-700">
                          {c.value}
                        </span>
                      )}
                      {c.followers != null && (
                        <span className="shrink-0 text-xs tabular-nums text-stone-400">
                          {formatNumber(c.followers)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-400">
                  ยังไม่ได้บันทึกช่องทางติดต่อ
                  {onEditProfile ? " — กด \u201cแก้โปรไฟล์\u201d เพื่อเพิ่ม" : ""}
                </p>
              )}
              {personProfile.note && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
                  {personProfile.note}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-stone-400">
              เคสนี้สร้างก่อนระบบโปรไฟล์ — ยังไม่มีข้อมูลโปรไฟล์กลางของคนนี้
            </p>
          )}
        </DocSection>

        {/* ผู้รับผิดชอบเคส (0095) — ใครถือขั้นไหน = ใครได้แจ้งเตือนแบบ "ต้องลงมือ" */}
        <DocSection
          icon={<Users size={15} className="text-brand-600" />}
          title="ผู้รับผิดชอบเคส"
        >
          {assigneeErr && (
            <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {assigneeErr}
            </p>
          )}
          <AssigneeEditor
            assignees={assignees}
            people={people}
            peopleById={peopleById}
            canEdit={canEditAssignees}
            busyUserId={assigneeBusy}
            onChange={onAssigneeChange}
          />
          {ownerName && (
            <p className="mt-3 text-xs text-stone-400">
              สร้างการ์ดโดย{" "}
              <span className="text-stone-500">{ownerName}</span>
            </p>
          )}
        </DocSection>
      </Card>

      {caseInfoOpen && (
        <CaseInfoEditModal
          influencer={influencer}
          doctors={doctors}
          onClose={() => setCaseInfoOpen(false)}
        />
      )}
    </div>
  );
}

/* ============ รายละเอียดเคส — แท็บไม่มีเลขขั้น (แก้ได้เสมอจนกว่าจะปิดงาน) ============ */

function CaseDetailStage({
  influencer,
  initialItems,
  priceCatalog,
  promoCatalog,
  services,
  doctors,
  campaigns,
  casePhotos,
  readOnly,
}: {
  influencer: InfluencerRow;
  initialItems: InfluProcedureItemRow[];
  priceCatalog: PriceCatalogEntry[];
  /** โปรที่ขึ้นหน้า /price-list (promo_packages — 0090) — ต้องค้นเจอในช่องหัตถการด้วย */
  promoCatalog: PromoCatalogEntry[];
  /** เมนูหัตถการที่ทีมเพิ่มเอง แยก product team (0080) */
  services: InfluServiceRow[];
  doctors: DoctorRow[];
  /** แคมเปญทั้งหมด (0093) — ตัวเลือก "แคมเปญ" ของเคสนี้ */
  campaigns: InfluCampaignDefRow[];
  /** รูปภาพหลายรูปของเคสนี้ (0105) — ทั้ง kind photo/channel ปนกันมา แยกกรองในนี้ */
  casePhotos: InfluCasePhotoRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const notify = useInfluNotify();
  const [nickname, setNickname] = useState(influencer.nickname ?? "");
  const [occupation, setOccupation] = useState(
    influencer.occupation ?? "Tiktoker / Influencer"
  );
  // โปรแกรมที่รับ = รายการทีละอัน (Influencer Cost) — editor บันทึกลง DB เอง
  // และ sync ข้อความสรุปกลับ procedure_text ให้ Memo/บอร์ดใช้รูปแบบเดิม
  const [items, setItems] = useState<InfluProcedureItemRow[]>(initialItems);
  const [serviceDate, setServiceDate] = useState(
    influencer.service_date ?? ""
  );
  const [doctorName, setDoctorName] = useState(influencer.doctor_name ?? "");
  /** ช่องทางคุยงานของรอบนี้ (ส่วนใหญ่คือชื่อกลุ่มไลน์) — ต่อเคส ไม่ใช่ช่องทางของตัวบุคคล */
  const [contactChannel, setContactChannel] = useState(
    influencer.contact_channel ?? ""
  );
  /** แคมเปญของเคส (0093) — "" = ไม่อยู่ในแคมเปญไหน */
  const [campaignId, setCampaignId] = useState(influencer.campaign_id ?? "");
  /** เคส "รอปรึกษา" (ติ๊กมาตั้งแต่ตอนสร้างนัด) — ธงเดียวที่อนุญาตให้ไม่มีหัตถการ
      เอาติ๊กออกเมื่อปรึกษาแพทย์แล้วเคาะโปรแกรมได้ (ต้องมีรายการอย่างน้อย 1 ก่อน) */
  /** หมายเหตุประกอบเมื่อมูลค่าเคสเกินเพดานงบของ Tier (0114) */
  const [budgetNote, setBudgetNote] = useState(influencer.budget_note ?? "");
  const [talentFee, setTalentFee] = useState(
    influencer.talent_fee != null ? String(influencer.talent_fee) : ""
  );
  /* วงเงิน voucher (0106) — เก็บเป็น "จำนวนใบ" ราคาต่อใบอ่านจากแถว (voucher_unit)
     เคสที่ยังไม่เคยเปิดวงเงินใช้ค่าคงที่ปัจจุบันเป็นราคาตั้งต้น */
  const [voucherCount, setVoucherCount] = useState(influencer.voucher_count);
  const voucherUnit =
    Number(influencer.voucher_unit) > 0
      ? Number(influencer.voucher_unit)
      : INFLU_VOUCHER_UNIT;
  const [followers, setFollowers] = useState(
    influencer.followers != null ? String(influencer.followers) : ""
  );
  const [followerNote, setFollowerNote] = useState(
    influencer.follower_note ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // รูปภาพ (0105) — คำนวณสดจาก prop ทุก render (ไม่เก็บ state ซ้อน) เพราะ router.refresh()
  // หลังอัพ/ลบจะส่ง casePhotos ชุดใหม่ลงมาให้ตรงอยู่แล้ว เหมือนที่ photo_path เดิมทำ
  const photos = casePhotos.filter((p) => p.kind === "photo");
  const channelPhotos = casePhotos.filter((p) => p.kind === "channel");
  /** null = ไม่มีอะไรกำลังอัพ/ลบอยู่ — ใช้ล็อกเฉพาะแกลเลอรีที่กำลังทำงาน ไม่ล็อกอีกฝั่ง */
  const [photoBusy, setPhotoBusy] = useState<"photo" | "channel" | null>(null);

  const addCasePhotos = async (kind: "photo" | "channel", files: File[]) => {
    setError(null);
    setPhotoBusy(kind);
    const prepared = await prepareUploadFiles(files);
    const tooBig = tooLargeSummary(prepared);
    if (tooBig) {
      setPhotoBusy(null);
      setError(tooBig);
      return;
    }
    const existing = kind === "photo" ? photos : channelPhotos;
    const maxPos = Math.max(0, ...existing.map((p) => p.position));
    const uploaded: { path: string; name: string }[] = [];
    for (const f of prepared) {
      const path = `influencers/${influencer.id}/${Date.now()}_${uploaded.length}_${sanitizeFileName(f.name)}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .upload(path, f);
      if (!upErr) uploaded.push({ path, name: f.name });
    }
    if (uploaded.length === 0) {
      setPhotoBusy(null);
      setError("อัพโหลดรูปไม่สำเร็จ");
      return;
    }
    const { error: insErr } = await supabase.from("influ_case_photos").insert(
      uploaded.map((u, i) => ({
        influencer_id: influencer.id,
        kind,
        file_path: u.path,
        file_name: u.name,
        position: maxPos + i + 1,
      }))
    );
    if (insErr) {
      setPhotoBusy(null);
      setError(`บันทึกรูปไม่สำเร็จ: ${insErr.message}`);
      return;
    }
    log({
      action: "upload",
      entity: "case_photo",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `เพิ่มรูป${kind === "photo" ? "ตัว influencer" : "ช่องทาง"} ${uploaded.length} รูป`,
    });
    // รูปแรกของทั้งชุด (ตาม position) = รูปหน้าปก — sync คอลัมน์เดิมให้ consumer อื่น
    // (การ์ดบอร์ด/sidebar/หัวเอกสารภาพรวม/copy รูปตอนเปิดรอบใหม่) ยังอ่านได้เหมือนเดิม
    // (update ต้อง literal key แยกสาขา — object key คำนวณชนกับ excess-property check ของ supabase-js)
    if (existing.length === 0) {
      if (kind === "photo") {
        await supabase
          .from("influencers")
          .update({ photo_path: uploaded[0].path })
          .eq("id", influencer.id);
      } else {
        await supabase
          .from("influencers")
          .update({ channel_photo_path: uploaded[0].path })
          .eq("id", influencer.id);
      }
    }
    setPhotoBusy(null);
    router.refresh();
  };

  const removeCasePhoto = async (photo: InfluCasePhotoRow) => {
    setError(null);
    setPhotoBusy(photo.kind);
    const { error: delErr } = await supabase
      .from("influ_case_photos")
      .delete()
      .eq("id", photo.id);
    if (delErr) {
      setPhotoBusy(null);
      setError(`ลบรูปไม่สำเร็จ: ${delErr.message}`);
      return;
    }
    try {
      await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([photo.file_path]);
    } catch {
      // best effort — ไฟล์ค้างดีกว่าฟอร์มพัง
    }
    log({
      action: "delete",
      entity: "case_photo",
      entityId: photo.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `ลบรูป${photo.kind === "photo" ? "ตัว influencer" : "ช่องทาง"} (${photo.file_name ?? "ไม่ทราบชื่อไฟล์"})`,
    });
    // เหลือรูปแรกใหม่ (ถ้ามี) = รูปหน้าปกใหม่ ไม่เหลือเลย = ล้าง cover
    const remaining = (photo.kind === "photo" ? photos : channelPhotos).filter(
      (p) => p.id !== photo.id
    );
    const currentCover =
      photo.kind === "photo"
        ? influencer.photo_path
        : influencer.channel_photo_path;
    const nextCover = remaining[0]?.file_path ?? null;
    if (nextCover !== currentCover) {
      if (photo.kind === "photo") {
        await supabase
          .from("influencers")
          .update({ photo_path: nextCover })
          .eq("id", influencer.id);
      } else {
        await supabase
          .from("influencers")
          .update({ channel_photo_path: nextCover })
          .eq("id", influencer.id);
      }
    }
    setPhotoBusy(null);
    router.refresh();
  };

  const followersNum = Number(followers.replace(/[^0-9]/g, "")) || 0;
  const tier = followersNum > 0 ? tierFromFollowers(followersNum) : null;

  /* มูลค่าเคส (case_value) = วงเงิน voucher + ค่าตัว — **ราคาสินค้าไม่เข้าสมการแล้ว** (0106)
     itemsTotal ยังคำนวณไว้เพื่อโชว์ประกอบตอนเคาะวงเงิน และเป็นต้นทุนของ /influ-cost เหมือนเดิม */
  const itemsTotal = items.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const voucherCredit = voucherCreditOf({
    voucher_count: voucherCount,
    voucher_unit: voucherUnit,
  });
  const caseTotal = voucherCredit + (Number(talentFee) || 0);

  // ตัวเลือกแคมเปญ = ที่ยังเปิดใช้งาน + ของเดิมที่เคสนี้ผูกไว้ (ถึงจะปิดไปแล้วก็ต้องยังเห็น
  // ไม่งั้นกดบันทึกครั้งถัดไปแคมเปญจะหลุดหายไปเงียบๆ)
  const campaignOptions = campaigns.filter(
    (c) => c.active || c.id === influencer.campaign_id
  );
  const selectedCampaign =
    campaignOptions.find((c) => c.id === campaignId) ?? null;

  // วันเข้าทำหัตถการ/แพทย์ที่รับเคส ไม่บังคับ — บ่อยครั้ง influ ยังไม่เคาะวัน (กลับมากรอกทีหลังได้)
  // เคส "รอปรึกษา" = ยกเว้นข้อบังคับเรื่องหัตถการ (ยังไม่รู้ว่าจะทำอะไรจนกว่าจะเจอแพทย์)
  // 0114: หัตถการไม่บังคับแล้ว (ของบังคับคือ voucher — เคสเก่าที่ยังเป็น 0 ใบ
  // ไม่บล็อคการบันทึก แค่ขึ้นเตือนที่กล่องมูลค่าเคส)
  const canProceed = occupation.trim() !== "" && followersNum > 0;

  const save = async () => {
    // ยังต้องมีค่าบังคับครบทุกครั้ง — แต่ห้ามปิดปุ่มบันทึกทิ้ง
    // ไม่งั้นคนที่แค่อยากแก้เบอร์โทร/วันนัด จะบันทึกไม่ได้เลยเพราะช่องอื่นว่าง
    // (บอกให้รู้ว่าขาดอะไร ดีกว่าปล่อยให้ล้างค่าทิ้งเงียบๆ หรือกดปุ่มไม่ได้โดยไม่บอกเหตุผล)
    if (!canProceed) {
      setError("กรอกให้ครบก่อนบันทึก: อาชีพ และยอดผู้ติดตาม");
      return;
    }
    const feeNum = talentFee.trim() === "" ? null : Number(talentFee);
    if (feeNum !== null && (!Number.isFinite(feeNum) || feeNum < 0)) {
      setError("ค่าตัวต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("influencers")
      .update({
        nickname: nickname.trim() || null,
        occupation: occupation.trim() || null,
        // procedure_text ไม่ต้องส่ง — ProcedureItemsEditor sync ให้เองทุกครั้งที่รายการเปลี่ยน
        service_date: serviceDate === "" ? null : serviceDate,
        doctor_name: doctorName.trim() || null,
        contact_channel: contactChannel.trim() || null,
        campaign_id: campaignId || null,
        // มูลค่าเคส = วงเงิน voucher + ค่าตัว (0106) — ราคาสินค้าไม่นับ
        voucher_count: voucherCount,
        voucher_unit: voucherUnit,
        case_value: caseValueOf({
          voucher_count: voucherCount,
          voucher_unit: voucherUnit,
          talent_fee: feeNum,
        }),
        // 0114: ธง "รอปรึกษา" ตั้งอัตโนมัติจากว่ามีรายการหัตถการหรือยัง
        consult_only: items.length === 0,
        budget_note: budgetNote.trim() || null,
        talent_fee: feeNum,
        followers: followersNum || null,
        follower_note: followerNote.trim() || null,
        tier,
      })
      .eq("id", influencer.id);
    setBusy(false);
    if (e) {
      setError(`บันทึกไม่สำเร็จ: ${e.message}`);
      return;
    }
    log({
      action: "update",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `แก้รายละเอียดเคส (${items.length} โปรแกรม · ผู้ติดตาม ${formatNumber(followersNum)}${
        voucherCredit > 0 ? ` · วงเงิน ${formatCurrency(voucherCredit)}` : ""
      })`,
    });
    // ข้อมูลเคสเปลี่ยนกระทบทุกขั้น (Memo/สัญญา/ต้นทุน) — ส่งแบบ "อัพเดท" ถึงทุกคน
    notify({
      type: "case_updated",
      title: `แก้รายละเอียดเคส ${logNameOf(influencer)}`,
      body: `${items.length} โปรแกรม${
        serviceDate ? ` · วันรับบริการ ${formatDate(serviceDate)}` : ""
      }${doctorName.trim() ? ` · ${doctorName.trim()}` : ""}`,
    });
    router.refresh();
  };

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-stone-900">
        รายละเอียดเคส
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="d-nick">ชื่อเล่น</Label>
              <Input
                id="d-nick"
                disabled={readOnly}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="เช่น ซ่า"
              />
            </div>
            <div>
              <Label htmlFor="d-occ">อาชีพ *</Label>
              <Input
                id="d-occ"
                disabled={readOnly}
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
              />
            </div>
          </div>
          <div>
            {/* 0114: หัตถการไม่บังคับ (ของบังคับคือ voucher) — ไม่มีรายการ = เคส
                "รอปรึกษา" อัตโนมัติ ธง consult_only ตั้ง/ล้างให้เองตอนบันทึก */}
            <Label className="!mb-0">เลือก Product Team</Label>
            <div className="mt-1.5" />
            <ProcedureItemsEditor
              influencerId={influencer.id}
              items={items}
              setItems={setItems}
              catalog={priceCatalog}
              promos={promoCatalog}
              services={services}
              readOnly={readOnly}
            />
            {/* วงเงิน voucher (0106) — อยู่ต่อจากรายการสินค้าเพราะเคาะวงเงินหลังรู้ว่าจะให้อะไรบ้าง */}
            <div className="mt-2.5">
              <VoucherPicker
                count={voucherCount}
                unit={voucherUnit}
                onChange={setVoucherCount}
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="d-date">วันที่เข้าทำหัตถการ</Label>
              <Input
                id="d-date"
                type="date"
                disabled={readOnly}
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
            </div>
            <div>
              <Label>มูลค่าเคสรวม (บาท)</Label>
              <div className="flex min-h-[42px] items-center rounded-xl border border-stone-200 bg-stone-50/80 px-3 text-sm font-semibold text-stone-800">
                {caseTotal > 0 ? formatCurrency(caseTotal) : "—"}
              </div>
              {/* ผู้ใช้ 2026-09-03: แสดงจำนวน voucher ที่กรอกไว้ตรงนี้ (ไม่ใช่ในตัวช่องกรอกเอง)
                  พ่วงเตือนถ้าวงเงินเปิดน้อยกว่ามูลค่าสินค้าที่เลือกไว้ */}
              <p className="mt-1 text-[11px] text-stone-500">
                {voucherLabelOf({
                  voucher_count: voucherCount,
                  voucher_unit: voucherUnit,
                }) ?? "ยังไม่เปิดวงเงิน voucher"}
                {Number(talentFee) > 0 &&
                  ` + ค่าตัว ${formatCurrency(Number(talentFee))}`}
                {voucherCredit > 0 && itemsTotal > voucherCredit && (
                  <span className="ml-1 font-medium text-amber-700">
                    (น้อยกว่ามูลค่าสินค้าที่เลือกไว้ {formatCurrency(itemsTotal)})
                  </span>
                )}
              </p>
              {/* เพดานงบของ Tier (ตารางทางการ 2026-09-07) — เกิน = ต้องมีหมายเหตุใน Memo */}
              {tier && (
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    caseTotal > INFLU_BUDGET_CAPS[tier].cap
                      ? "text-amber-700"
                      : "text-stone-500"
                  }`}
                >
                  เพดานงบ Tier {INFLU_TIERS[tier].label} :{" "}
                  {formatCurrency(INFLU_BUDGET_CAPS[tier].cap)}
                  {caseTotal > INFLU_BUDGET_CAPS[tier].cap &&
                    ` — เกินอยู่ ${formatCurrency(
                      caseTotal - INFLU_BUDGET_CAPS[tier].cap
                    )} · ผู้อนุมัติ ${INFLU_BUDGET_CAPS[tier].approvers}`}
                </p>
              )}
              {((tier && caseTotal > INFLU_BUDGET_CAPS[tier].cap) ||
                budgetNote.trim() !== "") && (
                <div className="mt-2">
                  <Label htmlFor="d-budget-note">
                    หมายเหตุประกอบการขออนุมัติ{" "}
                    {tier && caseTotal > INFLU_BUDGET_CAPS[tier].cap ? "*" : ""}
                  </Label>
                  <Textarea
                    id="d-budget-note"
                    rows={2}
                    disabled={readOnly}
                    value={budgetNote}
                    onChange={(e) => setBudgetNote(e.target.value)}
                    placeholder="เช่น บุคคลที่มีกระแสสังคม / ดารา-นักแสดง / พันธมิตรทางธุรกิจ"
                  />
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="d-fee">ค่าตัว (บาท)</Label>
              <Input
                id="d-fee"
                type="number"
                min="0"
                step="any"
                disabled={readOnly}
                value={talentFee}
                onChange={(e) => setTalentFee(e.target.value)}
                placeholder="เว้นว่าง = ไม่มีค่าตัว"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="d-doc">แพทย์ที่รับเคส</Label>
            <DoctorSelect
              id="d-doc"
              doctors={doctors}
              disabled={readOnly}
              value={doctorName}
              onChange={setDoctorName}
            />
          </div>
          <div>
            <Label htmlFor="d-contact">ช่องทางการติดต่อ</Label>
            <Input
              id="d-contact"
              disabled={readOnly}
              value={contactChannel}
              onChange={(e) => setContactChannel(e.target.value)}
              placeholder="เช่น กลุ่มไลน์ ART x คุณเอ"
            />
          </div>
          {/* แคมเปญ (0093) — เลือกแล้วแฮชแท็กของแคมเปญถูกเพิ่มเข้าชุดที่ influ ต้องติดในโพส
              ตัวเลือกโชว์เฉพาะแคมเปญที่เปิดใช้งาน + ของเดิมที่เคสนี้ผูกไว้ (กันค่าหายตอนบันทึก) */}
          <div>
            <Label htmlFor="d-campaign">แคมเปญ</Label>
            <Select
              id="d-campaign"
              disabled={readOnly}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">— ไม่อยู่ในแคมเปญ —</option>
              {campaignOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (#{c.tag}){c.active ? "" : " — ปิดใช้งานแล้ว"}
                </option>
              ))}
            </Select>
            {selectedCampaign && (
              <p className="mt-1 text-[11px] text-stone-600">
                #{selectedCampaign.tag}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="d-fol">ยอดผู้ติดตาม (ตัวเลข) *</Label>
              <Input
                id="d-fol"
                type="number"
                min="0"
                disabled={readOnly}
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
                placeholder="1600000"
              />
            </div>
            <div>
              <Label htmlFor="d-foln">ช่องทาง/หมายเหตุยอดติดตาม</Label>
              <Input
                id="d-foln"
                disabled={readOnly}
                value={followerNote}
                onChange={(e) => setFollowerNote(e.target.value)}
                placeholder="เช่น Tiktok 1.6 M, IG 13.6 K"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2.5">
            <span className="text-xs text-stone-500">
              Tier
            </span>
            {tier ? (
              <Badge className={INFLU_TIERS[tier].badge}>
                {INFLU_TIERS[tier].label} ({INFLU_TIERS[tier].range})
              </Badge>
            ) : (
              <span className="text-xs text-stone-300">
                กรอกยอดผู้ติดตามก่อน
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 self-start">
          <CasePhotoGallery
            label="รูป Influencer"
            photos={photos}
            disabled={readOnly || photoBusy === "photo"}
            onAddFiles={(files) => void addCasePhotos("photo", files)}
            onRemove={(p) => void removeCasePhoto(p)}
          />
          <CasePhotoGallery
            label="รูปช่องทาง (Channel)"
            photos={channelPhotos}
            disabled={readOnly || photoBusy === "channel"}
            onAddFiles={(files) => void addCasePhotos("channel", files)}
            onRemove={(p) => void removeCasePhoto(p)}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {/* แท็บนี้ไม่มีปุ่มเดิน stage อีกแล้ว (0086) — รายละเอียดเคสเป็นข้อมูลของเคส
          ที่แก้ได้ตลอด ไม่ใช่ขั้นตอนที่ต้อง "ผ่าน" */}
      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {/* ค่าบังคับถูกเช็คใน save() แล้ว (ขึ้นข้อความบอกว่าขาดอะไร) — ไม่ปิดปุ่ม
              เพื่อให้ยังแก้ช่องอื่นได้ตามปกติ */}
          <Button loading={busy} onClick={() => void save()}>
            บันทึกการแก้ไข
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ============ ครึ่งล่างของขั้นรวม (สัญญา + วันรับบริการ): วันเข้ารับบริการ —
   แก้หัตถการหน้างานได้; ตั้งแต่ 0092 ไม่มีขั้นถัดไปแล้ว (อัพไฟล์สัญญา = เริ่มนับสัญญา
   แล้วเคสไปโผล่ที่หน้า Follow Up เอง) ท้ายการ์ดจึงเป็นลิงก์ไปหน้านั้นแทนปุ่มเดิน stage ============ */

/* ---------- ลงคิวเข้าปฏิทิน — บังคับก่อนปิดขั้นสัญญา + วันรับบริการ ----------
   ผู้ใช้ 2026-08-29: "มี influ บางคนที่เข้ามาแล้วแต่ในระบบไม่ได้กดลงคิว" — เดิมเคสเดินไปขั้น
   ตามงานได้ทั้งที่ยังไม่มีคิวในปฏิทิน ทีมจึงไม่รู้ว่าวันไหนใครเข้า/หมอคนไหนรับ
   การ์ดนี้บังคับ "วันที่ + ชื่อแพทย์" แล้วเขียนลง influ_calendar_events (kind=service) ให้เลย
   → ป้าย "รอลงคิวหมอ" บนบอร์ดดับพร้อมกัน (needsDoctorBooking เช็คคิว service ต่อเคส) */
function ServiceBookingCard({
  influencer,
  bookings,
  doctors,
  userId,
  canBook,
}: {
  influencer: InfluencerRow;
  bookings: InfluCalendarEventRow[];
  doctors: DoctorRow[];
  userId: string | null;
  canBook: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const notify = useInfluNotify();
  // ค่าตั้งต้นจากข้อมูลเคส (วันที่คุยไว้ + แพทย์ที่ระบุไว้) — แก้ก่อนกดลงคิวได้
  const [date, setDate] = useState(influencer.service_date ?? "");
  const [start, setStart] = useState("");
  const [doctor, setDoctor] = useState(influencer.doctor_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const booked = bookings.length > 0;
  /** เคสเข้าสู่การติดตามไปแล้ว (อัพสัญญาแล้ว — 0092 ไม่มีขั้นถัดไปให้เดินอีก)
      แต่ยังไม่มีคิวในปฏิทิน = อาการที่ผู้ใช้เจอ "influ เข้ามาแล้วแต่ไม่ได้กดลงคิว" */
  const contractDone = influencer.completed || !!influencer.contract_file_path;

  const book = async () => {
    if (saving || !canBook) return;
    if (!date) {
      setError("กรุณาเลือกวันที่เข้ารับบริการ");
      return;
    }
    if (!doctor.trim()) {
      setError("กรุณาเลือกแพทย์ที่รับเคส");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("influ_calendar_events")
      .insert({
        influencer_id: influencer.id,
        title: influencer.procedure_text?.trim() || "เข้ารับบริการ / ทำหัตถการ",
        kind: "service",
        doctor_name: doctor.trim(),
        event_date: date,
        start_time: start || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (e || !data) {
      setSaving(false);
      setError(`ลงคิวไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    // sync วัน/แพทย์กลับเข้าเคส — การ์ดบนบอร์ด/Memo/หน้าต้นทุนอ่านจากช่องนี้
    const patch: { service_date?: string; doctor_name?: string } = {};
    if (influencer.service_date !== date) patch.service_date = date;
    if ((influencer.doctor_name ?? "") !== doctor.trim())
      patch.doctor_name = doctor.trim();
    if (Object.keys(patch).length > 0) {
      const { error: e2 } = await supabase
        .from("influencers")
        .update(patch)
        .eq("id", influencer.id);
      if (e2) {
        setSaving(false);
        setError(
          `ลงคิวในปฏิทินแล้ว แต่บันทึกวัน/แพทย์ในเคสไม่สำเร็จ: ${e2.message}`
        );
        router.refresh();
        return;
      }
    }
    setSaving(false);
    log({
      action: "create",
      entity: "calendar_event",
      entityId: data.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `ลงคิวเข้ารับบริการ ${formatDate(date)}${
        start ? ` ${start} น.` : " (ยังไม่เคาะเวลา)"
      } — แพทย์ ${doctor.trim()}`,
    });
    // คิวหมอ = หลักฐานว่า influ เข้ามาจริง — ทั้งทีมของเคสควรรู้ (คนถือขั้นสัญญาได้แบบเด่น)
    notify({
      type: "service_booked",
      scope: "contract",
      title: `ลงคิวเข้ารับบริการของ ${logNameOf(influencer)} แล้ว`,
      body: `${formatDate(date)}${start ? ` ${start} น.` : " (ยังไม่เคาะเวลา)"} — แพทย์ ${doctor.trim()}`,
      href: "/influ-calendar",
      meta: { event_date: date, doctor: doctor.trim() },
    });
    router.refresh();
  };

  // ใช้ div ธรรมดาไม่ใช่ Card — `glass` ตั้ง background เป็น gradient ทับสีพื้นของ Tailwind
  // (bg-amber-50/bg-emerald-50 จะไม่โผล่เลย) การ์ดเตือนที่อื่นในระบบก็ใช้ div เหมือนกัน
  if (booked)
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-[0_8px_28px_rgba(94,58,49,0.08)]">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-900">
          <CheckCircle2 size={16} className="text-emerald-600" />
          ลงคิวเข้าปฏิทินแล้ว
        </h2>
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-white/80 px-3.5 py-2.5 text-sm"
            >
              <span className="font-semibold text-stone-800">
                {formatDate(b.event_date)}
              </span>
              <span className="text-stone-500 tabular-nums">
                {calendarTimeLabel(b.start_time, b.end_time)}
              </span>
              {b.doctor_name ? (
                <DoctorNameChip name={b.doctor_name} doctors={doctors} />
              ) : (
                <span className="text-xs text-amber-700">ยังไม่ระบุแพทย์</span>
              )}
            </li>
          ))}
        </ul>
        <Link
          href="/influ-calendar"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 max-sm:min-h-11"
        >
          เปิดปฏิทินคิว
        </Link>
      </div>
    );

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-5 shadow-[0_8px_28px_rgba(94,58,49,0.08)]">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-900">
        <AlertTriangle size={16} className="text-amber-600" />
        {/* อัพสัญญาแล้วแต่ยังไม่มีคิว = เร่งด่วนกว่า (เคสเข้าสู่การติดตามไปแล้วแต่ปฏิทินไม่มีชื่อ) */}
        {contractDone
          ? "เซนสัญญาแล้วแต่ยังไม่ได้ลงคิวเข้าปฏิทิน — ลงคิวให้เรียบร้อยก่อน"
          : "ยังไม่ได้ลงคิวเข้าปฏิทิน — เคาะวันกับแพทย์แล้วลงคิวได้เลย"}
      </h2>
      <p className="mb-4 text-xs leading-5 text-stone-600">
        เคาะ<b>วันที่เข้ารับบริการ</b>กับ<b>แพทย์ที่รับเคส</b>แล้วกดลงคิว
        — ระบบจะเขียนคิวขึ้นปฏิทินคิวให้เลย ทีมอื่นจึงเห็นว่าวันนั้นมีใครเข้า
        (วันกับแพทย์จะถูกอัปเดตกลับเข้าเคสให้อัตโนมัติ)
      </p>

      {!canBook ? (
        <p className="rounded-lg border border-stone-200 bg-white/70 px-3 py-2 text-xs text-stone-500">
          {influencer.completed
            ? "เคสนี้ปิดงานแล้ว — ลงคิวย้อนหลังได้ที่หน้าปฏิทินคิว"
            : "บัญชีนี้ลงคิวไม่ได้ — ให้ผู้ดูแลระบบ Influencer เป็นคนลงคิวให้"}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="book-date">วันที่เข้ารับบริการ *</Label>
              <Input
                id="book-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="book-start">เวลาเริ่ม</Label>
              <Input
                id="book-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="book-doctor">แพทย์ที่รับเคส *</Label>
              <DoctorSelect
                id="book-doctor"
                doctors={doctors}
                value={doctor}
                onChange={setDoctor}
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <Button loading={saving} onClick={() => void book()}>
              <CalendarPlus size={16} />
              ลงคิวเข้าปฏิทิน
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ServiceDayStage({
  influencer,
  readOnly,
  bookings,
  doctors,
  userId,
  canBook,
  procedureItems,
  catalog,
  promos,
  services,
}: {
  influencer: InfluencerRow;
  readOnly: boolean;
  /** คิว kind=service ของเคสนี้ — ว่าง = ยังไม่ลงคิว (ปิดขั้นนี้ไม่ได้) */
  bookings: InfluCalendarEventRow[];
  doctors: DoctorRow[];
  userId: string | null;
  /** ลงคิวได้ไหม (เคสยังไม่ปิดงาน + สิทธิ์แก้ไข) — แยกจาก readOnly ที่ล็อกการเดิน stage */
  canBook: boolean;
  /** หัตถการที่วางแผนไว้ — ใช้ตั้งต้นตอนเปิดโมดัลแก้หน้างาน (ปกติแก้แค่รายการเดียว) */
  procedureItems: ProcedureItemWithPromo[];
  catalog: PriceCatalogEntry[];
  promos: PromoCatalogEntry[];
  services: InfluServiceRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const notify = useInfluNotify();
  const [editOpen, setEditOpen] = useState(false);
  /* หัตถการหน้างานเลือกจากเมนูเดียวกับตอนสร้างเคส (ผู้ใช้ 2026-09-07: ให้เป็น dropdown
     ทุกที่ที่เลือกหัตถการ) — เก็บใน memory แล้วประกอบเป็น procedure_text ตอนบันทึก
     เหมือนเดิม ไม่แตะ influ_procedure_items ที่เป็นต้นทุนของ /influ-cost */
  const [picked, setPicked] = useState<PickedProcedure[]>([]);
  const [supervisor, setSupervisor] = useState("");
  const [padOpen, setPadOpen] = useState(false);
  const [savingChange, setSavingChange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = influencer.procedure_history ?? [];
  /** ขั้นนี้รวมสัญญาไว้ด้วย — มีไฟล์สัญญาที่เซนแล้ว = เคสเข้าสู่การติดตามที่หน้า Follow Up */
  const contractUploaded = !!influencer.contract_file_path;
  /** ลงคิวเข้าปฏิทินแล้วหรือยัง (ผู้ใช้ 2026-08-29 — ดู ServiceBookingCard) */
  const booked = bookings.length > 0;

  const saveChange = async (signatureData: string) => {
    // กันกดบันทึกลายเซนซ้ำ — ไม่งั้น history โดนต่อท้ายรายการเดิม 2 รอบ
    if (savingChange) return;
    setSavingChange(true);
    setPadOpen(false);
    setEditOpen(false);
    setError(null);
    // ดึง history ล่าสุดจาก DB ก่อนต่อท้าย — กันแท็บค้างเก่าทับรายการที่เซนไปแล้ว
    const { data: fresh } = await supabase
      .from("influencers")
      .select("procedure_text, procedure_history")
      .eq("id", influencer.id)
      .single();
    const freshHistory =
      (fresh?.procedure_history as ProcedureChange[] | null) ?? history;
    const nextText = procedureSummaryText(
      picked.map((p) => ({ name: p.name }))
    );
    const change: ProcedureChange = {
      old: fresh?.procedure_text ?? influencer.procedure_text ?? "",
      next: nextText,
      signed_by: supervisor.trim(),
      signature_data: signatureData,
      changed_at: new Date().toISOString(),
    };
    const { error: e } = await supabase
      .from("influencers")
      .update({
        procedure_text: nextText,
        procedure_history: [...freshHistory, change],
      })
      .eq("id", influencer.id);
    setSavingChange(false);
    if (e) {
      // บันทึกล้ม — คงหัตถการใหม่/ชื่อหัวหน้างานที่กรอกไว้ แล้วเปิด modal กลับมาให้ลองใหม่
      setError(`บันทึกไม่สำเร็จ: ${e.message}`);
      setEditOpen(true);
      return;
    }
    log({
      action: "update",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `แก้หัตถการหน้างาน: "${change.old || "(ว่าง)"}" → "${change.next}" (หัวหน้างานลงนาม: ${change.signed_by || "ไม่ระบุ"})`,
    });
    notify({
      type: "case_updated",
      scope: "followup",
      title: `แก้หัตถการหน้างานของ ${logNameOf(influencer)}`,
      body: `"${change.old || "(ว่าง)"}" → "${change.next}"`,
    });
    setPicked([]);
    setSupervisor("");
    router.refresh();
  };


  return (
    <div className="space-y-4">
      <ServiceBookingCard
        influencer={influencer}
        bookings={bookings}
        doctors={doctors}
        userId={userId}
        canBook={canBook}
      />

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-stone-900">
          หัตถการที่รับบริการ
        </h2>

        <div className="space-y-2 rounded-xl border border-stone-200 bg-white/80 px-4 py-3 text-sm leading-7">
          {history.map((h, i) => (
            <div key={i} className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="min-w-0 break-words text-stone-400 line-through decoration-blue-700 decoration-2">
                {h.old || "(ว่าง)"}
              </span>
              <span className="min-w-0 break-words font-medium text-blue-700">
                → {h.next}
              </span>
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-0.5">
                {/* ลายเซนเป็น PNG กว้างตามที่วาดมา — จำกัดความกว้างบนจอเล็กไม่ให้ดันแถวจนล้น */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.signature_data}
                  alt={`ลายเซน ${h.signed_by}`}
                  className="h-8 w-auto max-w-[40vw] object-contain sm:max-w-[160px]"
                />
                <span className="text-[10px] leading-3 text-blue-700">
                  {h.signed_by}
                  <br />
                  {formatDate(h.changed_at)}
                </span>
              </span>
            </div>
          ))}
          <p
            className={`break-words ${
              history.length > 0
                ? "font-medium text-stone-900"
                : "text-stone-800"
            }`}
          >
            {influencer.procedure_text || "-"}
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
            {error}
          </p>
        )}

        {!readOnly && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                // ตั้งต้นด้วยรายการที่วางแผนไว้ — หน้างานมักแก้แค่รายการเดียว
                setPicked(
                  procedureItems.map((it) => ({
                    name: it.name,
                    priceItemId: it.price_item_id,
                    promoPackageId: it.promo_package_id,
                    price: Number(it.price) || 0,
                    team: it.product_team,
                  }))
                );
                setEditOpen(true);
              }}
            >
              <PenLine size={15} />
              แก้ไขหัตถการ (ต้องลงนามหัวหน้างาน)
            </Button>
            {/* ไม่มีขั้นถัดไปแล้ว (0092) — อัพไฟล์สัญญา = เคสเข้าสู่การติดตามที่หน้า Follow Up เอง */}
            {contractUploaded ? (
              <div className="flex flex-col items-end gap-1.5">
                <Link
                  href="/influencers/contracts"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-3.5 py-2 text-sm font-medium text-brand-700 transition-all hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97] max-sm:min-h-11"
                >
                  <ListChecks size={16} />
                  ไปหน้า Follow Up ของเคสนี้
                  <ArrowRight size={14} />
                </Link>
                {/* อัพสัญญาแล้วแต่ยังไม่มีคิวในปฏิทิน = เคสที่ผู้ใช้บอกว่า "เข้ามาแล้วแต่ไม่ได้กดลงคิว"
                    ไม่มีปุ่มเดิน stage ให้ล็อกแล้ว (0092) จึงเตือนไว้ตรงนี้แทน */}
                {!booked && (
                  <span className="text-right text-xs font-medium text-amber-700">
                    ยังไม่ได้ลงคิวเข้าปฏิทิน — ลงคิวที่การ์ดด้านบนก่อน
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-stone-400">
                อัพโหลดไฟล์สัญญาที่เซนแล้ว (ส่วนสัญญาด้านบน) เพื่อเริ่มนับสัญญา
                — เคสจะไปโผล่ที่หน้า Follow Up เอง
              </span>
            )}
          </div>
        )}
      </Card>

      {/* modal แก้หัตถการ */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="แก้ไขหัตถการหน้างาน"
      >
        <div className="space-y-4">
          <div>
            <Label>หัตถการเดิม</Label>
            <p className="break-words rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500 line-through">
              {influencer.procedure_text || "-"}
            </p>
          </div>
          <div>
            <Label>หัตถการที่ทำจริง *</Label>
            <ProcedurePicker
              picked={picked}
              onChange={setPicked}
              catalog={catalog}
              promos={promos}
              services={services}
              disabled={savingChange}
            />
          </div>
          <div>
            <Label htmlFor="sv">ชื่อหัวหน้างานผู้ลงนามกำกับ *</Label>
            <Input
              id="sv"
              value={supervisor}
              onChange={(e) => setSupervisor(e.target.value)}
              placeholder="เช่น คุณปิยะวัฒน์ วรสิงห์"
            />
          </div>
          {/* error ตอนบันทึกล้ม — โชว์ใน modal เพราะข้อความใน Card ถูก modal บัง */}
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              disabled={picked.length === 0 || supervisor.trim() === ""}
              onClick={() => setPadOpen(true)}
            >
              <PenLine size={15} />
              ลงนามหัวหน้างานเพื่อยืนยัน
            </Button>
          </div>
        </div>
      </Modal>

      {padOpen && (
        <SignaturePad
          title="ลงนามกำกับการแก้ไขหัตถการหน้างาน"
          signerName={supervisor}
          onSave={(d) => void saveChange(d)}
          onClose={() => setPadOpen(false)}
        />
      )}
    </div>
  );
}
