"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSignedUrl } from "@/lib/use-signed-url";
import { isImagePath, isVideoPath } from "./task-card";

export type LightboxItem = { file_path: string; file_name: string | null };

/**
 * Lightbox เต็มจอสำหรับดูรูป/วิดีโอ/ไฟล์ที่แนบในงาน — เปิดใหญ่ในหน้า ไม่ต้องเด้งไปแท็บ Supabase
 * เลื่อนดูไฟล์อื่นที่แนบได้ด้วยลูกศร ◀ ▶ (หรือปุ่มลูกศรบนคีย์บอร์ด) และแถบ thumbnail ด้านล่าง
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const count = items.length;
  const current = items[index];

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.stopPropagation();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.stopPropagation();
        go(1);
      }
    };
    // capture: ให้ชนะ handler Esc ของแผงรายละเอียด/เมนูอื่น (ปิดเฉพาะ lightbox)
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  if (!current) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ดูไฟล์แนบ"
      className="fixed inset-0 z-[80] flex flex-col bg-black/85 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* แถบบน: ชื่อไฟล์ + ตัวนับ + เปิดในแท็บใหม่ + ปิด */}
      <div
        className="flex items-center gap-3 px-4 py-3 text-white"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {current.file_name ?? "ไฟล์"}
          </p>
          {count > 1 && (
            <p className="text-xs text-white/50">
              {index + 1} / {count}
            </p>
          )}
        </div>
        <OpenInTabLink item={current} />
        <button
          type="button"
          onClick={onClose}
          title="ปิด (Esc)"
          aria-label="ปิด"
          className="cursor-pointer rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white active:scale-90"
        >
          <X size={20} />
        </button>
      </div>

      {/* พื้นที่แสดงไฟล์ใหญ่ */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {count > 1 && (
          <NavButton dir="left" onClick={() => go(-1)} />
        )}
        <LightboxMedia key={current.file_path} item={current} />
        {count > 1 && (
          <NavButton dir="right" onClick={() => go(1)} />
        )}
      </div>

      {/* แถบ thumbnail ด้านล่าง — กดกระโดดไปไฟล์ไหนก็ได้ */}
      {count > 1 && (
        <div
          className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-3"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <button
              key={`${it.file_path}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              title={it.file_name ?? undefined}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                i === index
                  ? "border-white opacity-100"
                  : "border-transparent opacity-55 hover:opacity-90"
              }`}
            >
              <ThumbPreview item={it} />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

/* ---------- ปุ่มลูกศรซ้าย/ขวา ---------- */

function NavButton({
  dir,
  onClick,
}: {
  dir: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "left" ? "ไฟล์ก่อนหน้า" : "ไฟล์ถัดไป"}
      className={`absolute top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 active:scale-90 ${
        dir === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      {dir === "left" ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  );
}

/* ---------- ไฟล์ใหญ่ตรงกลาง ---------- */

function LightboxMedia({ item }: { item: LightboxItem }) {
  const { url, failed } = useSignedUrl(item.file_path);

  if (failed) {
    return (
      <p className="text-sm text-white/60">
        เปิดไฟล์ไม่ได้ — ไฟล์อาจถูกลบไปแล้ว
      </p>
    );
  }
  if (!url) {
    return <Loader2 size={32} className="animate-spin text-white/50" />;
  }
  if (isImagePath(item.file_path)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={item.file_name ?? "ไฟล์แนบ"}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    );
  }
  if (isVideoPath(item.file_path)) {
    return (
      <video
        src={url}
        controls
        autoPlay
        playsInline
        className="max-h-full max-w-full rounded-lg shadow-2xl"
      />
    );
  }
  // ไฟล์อื่น (เช่น PDF) — โชว์ไอคอน + ปุ่มเปิดในแท็บใหม่
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl bg-white/10 px-10 py-12 text-center text-white">
      <FileText size={56} className="text-white/70" />
      <p className="max-w-xs break-all text-sm">{item.file_name ?? "ไฟล์"}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm transition-colors hover:bg-white/25"
      >
        <ExternalLink size={15} />
        เปิดไฟล์ในแท็บใหม่
      </a>
    </div>
  );
}

/* ---------- thumbnail เล็กในแถบล่าง ---------- */

function ThumbPreview({ item }: { item: LightboxItem }) {
  const { url } = useSignedUrl(item.file_path);
  if (url && isImagePath(item.file_path)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={item.file_name ?? "ไฟล์แนบ"}
        className="h-full w-full object-cover"
      />
    );
  }
  if (url && isVideoPath(item.file_path)) {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-full w-full items-center justify-center bg-white/10 text-white/50">
      <FileText size={18} />
    </span>
  );
}

/* ---------- ลิงก์เปิดในแท็บใหม่ (ยังเข้าถึง URL ตรงได้ถ้าต้องการ) ---------- */

function OpenInTabLink({ item }: { item: LightboxItem }) {
  const { url } = useSignedUrl(item.file_path);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="เปิดในแท็บใหม่"
      aria-label="เปิดในแท็บใหม่"
      className="cursor-pointer rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white active:scale-90"
    >
      <ExternalLink size={18} />
    </a>
  );
}
