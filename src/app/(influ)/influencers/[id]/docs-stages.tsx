"use client";

import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Download,
  FileSignature,
  FileText,
  Images,
  PenLine,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useInfluLog } from "@/components/influ-log-provider";
import { SignaturePad, SignatureSlot } from "@/components/signature-pad";
import { Button, Card, ConfirmDialog, Input, Modal } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import {
  contractStartFor,
  INFLU_CONTRACT_TEMPLATES,
  INFLU_STAGE,
  INFLU_TIER_ORDER,
  INFLU_TIERS,
  MEMO_COMPANY,
  MEMO_SIGNERS,
  type MemoRole,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluencerRow, InfluSignatureRow } from "@/lib/types";
import { useSignedUrl } from "@/lib/use-signed-url";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** ชื่อเคสที่ไปโผล่ในประวัติการใช้งาน (ชุดเดียวกับ logNameOf ใน detail-client) */
function logNameOf(
  i: Pick<InfluencerRow, "first_name" | "last_name" | "nickname">
): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
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
  const photo = useSignedUrl(open ? influencer.photo_path : null);
  const channel = useSignedUrl(open ? influencer.channel_photo_path : null);

  return (
    <Modal open={open} onClose={onClose} title="รูปภาพของ Influencer" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            label: "รูป Influencer",
            url: photo.url,
            failed: photo.failed,
            path: influencer.photo_path,
          },
          {
            label: "รูปช่องทาง (Channel)",
            url: channel.url,
            failed: channel.failed,
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
              ) : p.failed ? (
                // ขอ signed URL ไม่ได้ (ไฟล์อาจถูกลบ) — placeholder นิ่ง ไม่ใช่โครงโหลดค้าง
                <div className="flex h-40 items-center justify-center rounded-xl bg-stone-100 text-xs text-stone-400">
                  เปิดรูปไม่ได้ — ไฟล์อาจถูกลบจากระบบ
                </div>
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

export function MemoStage({
  fileEditable,
  ...props
}: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  userName: string;
  readOnly: boolean;
  /** เปลี่ยนไฟล์ Memo ได้ไหม — จริงจนกว่าเคสจะปิดงาน แม้ stage 3 ผ่านไปแล้ว
      (ไฟล์เอกสารเป็นของเคส ไม่ใช่สถานะงาน — มัก memo ผิด/ได้ฉบับอนุมัติจริงทีหลัง) */
  fileEditable: boolean;
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
        <MemoCopyStage {...props} fileEditable={fileEditable} />
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
  fileEditable,
}: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  userName: string;
  readOnly: boolean;
  /** เปลี่ยน/อัพโหลดไฟล์ Memo ได้ไหม — แยกจาก readOnly ที่ล็อกการเดิน stage */
  fileEditable: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const memoInputRef = useRef<HTMLInputElement>(null);
  const photo = useSignedUrl(influencer.photo_path);
  const channel = useSignedUrl(influencer.channel_photo_path);

  const memoUploaded = !!influencer.memo_file_path;
  const memoReady = !!influencer.memo_ready_at;

  /** ติ๊ก/ยกเลิก "ข้อมูลพร้อมทำ Memo" — ติ๊กแล้วรายนี้ไปโผล่ในแท็บ "รอทำ Memo" ของหน้าบอร์ด
      (หลุดจากแท็บเองเมื่ออัพโหลดไฟล์ Memo แล้ว — ไม่ต้องมายกเลิกติ๊กเอง) */
  const toggleMemoReady = async () => {
    setError(null);
    setMarkingReady(true);
    const { error: e } = await supabase
      .from("influencers")
      .update({ memo_ready_at: memoReady ? null : new Date().toISOString() })
      .eq("id", influencer.id);
    setMarkingReady(false);
    if (e) {
      setError(`บันทึกสถานะไม่สำเร็จ: ${e.message}`);
      return;
    }
    router.refresh();
  };

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
    // วันที่ไม่บังคับกรอก — บอกให้ชัดว่ายังไม่เคาะวัน ไม่ใช่ลืมกรอก (ข้อความนี้ถูกก๊อปไปลงเอกสารจริง)
    `วันที่ทำหัตถการ : ${
      influencer.service_date
        ? formatDate(influencer.service_date)
        : "(ยังไม่กำหนด)"
    }`,
    `แพทย์ที่รับเคส : ${influencer.doctor_name || "-"}`,
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
        // มีไฟล์ Memo ที่อนุมัติแล้ว = ผ่านขั้น Memo ทันที ไปขั้นสัญญาเลย (ผู้ใช้ 2026-08-07)
        // — เคสที่เลยขั้นนี้ไปแล้วแค่มาเปลี่ยนไฟล์ ต้องไม่ถูกดึง stage ถอยหลัง
        ...(influencer.stage === INFLU_STAGE.memo && !influencer.completed
          ? { stage: INFLU_STAGE.contractService }
          : {}),
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
    const skipped =
      influencer.stage === INFLU_STAGE.memo && !influencer.completed;
    log({
      action: "upload",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `${oldPath ? "เปลี่ยน" : "อัปโหลด"}ไฟล์ Memo ที่อนุมัติแล้ว: ${file.name}${
        skipped ? " — ผ่านขั้น Memo อัตโนมัติ" : ""
      }`,
    });
    router.refresh();
  };

  const photos = [
    {
      label: "รูป Influencer",
      url: photo.url,
      failed: photo.failed,
      path: influencer.photo_path,
    },
    {
      label: "รูปช่องทาง (Channel)",
      url: channel.url,
      failed: channel.failed,
      path: influencer.channel_photo_path,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
        <ClipboardList size={14} className="shrink-0" />
        คัดลอกข้อความแต่ละส่วนด้านล่างไปสร้างเอกสาร Memo ตามฟอร์มของบริษัท —
        เมื่อ Memo ได้รับอนุมัติแล้ว ให้อัพโหลดไฟล์กลับเข้ามาเก็บไว้ที่นี่
        แล้วเคสจะไปขั้น &quot;เซนสัญญา + วันรับบริการ&quot; ให้อัตโนมัติ
      </p>

      {/* ติ๊กว่าข้อมูลครบ พร้อมให้ influ manager ลงมือทำ Memo — รายที่ติ๊กจะไปรวมกันใน
          แท็บ "รอทำ Memo" หน้าบอร์ด; ซ่อนการ์ดเมื่ออัพโหลด Memo แล้ว (คิวจบไปเองแล้ว) */}
      {!memoUploaded && (
        <Card className="p-5">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <ClipboardCheck size={14} />
            สถานะข้อมูลสำหรับทำ Memo
          </p>
          {memoReady ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-800">
                  ข้อมูลพร้อมทำ Memo แล้ว
                </p>
                <p className="text-xs text-stone-500">
                  ติ๊กเมื่อ {formatDateTime(influencer.memo_ready_at!)} ·
                  รายนี้อยู่ในแท็บ “รอทำ Memo” บนหน้าบอร์ดแล้ว
                </p>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  onClick={() => void toggleMemoReady()}
                  loading={markingReady}
                  className="!px-2.5 !py-1 !text-xs"
                >
                  <Undo2 size={13} />
                  ยกเลิกติ๊ก
                </Button>
              )}
            </div>
          ) : readOnly ? (
            <p className="text-xs text-stone-400">ยังไม่ได้ติ๊กว่าข้อมูลพร้อม</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-xs text-stone-500">
                ข้อมูลครบพร้อมทำ Memo แล้วให้ติ๊กที่นี่ —
                รายนี้จะไปแสดงในแท็บ “รอทำ Memo” บนหน้าบอร์ด
                ให้ influ manager เห็นว่ามีเคสรออยู่
              </p>
              <Button
                variant="secondary"
                onClick={() => void toggleMemoReady()}
                loading={markingReady}
              >
                <ClipboardCheck size={16} />
                ติ๊กว่าข้อมูลพร้อมทำ Memo
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <CopyBox label="เรื่อง" text={subjectText} />
        <CopyBox label="เรียน" text={MEMO_COMPANY.to} />
        <CopyBox label="รายละเอียด" text={detailText} multiline />
        {/* ก๊อปแยกเฉพาะชื่อแพทย์ได้ — ฟอร์ม memo บางแบบมีช่องแพทย์แยกจากรายละเอียด */}
        <CopyBox
          label="แพทย์ที่รับเคส"
          text={influencer.doctor_name || "-"}
        />
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
                ) : p.failed ? (
                  // ขอ signed URL ไม่ได้ (ไฟล์อาจถูกลบ) — placeholder นิ่ง ไม่ใช่โครงโหลดค้าง
                  <div className="flex h-40 items-center justify-center rounded-xl bg-stone-100 text-xs text-stone-400">
                    เปิดรูปไม่ได้ — ไฟล์อาจถูกลบจากระบบ
                  </div>
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
              {/* เปลี่ยนไฟล์ได้จนกว่าเคสจะปิดงาน — แม้ stage 3 ผ่านไปแล้ว (ไฟล์เดิมถูกแทนที่+ลบทิ้ง) */}
              {fileEditable && (
                <Button
                  variant="ghost"
                  onClick={() => memoInputRef.current?.click()}
                  loading={uploading}
                  title="เลือกไฟล์ใหม่มาแทนไฟล์ Memo เดิม (ไฟล์เดิมจะถูกลบออกจากระบบ)"
                  className="!px-2.5 !py-1 !text-xs"
                >
                  <Upload size={13} />
                  เปลี่ยนไฟล์
                </Button>
              )}
            </div>
          </div>
        ) : !fileEditable ? (
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
        {/* stage ผ่านไปแล้วแต่ยังแก้ไฟล์ได้ — บอกให้ชัดว่าเปลี่ยนไฟล์ไม่กระทบ stage ของเคส */}
        {readOnly && fileEditable && memoUploaded && (
          <p className="mt-2.5 text-[11px] leading-5 text-stone-400">
            Stage นี้ผ่านไปแล้ว — ยังเปลี่ยนไฟล์ Memo ได้
            (เช่นได้ฉบับที่อนุมัติจริงมาทีหลัง หรืออัพผิดไฟล์)
            โดยไม่กระทบ stage ปัจจุบันของเคส
          </p>
        )}
        {fileEditable && (
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

      {/* ไม่มีปุ่มเดิน stage ที่ขั้นนี้แล้ว — อัพไฟล์ Memo ที่อนุมัติแล้ว = ข้ามไปขั้นสัญญาให้เอง */}
      {!readOnly && (
        <p
          className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs ${
            memoUploaded
              ? "bg-emerald-50 text-emerald-700"
              : "bg-stone-50 text-stone-500"
          }`}
        >
          <CheckCircle2 size={14} className="shrink-0" />
          {memoUploaded
            ? "มีไฟล์ Memo ที่อนุมัติแล้ว — เคสไปขั้นสัญญาเรียบร้อย"
            : "อัพโหลดไฟล์ Memo ที่อนุมัติแล้ว ระบบจะพาไปขั้นสัญญาให้อัตโนมัติ (ไม่ต้องกดปุ่มเพิ่ม)"}
        </p>
      )}
    </div>
  );
}

/* ---------- แบบฟอร์มดิจิทัล (จำลองแบบฟอร์มจริง) — เก็บโค้ดไว้ ยังไม่เปิดใช้ (Coming soon) ---------- */

/** ช่องกรอกเส้นประในแบบฟอร์ม — ต้องอยู่ระดับโมดูล (กฎ react-hooks/static-components) */
function Line({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-b border-dotted border-stone-400 px-1">
      {children}
    </span>
  );
}

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
  // ใช้เฉพาะ url — รูปในตัวเอกสารซ่อนไปเลยเมื่อโหลดไม่ได้ ไม่ต้องมี placeholder
  const { url: photoUrl } = useSignedUrl(influencer.photo_path);
  const { url: channelUrl } = useSignedUrl(influencer.channel_photo_path);

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
      .update({ stage: INFLU_STAGE.contractService })
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

      {/* ตัวเอกสาร memo — กระดาษขาวสไตล์แบบฟอร์มจริง (จอแคบเลื่อนแนวนอนดูทั้งฟอร์ม คงหน้าตาแบบพิมพ์) */}
      <Card className="overflow-x-auto !bg-white/95 p-0">
        <div className="mx-auto min-w-[640px] max-w-3xl px-8 py-8 text-[13px] leading-6 text-stone-800">
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
                  : "(ยังไม่กำหนด)"}
              </Line>
            </p>
            <p>
              แพทย์ที่รับเคส : <Line>{influencer.doctor_name || "-"}</Line>
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
            Memo อนุมัติครบ — ไปขั้นสัญญา + วันรับบริการ
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

/* ---------- ครึ่งบนของขั้นรวม: สัญญา ----------
   โหมดหลัก = ดาวน์โหลดแม่แบบสัญญา PDF → พิมพ์/เซน → อัพโหลดไฟล์ที่เซนแล้ว (เหมือน Memo)
   โหมดเซนในระบบ (ContractSignStage) เก็บโค้ดไว้ ยังไม่เปิดใช้ (Coming soon) */

export function ContractStage(props: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  readOnly: boolean;
  /** แก้ไฟล์สัญญาได้ไหม (เปลี่ยน/ลบ) — แยกจาก readOnly ที่ล็อกการเดิน stage
      กติกาเดียวกับ Memo: ไฟล์เป็นเอกสารของเคส แก้ได้จนกว่าเคสจะปิดงาน แม้ stage นี้ผ่านไปแล้ว */
  fileEditable: boolean;
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
          fileEditable={props.fileEditable}
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
  fileEditable,
}: {
  influencer: InfluencerRow;
  readOnly: boolean;
  /** true = เปลี่ยน/ลบไฟล์สัญญาได้ (เคสยังไม่ปิดงาน) — ดูคำอธิบายที่ props ของ ContractStage */
  fileEditable: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const [error, setError] = useState<string | null>(null);
  // path ของแม่แบบที่กำลังดาวน์โหลด (มี 2 ฉบับ) — null = ไม่มีอันไหนกำลังโหลด
  const [downloadingTpl, setDownloadingTpl] = useState<string | null>(null);
  const [downloadingSigned, setDownloadingSigned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contractUploaded = !!influencer.contract_file_path;
  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");

  /** ดาวน์โหลดไฟล์แม่แบบสัญญาฉบับที่เลือก (PDF) จาก storage */
  const downloadTemplate = async (tpl: (typeof INFLU_CONTRACT_TEMPLATES)[number]) => {
    setError(null);
    setDownloadingTpl(tpl.path);
    const { data, error: e } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .download(tpl.path);
    setDownloadingTpl(null);
    if (e || !data) {
      setError(
        "ยังไม่มีไฟล์แม่แบบสัญญาในระบบ — แจ้งแอดมินให้อัปโหลดไฟล์ PDF สัญญาก่อน"
      );
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download = tpl.name;
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
        // มีไฟล์สัญญาที่เซนแล้ว = เริ่มนับสัญญา 6 เดือน (ขั้นนี้รวมวันรับบริการไว้แล้ว
        // จึงไม่มีปุ่มยืนยันแยกอีกต่อไป) — อัพซ้ำเพื่อเปลี่ยนไฟล์ต้องไม่รีเซ็ตวันเริ่ม
        ...(influencer.contract_start
          ? {}
          : { contract_start: contractStartFor(influencer) }),
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
    log({
      action: "upload",
      entity: "contract",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: oldPath
        ? `เปลี่ยนไฟล์สัญญาที่เซนแล้ว: "${
            influencer.contract_file_name || "(ไม่มีชื่อไฟล์)"
          }" → "${file.name}"`
        : `อัปโหลดไฟล์สัญญาที่เซนแล้ว: ${file.name}${
            influencer.contract_start ? "" : " — เริ่มนับอายุสัญญา"
          }`,
      meta: { file_path: path, replaced_path: oldPath },
    });
    router.refresh();
  };

  /** ลบ/ถอนไฟล์สัญญาที่อัพไว้ (เช่นอัพผิดไฟล์ หรือยกเลิกฉบับที่เซน)
      — ล้างวันเริ่มนับอายุสัญญาไปด้วย เพราะวันเริ่มถูกตั้งตอนอัพไฟล์:
      ไม่มีไฟล์สัญญา = ยังไม่เริ่มนับ; อัพไฟล์ใหม่แล้วระบบตั้งวันเริ่มให้ใหม่จากวันรับบริการ */
  const removeSigned = async () => {
    const oldPath = influencer.contract_file_path;
    if (!oldPath || removing) return;
    setRemoving(true);
    setError(null);
    const { error: e } = await supabase
      .from("influencers")
      .update({
        contract_file_path: null,
        contract_file_name: null,
        contract_uploaded_at: null,
        contract_start: null,
      })
      .eq("id", influencer.id);
    if (e) {
      setRemoving(false);
      setError(`ลบไฟล์สัญญาไม่สำเร็จ: ${e.message}`);
      return;
    }
    // ลบไฟล์จริงใน storage หลังล้างแถวแล้ว (best effort — ล้มก็แค่เหลือไฟล์กำพร้าที่ไม่มีอะไรชี้ถึง)
    try {
      await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([oldPath]);
    } catch {
      // เพิกเฉย
    }
    setRemoving(false);
    log({
      action: "delete",
      entity: "contract",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: `ลบไฟล์สัญญาที่เซนแล้ว: ${
        influencer.contract_file_name || "(ไม่มีชื่อไฟล์)"
      }${
        influencer.contract_start
          ? ` — ล้างวันเริ่มสัญญา (${formatDate(influencer.contract_start)})`
          : ""
      }`,
      meta: { file_path: oldPath, contract_start: influencer.contract_start },
    });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
        <FileSignature size={14} className="shrink-0" />
        ดาวน์โหลดไฟล์แม่แบบสัญญาไปพิมพ์ให้ Influencer เซนในวันที่เข้ามารับบริการ
        แล้วอัพโหลดไฟล์ที่เซนแล้ว (สแกน/ถ่ายรูป) กลับเข้ามาเก็บไว้ที่นี่ —
        เริ่มนับสัญญา 6 เดือนจากวันรับบริการทันทีที่อัพไฟล์
      </p>

      {/* แม่แบบสัญญา PDF — 2 ฉบับ (สัญญาหลัก + เอกสารแนบท้าย) */}
      <Card className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <FileText size={14} />
          ไฟล์แม่แบบสัญญา (PDF) — ดาวน์โหลดไปพิมพ์ให้ Influencer เซน
        </p>
        <div className="space-y-2">
          {INFLU_CONTRACT_TEMPLATES.map((tpl) => (
            <div
              key={tpl.path}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white/60 px-4 py-3"
            >
              <FileText size={20} className="shrink-0 text-brand-600" />
              <p className="min-w-0 flex-1 text-sm font-medium text-stone-800">
                {tpl.label}
              </p>
              <Button
                variant="secondary"
                onClick={() => void downloadTemplate(tpl)}
                loading={downloadingTpl === tpl.path}
                className="!px-3 !py-1.5 !text-xs"
              >
                <Download size={14} />
                ดาวน์โหลด
              </Button>
            </div>
          ))}
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
              {fileEditable && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    loading={uploading}
                    title="เลือกไฟล์ใหม่มาแทนไฟล์สัญญาเดิม (ไฟล์เดิมจะถูกลบออกจากระบบ)"
                    className="!px-2.5 !py-1 !text-xs"
                  >
                    <Upload size={13} />
                    เปลี่ยนไฟล์
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setError(null);
                      setRemoveOpen(true);
                    }}
                    loading={removing}
                    title="ถอนไฟล์ที่อัพผิด/ยกเลิกฉบับที่เซน — ลบไฟล์ออกจากระบบและล้างวันเริ่มสัญญา"
                    className="!px-2.5 !py-1 !text-xs"
                  >
                    <Trash2 size={13} />
                    ลบไฟล์
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : !fileEditable ? (
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
        {/* stage ผ่านไปแล้วแต่ยังแก้ไฟล์ได้ — บอกให้ชัดว่าเปลี่ยน/ลบไฟล์ไม่กระทบ stage ของเคส */}
        {readOnly && fileEditable && contractUploaded && (
          <p className="mt-2.5 text-[11px] leading-5 text-stone-400">
            Stage นี้ผ่านไปแล้ว — ยังเปลี่ยนหรือลบไฟล์สัญญาได้ (เช่นอัพผิดไฟล์
            หรือได้ฉบับที่เซนจริงมาทีหลัง) โดยไม่กระทบ stage ปัจจุบันของเคส
            แต่การลบจะล้างวันเริ่มสัญญาด้วย
          </p>
        )}
        {fileEditable && (
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

      {/* ปุ่มเดินไปขั้นถัดไปอยู่ที่ท้ายส่วน "วันเข้ารับบริการ" ของขั้นเดียวกันนี้แล้ว */}
      {!readOnly && (
        <p
          className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs ${
            contractUploaded
              ? "bg-emerald-50 text-emerald-700"
              : "bg-stone-50 text-stone-500"
          }`}
        >
          <CheckCircle2 size={14} className="shrink-0" />
          {contractUploaded
            ? `อัพโหลดไฟล์สัญญาแล้ว${
                influencer.contract_start
                  ? ` — เริ่มนับสัญญา ${formatDate(influencer.contract_start)}`
                  : ""
              }`
            : "ต้องอัพโหลดไฟล์สัญญาที่เซนแล้วก่อน จึงจะปิดขั้นนี้ไปตามงานได้"}
        </p>
      )}

      <ConfirmDialog
        open={removeOpen}
        title="ลบไฟล์สัญญาที่เซนแล้ว?"
        message={
          <>
            ไฟล์ &quot;{influencer.contract_file_name || "ไฟล์สัญญา"}&quot;
            จะถูกลบออกจากระบบถาวร — กู้คืนไม่ได้
            <br />
            <span className="text-amber-700">
              วันเริ่มนับอายุสัญญาจะถูกล้างด้วย
              {influencer.contract_start
                ? ` (ตอนนี้เริ่มนับ ${formatDate(influencer.contract_start)})`
                : ""}{" "}
              — อัพไฟล์ฉบับที่ถูกต้องเข้ามาใหม่
              ระบบจะตั้งวันเริ่มให้ใหม่จากวันรับบริการ
            </span>
            {influencer.stage > INFLU_STAGE.contractService && (
              <>
                <br />
                <span className="text-amber-700">
                  เคสนี้เดินเลยขั้นสัญญาไปแล้ว —
                  ลบแล้วเคสจะไม่มีไฟล์สัญญาและหายจากหน้าอายุสัญญา
                  จนกว่าจะอัพไฟล์ใหม่
                </span>
              </>
            )}
            <br />
            การลบถูกบันทึกไว้ในประวัติการใช้งาน (ใครลบ เมื่อไหร่ ไฟล์ชื่ออะไร)
          </>
        }
        confirmLabel="ลบไฟล์"
        onConfirm={() => void removeSigned()}
        onClose={() => setRemoveOpen(false)}
      />
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

  /** เซนครบ = เริ่มนับสัญญา (ไม่เดิน stage — ขั้นนี้รวมวันรับบริการไว้แล้ว
      ปุ่มไปขั้นตามงานอยู่ท้ายส่วน "วันเข้ารับบริการ") */
  const confirmSigned = async () => {
    if (!allSigned || influencer.contract_start) return;
    await supabase
      .from("influencers")
      .update({ contract_start: contractStartFor(influencer) })
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
          <Button
            onClick={() => void confirmSigned()}
            disabled={!allSigned || !!influencer.contract_start}
          >
            <PenLine size={16} />
            เซนครบแล้ว — เริ่มนับสัญญา 6 เดือน
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
