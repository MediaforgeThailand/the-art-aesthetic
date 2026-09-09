"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { createCase } from "@/lib/queue/actions";
import {
  FIELD_LABEL,
  REQUIRED_FOR_ONLINE,
  parseCaseText,
  type ParsedField,
} from "@/lib/queue/parser";
import { CASE_TYPE_LABEL, type CaseType } from "@/lib/queue/types";

/**
 * วางข้อความ → อ่านค่าออกมาให้ตรวจ → ยืนยัน
 *
 * การอ่านทำด้วยกฎล้วนในเครื่องผู้ใช้ ไม่มีการส่งข้อความออกไปที่ AI ใดๆ (ข้อ 6.1)
 * ช่องอ่อนไหว (เลขบัตรประชาชน/โรคประจำตัว/ประวัติแพ้ยา) ถูกตัดทิ้งตั้งแต่ชั้น parser
 */

type FieldSpec = { field: ParsedField; type?: "date" | "time" | "number" | "area" };

const LAYOUT: FieldSpec[][] = [
  [{ field: "customer_name" }, { field: "customer_age", type: "number" }],
  [{ field: "phone" }, { field: "line_id" }],
  [
    { field: "appointment_date", type: "date" },
    { field: "appointment_time", type: "time" },
  ],
  [{ field: "treatment_main" }],
  [{ field: "treatment_detail", type: "area" }],
  [{ field: "doctor" }, { field: "branch" }],
  [{ field: "channel" }, { field: "seller_name" }],
  [
    { field: "owner_bc_name" },
    { field: "discussion_start_date", type: "date" },
  ],
  [{ field: "closed_date", type: "date" }, { field: "note" }],
];

type CreateResult = {
  status?: string;
  case_id?: string;
  case_no?: number;
  member_name?: string;
  seq_today?: number;
  rank?: number;
  weight?: number;
  assignment_status?: string;
  existing_case_no?: number;
  existing_case_id?: string;
  existing_assignee?: string;
};

