"use client";

/**
 * ไฟล์แนบของงานใน My List — วิดีโอ/รูป/ไอเดียที่เก็บไว้กับงานตัวเอง (ตาราง list_task_files)
 *
 * ใช้ 3 ที่ในหน้าเดียวกัน:
 *   - `FilesCell`    คอลัมน์ "ไฟล์" ในตาราง (จอ ≥sm) — อัพจากแถวได้เลย กดรูปเปิด lightbox
 *   - `FilesChip`    ชิปสรุปจำนวนบนแถวย่อของจอเล็ก (กดแล้วเปิดแผงรายละเอียด)
 *   - `FilesSection` ส่วนจัดการเต็มในแผงรายละเอียด (อัพ/ดู/ลบ)
 *
 * ไฟล์ใน bucket `documents` เป็น private ทั้งหมด จึงต้องขอ signed URL ต่อไฟล์
 * (`useSignedUrl` มี cache ต่อ path ให้แล้ว — แถวที่ re-render ไม่ยิงขอซ้ำ)
 * ตัว lightbox ใช้ตัวเดียวกับบอร์ดทีม เพื่อให้พฤติกรรมการดูไฟล์เหมือนกันทั้งระบบ
 */

import { FileText, ImageOff, Paperclip, Play, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useSignedUrl } from "@/lib/use-signed-url";
import { MediaLightbox } from "@/app/(app)/tasks/media-lightbox";
import { formatFileSize } from "@/lib/format";
import { isImagePath, isVideoPath } from "@/lib/media";
import type { ListTaskFileRow } from "@/lib/types";
import { MAX_UPLOAD_BYTES } from "@/lib/upload";

/** ความคืบหน้าการอัพโหลดของงานหนึ่งใบ (index เริ่มที่ 0) */
export type UploadProgress = { index: number; total: number; pct: number };

function Thumb({ file }: { file: ListTaskFileRow }) {
  const { url, failed } = useSignedUrl(file.file_path);
  const isImage = isImagePath(file.file_path);
  const isVideo = isVideoPath(file.file_path);

  if (!isImage && !isVideo) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-stone-100 text-stone-400">
        <FileText size={14} />
      </span>
    );
  }
  if (failed) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-stone-100 text-stone-400">
        <ImageOff size={13} />
      </span>
    );
  }
  if (!url) {
    return <span className="block h-full w-full animate-pulse bg-stone-100" />;
  }
  if (isVideo) {
    return (
      <span className="relative block h-full w-full bg-black/80">
        {/* preload=metadata: ดึงแค่เฟรมแรกพอทำ thumbnail ไม่โหลดวิดีโอทั้งไฟล์ */}
        <video
          src={url}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center text-white">
          <Play size={12} fill="currentColor" />
        </span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={file.file_name}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}

/** ปุ่มเลือกไฟล์ + input ที่ซ่อนไว้ — ใช้ร่วมกันระหว่างเซลล์ในตารางและแผงรายละเอียด */
function PickButton({
  onPick,
  disabled,
  title,
  className,
  children,
}: {
  onPick: (files: FileList) => void;
  disabled?: boolean;
  title: string;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) onPick(files);
          // ล้างค่าเพื่อให้เลือกไฟล์เดิมซ้ำได้ (ไม่งั้น onChange ไม่ยิงรอบสอง)
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        title={title}
        aria-label={title}
        className={className}
      >
        {children}
      </button>
    </>
  );
}

/* ---------- คอลัมน์ "ไฟล์" ในตาราง (จอ ≥sm) ---------- */

