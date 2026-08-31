"use client";

import { AlertCircle, Image as ImageIcon, Play } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { isImagePath, isVideoPath, videoThumbSrc } from "@/lib/media";
import { useInView } from "@/lib/use-in-view";
import { useSignedUrl } from "@/lib/use-signed-url";
import type { TaskFileRow, TaskWithAssignee } from "@/lib/types";
import {
  AssigneeAvatar,
  isTempId,
  profileName,
  reviewStepOf,
} from "./task-card";

/* ============================================================================
   การ์ดโปสเตอร์ — ใช้ร่วมทุกที่ที่แสดงงานเป็นการ์ดรูป
   ----------------------------------------------------------------------------
   บอร์ดมือถือ (mobile-board) + คิวรอตรวจทั้งมือถือและจอใหญ่ (review-poster)
   หน้าตาเดียวกันหมด ต่างกันแค่ prop `size`:
   รูปเต็มใบ + avatar เจ้าของมุมซ้ายบน + ชิปมุมขวาบน + ชื่องานบนแถบ fade ท้ายการ์ด

   **แถบ fade เป็นสีขาว ทั้งหัวและท้ายการ์ด ตัวหนังสือจึงเป็นสีเข้ม** (ผู้ใช้ 2026-08-29:
   ชื่องาน/ชิปอ่านไม่ออกเมื่อวางบนอาร์ตเวิร์กที่สีจัดและมีตัวหนังสือเต็มใบ) —
   ขาวทึบที่ขอบแล้วจางหายเข้าไปในรูป + ชั้นเบลอเตี้ยๆ ซ้อนอีกชั้นให้ลายใต้ตัวหนังสือนิ่งลง
   **ห้ามยัดแถวชิปข้อมูลแบบการ์ดเดสก์ท็อปเดิมกลับเข้ามาในตัวการ์ด** — รายละเอียดทั้งหมด
   อยู่ในแผง/ชีตรายละเอียดที่เปิดตอนกดการ์ด (task-panel)
   ========================================================================== */

/** ไฟล์ที่ใช้เป็นรูปหน้าปก = ไฟล์รูป/วิดีโอที่อัพก่อนสุด (เกณฑ์เดียวกับ CardMediaPreview) */
export function coverFileOf(files: TaskFileRow[]): TaskFileRow | null {
  const media = files.filter(
    (f) => isImagePath(f.file_path) || isVideoPath(f.file_path)
  );
  if (media.length === 0) return null;
  return [...media].sort((a, b) => {
    const t = a.created_at.localeCompare(b.created_at);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  })[0];
}

/** พื้นหลังการ์ดที่ยังไม่มีไฟล์ — โทนแบรนด์อ่อน ให้แถบ fade ขาวที่ทับอยู่ยังกลมกลืน */
function CoverFallback() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-100 via-brand-200 to-brand-400">
      <ImageIcon size={30} className="text-white/60" />
    </span>
  );
}