export default function NewCaseClient({
  onlineChannels,
}: {
  onlineChannels: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [raw, setRaw] = useState("");
  const [edits, setEdits] = useState<Partial<Record<ParsedField, string>>>({});
  const [caseType, setCaseType] = useState<CaseType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [forceReason, setForceReason] = useState("");

  // คีย์กันสร้างซ้ำ — สร้างตอนกดครั้งแรก (ไม่ใช่ตอน render) แล้วใช้ตัวเดิมทุกครั้งที่ลองใหม่
  const keyRef = useRef<string | null>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);

  const [pasteHint, setPasteHint] = useState<string | null>(null);

  // รับข้อความใหม่ = เคสใหม่ ต้องล้างทุกอย่างที่ผูกกับเคสก่อนหน้า
  // โดยเฉพาะ keyRef — ถ้าค้างไว้ RPC จะตีกลับว่าเป็นรายการเดิม แล้วเคสใหม่จะหายเงียบ
  const takeText = useCallback((text: string) => {
    keyRef.current = null;
    setRaw(text);
    setEdits({});
    setResult(null);
    setPasteHint(null);
    setError(null);
  }, []);

  // Ctrl+V ตรงไหนของหน้าก็ลงกล่องนี้ — แอดมินไม่ต้องเล็งคลิกช่องก่อน
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA"
      ) {
        return;
      }
      const text = event.clipboardData?.getData("text/plain");
      if (!text?.trim()) return;
      event.preventDefault();
      takeText(text);
      rawRef.current?.focus();
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [takeText]);

  // ปุ่มวาง — บน iPad กดปุ่มเดียวจบ ไม่ต้องแตะค้างเรียกเมนู
  function pasteFromClipboard() {
    setPasteHint(null);
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!text.trim()) {
          setPasteHint("คลิปบอร์ดว่าง — คัดลอกข้อความจากแชทก่อน");
          return;
        }
        takeText(text);
        rawRef.current?.focus();
      })
      .catch(() => {
        setPasteHint("เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด — กดในกล่องแล้ว Ctrl+V / แตะค้างเลือก Paste");
        rawRef.current?.focus();
      });
  }

  const parsed = useMemo(
    () => (raw.trim() ? parseCaseText(raw, { onlineChannels }) : null),
    [raw, onlineChannels]
  );

  const merged: Record<ParsedField, string> = useMemo(() => {
    const base = {} as Record<ParsedField, string>;
    for (const key of Object.keys(FIELD_LABEL) as ParsedField[]) {
      const parsedValue = parsed?.fields[key];
      base[key] = edits[key] ?? (parsedValue == null ? "" : String(parsedValue));
    }
    return base;
  }, [parsed, edits]);

  const effectiveType: CaseType =
    caseType || parsed?.suggestedCaseType || "online";

  const missing =
    effectiveType === "online"
      ? REQUIRED_FOR_ONLINE.filter((f) => !merged[f].trim())
      : [];
  const missingContact =
    effectiveType === "online" && !merged.phone.trim() && !merged.line_id.trim();

  const canSubmit =
    Boolean(parsed) &&
    parsed?.status !== "unrecognized" &&
    missing.length === 0 &&
    !missingContact;

  function reset() {
    keyRef.current = null;
    setPasteHint(null);
    setRaw("");
    setEdits({});
    setCaseType("");
    setResult(null);
    setForceReason("");
    setError(null);
  }

  function submit(force = false) {
    if (!parsed) return;
    if (force && !forceReason.trim()) {
      setError("ต้องระบุเหตุผลก่อนสร้างเคสซ้ำ");
      return;
    }
    setError(null);

    const payload: Record<string, string | number | null> = {};
    for (const key of Object.keys(FIELD_LABEL) as ParsedField[]) {
      const value = merged[key].trim();
      payload[key] =
        value === "" ? null : key === "customer_age" ? Number(value) || null : value;
    }

    if (!keyRef.current) keyRef.current = crypto.randomUUID();

    startTransition(async () => {
      const response = await createCase({
        payload,
        caseType: effectiveType,
        idempotencyKey: keyRef.current as string,
        force,
        forceReason: force ? forceReason.trim() : undefined,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.result as CreateResult);
      router.refresh();
    });
  }

  /* ---------- ผลลัพธ์: สร้างสำเร็จ ---------- */
  if (result && (result.status === "created" || result.status === "duplicate_request")) {
    const dup = result.status === "duplicate_request";
    // มีแต่เคส Online เท่านั้นที่เข้าคิวรัน ประเภทอื่นบันทึกไว้เฉยๆ ไม่มีการหา BC
    const queued = effectiveType === "online";
    return (
      <div className="glass mx-auto max-w-lg rounded-xl p-5 text-center animate-fade-in-up">
        <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
        <h1 className="mt-2 text-lg font-semibold text-stone-900">
          {dup
            ? "รายการนี้บันทึกไปแล้ว"
            : queued
              ? "จ่ายคิวเรียบร้อย"
              : "บันทึกเคสแล้ว"}
        </h1>
        {result.member_name ? (
          <p className="mt-1 text-sm text-stone-600">
            เคส #{result.case_no} → <b className="text-stone-900">{result.member_name}</b>
            {result.seq_today ? ` (คิวที่ ${result.seq_today} ของวันนี้)` : ""}
          </p>
        ) : dup ? (
          // RPC ตอบกลับแบบ duplicate_request จะไม่มีข้อมูลผู้รับคิวติดมา
          // ห้ามเดาว่า "ไม่มี BC รับคิว" — ของจริงคือรายการนี้บันทึกไว้ก่อนหน้าแล้ว
          <p className="mt-1 text-sm text-stone-600">
            กดยืนยันซ้ำ — ระบบใช้รายการเดิมที่บันทึกไว้แล้ว ไม่ได้สร้างเคสใหม่
          </p>
        ) : queued ? (
          <p className="mt-1 text-sm text-rose-600">
            ยังไม่มี BC ที่รับคิวได้ — เคสนี้รอจ่ายเองที่หน้าคิว
          </p>
        ) : (
          <p className="mt-1 text-sm text-stone-600">
            เคส #{result.case_no} · {CASE_TYPE_LABEL[effectiveType]} — ไม่เข้าคิวรัน
            บันทึกไว้อย่างเดียว
          </p>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          {result.case_id && (
            <Link href={`/queue/cases/${result.case_id}`}>
              <Button variant="secondary" className="w-full sm:w-auto">
                ดูรายละเอียด
              </Button>
            </Link>
          )}
          <Button onClick={reset}>วางเคสถัดไป</Button>
        </div>
      </div>
    );
  }

  /* ---------- ผลลัพธ์: เจอเคสซ้ำ ต้องยืนยันก่อน ---------- */
  const duplicate = result?.status === "duplicate_case" ? result : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <Label htmlFor="raw" className="mb-0">
            วางข้อความจากแชทตรงนี้
          </Label>
          <Button
            variant="secondary"
            className="px-2.5 py-1 text-xs"
            onClick={pasteFromClipboard}
          >
            <ClipboardPaste size={14} /> วางจากคลิปบอร์ด
          </Button>
        </div>
        <Textarea
          id="raw"
          ref={rawRef}
          autoFocus
          rows={16}
          value={raw}
          onChange={(e) => takeText(e.target.value)}
          placeholder="ข้อความจากแชท"
          className="font-mono text-[13px] leading-6"
        />
        {pasteHint && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {pasteHint}
          </p>
        )}
        {/* บรรทัดอธิบายนโยบายข้อมูล (อ่านค่าในเครื่อง / ไม่เก็บเลขบัตร-โรคประจำตัว-แพ้ยา) ถูกถอด
            ตามกติกาแอปหลัก "ห้ามคำอธิบายใน UI" — นโยบายนั้นยังบังคับที่ parser (ดู AGENTS.md หัวข้อ Sales Queue) */}
        {parsed && parsed.ignoredSensitiveLabels.length > 0 && (
          <p className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
            ตัดออกให้แล้ว: {parsed.ignoredSensitiveLabels.join(", ")}
          </p>
        )}
      </div>

      <div className="min-w-0">
        {!parsed && (
          <div className="glass-soft flex h-full min-h-40 items-center justify-center rounded-xl p-6 text-center text-sm text-stone-400">
            วางข้อความแล้วค่าจะขึ้นที่นี่ให้ตรวจก่อนยืนยัน
          </div>
        )}

        {parsed?.status === "unrecognized" && (
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            อ่าน Format ไม่ออก — ตรวจว่าวางครบและมีหัวข้อ เช่น “ชื่อ-นามสกุล:”
          </p>
        )}

        {parsed && parsed.status !== "unrecognized" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Label htmlFor="case_type">ประเภทเคส</Label>
                <Select
                  id="case_type"
                  value={effectiveType}
                  onChange={(e) => setCaseType(e.target.value as CaseType)}
                >
                  {(Object.keys(CASE_TYPE_LABEL) as CaseType[]).map((type) => (
                    <option key={type} value={type}>
                      {CASE_TYPE_LABEL[type]}
                    </option>
                  ))}
                </Select>
              </div>
              {effectiveType !== "online" && (
                <p className="pb-2 text-xs text-stone-500">ไม่เข้าคิวรัน — บันทึกไว้อย่างเดียว</p>
              )}
            </div>

            {parsed.conflicts.map((conflict) => (
              <div
                key={conflict.field}
                className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                <p className="font-medium">
                  {FIELD_LABEL[conflict.field]} ไม่ตรงกัน — เลือกค่าที่ถูก
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {conflict.candidates.map((candidate) => (
                    <button
                      key={`${candidate.label}-${candidate.value}`}
                      type="button"
                      onClick={() =>
                        setEdits((prev) => ({
                          ...prev,
                          [conflict.field]: candidate.value,
                        }))
                      }
                      className={`cursor-pointer rounded-md border px-2 py-1 transition-colors ${
                        merged[conflict.field] === candidate.value
                          ? "border-amber-500 bg-white font-medium"
                          : "border-amber-200 bg-white/60 hover:border-amber-400"
                      }`}
                    >
                      {candidate.label}: {candidate.value}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="space-y-2.5">
              {LAYOUT.map((row, index) => (
                <div
                  key={index}
                  className={`grid gap-2.5 ${row.length > 1 ? "sm:grid-cols-2" : ""}`}
                >
                  {row.map(({ field, type }) => {
                    const required = missing.includes(field);
                    return (
                      <div key={field}>
                        <Label htmlFor={field} className="mb-1 text-xs">
                          {FIELD_LABEL[field]}
                          {required && <span className="ml-1 text-rose-500">ต้องกรอก</span>}
                        </Label>
                        {type === "area" ? (
                          <Textarea
                            id={field}
                            rows={2}
                            value={merged[field]}
                            onChange={(e) =>
                              setEdits((prev) => ({ ...prev, [field]: e.target.value }))
                            }
                          />
                        ) : (
                          <Input
                            id={field}
                            type={type ?? "text"}
                            value={merged[field]}
                            onChange={(e) =>
                              setEdits((prev) => ({ ...prev, [field]: e.target.value }))
                            }
                            className={required ? "border-rose-300" : ""}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {missingContact && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                ต้องมีเบอร์ติดต่อหรือ ID LINE อย่างน้อยหนึ่งอย่าง
              </p>
            )}

            {duplicate && (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  เคยมีเคสนี้แล้ว — #{duplicate.existing_case_no}
                  {duplicate.existing_assignee ? ` (${duplicate.existing_assignee})` : ""}
                </p>
                <Input
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                  placeholder="เหตุผลที่ต้องสร้างซ้ำ"
                  className="mt-2"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    loading={pending}
                    onClick={() => submit(true)}
                  >
                    ยืนยันสร้างซ้ำ
                  </Button>
                  {duplicate.existing_case_id && (
                    <Link href={`/queue/cases/${duplicate.existing_case_id}`}>
                      <Button variant="secondary" className="px-3 py-1.5 text-xs">
                        เปิดเคสเดิม
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            )}

            {!duplicate && (
              <div className="flex justify-end gap-2 pb-2">
                <Button variant="secondary" onClick={reset}>
                  ล้าง
                </Button>
                <Button loading={pending} disabled={!canSubmit} onClick={() => submit(false)}>
                  ยืนยันและจ่ายคิว <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
