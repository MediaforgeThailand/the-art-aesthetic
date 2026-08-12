"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  Image as ImageIcon,
  Paperclip,
  Play,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** useLayoutEffect ฝั่ง client, useEffect ฝั่ง server — กัน warning ตอน SSR */
const useIsoLayoutEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;
import { createPortal } from "react-dom";
import { type MenuBox, menuBox, useAnchoredMenu } from "@/components/anchored-menu";
import { Badge } from "@/components/ui";
import {
  briefContentTypeLabel,
  DEFAULT_TASK_CATEGORY,
  STORAGE_BUCKET_DOCUMENTS,
  taskCategoryChipClass,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { isImagePath, isVideoPath } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";
import type { ProfileRow, TaskFileRow, TaskWithAssignee } from "@/lib/types";
import { useSignedUrl } from "../influencers/use-signed-url";

export type ProfileOption = Pick<
  ProfileRow,
  "id" | "full_name" | "email" | "avatar_path"
>;

/* นิยามจริงอยู่ที่ `@/lib/media` (ใช้ร่วมกับหน้า All Media ฝั่ง server) —
   re-export ไว้ให้ไฟล์เดิมที่ import จากที่นี่ใช้ได้เหมือนเดิม */
export { isImagePath, isVideoPath };

/** id ชั่วคราวของแถว optimistic ที่ยังไม่ได้คำตอบจาก DB */
export function isTempId(id: string): boolean {
  return id.startsWith("temp-");
}

/** ชื่อที่แสดงของ profile — full_name ก่อน, ตกลงมาที่ email */
export function profileName(
  p: { full_name: string | null; email: string | null } | null | undefined
): string {
  if (!p) return "-";
  return p.full_name || p.email || "-";
}

export function AssigneeAvatar({
  assignee,
  size = 6,
  title,
}: {
  assignee: {
    full_name: string | null;
    email: string | null;
    /** path รูปโปรไฟล์ใน storage — มีแล้วแสดงรูปจริงแทนตัวอักษร */
    avatar_path?: string | null;
  } | null;
  size?: 5 | 6 | 7 | 8;
  /** ข้อความ tooltip แทนค่าปกติ (ชื่อคน / "ยังไม่ระบุผู้รับผิดชอบ") */
  title?: string;
}) {
  // hook ต้องถูกเรียกทุก render — ส่ง null เมื่อไม่มีรูป (useSignedUrl รองรับ)
  const { url } = useSignedUrl(assignee?.avatar_path ?? null);
  const dim =
    size === 8
      ? "h-8 w-8"
      : size === 7
        ? "h-7 w-7"
        : size === 5
          ? "h-5 w-5"
          : "h-6 w-6";
  if (!assignee) {
    return (
      <span
        title={title ?? "ยังไม่ระบุผู้รับผิดชอบ"}
        className={`flex ${dim} shrink-0 items-center justify-center rounded-full border-2 border-dashed border-stone-300`}
      />
    );
  }
  const name = profileName(assignee);
  if (assignee.avatar_path && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        title={title ?? name}
        className={`${dim} shrink-0 rounded-full object-cover shadow-sm`}
      />
    );
  }
  return (
    <span
      title={title ?? name}
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-[10px] font-semibold text-cream shadow-sm`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * วงกลมผู้รับผิดชอบแบบกดได้ — เปิดเมนูเลือกคนทันทีจากการ์ด (แบบ Asana)
 * เมนู render ผ่าน portal + fixed position กันโดนคอลัมน์ (overflow) ตัด
 */
export function AssigneePicker({
  assignee,
  profiles,
  onAssign,
  label = "ผู้รับผิดชอบ",
}: {
  assignee: TaskWithAssignee["assignee"];
  profiles: ProfileOption[];
  onAssign: (profileId: string | null) => void;
  /** ชื่อบทบาทที่กำลังเลือก — การ์ด brief ใช้ "มอบหมายให้" */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuBox | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = (btn: HTMLElement) =>
    menuBox(btn, {
      width: 240,
      maxHeight: Math.min(48 * (profiles.length + 1) + 12, 280),
    });

  useAnchoredMenu({
    open,
    anchorRef: btnRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: (b) => setPos(place(b)),
  });

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) setPos(place(btnRef.current));
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={
          assignee
            ? `${label}: ${profileName(assignee)} — คลิกเพื่อเปลี่ยน`
            : `${label} — คลิกเพื่อเลือก`
        }
        aria-label={`เลือก${label}`}
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="cursor-pointer rounded-full transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <AssigneeAvatar
          assignee={assignee}
          title={
            assignee
              ? `${label}: ${profileName(assignee)} — คลิกเพื่อเปลี่ยน`
              : `${label} — คลิกเพื่อเลือก`
          }
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              left: pos.x,
              top: pos.y,
              width: pos.width,
              maxHeight: pos.height,
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed z-[60] overflow-y-auto overscroll-contain rounded-lg border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl animate-scale-in"
          >
            <button
              type="button"
              onClick={() => {
                onAssign(null);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-stone-500 transition-colors hover:bg-brand-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-stone-300" />
              ไม่ระบุ
              {!assignee && <Check size={14} className="ml-auto text-brand-600" />}
            </button>
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onAssign(p.id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-stone-700 transition-colors hover:bg-brand-50"
              >
                <AssigneeAvatar assignee={p} />
                <span className="min-w-0 truncate">{profileName(p)}</span>
                {assignee?.id === p.id && (
                  <Check size={14} className="ml-auto shrink-0 text-brand-600" />
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

/** ผู้ตรวจของทอดปัจจุบัน — ทอด 2 ใช้ผู้ตรวจลำดับ 2 (ถ้าโปรไฟล์ถูกลบ ตกกลับให้ลำดับ 1 ปิดงานได้)
    ทอด 1 มีได้ 2 คน (ผู้ตรวจร่วม reviewer1b) — ใครว่างคนนั้นกดอนุมัติได้ */
export function currentReviewerIds(task: TaskWithAssignee): string[] {
  if ((task.review_step ?? 1) >= 2) {
    const id = task.reviewer2_id ?? task.reviewer_id;
    return id == null ? [] : [id];
  }
  return [task.reviewer_id, task.reviewer1b_id].filter(
    (id): id is string => typeof id === "string"
  );
}

/** โปรไฟล์ผู้ตรวจของทอดปัจจุบัน (คนที่งาน "ค้างอยู่") — คู่กับ currentReviewerIds */
export function currentReviewerPersons(
  task: TaskWithAssignee
): NonNullable<TaskWithAssignee["reviewer"]>[] {
  if ((task.review_step ?? 1) >= 2) {
    const p = task.reviewer2 ?? task.reviewer ?? null;
    return p == null ? [] : [p];
  }
  return [task.reviewer, task.reviewer1b].filter(
    (p): p is NonNullable<TaskWithAssignee["reviewer"]> => p != null
  );
}

/** เวลาเริ่มรอของทอดปัจจุบัน — ทอด 2 นับจากตอนลำดับ 1 อนุมัติ, ทอด 1 นับจากตอนส่งตรวจ */
export function reviewWaitStart(task: TaskWithAssignee): string | null {
  if ((task.review_step ?? 1) >= 2) {
    return task.review1_approved_at ?? task.review_submitted_at;
  }
  return task.review_submitted_at;
}

/** ระยะเวลารอแบบอ่านง่าย เช่น "รอมา 2 วัน" / "รอมา 3 ชม." (null = ไม่รู้จุดเริ่ม ไม่แสดง) */
export function waitDurationLabel(sinceIso: string | null): string | null {
  if (!sinceIso) return null;
  const ms = Date.now() - Date.parse(sinceIso);
  if (Number.isNaN(ms) || ms < 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "รอไม่ถึง 1 ชม.";
  if (hours < 24) return `รอมา ${hours} ชม.`;
  return `รอมา ${Math.floor(hours / 24)} วัน`;
}

/** วงกลมบอกสถานะการตรวจงาน (read-only) — none = ว่าง, รอตรวจ = นาฬิกาเหลือง, ผ่าน = ติ๊กเขียว
    งานที่ตรวจ 2 ทอด (มีผู้ตรวจลำดับ 2) บอกทอดใน tooltip */
export function ReviewStatusDot({
  status,
  size = 18,
  reviewStep,
  hasChain = false,
}: {
  status: "none" | "pending" | "approved";
  size?: number;
  /** ทอดที่กำลังรอตรวจ (1|2) — ใช้คู่กับ hasChain */
  reviewStep?: number;
  /** งานนี้มีผู้ตรวจลำดับ 2 (ตรวจเป็นทอด) */
  hasChain?: boolean;
}) {
  const label =
    status === "approved"
      ? "เสร็จสมบูรณ์ (ผ่านการตรวจ)"
      : status === "pending"
        ? hasChain
          ? `รอตรวจ · ผู้ตรวจลำดับ ${reviewStep ?? 1}/2`
          : "รอตรวจ"
        : "ยังไม่ส่งตรวจ";
  return (
    <span
      title={label}
      aria-label={label}
      className={`flex shrink-0 items-center justify-center rounded-full border ${
        status === "approved"
          ? "border-emerald-500 bg-emerald-500 text-white"
          : status === "pending"
            ? "border-amber-400 bg-amber-50 text-amber-600"
            : "border-stone-300 bg-white text-transparent"
      }`}
      style={{ width: size, height: size }}
    >
      {status === "approved" ? (
        <Check size={size - 6} strokeWidth={3} />
      ) : status === "pending" ? (
        <Clock3 size={size - 6} strokeWidth={2.5} />
      ) : null}
    </span>
  );
}

/** ปุ่มวงกลมติ๊กเสร็จแบบ Asana */
export function CompleteToggle({
  completed,
  onToggle,
  size = 18,
}: {
  completed: boolean;
  onToggle?: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      title={completed ? "ทำเสร็จแล้ว — คลิกเพื่อยกเลิก" : "ทำเครื่องหมายว่าเสร็จ"}
      aria-label={completed ? "ยกเลิกทำเครื่องหมายว่าเสร็จ" : "ทำเครื่องหมายว่าเสร็จ"}
      aria-pressed={completed}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={`flex shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all duration-200 active:scale-90 ${
        completed
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-stone-300 bg-white text-transparent hover:border-emerald-400 hover:text-emerald-400"
      }`}
      style={{ width: size, height: size }}
    >
      <Check size={size - 6} strokeWidth={3} />
    </button>
  );
}

/* ---------- preview รูป/วิดีโอบนการ์ด ---------- */

/** cache signed URL ต่อ path — การ์ดถูก unmount/mount ระหว่างลากย้ายคอลัมน์ ไม่ต้องขอใหม่ทุกรอบ */
const signedUrlCache = new Map<string, { url: string; at: number }>();
const SIGNED_URL_CACHE_MS = 50 * 60 * 1000; // ขอใหม่ก่อน URL หมดอายุจริง (1 ชม.)

function useCachedSignedUrl(path: string): {
  url: string | null;
  failed: boolean;
} {
  const hit = signedUrlCache.get(path);
  const fresh =
    hit && Date.now() - hit.at < SIGNED_URL_CACHE_MS ? hit.url : null;
  const [url, setUrl] = useState<string | null>(fresh);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const cached = signedUrlCache.get(path);
    if (cached && Date.now() - cached.at < SIGNED_URL_CACHE_MS) {
      setUrl(cached.url);
      return;
    }
    let alive = true;
    const supabase = createClient();
    void supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .createSignedUrl(path, 3600)
      .then(
        ({ data }) => {
          if (data?.signedUrl) {
            signedUrlCache.set(path, { url: data.signedUrl, at: Date.now() });
          }
          if (alive) {
            setUrl(data?.signedUrl ?? null);
            // ขอ URL ไม่ได้ (เช่นไฟล์ถูกลบจาก bucket) — แสดง placeholder แทนโครงกำลังโหลดค้าง
            setFailed(!data?.signedUrl);
          }
        },
        () => {
          if (alive) setFailed(true);
        }
      );
    return () => {
      alive = false;
    };
  }, [path]);

  return { url, failed };
}

function CardMediaThumb({ file }: { file: TaskFileRow }) {
  // key ตาม path — ไฟล์เปลี่ยน = component ใหม่ สถานะ broken จึงรีเซ็ตเอง
  // (ก่อนหน้านี้ broken ค้างจากไฟล์เดิม ทำให้ไฟล์ใหม่ที่ปกติแสดงเป็น placeholder ไปด้วย)
  return <CardMediaThumbInner key={file.file_path} file={file} />;
}

function CardMediaThumbInner({ file }: { file: TaskFileRow }) {
  const { url, failed } = useCachedSignedUrl(file.file_path);
  const [broken, setBroken] = useState(false);
  if (failed || broken) {
    // ไฟล์เปิดไม่ได้ (ถูกลบจาก storage/ไฟล์เสีย) — placeholder นิ่ง ไม่ใช่โครงโหลดค้าง
    return (
      <div
        title={file.file_name ?? undefined}
        className="flex h-28 w-full items-center justify-center rounded-md bg-stone-100 text-stone-300"
      >
        <ImageIcon size={16} />
      </div>
    );
  }
  if (!url) {
    return <div className="h-28 w-full animate-pulse rounded-md bg-stone-100" />;
  }
  if (isVideoPath(file.file_path)) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-md bg-stone-100"
        title={file.file_name ?? "วิดีโอ"}
      >
        {/* กว้างเต็มการ์ด สูงตามสัดส่วนจริง — วิดีโอแสดงเต็มเฟรม ไม่ถูก crop */}
        <video
          src={url}
          className="h-auto w-full"
          muted
          playsInline
          preload="metadata"
          onError={() => setBroken(true)}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white shadow-sm">
            <Play size={14} className="ml-0.5 fill-white" />
          </span>
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={file.file_name ?? "ไฟล์งาน"}
      title={file.file_name ?? undefined}
      loading="lazy"
      onError={() => setBroken(true)}
      // ความกว้าง fix เต็มการ์ด สูง auto ตามสัดส่วนจริง — รูปแสดงเต็ม ไม่ถูกครอบตัด
      className="h-auto w-full rounded-md"
    />
  );
}

/** แถบ preview บนการ์ด — แสดงเฉพาะไฟล์แรกที่อัพ (เรียงตามเวลาอัพ) กว้างเต็มการ์ด สูงตามสัดส่วนจริง */
export function CardMediaPreview({ files }: { files: TaskFileRow[] }) {
  const media = files.filter(
    (f) => isImagePath(f.file_path) || isVideoPath(f.file_path)
  );
  if (media.length === 0) return null;
  // ไฟล์แรกที่กดอัพ = created_at น้อยสุด (ผูก id กันกรณีอัพพร้อมกันให้เลือกคงที่)
  const first = [...media].sort((a, b) => {
    const t = a.created_at.localeCompare(b.created_at);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  })[0];
  return (
    <div className="mt-2">
      <CardMediaThumb file={first} />
    </div>
  );
}

/** เนื้อการ์ด — ใช้ทั้งบนบอร์ดและใน DragOverlay */
export function TaskCardContent({
  task,
  today,
  overlay = false,
  selected = false,
  sectionType = "work",
  profiles,
  onAssign,
}: {
  task: TaskWithAssignee;
  today: string;
  overlay?: boolean;
  selected?: boolean;
  /** ชนิดเซคชันของการ์ด — 'brief' แสดงสถานะ รอรับงาน/รับแล้ว แทนสถานะตรวจ */
  sectionType?: "work" | "brief";
  /** ส่งมาเมื่อต้องการให้วงกลมผู้รับผิดชอบกดเลือกคนได้ (ไม่ส่ง = แสดงเฉยๆ เช่นใน DragOverlay) */
  profiles?: ProfileOption[];
  onAssign?: (profileId: string | null) => void;
}) {
  const overdue =
    task.due_date !== null &&
    !task.completed &&
    task.due_date.slice(0, 10) < today;
  const isBrief = sectionType === "brief";
  const isAccepted = task.brief_accepted_at !== null;
  // การ์ด creative ที่ถูกสร้างจากการรับ brief — ผู้รับผิดชอบล็อกเป็นผู้กดรับงาน (ไม่มีให้เลือกมอบหมาย)
  // ยกเว้นผู้รับหายไป (โปรไฟล์ถูกลบ → FK SET NULL) ให้เลือกใหม่ได้ ไม่งั้นงานติดล็อกถาวร
  const isFromBrief = task.brief_source_id !== null;
  const assigneeLocked = isFromBrief && task.assignee_id !== null;
  const contentTypeLabel = briefContentTypeLabel(task.brief_content_type);
  const showCategory = task.category && task.category !== DEFAULT_TASK_CATEGORY;
  const files = task.files ?? [];
  const mediaCount = files.filter(
    (f) => isImagePath(f.file_path) || isVideoPath(f.file_path)
  ).length;
  const otherFileCount = files.length - mediaCount;
  const influ = task.influencer;
  const influName = influ
    ? (influ.nickname ??
      [influ.first_name, influ.last_name].filter(Boolean).join(" "))
    : null;
  // งานรอตรวจ — บอกบนการ์ดเลยว่า "ค้างอยู่ที่ใคร" (ผู้ตรวจของทอดปัจจุบัน อาจมี 2 คน) + รอมานานเท่าไร
  const pendingReviewers =
    task.review_status === "pending" ? currentReviewerPersons(task) : [];
  const pendingWaitLabel =
    task.review_status === "pending"
      ? waitDurationLabel(reviewWaitStart(task))
      : null;

  return (
    <div
      className={`rounded-lg border bg-white/85 p-3 backdrop-blur-sm ${
        overlay
          ? "rotate-2 border-white/80 shadow-xl ring-1 ring-brand-200"
          : `shadow-sm transition-all duration-200 hover:shadow-md ${
              selected
                ? "border-brand-400 ring-1 ring-brand-300"
                : "border-white/80"
            }`
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          <ReviewStatusDot
            status={
              isBrief
                ? isAccepted
                  ? "approved"
                  : "none"
                : task.review_status
            }
            size={18}
            reviewStep={task.review_step ?? 1}
            hasChain={!isBrief && task.reviewer2_id !== null}
          />
        </div>
        <p
          className={`line-clamp-3 min-w-0 flex-1 text-sm font-medium leading-snug ${
            task.completed ? "text-stone-400 line-through" : "text-stone-900"
          }`}
        >
          {task.title}
        </p>
      </div>

      {/* preview รูป/วิดีโอ — แสดงใน overlay ด้วย (URL มี cache แล้ว) ให้ขนาดการ์ดตรงกับต้นทาง
          ไม่งั้น dnd-kit วัดความสูงจากการ์ดจริงแล้วการ์ดที่ลากลอยหลุดจากเมาส์ */}
      <CardMediaPreview files={files} />

      {/* แถวเดียว ชิดซ้ายสุด: ผู้รับผิดชอบ · สถานะ · วันที่ · หมวดหมู่ · influ (ไฟล์แนบดันขวา)
          การ์ด brief: [ผู้สร้าง (ผู้รับผิดชอบ)] → [มอบหมายให้] — ลูกศรบอกทิศทางการส่งงาน */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {isBrief && task.creator && (
          <>
            <AssigneeAvatar
              assignee={task.creator}
              title={`ผู้รับผิดชอบ: ${profileName(task.creator)} (ผู้สร้าง Brief)`}
            />
            <ArrowRight size={12} className="-mx-1 shrink-0 text-stone-300" />
          </>
        )}
        {profiles && onAssign && !assigneeLocked ? (
          <AssigneePicker
            assignee={task.assignee}
            profiles={profiles}
            onAssign={onAssign}
            label={isBrief ? "มอบหมายให้" : "ผู้รับผิดชอบ"}
          />
        ) : (
          <AssigneeAvatar
            assignee={task.assignee}
            title={
              isFromBrief && task.assignee
                ? `ผู้รับผิดชอบ: ${profileName(task.assignee)} (ผู้กดรับงานจาก Brief — เปลี่ยนไม่ได้)`
                : undefined
            }
          />
        )}
        {isBrief ? (
          <Badge
            className={
              isAccepted
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            {isAccepted ? "รับแล้ว" : "รอรับงาน"}
          </Badge>
        ) : (
          <>
            {task.review_status === "pending" && (
              <span
                title={`ค้างอยู่ที่ ${
                  pendingReviewers.length > 0
                    ? pendingReviewers.map(profileName).join(" หรือ ")
                    : "ผู้ตรวจ"
                }${pendingWaitLabel ? ` · ${pendingWaitLabel}` : ""}`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
              >
                {task.reviewer2_id
                  ? `รอตรวจ ${task.review_step ?? 1}/2`
                  : "รอตรวจ"}
                {pendingReviewers.length > 0 && (
                  <span className="inline-flex max-w-32 items-center gap-1">
                    <span className="opacity-60">·</span>
                    {pendingReviewers.map((p) => (
                      <AssigneeAvatar key={p.id} assignee={p} size={5} />
                    ))}
                    <span className="truncate">
                      {pendingReviewers.map(profileName).join(" / ")}
                    </span>
                  </span>
                )}
              </span>
            )}
            {task.review_status === "approved" && (
              <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                เสร็จ
              </Badge>
            )}
          </>
        )}
        {contentTypeLabel && (
          <Badge className="border border-sky-200 bg-sky-50 text-sky-700">
            {contentTypeLabel}
          </Badge>
        )}
        {task.due_date && (
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              overdue ? "font-medium text-rose-600" : "text-stone-500"
            }`}
          >
            {overdue && <AlertCircle size={13} />}
            {formatDate(task.due_date)}
          </span>
        )}
        {showCategory && (
          <Badge className={taskCategoryChipClass(task.category)}>
            {task.category}
          </Badge>
        )}
        {influName && (
          <Badge className="border border-brand-200 bg-brand-50 text-brand-700">
            <Sparkles size={10} /> {influName}
          </Badge>
        )}
        {otherFileCount > 0 && (
          <span
            title={`ไฟล์แนบอื่น ${otherFileCount} ไฟล์`}
            className="ml-auto inline-flex items-center gap-0.5 text-xs text-stone-400"
          >
            <Paperclip size={12} />
            {otherFileCount}
          </span>
        )}
      </div>

      {/* ผู้สร้างการ์ด — ผู้สร้างกับผู้ทำงานอาจคนละคน (การ์ดจาก brief = ผู้สั่ง brief) */}
      {task.creator && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <AssigneeAvatar
            assignee={task.creator}
            size={5}
            title={`ผู้สร้างการ์ด: ${profileName(task.creator)}`}
          />
          <span className="min-w-0 truncate text-[11px] text-stone-400">
            สร้างโดย {profileName(task.creator)}
          </span>
        </div>
      )}
    </div>
  );
}

/** การ์ดบนบอร์ด — ลากเรียง/ย้ายคอลัมน์ได้ คลิกหรือกด Enter เพื่อเปิดแผงรายละเอียด */
export function TaskCard({
  task,
  sectionId,
  sectionType,
  today,
  selected,
  onClick,
  profiles,
  onAssign,
  masonry = false,
}: {
  task: TaskWithAssignee;
  sectionId: string;
  sectionType: "work" | "brief";
  today: string;
  selected: boolean;
  onClick: () => void;
  profiles: ProfileOption[];
  onAssign: (profileId: string | null) => void;
  /** true = คอลัมน์อยู่โหมด masonry — การ์ดวัดความสูงเองแล้วกำหนดจำนวนแถวที่กิน (ปิดช่องว่างระหว่างแถว) */
  masonry?: boolean;
}) {
  const temp = isTempId(task.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", sectionId },
      disabled: temp,
    });

  // masonry: วัดความสูงจริงของการ์ด แล้วกำหนด grid-row span ให้พอดี → การ์ดแต่ละใบ
  // กินเนื้อที่ตามสูงจริง ไม่ต้องเท่าใบที่สูงสุดในแถว (ต้องคู่กับ grid-auto-rows:4px + items-start)
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const [rowSpan, setRowSpan] = useState<number>();
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      cardElRef.current = el;
    },
    [setNodeRef]
  );
  useIsoLayoutEffect(() => {
    if (!masonry) return;
    const el = cardElRef.current;
    if (!el) return;
    const ROW = 4; // = grid-auto-rows (px)
    const GAP = 8; // ช่องว่างแนวตั้งระหว่างการ์ด (px)
    const measure = () =>
      setRowSpan(
        Math.max(1, Math.ceil((el.getBoundingClientRect().height + GAP) / ROW))
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [masonry]);

  return (
    <div
      ref={setRefs}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        gridRowEnd: masonry && rowSpan ? `span ${rowSpan}` : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={temp ? undefined : onClick}
      onKeyDown={(e) => {
        // ส่งต่อให้ dnd-kit KeyboardSensor ก่อน (Space = ยก/วางการ์ด) แล้วค่อยจัดการ Enter เอง
        (
          listeners?.onKeyDown as React.KeyboardEventHandler | undefined
        )?.(e);
        if (e.key === "Enter" && !temp && !e.defaultPrevented) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`งาน ${task.title}`}
      data-task-id={task.id}
      className={`touch-manipulation rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        temp ? "pointer-events-none opacity-60" : "cursor-pointer"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <TaskCardContent
        task={task}
        today={today}
        selected={selected}
        sectionType={sectionType}
        profiles={temp ? undefined : profiles}
        onAssign={temp ? undefined : onAssign}
      />
    </div>
  );
}
