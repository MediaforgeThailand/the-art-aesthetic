"use client";

import {
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileSignature,
  FileText,
  Images,
  PenLine,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { SignaturePad, SignatureSlot } from "@/components/signature-pad";
import { Button, Card, Input, Modal } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import {
  INFLU_CONTRACT_TEMPLATE_NAME,
  INFLU_CONTRACT_TEMPLATE_PATH,
  INFLU_TIER_ORDER,
  INFLU_TIERS,
  MEMO_COMPANY,
  MEMO_SIGNERS,
  type MemoRole,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluencerRow, InfluSignatureRow } from "@/lib/types";
import { useSignedUrl } from "../use-signed-url";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/* ---------- ปุ่มดูรูปที่อัพโหลดไว้ (รูป influ + รูปช่องทาง) ---------- */

export function PhotosModal({
  influencer,
  open,
  onClose,
}: {
  influencer: InfluencerRow;
  open: boolean;
  onClose: () => void;
}) {
  const photoUrl = useSignedUrl(open ? influencer.photo_path : null);
  const channelUrl = useSignedUrl(open ? influencer.channel_photo_path : null);

  return (
    <Modal open={open} onClose={onClose} title="รูปภาพของ Influencer" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "รูป Influencer", url: photoUrl, path: influencer.photo_path },
          {
            label: "รูปช่องทาง (Channel)",
            url: channelUrl,
            path: influencer.channel_photo_path,
          },
        ].map((p) => (
          <div key={p.label}>
            <p className="mb-2 text-xs font-medium text-stone-500">{p.label}</p>
            {p.path ? (
              p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt={p.label}
                  className="w-full rounded-xl border border-stone-200 object-contain"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-stone-100 text-xs text-stone-400">
                  กำลังโหลด...
                </div>
              )
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-stone-200 text-xs text-stone-400">
                ยังไม่ได้อัพโหลด (กลับไปอัพโหลดใน Stage 2)
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- Stage 3: Memo ขออนุมัติ ---------- */

export function MemoStage(props: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  userName: string;
  readOnly: boolean;
}) {
  // โหมดแบบฟอร์มดิจิทัล (MemoFormStage) เก็บโค้ดไว้แต่ยังไม่เปิดใช้ — Coming soon
  const [mode] = useState<"copy" | "form">("copy");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
            mode === "copy"
              ? "cursor-default bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
              : "cursor-pointer border border-stone-200 bg-white/50 text-stone-500"
          }`}
        >
          <ClipboardList size={15} />
          คัดลอกข้อความไปสร้าง Memo
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex cursor-not-allowed items-center gap-2 rounded-full border border-stone-200 bg-white/50 px-3.5 py-2 text-sm font-medium text-stone-400 opacity-70"
        >
          <FileSignature size={15} />
          แบบฟอร์มดิจิทัล (เซนในระบบ)
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Coming soon
          </span>
        </button>
      </div>

      {mode === "copy" ? (
        <MemoCopyStage {...props} />
      ) : (
        <MemoFormStage {...props} />
      )}
    </div>
  );
}

/* ---------- กล่องข้อความพร้อมปุ่มคัดลอก ---------- */

function CopyBox({
  label,
  text,
  multiline = false,
}: {
  label: string;
  text: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // เบราว์เซอร์ที่ไม่รองรับ clipboard API — fallback ผ่าน textarea ชั่วคราว
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-600">{label}</p>
        <Button
          variant="ghost"
          onClick={() => void copy()}
          className="!px-2.5 !py-1 !text-xs"
        >
          {copied ? (
            <Check size={13} className="text-emerald-600" />
          ) : (
            <Copy size={13} />
          )}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </Button>
      </div>
      <div
        className={`rounded-xl border border-stone-200 bg-white/80 px-3.5 py-2.5 text-[13px] leading-6 text-stone-800 ${
          multiline ? "whitespace-pre-wrap" : ""
        }`}
      >
        {text}
      </div>
    </div>
  );
}

/* ---------- โหมดคัดลอกข้อความ: เรื่อง / เรียน / รายละเอียด + รูปพร้อมดาวน์โหลด ---------- */

function MemoCopyStage({
  influencer,
  readOnly,
}: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  userName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const memoInputRef = useRef<HTMLInputElement>(null);
  const photoUrl = useSignedUrl(influencer.photo_path);
  const channelUrl = useSignedUrl(influencer.channel_photo_path);

  const memoUploaded = !!influencer.memo_file_path;

  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");
  const nameWithNick = `คุณ${fullName}${
    influencer.nickname ? ` (ชื่อเล่น : ${influencer.nickname})` : ""
  }`;

  const subjectText = `ขออนุมัติเคสทางการตลาด ${nameWithNick}`;
  const tierText = influencer.tier
    ? `${INFLU_TIERS[influencer.tier].label} (${INFLU_TIERS[influencer.tier].range})`
    : "-";
  const detailText = [
    MEMO_COMPANY.purpose,
    "",
    `ชื่อ-นามสกุล : ${nameWithNick}`,
    `อาชีพ : ${influencer.occupation || "-"}`,
    `หัตถการที่รับบริการ : ${influencer.procedure_text || "-"}`,
    `มูลค่า : ${
      influencer.case_value != null
        ? formatCurrency(influencer.case_value)
        : "-"
    }`,
    `วันที่ทำหัตถการ : ${
      influencer.service_date ? formatDate(influencer.service_date) : "-"
    }`,
    `ยอดผู้ติดตาม : ${
      influencer.follower_note ||
      (influencer.followers != null
        ? formatNumber(influencer.followers)
        : "-")
    }`,
    `Tier : ${tierText}`,
    "",
    "จึงเรียนมาเพื่อพิจารณาอนุมัติ",
  ].join("\n");

  const download = async (path: string, label: string, saveAs?: string) => {
    setError(null);
    setDownloading(path);
    const { data, error: e } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .download(path);
    setDownloading(null);
    if (e || !data) {
      setError(`ดาวน์โหลดไฟล์ไม่สำเร็จ${e ? `: ${e.message}` : ""}`);
      return;
    }
    const ext = path.includes(".")
      ? path.slice(path.lastIndexOf(".") + 1)
      : "jpg";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download =
      saveAs ??
      `${label}-${influencer.nickname || influencer.first_name}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const uploadMemo = async (file: File) => {
    setError(null);
    setUploading(true);
    const oldPath = influencer.memo_file_path;
    const path = `influencers/${influencer.id}/memo/${Date.now()}_${sanitizeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .upload(path, file);
    if (upErr) {
      setUploading(false);
      setError(`อัพโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`);
      return;
    }
    const { error: linkErr } = await supabase
      .from("influencers")
      .update({
        memo_file_path: path,
        memo_file_name: file.name,
        memo_uploaded_at: new Date().toISOString(),
      })
      .eq("id", influencer.id);
    setUploading(false);
    if (linkErr) {
      // ผูกกับ DB ไม่สำเร็จ — เก็บกวาดไฟล์ที่เพิ่งอัพ (best effort)
      try {
        await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([path]);
      } catch {
        // เพิกเฉย
      }
      setError(`บันทึกไฟล์ไม่สำเร็จ: ${linkErr.message}`);
      return;
    }
    // ลบไฟล์เก่าที่ถูกแทนที่ (best effort — กันไฟล์กำพร้าสะสมใน storage)
    if (oldPath) {
      try {
        await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([oldPath]);
      } catch {
        // เพิกเฉย
      }
    }
    router.refresh();
  };

  const goNext = async () => {
    if (!memoUploaded) return;
    if (
      !window.confirm("ยืนยันว่า Memo ได้รับอนุมัติแล้ว และไป Stage 4 (สัญญา)?")
    )
      return;
    const { error: e } = await supabase
      .from("influencers")
      .update({ stage: 4 })
      .eq("id", influencer.id);
    if (e) {
      setError(`ไป stage ถัดไปไม่สำเร็จ: ${e.message}`);
      return;
    }
    router.refresh();
  };

  const photos = [
    { label: "รูป Influencer", url: photoUrl, path: influencer.photo_path },
    {
      label: "รูปช่องทาง (Channel)",
      url: channelUrl,
      path: influencer.channel_photo_path,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
        <ClipboardList size={14} className="shrink-0" />
        คัดลอกข้อความแต่ละส่วนด้านล่างไปสร้างเอกสาร Memo ตามฟอร์มของบริษัท —
        เมื่อ Memo ได้รับอนุมัติแล้ว ให้อัพโหลดไฟล์กลับเข้ามาเก็บไว้ที่นี่
        จึงจะไป Stage ถัดไปได้
      </p>

      <Card className="space-y-4 p-5">
        <CopyBox label="เรื่อง" text={subjectText} />
        <CopyBox label="เรียน" text={MEMO_COMPANY.to} />
        <CopyBox label="รายละเอียด" text={detailText} multiline />
      </Card>

      {/* รายชื่อผู้ตรวจสอบ/ผู้อนุมัติ — แสดงอย่างเดียว ไม่มีปุ่มคัดลอก */}
      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold text-stone-600">
          รายชื่อผู้ตรวจสอบและผู้อนุมัติ
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {MEMO_SIGNERS.filter((s) => s.role !== "maker").map((s) => (
            <div
              key={s.role}
              className="rounded-xl border border-stone-200 bg-white/70 px-3.5 py-2.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                {s.heading}
              </p>
              <p className="mt-0.5 text-sm font-medium text-stone-800">
                {s.name}
              </p>
              {s.position && (
                <p className="text-xs text-stone-500">{s.position}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* รูปที่อัพโหลดไว้ + ปุ่มดาวน์โหลดทุกรูป */}
      <Card className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <Images size={14} />
          รูปที่อัพโหลดไว้
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {photos.map((p) => (
            <div key={p.label}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-stone-500">{p.label}</p>
                {p.path && (
                  <Button
                    variant="secondary"
                    onClick={() => void download(p.path!, p.label)}
                    loading={downloading === p.path}
                    className="!px-2.5 !py-1 !text-xs"
                  >
                    <Download size={13} />
                    ดาวน์โหลด
                  </Button>
                )}
              </div>
              {p.path ? (
                p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={p.label}
                    className="w-full rounded-xl border border-stone-200 object-contain"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-xl bg-stone-100 text-xs text-stone-400">
                    กำลังโหลด...
                  </div>
                )
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-stone-200 text-xs text-stone-400">
                  ยังไม่ได้อัพโหลด (กลับไปอัพโหลดใน Stage 2)
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ไฟล์ Memo ที่อนุมัติแล้ว — อัพโหลดเก็บไว้ที่นี่ จึงจะไป stage ถัดไปได้ */}
      <Card className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <FileText size={14} />
          ไฟล์ Memo ที่อนุมัติแล้ว
        </p>
        {memoUploaded ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-800">
                {influencer.memo_file_name || "ไฟล์ Memo"}
              </p>
              {influencer.memo_uploaded_at && (
                <p className="text-xs text-stone-500">
                  อัพโหลดเมื่อ {formatDateTime(influencer.memo_uploaded_at)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  void download(
                    influencer.memo_file_path!,
                    "Memo",
                    influencer.memo_file_name ?? undefined
                  )
                }
                loading={downloading === influencer.memo_file_path}
                className="!px-2.5 !py-1 !text-xs"
              >
                <Download size={13} />
                ดาวน์โหลด
              </Button>
              {!readOnly && (
                <Button
                  variant="ghost"
                  onClick={() => memoInputRef.current?.click()}
                  loading={uploading}
                  className="!px-2.5 !py-1 !text-xs"
                >
                  <Upload size={13} />
                  เปลี่ยนไฟล์
                </Button>
              )}
            </div>
          </div>
        ) : readOnly ? (
          <p className="text-xs text-stone-400">ยังไม่มีไฟล์</p>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => memoInputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 bg-white/60 px-4 py-8 text-xs text-stone-400 transition-colors hover:border-brand-400 hover:bg-brand-50/40 disabled:cursor-wait"
          >
            <Upload size={22} />
            {uploading
              ? "กำลังอัพโหลด..."
              : "กดเพื่ออัพโหลดไฟล์ Memo ที่อนุมัติแล้ว (PDF / รูปภาพ / Word)"}
          </button>
        )}
        {!readOnly && (
          <input
            ref={memoInputRef}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadMemo(f);
              e.target.value = "";
            }}
          />
        )}
      </Card>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            {memoUploaded
              ? "อัพโหลดไฟล์ Memo แล้ว — ไป Stage ถัดไปได้เลย"
              : "ต้องอัพโหลดไฟล์ Memo ที่อนุมัติแล้วก่อน จึงจะไป Stage ถัดไปได้"}
          </p>
          <Button onClick={() => void goNext()} disabled={!memoUploaded}>
            <CheckCircle2 size={16} />
            Memo อนุมัติแล้ว — ไป Stage 4 (สัญญา)
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- แบบฟอร์มดิจิทัล (จำลองแบบฟอร์มจริง) — เก็บโค้ดไว้ ยังไม่เปิดใช้ (Coming soon) ---------- */

export function MemoFormStage({
  influencer,
  signatures,
  userName,
  readOnly,
}: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  userName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [signingRole, setSigningRole] = useState<MemoRole | null>(null);
  const [makerName, setMakerName] = useState(
    influencer.maker_name || userName
  );
  const [photosOpen, setPhotosOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoUrl = useSignedUrl(influencer.photo_path);
  const channelUrl = useSignedUrl(influencer.channel_photo_path);

  const memoSigs = useMemo(() => {
    const map = new Map<string, InfluSignatureRow>();
    for (const s of signatures) {
      if (s.doc === "memo") map.set(s.role, s);
    }
    return map;
  }, [signatures]);

  const allSigned = MEMO_SIGNERS.every((s) => memoSigs.has(s.role));

  const saveSignature = async (dataUrl: string) => {
    if (!signingRole) return;
    const preset = MEMO_SIGNERS.find((s) => s.role === signingRole);
    const signerName =
      signingRole === "maker" ? makerName.trim() || userName : preset?.name;
    setSigningRole(null);
    setError(null);
    // ผู้จัดทำ: บันทึกชื่อลง influencer ด้วย (โชว์ในเอกสารถาวร)
    if (signingRole === "maker" && makerName.trim() !== influencer.maker_name) {
      await supabase
        .from("influencers")
        .update({ maker_name: makerName.trim() || userName })
        .eq("id", influencer.id);
    }
    const { error: e } = await supabase.from("influ_signatures").insert({
      influencer_id: influencer.id,
      doc: "memo",
      role: signingRole,
      signer_name: signerName ?? null,
      signature_data: dataUrl,
    });
    if (e) setError(`บันทึกลายเซนไม่สำเร็จ: ${e.message}`);
    router.refresh();
  };

  const goNext = async () => {
    if (!allSigned) return;
    await supabase
      .from("influencers")
      .update({ stage: 4 })
      .eq("id", influencer.id);
    router.refresh();
  };

  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");
  // วันที่บนหัวเอกสาร: ตรึงเป็นวันที่เซนครั้งแรกเมื่อเริ่มมีลายเซน — เปิดดูย้อนหลังต้องไม่เปลี่ยนทุกวัน
  const memoDate = useMemo(() => {
    let earliest: string | null = null;
    for (const s of memoSigs.values()) {
      if (!earliest || s.signed_at < earliest) earliest = s.signed_at;
    }
    return earliest ? new Date(earliest) : new Date();
  }, [memoSigs]);
  const memoDateText = memoDate.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const Line = ({ children }: { children: React.ReactNode }) => (
    <span className="border-b border-dotted border-stone-400 px-1">
      {children}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setPhotosOpen(true)}>
          <Images size={15} />
          ดูรูปที่อัพโหลดไว้
        </Button>
        {!readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-stone-500">ชื่อผู้จัดทำ:</span>
            <Input
              value={makerName}
              onChange={(e) => setMakerName(e.target.value)}
              placeholder="ชื่อผู้จัดทำ memo"
              className="w-56"
              disabled={memoSigs.has("maker")}
            />
          </div>
        )}
      </div>

      {/* ตัวเอกสาร memo — กระดาษขาวสไตล์แบบฟอร์มจริง */}
      <Card className="!bg-white/95 p-0">
        <div className="mx-auto max-w-3xl px-8 py-8 text-[13px] leading-6 text-stone-800">
          {/* หัวบริษัท */}
          <div className="flex items-start gap-4 border-b-4 border-double border-amber-400/70 pb-4">
            <div className="font-display text-2xl font-bold leading-none text-brand-500">
              THE
              <br />
              ART
            </div>
            <div className="text-xs leading-5 text-stone-600">
              <p className="font-medium text-stone-800">{MEMO_COMPANY.name}</p>
              <p>{MEMO_COMPANY.address}</p>
              <p>{MEMO_COMPANY.phone}</p>
            </div>
          </div>

          <h2 className="mt-5 text-center text-base font-bold text-stone-900">
            {MEMO_COMPANY.formTitle}
          </h2>
          <p className="mt-2 text-right">วันที่ {memoDateText}</p>

          <div className="mt-3 space-y-1.5">
            <p>
              <span className="font-semibold">เรื่อง</span>{" "}
              ขออนุมัติเคสทางการตลาด คุณ{fullName}
              {influencer.nickname && ` (ชื่อเล่น : ${influencer.nickname})`}
            </p>
            <p>
              <span className="font-semibold">เรียน</span> {MEMO_COMPANY.to}
            </p>
            <p>
              <span className="font-semibold">เอกสารแนบ</span>{" "}
              {MEMO_COMPANY.attachments}
            </p>
          </div>

          <p className="mt-4 indent-10">{MEMO_COMPANY.purpose}</p>

          {/* รูป influ + channel ในเอกสาร */}
          {(photoUrl || channelUrl) && (
            <div className="mt-4 flex items-center justify-center gap-6">
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt="รูป Influencer"
                  className="h-32 w-32 rounded-full border border-stone-200 object-cover"
                />
              )}
              {channelUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={channelUrl}
                  alt="รูปช่องทาง"
                  className="h-32 max-w-56 rounded-lg border border-stone-200 object-contain"
                />
              )}
            </div>
          )}

          {/* รายละเอียด */}
          <div className="mt-5 space-y-2.5">
            <p>
              ชื่อ-นามสกุล : <Line>คุณ{fullName}</Line>
              {influencer.nickname && (
                <Line>(ชื่อเล่น : {influencer.nickname})</Line>
              )}
            </p>
            <p>
              อาชีพ : <Line>{influencer.occupation || "-"}</Line>
            </p>
            <p>
              หัตถการที่รับบริการ :{" "}
              <Line>{influencer.procedure_text || "-"}</Line>
            </p>
            <p>
              มูลค่า :{" "}
              <Line>
                {influencer.case_value != null
                  ? formatCurrency(influencer.case_value)
                  : "-"}
              </Line>
            </p>
            <p>
              วันที่ทำหัตถการ :{" "}
              <Line>
                {influencer.service_date
                  ? formatDate(influencer.service_date)
                  : "-"}
              </Line>
            </p>
            <p>
              ยอดผู้ติดตาม :{" "}
              <Line>
                {influencer.follower_note ||
                  (influencer.followers != null
                    ? formatNumber(influencer.followers)
                    : "-")}
              </Line>
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <span className="font-semibold">Tier :</span>
              {INFLU_TIER_ORDER.map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center border ${
                      influencer.tier === t
                        ? "border-blue-700 text-blue-700"
                        : "border-stone-400 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  {INFLU_TIERS[t].label} {INFLU_TIERS[t].range}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-5">จึงเรียนมาเพื่อพิจารณาอนุมัติ</p>

          {/* ช่องเซน 5 ช่อง: ผู้จัดทำ / ผู้ตรวจสอบ ×2 / ผู้อนุมัติ ×2 */}
          <div className="mt-5 grid grid-cols-3">
            {MEMO_SIGNERS.slice(0, 3).map((s) => {
              const sig = memoSigs.get(s.role);
              return (
                <SignatureSlot
                  key={s.role}
                  heading={s.heading}
                  name={
                    s.role === "maker"
                      ? (sig?.signer_name ?? makerName ?? null)
                      : s.name
                  }
                  position={
                    s.role === "maker"
                      ? "Assistant Aesthetic Product Manager"
                      : s.position
                  }
                  signature={sig?.signature_data ?? null}
                  signedAt={sig?.signed_at ?? null}
                  onSign={
                    !readOnly && !sig ? () => setSigningRole(s.role) : undefined
                  }
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 border-t-0">
            {MEMO_SIGNERS.slice(3).map((s) => {
              const sig = memoSigs.get(s.role);
              return (
                <SignatureSlot
                  key={s.role}
                  heading={s.heading}
                  name={s.name}
                  position={s.position}
                  signature={sig?.signature_data ?? null}
                  signedAt={sig?.signed_at ?? null}
                  onSign={
                    !readOnly && !sig ? () => setSigningRole(s.role) : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">
            เซนแล้ว {[...memoSigs.keys()].length}/{MEMO_SIGNERS.length} ช่อง —
            ต้องเซนครบทุกช่องจึงจะไป stage ถัดไปได้
          </p>
          <Button onClick={() => void goNext()} disabled={!allSigned}>
            <CheckCircle2 size={16} />
            Memo อนุมัติครบ — ไป Stage 4 (สัญญา)
          </Button>
        </div>
      )}

      {signingRole && (
        <SignaturePad
          title={`เซนช่อง${MEMO_SIGNERS.find((s) => s.role === signingRole)?.heading} — Memo ขออนุมัติเคส`}
          signerName={
            signingRole === "maker"
              ? makerName || userName
              : MEMO_SIGNERS.find((s) => s.role === signingRole)?.name
          }
          onSave={(d) => void saveSignature(d)}
          onClose={() => setSigningRole(null)}
        />
      )}

      <PhotosModal
        influencer={influencer}
        open={photosOpen}
        onClose={() => setPhotosOpen(false)}
      />
    </div>
  );
}

/* ---------- Stage 4: สัญญา ----------
   โหมดหลัก = ดาวน์โหลดแม่แบบสัญญา PDF → พิมพ์/เซน → อัพโหลดไฟล์ที่เซนแล้ว (เหมือน Memo)
   โหมดเซนในระบบ (ContractSignStage) เก็บโค้ดไว้ ยังไม่เปิดใช้ (Coming soon) */

export function ContractStage(props: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  readOnly: boolean;
}) {
  // เก็บโหมดเซนดิจิทัลไว้แต่ยังไม่เปิดใช้
  const [mode] = useState<"upload" | "sign">("upload");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
            mode === "upload"
              ? "cursor-default bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-md"
              : "cursor-pointer border border-stone-200 bg-white/50 text-stone-500"
          }`}
        >
          <Upload size={15} />
          อัพโหลดไฟล์สัญญา
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex cursor-not-allowed items-center gap-2 rounded-full border border-stone-200 bg-white/50 px-3.5 py-2 text-sm font-medium text-stone-400 opacity-70"
        >
          <FileSignature size={15} />
          เซนในระบบ (ดิจิทัล)
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Coming soon
          </span>
        </button>
      </div>

      {mode === "upload" ? (
        <ContractUploadStage
          influencer={props.influencer}
          readOnly={props.readOnly}
        />
      ) : (
        <ContractSignStage {...props} />
      )}
    </div>
  );
}

/* ---------- โหมดอัพโหลดไฟล์สัญญา (โหมดหลัก) ---------- */

function ContractUploadStage({
  influencer,
  readOnly,
}: {
  influencer: InfluencerRow;
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [downloadingTpl, setDownloadingTpl] = useState(false);
  const [downloadingSigned, setDownloadingSigned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contractUploaded = !!influencer.contract_file_path;
  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");

  /** ดาวน์โหลดไฟล์แม่แบบสัญญา (PDF เปล่า) จาก storage */
  const downloadTemplate = async () => {
    setError(null);
    setDownloadingTpl(true);
    const { data, error: e } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .download(INFLU_CONTRACT_TEMPLATE_PATH);
    setDownloadingTpl(false);
    if (e || !data) {
      setError(
        "ยังไม่มีไฟล์แม่แบบสัญญาในระบบ — แจ้งแอดมินให้อัปโหลดไฟล์ PDF สัญญาก่อน"
      );
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download = INFLU_CONTRACT_TEMPLATE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  /** ดาวน์โหลดไฟล์สัญญาที่เซนแล้ว (ที่อัพไว้) */
  const downloadSigned = async () => {
    if (!influencer.contract_file_path) return;
    setError(null);
    setDownloadingSigned(true);
    const { data, error: e } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .download(influencer.contract_file_path);
    setDownloadingSigned(false);
    if (e || !data) {
      setError(`ดาวน์โหลดไฟล์ไม่สำเร็จ${e ? `: ${e.message}` : ""}`);
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download =
      influencer.contract_file_name ||
      `สัญญา-${influencer.nickname || influencer.first_name}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const uploadSigned = async (file: File) => {
    setError(null);
    setUploading(true);
    const oldPath = influencer.contract_file_path;
    const path = `influencers/${influencer.id}/contract/${Date.now()}_${sanitizeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .upload(path, file);
    if (upErr) {
      setUploading(false);
      setError(`อัพโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`);
      return;
    }
    const { error: linkErr } = await supabase
      .from("influencers")
      .update({
        contract_file_path: path,
        contract_file_name: file.name,
        contract_uploaded_at: new Date().toISOString(),
      })
      .eq("id", influencer.id);
    setUploading(false);
    if (linkErr) {
      try {
        await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([path]);
      } catch {
        // เพิกเฉย
      }
      setError(`บันทึกไฟล์ไม่สำเร็จ: ${linkErr.message}`);
      return;
    }
    if (oldPath) {
      try {
        await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([oldPath]);
      } catch {
        // เพิกเฉย
      }
    }
    router.refresh();
  };

  const goNext = async () => {
    if (!contractUploaded) return;
    if (
      !window.confirm(
        "ยืนยันว่าเซนสัญญาครบและอัพโหลดไฟล์แล้ว — เริ่มนับสัญญา 6 เดือน และไป Stage 5?"
      )
    )
      return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = new Date();
    const { error: e } = await supabase
      .from("influencers")
      .update({
        stage: 5,
        // เริ่มนับสัญญา 6 เดือน = วันที่ยืนยันเซนสัญญาครบ
        contract_start: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      })
      .eq("id", influencer.id);
    if (e) {
      setError(`ไป stage ถัดไปไม่สำเร็จ: ${e.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
        <FileSignature size={14} className="shrink-0" />
        ดาวน์โหลดไฟล์แม่แบบสัญญาไปพิมพ์ให้ Influencer เซน แล้วอัพโหลดไฟล์ที่เซนแล้ว
        (สแกน/ถ่ายรูป) กลับเข้ามาเก็บไว้ที่นี่ — อัพโหลดครบจึงจะไป Stage ถัดไปได้
        (เริ่มนับสัญญา 6 เดือนทันทีที่ยืนยัน)
      </p>

      {/* แม่แบบสัญญา PDF */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <FileText size={20} className="shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-stone-800">
              ไฟล์แม่แบบสัญญา (PDF)
            </p>
            <p className="text-xs text-stone-500">
              ดาวน์โหลดไปพิมพ์ให้ Influencer เซน
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void downloadTemplate()}
            loading={downloadingTpl}
          >
            <Download size={15} />
            ดาวน์โหลดแม่แบบสัญญา
          </Button>
        </div>
      </Card>

      {/* ไฟล์สัญญาที่เซนแล้ว */}
      <Card className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <FileText size={14} />
          ไฟล์สัญญาที่เซนแล้ว (ของ คุณ{fullName})
        </p>
        {contractUploaded ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-800">
                {influencer.contract_file_name || "ไฟล์สัญญา"}
              </p>
              {influencer.contract_uploaded_at && (
                <p className="text-xs text-stone-500">
                  อัพโหลดเมื่อ {formatDateTime(influencer.contract_uploaded_at)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => void downloadSigned()}
                loading={downloadingSigned}
                className="!px-2.5 !py-1 !text-xs"
              >
                <Download size={13} />
                ดาวน์โหลด
              </Button>
              {!readOnly && (
                <Button
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploading}
                  className="!px-2.5 !py-1 !text-xs"
                >
                  <Upload size={13} />
                  เปลี่ยนไฟล์
                </Button>
              )}
            </div>
          </div>
        ) : readOnly ? (
          <p className="text-xs text-stone-400">ยังไม่มีไฟล์</p>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 bg-white/60 px-4 py-8 text-xs text-stone-400 transition-colors hover:border-brand-400 hover:bg-brand-50/40 disabled:cursor-wait"
          >
            <Upload size={22} />
            {uploading
              ? "กำลังอัพโหลด..."
              : "กดเพื่ออัพโหลดไฟล์สัญญาที่เซนแล้ว (PDF / รูปภาพ / Word)"}
          </button>
        )}
        {!readOnly && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadSigned(f);
              e.target.value = "";
            }}
          />
        )}
      </Card>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            {contractUploaded
              ? "อัพโหลดไฟล์สัญญาแล้ว — ไป Stage ถัดไปได้เลย"
              : "ต้องอัพโหลดไฟล์สัญญาที่เซนแล้วก่อน จึงจะไป Stage ถัดไปได้"}
          </p>
          <Button onClick={() => void goNext()} disabled={!contractUploaded}>
            <CheckCircle2 size={16} />
            เซนสัญญาครบแล้ว — เริ่มสัญญา 6 เดือน + ไป Stage 5
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- โหมดเซนในระบบ (mockup — เก็บโค้ดไว้ ยังไม่เปิดใช้) ---------- */

const CONTRACTS: { doc: string; title: string; body: string[] }[] = [
  {
    doc: "contract1",
    title: "สัญญาโฆษณาประชาสัมพันธ์ Influencer (ฉบับที่ 1)",
    body: [
      "สัญญาฉบับนี้ทำขึ้นระหว่าง บริษัท อาทออฟเซอร์เจอร์รี่ จำกัด (ต่อไปเรียกว่า \"ผู้ว่าจ้าง\") ฝ่ายหนึ่ง กับผู้รับจ้างซึ่งมีรายชื่อท้ายสัญญานี้ (ต่อไปเรียกว่า \"Influencer\") อีกฝ่ายหนึ่ง",
      "ข้อ 1. Influencer ตกลงรับโปรโมทหัตถการตามที่ระบุในแบบฟอร์มขออนุมัติเคสทางการตลาด และยินยอมให้ผู้ว่าจ้างใช้ภาพนิ่ง/ภาพเคลื่อนไหวที่เกี่ยวข้องเพื่อการประชาสัมพันธ์ เป็นระยะเวลา 6 เดือน นับแต่วันลงนาม",
      "ข้อ 2. Influencer จะเผยแพร่คอนเทนต์ตามจำนวนและช่องทางที่ตกลงกัน พร้อมติดแท็กและข้อความตามที่ผู้ว่าจ้างกำหนด",
      "ข้อ 3. รายละเอียดอื่นเป็นไปตามเอกสารแนบท้ายสัญญา (mockup — แบบฟอร์มจริงจะนำมาแทนที่ภายหลัง)",
    ],
  },
  {
    doc: "contract2",
    title: "เอกสารแนบท้ายสัญญา (ฉบับที่ 2)",
    body: [
      "เอกสารแนบท้ายนี้เป็นส่วนหนึ่งของสัญญาโฆษณาประชาสัมพันธ์ Influencer ระบุรายละเอียดหัตถการที่รับบริการ มูลค่า และเงื่อนไขการเผยแพร่คอนเทนต์",
      "Influencer รับทราบว่าผลลัพธ์ของหัตถการขึ้นอยู่กับสภาพร่างกายของแต่ละบุคคล และยินยอมปฏิบัติตามคำแนะนำของแพทย์อย่างเคร่งครัด",
      "ทั้งสองฝ่ายได้อ่านและเข้าใจข้อความโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน (mockup — แบบฟอร์มจริงจะนำมาแทนที่ภายหลัง)",
    ],
  },
];

function ContractSignStage({
  influencer,
  signatures,
  readOnly,
}: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [signingDoc, setSigningDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");

  const sigFor = (doc: string) =>
    signatures.find((s) => s.doc === doc && s.role === "influencer") ?? null;

  const allSigned = CONTRACTS.every((c) => sigFor(c.doc));

  const saveSignature = async (dataUrl: string) => {
    if (!signingDoc) return;
    const doc = signingDoc;
    setSigningDoc(null);
    setError(null);
    const { error: e } = await supabase.from("influ_signatures").insert({
      influencer_id: influencer.id,
      doc,
      role: "influencer",
      signer_name: `คุณ${fullName}`,
      signature_data: dataUrl,
    });
    if (e) setError(`บันทึกลายเซนไม่สำเร็จ: ${e.message}`);
    router.refresh();
  };

  const goNext = async () => {
    if (!allSigned) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = new Date();
    await supabase
      .from("influencers")
      .update({
        stage: 5,
        // วันเริ่มสัญญา 6 เดือน = วันที่เซนสัญญาครบ
        contract_start: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      })
      .eq("id", influencer.id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
        <FileSignature size={14} className="shrink-0" />
        วันที่ Influencer เข้ามารับบริการ ให้เปิดสัญญา 2
        ฉบับนี้ให้อ่านและกดช่องลงชื่อเพื่อเซนบนหน้าจอ — เซนครบทั้ง 2
        ฉบับจึงไปต่อได้ (เริ่มนับสัญญา 6 เดือนทันทีที่เซนครบ)
      </p>

      {CONTRACTS.map((c) => {
        const sig = sigFor(c.doc);
        return (
          <Card key={c.doc} className="!bg-white/95 p-0">
            <div className="mx-auto max-w-3xl px-8 py-7 text-[13px] leading-6 text-stone-800">
              <div className="flex items-start justify-between border-b-4 border-double border-amber-400/70 pb-3">
                <div className="font-display text-xl font-bold leading-none text-brand-500">
                  THE
                  <br />
                  ART
                </div>
                {sig && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={13} /> เซนแล้ว
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-center text-sm font-bold text-stone-900">
                {c.title}
              </h3>
              {c.body.map((p, i) => (
                <p key={i} className="mt-3 indent-8 text-stone-700">
                  {p}
                </p>
              ))}

              <div className="mx-auto mt-6 max-w-xs">
                <SignatureSlot
                  heading="ลงชื่อผู้รับจ้าง (Influencer)"
                  name={`คุณ${fullName}`}
                  signature={sig?.signature_data ?? null}
                  signedAt={sig?.signed_at ?? null}
                  onSign={
                    !readOnly && !sig ? () => setSigningDoc(c.doc) : undefined
                  }
                />
              </div>
            </div>
          </Card>
        );
      })}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">
            เซนแล้ว {CONTRACTS.filter((c) => sigFor(c.doc)).length}/
            {CONTRACTS.length} ฉบับ
          </p>
          <Button onClick={() => void goNext()} disabled={!allSigned}>
            <PenLine size={16} />
            เซนครบแล้ว — เริ่มสัญญา 6 เดือน + ไป Stage 5
          </Button>
        </div>
      )}

      {signingDoc && (
        <SignaturePad
          title={`เซนสัญญา — ${CONTRACTS.find((c) => c.doc === signingDoc)?.title}`}
          signerName={`คุณ${fullName}`}
          onSave={(d) => void saveSignature(d)}
          onClose={() => setSigningDoc(null)}
        />
      )}
    </div>
  );
}
