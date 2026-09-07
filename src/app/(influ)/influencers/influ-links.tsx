"use client";

/**
 * ลิงก์ไฟล์ Source ของ influencer (Google Drive ฯลฯ — ตาราง influ_links)
 * — `SourceLinkQuickButton`: ปุ่มจิ๋วบนการ์ดบอร์ด/แกลเลอรี เปิดลิงก์แรกได้ทันที
 *   (การ์ดพวกนั้นคลิกแล้วนำทางไปหน้าอื่น — ปุ่มนี้ stopPropagation + window.open เอง)
 * — `normalizeUrl`: เติม https:// + ตรวจ URL ก่อนบันทึก (หน้า Follow Up ใช้กับลิงก์โพสด้วย)
 * (การ์ดจัดการลิงก์ในหน้าเคส `InfluLinksCard` ถูกถอดออกเมื่อ 2026-09-07 และลบโค้ดตอนเก็บกวาด 2026-09-08)
 */

import { FolderOpen } from "lucide-react";
import type { InfluLinkRow } from "@/lib/types";

/** คอลัมน์ที่หน้า list ใช้ (บอร์ด/แกลเลอรี ไม่ต้องดึงครบทุกคอลัมน์) */
export type InfluLinkLite = Pick<
  InfluLinkRow,
  "id" | "influencer_id" | "title" | "url"
>;

/** ป้ายของลิงก์ — ไม่ตั้งชื่อ = ใช้ hostname (เช่น drive.google.com) */
function linkLabel(l: Pick<InfluLinkLite, "title" | "url">): string {
  const t = l.title?.trim();
  if (t) return t;
  try {
    return new URL(l.url).hostname.replace(/^www\./, "");
  } catch {
    return l.url;
  }
}

/** เติม https:// ให้ลิงก์ที่วางมาแบบไม่มี scheme แล้วเช็คว่าเป็น URL จริง — คืน null ถ้าใช้ไม่ได้
    (ใช้ร่วมกับการ์ดลิงก์โพสในขั้นตามงาน — post-links.tsx) */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/* ---------- ปุ่มเปิดเร็วบนการ์ด (บอร์ด Influ Management / แกลเลอรี) ---------- */

export function SourceLinkQuickButton({
  links,
  compact = false,
}: {
  links: InfluLinkLite[] | undefined;
  /** true = ปุ่มไอคอนล้วน (แถวปุ่มบนการ์ดบอร์ด) */
  compact?: boolean;
}) {
  if (!links || links.length === 0) return null;
  const first = links[0];
  const label = linkLabel(first);
  const title = `เปิดไฟล์ Source: ${label}${
    links.length > 1 ? ` (มี ${links.length} ลิงก์ — ที่เหลือดูในหน้าเดินงาน)` : ""
  }`;
  // การ์ดแม่เป็นตัวคลิก/ลากอยู่แล้ว — ปุ่มนี้ต้องกันอีเวนต์ไม่ให้ทะลุไปเปิดหน้า detail
  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const open = (e: React.MouseEvent) => {
    stop(e);
    window.open(first.url, "_blank", "noopener,noreferrer");
  };
  if (compact)
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={open}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-brand-50 hover:text-brand-600 active:scale-90 sm:h-7 sm:w-7"
      >
        <FolderOpen size={16} />
      </button>
    );
  return (
    <button
      type="button"
      title={title}
      onClick={open}
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 active:scale-[0.97] max-sm:min-h-11"
    >
      <FolderOpen size={11} className="shrink-0" />
      <span className="truncate">ไฟล์ Source</span>
      {links.length > 1 && <span>({links.length})</span>}
    </button>
  );
}

