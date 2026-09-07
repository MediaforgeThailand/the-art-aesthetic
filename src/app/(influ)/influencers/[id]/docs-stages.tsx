"use client";

import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileSignature,
  FileText,
  Images,
  Send,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  useInfluLog,
  useInfluNotify,
} from "@/influ/components/influ-log-provider";
import { Button, Card, ConfirmDialog } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import {
  contractStartFor,
  INFLU_CHECKLIST,
  INFLU_CONTRACT_TEMPLATES,
  INFLU_STAGE,
  INFLU_TIERS,
  MEMO_COMPANY,
  MEMO_SIGNERS,
  MEMO_SUBSTEPS,
  memoMakerIds,
  memoStepOf,
  type MemoSubStep,
  voucherLabelOf,
} from "@/influ/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluencerRow,
  InfluProcedureItemRow,
} from "@/lib/types";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  type AssigneeChange,
  AssigneeRolePicker,
  type CaseAssignee,
  type InfluPerson,
} from "../assignees";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** ข้อความแทนหัตถการของเคส "รอปรึกษา" — ข้อความนี้ถูกคัดลอกไปลงเอกสารจริง จึงต้องบอก
    ผู้อนุมัติให้ชัดว่าตั้งใจเว้น ไม่ใช่ลืมกรอก (กติกาเดียวกับ "(ยังไม่กำหนด)" ของวันที่) */
const CONSULT_ONLY_TEXT = "(รอปรึกษาแพทย์ — ยังไม่ระบุหัตถการ)";

/** ชื่อเคสที่ไปโผล่ในประวัติการใช้งาน (ชุดเดียวกับ logNameOf ใน detail-client) */
function logNameOf(
  i: Pick<InfluencerRow, "first_name" | "last_name" | "nickname">
): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** สร้าง checklist ผลลัพธ์/ติดตาม 5 หมวดตามเอกสารแนบท้ายสัญญา (idempotent)
    ตั้งแต่ 0092 ไม่มีขั้น "Follow up" ใน pipeline แล้ว — จุดเริ่มนับคือ
    **ตอนอัพไฟล์สัญญาที่เซนแล้ว** (จุดเดียวกับที่ตั้ง contract_start) และรายการที่ได้
    ไปแสดง/ติ๊กที่แผงติดตามในหน้า Follow Up ซึ่งเป็นส่วนรอง (ไม่ force)
    เช็คเฉพาะข้อของเทมเพลตมาตรฐาน (is_custom = false) — ข้อที่ทีมพิมพ์เองในโหมด
    แพ็คเกจเฉพาะไม่ควรบล็อคการสร้างเทมเพลต */
async function generateFollowupTasks(
  supabase: ReturnType<typeof createClient>,
  influencerId: string,
  base: string
): Promise<string | null> {
  const { data: existing, error: exErr } = await supabase
    .from("influ_tasks")
    .select("id")
    .eq("influencer_id", influencerId)
    .eq("is_custom", false)
    .limit(1);
  if (exErr) return exErr.message;
  if (existing && existing.length > 0) return null;

  const { error } = await supabase.from("influ_tasks").insert(
    INFLU_CHECKLIST.map((t) => ({
      influencer_id: influencerId,
      step: t.step,
      title: t.title,
      script: t.detail,
      section: t.section,
      due_date: t.offsetDays != null ? addDays(base, t.offsetDays) : null,
    }))
  );
  return error?.message ?? null;
}

/* ---------- Stage 1: Memo ขออนุมัติ ---------- */

