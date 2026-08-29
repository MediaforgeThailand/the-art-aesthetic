"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Inbox,
  Link2,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  SendHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui";
import {
  BRIEF_CONTENT_TYPES,
  briefContentTypeLabel,
  CONTENT_FORMAT_ORDER,
  CONTENT_FORMATS,
  DEFAULT_REVISION_KIND,
  DEFAULT_TASK_CATEGORY,
  REVISION_KINDS,
  STORAGE_BUCKET_DOCUMENTS,
} from "@/lib/constants";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_UPLOAD_BYTES,
  fileTooLargeMessage,
  tooLargeSummary,
  uploadWithProgress,
} from "@/lib/upload";
import { prepareUploadFile, prepareUploadFiles } from "@/lib/upload-prepare";
import type {
  ContentCategoryRow,
  ContentFormat,
  InfluencerLite,
  NotificationType,
  TaskCommentRow,
  TaskCommentWithAuthor,
  TaskFileRow,
  TaskRow,
  TaskSectionRow,
  TaskSubtaskFileRow,
  TaskSubtaskRow,
  TaskWithAssignee,
} from "@/lib/types";
import { useSignedUrl } from "@/lib/use-signed-url";
import { MediaLightbox } from "./media-lightbox";
import { PersonSelect } from "./person-select";
import {
  AssigneeAvatar,
  CompleteToggle,
  currentReviewerIds,
  isImagePath,
  isVideoPath,
  type ProfileOption,
  profileName,
  reviewWaitStart,
  waitDurationLabel,
} from "./task-card";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** ชื่อที่แสดงของ influencer — คนเดิมเข้ามาหลายรอบมีหลายเคส ต้องบอกรอบกำกับให้เลือกถูกใบ */
function influLabel(i: InfluencerLite): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  const name = i.nickname ? `${full} (${i.nickname})` : full;
  return i.round_no > 1 ? `${name} · รอบ ${i.round_no}` : name;
}

/** patch ที่ส่งกลับ: ส่วนที่เขียนลง DB + ส่วนที่อัปเดตเฉพาะ state ฝั่งจอ (เช่น assignee object) */
export type TaskPatch = {
  db: Partial<TaskRow>;
  local?: Partial<TaskWithAssignee>;
};

/** งานย่อยพร้อมไฟล์แนบ */
type SubtaskWithFiles = TaskSubtaskRow & { files: TaskSubtaskFileRow[] };

/** ข้อความก่อน caret ที่ลงท้ายด้วย "@คำค้น" — ใช้เปิดเมนูแท็กคนในช่องแชท */
const MENTION_TAIL = /(^|\s)@([^\s@]*)$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* สไตล์ field แบบ "ไร้กล่อง" (Asana) — โผล่ขอบเฉพาะตอน hover/focus */
const bareControl =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-stone-800 transition-colors hover:border-stone-200/80 hover:bg-white/70 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100";

/* เวอร์ชันกะทัดรัดสำหรับ "โซนตั้งค่า" (ผู้รับผิดชอบ/ผู้ตรวจ/influ/หมวดหมู่) — ไม่ใช่เนื้อหาหลัก
   จึงย่อให้เล็กลงเพื่อเหลือพื้นที่ให้รายละเอียด/ไฟล์/แชท */
const bareControlSm =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-stone-800 transition-colors hover:border-stone-200/80 hover:bg-white/70 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100";
const bareSelectSm = `${bareControlSm} cursor-pointer appearance-none`;

/* แถว field ในโซนตั้งค่า — label แคบ/เล็ก, กระชับแนวตั้ง */
function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={htmlFor}
        className="w-20 shrink-0 text-xs text-stone-500"
      >
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ============================================================================
   แผงรายละเอียด = bottom sheet ลากได้ บนมือถือ (<lg)
   ----------------------------------------------------------------------------
   ของเดิมเป็น overlay เต็มจอทับบอร์ด — กดการ์ดทีเดียวบอร์ดหายทั้งหน้า ต้องกด
   "กลับ" ทุกครั้งเพื่อดูใบถัดไป. เวอร์ชันนี้เลื่อนขึ้นมาจากขอบล่างแค่ครึ่งจอ
   (ยังเห็นการ์ดที่เลือกอยู่ด้านหลัง) แล้วลากที่จับขึ้นเพื่อขยายเต็มจอ /
   ลากลงเพื่อย่อหรือปิด

   กติกาการทำงาน (อย่าเปลี่ยนเป็น state ที่อ่าน matchMedia):
   - ความสูง/ตำแหน่งคุมด้วย CSS ล้วน — ระดับชีตส่งผ่านตัวแปร `--sheet-y`
     ที่ถูกใช้เฉพาะใน `max-lg:` เท่านั้น จอ ≥lg จึงเป็นแผงข้างขวาเหมือนเดิมเป๊ะ
     (ถ้าย้ายไปใช้ inline transform จะต้องเดา breakpoint ด้วย JS แล้วมีเฟรมแรก
     ที่วาดผิดฝั่งให้เห็นวูบ)
   - ระหว่างลากขยับเฉพาะ transform (ไม่แตะ layout) ส่วนช่องว่างท้ายเนื้อหา
     (`--sheet-pad`) ผูกกับ "ระดับที่ลงล็อกแล้ว" เท่านั้น — ตัวชีตสูงเต็มจอเสมอ
     ถ้าไม่มีช่องว่างนี้ เนื้อหาท่อนท้ายจะจมอยู่ใต้ขอบจอตอนชีตอยู่ระดับครึ่ง
   ========================================================================== */

/** สัดส่วนที่ชีตถูกดันลงตอนอยู่ระดับ "ครึ่งจอ" (ค่าเริ่มต้นตอนกดการ์ด) */
const SHEET_HALF_PCT = 42;
/** ลากลงเลยสัดส่วนนี้ของความสูงชีตแล้วปล่อย = ปิดแผงไปเลย */
const SHEET_DISMISS_RATIO = 0.78;
/** ลากขึ้นจนเหลือน้อยกว่าสัดส่วนนี้แล้วปล่อย = ขยายเต็มจอ */
const SHEET_EXPAND_RATIO = 0.21;

