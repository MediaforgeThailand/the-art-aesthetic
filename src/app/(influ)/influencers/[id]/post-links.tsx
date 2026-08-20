"use client";

/**
 * ลิงก์โพส/คอมเมนต์ที่ influencer ลงจริง (ตาราง influ_post_links) —
 * การ์ดบนสุดของขั้น "ตามงาน" (stage 5): ทีมแปะลิงก์คลิปรีวิว/โพส และลิงก์คอมเมนต์รีวิว
 * ได้หลายลิงก์ต่อคน พร้อมโน้ตกำกับ (เช่น "คลิปรีวิวหลัก TikTok")
 * แก้ได้เสมอแม้เคสปิดงานแล้ว — เป็นคลังผลงานอ้างอิง ไม่ใช่สถานะงาน
 * (สิทธิ์ team ที่เข้ามาดูจากแกลเลอรี = เปิดลิงก์ได้อย่างเดียว)
 */

import { ExternalLink, Link2, MessageCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import {
  INFLU_POST_KIND_ORDER,
  INFLU_POST_KINDS,
  postPlatformLabel,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluPostKind, InfluPostLinkRow } from "@/lib/types";
import { normalizeUrl } from "../influ-links";

export function PostLinksCard({
  influencerId,
  initialLinks,
  readOnly = false,
}: {
  influencerId: string;
  initialLinks: InfluPostLinkRow[];
  /** true = เปิดลิงก์ได้อย่างเดียว (สิทธิ์ team ที่เข้ามาดูจากแกลเลอรี) */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<InfluPostLinkRow[]>(initialLinks);
  const [kind, setKind] = useState<InfluPostKind>("post");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const postCount = links.filter((l) => l.kind === "post").length;
  const commentCount = links.length - postCount;

  const add = async () => {
    if (busy) return;
    setErr(null);
    const clean = normalizeUrl(url);
    if (!clean) {
      setErr("ลิงก์ไม่ถูกต้อง — วางลิงก์เต็มของโพส/คอมเมนต์ (ขึ้นต้น https://)");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("influ_post_links")
      .insert({
        influencer_id: influencerId,
        kind,
        url: clean,
        note: note.trim() || null,
        position: Math.max(0, ...links.map((l) => l.position)) + 1,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error || !data) {
      setErr(`เพิ่มลิงก์ไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setLinks((prev) => [...prev, data as InfluPostLinkRow]);
    setUrl("");
    setNote("");
    router.refresh();
  };

  const remove = (id: string) => {
    setErr(null);
    const prevLinks = links;
    setLinks((prev) => prev.filter((l) => l.id !== id)); // optimistic
    void supabase
      .from("influ_post_links")
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link2 size={16} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-stone-900">
          ลิงก์โพสของ Influ
        </h3>
        {postCount > 0 && (
          <span className="text-xs text-stone-400">{postCount} โพส</span>
        )}
        {commentCount > 0 && (
          <span className="text-xs text-stone-400">
            {commentCount} คอมเมนต์
          </span>
        )}
      </div>

      {links.length === 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-stone-300 bg-white/50 px-3 py-3 text-center text-xs text-stone-400">
          ยังไม่มีลิงก์ — แปะลิงก์คลิป/โพสรีวิวที่ influ ลงจริง
          และลิงก์คอมเมนต์รีวิว เก็บไว้ตรวจงาน/วัดผลได้ที่นี่
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {links.map((l) => {
            const meta = INFLU_POST_KINDS[l.kind];
            return (
              <li key={l.id} className="flex items-center gap-1.5">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.url}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-700 transition-colors hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-800"
                >
                  {l.kind === "comment" ? (
                    <MessageCircle size={15} className="shrink-0 text-amber-500" />
                  ) : (
                    <Link2 size={15} className="shrink-0 text-sky-500" />
                  )}
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.chip}`}
                  >
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{postPlatformLabel(l.url)}</span>
                    {l.note && (
                      <span className="text-stone-500"> — {l.note}</span>
                    )}
                  </span>
                  <ExternalLink size={13} className="shrink-0 text-stone-300" />
                </a>
                {!readOnly && (
                  <button
                    type="button"
                    title="ลบลิงก์นี้"
                    aria-label={`ลบลิงก์ ${meta.label} ${postPlatformLabel(l.url)}`}
                    onClick={() => remove(l.id)}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90 sm:h-8 sm:w-8"
                  >
                    <X size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ฟอร์มเพิ่มลิงก์ — เปิดตลอดแม้เคสปิดงานแล้ว (คลังผลงานอ้างอิง ไม่ใช่สถานะงาน) */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-1 rounded-full bg-stone-100/80 p-1"
            role="group"
            aria-label="ชนิดของลิงก์"
          >
            {INFLU_POST_KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                title={INFLU_POST_KINDS[k].hint}
                onClick={() => setKind(k)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.97] max-sm:min-h-11 ${
                  kind === k
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                    : "text-stone-500 hover:bg-white/70 hover:text-stone-700"
                }`}
              >
                {INFLU_POST_KINDS[k].label}
              </button>
            ))}
          </div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder={
              kind === "comment"
                ? "วางลิงก์คอมเมนต์รีวิว..."
                : "วางลิงก์โพส/คลิปรีวิว..."
            }
            className="min-w-0 flex-1 basis-52"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="โน้ต เช่น คลิปรีวิวหลัก (ไม่บังคับ)"
            className="w-full sm:w-56"
            maxLength={120}
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
      )}

      {err && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}
    </Card>
  );
}