export function MemoStage({
  fileEditable,
  ...props
}: {
  influencer: InfluencerRow;
  userName: string;
  readOnly: boolean;
  /** เปลี่ยนไฟล์ Memo ได้ไหม — จริงจนกว่าเคสจะปิดงาน แม้ขั้น Memo ผ่านไปแล้ว
      (ไฟล์เอกสารเป็นของเคส ไม่ใช่สถานะงาน — มัก memo ผิด/ได้ฉบับอนุมัติจริงทีหลัง) */
  fileEditable: boolean;
  /** ผู้ดูแลระบบ Influencer — ทำขั้น 1.1/1.2 แทนผู้ออก Memo ได้ */
  canManageSystem?: boolean;
  /** ขั้นย่อย 1.1/1.2 ผูกกับบทบาท "ผู้ออก Memo" — ต้องรู้ว่าใครเปิดหน้าอยู่และใครถือบทบาท */
  userId: string | null;
  assignees: CaseAssignee[];
  people: InfluPerson[];
  peopleById: Map<string, InfluPerson>;
  onAssigneeChange: (change: AssigneeChange) => void;
  busyUserId: string | null;
  /** โปรแกรม/หัตถการของเคส (0106) — ใช้เช็คว่ามีรายการไหนติ๊ก "แบรนด์ support" ไว้บ้าง
      จะได้ใส่หมายเหตุกำกับใน Memo (มูลค่าที่ขออนุมัติเป็นวงเงิน voucher ไม่รวมราคาสินค้า
      อยู่แล้ว แต่ผู้อนุมัติควรรู้ว่ารายการไหนของแถมจากแบรนด์) */
  procedureItems: Pick<InfluProcedureItemRow, "name" | "is_supported" | "price">[];
}) {
  return <MemoCopyStage {...props} fileEditable={fileEditable} />;
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
      {/* ข้อความ memo มีทั้งชื่อโปรแกรม/ลิงก์ยาวๆ ที่ตัดคำเองไม่ได้ — break-words กันดันจอที่ 375px */}
      <div
        className={`break-words rounded-xl border border-stone-200 bg-white/80 px-3.5 py-2.5 text-[13px] leading-6 text-stone-800 ${
          multiline ? "whitespace-pre-wrap" : ""
        }`}
      >
        {text}
      </div>
    </div>
  );
}

/* ---------- เส้นขั้นย่อยของ Memo: 1 ส่งเรื่อง → 1.1 ทำเอกสาร → 1.2 อัพไฟล์ ---------- */

