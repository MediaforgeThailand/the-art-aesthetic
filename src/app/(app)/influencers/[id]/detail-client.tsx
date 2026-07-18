"use client";

import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Image as ImageIcon,
  ImagePlus,
  LayoutList,
  Link2,
  ListChecks,
  MessageSquarePlus,
  PenLine,
  PhoneCall,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { SignaturePad } from "@/components/signature-pad";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  Textarea,
} from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  todayISO,
} from "@/lib/format";
import {
  activeFollowupTasks,
  contractEndDate,
  INFLU_CHECKLIST,
  INFLU_CHECKLIST_SECTIONS,
  INFLU_FOLLOWUP_MODE_ORDER,
  INFLU_FOLLOWUP_MODES,
  INFLU_STAGES,
  INFLU_TIERS,
  tierFromFollowers,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluencerRow,
  InfluFollowupMode,
  InfluFollowupRow,
  InfluSignatureRow,
  InfluTaskRow,
  ProcedureChange,
  TaskWithAssignee,
} from "@/lib/types";
import { useSignedUrl } from "../use-signed-url";
import { ContractStage, MemoStage } from "./docs-stages";
import { PackageStage } from "./package-stage";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** สร้าง checklist ติดตามงานจากเอกสาร 5 หมวด (idempotent) — คืน error message ถ้าล้ม
    ข้อที่มีกำหนดเวลา (offsetDays) เริ่มนับจาก "วันที่เข้าสู่ stage 6" (วันนี้ ณ ตอน generate)
    เช็คเฉพาะข้อของเทมเพลตมาตรฐาน (is_custom = false) — ข้อที่ทีมพิมพ์เองในโหมดแพ็คเกจเฉพาะ
    ไม่ควรบล็อคการสร้างเทมเพลต ไม่งั้นเคสที่ generate ล้มแล้วไปกรอกเอง จะสร้างมาตรฐานกลับมาไม่ได้ */
async function generateFollowupTasks(
  supabase: ReturnType<typeof createClient>,
  influencer: InfluencerRow
): Promise<string | null> {
  const { data: existing, error: exErr } = await supabase
    .from("influ_tasks")
    .select("id")
    .eq("influencer_id", influencer.id)
    .eq("is_custom", false)
    .limit(1);
  if (exErr) return exErr.message;
  if (existing && existing.length > 0) return null;

  const base = todayISO();
  const addDays = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const { error } = await supabase.from("influ_tasks").insert(
    INFLU_CHECKLIST.map((t) => ({
      influencer_id: influencer.id,
      step: t.step,
      title: t.title,
      script: t.detail,
      section: t.section,
      due_date: t.offsetDays != null ? addDays(base, t.offsetDays) : null,
    }))
  );
  return error?.message ?? null;
}

