"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Loader2,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";
import type { Database, DataImportRow } from "@/lib/database.types";
import { formatDateTime, formatFileSize, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  type FieldMapping,
  type ParsedFile,
  TARGET_FIELD_DEFS,
  guessMapping,
  parseAmountValue,
  parseDateValue,
  parseFile,
  parseTextValue,
} from "./parse-utils";

type SalesInsert = Database["public"]["Tables"]["sales_records"]["Insert"];

const CHUNK_SIZE = 500;

const STEPS = ["เลือกไฟล์", "จับคู่คอลัมน์", "ยืนยันนำเข้า"];

const IMPORT_STATUS: Record<string, { label: string; badge: string }> = {
  completed: { label: "สำเร็จ", badge: "bg-emerald-100 text-emerald-700" },
  partial: { label: "บางส่วน", badge: "bg-amber-100 text-amber-700" },
  failed: { label: "ล้มเหลว", badge: "bg-rose-100 text-rose-700" },
};

/** แปลงค่าเซลล์เป็นข้อความสำหรับแสดงในตาราง preview */
function displayCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "" : v.toLocaleDateString("th-TH");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function textOf(
  header: string | undefined,
  row: Record<string, unknown>
): string | null {
  return header ? parseTextValue(row[header]) : null;
}

export function ImportClient({
  userId,
  history,
}: {
  userId: string;
  history: DataImportRow[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  /* ---------- ตรวจความถูกต้องของแต่ละแถวตาม mapping ปัจจุบัน ---------- */

  const rowValidity = useMemo<boolean[]>(() => {
    if (!parsed) return [];
    const dateHeader = mapping.record_date;
    const amountHeader = mapping.amount;
    return parsed.rows.map((row) => {
      const d = dateHeader ? parseDateValue(row[dateHeader]) : null;
      const a = amountHeader ? parseAmountValue(row[amountHeader]) : null;
      return d !== null && a !== null;
    });
  }, [parsed, mapping.record_date, mapping.amount]);

  const validCount = useMemo(
    () => rowValidity.filter(Boolean).length,
    [rowValidity]
  );
  const invalidCount = parsed ? parsed.rows.length - validCount : 0;
  const mappingReady = Boolean(mapping.record_date && mapping.amount);

  /* ---------- ขั้น 1: เลือกไฟล์ ---------- */

  async function handleFile(f: File) {
    const lower = f.name.toLowerCase();
    if (
      !lower.endsWith(".csv") &&
      !lower.endsWith(".xlsx") &&
      !lower.endsWith(".xls")
    ) {
      setFile(null);
      setParseError("รองรับเฉพาะไฟล์ .csv, .xlsx หรือ .xls เท่านั้น");
      return;
    }
    setFile(f);
    setParseError(null);
    setParsing(true);
    try {
      const result = await parseFile(f);
      setParsed(result);
      setMapping(guessMapping(result.headers));
      setStep(2);
    } catch (err) {
      setParsed(null);
      setParseError(
        err instanceof Error
          ? err.message
          : "อ่านไฟล์ไม่สำเร็จ กรุณาตรวจสอบไฟล์อีกครั้ง"
      );
    } finally {
      setParsing(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setFile(null);
    setParsed(null);
    setMapping({});
    setParseError(null);
    setImportError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ---------- ขั้น 3: นำเข้าข้อมูล ---------- */

  function buildRecords(importId: string): SalesInsert[] {
    if (!parsed) return [];
    const records: SalesInsert[] = [];
    for (const row of parsed.rows) {
      const recordDate = mapping.record_date
        ? parseDateValue(row[mapping.record_date])
        : null;
      const amount = mapping.amount
        ? parseAmountValue(row[mapping.amount])
        : null;
      if (recordDate === null || amount === null) continue;

      const quantity = mapping.quantity
        ? parseAmountValue(row[mapping.quantity])
        : null;
      records.push({
        record_date: recordDate,
        amount,
        quantity: quantity !== null && quantity > 0 ? quantity : 1,
        unit_price: mapping.unit_price
          ? parseAmountValue(row[mapping.unit_price])
          : null,
        branch: textOf(mapping.branch, row),
        category: textOf(mapping.category, row),
        item_name: textOf(mapping.item_name, row),
        customer_name: textOf(mapping.customer_name, row),
        staff_name: textOf(mapping.staff_name, row),
        payment_method: textOf(mapping.payment_method, row),
        note: textOf(mapping.note, row),
        source: "import",
        import_id: importId,
        created_by: userId || null,
      });
    }
    return records;
  }

  async function handleImport() {
    if (!parsed || !file || !mappingReady || validCount === 0 || importing) {
      return;
    }
    setImporting(true);
    setImportError(null);
    const supabase = createClient();

    // (1) สร้างแถวประวัติการนำเข้าก่อน เพื่อเอา id ไปผูกกับ sales_records
    const { data: importRow, error: logError } = await supabase
      .from("data_imports")
      .insert({
        file_name: file.name,
        total_rows: parsed.rows.length,
        imported_rows: 0,
        status: "completed",
        imported_by: userId || null,
      })
      .select()
      .single();

    if (logError || !importRow) {
      setImportError(
        `สร้างรายการนำเข้าไม่สำเร็จ: ${logError?.message ?? "ไม่ทราบสาเหตุ"}`
      );
      setImporting(false);
      return;
    }

    // (2) insert ยอดขายทีละ chunk (500 แถว)
    const records = buildRecords(importRow.id);
    let inserted = 0;
    let failMessage: string | null = null;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from("sales_records").insert(chunk);
      if (error) {
        failMessage = error.message;
        break;
      }
      inserted += chunk.length;
    }

    // (3) อัปเดตผลลัพธ์จริงลงประวัติการนำเข้า
    if (failMessage) {
      await supabase
        .from("data_imports")
        .update({
          imported_rows: inserted,
          status: inserted > 0 ? "partial" : "failed",
          error: failMessage,
        })
        .eq("id", importRow.id);
      setImportError(
        inserted > 0
          ? `นำเข้าสำเร็จเพียงบางส่วน (${formatNumber(inserted)} จาก ${formatNumber(records.length)} แถว): ${failMessage}`
          : `นำเข้าข้อมูลไม่สำเร็จ: ${failMessage}`
      );
      setImporting(false);
      router.refresh();
      return;
    }

    await supabase
      .from("data_imports")
      .update({ imported_rows: inserted })
      .eq("id", importRow.id);

    // (4) แสดงผลสรุปสำเร็จ
    setImportResult({
      imported: inserted,
      skipped: parsed.rows.length - inserted,
    });
    setImporting(false);
    router.refresh();
  }

  /* ---------- render ---------- */

  return (
    <div>
      <PageHeader
        title="นำเข้าข้อมูลยอดขาย"
        description="อัปโหลดไฟล์ยอดขายจากทีม DA (CSV หรือ Excel) ระบบจะช่วยจับคู่คอลัมน์และตรวจสอบข้อมูลให้ก่อนนำเข้า"
      />

      <StepIndicator current={step} done={importResult !== null} />

      {importResult ? (
        <Card className="p-10 animate-scale-in">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <h2 className="text-lg font-semibold text-stone-900">
              นำเข้าข้อมูลสำเร็จ
            </h2>
            <p className="text-sm text-stone-500">
              นำเข้ายอดขาย {formatNumber(importResult.imported)} แถวจากไฟล์{" "}
              {file?.name ?? "-"}
              {importResult.skipped > 0 &&
                ` (ข้าม ${formatNumber(importResult.skipped)} แถวที่ข้อมูลไม่ถูกต้อง)`}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={resetWizard}>
                <RotateCcw size={16} />
                นำเข้าไฟล์ใหม่
              </Button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-cream shadow-sm transition-all duration-200 hover:from-brand-600 hover:to-brand-700 hover:shadow-md active:scale-[0.97]"
              >
                <LayoutDashboard size={16} />
                ไปดูแดชบอร์ด
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* ---------- ขั้น 1: เลือกไฟล์ ---------- */}
          {step === 1 && (
            <Card className="p-6 animate-fade-in-up">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200 ${
                  dragActive
                    ? "border-brand-400 bg-brand-50/60 scale-[1.01]"
                    : "border-brand-200 hover:border-brand-400 hover:bg-brand-50/40"
                }`}
              >
                <UploadCloud
                  size={40}
                  className={`transition-colors duration-200 ${dragActive ? "text-brand-500" : "text-brand-300"}`}
                />
                <div>
                  <p className="text-sm font-medium text-stone-700">
                    ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    รองรับไฟล์ยอดขายจากทีม DA นามสกุล .csv, .xlsx และ .xls
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleFile(f);
                  }}
                />
              </div>

              {file && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-700">
                  <FileSpreadsheet size={16} className="shrink-0 text-brand-500" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-stone-400">
                    ({formatFileSize(file.size)})
                  </span>
                  {parsing && (
                    <span className="ml-auto flex items-center gap-1.5 text-stone-500">
                      <Loader2 size={14} className="animate-spin" />
                      กำลังอ่านไฟล์…
                    </span>
                  )}
                </div>
              )}

              {parseError && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </Card>
          )}

          {/* ---------- ขั้น 2: จับคู่คอลัมน์ + preview ---------- */}
          {step === 2 && parsed && (
            <div className="space-y-4">
              <Card className="p-6">
                <h2 className="text-sm font-semibold text-stone-900">
                  จับคู่คอลัมน์
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  เลือกว่าคอลัมน์ไหนในไฟล์ตรงกับข้อมูลอะไรในระบบ (ฟิลด์ที่มี{" "}
                  <span className="text-rose-600">*</span> จำเป็นต้องเลือก)
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {TARGET_FIELD_DEFS.map((def) => (
                    <div key={def.key}>
                      <Label htmlFor={`map-${def.key}`}>
                        {def.label}
                        {def.required && (
                          <span className="ml-0.5 text-rose-600">*</span>
                        )}
                      </Label>
                      <Select
                        id={`map-${def.key}`}
                        value={mapping[def.key] ?? ""}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          setMapping((prev) => ({
                            ...prev,
                            [def.key]: e.target.value || undefined,
                          }))
                        }
                      >
                        <option value="">— ไม่ใช้ —</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                  <Badge className="bg-emerald-100 text-emerald-700">
                    นำเข้าได้ {formatNumber(validCount)} แถว
                  </Badge>
                  {invalidCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-700">
                      ข้าม {formatNumber(invalidCount)} แถว
                    </Badge>
                  )}
                  <span className="text-xs text-stone-400">
                    จากทั้งหมด {formatNumber(parsed.rows.length)} แถว — แถวที่ข้าม
                    คือแถวที่แปลงวันที่หรือยอดเงินไม่ได้
                  </span>
                </div>

                {!mappingReady && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700">
                    <AlertCircle size={14} className="shrink-0" />
                    กรุณาเลือกคอลัมน์สำหรับ &quot;วันที่ขาย&quot; และ
                    &quot;ยอดเงิน&quot; ก่อนดำเนินการต่อ
                  </p>
                )}
                {mappingReady && validCount === 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-600">
                    <AlertCircle size={14} className="shrink-0" />
                    ไม่มีแถวที่นำเข้าได้เลย
                    กรุณาตรวจสอบว่าเลือกคอลัมน์วันที่และยอดเงินถูกต้อง
                  </p>
                )}
              </Card>

              <Card>
                <div className="border-b border-stone-200 px-6 py-4">
                  <h2 className="text-sm font-semibold text-stone-900">
                    ตัวอย่างข้อมูล (10 แถวแรก)
                  </h2>
                  <p className="mt-0.5 text-xs text-stone-400">
                    แถวพื้นสีแดงอ่อนคือแถวที่จะถูกข้ามเพราะข้อมูลไม่ถูกต้อง
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                        <th className="px-3 py-2 font-medium">#</th>
                        {parsed.headers.map((h) => {
                          const mappedTo = TARGET_FIELD_DEFS.find(
                            (d) => mapping[d.key] === h
                          );
                          return (
                            <th
                              key={h}
                              className="whitespace-nowrap px-3 py-2 font-medium"
                            >
                              {h}
                              {mappedTo && (
                                <span className="ml-1.5 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                                  {mappedTo.label}
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 10).map((row, i) => (
                        <tr
                          key={i}
                          className={`border-b border-stone-100 last:border-0 ${
                            rowValidity[i] ? "" : "bg-rose-50/60"
                          }`}
                        >
                          <td className="px-3 py-2 text-stone-400">{i + 1}</td>
                          {parsed.headers.map((h) => (
                            <td
                              key={h}
                              className="whitespace-nowrap px-3 py-2 text-stone-700"
                            >
                              {displayCell(row[h])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={resetWizard}>
                  <ArrowLeft size={16} />
                  เลือกไฟล์ใหม่
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!mappingReady || validCount === 0}
                >
                  ถัดไป
                  <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* ---------- ขั้น 3: ยืนยัน + นำเข้า ---------- */}
          {step === 3 && parsed && file && (
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-stone-900">
                ยืนยันการนำเข้า
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                ตรวจสอบสรุปข้อมูลก่อนนำเข้าสู่ระบบ
              </p>

              <dl className="mt-4 space-y-2 rounded-lg bg-stone-50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-stone-500">ไฟล์</dt>
                  <dd className="truncate font-medium text-stone-800">
                    {file.name}{" "}
                    <span className="font-normal text-stone-400">
                      ({formatFileSize(file.size)})
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-stone-500">จำนวนแถวทั้งหมด</dt>
                  <dd className="font-medium text-stone-800">
                    {formatNumber(parsed.rows.length)} แถว
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-stone-500">จะนำเข้า</dt>
                  <dd className="font-medium text-emerald-600">
                    {formatNumber(validCount)} แถว
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-stone-500">จะข้าม (ข้อมูลไม่ถูกต้อง)</dt>
                  <dd
                    className={`font-medium ${invalidCount > 0 ? "text-amber-600" : "text-stone-800"}`}
                  >
                    {formatNumber(invalidCount)} แถว
                  </dd>
                </div>
              </dl>

              {importError && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <Button
                  variant="secondary"
                  onClick={() => setStep(2)}
                  disabled={importing}
                >
                  <ArrowLeft size={16} />
                  ย้อนกลับ
                </Button>
                <Button
                  onClick={() => void handleImport()}
                  loading={importing}
                  disabled={validCount === 0}
                >
                  {importing
                    ? "กำลังนำเข้า…"
                    : `นำเข้าข้อมูล ${formatNumber(validCount)} แถว`}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ---------- ประวัติการนำเข้า ---------- */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <History size={16} className="text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-900">
            ประวัติการนำเข้าล่าสุด
          </h2>
        </div>
        <Card>
          {history.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet size={32} />}
              title="ยังไม่มีประวัติการนำเข้า"
              description="เมื่อนำเข้าไฟล์ยอดขายแล้ว ประวัติจะแสดงที่นี่"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                    <th className="px-4 py-3 font-medium">ไฟล์</th>
                    <th className="px-4 py-3 font-medium">วันที่นำเข้า</th>
                    <th className="px-4 py-3 text-right font-medium">
                      แถวนำเข้า / ทั้งหมด
                    </th>
                    <th className="px-4 py-3 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const status = IMPORT_STATUS[row.status] ?? {
                      label: row.status,
                      badge: "bg-stone-100 text-stone-600",
                    };
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-stone-100 transition-colors last:border-0 hover:bg-brand-50/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-stone-800">
                            <FileSpreadsheet
                              size={16}
                              className="shrink-0 text-stone-400"
                            />
                            <span
                              className="max-w-60 truncate"
                              title={row.file_name}
                            >
                              {row.file_name}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-stone-700">
                          {formatNumber(row.imported_rows ?? 0)} /{" "}
                          {formatNumber(row.total_rows ?? 0)}
                        </td>
                        <td className="px-4 py-3" title={row.error ?? undefined}>
                          <Badge className={status.badge}>{status.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------- step indicator ---------- */

function StepIndicator({ current, done }: { current: number; done: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-y-2 animate-fade-in-up">
      {STEPS.map((label, i) => {
        const num = i + 1;
        const isDone = done || num < current;
        const isActive = !done && num === current;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`mx-3 h-px w-8 transition-colors duration-300 sm:w-14 ${
                  isDone || isActive ? "bg-brand-300" : "bg-stone-200"
                }`}
              />
            )}
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                  isDone
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream"
                    : isActive
                      ? "border-2 border-brand-600 bg-white text-brand-700"
                      : "border border-stone-300 bg-white text-stone-400"
                }`}
              >
                {isDone ? <Check size={14} /> : num}
              </span>
              <span
                className={`text-sm ${
                  isActive
                    ? "font-medium text-stone-900"
                    : isDone
                      ? "text-stone-600"
                      : "text-stone-400"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