function MemoStepStrip({ step }: { step: MemoSubStep }) {
  const activeIdx = MEMO_SUBSTEPS.findIndex((s) => s.key === step);
  return (
    <div className="rounded-xl border border-stone-200/70 bg-white/60 px-3 py-3">
      <div className="flex items-start">
        {MEMO_SUBSTEPS.map((s, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          return (
            <div
              key={s.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <div className="flex w-full items-center">
                <div
                  className={`h-0.5 flex-1 rounded ${
                    idx === 0
                      ? "bg-transparent"
                      : idx <= activeIdx
                        ? "bg-brand-300"
                        : "bg-stone-200"
                  }`}
                />
                {done ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-white">
                    <Check size={11} strokeWidth={3} />
                  </span>
                ) : active ? (
                  <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-1 text-[10px] font-bold text-cream ring-4 ring-brand-100">
                    {s.key === "1.0" ? "1" : s.key}
                  </span>
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full border-2 border-stone-300 bg-white" />
                )}
                <div
                  className={`h-0.5 flex-1 rounded ${
                    idx === MEMO_SUBSTEPS.length - 1
                      ? "bg-transparent"
                      : idx < activeIdx
                        ? "bg-brand-300"
                        : "bg-stone-200"
                  }`}
                />
              </div>
              <p
                className={`px-1 text-center text-[11px] leading-4 ${
                  active
                    ? "font-semibold text-brand-700"
                    : done
                      ? "text-stone-500"
                      : "text-stone-400"
                }`}
              >
                {s.title}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- โหมดคัดลอกข้อความ: เรื่อง / เรียน / รายละเอียด + รูปพร้อมดาวน์โหลด ---------- */

function MemoCopyStage({
  influencer,
  readOnly,
  fileEditable,
  canManageSystem = false,
  userId,
  assignees,
  people,
  peopleById,
  onAssigneeChange,
  busyUserId,
  procedureItems,
}: {
  influencer: InfluencerRow;
  userName: string;
  readOnly: boolean;
  /** เปลี่ยน/อัพโหลดไฟล์ Memo ได้ไหม — แยกจาก readOnly ที่ล็อกการเดิน stage */
  fileEditable: boolean;
  /** ผู้ดูแลระบบ Influencer — ทำขั้น 1.1/1.2 แทนผู้ออก Memo ได้ (กันเคสค้างตาย) */
  canManageSystem?: boolean;
  userId: string | null;
  assignees: CaseAssignee[];
  people: InfluPerson[];
  peopleById: Map<string, InfluPerson>;
  onAssigneeChange: (change: AssigneeChange) => void;
  busyUserId: string | null;
  procedureItems: Pick<InfluProcedureItemRow, "name" | "is_supported" | "price">[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const log = useInfluLog();
  const notify = useInfluNotify();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [confirmingMemo, setConfirmingMemo] = useState(false);
  const memoInputRef = useRef<HTMLInputElement>(null);
  const photo = useSignedUrl(influencer.photo_path);
  const channel = useSignedUrl(influencer.channel_photo_path);

  const memoUploaded = !!influencer.memo_file_path;
  const memoSent = !!influencer.docs_sent_at;

  // ขั้นย่อยของ Memo (1 → 1.1 → 1.2) + สิทธิ์ของขั้น 1.1/1.2
  // — ผูกกับบทบาท "ผู้ออก Memo"; เคสที่ยังไม่ได้ assign ใคร = คนที่แก้ไขได้ทำแทนได้
  //   (กันเคสเก่าก่อนระบบบทบาทค้างตาย เดินต่อไม่ได้)
  const step = memoStepOf(influencer);
  const makerIds = memoMakerIds(assignees);
  const isMaker = userId != null && makerIds.includes(userId);
  // ขั้น 1.1/1.2 เป็นของ "ผู้ออก Memo" — ผู้ดูแลระบบทำแทนได้เสมอ (กันเคสค้างตาย)
  // **ยังไม่เลือกผู้ออก Memo = ล็อกไว้** ให้ตรงกับขั้น 1.0 ที่บังคับเลือกก่อนกดยืนยัน
  // (เดิมปล่อยให้ใครก็ได้อัพไฟล์ข้ามไปเมื่อยังไม่มีคนถือบทบาท — กติกา 2 ขั้นขัดกันเอง)
  const canActMaker = fileEditable && (isMaker || canManageSystem);
  const makerNames = makerIds
    .map((id) => peopleById.get(id)?.name ?? "?")
    .join(" · ");

  /** ขั้น 1: ยืนยัน/ยกเลิก "ส่งเรื่องขอ Memo" — ผู้ดูแลเคสยืนยันว่ายื่นเรื่องไปแล้ว
      (กันทีมส่งซ้ำ; โชว์ติ๊กถูกบนการ์ดบอร์ดด้วย) · ยกเลิก = ถอยกลับขั้น 1
      จึงต้องล้างขั้น 1.1 (memo_submitted_at) ที่ต่อจากมันทิ้งด้วย */
  const toggleMemoSent = async () => {
    setError(null);
    setMarkingSent(true);
    const next = memoSent ? null : new Date().toISOString();
    const { error: e } = await supabase
      .from("influencers")
      .update(
        next
          ? { docs_sent_at: next }
          : { docs_sent_at: null, memo_submitted_at: null }
      )
      .eq("id", influencer.id);
    setMarkingSent(false);
    if (e) {
      setError(`บันทึกสถานะไม่สำเร็จ: ${e.message}`);
      return;
    }
    log({
      action: "status",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: next
        ? "ยืนยันส่งเรื่องขอ Memo แล้ว (ขั้น 1)"
        : 'ย้อนกลับ "ส่งเรื่องขอ Memo" — เคสกลับมาขั้น 1',
    });
    notify({
      type: "memo_sent",
      scope: "memo",
      title: next
        ? `ส่งเรื่องขอ Memo ของ ${logNameOf(influencer)} แล้ว`
        : `ยกเลิกสถานะ “ส่งเรื่อง Memo” ของ ${logNameOf(influencer)}`,
      body: next
        ? "ขั้นต่อไป: ผู้ออก Memo ทำเอกสารส่งขออนุมัติ (ขั้น 1.1)"
        : null,
      href: `/influencers/${influencer.id}?view=${INFLU_STAGE.memo}`,
    });
    router.refresh();
  };

  /** ขั้น 1.1: ผู้ออก Memo ยืนยันว่า "ทำเอกสาร Memo ส่งขออนุมัติแล้ว" → ไปขั้น 1.2
      (ยกเลิก = ถอยกลับ 1.1 — ทำได้เฉพาะตอนยังไม่มีไฟล์อนุมัติ) */
  const setMemoSubmitted = async (next: boolean) => {
    setError(null);
    setConfirmingMemo(true);
    const { error: e } = await supabase
      .from("influencers")
      .update({ memo_submitted_at: next ? new Date().toISOString() : null })
      .eq("id", influencer.id);
    setConfirmingMemo(false);
    if (e) {
      setError(`บันทึกสถานะไม่สำเร็จ: ${e.message}`);
      return;
    }
    log({
      action: "status",
      entityId: influencer.id,
      influencerId: influencer.id,
      influencerName: logNameOf(influencer),
      summary: next
        ? "ยืนยันว่าทำเอกสาร Memo ส่งขออนุมัติแล้ว (ขั้น 1.1)"
        : 'ย้อนกลับ "ทำเอกสาร Memo แล้ว" — เคสกลับมาขั้น 1.1',
    });
    notify({
      type: "memo_submitted",
      scope: "memo",
      title: next
        ? `ทำเอกสาร Memo ของ ${logNameOf(influencer)} ส่งขออนุมัติแล้ว`
        : `ย้อนสถานะทำเอกสาร Memo ของ ${logNameOf(influencer)} กลับมาขั้น 1.1`,
      body: next
        ? "รออนุมัติ — ได้ไฟล์ Memo ที่อนุมัติแล้วให้อัพเข้าขั้น 1.2"
        : null,
      href: `/influencers/${influencer.id}?view=${INFLU_STAGE.memo}`,
    });
    router.refresh();
  };

  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");
  const nameWithNick = `คุณ${fullName}${
    influencer.nickname ? ` (ชื่อเล่น : ${influencer.nickname})` : ""
  }`;

  const subjectText = `ขออนุมัติเคสทางการตลาด ${nameWithNick}`;
  /** "Voucher 10,000 × 5 = 50,000 บาท" — null = ยังไม่เปิดวงเงิน (บรรทัดนี้หายไปจาก Memo) */
  const voucherText = voucherLabelOf(influencer);
  /** รายการที่ติ๊ก "แบรนด์ support" ไว้ (0106, ผู้ใช้ 2026-09-03) — มูลค่าที่ขออนุมัติ
      เป็นวงเงิน voucher ไม่รวมราคาสินค้าอยู่แล้ว แต่ผู้อนุมัติควรรู้ว่ารายการไหน
      เป็นของที่แบรนด์ส่งมาให้ ไม่ใช่ของที่บริษัทออกค่าใช้จ่ายเอง */
  const supportedItems = procedureItems.filter((i) => i.is_supported);
  const supportNote =
    supportedItems.length > 0
      ? `แบรนด์ support ${supportedItems.length} รายการ (ไม่คิดต้นทุน) — ${supportedItems
          .map((i) => i.name)
          .join(", ")}`
      : null;
  const tierText = influencer.tier
    ? `${INFLU_TIERS[influencer.tier].label} (${INFLU_TIERS[influencer.tier].range})`
    : "-";
  /* โปรแกรมที่ทำ พร้อมมูลค่าต่อรายการในวงเล็บ (ผู้ใช้ 2026-09-07: ผู้บริหารมองค่าใช้จ่าย
     จากวงเงิน voucher เป็นหลัก — ราคาต่อโปรแกรมเป็นข้อมูลประกอบ ไม่ใช่ยอดที่ขออนุมัติ) */
  const programLine =
    procedureItems.length > 0
      ? procedureItems
          .map((i) =>
            i.is_supported
              ? `${i.name} (แบรนด์ support)`
              : `${i.name} (${formatCurrency(Number(i.price) || 0)})`
          )
          .join(" / ")
      : influencer.procedure_text ||
        (influencer.consult_only ? CONSULT_ONLY_TEXT : "-");
  const detailText = [
    MEMO_COMPANY.purpose,
    "",
    `ชื่อ-นามสกุล : ${nameWithNick}`,
    `อาชีพ : ${influencer.occupation || "-"}`,
    `โปรแกรมที่ทำ : ${programLine}`,
    ...(supportNote ? [`หมายเหตุ : ${supportNote}`] : []),
    /* มูลค่าในเอกสารมาจาก **วงเงิน voucher + ค่าตัว** เท่านั้น (ผู้ใช้ 2026-09-03)
       — ราคาของสินค้าที่กดเลือกห้ามโผล่ในเอกสารที่ส่งขออนุมัติ (ยังดูได้ในระบบที่
       แท็บรายละเอียดเคส/หน้าต้นทุน) */
    ...(voucherText ? [`วงเงินที่ขออนุมัติ : ${voucherText}`] : []),
    // ค่าตัว = เคสที่ต้องจ่ายเงินให้ influ — บรรทัดนี้โผล่เฉพาะเคสที่กรอกไว้
    ...(influencer.talent_fee != null
      ? [`ค่าตัว : ${formatCurrency(influencer.talent_fee)}`]
      : []),
    `มูลค่ารวม : ${
      influencer.case_value != null
        ? formatCurrency(influencer.case_value)
        : "-"
    }`,
    // หมายเหตุงบเกินเพดาน Tier (0114) — เงื่อนไขที่ผู้อนุมัติชุดพิเศษใช้พิจารณา
    ...(influencer.budget_note
      ? [`หมายเหตุ (งบเกินเพดาน Tier) : ${influencer.budget_note}`]
      : []),
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
    const nowIso = new Date().toISOString();
    const { error: linkErr } = await supabase
      .from("influencers")
      .update({
        memo_file_path: path,
        memo_file_name: file.name,
        memo_uploaded_at: nowIso,
        // อัพไฟล์จากขั้นย่อยก่อนหน้า = เติมขั้น 1/1.1 ให้ครบไปด้วย (ไฟล์อนุมัติ
        // คือหลักฐานว่าเรื่องถูกส่งและเอกสารถูกทำไปแล้วจริง)
        ...(influencer.docs_sent_at ? {} : { docs_sent_at: nowIso }),
        ...(influencer.memo_submitted_at ? {} : { memo_submitted_at: nowIso }),
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
    // ข้ามขั้น = งานตกไปที่ผู้รับผิดชอบขั้นสัญญา จึงยิงเป็น stage_forward ให้คนกลุ่มนั้นเด่น
    notify(
      skipped
        ? {
            type: "stage_forward",
            scope: "contract",
            title: `${logNameOf(influencer)} ผ่านขั้น Memo แล้ว → ขั้นสัญญา + วันรับบริการ`,
            body: "Memo ที่อนุมัติแล้วถูกอัปโหลด — ขั้นต่อไปคือลงคิวหมอและเก็บสัญญาที่เซน",
            href: `/influencers/${influencer.id}?view=${INFLU_STAGE.contractService}`,
          }
        : {
            type: "memo_uploaded",
            scope: "memo",
            title: `เปลี่ยนไฟล์ Memo ของ ${logNameOf(influencer)}`,
            body: file.name,
            href: `/influencers/${influencer.id}?view=${INFLU_STAGE.memo}`,
          }
    );
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
      {/* เส้นขั้นย่อยของ Memo — 1 ส่งเรื่อง → 1.1 ทำเอกสาร → 1.2 อัพไฟล์อนุมัติ */}
      <MemoStepStrip step={step} />

      {/* ขั้น 1: เลือกผู้ออก Memo + ยืนยันส่งเรื่อง — คนสร้างเคส/ผู้ดูแลเป็นคนกด
          ไม่ซ่อนตัวเองแม้ผ่านขั้นไปแล้ว เพราะเป็นบันทึกว่าเคยส่งเมื่อไหร่ */}
      <Card className="space-y-4 p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <ClipboardCheck size={14} />
          {MEMO_SUBSTEPS[0].title}
        </p>
        {/* เลือกผู้ทำเอกสาร Memo ก่อนยืนยันส่งเรื่อง — เขาคือคนกดขั้น 1.1/1.2 ต่อ */}
        <AssigneeRolePicker
          role="memo"
          assignees={assignees}
          people={people}
          peopleById={peopleById}
          canEdit={fileEditable}
          busyUserId={busyUserId}
          onChange={onAssigneeChange}
        />
        {memoSent ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-800">
                ส่งเรื่องขอ Memo แล้ว
              </p>
              <p className="text-xs text-stone-500">
                ยืนยันเมื่อ {formatDateTime(influencer.docs_sent_at!)}
              </p>
            </div>
            {fileEditable && !memoUploaded && (
              <Button
                variant="ghost"
                onClick={() => void toggleMemoSent()}
                loading={markingSent}
                className="!px-2.5 !py-1 !text-xs"
              >
                <Undo2 size={13} />
                ย้อนกลับ
              </Button>
            )}
          </div>
        ) : !fileEditable ? (
          <p className="text-xs text-stone-400">ยังไม่ได้ยืนยันส่งเรื่องขอ Memo</p>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* บอกเหตุผลเฉพาะตอนปุ่มกดไม่ได้ — นอกนั้นปุ่มบอกตัวเองอยู่แล้ว */}
            {makerIds.length === 0 && (
              <p className="min-w-0 flex-1 text-xs text-amber-700">
                เลือกผู้ออก Memo ก่อน
              </p>
            )}
            <Button
              variant="secondary"
              onClick={() => void toggleMemoSent()}
              loading={markingSent}
              disabled={makerIds.length === 0}
            >
              <ClipboardCheck size={16} />
              ยืนยันส่งเรื่อง Memo
            </Button>
          </div>
        )}
      </Card>

      {/* ขั้น 1.1: ผู้ออก Memo ยืนยันว่าทำเอกสารส่งขออนุมัติแล้ว */}
      <Card className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <Send size={14} />
          {MEMO_SUBSTEPS[1].title}
        </p>
        {step === "1.0" ? (
          <p className="text-xs text-stone-400">
            จะทำขั้นนี้ได้เมื่อยืนยัน &quot;ส่งเรื่องขอ Memo&quot; (ขั้น 1) แล้ว
          </p>
        ) : influencer.memo_submitted_at ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-800">
                ทำเอกสาร Memo ส่งขออนุมัติแล้ว
              </p>
              <p className="text-xs text-stone-500">
                ยืนยันเมื่อ {formatDateTime(influencer.memo_submitted_at)}
              </p>
            </div>
            {canActMaker && !memoUploaded && (
              <Button
                variant="ghost"
                onClick={() => void setMemoSubmitted(false)}
                loading={confirmingMemo}
                className="!px-2.5 !py-1 !text-xs"
              >
                <Undo2 size={13} />
                ย้อนกลับ
              </Button>
            )}
          </div>
        ) : !fileEditable ? (
          <p className="text-xs text-stone-400">
            ยังไม่ได้ยืนยันว่าทำเอกสาร Memo แล้ว
          </p>
        ) : canActMaker ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => void setMemoSubmitted(true)}
              loading={confirmingMemo}
            >
              <Send size={16} />
              ยืนยันว่าทำ Memo ส่งแล้ว
            </Button>
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-800">
            <Send size={14} className="mt-0.5 shrink-0" />
            ขั้นนี้เป็นของผู้ออก Memo ({makerNames || "ยังไม่ได้เลือก"}) —
            ต้องเป็นคนนั้นกดยืนยันว่าทำเอกสารส่งขออนุมัติแล้ว
          </p>
        )}
      </Card>

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
                  ยังไม่มีรูป
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ขั้น 1.2: ไฟล์ Memo ที่อนุมัติแล้ว — อัพโหลดเก็บไว้ที่นี่ จึงจะไป stage ถัดไปได้
          (ผู้ออก Memo เป็นคนอัพ — คนเดียวกับขั้น 1.1) */}
      <Card className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <FileText size={14} />
          {MEMO_SUBSTEPS[2].title}
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
            {/* จอเล็ก: กลุ่มปุ่มไฟล์ลงบรรทัดของตัวเองแล้วชิดขวา — เรียงต่อท้ายชื่อไฟล์ไม่พอที่ 375px */}
            <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:justify-end">
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
              {/* เปลี่ยนไฟล์ได้จนกว่าเคสจะปิดงาน — แม้ขั้น Memo ผ่านไปแล้ว (ไฟล์เดิมถูกแทนที่+ลบทิ้ง) */}
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
        ) : !canActMaker ? (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-800">
            <Upload size={14} className="mt-0.5 shrink-0" />
            {makerIds.length === 0
              ? "ยังไม่ได้เลือกผู้ออก Memo — เลือกที่ขั้น 1 ด้านบนก่อน แล้วคนนั้นถึงอัพไฟล์ที่อนุมัติแล้วได้"
              : `ขั้นนี้เป็นของผู้ออก Memo (${makerNames}) — ต้องเป็นคนนั้นอัพไฟล์ Memo ที่อนุมัติแล้ว`}
          </p>
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

/* ---------- ครึ่งบนของขั้นรวม: สัญญา ----------
   ดาวน์โหลดแม่แบบสัญญา PDF → พิมพ์/เซน → อัพโหลดไฟล์ที่เซนแล้ว (เหมือน Memo) */

export function ContractStage(props: {
  influencer: InfluencerRow;
  readOnly: boolean;
  /** แก้ไฟล์สัญญาได้ไหม (เปลี่ยน/ลบ) — แยกจาก readOnly ที่ล็อกการเดิน stage
      กติกาเดียวกับ Memo: ไฟล์เป็นเอกสารของเคส แก้ได้จนกว่าเคสจะปิดงาน แม้ stage นี้ผ่านไปแล้ว */
  fileEditable: boolean;
}) {
  return (
    <ContractUploadStage
      influencer={props.influencer}
      readOnly={props.readOnly}
      fileEditable={props.fileEditable}
    />
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
  const notify = useInfluNotify();
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
    const startDay = influencer.contract_start ?? contractStartFor(influencer);
    const { error: linkErr } = await supabase
      .from("influencers")
      .update({
        contract_file_path: path,
        contract_file_name: file.name,
        contract_uploaded_at: new Date().toISOString(),
        // มีไฟล์สัญญาที่เซนแล้ว = เริ่มนับสัญญา 6 เดือน (ขั้นนี้รวมวันรับบริการไว้แล้ว
        // จึงไม่มีปุ่มยืนยันแยกอีกต่อไป) — อัพซ้ำเพื่อเปลี่ยนไฟล์ต้องไม่รีเซ็ตวันเริ่ม
        ...(influencer.contract_start ? {} : { contract_start: startDay }),
      })
      .eq("id", influencer.id);
    // เคสเข้าสู่การติดตามแล้ว — สร้าง checklist ผลลัพธ์ให้ครั้งเดียว (idempotent, best effort:
    // เป็นส่วนรองที่ไม่ force จึงไม่บล็อคการอัพไฟล์ ถ้าล้มจะเห็นเป็น "ยังไม่มีเช็คลิสต์" ในแผงติดตาม)
    if (!linkErr) await generateFollowupTasks(supabase, influencer.id, startDay);
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
    // อัพสัญญาครั้งแรก = เคสเข้าสู่การติดตาม → งานตกไปที่คนที่ถือ Follow Up
    notify(
      oldPath
        ? {
            type: "contract_uploaded",
            scope: "contract",
            title: `เปลี่ยนไฟล์สัญญาของ ${logNameOf(influencer)}`,
            body: file.name,
            href: `/influencers/${influencer.id}?view=${INFLU_STAGE.contractService}`,
          }
        : {
            type: "contract_uploaded",
            scope: "followup",
            baseLevel: "update",
            title: `${logNameOf(influencer)} เซนสัญญาแล้ว — เริ่มติดตามผลงาน`,
            body: `เริ่มนับสัญญา ${formatDate(startDay)} · ตั้งเป้าโพสได้ที่หน้า Follow Up`,
            href: "/influencers/contracts",
          }
    );
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
    notify({
      type: "contract_removed",
      scope: "contract",
      baseLevel: "update",
      title: `ลบไฟล์สัญญาของ ${logNameOf(influencer)}`,
      body: influencer.contract_start
        ? `ล้างวันเริ่มสัญญา (${formatDate(influencer.contract_start)}) — เคสหลุดจากหน้า Follow Up จนกว่าจะอัพสัญญาใหม่`
        : null,
      href: `/influencers/${influencer.id}?view=${INFLU_STAGE.contractService}`,
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
          ไฟล์แม่แบบสัญญา (PDF)
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
            {/* จอเล็ก: กลุ่มปุ่มไฟล์ (ดาวน์โหลด/เปลี่ยน/ลบ) ลงบรรทัดของตัวเองแล้วชิดขวา
                — 3 ปุ่มเรียงต่อท้ายชื่อไฟล์ล้นแนวนอนแน่นอนที่ 375px */}
            <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:justify-end">
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
            {influencer.contract_start !== null && (
              <>
                <br />
                <span className="text-amber-700">
                  เคสนี้เริ่มนับสัญญาไปแล้ว —
                  ลบแล้วเคสจะหายจากหน้า Follow Up (เป้าโพส/ลิงก์ที่แปะไว้ยังอยู่)
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