export function FilesCell({
  taskTitle,
  files,
  uploading,
  onPick,
}: {
  taskTitle: string;
  files: ListTaskFileRow[];
  uploading: boolean;
  onPick: (files: FileList) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const shown = files.slice(0, 3);

  return (
    <div className="flex min-w-0 items-center gap-1 border-l border-brand-100/70 px-2">
      {shown.map((f, i) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setOpenIndex(i)}
          title={f.file_name}
          aria-label={`เปิดไฟล์ ${f.file_name}`}
          className="h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded border border-brand-100 transition-transform hover:scale-105"
        >
          <Thumb file={f} />
        </button>
      ))}
      {files.length > shown.length && (
        <button
          type="button"
          onClick={() => setOpenIndex(shown.length)}
          title={`ดูไฟล์ทั้งหมด ${files.length} ไฟล์`}
          className="shrink-0 cursor-pointer text-[11px] text-stone-400 hover:text-brand-600"
        >
          +{files.length - shown.length}
        </button>
      )}
      <PickButton
        onPick={onPick}
        disabled={uploading}
        title={`แนบไฟล์เข้างาน: ${taskTitle}`}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-stone-300 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:cursor-wait disabled:opacity-60"
      >
        {uploading ? (
          <Upload size={13} className="animate-pulse text-brand-500" />
        ) : (
          <Plus size={14} />
        )}
      </PickButton>

      {openIndex !== null && (
        <MediaLightbox
          items={files.map((f) => ({
            file_path: f.file_path,
            file_name: f.file_name,
          }))}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}

/* ---------- ปุ่มแนบไฟล์บนแถวย่อของจอเล็ก (ไม่มีคอลัมน์ไฟล์ให้กด) ---------- */

export function PickFilesButton({
  taskTitle,
  uploading,
  onPick,
}: {
  taskTitle: string;
  uploading: boolean;
  onPick: (files: FileList) => void;
}) {
  return (
    <PickButton
      onPick={onPick}
      disabled={uploading}
      title={`แนบไฟล์เข้างาน: ${taskTitle}`}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center self-start rounded-lg text-stone-300 transition-colors active:scale-90 disabled:cursor-wait sm:hidden"
    >
      {uploading ? (
        <Upload size={16} className="animate-pulse text-brand-500" />
      ) : (
        <Paperclip size={16} />
      )}
    </PickButton>
  );
}

/* ---------- ชิปบนแถวย่อของจอเล็ก ---------- */

export function FilesChip({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
      <Paperclip size={10} />
      {count}
    </span>
  );
}

/* ---------- ส่วนจัดการไฟล์ในแผงรายละเอียด ---------- */

export function FilesSection({
  files,
  uploading,
  progress,
  onPick,
  onRemove,
}: {
  files: ListTaskFileRow[];
  uploading: boolean;
  progress: UploadProgress | null;
  onPick: (files: FileList) => void;
  onRemove: (file: ListTaskFileRow) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-stone-500">
          ไฟล์แนบ (วิดีโอ / รูป / ไอเดีย)
          {files.length > 0 && (
            <span className="ml-1 text-stone-400">· {files.length} ไฟล์</span>
          )}
        </span>
        <PickButton
          onPick={onPick}
          disabled={uploading}
          title="อัพโหลดไฟล์เข้างานนี้"
          className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60 max-sm:min-h-11"
        >
          <Upload size={14} />
          อัพโหลด
        </PickButton>
      </div>

      {uploading && progress && (
        <div className="mb-2">
          <p className="mb-1 text-[11px] text-stone-500">
            กำลังอัพโหลด {progress.index + 1}/{progress.total} ·{" "}
            {Math.round(progress.pct * 100)}%
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
            <span
              className="block h-full bg-brand-500 transition-[width] duration-150"
              style={{ width: `${Math.round(progress.pct * 100)}%` }}
            />
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <PickButton
          onPick={onPick}
          disabled={uploading}
          title="เลือกไฟล์ที่จะแนบ"
          className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-brand-200 bg-white/50 px-3 py-5 text-xs text-stone-400 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:cursor-wait"
        >
          <Paperclip size={18} />
          กดเพื่อแนบวิดีโอ รูป หรือไฟล์ไอเดียของงานนี้
        </PickButton>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={f.id} className="group/file relative">
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                title={f.file_name}
                className="block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border border-brand-100 bg-white"
              >
                <Thumb file={f} />
              </button>
              <p className="mt-1 truncate text-[10px] text-stone-400" title={f.file_name}>
                {f.file_name}
              </p>
              <button
                type="button"
                onClick={() => onRemove(f)}
                aria-label={`ลบไฟล์ ${f.file_name}`}
                title="ลบไฟล์นี้"
                /* reveal-on-hover = โผล่ตลอดบนจอสัมผัสที่ไม่มี hover (ไม่งั้นกดลบไม่ได้เลย) */
                className="reveal-on-hover absolute right-1 top-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/90 text-stone-400 opacity-0 shadow-sm transition-all hover:text-rose-600 group-hover/file:opacity-100 max-sm:h-9 max-sm:w-9"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <p className="mt-2 text-[11px] text-stone-400">
          กดที่ไฟล์เพื่อดูเต็มจอ · เพดาน {formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์
          (วิดีโอยาวกว่านั้นให้วางลิงก์ Google Drive ในโน้ตแทน)
        </p>
      )}

      {openIndex !== null && (
        <MediaLightbox
          items={files.map((f) => ({
            file_path: f.file_path,
            file_name: f.file_name,
          }))}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}