/** กล่องอัพโหลด/แสดงรูป — อยู่ module scope กัน remount ทุก keystroke ของฟอร์ม */
function PhotoBox({
  label,
  url,
  disabled,
  onPick,
}: {
  label: string;
  url: string | null;
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label>{label}</Label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex h-40 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-white/60 transition-colors hover:border-brand-400 hover:bg-brand-50/40 disabled:cursor-default"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-stone-400">
            <ImagePlus size={22} />
            กดเพื่ออัพโหลดรูป
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
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
  const [firstName, setFirstName] = useState(influencer.first_name);
  const [lastName, setLastName] = useState(influencer.last_name ?? "");
  const [nickname, setNickname] = useState(influencer.nickname ?? "");
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
    const { error } = await supabase
      .from("influencers")
      .update({
        first_name: first,
        last_name: lastName.trim() || null,
        nickname: nickname.trim() || null,
      })
      .eq("id", influencer.id);
    setBusy(false);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
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
        {err && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
            {err}
          </p>
        )}
        <p className="text-xs text-stone-400">
          ชื่อนี้ถูกใช้ในเอกสาร Memo และสัญญาที่สร้างจากระบบ —
          เอกสารที่พิมพ์/อัปโหลดไปแล้วจะไม่เปลี่ยนตาม
        </p>
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

/** แก้ "วันเข้ารับบริการ + แพทย์ที่รับเคส" ได้ทุก stage — สองช่องนี้ไม่บังคับตอน Stage 2
    (influ มักยังไม่เคาะวัน / ยังไม่รู้ว่าแพทย์ท่านไหนรับเคส) แล้วมาเคาะทีหลังตอนอยู่ stage อื่น
    ซึ่ง Stage 2 ถูกล็อก (readOnly = view < stage) ไปแล้ว — เป็นข้อมูลนัดหมาย ไม่ใช่สถานะงาน
    จึงเปิดแก้ได้เสมอแบบเดียวกับ NameEditModal */
function CaseInfoEditModal({
  influencer,
  onClose,
}: {
  influencer: InfluencerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [serviceDate, setServiceDate] = useState(influencer.service_date ?? "");
  const [doctorName, setDoctorName] = useState(influencer.doctor_name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from("influencers")
      .update({
        service_date: serviceDate === "" ? null : serviceDate,
        doctor_name: doctorName.trim() || null,
      })
      .eq("id", influencer.id);
    setBusy(false);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <Modal open onClose={onClose} title="แก้ไขวันเข้ารับบริการ / แพทย์ที่รับเคส">
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label htmlFor="ci-date">วันเข้ารับบริการ</Label>
          <Input
            id="ci-date"
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-stone-400">
            ยังไม่เคาะวันได้ — เว้นว่างไว้ก่อน แล้วกลับมากรอกทีหลัง
          </p>
        </div>
        <div>
          <Label htmlFor="ci-doc">แพทย์ที่รับเคส</Label>
          <Input
            id="ci-doc"
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            placeholder="เช่น นพ.ปิยะวัฒน์ วรสิงห์"
          />
        </div>
        {err && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
            {err}
          </p>
        )}
        <p className="text-xs text-stone-400">
          ข้อมูลนี้ถูกใช้ในข้อความ Memo (Stage 3) —
          เอกสารที่พิมพ์/อัปโหลดไปแล้วจะไม่เปลี่ยนตาม
        </p>
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
  followups,
  signatures,
  tasks,
  contentTasks,
  userName,
}: {
  influencer: InfluencerRow;
  followups: InfluFollowupRow[];
  signatures: InfluSignatureRow[];
  tasks: InfluTaskRow[];
  contentTasks: TaskWithAssignee[];
  userName: string;
}) {
  // view = "overview" (หน้าสรุป) หรือเลข stage 1-6 — เปิดหน้ารายละเอียดมาเจอภาพรวมก่อน
  const [view, setView] = useState<"overview" | number>("overview");
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

  const maxStage = influencer.completed ? 6 : influencer.stage;
  const readOnly =
    influencer.completed || (typeof view === "number" && view < influencer.stage);
  const [nameOpen, setNameOpen] = useState(false);

  // สรุป: follow-up ที่เหลือ (stage 6 checklist ยังไม่ทำ) — นับเฉพาะข้อของโหมดที่ใช้อยู่
  const activeTasks = useMemo(
    () => activeFollowupTasks(influencer.followup_mode, tasks),
    [influencer.followup_mode, tasks]
  );
  const followupLeft = activeTasks.filter((t) => !t.done).length;
  const followupTotal = activeTasks.length;

  return (
    <div>
      {/* header */}
      <div className="mb-4 flex flex-wrap items-center gap-3 animate-fade-in-up">
        <Link
          href="/influencers"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-stone-500 transition-colors hover:bg-white/60 hover:text-brand-700"
        >
          <ArrowLeft size={16} />
          รายชื่อ
        </Link>
        <h1 className="flex items-center gap-1.5 text-xl font-semibold text-stone-900">
          <span>
            คุณ{fullName}
            {influencer.nickname && (
              <span className="text-stone-400"> ({influencer.nickname})</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setNameOpen(true)}
            title="แก้ไขชื่อ / นามสกุล / ชื่อเล่น"
            className="cursor-pointer rounded-md p-1.5 text-stone-300 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90"
          >
            <PenLine size={15} />
          </button>
        </h1>
        {influencer.tier && (
          <Badge className={INFLU_TIERS[influencer.tier].badge}>
            {INFLU_TIERS[influencer.tier].label}
          </Badge>
        )}
        {influencer.completed && (
          <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={12} /> จบงานแล้ว
          </Badge>
        )}
        {/* follow-up ที่เหลือ (เฉพาะ stage 6) */}
        {influencer.stage === 6 &&
          !influencer.completed &&
          followupTotal > 0 &&
          (followupLeft > 0 ? (
            <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
              <ListChecks size={12} /> follow-up เหลือ {followupLeft}/
              {followupTotal} ข้อ
            </Badge>
          ) : (
            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={12} /> follow-up ครบทุกข้อ
            </Badge>
          ))}
        {/* จำนวนงานคอนเทนต์ที่ผูกกับคนนี้ */}
        {contentTasks.length > 0 && (
          <Badge className="border border-brand-200 bg-brand-50 text-brand-700">
            <ClipboardList size={12} /> คอนเทนต์ {contentTasks.length} งาน
          </Badge>
        )}
      </div>

      {/* stepper — มีปุ่ม "ภาพรวม" นำหน้า */}
      <div className="mb-6 flex flex-wrap gap-2 animate-fade-in-up">
        <button
          type="button"
          onClick={() => setView("overview")}
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.97] ${
            view === "overview"
              ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
              : "border border-stone-200 bg-white/60 text-stone-600 hover:bg-white"
          }`}
        >
          <LayoutList size={15} />
          ภาพรวม
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
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
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
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                  view === s.step
                    ? "bg-white/25"
                    : passed
                      ? "bg-emerald-500 text-white"
                      : "bg-stone-200 text-stone-500"
                }`}
              >
                {passed ? <Check size={12} strokeWidth={3} /> : s.step}
              </span>
              {s.title}
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in" key={String(view)}>
        {view === "overview" && (
          <OverviewPanel
            influencer={influencer}
            followupTasks={activeTasks}
            contentTasks={contentTasks}
            onGoStage={(step) => setView(step)}
          />
        )}
        {view === 1 && (
          <ContactStage
            influencer={influencer}
            followups={followups}
            readOnly={readOnly}
          />
        )}
        {view === 2 && (
          // Stage 2 แก้ได้เสมอจนกว่าจะปิดงาน (ไม่ใช้ readOnly รวมที่ล็อก stage ที่ผ่านแล้ว) —
          // เป็นข้อมูลเคสไม่ใช่สถานะงาน มักต้องกลับมาเติมวัน/แพทย์/มูลค่าทีหลัง
          <CaseDetailStage
            influencer={influencer}
            readOnly={influencer.completed}
          />
        )}
        {view === 3 && (
          <MemoStage
            influencer={influencer}
            signatures={signatures}
            userName={userName}
            readOnly={readOnly}
          />
        )}
        {view === 4 && (
          <ContractStage
            influencer={influencer}
            signatures={signatures}
            readOnly={readOnly}
          />
        )}
        {view === 5 && (
          <ServiceDayStage influencer={influencer} readOnly={readOnly} />
        )}
        {view === 6 && (
          <FollowupStage
            influencer={influencer}
            tasks={tasks}
            readOnly={influencer.completed}
          />
        )}
      </div>

      {/* งานคอนเทนต์ที่ผูกกับ Influencer คนนี้ (จากหน้า "งาน") */}
      <ContentTasksSection tasks={contentTasks} />

      {nameOpen && (
        <NameEditModal
          influencer={influencer}
          onClose={() => setNameOpen(false)}
        />
      )}
    </div>
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

function OverviewPanel({
  influencer,
  followupTasks,
  contentTasks,
  onGoStage,
}: {
  influencer: InfluencerRow;
  followupTasks: InfluTaskRow[];
  contentTasks: TaskWithAssignee[];
  onGoStage: (step: number) => void;
}) {
  const [caseInfoOpen, setCaseInfoOpen] = useState(false);
  const fullName =
    [influencer.first_name, influencer.last_name].filter(Boolean).join(" ") ||
    null;
  const tier = influencer.tier ? INFLU_TIERS[influencer.tier] : null;
  const followupLeft = followupTasks.filter((t) => !t.done).length;
  const followupTotal = followupTasks.length;
  const contractEnd =
    influencer.contract_start && influencer.contract_months
      ? contractEndDate(influencer.contract_start, influencer.contract_months)
      : null;
  const maxStage = influencer.completed ? 6 : influencer.stage;

  return (
    <div className="space-y-5">
      {/* ความคืบหน้า stage */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks size={16} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-stone-900">
            ความคืบหน้าตามขั้นตอน
          </h2>
          <span className="text-xs text-stone-400">
            {influencer.completed
              ? "จบงานแล้ว"
              : `กำลังอยู่ขั้นที่ ${influencer.stage} จาก 6`}
          </span>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
      </Card>

      {/* ข้อมูลที่กรอกแล้ว */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-stone-900">
            ข้อมูล Influencer
          </h3>
          <div className="flex gap-4">
            {influencer.photo_path && (
              <OverviewPhoto path={influencer.photo_path} />
            )}
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
              <Field label="ชื่อเล่น" value={influencer.nickname} />
              <Field label="ชื่อ-นามสกุล" value={fullName} />
              <Field label="เบอร์โทร" value={influencer.phone} />
              <Field label="อาชีพ" value={influencer.occupation} />
              <Field
                label="ผู้ติดตาม"
                value={
                  influencer.followers != null
                    ? formatNumber(influencer.followers)
                    : null
                }
              />
              <Field
                label="ระดับ (Tier)"
                value={
                  tier ? (
                    <Badge className={tier.badge}>{tier.label}</Badge>
                  ) : null
                }
              />
              <Field label="ช่องทาง/หมายเหตุผู้ติดตาม" value={influencer.follower_note} />
              <Field label="ผู้ดูแล (ผู้จัดทำ)" value={influencer.maker_name} />
            </dl>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-stone-900">
              รายละเอียดเคส
            </h3>
            {!influencer.completed && (
              <button
                type="button"
                onClick={() => setCaseInfoOpen(true)}
                title="แก้ไขวันเข้ารับบริการ / แพทย์ที่รับเคส"
                className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-stone-400 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90"
              >
                <PenLine size={13} />
                แก้วัน/แพทย์
              </button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="หัตถการที่รับ" value={influencer.procedure_text} />
            <Field
              label="มูลค่าเคส"
              value={
                influencer.case_value != null
                  ? formatCurrency(influencer.case_value)
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
            <Field label="แพทย์ที่รับเคส" value={influencer.doctor_name} />
          </dl>
          {influencer.procedure_history.length > 0 && (
            <p className="mt-3 text-xs text-stone-400">
              มีการแก้ไขหัตถการหน้างาน {influencer.procedure_history.length} ครั้ง
              (ดูใน &quot;วันเข้ารับบริการ&quot;)
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-stone-900">
            เอกสาร & สัญญา
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
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
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-stone-900">
            การติดตามงาน
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field
              label="สถานะรวม"
              value={
                influencer.completed
                  ? "จบงานแล้ว"
                  : `กำลังทำขั้นที่ ${influencer.stage}`
              }
            />
            <Field
              label="Follow-up (ขั้นที่ 6)"
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
            <Field
              label="อัปเดตล่าสุด"
              value={
                influencer.updated_at
                  ? formatDateTime(influencer.updated_at)
                  : null
              }
            />
          </dl>
        </Card>
      </div>

      {caseInfoOpen && (
        <CaseInfoEditModal
          influencer={influencer}
          onClose={() => setCaseInfoOpen(false)}
        />
      )}
    </div>
  );
}

/* ============ งานคอนเทนต์ที่ผูกกับ influencer ============ */

function ContentTasksSection({ tasks }: { tasks: TaskWithAssignee[] }) {
  const today = todayISO();
  return (
    <Card className="mt-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-stone-900">
          งานคอนเทนต์ที่ใช้ Influencer คนนี้
        </h2>
        <span className="text-xs text-stone-400">{tasks.length} งาน</span>
        <Link
          href="/tasks"
          className="ml-auto text-xs font-medium text-brand-600 hover:underline"
        >
          ไปหน้างาน
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-200 px-3 py-4 text-center text-xs text-stone-400">
          ยังไม่มีงานที่เลือก Influencer คนนี้ — ไปที่หน้า &quot;งาน&quot;
          แล้วเลือก Influencer ในช่องรายละเอียดงาน
        </p>
      ) : (
        <div className="divide-y divide-stone-100">
          {tasks.map((t) => {
            const overdue =
              t.due_date != null &&
              !t.completed &&
              t.due_date.slice(0, 10) < today;
            const fileCount = t.files?.length ?? 0;
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    t.review_status === "approved"
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : t.review_status === "pending"
                        ? "border-amber-400 bg-amber-50"
                        : "border-stone-300 bg-white"
                  }`}
                >
                  {t.review_status === "approved" && (
                    <Check size={10} strokeWidth={3} />
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    t.completed
                      ? "text-stone-400 line-through"
                      : "font-medium text-stone-800"
                  }`}
                >
                  {t.title}
                </span>
                {t.review_status === "pending" && (
                  <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                    รอตรวจ
                  </Badge>
                )}
                {t.review_status === "approved" && (
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                    เสร็จสมบูรณ์
                  </Badge>
                )}
                {t.due_date && (
                  <span
                    className={`text-xs ${
                      overdue ? "font-medium text-rose-600" : "text-stone-500"
                    }`}
                  >
                    {formatDate(t.due_date)}
                  </span>
                )}
                {t.deliverable_url && (
                  <a
                    href={t.deliverable_url}
                    target="_blank"
                    rel="noreferrer"
                    title="เปิดลิงก์งาน"
                    className="text-sky-600 hover:text-sky-700"
                  >
                    <Link2 size={14} />
                  </a>
                )}
                {fileCount > 0 && (
                  <span
                    title={`มีไฟล์แนบ ${fileCount} ไฟล์`}
                    className="inline-flex items-center gap-0.5 text-brand-600"
                  >
                    <ImageIcon size={14} />
                    {fileCount > 1 && (
                      <span className="text-[10px] font-semibold">
                        {fileCount}
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ============ Stage 1: ติดต่อ + Follow up ============ */

function ContactStage({
  influencer,
  followups,
  readOnly,
}: {
  influencer: InfluencerRow;
  followups: InfluFollowupRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFollowup = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const round =
      followups.length > 0
        ? Math.max(...followups.map((f) => f.round)) + 1
        : 1;
    const { error: e } = await supabase.from("influ_followups").insert({
      influencer_id: influencer.id,
      round,
      comment: comment.trim() || null,
    });
    setBusy(false);
    if (e) {
      // คงข้อความที่พิมพ์ไว้ — ไม่ทิ้งของผู้ใช้เมื่อบันทึกล้ม
      setError(`บันทึกไม่สำเร็จ: ${e.message}`);
      return;
    }
    setComment("");
    router.refresh();
  };

  const confirmJoin = async () => {
    setError(null);
    const { error: e } = await supabase
      .from("influencers")
      .update({ stage: 2 })
      .eq("id", influencer.id);
    if (e) {
      setError(`บันทึกไม่สำเร็จ: ${e.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900">
          <PhoneCall size={16} className="text-brand-600" />
          ข้อมูลติดต่อ
        </h2>
        <div className="space-y-1.5 text-sm text-stone-700">
          <p>
            ชื่อ:{" "}
            <span className="font-medium">
              {influencer.first_name} {influencer.last_name}
            </span>
          </p>
          <p>
            เบอร์โทร:{" "}
            <span className="font-medium tabular-nums">
              {influencer.phone || "-"}
            </span>
          </p>
          <p className="text-xs text-stone-400">
            เพิ่มเมื่อ {formatDateTime(influencer.created_at)}
          </p>
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
            {error}
          </p>
        )}
        {!readOnly && (
          <Button className="mt-4 w-full" onClick={() => void confirmJoin()}>
            <CheckCircle2 size={16} />
            ยืนยันตกลงร่วมงาน — ไป Stage 2
          </Button>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900">
          <MessageSquarePlus size={16} className="text-brand-600" />
          บันทึกการติดต่อ (Follow up)
        </h2>
        <div className="space-y-2">
          {followups.length === 0 && (
            <p className="rounded-lg border-2 border-dashed border-stone-200 px-3 py-4 text-center text-xs text-stone-400">
              ยังไม่มีบันทึก — โทร/ทักครั้งแรกแล้วกดเพิ่ม Follow up
            </p>
          )}
          {followups.map((f) => (
            <div
              key={f.id}
              className="rounded-lg bg-white/70 px-3 py-2 text-sm"
            >
              <p className="flex items-center gap-2">
                <Badge className="bg-brand-50 text-brand-700">
                  Follow up ครั้งที่ {f.round}
                </Badge>
                <span className="ml-auto text-[11px] text-stone-400">
                  {formatDateTime(f.created_at)}
                </span>
              </p>
              {f.comment && (
                <p className="mt-1 text-stone-700">{f.comment}</p>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <div className="mt-3 flex gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={`comment ครั้งที่ ${followups.length + 1} เช่น โทรแล้วรอตอบกลับ...`}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addFollowup();
              }}
            />
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => void addFollowup()}
            >
              <MessageSquarePlus size={15} />
              เพิ่ม
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============ Stage 2: รายละเอียดเคส ============ */

function CaseDetailStage({
  influencer,
  readOnly,
}: {
  influencer: InfluencerRow;
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [nickname, setNickname] = useState(influencer.nickname ?? "");
  const [occupation, setOccupation] = useState(
    influencer.occupation ?? "Tiktoker / Influencer"
  );
  const [procedure, setProcedure] = useState(influencer.procedure_text ?? "");
  const [serviceDate, setServiceDate] = useState(
    influencer.service_date ?? ""
  );
  const [doctorName, setDoctorName] = useState(influencer.doctor_name ?? "");
  const [caseValue, setCaseValue] = useState(
    influencer.case_value != null ? String(influencer.case_value) : ""
  );
  const [followers, setFollowers] = useState(
    influencer.followers != null ? String(influencer.followers) : ""
  );
  const [followerNote, setFollowerNote] = useState(
    influencer.follower_note ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // failed ไม่ต้องใช้ — PhotoBox แสดงกล่องอัพโหลด (placeholder นิ่ง) เมื่อไม่มี url อยู่แล้ว
  const { url: photoUrl } = useSignedUrl(influencer.photo_path);
  const { url: channelUrl } = useSignedUrl(influencer.channel_photo_path);

  const followersNum = Number(followers.replace(/[^0-9]/g, "")) || 0;
  const tier = followersNum > 0 ? tierFromFollowers(followersNum) : null;

  // วันเข้าทำหัตถการ/แพทย์ที่รับเคส ไม่บังคับ — บ่อยครั้ง influ ยังไม่เคาะวัน (กลับมากรอกทีหลังได้)
  const canProceed =
    occupation.trim() !== "" && procedure.trim() !== "" && followersNum > 0;

  const upload = async (
    file: File,
    field: "photo_path" | "channel_photo_path"
  ) => {
    setError(null);
    const oldPath =
      field === "photo_path"
        ? influencer.photo_path
        : influencer.channel_photo_path;
    const path = `influencers/${influencer.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .upload(path, file);
    if (upErr) {
      setError(`อัพโหลดรูปไม่สำเร็จ: ${upErr.message}`);
      return;
    }
    const { error: linkErr } = await supabase
      .from("influencers")
      .update(
        field === "photo_path"
          ? { photo_path: path }
          : { channel_photo_path: path }
      )
      .eq("id", influencer.id);
    if (linkErr) {
      // ผูกกับ DB ไม่สำเร็จ — เก็บกวาดไฟล์ที่เพิ่งอัพ (best effort)
      try {
        await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([path]);
      } catch {
        // เพิกเฉย
      }
      setError(`บันทึกรูปไม่สำเร็จ: ${linkErr.message}`);
      return;
    }
    // ลบรูปเก่าที่ถูกแทนที่ (best effort — กันไฟล์กำพร้าสะสมใน storage)
    if (oldPath) {
      try {
        await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([oldPath]);
      } catch {
        // เพิกเฉย
      }
    }
    router.refresh();
  };

  const save = async (thenNext: boolean) => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("influencers")
      .update({
        nickname: nickname.trim() || null,
        occupation: occupation.trim() || null,
        procedure_text: procedure.trim() || null,
        service_date: serviceDate === "" ? null : serviceDate,
        doctor_name: doctorName.trim() || null,
        case_value: caseValue === "" ? null : Number(caseValue),
        followers: followersNum || null,
        follower_note: followerNote.trim() || null,
        tier,
        ...(thenNext ? { stage: 3 } : {}),
      })
      .eq("id", influencer.id);
    setBusy(false);
    if (e) {
      setError(`บันทึกไม่สำเร็จ: ${e.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-stone-900">
        รายละเอียดเคส (ใช้ generate Memo ขออนุมัติใน Stage 3 อัตโนมัติ)
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
            <Label htmlFor="d-proc">หัตถการที่รับบริการ *</Label>
            <Textarea
              id="d-proc"
              rows={2}
              disabled={readOnly}
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              placeholder="เช่น โปรแกรม Oligio X 300shot, Pure collagen 1 กล่องเติมใต้ตา, Harmonyca 2 หลอด"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="d-date">วันที่เข้าทำหัตถการ</Label>
              <Input
                id="d-date"
                type="date"
                disabled={readOnly}
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-stone-400">
                ยังไม่เคาะวันได้ — เว้นว่างไว้ก่อน แล้วกลับมากรอกทีหลัง
              </p>
            </div>
            <div>
              <Label htmlFor="d-value">มูลค่า (บาท)</Label>
              <Input
                id="d-value"
                type="number"
                min="0"
                disabled={readOnly}
                value={caseValue}
                onChange={(e) => setCaseValue(e.target.value)}
                placeholder="78200"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="d-doc">แพทย์ที่รับเคส</Label>
            <Input
              id="d-doc"
              disabled={readOnly}
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="เช่น นพ.ปิยะวัฒน์ วรสิงห์"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              Tier (คำนวณอัตโนมัติจากยอดผู้ติดตาม):
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

        <div className="grid grid-cols-2 gap-3 self-start">
          <PhotoBox
            label="รูป Influencer"
            url={photoUrl}
            disabled={readOnly}
            onPick={(f) => void upload(f, "photo_path")}
          />
          <PhotoBox
            label="รูปช่องทาง (Channel)"
            url={channelUrl}
            disabled={readOnly}
            onPick={(f) => void upload(f, "channel_photo_path")}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {!readOnly &&
        (influencer.stage > 2 ? (
          // เลย Stage 2 มาแล้ว: แก้ข้อมูลได้แต่ห้ามมีปุ่ม "ไป Stage 3" — save(true) ตั้ง stage=3
          // จะดึงเคสที่อยู่ stage 4-6 ถอยหลัง
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              แก้ไขได้แม้เลยขั้นตอนนี้มาแล้ว — ข้อความ Memo ใน Stage 3
              อัพเดทตาม แต่เอกสารที่พิมพ์/อัพโหลดไปแล้วไม่เปลี่ยน
            </p>
            <Button loading={busy} onClick={() => void save(false)}>
              บันทึกการแก้ไข
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => void save(false)}
            >
              บันทึกร่าง
            </Button>
            <Button
              loading={busy}
              disabled={!canProceed}
              onClick={() => void save(true)}
            >
              <ArrowRight size={16} />
              บันทึก + ไป Stage 3 (สร้าง Memo)
            </Button>
          </div>
        ))}
    </Card>
  );
}

/* ============ Stage 5: วันเข้ารับบริการ — แก้หัตถการหน้างานได้ ============ */

function ServiceDayStage({
  influencer,
  readOnly,
}: {
  influencer: InfluencerRow;
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [editOpen, setEditOpen] = useState(false);
  const [newProcedure, setNewProcedure] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [padOpen, setPadOpen] = useState(false);
  const [savingChange, setSavingChange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = influencer.procedure_history ?? [];

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
    const change: ProcedureChange = {
      old: fresh?.procedure_text ?? influencer.procedure_text ?? "",
      next: newProcedure.trim(),
      signed_by: supervisor.trim(),
      signature_data: signatureData,
      changed_at: new Date().toISOString(),
    };
    const { error: e } = await supabase
      .from("influencers")
      .update({
        procedure_text: newProcedure.trim(),
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
    setNewProcedure("");
    setSupervisor("");
    router.refresh();
  };

  const [goingNext, setGoingNext] = useState(false);
  const goNext = async () => {
    if (goingNext) return;
    setGoingNext(true);
    setError(null);
    // สร้างงาน follow up 10 step ก่อน — ถ้าล้ม อย่าเพิ่งข้าม stage (ไม่งั้นค้าง stage 6 แบบไม่มีงาน)
    const genErr = await generateFollowupTasks(supabase, influencer);
    if (genErr) {
      setGoingNext(false);
      setError(`สร้างงาน follow up ไม่สำเร็จ: ${genErr} — ลองกดอีกครั้ง`);
      return;
    }
    const { error: e } = await supabase
      .from("influencers")
      .update({ stage: 6 })
      .eq("id", influencer.id);
    setGoingNext(false);
    if (e) {
      setError(`บันทึกไม่สำเร็จ: ${e.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-stone-900">
          หัตถการที่รับบริการ (แก้ไขหน้างานได้ — ต้องมีหัวหน้างานลงนามกำกับ)
        </h2>
        <p className="mb-4 text-xs text-stone-400">
          หากหน้างานมีการเปลี่ยนบริการ ให้กดแก้ไข — รายการเดิมจะถูกขีดฆ่า
          เขียนรายการใหม่ต่อ พร้อมแปะลายเซนหัวหน้างานกำกับข้างๆ
          แบบเดียวกับแก้เอกสารจริง
        </p>

        <div className="space-y-2 rounded-xl border border-stone-200 bg-white/80 px-4 py-3 text-sm leading-7">
          {history.map((h, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3">
              <span className="text-stone-400 line-through decoration-blue-700 decoration-2">
                {h.old || "(ว่าง)"}
              </span>
              <span className="font-medium text-blue-700">→ {h.next}</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.signature_data}
                  alt={`ลายเซน ${h.signed_by}`}
                  className="h-8 object-contain"
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
            className={
              history.length > 0
                ? "font-medium text-stone-900"
                : "text-stone-800"
            }
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
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setEditOpen(true);
              }}
            >
              <PenLine size={15} />
              แก้ไขหัตถการ (ต้องลงนามหัวหน้างาน)
            </Button>
            <Button loading={goingNext} onClick={() => void goNext()}>
              <ArrowRight size={16} />
              เรียบร้อย — ไป Stage 6 (Follow up งาน)
            </Button>
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
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500 line-through">
              {influencer.procedure_text || "-"}
            </p>
          </div>
          <div>
            <Label htmlFor="np">หัตถการใหม่ *</Label>
            <Textarea
              id="np"
              rows={2}
              value={newProcedure}
              onChange={(e) => setNewProcedure(e.target.value)}
              placeholder="เช่น Ultraformer III 300 shot"
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
              disabled={newProcedure.trim() === "" || supervisor.trim() === ""}
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

/* ============ Stage 6: ติดตามงาน — 2 โหมด (มาตรฐาน / แพ็คเกจเฉพาะ) ============ */

function FollowupStage({
  influencer,
  tasks: allTasks,
  readOnly,
}: {
  influencer: InfluencerRow;
  /** ข้อของทั้ง 2 โหมด — โหมดที่ไม่ได้ใช้ถูกซ่อน (ไม่ถูกลบ) */
  tasks: InfluTaskRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [switching, setSwitching] = useState(false);

  const mode = influencer.followup_mode;
  const tasks = useMemo(
    () => activeFollowupTasks(mode, allTasks),
    [mode, allTasks]
  );
  const hiddenCount = allTasks.length - tasks.length;

  /** step ถัดไปของข้อที่พิมพ์เอง — กันเลข 1..23 ไว้ให้เทมเพลตมาตรฐานเสมอ
      (unique influencer_id+step: ถ้าข้อ custom ไปกินเลข 1 เทมเพลตจะ insert ทับไม่ได้) */
  const nextCustomStep = useMemo(
    () => Math.max(INFLU_CHECKLIST.length, 0, ...allTasks.map((t) => t.step)) + 1,
    [allTasks]
  );

  const switchMode = async (next: InfluFollowupMode) => {
    if (readOnly || switching || next === mode) return;
    setSwitching(true);
    setErr(null);
    const { error } = await supabase
      .from("influencers")
      .update({ followup_mode: next })
      .eq("id", influencer.id);
    setSwitching(false);
    if (error) {
      setErr(`เปลี่ยนโหมดไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  const doneCount = tasks.filter((t) => t.done).length;
  /** จำนวนวันจากวันนี้ถึงกำหนด — ติดลบ = เลยกำหนดแล้ว */
  const daysLeft = (due: string) =>
    Math.round(
      (new Date(due.slice(0, 10)).getTime() - new Date(today).getTime()) /
        86400000
    );
  // แจ้งเตือนเฉพาะข้อที่มีกำหนดเวลา: เลยกำหนด หรือใกล้ถึงกำหนด (≤ 7 วัน)
  const overdueCount = tasks.filter(
    (t) => !t.done && t.due_date && daysLeft(t.due_date) < 0
  ).length;
  const soonCount = tasks.filter(
    (t) =>
      !t.done &&
      t.due_date != null &&
      daysLeft(t.due_date) >= 0 &&
      daysLeft(t.due_date) <= 7
  ).length;
  // โหมดแพ็คเกจเฉพาะที่ยังไม่ได้เพิ่มข้อไหนเลย (เช่น ตกลงกันเป็น note ล้วน) ต้องปิดงานได้
  // — ไม่งั้นเคสค้างที่ stage 6 ตลอดไป; โหมดมาตรฐานยังต้องมีข้อครบเหมือนเดิม
  const allDone =
    mode === "custom"
      ? doneCount === tasks.length
      : tasks.length > 0 && doneCount === tasks.length;

  // จัดกลุ่มตามหมวดของเอกสาร — งานจากเทมเพลตเดิม (ไม่มีหมวด) แสดงท้ายสุด
  const groups = useMemo(() => {
    const gs: { section: string; rows: InfluTaskRow[] }[] = [];
    for (const sec of INFLU_CHECKLIST_SECTIONS) {
      const rows = tasks
        .filter((t) => t.section === sec)
        .sort((a, b) => a.step - b.step);
      if (rows.length > 0) gs.push({ section: sec, rows });
    }
    const legacy = tasks
      .filter(
        (t) => !t.section || !INFLU_CHECKLIST_SECTIONS.includes(t.section)
      )
      .sort((a, b) => a.step - b.step);
    if (legacy.length > 0) {
      gs.push({ section: "รายการติดตามงาน (เทมเพลตเดิม)", rows: legacy });
    }
    return gs;
  }, [tasks]);

  const toggleDone = async (t: InfluTaskRow) => {
    if (readOnly) return;
    setErr(null);
    const { error } = await supabase
      .from("influ_tasks")
      .update({
        done: !t.done,
        done_at: !t.done ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  const saveDescription = async (t: InfluTaskRow, value: string) => {
    if (readOnly) return;
    if ((t.description ?? "") === value.trim()) return;
    setErr(null);
    const { error } = await supabase
      .from("influ_tasks")
      .update({ description: value.trim() || null })
      .eq("id", t.id);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  const startEditTitle = (t: InfluTaskRow) => {
    if (readOnly) return;
    setEditingTitleId(t.id);
    setTitleDraft(t.title);
  };

  const saveTitle = async (t: InfluTaskRow) => {
    if (readOnly) return;
    const value = titleDraft.trim();
    if (!value) {
      setErr("ชื่อรายการห้ามเว้นว่าง");
      return;
    }
    if (value === t.title) {
      setEditingTitleId(null);
      return;
    }
    setErr(null);
    const { error } = await supabase
      .from("influ_tasks")
      .update({ title: value })
      .eq("id", t.id);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setEditingTitleId(null);
    router.refresh();
  };

  /* self-heal: แถวเก่าที่หลุดมา stage 6 โดยไม่มีงาน (เช่น insert ล้มกลางทาง) สร้างใหม่ได้ */
  const regenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setErr(null);
    const genErr = await generateFollowupTasks(supabase, influencer);
    setGenerating(false);
    if (genErr) {
      setErr(`สร้างงานไม่สำเร็จ: ${genErr}`);
      return;
    }
    router.refresh();
  };

  const copyScript = async (t: InfluTaskRow) => {
    try {
      await navigator.clipboard.writeText(t.script ?? "");
      setCopiedId(t.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt("คัดลอก script ด้วยตนเอง:", t.script ?? "");
    }
  };

  const finish = async () => {
    setErr(null);
    const { error } = await supabase
      .from("influencers")
      .update({ completed: true })
      .eq("id", influencer.id);
    if (error) {
      setErr(`ปิดงานไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  const contractEnd = influencer.contract_start
    ? contractEndDate(influencer.contract_start, influencer.contract_months)
    : null;

  return (
    <div className="space-y-4">
      {/* เลือกโหมด — เคสดารา/จ่ายค่าตัว เงื่อนไขไม่เหมือนเคสแลกหัตถการ */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-medium text-stone-500">
            โหมดติดตามงาน
          </span>
          <div className="flex gap-1 rounded-full bg-stone-100/80 p-1">
            {INFLU_FOLLOWUP_MODE_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                disabled={readOnly || switching}
                onClick={() => void switchMode(m)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  readOnly || switching
                    ? "cursor-default"
                    : "cursor-pointer active:scale-[0.97]"
                } ${
                  mode === m
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                    : "text-stone-500 hover:bg-white/70 hover:text-stone-700"
                }`}
              >
                {INFLU_FOLLOWUP_MODES[m].label}
              </button>
            ))}
          </div>
          <p className="min-w-0 flex-1 text-xs text-stone-400">
            {INFLU_FOLLOWUP_MODES[mode].hint}
          </p>
        </div>
        {hiddenCount > 0 && (
          <p className="mt-2 text-[11px] text-stone-400">
            อีกโหมดมี {hiddenCount} ข้อซ่อนอยู่ — ไม่ได้ถูกลบ
            สลับกลับมาเมื่อไหร่ก็เห็นเหมือนเดิม
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-brand-50 text-brand-700">
          ทำแล้ว {doneCount}/{tasks.length} ข้อ
        </Badge>
        {overdueCount > 0 && (
          <Badge className="border border-rose-200 bg-rose-50 text-rose-700">
            <BellRing size={12} /> เลยกำหนด {overdueCount} รายการ
          </Badge>
        )}
        {soonCount > 0 && (
          <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
            <BellRing size={12} /> ใกล้ถึงกำหนด {soonCount} รายการ
          </Badge>
        )}
        {contractEnd && (
          <span className="text-xs text-stone-500">
            สัญญาใช้คอนเทนต์ถึง{" "}
            <span className="font-medium text-stone-700">
              {formatDate(contractEnd)}
            </span>{" "}
            —{" "}
            <Link
              href="/influencers/contracts"
              className="text-brand-600 hover:underline"
            >
              ดูหน้าอายุสัญญา & Campaign
            </Link>
          </span>
        )}
        {influencer.completed ? (
          <Badge className="ml-auto border border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={12} /> ปิดงานแล้ว
          </Badge>
        ) : (
          allDone && (
            <Button className="ml-auto" onClick={() => void finish()}>
              <CheckCircle2 size={16} />
              ครบทุก step — ปิดงาน
            </Button>
          )
        )}
      </div>

      {err && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}

      {mode === "custom" ? (
        <PackageStage
          influencer={influencer}
          tasks={tasks}
          nextStep={nextCustomStep}
          readOnly={readOnly}
        />
      ) : (
        <StandardChecklist
          tasks={tasks}
          groups={groups}
          readOnly={readOnly}
          generating={generating}
          today={today}
          copiedId={copiedId}
          editingTitleId={editingTitleId}
          titleDraft={titleDraft}
          setTitleDraft={setTitleDraft}
          onCancelEditTitle={() => setEditingTitleId(null)}
          onStartEditTitle={startEditTitle}
          onSaveTitle={saveTitle}
          onToggleDone={toggleDone}
          onCopyScript={copyScript}
          onDraftChange={(id, value) =>
            setDrafts((d) => ({ ...d, [id]: value }))
          }
          onSaveDescription={(t) =>
            saveDescription(t, drafts[t.id] ?? t.description ?? "")
          }
          onRegenerate={regenerate}
        />
      )}
    </div>
  );
}

/** checklist 5 หมวดตามเอกสารแนบท้ายสัญญา (โหมดมาตรฐาน) — state/handler อยู่ที่ FollowupStage
    เพราะโหมดสลับไปมาได้ ต้องนับ done/overdue รวมที่เดียว */
function StandardChecklist({
  tasks,
  groups,
  readOnly,
  generating,
  today,
  copiedId,
  editingTitleId,
  titleDraft,
  setTitleDraft,
  onCancelEditTitle,
  onStartEditTitle,
  onSaveTitle,
  onToggleDone,
  onCopyScript,
  onDraftChange,
  onSaveDescription,
  onRegenerate,
}: {
  tasks: InfluTaskRow[];
  groups: { section: string; rows: InfluTaskRow[] }[];
  readOnly: boolean;
  generating: boolean;
  today: string;
  copiedId: string | null;
  editingTitleId: string | null;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  onCancelEditTitle: () => void;
  onStartEditTitle: (t: InfluTaskRow) => void;
  onSaveTitle: (t: InfluTaskRow) => void | Promise<void>;
  onToggleDone: (t: InfluTaskRow) => void | Promise<void>;
  onCopyScript: (t: InfluTaskRow) => void | Promise<void>;
  onDraftChange: (id: string, value: string) => void;
  onSaveDescription: (t: InfluTaskRow) => void | Promise<void>;
  onRegenerate: () => void | Promise<void>;
}) {
  const daysLeft = (due: string) =>
    Math.round(
      (new Date(due.slice(0, 10)).getTime() - new Date(today).getTime()) /
        86400000
    );

  return (
    <>
      {tasks.length === 0 && !readOnly && (
        <Card className="p-6 text-center">
          <p className="text-sm text-stone-500">
            ยังไม่มี checklist ติดตามงานของรายนี้ (อาจสร้างไม่สำเร็จตอนข้าม stage)
          </p>
          <Button
            className="mt-3"
            loading={generating}
            onClick={() => void onRegenerate()}
          >
            สร้าง checklist ติดตามงาน (5 หมวด)
          </Button>
        </Card>
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.section} className="overflow-hidden">
            {/* หัวหมวดโทนชมพูแบบเอกสารจริง */}
            <div className="bg-gradient-to-r from-brand-500 to-brand-400 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-cream">{g.section}</h3>
            </div>
            <div className="divide-y divide-stone-100/80">
              {g.rows.map((t, idx) => {
                const dl = t.due_date ? daysLeft(t.due_date) : null;
                return (
                  <div
                    key={t.id}
                    className={`px-4 py-3 ${t.done ? "opacity-70" : ""}`}
                  >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => void onToggleDone(t)}
                  title={t.done ? "ยกเลิกติ๊ก" : "ติ๊กว่า follow up แล้ว"}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-all active:scale-90 disabled:cursor-default ${
                    t.done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-stone-300 bg-white text-transparent hover:border-emerald-400"
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {editingTitleId === t.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-sm font-medium text-stone-400">
                          {idx + 1}.
                        </span>
                        <input
                          autoFocus
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void onSaveTitle(t);
                            } else if (e.key === "Escape") {
                              onCancelEditTitle();
                            }
                          }}
                          className="min-w-[12rem] rounded-md border border-brand-300 bg-white px-2 py-1 text-sm font-medium text-stone-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <button
                          type="button"
                          onClick={() => void onSaveTitle(t)}
                          title="บันทึกชื่อ"
                          className="cursor-pointer rounded-md p-1 text-emerald-600 transition-all hover:bg-emerald-50 active:scale-90"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEditTitle}
                          title="ยกเลิก"
                          className="cursor-pointer rounded-md p-1 text-stone-400 transition-all hover:bg-stone-100 active:scale-90"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <p
                          className={`text-sm font-medium ${
                            t.done
                              ? "text-stone-400 line-through"
                              : "text-stone-900"
                          }`}
                        >
                          {idx + 1}. {t.title}
                        </p>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => onStartEditTitle(t)}
                            title="แก้ไขชื่อรายการ"
                            className="cursor-pointer rounded-md p-1 text-stone-300 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90"
                          >
                            <PenLine size={13} />
                          </button>
                        )}
                      </span>
                    )}
                    {/* เคาน์ดาวน์เฉพาะข้อที่มีกำหนดเวลา — เตือนเมื่อเหลือ ≤ 7 วัน */}
                    {t.due_date && dl !== null && !t.done && (
                      dl < 0 ? (
                        <Badge className="border border-rose-200 bg-rose-50 text-rose-700">
                          <BellRing size={11} /> เลยกำหนด {Math.abs(dl)} วัน (
                          {formatDate(t.due_date)})
                        </Badge>
                      ) : dl === 0 ? (
                        <Badge className="border border-amber-300 bg-amber-50 text-amber-700">
                          <BellRing size={11} /> ครบกำหนดวันนี้
                        </Badge>
                      ) : dl <= 7 ? (
                        <Badge className="border border-amber-300 bg-amber-50 text-amber-700">
                          <BellRing size={11} /> อีก {dl} วัน — กำหนด{" "}
                          {formatDate(t.due_date)}
                        </Badge>
                      ) : (
                        <Badge className="bg-stone-100 text-stone-500">
                          กำหนด {formatDate(t.due_date)} (อีก {dl} วัน)
                        </Badge>
                      )
                    )}
                    {t.due_date && t.done && (
                      <Badge className="bg-stone-100 text-stone-400">
                        กำหนด {formatDate(t.due_date)}
                      </Badge>
                    )}
                    {t.channel && (
                      <Badge className="bg-sky-50 text-sky-700">
                        <Send size={11} /> {t.channel}
                      </Badge>
                    )}
                  </div>

                  {t.script && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-white/75 px-3 py-2">
                      <p className="min-w-0 flex-1 text-xs leading-5 text-stone-600">
                        {t.script}
                      </p>
                      <button
                        type="button"
                        onClick={() => void onCopyScript(t)}
                        title="คัดลอก script"
                        className={`shrink-0 cursor-pointer rounded-md p-1.5 transition-all active:scale-90 ${
                          copiedId === t.id
                            ? "text-emerald-600"
                            : "text-stone-400 hover:bg-brand-50 hover:text-brand-600"
                        }`}
                      >
                        {copiedId === t.id ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  )}

                  <input
                    defaultValue={t.description ?? ""}
                    disabled={readOnly}
                    placeholder="+ เพิ่มหมายเหตุ เช่น ส่งไฟล์แล้ว รอทีมตรวจ..."
                    onChange={(e) => onDraftChange(t.id, e.target.value)}
                    onBlur={() => void onSaveDescription(t)}
                    className="mt-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-stone-700 placeholder:text-stone-300 transition-colors hover:border-stone-200 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  {t.done && t.done_at && (
                    <p className="mt-1 text-[11px] text-emerald-600">
                      ✓ ทำแล้วเมื่อ {formatDateTime(t.done_at)}
                    </p>
                  )}
                </div>
              </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {tasks.length > 0 && (
        <p className="mt-4 text-xs text-stone-400">
          ทั้งหมด {formatNumber(tasks.length)} ข้อ —
          ข้อที่มีกำหนดเวลาจะเริ่มนับจากวันที่เข้าสู่ stage นี้
          และขึ้นป้ายเตือนเมื่อใกล้ถึงกำหนด (เหลือ ≤ 7 วัน) หรือเลยกำหนด
          ส่วนข้อที่ไม่มีกำหนดเวลาไม่มีการแจ้งเตือน
        </p>
      )}
    </>
  );
}
