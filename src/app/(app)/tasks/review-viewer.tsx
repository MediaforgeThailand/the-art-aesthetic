"use client";

import {
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  PanelRightOpen,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { TaskWithAssignee } from "@/lib/types";
import { LightboxMedia, ThumbPreview } from "./media-lightbox";
import { DriveLinkButton } from "./review-poster";
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
   ----------------------------------------------------------------------------
   จอ ≥lg: sidebar ข้างขวาที่คัดมาเฉพาะของที่ใช้ตรวจ (โครงเดิม ไม่แตะ)
   จอ <lg: วิดีโอ/กราฟิกเต็มจอ + แถบควบคุมลอยทับด้านบน/ล่าง (อนุมัติ/ตีกลับ/ช่องแชท
   เด่นสุด เคียงข้างกัน) + ปุ่ม Drive บนแถบบน ส่วนที่เหลือ (ดูรายละเอียด/ดาวน์โหลด/จบทันที) ยุบเป็น
   ปุ่ม "เพิ่มเติม" มุมขวาล่าง กดแล้วเด้ง bottom sheet (Modal ของระบบ)
   ⚠️ จอเล็ก/ใหญ่แยกเป็นคนละ return ทั้งก้อน (ไม่ใช่ CSS max-lg:/lg: ผสมกันในต้นไม้เดียว)
   เพราะ ChatComposer ทั้งสองแบบผูก ref เดียวกัน (chat.commentInputRef จาก useTaskChat) —
   mount ซ้อนกันพร้อมกัน (ซ่อนด้วย CSS อย่างเดียว) จะแย่งกันเป็นเจ้าของ ref ผิดตัว
   ----------------------------------------------------------------------------
   - z-[70]: สูงกว่าแผงงาน (50) แต่ต่ำกว่า Modal (80) — กล่องตีกลับ/ยืนยัน/เพิ่มเติมจึงลอยทับได้
   - พื้นหลัง bg-black/95 ห้ามใส่ backdrop-blur (กติกาเดียวกับ media-lightbox:
     เบลอเต็มจอทำให้วิดีโอกระตุก)
   - mount ทีละตัวกับ TaskPanel เสมอ (useTaskChat ห้ามซ้อน 2 ตัวของงานเดียวกัน —
     realtime channel ชนกัน) — tasks-client เป็นคนคุม
   ========================================================================== */

/** ใช้ตัดสินว่า mount ChatComposer ชุดจอเล็กหรือจอใหญ่ (ห้าม mount พร้อมกัน — ดูหมายเหตุบน) */
const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

function subscribeViewport(callback: () => void) {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener("change", callback);
  // เผื่อเบราว์เซอร์/โหมด emulate บางตัวไม่ยิง change ตอน resize
  window.addEventListener("resize", callback);
  return () => {
    mql.removeEventListener("change", callback);
    window.removeEventListener("resize", callback);
  };
}
const getIsMobile = () => window.matchMedia(MOBILE_MEDIA_QUERY).matches;
const getIsMobileServer = () => false;

/** จอเล็ก (<lg) หรือไม่ — component นี้ mount เฉพาะฝั่ง client อยู่แล้ว (เปิดจากอีเวนต์ผู้ใช้) */
function useIsMobileViewer() {
  return useSyncExternalStore(subscribeViewport, getIsMobile, getIsMobileServer);
}

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
  const isMobile = useIsMobileViewer();
  const [moreOpen, setMoreOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

  // ปาดนิ้วซ้าย-ขวาบนตัวเล่น (จอเล็ก) เปลี่ยนไฟล์ — เก็บจุดเริ่มไว้ใน ref กันรีเรนเดอร์ทุกจุดสัมผัส
  const touchStartXRef = useRef<number | null>(null);
  const onMediaTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  }, []);
  const onMediaTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = touchStartXRef.current;
      touchStartXRef.current = null;
      if (startX === null || count <= 1) return;
      const endX = e.changedTouches[0]?.clientX ?? startX;
      const delta = endX - startX;
      const SWIPE_THRESHOLD = 40;
      if (delta > SWIPE_THRESHOLD) go(-1);
      else if (delta < -SWIPE_THRESHOLD) go(1);
    },
    [count, go]
  );

  // แถบ thumbnail จอเล็ก — เลื่อนตามให้รูปที่เลือกอยู่เห็นเสมอ (สลับด้วยปาดนิ้ว/ลูกศร)
  const thumbRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thumbRowRef.current
      ?.querySelector<HTMLElement>(
        `[data-thumb-index="${Math.min(index, count - 1)}"]`
      )
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index, count]);

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
        // ปล่อยให้ ChatComposer จัดการ Esc เอง (ปิดเมนู @mention) — ไม่แตะ viewer/ชีทแชท
        if (typing && mentionOpen) return;
        // แผ่นเพิ่มเติม/ชีทแชทเปิดอยู่ — Esc ปิดชั้นนั้นก่อน ไม่ปิดทั้ง viewer
        if (moreOpen) {
          e.stopPropagation();
          setMoreOpen(false);
          return;
        }
        if (chatOpen) {
          e.stopPropagation();
          if (typing) {
            el.blur();
            return;
          }
          setChatOpen(false);
          return;
        }
        e.stopPropagation();
        // กำลังพิมพ์แชทอยู่ — Esc แรกแค่ออกจากช่องพิมพ์ ไม่ปิดทั้ง viewer
        if (typing) {
          el.blur();
          return;
        }
        onClose();
      } else if (e.key === "ArrowLeft") {
        if (typing || moreOpen || chatOpen) return;
        e.stopPropagation();
        go(-1);
      } else if (e.key === "ArrowRight") {
        if (typing || moreOpen || chatOpen) return;
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
  }, [go, mentionOpen, moreOpen, chatOpen, onClose, suspendEsc]);

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
  const canBypass = canReview && !briefStage && !isFinalStep;

  const deliverableUrl = (task.deliverable_url ?? "").trim();
  const hasMessages = (chat.comments?.length ?? 0) > 0;

  const moreSheet = (
    <Modal
      open={moreOpen}
      onClose={() => setMoreOpen(false)}
      title="ตัวเลือกเพิ่มเติม"
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
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
        <div className="flex items-center gap-3">
          <AssigneeAvatar assignee={task.assignee} size={8} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">
              {task.assignee ? profileName(task.assignee) : "ยังไม่ระบุ"}
            </p>
            <p className="text-xs text-stone-500">ผู้รับผิดชอบ</p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              onOpenFull();
            }}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:scale-[0.98]"
          >
            <PanelRightOpen size={17} className="shrink-0 text-stone-400" />
            ดูรายละเอียดทั้งหมด
          </button>

          {current && (
            <button
              type="button"
              onClick={downloadCurrent}
              disabled={downloading}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:scale-[0.98] disabled:cursor-default disabled:opacity-60"
            >
              <Download size={17} className="shrink-0 text-stone-400" />
              {downloading ? "กำลังเตรียมไฟล์..." : "ดาวน์โหลดไฟล์นี้"}
            </button>
          )}

          {canBypass && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onApproveBypass(task);
              }}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-[0.98]"
            >
              <CheckCheck size={17} className="shrink-0" />
              จบทันที (ไม่ต้องรอคนอื่น)
            </button>
          )}
        </div>
      </div>
    </Modal>
  );

  /* ==========================================================================
     จอเล็ก (<lg): วิดีโอ/กราฟิกเต็มจอ + แถบควบคุมลอยทับ
     ========================================================================== */
  if (isMobile) {
    const approveLabel = briefStage
      ? "ผ่าน → ตรวจจริง"
      : pendingOthers.length > 0
        ? "อนุมัติ (รอคนอื่น)"
        : "อนุมัติ";
    const approveHint = briefStage
      ? "ผ่านแล้ว — ส่งงานเข้าสายตรวจจริงต่อ"
      : pendingOthers.length > 0
        ? "ทอดแรกต้องอนุมัติครบทุกคน — อนุมัติแล้วงานจะรอผู้ตรวจร่วมอีกคนก่อนไปต่อ"
        : isFinalStep
          ? "อนุมัติงานนี้"
          : "อนุมัติแล้วงานจะถูกส่งต่อให้ผู้ตรวจลำดับ 2 ตรวจขั้นสุดท้าย";
    const rejectLabel = briefStage ? "ขอให้แก้ก่อน" : "ตีกลับ";
    const rejectHint = briefStage
      ? "ส่งกลับให้ผู้รับงานแก้ก่อนเข้าสายตรวจจริง (ไม่นับเป็นข้อผิดพลาดใน KPI)"
      : "ตีกลับให้ผู้รับผิดชอบแก้ไข";

    return (
      <>
        {createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`ตรวจงาน ${task.title}`}
            // ห้ามใส่ backdrop-blur: เบลอเต็มจอทำให้วิดีโอกระตุก (บทเรียนเดียวกับ media-lightbox)
            className="fixed inset-0 z-[70] bg-black/95 animate-fade-in pt-safe"
          >
        <div className="relative h-full w-full">
          {/* ---------- วิดีโอ/กราฟิก เต็มจอ — ปาดซ้าย/ขวาเปลี่ยนไฟล์ได้ ---------- */}
          <div
            className="absolute inset-0 z-0 flex items-center justify-center"
            onTouchStart={onMediaTouchStart}
            onTouchEnd={onMediaTouchEnd}
          >
            {count > 1 && (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="ไฟล์ก่อนหน้า"
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors active:scale-90"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            {current ? (
              <LightboxMedia key={current.file_path} item={current} />
            ) : deliverableUrl ? (
              // งานคลิปไม่มีไฟล์ในระบบแล้ว (ปิดรับอัพวิดีโอ) — ลิงก์ Drive คือทางเดียวที่จะดูงาน
              // จึงต้องเป็นปุ่มใหญ่กลางจอ ไม่ใช่ข้อความชี้ไปหาเมนูอื่น
              <DriveLinkButton url={deliverableUrl} variant="hero" />
            ) : (
              <p className="px-6 text-center text-sm text-white/60">
                งานนี้ไม่มีไฟล์แนบและยังไม่ใส่ลิงก์งาน
              </p>
            )}
            {count > 1 && (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="ไฟล์ถัดไป"
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors active:scale-90"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>

          {/* ---------- แถบบนลอยทับ: ชื่องาน + ปิด + thumbnail (มีหลายไฟล์) ---------- */}
          <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-4 pb-6 pt-3 text-white">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.title}</p>
                {count > 1 && (
                  <p className="text-xs text-white/60">
                    {Math.min(index, count - 1) + 1} / {count} ไฟล์
                  </p>
                )}
              </div>
              {/* ลิงก์ Drive ต้องอยู่หน้าจอหลัก ไม่ใช่ในชีท "เพิ่มเติม" — งานคลิปดูได้จากที่นี่ทางเดียว */}
              {deliverableUrl && (
                <DriveLinkButton
                  url={deliverableUrl}
                  variant="bar"
                  label="Drive"
                />
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="ปิดหน้าตรวจงาน"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors active:scale-90"
              >
                <X size={20} />
              </button>
            </div>
            {/* งานนี้มีหลายไฟล์ — โชว์ thumbnail ให้เห็นชัดว่ามีหลายรูป/คลิป กดข้ามหรือปาดที่วิดีโอก็ได้ */}
            {count > 1 && (
              <div
                ref={thumbRowRef}
                className="flex items-center gap-2 overflow-x-auto pb-0.5"
              >
                {files.map((it, i) => (
                  <button
                    key={`${it.file_path}-${i}`}
                    type="button"
                    data-thumb-index={i}
                    onClick={() => setIndex(i)}
                    aria-label={`ไฟล์ที่ ${i + 1}`}
                    className={`h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                      i === Math.min(index, count - 1)
                        ? "border-white opacity-100"
                        : "border-white/25 opacity-60"
                    }`}
                  >
                    <ThumbPreview item={it} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---------- แถบล่างลอยทับ: อนุมัติ/ตีกลับ + ปุ่มเปิดแชท + เพิ่มเติม ---------- */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-safe-3 pt-14">
            {error && (
              <div className="flex items-start justify-between gap-2 rounded-xl bg-rose-600/90 px-3 py-2 text-xs text-white">
                <span className="min-w-0 break-words">{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  aria-label="ปิดข้อความผิดพลาด"
                  className="shrink-0 cursor-pointer rounded p-0.5 text-white/80 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {canReview && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // อนุมัติแล้วปิดการ์ดนี้เลย — กลับไปหน้าเลือกตรวจงานอื่นต่อทันที
                    onApprove(task);
                    onClose();
                  }}
                  aria-label={approveHint}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-emerald-400 bg-emerald-500 px-3 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/50 transition-all active:scale-95"
                >
                  <CheckCircle2 size={17} />
                  {approveLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onReject(task)}
                  aria-label={rejectHint}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-3 text-sm font-semibold text-rose-600 shadow-lg shadow-black/50 transition-all active:scale-95"
                >
                  <Undo2 size={17} />
                  {rejectLabel}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                aria-label="เปิดช่องแชท"
                className="relative flex h-11 flex-1 cursor-pointer items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-medium text-stone-600 shadow-lg shadow-black/50 transition-all active:scale-95"
              >
                <MessageCircle size={18} className="shrink-0 text-stone-400" />
                แชท
                {hasMessages && (
                  <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-semibold text-white">
                    {chat.comments?.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="ตัวเลือกเพิ่มเติม"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-lg shadow-black/50 transition-all active:scale-90"
              >
                <MoreHorizontal size={20} />
              </button>
            </div>
          </div>
        </div>

            {moreSheet}
          </div>,
          document.body
        )}

        {/* ---------- ชีทแชทลอยจากขอบล่าง — กด "แชท" เปิด, พิมพ์แล้วส่งในนี้ ---------- */}
        {chatOpen &&
          createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="แชทงาน"
              className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 animate-fade-in"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setChatOpen(false);
              }}
            >
              <div className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl animate-slide-in-up">
                <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 py-3">
                  <h2 className="text-base font-semibold text-stone-900">
                    พูดคุย
                  </h2>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    aria-label="ปิดช่องแชท"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600 active:scale-90"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <ChatMessages chat={chat} />
                </div>
                <ChatComposer chat={chat} />
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  /* ==========================================================================
     จอใหญ่ (≥lg): วิดีโอ + sidebar ตรวจงานข้างขวา (โครงเดิม)
     ========================================================================== */
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
      <div className="flex min-h-0 flex-col lg:flex-1">
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
          ) : deliverableUrl ? (
            <DriveLinkButton url={deliverableUrl} variant="hero" />
          ) : (
            <p className="text-sm text-white/60">
              งานนี้ไม่มีไฟล์แนบและยังไม่ใส่ลิงก์งาน
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
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-2">
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
              <span className="truncate">เปิดงานใน Drive</span>
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
              {canBypass && (
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
