"use client";

import { ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import type { WellnessLabFileRow } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { tooLargeSummary, uploadWithProgress } from "@/lib/upload";
import { prepareUploadFiles } from "@/lib/upload-prepare";
import { useSignedUrl } from "@/lib/use-signed-url";
import { newLabFilePath } from "@/lib/wellness-constants";

/** ไฟล์ผลแลบเท่าที่ต้องใช้เปิดดู — หน้าปฏิทิน/คิวแพทย์ select มาไม่ครบทุกคอลัมน์ */
type LabFileLite = Pick<
  WellnessLabFileRow,
  "id" | "file_path" | "file_name" | "created_at"
>;

/**
 * ลิงก์เปิดไฟล์ผลแลบ 1 ไฟล์ (อ่านอย่างเดียว) — ใช้ที่ปฏิทินคิวและหน้าคิวตรวจของแพทย์
 * แยก component เพราะ useSignedUrl เป็น hook ต่อ path
 */
export function LabFileOpenLink({ file }: { file: LabFileLite }) {
  const { url, failed } = useSignedUrl(file.file_path);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <FileText size={15} className="shrink-0 text-brand-500" />
      <span className="min-w-0 flex-1 truncate text-xs text-stone-700">
        {file.file_name}
      </span>
      {failed ? (
        <span className="shrink-0 text-[11px] text-rose-500">เปิดไม่ได้</span>
      ) : (
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!url}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 max-sm:min-h-11 ${
            url ? "" : "pointer-events-none opacity-50"
          }`}
        >
          <ExternalLink size={11} /> เปิดดู
        </a>
      )}
    </li>
  );
}

/** แถวไฟล์ผลแลบในโหมดจัดการ (มีปุ่มลบ) */
function LabFileRow({
  file,
  canEdit,
  onDelete,
}: {
  file: LabFileLite;
  canEdit: boolean;
  onDelete: (file: LabFileLite) => void;
}) {
  const { url, failed } = useSignedUrl(file.file_path);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <FileText size={18} className="shrink-0 text-brand-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-stone-700">
          {file.file_name}
        </span>
        <span className="block text-xs text-stone-400">
          อัพเมื่อ {formatDateTime(file.created_at)}
        </span>
      </span>
      {failed ? (
        <span className="shrink-0 text-[11px] text-rose-500">
          เปิดไฟล์ไม่ได้
        </span>
      ) : (
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!url}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 max-sm:min-h-11 ${
            url ? "" : "pointer-events-none opacity-50"
          }`}
        >
          <ExternalLink size={12} /> เปิดดู
        </a>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => onDelete(file)}
          title="ลบไฟล์นี้"
          aria-label={`ลบไฟล์ ${file.file_name}`}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
        >
          <Trash2 size={15} />
        </button>
      )}
    </li>
  );
}

type PanelProps = {
  customerId: string;
  files: LabFileLite[];
  /** อัพ/ลบไฟล์ได้ไหม (ทีม Lab และเคสยังไม่ปิด) */
  canEdit: boolean;
  uid: string | null;
  onAdded: (rows: WellnessLabFileRow[]) => void;
  onRemoved: (fileId: string) => void;
  /** ข้อความตอนยังไม่มีไฟล์ — ต่างกันตามหน้า (คิว Lab vs หน้าเคส) */
  emptyText?: string;
};

/**
 * เนื้อในของกล่องไฟล์ผลแลบ — ปุ่มอัพโหลด + แถบความคืบหน้า + ลิสต์ไฟล์ (ไม่มีกรอบ/หัวข้อ)
 * ใช้ซ้ำได้ทั้งในแถวคิวของหน้า "อัพผลแลบ" และในการ์ดของหน้าเคส
 *
 * อัพผิด/สลับคนได้เสมอ: ลบแล้วอัพใหม่ (กติกาผู้ใช้ — ทีม Lab ต้องแก้ไข/ลบไฟล์ได้ถ้าผิด)
 * ไฟล์จริงอยู่ bucket documents path `wellness/{customerId}/` — ลบแถว = ลบไฟล์ใน storage ด้วย
 */
