"use client";

import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  ImagePlus,
  MessageSquarePlus,
  PenLine,
  PhoneCall,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  formatDate,
  formatDateTime,
  formatNumber,
  todayISO,
} from "@/lib/format";
import {
  contractEndDate,
  FOLLOWUP_TEMPLATE,
  INFLU_STAGES,
  INFLU_TIERS,
  tierFromFollowers,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluencerRow,
  InfluFollowupRow,
  InfluSignatureRow,
  InfluTaskRow,
  ProcedureChange,
} from "@/lib/types";
import { useSignedUrl } from "../use-signed-url";
import { ContractStage, MemoStage } from "./docs-stages";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** สร้างงาน follow up 10 step จาก template (idempotent) — คืน error message ถ้าล้ม */
async function generateFollowupTasks(
  supabase: ReturnType<typeof createClient>,
  influencer: InfluencerRow
): Promise<string | null> {
  const { data: existing, error: exErr } = await supabase
    .from("influ_tasks")
    .select("id")
    .eq("influencer_id", influencer.id)
    .limit(1);
  if (exErr) return exErr.message;
  if (existing && existing.length > 0) return null;

  const base = influencer.service_date ?? todayISO();
  const nick = influencer.nickname || influencer.first_name;
  const addDays = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const { error } = await supabase.from("influ_tasks").insert(
    FOLLOWUP_TEMPLATE.map((t) => ({
      influencer_id: influencer.id,
      step: t.step,
      title: t.title,
      script: t.script.replaceAll("{ชื่อเล่น}", nick),
      channel: t.channel.replaceAll("{ชื่อเล่น}", nick),
      due_date: addDays(base, t.offsetDays),
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

/* ================================================================== */

export function InfluDetailClient({
  influencer,
  followups,
  signatures,
  tasks,
  userName,
}: {
  influencer: InfluencerRow;
  followups: InfluFollowupRow[];
  signatures: InfluSignatureRow[];
  tasks: InfluTaskRow[];
  userName: string;
}) {
  const [viewStage, setViewStage] = useState(influencer.stage);
  // เมื่อ stage เลื่อน (หลัง router.refresh) ให้พาไปหน้าของ stage ใหม่เสมอ
  useEffect(() => setViewStage(influencer.stage), [influencer.stage]);
  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");

  const maxStage = influencer.completed ? 6 : influencer.stage;
  const readOnly = viewStage < influencer.stage || influencer.completed;

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
        <h1 className="text-xl font-semibold text-stone-900">
          คุณ{fullName}
          {influencer.nickname && (
            <span className="text-stone-400"> ({influencer.nickname})</span>
          )}
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
      </div>

      {/* stepper */}
      <div className="mb-6 flex flex-wrap gap-2 animate-fade-in-up">
        {INFLU_STAGES.map((s) => {
          const passed = influencer.completed || influencer.stage > s.step;
          const current = !influencer.completed && influencer.stage === s.step;
          const clickable = s.step <= maxStage;
          return (
            <button
              key={s.step}
              type="button"
              disabled={!clickable}
              onClick={() => setViewStage(s.step)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                clickable ? "cursor-pointer active:scale-[0.97]" : "cursor-not-allowed opacity-50"
              } ${
                viewStage === s.step
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
                  viewStage === s.step
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

      <div className="animate-fade-in" key={viewStage}>
        {viewStage === 1 && (
          <ContactStage
            influencer={influencer}
            followups={followups}
            readOnly={readOnly}
          />
        )}
        {viewStage === 2 && (
          <CaseDetailStage influencer={influencer} readOnly={readOnly} />
        )}
        {viewStage === 3 && (
          <MemoStage
            influencer={influencer}
            signatures={signatures}
            userName={userName}
            readOnly={readOnly}
          />
        )}
        {viewStage === 4 && (
          <ContractStage
            influencer={influencer}
            signatures={signatures}
            readOnly={readOnly}
          />
        )}
        {viewStage === 5 && (
          <ServiceDayStage influencer={influencer} readOnly={readOnly} />
        )}
        {viewStage === 6 && (
          <FollowupStage
            influencer={influencer}
            tasks={tasks}
            readOnly={influencer.completed}
          />
        )}
      </div>
    </div>
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

  const photoUrl = useSignedUrl(influencer.photo_path);
  const channelUrl = useSignedUrl(influencer.channel_photo_path);

  const followersNum = Number(followers.replace(/[^0-9]/g, "")) || 0;
  const tier = followersNum > 0 ? tierFromFollowers(followersNum) : null;

  const canProceed =
    occupation.trim() !== "" &&
    procedure.trim() !== "" &&
    serviceDate !== "" &&
    followersNum > 0;

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
              <Label htmlFor="d-date">วันที่เข้าทำหัตถการ *</Label>
              <Input
                id="d-date"
                type="date"
                disabled={readOnly}
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
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

      {!readOnly && (
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
      )}
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
  const [error, setError] = useState<string | null>(null);

  const history = influencer.procedure_history ?? [];

  const saveChange = async (signatureData: string) => {
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
    if (e) setError(`บันทึกไม่สำเร็จ: ${e.message}`);
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
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
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

/* ============ Stage 6: Follow up งาน (10 step ย่อย) ============ */

function FollowupStage({
  influencer,
  tasks,
  readOnly,
}: {
  influencer: InfluencerRow;
  tasks: InfluTaskRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const doneCount = tasks.filter((t) => t.done).length;
  const dueCount = tasks.filter(
    (t) => !t.done && t.due_date && t.due_date <= today
  ).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

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
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-brand-50 text-brand-700">
          ทำแล้ว {doneCount}/{tasks.length} step
        </Badge>
        {dueCount > 0 && (
          <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
            <BellRing size={12} /> ถึงกำหนดแล้ว {dueCount} รายการ
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

      {tasks.length === 0 && !readOnly && (
        <Card className="p-6 text-center">
          <p className="text-sm text-stone-500">
            ยังไม่มีงาน follow up ของรายนี้ (อาจสร้างไม่สำเร็จตอนข้าม stage)
          </p>
          <Button
            className="mt-3"
            loading={generating}
            onClick={() => void regenerate()}
          >
            สร้างงาน follow up 10 step
          </Button>
        </Card>
      )}

      <div className="space-y-3">
        {tasks.map((t) => {
          const overdue = !t.done && t.due_date && t.due_date <= today;
          return (
            <Card
              key={t.id}
              className={`p-4 ${t.done ? "opacity-70" : ""} ${
                overdue ? "!border-amber-300" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => void toggleDone(t)}
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
                    <p
                      className={`text-sm font-medium ${
                        t.done
                          ? "text-stone-400 line-through"
                          : "text-stone-900"
                      }`}
                    >
                      {t.step}. {t.title}
                    </p>
                    {t.due_date && (
                      <Badge
                        className={
                          overdue
                            ? "border border-amber-300 bg-amber-50 text-amber-700"
                            : "bg-stone-100 text-stone-500"
                        }
                      >
                        {overdue && <BellRing size={11} />}
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
                        onClick={() => void copyScript(t)}
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
                    placeholder="เขียน description อัพเดทงาน เช่น ทักแล้วรอคิวโพส..."
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                    }
                    onBlur={() =>
                      void saveDescription(t, drafts[t.id] ?? t.description ?? "")
                    }
                    className="mt-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-stone-700 placeholder:text-stone-300 transition-colors hover:border-stone-200 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  {t.done && t.done_at && (
                    <p className="mt-1 text-[11px] text-emerald-600">
                      ✓ follow up แล้วเมื่อ {formatDateTime(t.done_at)}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-stone-400">
        มีทั้งหมด {formatNumber(tasks.length)} step ย่อย — ระบบจะเตือน (ป้ายเหลือง)
        เมื่อถึงกำหนดของแต่ละ step และหน้ารวมรายชื่อจะแสดงจำนวนที่ต้องตามด้วย
      </p>
    </div>
  );
}
