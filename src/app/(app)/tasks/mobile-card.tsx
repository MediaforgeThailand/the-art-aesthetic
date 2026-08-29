"use client";

import { AlertCircle, Image as ImageIcon, Play } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { isImagePath, isVideoPath } from "@/lib/media";
import type { TaskFileRow, TaskWithAssignee } from "@/lib/types";
import { AssigneeAvatar, isTempId, profileName, useCachedSignedUrl } from "./task-card";

/* ============================================================================
   การ์ดโปสเตอร์ของมือถือ (<lg) — ใช้ร่วมทุกแท็บ
   ----------------------------------------------------------------------------
   หน้าตาเดียวกันทั้งบอร์ด (mobile-board) และคิวรอตรวจ (mobile-review):
   รูปเต็มใบ + avatar เจ้าของมุมซ้ายบน + ชิปมุมขวาบน + ชื่องานบนแถบ fade/blur ท้ายการ์ด
   **ห้ามยัดแถวชิปข้อมูลแบบการ์ดเดสก์ท็อปกลับเข้ามา** — รายละเอียด/ปุ่มลงมือทำทั้งหมด
   อยู่ในชีตตั้งค่าที่เลื่อนขึ้นมาตอนกดการ์ด (task-panel)
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

/** พื้นหลังการ์ดที่ยังไม่มีไฟล์ — โทนแบรนด์ "เข้มพอ" ให้ตัวหนังสือขาวบนแถบ fade อ่านออกเหมือนกันทุกใบ */
function CoverFallback() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-200 via-brand-400 to-brand-600">
      <ImageIcon size={30} className="text-white/40" />
    </span>
  );
}

function CoverMedia({ file }: { file: TaskFileRow }) {
  const { url, failed } = useCachedSignedUrl(file.file_path);
  const [broken, setBroken] = useState(false);

  if (failed || broken) return <CoverFallback />;
  if (!url) {
    return <span className="absolute inset-0 animate-pulse bg-stone-200" />;
  }
  if (isVideoPath(file.file_path)) {
    return (
      <>
        <video
          src={url}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setBroken(true)}
        />
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <Play size={15} className="ml-0.5 fill-white" />
        </span>
      </>
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

/** ชิปมุมขวาบน — พื้นทึบ + เบลอนิดเดียว ให้อ่านออกบนรูปทุกแบบ */
export function CardChip({
  tone = "neutral",
  children,
}: {
  tone?: "amber" | "emerald" | "rose" | "brand" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/90 text-white"
      : tone === "emerald"
        ? "bg-emerald-500/90 text-white"
        : tone === "rose"
          ? "bg-rose-500/90 text-white"
          : tone === "brand"
            ? "bg-brand-600/90 text-white"
            : "bg-black/45 text-white";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-0.5 truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none backdrop-blur-sm ${cls}`}
    >
      {children}
    </span>
  );
}

export function PosterCard({
  task,
  today,
  selected,
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
            label: task.reviewer2_id
              ? `รอตรวจ ${task.review_step ?? 1}/2`
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

      {/* fade + blur ท้ายการ์ด — ทำ 2 ชั้น: ชั้นไล่สีสูงกว่าเพื่อรองรับชื่อ 2 บรรทัด,
          ชั้นเบลอเตี้ย ~15% ของความสูงตามที่ออกแบบไว้ (mask ให้เบลอเข้มสุดที่ขอบล่างแล้วจางขึ้น)
          via-black/25 (ไม่ใช่ /45) — จุดกึ่งกลางที่ทึบเกินทำให้ครึ่งล่างของ "รูป" กลายเป็น
          แผ่นดำ การ์ดทั้งใบดูเป็นกล่องมืดแทนที่จะเป็นรูป */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/85 via-black/25 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[15%] backdrop-blur-[3px] [mask-image:linear-gradient(to_top,black,transparent)] [-webkit-mask-image:linear-gradient(to_top,black,transparent)]"
      />

      {/* วงกลมเจ้าของงาน มุมซ้ายบน */}
      <span className="absolute left-2 top-2 rounded-full ring-2 ring-white/70">
        <AssigneeAvatar
          assignee={avatar ?? null}
          size={7}
          title={avatar ? `เจ้าของงาน: ${profileName(avatar)}` : undefined}
        />
      </span>

      {/* ชิปมุมขวาบน */}
      <span className="absolute right-2 top-2 flex max-w-[70%] flex-col items-end gap-1">
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

      {/* ชื่องาน (+ บรรทัดเสริม) — วางบนแถบ fade, สีตัดกับพื้นมืด */}
      <span className="absolute inset-x-0 bottom-0 block px-2.5 pb-2.5 pt-6">
        <span className="line-clamp-2 block text-[13px] font-semibold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]">
          {task.title}
        </span>
        {note && (
          <span className="mt-1 flex items-center gap-1 text-[10px] font-medium leading-none text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]">
            {note}
          </span>
        )}
      </span>
    </button>
  );
}