function useBottomSheet(
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>
) {
  const [snap, setSnap] = useState<"half" | "full">("half");
  /** ระยะที่กำลังลากอยู่ (px) — null = ไม่ได้ลาก ใช้ระดับตาม snap */
  const [dragY, setDragY] = useState<number | null>(null);
  /** เฟรมแรกชีตยังอยู่ใต้ขอบจอ แล้วค่อยเลื่อนขึ้น = แอนิเมชันเปิด (ไม่ใช้ keyframe
      เพราะ keyframe จะแย่งคุม transform กับตัวแปร --sheet-y) */
  const [entered, setEntered] = useState(false);
  // เก็บ onClose ไว้ใน ref (อัพเดตใน effect ไม่ใช่ตอน render) — ผู้เรียกส่ง arrow ใหม่ทุก render
  // ผูกเป็น dependency ตรงๆ ไม่ได้ และตัว handler ลากต้องเรียกค่าล่าสุดเสมอ
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const drag = useRef<{
    startY: number;
    base: number;
    height: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    // ปุ่มในหัวชีต (ปิด/ขยาย) ต้องกดได้ตามปกติ — ไม่เริ่มลากจากตรงนั้น
    if (!el || (e.target as HTMLElement).closest("button")) return;
    const height = el.getBoundingClientRect().height;
    const base = snap === "full" ? 0 : (height * SHEET_HALF_PCT) / 100;
    drag.current = { startY: e.clientY, base, height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragY(base);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientY - d.startY;
    if (Math.abs(delta) > 3) d.moved = true;
    setDragY(Math.min(Math.max(d.base + delta, 0), d.height));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const y = Math.min(
      Math.max(d.base + (e.clientY - d.startY), 0),
      d.height
    );
    setDragY(null);
    // แตะเฉยๆ ไม่ได้ลาก = สลับระดับ (ที่จับทำหน้าที่เป็นปุ่มไปในตัว)
    if (!d.moved) {
      setSnap((s) => (s === "full" ? "half" : "full"));
      return;
    }
    if (y > d.height * SHEET_DISMISS_RATIO) {
      closeRef.current();
      return;
    }
    setSnap(y < d.height * SHEET_EXPAND_RATIO ? "full" : "half");
  };

  const style = {
    "--sheet-y": !entered
      ? "100%"
      : dragY !== null
        ? `${dragY}px`
        : snap === "full"
          ? "0%"
          : `${SHEET_HALF_PCT}%`,
    // ผูกกับ snap อย่างเดียว (ไม่ผูก dragY) — ไม่งั้น padding เปลี่ยนทุกเฟรมที่ลาก = reflow รัวๆ
    "--sheet-pad": snap === "full" ? "0px" : `${SHEET_HALF_PCT}dvh`,
  } as React.CSSProperties;

  return {
    snap,
    style,
    /** คลาสของ aside เฉพาะส่วนที่เปลี่ยนตามการลาก */
    motionClass:
      dragY !== null
        ? "max-lg:transition-none"
        : "max-lg:transition-transform max-lg:duration-300 max-lg:ease-out",
    toggle: () => setSnap((s) => (s === "full" ? "half" : "full")),
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}

/**
 * แผงรายละเอียดงานฝั่งขวาแบบ Asana — สูงเต็มจอ, field ไร้กล่อง, งานย่อย + ความคิดเห็น
 * mount ด้วย key={task.id} เพื่อรีเซ็ต draft เมื่อสลับงาน
 * (มือถือ = bottom sheet ลากได้ — ดูหัวข้อด้านบน)
 */
export function TaskPanel({
  task,
  section,
  profiles,
  reviewerProfiles,
  teamReviewer2,
  influencers,
  categories,
  contentCategories,
  briefSource,
  linkedCreatives,
  onNavigateToTask,
  onAddCategory,
  userId,
  suspendEsc = false,
  onPatch,
  onAssign,
  onDelete,
  onClose,
  onSubmitReview,
  onCancelReview,
  onApprove,
  onApproveBypass,
  onReject,
  onReopen,
  onSetReviewer,
  onSetReviewer1b,
  onSetInfluencer,
  onAcceptBrief,
  onSetBriefContentType,
}: {
  task: TaskWithAssignee;
  /** เซคชันของงานนี้ — ใช้รู้ว่าเป็นเซคชัน brief (สั่งงาน) หรือไม่ */
  section: TaskSectionRow | null;
  profiles: ProfileOption[];
  /** roster ผู้ตรวจ — ตัวเลือกในช่อง "ผู้ตรวจงาน" จำกัดเฉพาะรายชื่อนี้ */
  reviewerProfiles: ProfileOption[];
  /** ผู้ตรวจลำดับ 2 ของทีม (ตั้งใน "จัดการผู้ตรวจ") — โชว์ preview ก่อนส่งตรวจ; null = ตรวจชั้นเดียว */
  teamReviewer2: ProfileOption | null;
  influencers: InfluencerLite[];
  /** หมวดหมู่งานที่เลือกได้ (เพิ่มได้) */
  categories: string[];
  /** หมวดเนื้อหาคอนเทนต์ (content_categories) — ช่อง "เนื้อหา" สำหรับ KPI คอนเทนต์ */
  contentCategories: ContentCategoryRow[];
  /** การ์ด brief ต้นทาง (เมื่องานนี้เป็น creative ที่มาจาก brief) — ใช้ทำปุ่มลิงก์ไป brief */
  briefSource: TaskWithAssignee | null;
  /** การ์ด creative ที่ถูกสร้างจาก brief นี้ (เมื่องานนี้เป็นการ์ด brief) — ปุ่มลิงก์ไปงานที่สร้าง */
  linkedCreatives: TaskWithAssignee[];
  /** เปิดแผงของงานที่ลิงก์ + เลื่อนบอร์ดไปที่การ์ดนั้น */
  onNavigateToTask: (taskId: string) => void;
  onAddCategory: (name: string) => void;
  userId: string | null;
  /** true เมื่อมี dialog อื่นเปิดอยู่ — ให้ Esc เป็นของ dialog นั้น */
  suspendEsc?: boolean;
  onPatch: (id: string, patch: TaskPatch) => void;
  /** เปลี่ยนผู้รับผิดชอบ/มอบหมายให้ — ใช้ตัวเดียวกับบอร์ด (แจ้งเตือนคนถูกมอบหมายให้ด้วย) */
  onAssign: (task: TaskWithAssignee, profileId: string | null) => void;
  onDelete: (task: TaskWithAssignee) => void;
  onClose: () => void;
  onSubmitReview: (task: TaskWithAssignee) => void;
  onCancelReview: (task: TaskWithAssignee) => void;
  onApprove: (task: TaskWithAssignee) => void;
  /** อนุมัติจบทันที (bypass) — ข้ามทุกคนที่ยังไม่ได้ตรวจ (ผู้ตรวจร่วม/ลำดับ 2) ให้งานเสร็จเลย (มี confirm) */
  onApproveBypass: (task: TaskWithAssignee) => void;
  /** ผู้ตรวจกด "ตีกลับ" → เปิดกล่องระบุเหตุผล + นับเป็นการแก้ไข 1 ครั้งของผู้รับผิดชอบ */
  onReject: (task: TaskWithAssignee) => void;
  onReopen: (task: TaskWithAssignee) => void;
  onSetReviewer: (task: TaskWithAssignee, profileId: string | null) => void;
  /** เปลี่ยน/เอาออก ผู้ตรวจลำดับ 1 คนที่ 2 (ผู้ตรวจร่วม — ต้องอนุมัติครบทุกคน) */
  onSetReviewer1b: (task: TaskWithAssignee, profileId: string | null) => void;
  onSetInfluencer: (
    task: TaskWithAssignee,
    influencerId: string | null
  ) => void;
  /** เซคชัน brief: ผู้รับกด "รับงาน" → สร้างการ์ด creative */
  onAcceptBrief: (task: TaskWithAssignee) => void;
  /** เซคชัน brief: เลือกชนิดงาน (graphic/video) */
  onSetBriefContentType: (task: TaskWithAssignee, type: string) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const asideRef = useRef<HTMLElement>(null);
  const sheet = useBottomSheet(onClose, asideRef);
  const me = profiles.find((p) => p.id === userId) ?? null;
  // ผู้ตรวจของทอดปัจจุบันที่ "ยังไม่อนุมัติ" — ทอด 1 มีได้ 2 คน (ผู้ตรวจร่วม)
  // ต้องอนุมัติครบทุกคนก่อนงานจึงผ่านทอด 1; ทอด 2 = reviewer2_id
  const stepReviewerIds = currentReviewerIds(task);
  const isReviewer = userId !== null && stepReviewerIds.includes(userId);
  // งานนี้ตรวจเป็นทอด (มีผู้ตรวจลำดับ 2 ติดอยู่กับงาน)
  const hasChain = task.reviewer2_id !== null;
  const reviewStep = task.review_step ?? 1;
  // ทอดแรกยังมีคนอื่นที่ยังไม่อนุมัติอีกไหม (นอกจากฉัน) — ถ้ามี การกดอนุมัติของฉันยังไม่ผ่านทอด 1
  // ไม่นับช่องที่ผู้ตรวจเป็นเจ้าของงานเอง (ผ่านอัตโนมัติ — งานเก่าที่ยังไม่ถูก stamp ก็ไม่ต้องรอ)
  const pendingOthers =
    reviewStep < 2
      ? stepReviewerIds.filter(
          (id) => id !== userId && id !== task.assignee_id
        )
      : [];
  // ชิป "✓ อนุมัติแล้ว" รายช่องของทอดแรก (งาน approved = ผ่านครบทุกคนแล้วเสมอ)
  const primary1Approved =
    task.review_status === "approved" ||
    (task.review_status === "pending" &&
      (reviewStep >= 2 || task.reviewer1_approved_at !== null));
  const co1Approved =
    task.review_status === "approved" ||
    (task.review_status === "pending" &&
      (reviewStep >= 2 || task.reviewer1b_approved_at !== null));
  // ผู้ตรวจที่เป็นเจ้าของงานเอง — ลำดับของเขาผ่านอัตโนมัติตั้งแต่กดส่งตรวจ
  // (ไม่มีใครต้องมากดอนุมัติงานที่ตัวเองทำ — กติกาผู้ใช้ 2026-08-12)
  const selfPrimary =
    task.assignee_id !== null && task.assignee_id === task.reviewer_id;
  const selfCo =
    task.assignee_id !== null && task.assignee_id === task.reviewer1b_id;
  const autoLabel = "✓ ผ่านอัตโนมัติ (งานของตัวเอง)";
  // ทอดแรกอนุมัติไปแล้ว 1 จาก 2 คน — บอกในป้าย "รอตรวจ" ว่าค้างอีกคน
  const partial1 =
    task.review_status === "pending" &&
    reviewStep < 2 &&
    task.reviewer1b_id !== null &&
    (task.reviewer1_approved_at !== null) !==
      (task.reviewer1b_approved_at !== null);
  // โชว์แถว "ผู้ตรวจลำดับ 2" — งานที่ติดทอดแล้ว หรือ preview ก่อนส่งตรวจตามการตั้งค่าทีม
  const chainVisible =
    hasChain ||
    (task.review_status === "none" &&
      teamReviewer2 !== null &&
      teamReviewer2.id !== task.reviewer_id &&
      teamReviewer2.id !== task.reviewer1b_id &&
      // เจ้าของงานเป็นผู้ตรวจลำดับ 2 เอง = ตอนส่งตรวจจะไม่ chain (ลำดับนั้นผ่านอัตโนมัติ)
      teamReviewer2.id !== task.assignee_id);
  // เซคชัน brief (สั่งงาน): การ์ดมีปุ่มรับงาน + ช่อง "ส่งมอบให้" + เลือกชนิดงาน
  const isBrief = section?.type === "brief";
  const isAccepted = task.brief_accepted_at !== null;
  // การ์ด creative ที่ถูกสร้างจาก brief — โชว์ข้อมูล brief ในแผง
  const isFromBrief = task.brief_source_id !== null;
  // ชื่อผู้สร้าง brief = ผู้สร้างการ์ด brief ต้นทาง (ตกไปที่ผู้สร้างงานนี้ถ้าหาการ์ด brief ไม่เจอ
  // — การ์ด creative สืบ created_by มาจากผู้สั่ง brief อยู่แล้ว)
  const briefCreator = briefSource
    ? (profiles.find((p) => p.id === briefSource.created_by) ?? null)
    : (task.creator ?? null);
  // งานจาก brief: ผู้สั่ง brief ตรวจทาน/คุยในแชทก่อน แล้วเป็นคนกด "ส่งตรวจ" เอง
  // (งานเก่าที่ไม่รู้ผู้สั่ง (created_by ว่าง) ไม่ล็อก — ให้ส่งได้ตามปกติ)
  const canSubmitReview =
    !isFromBrief || task.created_by === null || task.created_by === userId;

  // ตัวเลือกผู้ตรวจ = roster + ผู้ตรวจปัจจุบันของงาน (ถ้าถูกเอาออกจาก roster ไปแล้ว ให้ยังแสดงค่าเดิมได้)
  const reviewerOptionsBase =
    task.reviewer && !reviewerProfiles.some((p) => p.id === task.reviewer!.id)
      ? [...reviewerProfiles, task.reviewer]
      : reviewerProfiles;
  // สองช่องห้ามชื่อซ้ำกัน — ช่องหลักตัดคนที่เป็นผู้ตรวจร่วมออก และกลับกัน
  const reviewerOptions = reviewerOptionsBase.filter(
    (p) => p.id !== task.reviewer1b_id
  );
  const reviewer1bOptionsBase =
    task.reviewer1b &&
    !reviewerProfiles.some((p) => p.id === task.reviewer1b!.id)
      ? [...reviewerProfiles, task.reviewer1b]
      : reviewerProfiles;
  const reviewer1bOptions = reviewer1bOptionsBase.filter(
    (p) => p.id !== task.reviewer_id
  );

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  /** โชว์ช่องเลือก "ผู้ตรวจคนที่ 2" ทั้งที่งานยังไม่มี — หลังกดปุ่ม "+ เพิ่มผู้ตรวจอีกคน"
      (แผง mount ด้วย key={task.id} จึงรีเซ็ตเองเมื่อสลับงาน) */
  const [show1bPicker, setShow1bPicker] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const showError = useCallback((msg: string) => {
    setPanelError(msg);
    window.setTimeout(() => setPanelError(null), 5000);
  }, []);

  // ไฟล์ที่กำลังเปิดดูใน lightbox (index ใน task.files) — null = ปิด
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // lightbox แยกของ "ไฟล์จาก Brief" (การ์ด creative ดูไฟล์ source ของ brief ได้อย่างเดียว)
  const [briefLightboxIndex, setBriefLightboxIndex] = useState<number | null>(
    null
  );
  const briefFiles = briefSource?.files ?? [];

  /* ---------- งานย่อย + ความคิดเห็น (โหลดเมื่อเปิดงาน) ---------- */

  const [subtasks, setSubtasks] = useState<SubtaskWithFiles[] | null>(null);
  const [comments, setComments] = useState<TaskCommentWithAuthor[] | null>(
    null
  );
  /** คอมเมนต์ที่มาทาง realtime ก่อน fetch รอบแรกจะเสร็จ — รวมเข้าลิสต์ตอน fetch จบ */
  const pendingCommentsRef = useRef<TaskCommentWithAuthor[]>([]);
  /** ไฟล์ที่กำลังจะลบ (รอยืนยัน) — null = ไม่มีกล่องยืนยันเปิดอยู่
      ต้องประกาศก่อน effect ของ Esc ที่อ่านค่านี้ (ห้ามให้ Esc ปิดแผงทั้งอันขณะกล่องเปิด) */
  const [confirmRemoveFile, setConfirmRemoveFile] = useState<TaskFileRow | null>(
    null
  );

  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase
        .from("task_subtasks")
        .select(
          "*, files:task_subtask_files(id, subtask_id, file_path, file_name, created_at)"
        )
        .eq("task_id", task.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("task_comments")
        .select("*, author:profiles!task_comments_author_id_fkey(full_name, email, avatar_path)")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true }),
    ]).then(([s, c]) => {
      if (!alive) return;
      // โหลดพลาดฝั่งไหน คง state ฝั่งนั้นเป็น null (กำลังโหลด) — ไม่ให้โชว์ "ยังไม่มี" ผิดๆ
      if (s.error || c.error) {
        showError(
          `โหลดข้อมูลงานไม่สำเร็จ: ${(s.error ?? c.error)?.message ?? "ไม่ทราบสาเหตุ"}`
        );
      }
      // merge กับของที่ผู้ใช้เพิ่งเพิ่มระหว่างรอโหลด — ไม่ทับทิ้ง
      if (!s.error) {
        const fetchedSubs = (s.data ?? []) as unknown as SubtaskWithFiles[];
        setSubtasks((cur) => {
          if (cur === null) return fetchedSubs;
          const ids = new Set(fetchedSubs.map((x) => x.id));
          return [...fetchedSubs, ...cur.filter((x) => !ids.has(x.id))];
        });
      }
      if (!c.error) {
        const fetchedComments = (c.data ?? []) as unknown as TaskCommentWithAuthor[];
        // คอมเมนต์ที่มาทาง realtime ระหว่างรอ fetch รอบแรกถูกพักไว้ใน ref — เอามารวมด้วย
        // ไม่งั้นข้อความที่ส่งมาช่วงนั้นหายจนกว่าจะปิด-เปิดแผงใหม่
        const buffered = pendingCommentsRef.current;
        pendingCommentsRef.current = [];
        setComments((cur) => {
          const base = cur === null ? fetchedComments : (() => {
            const ids = new Set(fetchedComments.map((x) => x.id));
            return [...fetchedComments, ...cur.filter((x) => !ids.has(x.id))];
          })();
          if (buffered.length === 0) return base;
          const have = new Set(base.map((x) => x.id));
          return [...base, ...buffered.filter((x) => !have.has(x.id))];
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [supabase, task.id, showError]);

  /* ---------- realtime: คอมเมนต์ใหม่ของงานนี้เด้งสด (จากคนอื่น/แท็บอื่น) ---------- */

  useEffect(() => {
    const channel = supabase
      .channel(`task-comments-${task.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${task.id}`,
        },
        (payload) => {
          const row = payload.new as TaskCommentRow;
          // แถวจาก realtime ไม่มี join — เติม author จากรายชื่อ profiles ที่มีอยู่แล้ว
          const author = row.author_id
            ? (profiles.find((p) => p.id === row.author_id) ?? null)
            : null;
          setComments((cur) => {
            // ยังโหลดรอบแรกไม่เสร็จ — พักไว้ก่อน แล้วให้ fetch หลักรวมให้ตอนจบ
            // (แถวที่ insert หลัง query ยิงไปแล้วจะไม่อยู่ในผล fetch จึงต้องเก็บเอง)
            if (cur === null) {
              if (!pendingCommentsRef.current.some((c) => c.id === row.id)) {
                pendingCommentsRef.current.push({ ...row, author });
              }
              return cur;
            }
            if (cur.some((c) => c.id === row.id)) return cur;
            return [...cur, { ...row, author }];
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, task.id, profiles]);

  /* ---------- Esc: blur ช่องที่พิมพ์อยู่ก่อน (บันทึก) — กดซ้ำจึงปิดแผง ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // lightbox / กล่องยืนยันลบไฟล์ เปิดอยู่ → ปล่อยให้ตัวนั้นจัดการ Esc เอง ไม่ปิดแผง
      if (
        e.key !== "Escape" ||
        suspendEsc ||
        lightboxIndex !== null ||
        briefLightboxIndex !== null ||
        confirmRemoveFile !== null
      )
        return;
      const el = document.activeElement as HTMLElement | null;
      // กำลังพิมพ์อยู่ที่ไหนก็ตาม (รวมช่องค้นหานอกแผง) — Esc แค่ blur ไม่ปิดแผง
      if (el && ["TEXTAREA", "INPUT", "SELECT"].includes(el.tagName)) {
        el.blur();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, suspendEsc, lightboxIndex, briefLightboxIndex, confirmRemoveFile]);

  useEffect(() => {
    asideRef.current?.focus({ preventScroll: true });
  }, []);

  /* ---------- autosave หลัก ---------- */

  const saveTitle = () => {
    const trimmed = title.trim();
    if (trimmed === "" || trimmed === task.title) {
      setTitle(task.title);
      return;
    }
    onPatch(task.id, { db: { title: trimmed } });
  };

  const saveDescription = () => {
    const value = description.trim() === "" ? null : description.trim();
    if (value === task.description) return;
    onPatch(task.id, { db: { description: value } });
  };

  /* ---------- influencer ที่ผูกกับงาน (เลือกได้ ค้นหาได้ ไม่บังคับ) ---------- */

  const [influOpen, setInfluOpen] = useState(false);
  const [influQuery, setInfluQuery] = useState("");
  const influRef = useRef<HTMLDivElement>(null);
  const influMatches = useMemo(() => {
    const q = influQuery.trim().toLowerCase();
    const list = q === "" ? influencers : influencers.filter((i) =>
      influLabel(i).toLowerCase().includes(q)
    );
    return list.slice(0, 30);
  }, [influencers, influQuery]);

  useEffect(() => {
    if (!influOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!influRef.current?.contains(e.target as Node)) setInfluOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [influOpen]);

  /* ---------- ลิงก์งาน (Google Drive) + ไฟล์งานหลายไฟล์ (รูป/วิดีโอ) ---------- */

  const [deliverableDraft, setDeliverableDraft] = useState(
    task.deliverable_url ?? ""
  );
  const [uploadingFiles, setUploadingFiles] = useState(false);
  /** ความคืบหน้าตอนอัพ: ไฟล์ที่เท่าไรจากทั้งหมด + % ของไฟล์ปัจจุบัน
   *  `phase` แยกขั้น "บีบวิดีโอ" ออกจาก "อัพโหลด" — การบีบกินเวลาเป็นนาที
   *  ถ้าเขียนว่ากำลังอัพโหลดค้างอยู่ ทีมจะคิดว่าเน็ตพังแล้วปิดแท็บทิ้ง */
  const [uploadProgress, setUploadProgress] = useState<{
    index: number;
    total: number;
    pct: number;
    phase: "compress" | "upload";
  } | null>(null);
  const deliverableInputRef = useRef<HTMLInputElement>(null);
  const files = task.files ?? [];

  const saveDeliverableUrl = () => {
    const value =
      deliverableDraft.trim() === "" ? null : deliverableDraft.trim();
    if (value === task.deliverable_url) return;
    if (value !== null && !/^https?:\/\//i.test(value)) {
      showError("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
      return;
    }
    onPatch(task.id, { db: { deliverable_url: value } });
  };

  const uploadFiles = async (fileList: FileList) => {
    const chosen = Array.from(fileList);
    // ย่อรูป/บีบวิดีโอในเบราว์เซอร์ก่อน แล้วค่อยเช็คเพดาน — ไฟล์ที่เกินเพดานมักผ่านได้หลังย่อ
    setUploadingFiles(true);
    setUploadProgress({
      index: 0,
      total: chosen.length,
      pct: 0,
      phase: "compress",
    });
    let picked: File[];
    try {
      picked = await prepareUploadFiles(chosen, (p) =>
        setUploadProgress({ ...p, phase: "compress" })
      );
    } finally {
      setUploadingFiles(false);
      setUploadProgress(null);
    }
    // กันไฟล์ใหญ่เกินเพดานตั้งแต่ก่อนเริ่ม — ไม่ต้องรออัพวิดีโอเป็นนาทีแล้วค่อยเจอ error
    const tooLarge = tooLargeSummary(picked);
    if (tooLarge) {
      showError(tooLarge);
      return;
    }
    setUploadingFiles(true);
    setUploadProgress({
      index: 0,
      total: picked.length,
      pct: 0,
      phase: "upload",
    });
    const rows: { task_id: string; file_path: string; file_name: string }[] =
      [];
    // try/finally: ปุ่มต้องกลับมากดได้เสมอแม้ระหว่างทางมี exception
    // (ไม่งั้นปุ่มค้างที่ "กำลังอัพโหลด..." จนกว่าจะปิด-เปิดแผงงานใหม่)
    try {
      for (const [i, file] of picked.entries()) {
        const path = `tasks/${task.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${sanitizeFileName(file.name)}`;
        setUploadProgress({
          index: i,
          total: picked.length,
          pct: 0,
          phase: "upload",
        });
        const { error } = await uploadWithProgress(
          STORAGE_BUCKET_DOCUMENTS,
          path,
          file,
          (ratio) =>
            setUploadProgress({
              index: i,
              total: picked.length,
              pct: ratio,
              phase: "upload",
            })
        );
        if (error) {
          // เก็บกวาดไฟล์ที่อัพไปแล้วในชุดนี้ (best effort) — ยังไม่มีแถว task_files อ้างถึง
          if (rows.length > 0) {
            try {
              await supabase.storage
                .from(STORAGE_BUCKET_DOCUMENTS)
                .remove(rows.map((r) => r.file_path));
            } catch {
              // เพิกเฉย
            }
          }
          showError(`อัพโหลดไฟล์ไม่สำเร็จ: ${error.message}`);
          return;
        }
        rows.push({ task_id: task.id, file_path: path, file_name: file.name });
      }
      const { error: insErr } = await supabase.from("task_files").insert(rows);
      if (insErr) {
        // เก็บกวาดไฟล์ที่เพิ่งอัพ (best effort)
        try {
          await supabase.storage
            .from(STORAGE_BUCKET_DOCUMENTS)
            .remove(rows.map((r) => r.file_path));
        } catch {
          // เพิกเฉย
        }
        showError(`บันทึกไฟล์ไม่สำเร็จ: ${insErr.message}`);
        return;
      }
      router.refresh();
    } finally {
      setUploadingFiles(false);
      setUploadProgress(null);
    }
  };

  const removeFile = async (f: TaskFileRow) => {
    const { error } = await supabase.from("task_files").delete().eq("id", f.id);
    if (error) {
      showError(`ลบไฟล์ไม่สำเร็จ: ${error.message}`);
      return;
    }
    try {
      await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .remove([f.file_path]);
    } catch {
      // เพิกเฉย
    }
    router.refresh();
  };

  /* ---------- งานย่อย ---------- */

  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState("");

  const addSubtask = async (title: string) => {
    const position =
      subtasks && subtasks.length > 0
        ? Math.max(...subtasks.map((s) => s.position)) + 1
        : 1;
    const tempId = `temp-${Date.now()}`;
    const optimistic: SubtaskWithFiles = {
      id: tempId,
      task_id: task.id,
      title,
      completed: false,
      position,
      created_at: new Date().toISOString(),
      files: [],
    };
    setSubtasks((cur) => [...(cur ?? []), optimistic]);
    const { data, error } = await supabase
      .from("task_subtasks")
      .insert({ task_id: task.id, title, position })
      .select()
      .single();
    if (error || !data) {
      setSubtasks((cur) => (cur ?? []).filter((s) => s.id !== tempId));
      showError(`เพิ่มงานย่อยไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setSubtasks((cur) =>
      (cur ?? []).map((s) =>
        s.id === tempId ? { ...(data as TaskSubtaskRow), files: [] } : s
      )
    );
  };

  /** แนบไฟล์ (หลายไฟล์) เข้างานย่อย */
  const uploadSubtaskFiles = async (sub: TaskSubtaskRow, fileList: FileList) => {
    if (sub.id.startsWith("temp-")) return;
    // ย่อรูป/บีบวิดีโอก่อนเช็คเพดาน เหมือนไฟล์งานบนการ์ด
    const picked = await prepareUploadFiles(Array.from(fileList));
    const tooLarge = tooLargeSummary(picked);
    if (tooLarge) {
      showError(tooLarge);
      return;
    }
    const added: TaskSubtaskFileRow[] = [];
    for (const file of picked) {
      const path = `tasks/${task.id}/subtasks/${sub.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: upErr } = await uploadWithProgress(
        STORAGE_BUCKET_DOCUMENTS,
        path,
        file
      );
      if (upErr) {
        showError(`อัพโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`);
        break;
      }
      const { data, error: insErr } = await supabase
        .from("task_subtask_files")
        .insert({ subtask_id: sub.id, file_path: path, file_name: file.name })
        .select()
        .single();
      if (insErr || !data) {
        try {
          await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([path]);
        } catch {
          // เพิกเฉย
        }
        showError(`บันทึกไฟล์ไม่สำเร็จ: ${insErr?.message ?? "ไม่ทราบสาเหตุ"}`);
        break;
      }
      added.push(data as TaskSubtaskFileRow);
    }
    if (added.length > 0) {
      setSubtasks((cur) =>
        (cur ?? []).map((s) =>
          s.id === sub.id ? { ...s, files: [...s.files, ...added] } : s
        )
      );
    }
  };

  const removeSubtaskFile = (sub: TaskSubtaskRow, file: TaskSubtaskFileRow) => {
    setSubtasks((cur) =>
      (cur ?? []).map((s) =>
        s.id === sub.id
          ? { ...s, files: s.files.filter((f) => f.id !== file.id) }
          : s
      )
    );
    // (ต้องมี .then เสมอ: builder ของ supabase-js เป็น lazy thenable — ไม่ then = ไม่ยิง request)
    void supabase
      .from("task_subtask_files")
      .delete()
      .eq("id", file.id)
      .then(({ error }) => {
        if (error) showError(`ลบไฟล์ไม่สำเร็จ: ${error.message}`);
      });
    void supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .remove([file.file_path]);
  };

  const toggleSubtask = (sub: SubtaskWithFiles) => {
    if (sub.id.startsWith("temp-")) return;
    const next = !sub.completed;
    setSubtasks((cur) =>
      (cur ?? []).map((s) => (s.id === sub.id ? { ...s, completed: next } : s))
    );
    void supabase
      .from("task_subtasks")
      .update({ completed: next })
      .eq("id", sub.id)
      .then(({ error }) => {
        if (error) {
          setSubtasks((cur) =>
            (cur ?? []).map((s) =>
              s.id === sub.id ? { ...s, completed: !next } : s
            )
          );
          showError(`บันทึกไม่สำเร็จ: ${error.message}`);
        }
      });
  };

  const renameSubtask = (sub: SubtaskWithFiles, name: string) => {
    const trimmed = name.trim();
    if (sub.id.startsWith("temp-") || trimmed === "" || trimmed === sub.title) {
      return;
    }
    const prev = sub.title;
    setSubtasks((cur) =>
      (cur ?? []).map((s) => (s.id === sub.id ? { ...s, title: trimmed } : s))
    );
    void supabase
      .from("task_subtasks")
      .update({ title: trimmed })
      .eq("id", sub.id)
      .then(({ error }) => {
        if (error) {
          setSubtasks((cur) =>
            (cur ?? []).map((s) =>
              s.id === sub.id ? { ...s, title: prev } : s
            )
          );
          showError(`บันทึกไม่สำเร็จ: ${error.message}`);
        }
      });
  };

  const deleteSubtask = (sub: SubtaskWithFiles) => {
    if (sub.id.startsWith("temp-")) return;
    setSubtasks((cur) => (cur ?? []).filter((s) => s.id !== sub.id));
    void supabase
      .from("task_subtasks")
      .delete()
      .eq("id", sub.id)
      .then(({ error }) => {
        if (error) {
          setSubtasks((cur) =>
            (cur ?? []).some((s) => s.id === sub.id) ? cur : [...(cur ?? []), sub]
          );
          showError(`ลบงานย่อยไม่สำเร็จ: ${error.message}`);
        }
      });
  };

  /* ---------- ความคิดเห็น ---------- */

  const [commentDraft, setCommentDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  /* ---------- @mention — พิมพ์ @ ในช่องแชทเพื่อแท็กคน (แจ้งเตือนคนนั้น) ---------- */

  /** คำค้นหลัง @ ที่ caret — null = เมนูปิด */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const updateMentionQuery = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = MENTION_TAIL.exec(before);
    setMentionQuery(m ? m[2] : null);
    setMentionIndex(0);
  };

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return profiles
      .filter((p) => p.id !== userId)
      .filter((p) => profileName(p).toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, profiles, userId]);

  /** แทน "@คำค้น" หน้า caret ด้วย "@ชื่อเต็ม " แล้วคืน focus ให้ช่องพิมพ์ */
  const insertMention = (p: ProfileOption) => {
    const el = commentInputRef.current;
    const name = profileName(p);
    setCommentDraft((cur) => {
      const caret = el?.selectionStart ?? cur.length;
      const before = cur.slice(0, caret);
      const after = cur.slice(caret);
      if (!MENTION_TAIL.test(before)) return cur;
      const replaced = before.replace(MENTION_TAIL, `$1@${name} `);
      const newCaret = replaced.length;
      window.setTimeout(() => {
        el?.focus();
        el?.setSelectionRange(newCaret, newCaret);
      }, 0);
      return replaced + after;
    });
    setMentionQuery(null);
  };

  /** ชื่อสมาชิกทุกคน (ยาวก่อน — กันชื่อที่เป็น prefix ของกันและกัน) ใช้เน้น @ชื่อ ในฟองแชท */
  const mentionNames = useMemo(
    () =>
      profiles
        .map((p) => profileName(p))
        .filter((n) => n !== "-")
        .sort((a, b) => b.length - a.length),
    [profiles]
  );

  const sendComment = async () => {
    const body = commentDraft.trim();
    const link = linkDraft.trim();
    const file = attachFile;
    if ((body === "" && !file && link === "") || sending) return;
    if (link !== "" && !/^https?:\/\//i.test(link)) {
      showError("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
      return;
    }
    setSending(true);

    // อัพไฟล์แนบก่อน (ถ้ามี) — ล้มเหลวก็ยังไม่แตะรายการคอมเมนต์
    let filePath: string | null = null;
    if (file) {
      // ย่อรูป/บีบวิดีโอก่อน (ไฟล์อื่นส่งต่อตามเดิม) แล้วค่อยเช็คเพดาน
      const ready = await prepareUploadFile(file);
      const tooLarge = fileTooLargeMessage(ready);
      if (tooLarge) {
        setSending(false);
        showError(tooLarge);
        return;
      }
      const p = `tasks/${task.id}/comments/${Date.now()}_${sanitizeFileName(ready.name)}`;
      const { error: upErr } = await uploadWithProgress(
        STORAGE_BUCKET_DOCUMENTS,
        p,
        ready
      );
      if (upErr) {
        setSending(false);
        showError(`อัพโหลดไฟล์แนบไม่สำเร็จ: ${upErr.message}`);
        return;
      }
      filePath = p;
    }

    const tempId = `temp-${Date.now()}`;
    const optimistic: TaskCommentWithAuthor = {
      id: tempId,
      task_id: task.id,
      author_id: userId,
      body,
      // การแก้ไขนับจาก "การตีกลับ" ของผู้ตรวจเท่านั้น — คอมเมนต์ทั่วไปไม่ใช่ revision
      is_revision: false,
      revision_number: null,
      revision_kind: null,
      file_path: filePath,
      link_url: link === "" ? null : link,
      created_at: new Date().toISOString(),
      author: me,
    };
    setComments((cur) => [...(cur ?? []), optimistic]);
    setCommentDraft("");
    setMentionQuery(null);
    setLinkDraft("");
    setShowLinkInput(false);
    setAttachFile(null);
    window.setTimeout(
      () => commentsEndRef.current?.scrollIntoView({ block: "nearest" }),
      50
    );

    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: task.id,
        author_id: userId,
        body,
        file_path: filePath,
        link_url: link === "" ? null : link,
      })
      .select("*, author:profiles!task_comments_author_id_fkey(full_name, email, avatar_path)")
      .single();
    setSending(false);
    if (error || !data) {
      setComments((cur) => (cur ?? []).filter((c) => c.id !== tempId));
      setCommentDraft(body);
      setLinkDraft(link);
      setAttachFile(file); // คืนไฟล์แนบให้กดส่งใหม่ได้
      // เก็บกวาดไฟล์ที่เพิ่งอัพ (best effort) — คอมเมนต์ไม่ถูกบันทึกจึงไม่มีแถวอ้างถึง
      if (filePath) {
        try {
          await supabase.storage
            .from(STORAGE_BUCKET_DOCUMENTS)
            .remove([filePath]);
        } catch {
          // เพิกเฉย
        }
      }
      showError(`ส่งความคิดเห็นไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    const saved = data as unknown as TaskCommentWithAuthor;
    setComments((cur) =>
      // realtime อาจเพิ่มแถวจริงมาก่อนคำตอบ insert ถึง — ตัด temp ทิ้งแทนการแทนที่ (กันข้อความซ้ำ)
      (cur ?? []).some((c) => c.id === saved.id)
        ? (cur ?? []).filter((c) => c.id !== tempId)
        : (cur ?? []).map((c) => (c.id === tempId ? saved : c))
    );

    // แจ้งเตือน (กระดิ่ง): คนถูก @แท็ก + ผู้เกี่ยวข้องของงาน (ผู้รับผิดชอบ/ผู้สร้าง/ผู้ตรวจ)
    // — fire-and-forget: คอมเมนต์บันทึกแล้ว แจ้งเตือนพลาดไม่ต้องเด้ง error
    // จับ @ชื่อ ด้วย regex ชื่อยาวก่อน (กติกาเดียวกับ highlight) — includes เฉยๆ จะจับผิดคน
    // เมื่อชื่อหนึ่งเป็น prefix ของอีกชื่อ (เช่น "กาย" กับ "กายกร")
    const mentionedNames =
      mentionNames.length === 0
        ? new Set<string>()
        : new Set(
            [
              ...body.matchAll(
                new RegExp(
                  `@(?:${mentionNames.map(escapeRegExp).join("|")})`,
                  "g"
                )
              ),
            ].map((m) => m[0].slice(1))
          );
    const mentioned = profiles.filter(
      (p) => p.id !== userId && mentionedNames.has(profileName(p))
    );
    const preview =
      body !== "" ? body.slice(0, 140) : file ? `📎 ${file.name}` : link;
    const seen = new Set<string>();
    const notiRows: {
      recipient_id: string;
      actor_id: string | null;
      task_id: string;
      type: NotificationType;
      preview: string;
    }[] = [];
    for (const p of mentioned) {
      seen.add(p.id);
      notiRows.push({
        recipient_id: p.id,
        actor_id: userId,
        task_id: task.id,
        type: "mention",
        preview,
      });
    }
    // ผู้ตรวจลำดับ 2 ต้องอยู่ในรายชื่อด้วย — ตอนงานอยู่ทอด 2 เขาคือคนที่งานค้างอยู่จริง
    for (const rid of [
      task.assignee_id,
      task.created_by,
      task.reviewer_id,
      task.reviewer2_id,
    ]) {
      if (!rid || rid === userId || seen.has(rid)) continue;
      seen.add(rid);
      notiRows.push({
        recipient_id: rid,
        actor_id: userId,
        task_id: task.id,
        type: "comment",
        preview,
      });
    }
    if (notiRows.length > 0) {
      // (ต้องมี .then เสมอ: builder ของ supabase-js เป็น lazy thenable — ไม่ then = ไม่ยิง request)
      void supabase
        .from("notifications")
        .insert(notiRows)
        .then(({ error: e }) => {
          if (e) console.warn("ส่งแจ้งเตือนไม่สำเร็จ:", e.message);
        });
    }
  };

  const subDone = (subtasks ?? []).filter((s) => s.completed).length;

  /** ตัวเลือกผู้รับผิดชอบ/มอบหมายให้ (dropdown พร้อมรูปโปรไฟล์) — ใช้ทั้งงานปกติและแถว "มอบหมายให้" ของ brief */
  const assigneeSelect = (
    <PersonSelect
      id="task-assignee"
      size="sm"
      ariaLabel="เลือกผู้รับผิดชอบ"
      value={task.assignee_id ?? ""}
      onChange={(v) => onAssign(task, v === "" ? null : v)}
      options={[
        { value: "", label: "ไม่ระบุ", profile: null },
        ...profiles.map((p) => ({ value: p.id, profile: p })),
      ]}
    />
  );

  /* ---------- render ---------- */

  return (
    <>
      {/* ฉากหลังของชีต (มือถือ) — ยังเห็นบอร์ดจางๆ ด้านหลัง แตะเพื่อปิด
          z-50 เท่ากับตัวชีตแต่มาก่อนใน DOM จึงอยู่ใต้ชีตเสมอ และคลุมแถบเมนูล่าง (z-40) */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-50 bg-brand-900/25 animate-fade-in lg:hidden"
      />
      <aside
        ref={asideRef}
        tabIndex={-1}
        aria-label="รายละเอียดงาน"
        style={sheet.style}
        // มือถือ: bottom sheet ลากได้ (ระดับคุมด้วย --sheet-y) / จอใหญ่ (≥lg): แผงข้างขวาแบบเดิม
        // มือถือใช้พื้นทึบ (ไม่ใช่ /95 + blur) — ชีตวางทับบอร์ดที่มีรูปเต็มการ์ด
        // พื้นโปร่ง 5% ทำให้เห็นเงาการ์ดหลังตัวหนังสือ อ่านยากและดูสกปรก
        className={`fixed inset-x-0 bottom-0 z-50 flex h-[calc(100dvh-env(safe-area-inset-top,0px))] w-full flex-col overflow-hidden rounded-t-2xl border-t border-white/70 bg-white pb-safe shadow-2xl outline-none max-lg:translate-y-[var(--sheet-y)] lg:static lg:z-auto lg:h-full lg:w-[26rem] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:border-white/60 lg:bg-white/80 lg:pb-0 lg:shadow-xl lg:backdrop-blur-2xl lg:animate-slide-in-right ${sheet.motionClass}`}
      >
        {/* มือถือ: ที่จับชีต — ลากขึ้น = เต็มจอ, ลากลง = ย่อ/ปิด, แตะเฉยๆ = สลับระดับ
            touch-none จำเป็น ไม่งั้นเบราว์เซอร์แย่งลากไปเลื่อนหน้าแทน */}
        <div
          {...sheet.handleProps}
          className="shrink-0 touch-none select-none border-b border-stone-200/60 bg-white/70 px-2 pt-safe lg:hidden"
        >
          <div className="flex items-center justify-center py-2">
            <span className="h-1.5 w-10 rounded-full bg-stone-300" />
          </div>
          <div className="flex items-center gap-1 pb-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดรายละเอียดงาน กลับไปที่บอร์ด"
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 transition-colors active:bg-brand-50"
            >
              <ArrowLeft size={20} />
              กลับ
            </button>
            <button
              type="button"
              onClick={sheet.toggle}
              aria-label={
                sheet.snap === "full" ? "ย่อแผงลงครึ่งจอ" : "ขยายแผงเต็มจอ"
              }
              className="ml-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors active:bg-stone-100"
            >
              {sheet.snap === "full" ? (
                <ChevronDown size={20} />
              ) : (
                <ChevronUp size={20} />
              )}
            </button>
          </div>
        </div>

      {/* header — เซคชัน brief: ปุ่ม "รับงาน" / งานปกติ: ส่งตรวจ → รอตรวจ → อนุมัติ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200/60 px-4 py-3">
        {isBrief ? (
          isAccepted ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white">
              <CheckCircle2 size={15} />
              รับแล้ว
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onAcceptBrief(task)}
              disabled={!task.assignee_id}
              title={
                task.assignee_id
                  ? undefined
                  : "เลือกผู้รับงาน (ส่งมอบให้) ก่อนจึงจะรับงานได้"
              }
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-3 py-1.5 text-sm font-medium text-cream shadow-sm transition-all duration-200 hover:from-brand-600 hover:to-brand-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300 disabled:shadow-none"
            >
              <Inbox size={15} />
              รับงาน
            </button>
          )
        ) : task.review_status === "approved" ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white">
            <CheckCircle2 size={15} />
            เสร็จสิ้นสมบูรณ์
          </span>
        ) : task.review_status === "pending" ? (
          isReviewer ? (
            <>
              <button
                type="button"
                onClick={() => onApprove(task)}
                title={
                  pendingOthers.length > 0
                    ? "ทอดแรกต้องอนุมัติครบทุกคน — อนุมัติแล้วงานจะรอผู้ตรวจร่วมอีกคนอนุมัติก่อนไปต่อ"
                    : hasChain && reviewStep < 2
                      ? `อนุมัติแล้วงานจะถูกส่งต่อให้ผู้ตรวจลำดับ 2 (${
                          task.reviewer2 ? profileName(task.reviewer2) : "-"
                        }) ตรวจขั้นสุดท้าย`
                      : undefined
                }
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:bg-emerald-600 active:scale-[0.97]"
              >
                <CheckCircle2 size={15} />
                {pendingOthers.length > 0
                  ? "อนุมัติ (รอผู้ตรวจร่วมอีกคน)"
                  : hasChain
                    ? reviewStep < 2
                      ? "อนุมัติ (ลำดับ 1 — ส่งต่อลำดับ 2)"
                      : "อนุมัติ (ลำดับ 2 — ขั้นสุดท้าย)"
                    : "อนุมัติ"}
              </button>
              {/* bypass — ทอดแรกที่ยังมีคนอื่นต้องตรวจต่อ (ผู้ตรวจร่วมยังไม่อนุมัติ และ/หรือ มีลำดับ 2):
                  ปิดงานเลย ข้ามทุกคนที่ยังไม่ได้ตรวจ */}
              {reviewStep < 2 && (hasChain || pendingOthers.length > 0) && (
                <button
                  type="button"
                  onClick={() => onApproveBypass(task)}
                  title="อนุมัติจบทันทีโดยไม่ต้องรอคนที่ยังไม่ได้ตรวจ (มีกล่องยืนยันก่อน)"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-sm font-medium text-emerald-600 transition-all duration-200 hover:bg-emerald-50 active:scale-[0.97]"
                >
                  <CheckCheck size={15} />
                  อนุมัติจบทันที
                </button>
              )}
              <button
                type="button"
                onClick={() => onReject(task)}
                title="ตีกลับให้ผู้รับผิดชอบแก้ไข (นับเป็นการแก้ไข 1 ครั้ง)"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 transition-all duration-200 hover:bg-rose-50 active:scale-[0.97]"
              >
                <Undo2 size={15} />
                ตีกลับให้แก้ไข
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
              <Clock3 size={15} />
              {hasChain ? `รอตรวจ · ผู้ตรวจลำดับ ${reviewStep}/2` : "รอตรวจ"}
              {partial1 && (
                <span className="text-xs font-normal opacity-75">
                  · ลำดับ 1 อนุมัติแล้ว 1/2 คน
                </span>
              )}
              {waitDurationLabel(reviewWaitStart(task)) && (
                <span className="text-xs font-normal opacity-75">
                  · {waitDurationLabel(reviewWaitStart(task))}
                </span>
              )}
            </span>
          )
        ) : (
          // งานปกติต้องส่งตรวจก่อนเท่านั้น (ไม่มีทางลัด "เสร็จแล้ว")
          // งานจาก brief: เฉพาะผู้สั่ง brief กดส่งตรวจได้ (ตรวจทานกับทีมในแชทให้จบก่อน)
          <button
            type="button"
            onClick={() => onSubmitReview(task)}
            disabled={!task.reviewer_id || !canSubmitReview}
            title={
              !canSubmitReview
                ? `ผู้สั่ง brief (${briefCreator ? profileName(briefCreator) : "-"}) เป็นคนกดส่งตรวจ — คุยตรวจทานงานกันในแชทด้านล่างก่อน`
                : task.reviewer_id
                  ? undefined
                  : "เลือกผู้ตรวจงานก่อนจึงจะส่งตรวจได้"
            }
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-3 py-1.5 text-sm font-medium text-cream shadow-sm transition-all duration-200 hover:from-brand-600 hover:to-brand-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300 disabled:shadow-none"
          >
            <SendHorizontal size={15} />
            {canSubmitReview ? "ส่งตรวจงาน" : "รอผู้สั่ง brief ส่งตรวจ"}
          </button>
        )}

        {/* ยกเลิกส่งตรวจ (ผู้ส่ง) / เปิดงานใหม่ (หลังอนุมัติ) */}
        {task.review_status === "pending" && !isReviewer && (
          <button
            type="button"
            onClick={() => onCancelReview(task)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:border-stone-400 hover:text-stone-700"
          >
            <RotateCcw size={13} />
            ยกเลิกส่งตรวจ
          </button>
        )}
        {task.review_status === "approved" && (
          <button
            type="button"
            onClick={() => onReopen(task)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:border-stone-400 hover:text-stone-700"
          >
            <RotateCcw size={13} />
            เปิดงานใหม่
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDelete(task)}
            title="ลบงาน"
            aria-label="ลบงาน"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 active:scale-90 sm:h-7 sm:w-7"
          >
            <Trash2 size={16} />
          </button>
          {/* จอเล็กใช้แถบ "กลับ" ด้านบนแทน (X เล็กเกินไปสำหรับนิ้ว) */}
          <button
            type="button"
            onClick={onClose}
            title="ปิด (Esc)"
            aria-label="ปิดแผงรายละเอียด"
            className="hidden cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90 lg:block"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {/* title — บรรทัดเดียวกะทัดรัด */}
        <input
          value={title}
          aria-label="ชื่องาน"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="ชื่องาน"
          className={`w-full rounded-md border border-transparent px-2 py-1 text-base font-semibold leading-snug transition-colors hover:border-stone-200/80 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
            task.completed ? "text-stone-400 line-through" : "text-stone-900"
          }`}
        />

        {/* งาน creative ที่มาจาก Brief — โชว์ผู้สั่ง brief + ปุ่มลิงก์ไปการ์ด Brief ต้นทาง */}
        {isFromBrief && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-800">
            <span className="font-semibold">
              📋 Brief จาก : {profileName(briefCreator)}
            </span>
            {briefContentTypeLabel(task.brief_content_type) && (
              <span className="rounded-full bg-white px-2 py-0.5 font-medium text-sky-700">
                {briefContentTypeLabel(task.brief_content_type)}
              </span>
            )}
            {briefSource && (
              <button
                type="button"
                onClick={() => onNavigateToTask(briefSource.id)}
                title="ไปที่การ์ด Brief ต้นทาง (เปิดแผง + เลื่อนไปที่การ์ด)"
                className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-sky-300 bg-white px-2 py-0.5 font-medium text-sky-700 transition-colors hover:bg-sky-100 active:scale-[0.97]"
              >
                <ArrowUpRight size={13} />
                ไปที่ Brief
              </button>
            )}
          </div>
        )}

        {/* การ์ด Brief ที่รับงานแล้ว — ปุ่มลิงก์ไปงาน Creative ที่ถูกสร้าง */}
        {isBrief && linkedCreatives.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
            <span className="font-semibold">
              ✅ สร้างงาน Creative แล้ว
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {linkedCreatives.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNavigateToTask(c.id)}
                  title={`ไปที่งาน "${c.title}" (เปิดแผง + เลื่อนไปที่การ์ด)`}
                  className="inline-flex max-w-52 cursor-pointer items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-medium text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-[0.97]"
                >
                  <ArrowUpRight size={13} className="shrink-0" />
                  <span className="min-w-0 truncate">ไปที่งาน: {c.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* โซนตั้งค่า — ไร้กล่องแบบ Asana + ย่อเล็ก (ไม่ใช่เนื้อหาหลัก) ให้เหลือพื้นที่ให้รายละเอียด/ไฟล์/แชท */}
        <div className="space-y-px pb-0.5">
          {/* ผู้รับผิดชอบ — brief: ผู้สร้าง brief (อ่านอย่างเดียว) + แถว "มอบหมายให้" แยก,
              การ์ดจาก brief: ล็อกเป็นผู้กดรับงาน (ไม่มีให้เลือกมอบหมายต่อ), งานปกติ: เลือกได้ */}
          {isBrief ? (
            <>
              <FieldRow label="ผู้รับผิดชอบ">
                <div className="flex items-center gap-1.5 px-1.5 py-0.5">
                  <AssigneeAvatar assignee={task.creator ?? null} size={5} />
                  <span className="min-w-0 truncate text-xs text-stone-800">
                    {task.creator ? profileName(task.creator) : "-"}
                  </span>
                  <span className="shrink-0 text-[11px] text-stone-400">
                    (ผู้สร้าง Brief)
                  </span>
                </div>
              </FieldRow>
              <FieldRow label="มอบหมายให้" htmlFor="task-assignee">
                <div className="px-1.5">{assigneeSelect}</div>
              </FieldRow>
            </>
          ) : isFromBrief && task.assignee ? (
            // ล็อกเฉพาะเมื่อมีผู้รับอยู่จริง — ถ้าผู้รับหาย (โปรไฟล์ถูกลบ) ตกไปช่องเลือกปกติเพื่อกู้งาน
            <FieldRow label="ผู้รับผิดชอบ">
              <div className="flex items-center gap-1.5 px-1.5 py-0.5">
                <AssigneeAvatar assignee={task.assignee} size={5} />
                <span className="min-w-0 truncate text-xs text-stone-800">
                  {profileName(task.assignee)}
                </span>
                <span className="shrink-0 text-[11px] text-stone-400">
                  (ผู้กดรับงานจาก Brief)
                </span>
              </div>
            </FieldRow>
          ) : (
            <FieldRow label="ผู้รับผิดชอบ" htmlFor="task-assignee">
              <div className="px-1.5">{assigneeSelect}</div>
            </FieldRow>
          )}

          {/* เซคชัน brief: เลือกชนิดงานเป็นปุ่ม (graphic/video) ไม่ใช่ dropdown */}
          {isBrief && (
            <FieldRow label="ชนิดงาน">
              <div className="flex flex-wrap gap-1.5 px-1.5">
                {BRIEF_CONTENT_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => onSetBriefContentType(task, t.key)}
                    className={`cursor-pointer rounded-md border px-2.5 py-0.5 text-xs transition-colors active:scale-[0.97] ${
                      task.brief_content_type === t.key
                        ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
                        : "border-stone-200 text-stone-500 hover:border-brand-300 hover:text-brand-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </FieldRow>
          )}

          {/* ผู้ตรวจงาน — ซ่อนในเซคชัน brief (ผู้ตรวจ = ผู้สั่งงาน อัตโนมัติ ไม่ต้องเลือก)
              เมื่อทีมตั้งผู้ตรวจลำดับ 2 ไว้ การตรวจเป็นทอด: แสดง 2 แถว (ลำดับ 1 เลือกได้, ลำดับ 2 ตามทีม) */}
          {!isBrief && (
          <FieldRow
            label={chainVisible ? "ผู้ตรวจลำดับ 1" : "ผู้ตรวจงาน"}
            htmlFor="task-reviewer"
          >
            <div className="px-1.5">
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <PersonSelect
                    id="task-reviewer"
                    size="sm"
                    ariaLabel="เลือกผู้ตรวจงาน"
                    value={task.reviewer_id ?? ""}
                    disabled={task.review_status !== "none"}
                    onChange={(v) => onSetReviewer(task, v === "" ? null : v)}
                    options={[
                      { value: "", label: "เลือกผู้ตรวจ", profile: null },
                      ...reviewerOptions.map((p) => ({ value: p.id, profile: p })),
                    ]}
                  />
                  {reviewerOptions.length === 0 && (
                    <p className="mt-0.5 text-xs text-amber-600">
                      ยังไม่มีรายชื่อผู้ตรวจ — เพิ่มได้ที่ปุ่ม
                      &quot;จัดการผู้ตรวจ&quot; ด้านบนของหน้างาน
                    </p>
                  )}
                </div>
                {(hasChain || task.reviewer1b_id !== null || selfPrimary) &&
                  primary1Approved && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                      {selfPrimary ? autoLabel : "✓ อนุมัติแล้ว"}
                    </span>
                  )}
              </div>
              {/* ผู้ตรวจลำดับ 1 คนที่ 2 (ผู้ตรวจร่วม) — ต้องอนุมัติครบทั้งคู่ งานจึงผ่านทอดแรก
                  เลือกได้เฉพาะก่อนส่งตรวจ (กติกาเดียวกับช่องหลัก) */}
              {task.reviewer1b_id !== null || show1bPicker ? (
                <div className="mt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <PersonSelect
                        id="task-reviewer1b"
                        size="sm"
                        ariaLabel="เลือกผู้ตรวจคนที่ 2 (ตรวจร่วมกัน)"
                        value={task.reviewer1b_id ?? ""}
                        disabled={task.review_status !== "none"}
                        onChange={(v) => {
                          if (v === "") setShow1bPicker(false);
                          onSetReviewer1b(task, v === "" ? null : v);
                        }}
                        options={[
                          { value: "", label: "ไม่ใช้ (ตรวจคนเดียว)", profile: null },
                          ...reviewer1bOptions.map((p) => ({
                            value: p.id,
                            profile: p,
                          })),
                        ]}
                      />
                    </div>
                    {task.reviewer1b_id !== null && co1Approved && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                        {selfCo ? autoLabel : "✓ อนุมัติแล้ว"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 px-1.5 text-[11px] text-stone-400">
                    ผู้ตรวจร่วม — ต้องอนุมัติครบทุกคน งานจึงผ่านลำดับ 1
                  </p>
                </div>
              ) : task.review_status === "none" &&
                task.reviewer_id !== null &&
                reviewer1bOptions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShow1bPicker(true)}
                  className="mt-0.5 cursor-pointer px-1.5 text-[11px] font-medium text-brand-600 hover:underline"
                >
                  + เพิ่มผู้ตรวจอีกคน (ตรวจร่วมกัน — ต้องผ่านครบทุกคน)
                </button>
              ) : null}
              {/* บอกล่วงหน้าก่อนกดส่งตรวจ ว่าช่องไหนจะผ่านเองเพราะเป็นงานของผู้ตรวจคนนั้น */}
              {task.review_status === "none" && (selfPrimary || selfCo) && (
                <p className="mt-1 px-1.5 text-[11px] text-emerald-600">
                  {selfPrimary && selfCo
                    ? "ผู้ตรวจลำดับ 1 เป็นเจ้าของงานนี้เอง"
                    : selfPrimary
                      ? "ผู้ตรวจลำดับ 1 คือเจ้าของงานนี้เอง"
                      : "ผู้ตรวจร่วมคือเจ้าของงานนี้เอง"}{" "}
                  — ส่งตรวจแล้วช่องนั้นจะผ่านอัตโนมัติ ไม่ต้องกดอนุมัติงานตัวเอง
                </p>
              )}
            </div>
          </FieldRow>
          )}

          {/* ผู้ตรวจลำดับ 2 (อนุมัติขั้นสุดท้าย) — read-only ตามการตั้งค่าทีม ณ ตอนส่งตรวจ */}
          {!isBrief && chainVisible && (
            <FieldRow label="ผู้ตรวจลำดับ 2">
              <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-0.5">
                <AssigneeAvatar
                  assignee={hasChain ? (task.reviewer2 ?? null) : teamReviewer2}
                  size={5}
                />
                <span className="min-w-0 truncate text-xs text-stone-800">
                  {hasChain
                    ? task.reviewer2
                      ? profileName(task.reviewer2)
                      : "-"
                    : teamReviewer2
                      ? profileName(teamReviewer2)
                      : "-"}
                </span>
                {task.review_status === "none" ? (
                  <span className="shrink-0 text-[11px] text-stone-400">
                    (อนุมัติขั้นสุดท้าย — ตามการตั้งค่าทีม)
                  </span>
                ) : task.review_status === "approved" ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                    ✓ อนุมัติแล้ว
                  </span>
                ) : reviewStep >= 2 ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                    กำลังตรวจ (ขั้นสุดท้าย)
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-stone-400">
                    รอลำดับ 1 อนุมัติครบทุกคนก่อน
                  </span>
                )}
              </div>
            </FieldRow>
          )}

          {/* influencer ที่ใช้ทำคอนเทนต์ — เลือกได้ ค้นหาได้ ไม่บังคับ */}
          <FieldRow label="Influencer">
            <div ref={influRef} className="relative px-1.5">
              <button
                type="button"
                onClick={() => {
                  setInfluOpen((v) => !v);
                  setInfluQuery("");
                }}
                className={`${bareControlSm} flex items-center gap-1.5 text-left`}
              >
                <Sparkles size={13} className="shrink-0 text-brand-400" />
                <span
                  className={`min-w-0 flex-1 truncate ${task.influencer ? "text-stone-800" : "text-stone-400"}`}
                >
                  {task.influencer
                    ? influLabel(task.influencer)
                    : "ไม่ระบุ (เลือก influencer)"}
                </span>
                {task.influencer && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="ลบ influencer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetInfluencer(task, null);
                    }}
                    // เป็น span ใน <button> (ห้ามซ้อน button) — ต้องรับ Enter/Space เอง
                    // ไม่งั้นคีย์บอร์ดโฟกัสถึงแต่กดไม่ได้
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onSetInfluencer(task, null);
                      }
                    }}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-stone-400 hover:text-rose-500"
                  >
                    <X size={13} />
                  </span>
                )}
              </button>
              {influOpen && (
                <div className="absolute left-2 right-2 z-20 mt-1 max-h-64 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
                  <div className="flex items-center gap-1.5 border-b border-stone-100 px-2.5 py-2">
                    <Search size={13} className="shrink-0 text-stone-400" />
                    <input
                      autoFocus
                      value={influQuery}
                      onChange={(e) => setInfluQuery(e.target.value)}
                      placeholder="ค้นหาชื่อ / ชื่อเล่น..."
                      className="min-w-0 flex-1 bg-transparent text-sm text-stone-800 placeholder:text-stone-500 focus:outline-none"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {influMatches.length === 0 && (
                      <p className="px-3 py-2 text-xs text-stone-400">
                        ไม่พบ influencer
                      </p>
                    )}
                    {influMatches.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => {
                          onSetInfluencer(task, i.id);
                          setInfluOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-brand-50 ${
                          task.influencer_id === i.id
                            ? "bg-brand-50/60 font-medium text-brand-700"
                            : "text-stone-700"
                        }`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-[10px] font-semibold text-cream">
                          {i.first_name.charAt(0)}
                        </span>
                        <span className="min-w-0 truncate">{influLabel(i)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FieldRow>

          <FieldRow label="หมวดหมู่" htmlFor="task-category">
            <select
              id="task-category"
              value={task.category}
              onChange={(e) => {
                if (e.target.value === "__add__") {
                  const name = window.prompt("ชื่อหมวดหมู่ใหม่")?.trim();
                  if (name) {
                    onAddCategory(name);
                    onPatch(task.id, { db: { category: name } });
                  }
                  return;
                }
                onPatch(task.id, { db: { category: e.target.value } });
              }}
              className={bareSelectSm}
            >
              <option value={DEFAULT_TASK_CATEGORY}>ไม่ระบุ</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {/* หมวดเดิมของงานที่ไม่อยู่ในลิสต์ (เช่นถูกลบไปแล้ว) ยังแสดงได้ */}
              {task.category !== DEFAULT_TASK_CATEGORY &&
                !categories.includes(task.category) && (
                  <option value={task.category}>{task.category}</option>
                )}
              <option value="__add__">+ เพิ่มหมวดหมู่...</option>
            </select>
          </FieldRow>

          {/* ประเภทชิ้นงานคอนเทนต์ (ภาพ/วิดีโอ) + หมวดเนื้อหา — ใช้นับ KPI ทีมคอนเทนต์
              ปกติถูกบังคับติดตอนกด "โพสแล้ว" — ช่องนี้ไว้ติดล่วงหน้า/แก้ทีหลัง */}
          <FieldRow label="ชิ้นงาน" htmlFor="task-content-format">
            <select
              id="task-content-format"
              value={task.content_format ?? ""}
              onChange={(e) =>
                onPatch(task.id, {
                  db: {
                    content_format:
                      e.target.value === ""
                        ? null
                        : (e.target.value as ContentFormat),
                  },
                })
              }
              className={bareSelectSm}
            >
              <option value="">ไม่ระบุ</option>
              {CONTENT_FORMAT_ORDER.map((f) => (
                <option key={f} value={f}>
                  {CONTENT_FORMATS[f].label}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="เนื้อหา" htmlFor="task-content-category">
            <select
              id="task-content-category"
              value={task.content_category_id ?? ""}
              onChange={(e) =>
                onPatch(task.id, {
                  db: {
                    content_category_id:
                      e.target.value === "" ? null : e.target.value,
                  },
                })
              }
              className={bareSelectSm}
            >
              <option value="">ไม่ระบุ</option>
              {contentCategories
                .filter(
                  (c) => c.active || c.id === task.content_category_id
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </FieldRow>
        </div>

        {/* description */}
        <div className="border-t border-stone-200/70 pt-2.5">
          <p className="mb-1 px-2 text-sm font-medium text-stone-500">
            รายละเอียด
          </p>
          <textarea
            value={description}
            rows={3}
            aria-label="รายละเอียดงาน"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            placeholder="งานนี้เกี่ยวกับอะไร..."
            className={`${bareControl} min-h-20 resize-y leading-6`}
          />
        </div>

        {/* งาน creative ที่มาจาก brief — ไฟล์ source ที่ผู้สั่งแนบไว้บนการ์ด brief (ดูได้อย่างเดียว)
            แยกจาก "ไฟล์งานที่ Approve แล้ว" ชัดเจน: ไฟล์ brief อยู่กับ brief ไม่ปนกับไฟล์ส่งงาน */}
        {isFromBrief && (briefFiles.length > 0 || briefSource?.deliverable_url) && (
          <div className="border-t border-stone-200/70 pt-2.5">
            <p className="mb-1 flex items-center gap-2 px-2 text-sm font-medium text-stone-500">
              ไฟล์จาก Brief
              <span className="text-xs text-stone-400">
                source จากผู้สั่ง — ดูได้อย่างเดียว
              </span>
            </p>
            <div className="space-y-2 px-2">
              {briefSource?.deliverable_url && (
                <a
                  href={briefSource.deliverable_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-xs text-sky-600 hover:underline"
                >
                  <Link2 size={13} className="shrink-0" />
                  <span className="min-w-0 truncate">
                    ลิงก์อ้างอิงจาก Brief
                  </span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              )}
              {briefFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {briefFiles.map((f, i) => (
                    <DeliverableFileThumb
                      key={f.id}
                      file={f}
                      onOpen={() => setBriefLightboxIndex(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* การ์ด brief: ช่องแนบไฟล์ = "ไฟล์ Brief" (source ให้ผู้รับงานใช้ ไม่ใช่ไฟล์งานเสร็จ)
            งานปกติ: ไฟล์/ลิงก์งานที่ได้รับอนุมัติ — ลิงก์ Drive 1 อัน + ไฟล์รูป/วิดีโอได้หลายไฟล์ */}
        <div className="border-t border-stone-200/70 pt-2.5">
          <p className="mb-1 flex items-center gap-2 px-2 text-sm font-medium text-stone-500">
            {isBrief ? "ไฟล์ Brief" : "ไฟล์งานที่ Approve แล้ว"}
            {isBrief && (
              <span className="text-xs text-stone-400">
                source ให้ผู้รับงานใช้
              </span>
            )}
            {files.length > 0 && (
              <span className="text-xs text-stone-400">{files.length} ไฟล์</span>
            )}
          </p>
          <div className="space-y-2 px-2">
            <div className="flex items-center gap-1.5">
              <Link2 size={15} className="shrink-0 text-stone-400" />
              <input
                value={deliverableDraft}
                aria-label={
                  isBrief ? "ลิงก์อ้างอิงประกอบ Brief" : "ลิงก์งาน (Google Drive)"
                }
                placeholder={
                  isBrief
                    ? "วางลิงก์อ้างอิงประกอบ Brief (ถ้ามี)..."
                    : "วางลิงก์ Google Drive ของงานที่ได้รับอนุมัติ..."
                }
                onChange={(e) => setDeliverableDraft(e.target.value)}
                onBlur={saveDeliverableUrl}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className={bareControl}
              />
              {task.deliverable_url && (
                <a
                  href={task.deliverable_url}
                  target="_blank"
                  rel="noreferrer"
                  title="เปิดลิงก์งาน"
                  className="shrink-0 rounded-lg p-1.5 text-sky-600 transition-colors hover:bg-sky-50"
                >
                  <ExternalLink size={15} />
                </a>
              )}
            </div>

            {files.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {files.map((f, i) => (
                  <DeliverableFileThumb
                    key={f.id}
                    file={f}
                    onOpen={() => setLightboxIndex(i)}
                    onRemove={() => setConfirmRemoveFile(f)}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={uploadingFiles}
              onClick={() => deliverableInputRef.current?.click()}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-stone-200 bg-white/50 px-3 py-3 text-xs text-stone-400 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700 disabled:cursor-wait"
            >
              <Upload size={14} />
              {uploadingFiles
                ? uploadProgress
                  ? `${uploadProgress.phase === "compress" ? "กำลังบีบไฟล์" : "กำลังอัพโหลด"} ${uploadProgress.index + 1}/${uploadProgress.total} · ${Math.round(uploadProgress.pct * 100)}%`
                  : "กำลังอัพโหลด..."
                : `อัพโหลดรูป/วิดีโอ (เลือกได้หลายไฟล์ · วิดีโอใหญ่ระบบบีบให้อัตโนมัติ · ไม่เกิน ${formatFileSize(MAX_UPLOAD_BYTES)} ต่อไฟล์)`}
            </button>
            {uploadProgress && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-150"
                  style={{ width: `${Math.round(uploadProgress.pct * 100)}%` }}
                />
              </div>
            )}
            <input
              ref={deliverableInputRef}
              type="file"
              accept="image/*,video/*,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const fl = e.target.files;
                if (fl && fl.length > 0) void uploadFiles(fl);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* subtasks */}
        <div className="border-t border-stone-200/70 pt-2.5">
          <p className="mb-1 flex items-center gap-2 px-2 text-sm font-medium text-stone-500">
            งานย่อย
            {subtasks !== null && subtasks.length > 0 && (
              <span className="text-xs text-stone-400">
                {subDone}/{subtasks.length}
              </span>
            )}
          </p>
          <div className="space-y-0.5">
            {(subtasks ?? []).map((sub) => (
              <SubtaskRowItem
                key={sub.id}
                sub={sub}
                onToggle={() => toggleSubtask(sub)}
                onRename={(name) => renameSubtask(sub, name)}
                onDelete={() => deleteSubtask(sub)}
                onUploadFiles={(fl) => void uploadSubtaskFiles(sub, fl)}
                onRemoveFile={(f) => removeSubtaskFile(sub, f)}
              />
            ))}
            {addingSub ? (
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="h-4 w-4 shrink-0 rounded-full border border-stone-300" />
                <input
                  autoFocus
                  value={subDraft}
                  placeholder="พิมพ์ชื่องานย่อย แล้วกด Enter"
                  onChange={(e) => setSubDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const t = subDraft.trim();
                      setSubDraft("");
                      if (t !== "") void addSubtask(t);
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setSubDraft("");
                      setAddingSub(false);
                    }
                  }}
                  onBlur={() => {
                    const t = subDraft.trim();
                    setSubDraft("");
                    setAddingSub(false);
                    if (t !== "") void addSubtask(t);
                  }}
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-stone-800 placeholder:text-stone-500 focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSub(true)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-stone-400 transition-colors hover:bg-white/70 hover:text-brand-700"
              >
                <Plus size={14} />
                เพิ่มงานย่อย
              </button>
            )}
          </div>
        </div>

        {/* แชทงานนี้ — ฟองแชท */}
        <div className="border-t border-stone-200/70 pt-2.5">
          <p className="mb-2.5 px-2 text-sm font-medium text-stone-500">
            พูดคุย
          </p>
          <div className="space-y-2.5">
            {(comments ?? []).map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                mine={c.author_id !== null && c.author_id === userId}
                mentionNames={mentionNames}
              />
            ))}
            {comments !== null && comments.length === 0 && (
              <p className="py-2 text-center text-xs text-stone-400">
                ยังไม่มีข้อความ — เริ่มคุยเรื่องงานนี้ได้เลย
              </p>
            )}
            <div ref={commentsEndRef} />
          </div>
        </div>

        <p className="px-2 text-[11px] text-stone-300">
          สร้างโดย {task.creator ? profileName(task.creator) : "-"} ·{" "}
          {formatDateTime(task.created_at)}
        </p>
        {/* ผู้กดโพส — งานที่โพสไว้ก่อนมีคอลัมน์ posted_by จะไม่มีชื่อ โชว์ "ไม่ระบุ" แทน */}
        {task.posted_at && (
          <p className="px-2 text-[11px] text-sky-400">
            โพสโดย {task.poster ? profileName(task.poster) : "ไม่ระบุ"} ·{" "}
            {formatDateTime(task.posted_at)}
          </p>
        )}
        {/* ช่องว่างท้ายเนื้อหาเท่าส่วนที่ชีตจมอยู่ใต้ขอบจอ — ตัวชีตสูงเต็มจอเสมอ
            ถ้าไม่มีตัวนี้ ท่อนท้ายจะเลื่อนขึ้นมาอ่านไม่ได้ตอนชีตอยู่ระดับครึ่งจอ */}
        <div
          aria-hidden
          style={{ height: "var(--sheet-pad)" }}
          className="lg:hidden"
        />
      </div>

      {panelError && (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-600 animate-fade-in">
          {panelError}
        </div>
      )}

      {/* ช่องพิมพ์แชท — ติดล่างเสมอ */}
      <div className="relative border-t border-stone-100 bg-white/70 px-4 py-3 pb-safe-3 lg:pb-3">
        {/* เมนูแท็กคน — โผล่เหนือช่องพิมพ์เมื่อพิมพ์ @ */}
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 z-30 mb-1 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl animate-scale-in">
            <p className="border-b border-stone-100 px-3 py-1.5 text-[11px] text-stone-400">
              แท็กเพื่อส่งแจ้งเตือนถึงคนนั้น (↑↓ เลือก, Enter ยืนยัน)
            </p>
            {mentionMatches.map((p, i) => (
              <button
                key={p.id}
                type="button"
                // กัน textarea เสีย focus ก่อนคลิกถึง (mousedown มาก่อน click)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(p)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  i === mentionIndex
                    ? "bg-brand-50 text-brand-800"
                    : "text-stone-700 hover:bg-brand-50/60"
                }`}
              >
                <AssigneeAvatar assignee={p} size={5} />
                <span className="min-w-0 truncate">{profileName(p)}</span>
              </button>
            ))}
          </div>
        )}
        {showLinkInput && (
          <div className="mb-2 flex items-center gap-1.5 pl-9">
            <Link2 size={14} className="shrink-0 text-stone-400" />
            <input
              value={linkDraft}
              aria-label="ลิงก์ไฟล์แนบ"
              placeholder="วางลิงก์ไฟล์ที่แก้ไข (Google Drive)..."
              onChange={(e) => setLinkDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-stone-200/80 bg-white/80 px-2.5 py-1 text-xs text-stone-800 placeholder:text-stone-500 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}
        {attachFile && (
          <p className="mb-2 flex items-center gap-1.5 pl-9 text-xs text-stone-500">
            <Paperclip size={12} className="shrink-0" />
            <span className="min-w-0 truncate">{attachFile.name}</span>
            <button
              type="button"
              onClick={() => setAttachFile(null)}
              title="เอาไฟล์แนบออก"
              aria-label="เอาไฟล์แนบออก"
              className="shrink-0 cursor-pointer text-stone-400 transition-colors hover:text-rose-500"
            >
              <X size={12} />
            </button>
          </p>
        )}
        <div className="flex items-start gap-2.5">
          <AssigneeAvatar assignee={me} size={7} />
          <textarea
            ref={commentInputRef}
            value={commentDraft}
            rows={commentDraft.includes("\n") ? 3 : 1}
            placeholder="พิมพ์ข้อความ... (@ แท็กคน, Enter ส่ง)"
            aria-label="พิมพ์ข้อความ"
            onChange={(e) => {
              setCommentDraft(e.target.value);
              updateMentionQuery(e.target);
            }}
            onKeyDown={(e) => {
              // เมนูแท็กคนเปิดอยู่ — ลูกศร/Enter/Tab เป็นของเมนูก่อน
              if (mentionQuery !== null && mentionMatches.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionMatches.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex(
                    (i) =>
                      (i - 1 + mentionMatches.length) % mentionMatches.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(mentionMatches[mentionIndex]);
                  return;
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setMentionQuery(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendComment();
              }
            }}
            className="min-h-9 min-w-0 flex-1 resize-none rounded-2xl border border-transparent bg-stone-100 px-3.5 py-2 text-sm leading-6 text-stone-800 placeholder:text-stone-500 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={() => void sendComment()}
            disabled={
              (commentDraft.trim() === "" &&
                !attachFile &&
                linkDraft.trim() === "") ||
              sending
            }
            title="ส่งความคิดเห็น"
            aria-label="ส่งความคิดเห็น"
            className="cursor-pointer rounded-lg p-2 text-brand-600 transition-all duration-200 hover:bg-brand-50 active:scale-90 disabled:cursor-not-allowed disabled:text-stone-300"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-3 pl-9">
          <button
            type="button"
            onClick={() => commentFileRef.current?.click()}
            title="แนบรูป/ไฟล์"
            aria-label="แนบรูป/ไฟล์"
            className="cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            <Paperclip size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowLinkInput((v) => !v)}
            title="แนบลิงก์ (Google Drive)"
            aria-label="แนบลิงก์"
            className={`cursor-pointer rounded p-1 transition-colors hover:bg-brand-50 hover:text-brand-700 ${
              showLinkInput || linkDraft.trim() !== ""
                ? "text-brand-600"
                : "text-stone-400"
            }`}
          >
            <Link2 size={14} />
          </button>
          <input
            ref={commentFileRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              // บอกตั้งแต่ตอนเลือก ไม่ใช่ตอนกดส่ง
              const tooLarge = fileTooLargeMessage(f);
              if (tooLarge) {
                showError(tooLarge);
                return;
              }
              setAttachFile(f);
            }}
          />
        </div>
      </div>

      {/* lightbox ดูไฟล์แนบใหญ่ + เลื่อนดูไฟล์อื่น */}
      {lightboxIndex !== null && files[lightboxIndex] && (
        <MediaLightbox
          items={files}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {briefLightboxIndex !== null && briefFiles[briefLightboxIndex] && (
        <MediaLightbox
          items={briefFiles}
          index={briefLightboxIndex}
          onIndexChange={setBriefLightboxIndex}
          onClose={() => setBriefLightboxIndex(null)}
        />
      )}

      {/* ลบไฟล์งาน = ลบออกจาก storage ถาวร กู้ไม่ได้ — ต้องถามก่อนเสมอ
          (ต่างจากลบการ์ดทั้งใบซึ่งเข้าถังขยะและกู้คืนได้) */}
      <ConfirmDialog
        open={confirmRemoveFile !== null}
        title="ลบไฟล์งาน"
        message={
          <>
            ลบไฟล์ <b>{confirmRemoveFile?.file_name ?? "นี้"}</b> ออกถาวรใช่หรือไม่?
            <br />
            ไฟล์จะถูกลบออกจากที่เก็บไฟล์ด้วย และ<b>กู้คืนไม่ได้</b>
          </>
        }
        onConfirm={() => {
          if (confirmRemoveFile) void removeFile(confirmRemoveFile);
        }}
        onClose={() => setConfirmRemoveFile(null)}
      />
      </aside>
    </>
  );
}

/* ---------- ข้อความแชทหนึ่งฟอง — ของฉันชิดขวา (โทน brand), ของคนอื่นชิดซ้าย (เทา) ---------- */

/** เนื้อความพร้อมเน้น @ชื่อ — เทียบกับชื่อสมาชิกทุกคน (ลิสต์ต้องเรียงชื่อยาวก่อน) */
function BodyWithMentions({
  body,
  names,
  mine,
}: {
  body: string;
  names: string[];
  mine: boolean;
}) {
  const nodes = useMemo(() => {
    if (names.length === 0) return [body];
    const re = new RegExp(`@(?:${names.map(escapeRegExp).join("|")})`, "g");
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of body.matchAll(re)) {
      const at = m.index ?? 0;
      if (at > last) out.push(body.slice(last, at));
      out.push(
        <span
          key={`${at}-${m[0]}`}
          className={
            mine
              ? "font-semibold underline decoration-cream/70"
              : "font-semibold text-brand-700"
          }
        >
          {m[0]}
        </span>
      );
      last = at + m[0].length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
  }, [body, names, mine]);
  return <p className="whitespace-pre-wrap break-words">{nodes}</p>;
}

function CommentItem({
  comment: c,
  mine,
  mentionNames,
}: {
  comment: TaskCommentWithAuthor;
  mine: boolean;
  /** ชื่อสมาชิกทุกคน (เรียงยาว→สั้น) สำหรับเน้น @ชื่อ */
  mentionNames: string[];
}) {
  const { url: fileUrl, failed: fileFailed } = useSignedUrl(c.file_path);
  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && <AssigneeAvatar assignee={c.author} size={7} />}
      <div
        className={`flex min-w-0 max-w-[82%] flex-col ${
          mine ? "items-end" : "items-start"
        }`}
      >
        {!mine && (
          <span className="mb-0.5 px-1 text-[11px] font-medium text-stone-500">
            {profileName(c.author)}
          </span>
        )}
        <div
          className={`min-w-0 rounded-2xl px-3 py-1.5 text-sm leading-6 ${
            mine
              ? "rounded-br-md bg-gradient-to-b from-brand-500 to-brand-600 text-cream"
              : "rounded-bl-md bg-stone-100 text-stone-800"
          }`}
        >
          {c.is_revision && (
            // ประเภทการตีกลับ: "คำผิด" นับเป็นข้อผิดพลาดใน KPI · "เพิ่มเติม" ไม่นับ
            // (แถวเก่าก่อน migration 0063 ไม่มีค่า → ถือเป็นคำผิดตามเดิม)
            <span
              className={`mb-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                mine
                  ? "bg-white/25 text-cream"
                  : REVISION_KINDS[c.revision_kind ?? DEFAULT_REVISION_KIND]
                      .chip
              }`}
            >
              ตีกลับ ·{" "}
              {REVISION_KINDS[c.revision_kind ?? DEFAULT_REVISION_KIND].label}{" "}
              ครั้งที่ {c.revision_number ?? "-"}
            </span>
          )}
          {c.body !== "" && (
            <BodyWithMentions body={c.body} names={mentionNames} mine={mine} />
          )}
          {c.link_url && (
            <a
              href={c.link_url}
              target="_blank"
              rel="noreferrer"
              className={`mt-1 inline-flex max-w-full items-center gap-1 text-xs hover:underline ${
                mine ? "text-cream/90" : "text-sky-600"
              }`}
            >
              <Link2 size={12} className="shrink-0" />
              <span className="min-w-0 truncate">{c.link_url}</span>
            </a>
          )}
          {c.file_path &&
            (fileUrl ? (
              isImagePath(c.file_path) ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="เปิดรูปเต็ม"
                  className="mt-1.5 block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileUrl}
                    alt="ไฟล์แนบ"
                    className="max-h-44 rounded-lg object-contain"
                  />
                </a>
              ) : (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-1 inline-flex items-center gap-1 text-xs hover:underline ${
                    mine ? "text-cream/90" : "text-brand-700"
                  }`}
                >
                  <Paperclip size={12} />
                  เปิดไฟล์แนบ
                </a>
              )
            ) : fileFailed ? (
              <p
                className={`mt-1 text-xs ${mine ? "text-cream/70" : "text-stone-400"}`}
              >
                เปิดไฟล์แนบไม่ได้
              </p>
            ) : (
              <p
                className={`mt-1 text-xs ${mine ? "text-cream/70" : "text-stone-400"}`}
              >
                กำลังโหลด...
              </p>
            ))}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-stone-400">
          {formatDateTime(c.created_at)}
        </span>
      </div>
    </div>
  );
}

/* ---------- แถวงานย่อย: ติ๊กเสร็จ + แก้ชื่อ inline + ลบตอน hover ---------- */

function SubtaskRowItem({
  sub,
  onToggle,
  onRename,
  onDelete,
  onUploadFiles,
  onRemoveFile,
}: {
  sub: SubtaskWithFiles;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onUploadFiles: (files: FileList) => void;
  onRemoveFile: (file: TaskSubtaskFileRow) => void;
}) {
  const [draft, setDraft] = useState(sub.title);
  useEffect(() => setDraft(sub.title), [sub.title]);
  const temp = sub.id.startsWith("temp-");
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`group rounded-md px-2 py-1 transition-colors hover:bg-white/70 ${
        temp ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <CompleteToggle
          completed={sub.completed}
          onToggle={temp ? undefined : onToggle}
          size={16}
        />
        <input
          value={draft}
          aria-label="ชื่องานย่อย"
          disabled={temp}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim() === "") {
              setDraft(sub.title);
            } else {
              onRename(draft);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(sub.title);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`min-w-0 flex-1 border-none bg-transparent text-sm focus:outline-none ${
            sub.completed ? "text-stone-400 line-through" : "text-stone-800"
          }`}
        />
        {!temp && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="แนบไฟล์ (หลายไฟล์ได้)"
              aria-label="แนบไฟล์งานย่อย"
              className="relative cursor-pointer rounded p-1 text-stone-300 reveal-on-hover opacity-0 transition-all hover:text-brand-600 focus-visible:opacity-100 group-hover:opacity-100 active:scale-90"
            >
              <Paperclip size={13} />
              {sub.files.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-brand-500 text-[8px] font-bold text-cream">
                  {sub.files.length}
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadFiles(e.target.files);
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={onDelete}
              title="ลบงานย่อย"
              aria-label="ลบงานย่อย"
              className="cursor-pointer rounded p-1 text-stone-300 reveal-on-hover opacity-0 transition-all hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 active:scale-90"
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>
      {/* ไฟล์แนบของงานย่อย — ชิปเล็กๆ กดเปิด/ลบได้ */}
      {sub.files.length > 0 && (
        <div className="ml-6 mt-1 flex flex-wrap gap-1">
          {sub.files.map((f) => (
            <SubtaskFileChip
              key={f.id}
              file={f}
              onRemove={() => onRemoveFile(f)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** ชิปไฟล์แนบงานย่อย — คลิกเปิดผ่าน signed URL, กด × เพื่อลบ */
function SubtaskFileChip({
  file,
  onRemove,
}: {
  file: TaskSubtaskFileRow;
  onRemove: () => void;
}) {
  const { url } = useSignedUrl(file.file_path);
  const name = file.file_name ?? "ไฟล์";
  return (
    <span className="inline-flex max-w-40 items-center gap-1 rounded-full border border-stone-200 bg-white/80 py-0.5 pl-2 pr-1 text-xs text-stone-600">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={name}
          className="min-w-0 truncate hover:text-brand-700 hover:underline"
        >
          {name}
        </a>
      ) : (
        <span className="min-w-0 truncate">{name}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="ลบไฟล์"
        aria-label="ลบไฟล์แนบ"
        className="shrink-0 cursor-pointer rounded-full p-0.5 text-stone-300 hover:text-rose-500 active:scale-90"
      >
        <X size={11} />
      </button>
    </span>
  );
}

/* ---------- รูป/วิดีโอไฟล์งาน (thumbnail + ลบ) ---------- */

function DeliverableFileThumb({
  file,
  onOpen,
  onRemove,
}: {
  file: TaskFileRow;
  onOpen: () => void;
  /** ไม่ส่ง = read-only (เช่นไฟล์จาก Brief ที่ดูได้อย่างเดียว ลบไม่ได้จากการ์ดนี้) */
  onRemove?: () => void;
}) {
  const { url, failed } = useSignedUrl(file.file_path);
  const isImg = isImagePath(file.file_path);
  const isVid = isVideoPath(file.file_path);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
      {url ? (
        <button
          type="button"
          onClick={onOpen}
          title={file.file_name ?? "เปิดดู"}
          className="block h-full w-full cursor-pointer"
        >
          {isImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.file_name ?? "ไฟล์งาน"}
              className="h-full w-full object-cover"
            />
          ) : isVid ? (
            <>
              <video
                src={url}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white">
                  ▶ วิดีโอ
                </span>
              </span>
            </>
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] text-stone-500">
              <Paperclip size={16} />
              <span className="line-clamp-2 break-all">
                {file.file_name ?? "ไฟล์"}
              </span>
            </span>
          )}
        </button>
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-stone-300">
          {failed ? "เปิดไฟล์ไม่ได้" : "กำลังโหลด..."}
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="ลบไฟล์"
          aria-label="ลบไฟล์"
          // จอสัมผัสไม่มี hover — ถ้าซ่อนด้วย opacity-0 ปุ่มจะมองไม่เห็นแต่ยังกดโดนได้
          // (อยู่มุมที่นิ้วโดนพอดีตอนกดเปิดไฟล์) จึงต้องโชว์ถาวรบนเครื่องที่ hover ไม่ได้
          // ใช้ reveal-on-hover (อิงความสามารถ hover จริง) ไม่ใช่ sm: ที่อิงความกว้างจอ —
          // แท็บเล็ตกว้าง ≥sm แต่ไม่มี hover จะยังพังถ้าใช้เบรกพอยต์
          className="absolute right-1 top-1 cursor-pointer rounded-full bg-white/85 p-1 text-stone-500 reveal-on-hover opacity-0 shadow transition-all hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 active:scale-90"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
