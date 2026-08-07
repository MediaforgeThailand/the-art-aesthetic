"use client";

/**
 * ตารางไฟล์สื่อ (รูป/วิดีโอ/ไฟล์อื่น) พร้อม lightbox — ใช้ร่วมกันระหว่าง
 * หน้า All Media และแท็บ "รายบุคคล" ของ Team Workload
 *
 * ไฟล์ใน bucket `documents` เป็น private ทั้งหมด จึงต้องขอ signed URL ต่อไฟล์
 * (`useSignedUrl` มี cache ต่อ path อยู่แล้ว — การ์ดที่ remount ตอนกรองไม่ยิงซ้ำ)
 */

import { Download, FileText, ImageOff, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSignedUrl } from "@/app/(app)/influencers/use-signed-url";
import { MediaLightbox } from "@/app/(app)/tasks/media-lightbox";
import { Badge, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  MEDIA_KINDS,
  MEDIA_SOURCES,
  type MediaItem,
  mediaDisplayName,
} from "@/lib/media";

function MediaThumb({ item }: { item: MediaItem }) {
  const { url, failed } = useSignedUrl(item.filePath);

  if (item.kind === "other") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-stone-100 text-stone-400">
        <FileText size={26} />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-stone-100 text-[10px] text-stone-400">
        <ImageOff size={20} />
        เปิดไฟล์ไม่ได้
      </div>
    );
  }
  if (!url) {
    return <div className="h-full w-full animate-pulse bg-stone-100" />;
  }
  if (item.kind === "video") {
    return (
      <div className="relative h-full w-full bg-black/80">
        {/* preload=metadata: โหลดแค่เฟรมแรกพอทำ thumbnail ไม่ดึงทั้งไฟล์ */}
        <video
          src={url}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
            <Play size={16} fill="currentColor" />
          </span>
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={mediaDisplayName(item)}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}

function MediaCard({
  item,
  personName,
  onOpen,
}: {
  item: MediaItem;
  personName: string;
  onOpen: () => void;
}) {
  const { url } = useSignedUrl(item.filePath);

  return (
    <div className="glass group overflow-hidden rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        className="block aspect-[4/3] w-full cursor-pointer overflow-hidden"
        title={mediaDisplayName(item)}
      >
        <MediaThumb item={item} />
      </button>
      <div className="space-y-1.5 p-2.5">
        <p className="truncate text-xs font-medium text-stone-800">
          {mediaDisplayName(item)}
        </p>
        <Link
          href={`/tasks?task=${item.taskId}`}
          className="block truncate text-[11px] text-stone-500 hover:text-brand-700 hover:underline"
          title={item.taskTitle}
        >
          {item.taskTitle}
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          <Badge className={MEDIA_KINDS[item.kind].chip}>
            {MEDIA_KINDS[item.kind].label}
          </Badge>
          <Badge className="border border-stone-200 bg-white/70 text-stone-500">
            {MEDIA_SOURCES[item.source]}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <p className="min-w-0 flex-1 truncate text-[10px] text-stone-400">
            {personName} · {formatDateTime(item.uploadedAt)}
          </p>
          {url && (
            <a
              href={url}
              download={mediaDisplayName(item)}
              target="_blank"
              rel="noreferrer"
              title="ดาวน์โหลด"
              onClick={(e) => e.stopPropagation()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 sm:h-7 sm:w-7"
            >
              <Download size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function MediaGrid({
  items,
  nameOf,
  emptyLabel = "ไม่มีไฟล์ตามตัวกรองนี้",
}: {
  items: MediaItem[];
  /** ชื่อผู้รับผิดชอบของการ์ด — ผู้เรียกมี map ของ profiles อยู่แล้ว */
  nameOf: (assigneeId: string | null) => string;
  emptyLabel?: string;
}) {
  // เก็บเป็น index เพื่อให้ lightbox เลื่อนดูไฟล์อื่นในชุดที่กรองอยู่ได้ด้วยลูกศร
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) {
    return <EmptyState title={emptyLabel} />;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item, i) => (
          <MediaCard
            key={item.key}
            item={item}
            personName={nameOf(item.assigneeId)}
            onOpen={() => setOpenIndex(i)}
          />
        ))}
      </div>
      {openIndex !== null && (
        <MediaLightbox
          items={items.map((it) => ({
            file_path: it.filePath,
            file_name: mediaDisplayName(it),
          }))}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
