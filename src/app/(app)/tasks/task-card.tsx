"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Check,
  Clock3,
  Image as ImageIcon,
  Paperclip,
  Play,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui";
import {
  DEFAULT_TASK_CATEGORY,
  STORAGE_BUCKET_DOCUMENTS,
  TASK_PRIORITY,
  taskCategoryChipClass,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ProfileRow, TaskFileRow, TaskWithAssignee } from "@/lib/types";

export type ProfileOption = Pick<ProfileRow, "id" | "full_name" | "email">;

/* เฉพาะฟอร์แมตที่ Chrome/Edge เปิดได้จริง — .heic/.avi ไม่รองรับ ให้ตกไปเป็นไฟล์แนบธรรมดา */
export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(path);
}

export function isVideoPath(path: string): boolean {
  return /\.(mp4|mov|webm|m4v)$/i.test(path);
}

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
}: {
  assignee: { full_name: string | null; email: string | null } | null;
  size?: 6 | 7 | 8;
}) {
  const dim = size === 8 ? "h-8 w-8" : size === 7 ? "h-7 w-7" : "h-6 w-6";
  if (!assignee) {
    return (
      <span
        title="ยังไม่ระบุผู้รับผิดชอบ"
        className={`flex ${dim} shrink-0 items-center justify-center rounded-full border-2 border-dashed border-stone-300`}
      />
    );
  }
  const name = profileName(assignee);
  return (
    <span
      title={name}
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
}: {
  assignee: TaskWithAssignee["assignee"];
  profiles: ProfileOption[];
  onAssign: (profileId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    // เลื่อนจอ/ย่อขยายหน้าต่างแล้วปิดเมนู — ตำแหน่ง fixed จะค้างผิดที่
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuH = Math.min(44 * (profiles.length + 1) + 12, 280);
      setPos({
        x: Math.min(r.left, window.innerWidth - 240),
        y:
          r.bottom + menuH > window.innerHeight - 8
            ? Math.max(8, r.top - menuH - 4)
            : r.bottom + 4,
      });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={assignee ? `ผู้รับผิดชอบ: ${profileName(assignee)} — คลิกเพื่อเปลี่ยน` : "กำหนดผู้รับผิดชอบ"}
        aria-label="เลือกผู้รับผิดชอบ"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="cursor-pointer rounded-full transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <AssigneeAvatar assignee={assignee} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ left: pos.x, top: pos.y }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed z-[60] max-h-72 w-56 overflow-y-auto rounded-lg border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl animate-scale-in"
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

/** วงกลมบอกสถานะการตรวจงาน (read-only) — none = ว่าง, รอตรวจ = นาฬิกาเหลือง, ผ่าน = ติ๊กเขียว */
export function ReviewStatusDot({
  status,
  size = 18,
}: {
  status: "none" | "pending" | "approved";
  size?: number;
}) {
  const label =
    status === "approved"
      ? "เสร็จสมบูรณ์ (ผ่านการตรวจ)"
      : status === "pending"
        ? "รอตรวจ"
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

function CardMediaThumb({
  file,
  variant,
}: {
  file: TaskFileRow;
  /** natural = ไฟล์เดี่ยวเต็มความกว้าง สูงยืดตามสัดส่วนจริงของรูป (รูปแนวตั้งไม่ถูก crop),
      tile = ช่องใน grid หลายไฟล์ สูงคงที่ crop กลาง */
  variant: "natural" | "tile";
}) {
  const { url, failed } = useCachedSignedUrl(file.file_path);
  const [broken, setBroken] = useState(false);
  const height = variant === "natural" ? "h-28" : "h-16";
  if (failed || broken) {
    // ไฟล์เปิดไม่ได้ (ถูกลบจาก storage/ไฟล์เสีย) — placeholder นิ่ง ไม่ใช่โครงโหลดค้าง
    return (
      <div
        title={file.file_name ?? undefined}
        className={`flex ${height} w-full items-center justify-center rounded-md bg-stone-100 text-stone-300`}
      >
        <ImageIcon size={16} />
      </div>
    );
  }
  if (!url) {
    return (
      <div className={`${height} w-full animate-pulse rounded-md bg-stone-100`} />
    );
  }
  if (isVideoPath(file.file_path)) {
    return (
      <div
        className={`relative ${height} w-full overflow-hidden rounded-md bg-stone-100`}
        title={file.file_name ?? "วิดีโอ"}
      >
        <video
          src={url}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setBroken(true)}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white shadow-sm">
            <Play size={13} className="ml-0.5 fill-white" />
          </span>
        </span>
      </div>
    );
  }
  if (variant === "natural") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={file.file_name ?? "ไฟล์งาน"}
        title={file.file_name ?? undefined}
        loading="lazy"
        onError={() => setBroken(true)}
        // กว้างเต็มการ์ดคงที่ สูงตามสัดส่วนจริง — รูปแนวตั้งแสดงเต็มไม่โดน crop
        // (480px ครอบคลุมถึงสัดส่วน ~1:2 ที่ความกว้างคอลัมน์บอร์ด) รูปยาวกว่านั้น
        // เช่น screenshot แชทยาวๆ ถูก crop กลางด้วย object-cover เฉพาะตอนชนเพดาน
        className="h-auto max-h-[480px] w-full rounded-md object-cover"
      />
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
      className={`${height} w-full rounded-md object-cover`}
    />
  );
}

/** แถบ preview บนการ์ด — 1 ไฟล์แสดงเต็มความกว้างสูงตามสัดส่วนจริง, หลายไฟล์เรียง grid 2 คอลัมน์ (สูงสุด 4 + ป้ายจำนวนที่เหลือ) */
function CardMediaPreview({ files }: { files: TaskFileRow[] }) {
  const media = files.filter(
    (f) => isImagePath(f.file_path) || isVideoPath(f.file_path)
  );
  if (media.length === 0) return null;
  if (media.length === 1) {
    return (
      <div className="mt-2">
        <CardMediaThumb file={media[0]} variant="natural" />
      </div>
    );
  }
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;
  return (
    <div className="mt-2 grid grid-cols-2 gap-1">
      {shown.map((f, i) => (
        <div key={f.id} className="relative">
          <CardMediaThumb file={f} variant="tile" />
          {extra > 0 && i === shown.length - 1 && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/45 text-sm font-bold text-white">
              +{extra}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** เนื้อการ์ด — ใช้ทั้งบนบอร์ดและใน DragOverlay */
export function TaskCardContent({
  task,
  today,
  overlay = false,
  selected = false,
  profiles,
  onAssign,
}: {
  task: TaskWithAssignee;
  today: string;
  overlay?: boolean;
  selected?: boolean;
  /** ส่งมาเมื่อต้องการให้วงกลมผู้รับผิดชอบกดเลือกคนได้ (ไม่ส่ง = แสดงเฉยๆ เช่นใน DragOverlay) */
  profiles?: ProfileOption[];
  onAssign?: (profileId: string | null) => void;
}) {
  const overdue =
    task.due_date !== null &&
    !task.completed &&
    task.due_date.slice(0, 10) < today;
  const showCategory = task.category && task.category !== DEFAULT_TASK_CATEGORY;
  const showPriority = task.priority === "high" || task.priority === "urgent";
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
          <ReviewStatusDot status={task.review_status} size={18} />
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

      {(showCategory ||
        showPriority ||
        task.review_status !== "none" ||
        influName) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
          {task.review_status === "pending" && (
            <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
              รอตรวจ
            </Badge>
          )}
          {task.review_status === "approved" && (
            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
              เสร็จสมบูรณ์
            </Badge>
          )}
          {showCategory && (
            <Badge className={taskCategoryChipClass(task.category)}>
              {task.category}
            </Badge>
          )}
          {showPriority && (
            <Badge className={TASK_PRIORITY[task.priority].badge}>
              {TASK_PRIORITY[task.priority].label}
            </Badge>
          )}
          {influName && (
            <Badge className="border border-brand-200 bg-brand-50 text-brand-700">
              <Sparkles size={10} /> {influName}
            </Badge>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 pl-6">
        {profiles && onAssign ? (
          <AssigneePicker
            assignee={task.assignee}
            profiles={profiles}
            onAssign={onAssign}
          />
        ) : (
          <AssigneeAvatar assignee={task.assignee} />
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
    </div>
  );
}

/** การ์ดบนบอร์ด — ลากเรียง/ย้ายคอลัมน์ได้ คลิกหรือกด Enter เพื่อเปิดแผงรายละเอียด */
export function TaskCard({
  task,
  sectionId,
  today,
  selected,
  onClick,
  profiles,
  onAssign,
}: {
  task: TaskWithAssignee;
  sectionId: string;
  today: string;
  selected: boolean;
  onClick: () => void;
  profiles: ProfileOption[];
  onAssign: (profileId: string | null) => void;
}) {
  const temp = isTempId(task.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", sectionId },
      disabled: temp,
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
      className={`touch-manipulation rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        temp ? "pointer-events-none opacity-60" : "cursor-pointer"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <TaskCardContent
        task={task}
        today={today}
        selected={selected}
        profiles={temp ? undefined : profiles}
        onAssign={temp ? undefined : onAssign}
      />
    </div>
  );
}
