"use client";

import {
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  PanelRightOpen,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { TaskWithAssignee } from "@/lib/types";
import { LightboxMedia, ThumbPreview } from "./media-lightbox";
import {
  AssigneeAvatar,
  currentReviewerIds,
  isVideoPath,
  type ProfileOption,
  profileName,
  reviewStepOf,
} from "./task-card";
import { ChatComposer, ChatMessages, useTaskChat } from "./task-chat";

/* ============================================================================
   หน้าตรวจงานแบบเต็มจอ — กดการ์ดในแท็บ "รอตรวจ" แล้วเปิดตัวเล่นวิดีโอ/ไฟล์ทันที
   พร้อม sidebar ที่คัดมาเฉพาะของที่ใช้ตรวจ: ลิงก์งาน · ดาวน์โหลด · ผู้รับผิดชอบ ·
   ปุ่มอนุมัติ/ตีกลับ · ช่องแชท — รายละเอียดอื่นทั้งหมดยังอยู่ในแผงงานเดิม
   (ปุ่ม "ดูรายละเอียดทั้งหมด" → onOpenFull)
   ----------------------------------------------------------------------------
   - z-[70]: สูงกว่าแผงงาน (50) แต่ต่ำกว่า Modal (80) — กล่องตีกลับ/ยืนยันจึงลอยทับได้
   - พื้นหลัง bg-black/95 ห้ามใส่ backdrop-blur (กติกาเดียวกับ media-lightbox:
     เบลอเต็มจอทำให้วิดีโอกระตุก)
   - mount ทีละตัวกับ TaskPanel เสมอ (useTaskChat ห้ามซ้อน 2 ตัวของงานเดียวกัน —
     realtime channel ชนกัน) — tasks-client เป็นคนคุม
   ========================================================================== */

export function ReviewViewer({
  task,
  profiles,
  userId,
  me,
  onClose,
  onOpenFull,
  onApprove,
  onApproveBypass,
  onReject,
  suspendEsc,
}: {
  task: TaskWithAssignee;
  profiles: ProfileOption[];
  userId: string | null;
  me: ProfileOption | null;
  onClose: () => void;
  /** เปิดแผงรายละเอียดเต็ม (task-panel) แทน viewer */
  onOpenFull: () => void;
  onApprove: (t: TaskWithAssignee) => void;
  onApproveBypass: (t: TaskWithAssignee) => void;
  onReject: (t: TaskWithAssignee) => void;
  /** มีโมดัลอื่นเปิดทับอยู่ (ตีกลับ/ยืนยัน) — Esc ต้องไม่ปิด viewer */
  suspendEsc: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const showError = useCallback((msg: string) => setError(msg), []);
  const chat = useTaskChat({ task, profiles, userId, me, onError: showError });

  const files = task.files ?? [];
  const count = files.length;
  // เปิดมาที่วิดีโอตัวแรกเลย (โจทย์ของหน้านี้คือตรวจคลิป) — ไม่มีวิดีโอค่อยเริ่มไฟล์แรก
  // ปลอดภัยเพราะ tasks-client remount ด้วย key={task.id} ทุกครั้งที่เปลี่ยนงาน
  const [index, setIndex] = useState(() => {
    const i = files.findIndex((f) => isVideoPath(f.file_path));
    return i >= 0 ? i : 0;
  });
  const current = count > 0 ? files[Math.min(index, count - 1)] : null;

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((i) => (Math.min(i, count - 1) + delta + count) % count);
    },
    [count]
  );

  // เมนู @mention ของช่องแชทเปิดอยู่หรือเปล่า — listener นี้เป็น capture phase
  // ถ้า stopPropagation ตอนเมนูเปิด Esc ของ ChatComposer (ตัวที่ปิดเมนู) จะไม่มีวันทำงาน
  const mentionOpen = chat.mentionQuery !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "TEXTAREA" ||
          el.tagName === "INPUT" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (e.key === "Escape") {
        if (suspendEsc) return;
        // ปล่อยให้ ChatComposer จัดการ Esc เอง (ปิดเมนู @mention) — ไม่แตะ viewer
        if (typing && mentionOpen) return;
        e.stopPropagation();
        // กำลังพิมพ์แชทอยู่ — Esc แรกแค่ออกจากช่องพิมพ์ ไม่ปิดทั้ง viewer
        if (typing) {
          el.blur();
          return;
        }
        onClose();
      } else if (e.key === "ArrowLeft") {
        if (typing) return;
        e.stopPropagation();
        go(-1);
      } else if (e.key === "ArrowRight") {
        if (typing) return;
        e.stopPropagation();
        go(1);
      }
    };
    // capture: ให้ชนะ handler Esc ของหน้า /tasks ข้างล่าง
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, mentionOpen, onClose, suspendEsc]);

  const [downloading, setDownloading] = useState(false);
  const downloadCurrent = async () => {
    if (!current || downloading) return;
    setDownloading(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .createSignedUrl(current.file_path, 3600, {
          download: current.file_name ?? true,
        });
      if (err || !data) {
        showError(`ดาวน์โหลดไฟล์ไม่สำเร็จ: ${err?.message ?? "ไม่ทราบสาเหตุ"}`);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  };

  // ปุ่มอนุมัติ/ตีกลับ — เงื่อนไข/ป้าย/คำอธิบายชุดเดียวกับใต้การ์ดใน review-list
  const canReview =
    task.review_status === "pending" &&
    userId !== null &&
    currentReviewerIds(task).includes(userId);
  const hasChain = task.reviewer2_id !== null;
  const step = reviewStepOf(task);
  const pendingOthers =
    step < 2
      ? currentReviewerIds(task).filter(
          (id) => id !== userId && id !== task.assignee_id
        )
      : [];
  const briefStage = step <= 0;
  const isFinalStep =
    !briefStage && (!hasChain || step >= 2) && pendingOthers.length === 0;

  const deliverableUrl = (task.deliverable_url ?? "").trim();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`ตรวจงาน ${task.title}`}
      // ห้ามใส่ backdrop-blur: เบลอเต็มจอทับหน้าที่มีการ์ดเยอะต้อง composite ใหม่
      // ทุกเฟรมที่วิดีโอวาด = กระตุก (บทเรียนเดียวกับ media-lightbox)
      className="fixed inset-0 z-[70] flex flex-col bg-black/95 animate-fade-in pt-safe lg:flex-row"
    >
      {/* ---------- ฝั่งซ้าย: ตัวเล่นไฟล์ ---------- */}
      <div className="flex min-h-0 flex-col max-lg:h-[45dvh] max-lg:shrink-0 lg:flex-1">
        <div className="flex items-center gap-3 px-4 py-3 text-white">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{task.title}</p>
            {count > 1 && (
              <p className="text-xs text-white/50">
                {Math.min(index, count - 1) + 1} / {count}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="ปิด (Esc)"
            aria-label="ปิดหน้าตรวจงาน"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white active:scale-90 sm:h-9 sm:w-9"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
          {count > 1 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="ไฟล์ก่อนหน้า"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 active:scale-90 sm:left-4"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {current ? (
            <LightboxMedia key={current.file_path} item={current} />
          ) : (
            <p className="text-sm text-white/60">
              งานนี้ไม่มีไฟล์แนบ — ดูงานจากลิงก์ทางขวา
            </p>
          )}
          {count > 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="ไฟล์ถัดไป"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 active:scale-90 sm:right-4"
            >
              <ChevronRight size={22} />
            </button>
          )}
        </div>

        {count > 1 && (
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-2 max-lg:hidden">
            {files.map((it, i) => (
              <button
                key={`${it.file_path}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                title={it.file_name ?? undefined}
                className={`h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                  i === Math.min(index, count - 1)
                    ? "border-white opacity-100"
                    : "border-transparent opacity-55 hover:opacity-90"
                }`}
              >
                <ThumbPreview item={it} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------- ฝั่งขวา: sidebar ตรวจงาน ---------- */}
      <aside className="flex min-h-0 flex-1 flex-col bg-white lg:w-96 lg:flex-none lg:border-l lg:border-stone-200 xl:w-[26rem]">
        {error && (
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            <span className="min-w-0 break-words">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="ปิดข้อความผิดพลาด"
              className="shrink-0 cursor-pointer rounded p-0.5 text-rose-400 hover:text-rose-600"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ผู้รับผิดชอบ + ทางไปแผงรายละเอียดเต็ม */}
        <div className="flex shrink-0 items-center gap-3 border-b border-stone-100 px-4 py-3">
          <AssigneeAvatar assignee={task.assignee} size={8} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-stone-800">
              {task.assignee ? profileName(task.assignee) : "ยังไม่ระบุ"}
            </p>
            <p className="text-xs text-stone-500">ผู้รับผิดชอบ</p>
          </div>
          <button
            type="button"
            onClick={onOpenFull}
            title="เปิดแผงรายละเอียดงานทั้งหมด"
            className="inline-flex max-sm:min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 active:scale-95"
          >
            <PanelRightOpen size={14} />
            ดูรายละเอียดทั้งหมด
          </button>
        </div>

        {/* ลิงก์งาน + ดาวน์โหลดไฟล์ */}
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-100 px-4 py-3">
          {deliverableUrl ? (
            <a
              href={deliverableUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-sm:min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all hover:opacity-95 active:scale-95"
            >
              <ExternalLink size={14} className="shrink-0" />
              <span className="truncate">เปิดลิงก์งาน</span>
            </a>
          ) : (
            <span className="inline-flex min-w-0 flex-1 items-center justify-center rounded-lg border border-dashed border-stone-200 px-3 py-2 text-xs text-stone-500">
              ยังไม่ใส่ลิงก์งาน
            </span>
          )}
          {current && (
            <button
              type="button"
              onClick={downloadCurrent}
              disabled={downloading}
              title="ดาวน์โหลดไฟล์ที่กำลังเปิดอยู่"
              className="inline-flex max-sm:min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition-all hover:bg-stone-50 active:scale-95 disabled:cursor-default disabled:opacity-60"
            >
              <Download size={14} className="shrink-0" />
              <span className="truncate">
                {downloading ? "กำลังเตรียมไฟล์..." : "ดาวน์โหลด"}
              </span>
            </button>
          )}
        </div>

        {/* ปุ่มตรวจงาน — โชว์เฉพาะเมื่อฉันคือผู้ตรวจของทอดปัจจุบัน */}
        {canReview && (
          <div className="shrink-0 space-y-1.5 border-b border-stone-100 px-4 py-3">
            <button
              type="button"
              onClick={() => onApprove(task)}
              title={
                briefStage
                  ? "ผ่านแล้ว — ส่งงานเข้าสายตรวจจริงต่อ"
                  : pendingOthers.length > 0
                    ? "ทอดแรกต้องอนุมัติครบทุกคน — อนุมัติแล้วงานจะรอผู้ตรวจร่วมอีกคนก่อนไปต่อ"
                    : isFinalStep
                      ? undefined
                      : "อนุมัติแล้วงานจะถูกส่งต่อให้ผู้ตรวจลำดับ 2 ตรวจขั้นสุดท้าย"
              }
              className="inline-flex max-sm:min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-xs font-medium text-white transition-all hover:bg-emerald-600 active:scale-95"
            >
              <CheckCircle2 size={14} />
              {briefStage
                ? "ผ่าน → ส่งเข้าสายตรวจจริง"
                : pendingOthers.length > 0
                  ? "อนุมัติ (รอผู้ตรวจร่วมอีกคน)"
                  : isFinalStep
                    ? "อนุมัติ"
                    : "อนุมัติ → ส่งต่อลำดับ 2"}
            </button>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onReject(task)}
                title={
                  briefStage
                    ? "ส่งกลับให้ผู้รับงานแก้ก่อนเข้าสายตรวจจริง (ไม่นับเป็นข้อผิดพลาดใน KPI)"
                    : "ตีกลับให้ผู้รับผิดชอบแก้ไข (นับเป็นการแก้ไข 1 ครั้ง)"
                }
                className="inline-flex max-sm:min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-600 transition-all hover:bg-rose-50 active:scale-95"
              >
                <Undo2 size={14} />
                {briefStage ? "ขอให้แก้ก่อน" : "ตีกลับ"}
              </button>
              {!briefStage && !isFinalStep && (
                <button
                  type="button"
                  onClick={() => onApproveBypass(task)}
                  title="อนุมัติจบทันทีโดยไม่ต้องรอคนที่ยังไม่ได้ตรวจ (มีกล่องยืนยันก่อน)"
                  className="inline-flex max-sm:min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-500 bg-white px-3 py-2 text-xs font-medium text-emerald-600 transition-all hover:bg-emerald-50 active:scale-95"
                >
                  <CheckCheck size={14} />
                  จบทันที
                </button>
              )}
            </div>
          </div>
        )}

        {/* แชทของงาน */}
        <p className="shrink-0 px-4 pt-2.5 text-xs font-semibold text-stone-500">
          พูดคุย
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5">
          <ChatMessages chat={chat} />
        </div>
        <ChatComposer chat={chat} />
      </aside>
    </div>,
    document.body
  );
}