export function LabFilesPanel({
  customerId,
  files,
  canEdit,
  uid,
  onAdded,
  onRemoved,
  emptyText,
}: PanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{
    name: string;
    index: number;
    total: number;
    ratio: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LabFileLite | null>(null);

  async function handleFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0 || uploading) return;
    setError(null);

    // รูปสแกนถูกย่อก่อน (PDF ผ่านตามเดิม) แล้วค่อยเช็คเพดานขนาด — ลำดับตามกติกา upload
    const prepared = await prepareUploadFiles(picked);
    const tooBig = tooLargeSummary(prepared);
    if (tooBig) {
      setError(tooBig);
      return;
    }

    const supabase = createClient();
    const added: WellnessLabFileRow[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const f = prepared[i];
      setUploading({
        name: f.name,
        index: i + 1,
        total: prepared.length,
        ratio: 0,
      });
      const path = newLabFilePath(customerId, f.name, i);
      const { error: upErr } = await uploadWithProgress(
        STORAGE_BUCKET_DOCUMENTS,
        path,
        f,
        (ratio) => setUploading((u) => (u ? { ...u, ratio } : u))
      );
      if (upErr) {
        setError(upErr.message);
        break;
      }
      const { data, error: insErr } = await supabase
        .from("wellness_lab_files")
        .insert({
          customer_id: customerId,
          file_path: path,
          file_name: f.name,
          uploaded_by: uid,
        })
        .select("*")
        .single();
      if (insErr || !data) {
        setError(insErr?.message ?? "บันทึกรายการไฟล์ไม่สำเร็จ");
        break;
      }
      added.push(data);
    }
    setUploading(null);
    if (added.length > 0) {
      onAdded(added);
      router.refresh();
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("wellness_lab_files")
      .delete()
      .eq("id", target.id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    // ลบไฟล์จริงใน storage แบบ best effort — แถว DB หายแล้ว ไฟล์กำพร้าไม่โผล่ใน UI
    void supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .remove([target.file_path])
      .then(() => undefined)
      .catch(() => undefined);
    onRemoved(target.id);
    router.refresh();
  }

  return (
    <div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!!uploading}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-default disabled:opacity-60 max-sm:min-h-11"
          >
            {uploading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            อัพโหลดไฟล์ผลตรวจ
          </button>
          <span className="text-xs text-stone-400">
            PDF หรือรูปสแกน · เลือกได้หลายไฟล์
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      )}

      {uploading && (
        <div className="mx-4 mt-2 rounded-lg bg-brand-50/70 px-3 py-2">
          <p className="text-xs text-brand-700">
            กำลังอัพโหลด {uploading.name} ({uploading.index}/{uploading.total})
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
              style={{ width: `${Math.round(uploading.ratio * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mx-4 mt-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-stone-400">
          {emptyText ??
            (canEdit
              ? "ยังไม่มีไฟล์ผลตรวจ — กด “อัพโหลดไฟล์ผลตรวจ” เพื่อแนบ PDF/รูปสแกน"
              : "ยังไม่มีไฟล์ผลตรวจ — รอทีม Lab อัพโหลด")}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-white/60">
          {files.map((f) => (
            <LabFileRow
              key={f.id}
              file={f}
              canEdit={canEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="ลบไฟล์ผลตรวจ"
        message={`ลบไฟล์ "${deleteTarget?.file_name ?? ""}" ถาวร? ไฟล์ใน storage จะถูกลบด้วย กู้คืนไม่ได้ — ถ้าอัพผิดให้ลบแล้วอัพไฟล์ที่ถูกแทน`}
        confirmLabel="ลบไฟล์"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/** กล่องไฟล์ผลแลบพร้อมหัวข้อ (ใช้ในหน้าเคส) */
export function LabFilesCard(props: PanelProps & { title?: string }) {
  const { title = "ผลตรวจเลือด (Lab)", ...panel } = props;
  return (
    <section className="glass overflow-hidden rounded-xl">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/60 px-4 py-3">
        <h2 className="text-base font-semibold text-stone-800">{title}</h2>
        <span className="text-[13px] text-stone-400">{panel.files.length} ไฟล์</span>
      </header>
      <LabFilesPanel {...panel} />
    </section>
  );
}