function CoverMedia({ file }: { file: TaskFileRow }) {
  const { url, failed } = useSignedUrl(file.file_path);
  const [broken, setBroken] = useState(false);
  // วิดีโอโหลดเฉพาะใบที่เลื่อนมาถึง — บอร์ดที่มีวิดีโอเยอะจะชนโควตา media player
  // ของเบราว์เซอร์แล้วใบที่เกินไม่ขึ้นรูปเลย (ดู useInView)
  const [coverRef, inView] = useInView();

  if (failed || broken) return <CoverFallback />;
  if (!url) {
    return <span className="absolute inset-0 animate-pulse bg-stone-200" />;
  }
  if (isVideoPath(file.file_path)) {
    return (
      <span ref={coverRef} className="absolute inset-0 bg-stone-200">
        {inView && (
          <video
            src={videoThumbSrc(url)}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onError={() => setBroken(true)}
          />
        )}
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <Play size={15} className="ml-0.5 fill-white" />
        </span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={file.file_name ?? "ไฟล์งาน"}
      loading="lazy"
      onError={() => setBroken(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/** ชิปมุมขวาบน — พื้นทึบ ตัดกับแถบ fade ขาวที่อยู่ใต้มัน */
export function CardChip({
  tone = "neutral",
  children,
}: {
  tone?: "amber" | "emerald" | "rose" | "brand" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-500 text-white"
      : tone === "emerald"
        ? "bg-emerald-500 text-white"
        : tone === "rose"
          ? "bg-rose-500 text-white"
          : tone === "brand"
            ? "bg-brand-600 text-white"
            : "bg-white/90 text-stone-600 ring-1 ring-inset ring-stone-300";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-0.5 truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none shadow-sm ${cls}`}
    >
      {children}
    </span>
  );
}

export function PosterCard({
  task,
  today,
  selected,
  size = "sm",
  isBrief = false,
  owner,
  topRight,
  note,
  ariaLabel,
  onClick,
}: {
  task: TaskWithAssignee;
  today: string;
  selected: boolean;
  /** sm = การ์ด 2 คอลัมน์บนมือถือ · md = การ์ดของจอกว้าง (ตัวหนังสือ/ระยะขอบโตขึ้น) */
  size?: "sm" | "md";
  /** เซคชัน brief — ชิปเริ่มต้นเปลี่ยนเป็น รอรับงาน/รับแล้ว */
  isBrief?: boolean;
  /** วงกลมมุมซ้ายบน — ไม่ส่ง = ผู้รับผิดชอบ (brief ใช้ผู้สั่ง) */
  owner?: TaskWithAssignee["assignee"];
  /** แทนชิปสถานะเริ่มต้นมุมขวาบน (เช่นคิวรอตรวจใช้ชิปรอมา/ลำดับแทน) */
  topRight?: React.ReactNode;
  /** บรรทัดเล็กใต้ชื่องาน ในแถบ fade */
  note?: React.ReactNode;
  ariaLabel?: string;
  onClick: () => void;
}) {
  const temp = isTempId(task.id);
  const cover = coverFileOf(task.files ?? []);
  const big = size === "md";
  const overdue =
    task.due_date !== null &&
    !task.completed &&
    task.due_date.slice(0, 10) < today;
  // การ์ด brief บอกแค่ "รอรับงาน/รับแล้ว", งานปกติบอกสถานะตรวจ — ใบละไม่เกิน 2 ชิป
  const status = isBrief
    ? task.brief_accepted_at !== null
      ? { tone: "emerald" as const, label: "รับแล้ว" }
      : { tone: "amber" as const, label: "รอรับงาน" }
    : task.review_status === "approved"
      ? { tone: "emerald" as const, label: "เสร็จ" }
      : task.review_status === "pending"
        ? {
            tone: "amber" as const,
            // ทอด 0 = ผู้สั่ง brief ตรวจก่อน (migration 0098) — อ่านเลขทอดผ่าน
            // reviewStepOf เสมอ ห้ามอ่าน task.review_step ดิบ
            label:
              reviewStepOf(task) <= 0
                ? "รอผู้สั่ง brief"
                : task.reviewer2_id
                  ? `รอตรวจ ${reviewStepOf(task)}/2`
                  : "รอตรวจ",
          }
        : null;
  const avatar =
    owner !== undefined
      ? owner
      : isBrief
        ? (task.creator ?? task.assignee)
        : task.assignee;

  return (
    <button
      type="button"
      onClick={temp ? undefined : onClick}
      disabled={temp}
      data-task-id={task.id}
      aria-label={ariaLabel ?? `งาน ${task.title}`}
      className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-stone-200 text-left shadow-sm transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.97] ${
        selected ? "ring-2 ring-brand-500" : "ring-1 ring-black/5"
      } ${temp ? "opacity-60" : "cursor-pointer"}`}
    >
      {cover ? <CoverMedia file={cover} /> : <CoverFallback />}

      {/* งานที่ทำเสร็จแล้ว — ทำรูปให้จางลงนิดหน่อยแทนการขีดฆ่าชื่อ */}
      {task.completed && (
        <span className="absolute inset-0 bg-white/25" aria-hidden />
      )}

      {/* ---- fade ขาว "หัวการ์ด" — รองรับ avatar + ชิปสถานะ ----
          ความสูงเป็นหน่วยคงที่ ไม่ใช่ % ของการ์ด: แถบนี้มีหน้าที่รองแค่ avatar/ชิป
          ซึ่งสูงเท่ากันทุกขนาดจอ — ใช้ % แล้วการ์ดใบใหญ่บนจอกว้างจะโดนฟอกขาวเกินจำเป็น */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-white via-white/60 to-transparent ${
          big ? "h-20" : "h-16"
        }`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 backdrop-blur-[3px] [mask-image:linear-gradient(to_bottom,black,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black,transparent)] ${
          big ? "h-10" : "h-8"
        }`}
      />

      {/* ---- fade ขาว "ท้ายการ์ด" — รองรับชื่องาน 2 บรรทัด + บรรทัดเสริม ----
          ชั้นไล่สีสูงกว่า (ให้ตัวหนังสืออยู่บนพื้นที่เกือบทึบ) + ชั้นเบลอเตี้ย
          ที่ mask ให้เข้มสุดตรงขอบล่างแล้วจางขึ้น — ลายอาร์ตเวิร์กใต้ชื่อจึงนิ่งลง
          (ความสูงคงที่ตามความสูงของข้อความจริง ด้วยเหตุผลเดียวกับแถบหัวการ์ด) */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/90 to-transparent ${
          big ? "h-28" : "h-24"
        }`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 backdrop-blur-[4px] [mask-image:linear-gradient(to_top,black,transparent)] [-webkit-mask-image:linear-gradient(to_top,black,transparent)] ${
          big ? "h-14" : "h-12"
        }`}
      />

      {/* วงกลมเจ้าของงาน มุมซ้ายบน */}
      <span
        className={`absolute rounded-full shadow-sm ring-2 ring-white ${
          big ? "left-3 top-3" : "left-2 top-2"
        }`}
      >
        <AssigneeAvatar
          assignee={avatar ?? null}
          size={big ? 8 : 7}
          title={avatar ? `เจ้าของงาน: ${profileName(avatar)}` : undefined}
        />
      </span>

      {/* ชิปมุมขวาบน */}
      <span
        className={`absolute flex max-w-[70%] flex-col items-end gap-1 ${
          big ? "right-3 top-3" : "right-2 top-2"
        }`}
      >
        {topRight ?? (
          <>
            {status && <CardChip tone={status.tone}>{status.label}</CardChip>}
            {overdue && task.due_date && (
              <CardChip tone="rose">
                <AlertCircle size={10} />
                {formatDate(task.due_date)}
              </CardChip>
            )}
          </>
        )}
      </span>

      {/* ชื่องาน (+ บรรทัดเสริม) — วางบนแถบ fade ขาว จึงเป็นตัวหนังสือสีเข้ม
          เงาขาวบางๆ กันกรณีตัวหนังสือล้นขึ้นไปช่วงที่ fade ยังไม่ทึบเต็มที่ */}
      <span
        className={`absolute inset-x-0 bottom-0 block ${
          big ? "px-3.5 pb-3 pt-7" : "px-2.5 pb-2.5 pt-6"
        }`}
      >
        <span
          className={`line-clamp-2 block font-semibold leading-snug text-stone-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] ${
            big ? "text-sm" : "text-[13px]"
          }`}
        >
          {task.title}
        </span>
        {note && (
          <span
            className={`mt-1 flex items-center gap-1 font-medium leading-none text-stone-600 drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] ${
              big ? "text-[11px]" : "text-[10px]"
            }`}
          >
            {note}
          </span>
        )}
      </span>
    </button>
  );
}
