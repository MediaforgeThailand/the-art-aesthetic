"use client";

/**
 * ลิงก์ไฟล์ Source ของ influencer (Google Drive ฯลฯ — ตาราง influ_links)
 * — `InfluLinksCard`: การ์ดจัดการลิงก์ในหน้า detail (เพิ่ม/ลบ + กดเปิดแท็บใหม่)
 *   แก้ได้เสมอแม้เคสปิดงานแล้ว — เป็นคลังไฟล์อ้างอิง ไม่ใช่สถานะงาน
 * — `SourceLinkQuickButton`: ปุ่มจิ๋วบนการ์ดบอร์ด/แกลเลอรี เปิดลิงก์แรกได้ทันที
 *   (การ์ดพวกนั้นคลิกแล้วนำทางไปหน้าอื่น — ปุ่มนี้ stopPropagation + window.open เอง)
 */

import { ExternalLink, FolderOpen, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { InfluLinkRow } from "@/lib/types";

/** คอลัมน์ที่หน้า list ใช้ (บอร์ด/แกลเลอรี ไม่ต้องดึงครบทุกคอลัมน์) */
export type InfluLinkLite = Pick<
  InfluLinkRow,
  "id" | "influencer_id" | "title" | "url"
>;

/** ป้ายของลิงก์ — ไม่ตั้งชื่อ = ใช้ hostname (เช่น drive.google.com) */
export function linkLabel(l: Pick<InfluLinkLite, "title" | "url">): string {
  const t = l.title?.trim();
  if (t) return t;
  try {
    return new URL(l.url).hostname.replace(/^www\./, "");
  } catch {
    return l.url;
  }
}

/** เติม https:// ให้ลิงก์ที่วางมาแบบไม่มี scheme แล้วเช็คว่าเป็น URL จริง — คืน null ถ้าใช้ไม่ได้ */
function normalizeUrl(raw: string): string | null {
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
      className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 active:scale-[0.97]"
    >
      <FolderOpen size={11} className="shrink-0" />
      <span className="truncate">ไฟล์ Source</span>
      {links.length > 1 && <span>({links.length})</span>}
    </button>
  );
}

/* ---------- การ์ดจัดการลิงก์ (หน้า detail — แท็บภาพรวม) ---------- */

export function InfluLinksCard({
  influencerId,
  initialLinks,
}: {
  influencerId: string;
  initialLinks: InfluLinkRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<InfluLinkRow[]>(initialLinks);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (busy) return;
    setErr(null);
    const clean = normalizeUrl(url);
    if (!clean) {
      setErr("ลิงก์ไม่ถูกต้อง — วางลิงก์เต็มจาก Google Drive (ขึ้นต้น https://)");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("influ_links")
      .insert({
        influencer_id: influencerId,
        title: title.trim() || null,
        url: clean,
        position: Math.max(0, ...links.map((l) => l.position)) + 1,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error || !data) {
      setErr(`เพิ่มลิงก์ไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setLinks((prev) => [...prev, data as InfluLinkRow]);
    setTitle("");
    setUrl("");
    router.refresh();
  };

  const remove = (id: string) => {
    setErr(null);
    const prevLinks = links;
    setLinks((prev) => prev.filter((l) => l.id !== id)); // optimistic
    void supabase
      .from("influ_links")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          // คืนลิงก์กลับมา — ไม่งั้นจอบอกว่าลบแล้วทั้งที่ยังอยู่ใน DB (หายไปจนกว่าจะรีเฟรช)
          setLinks(prevLinks);
          setErr(`ลบลิงก์ไม่สำเร็จ: ${error.message}`);
        } else router.refresh();
      });
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <FolderOpen size={16} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-stone-900">
          ไฟล์ Source (Google Drive)
        </h3>
        {links.length > 0 && (
          <span className="text-xs text-stone-400">{links.length} ลิงก์</span>
        )}
      </div>

      {links.length === 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-stone-300 bg-white/50 px-3 py-3 text-center text-xs text-stone-400">
          ยังไม่มีลิงก์ — วางลิงก์โฟลเดอร์ Google Drive ของไฟล์ source
          (รูป/วิดีโอต้นฉบับ) ไว้ที่นี่ ทีมจะได้เปิดหาไฟล์ได้ทันที
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-1.5">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.url}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-700 transition-colors hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-800"
              >
                <FolderOpen size={15} className="shrink-0 text-brand-500" />
                <span className="min-w-0 flex-1 truncate">{linkLabel(l)}</span>
                <ExternalLink size={13} className="shrink-0 text-stone-300" />
              </a>
              <button
                type="button"
                title="ลบลิงก์นี้"
                aria-label={`ลบลิงก์ ${linkLabel(l)}`}
                onClick={() => remove(l.id)}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90 sm:h-8 sm:w-8"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ฟอร์มเพิ่มลิงก์ — เปิดตลอดแม้เคสปิดงานแล้ว (คลังไฟล์อ้างอิง ไม่ใช่สถานะงาน) */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่อกำกับ เช่น รูป Before/After (ไม่บังคับ)"
          className="w-full sm:w-56"
          maxLength={80}
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="วางลิงก์ Google Drive..."
          className="min-w-0 flex-1"
        />
        <Button
          variant="secondary"
          loading={busy}
          disabled={url.trim() === ""}
          onClick={() => void add()}
        >
          <Plus size={15} />
          เพิ่ม
        </Button>
      </div>

      {err && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}
    </Card>
  );
}
