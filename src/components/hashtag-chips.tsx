"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { hashtagText, type CaseHashtag } from "@/lib/influ-constants";

/**
 * ชิปแฮชแท็กบังคับ + ปุ่มคัดลอก + รายการที่ยังขาด
 *
 * ใช้ร่วมกันระหว่างหน้าจัดการแท็ก (`/tag-management`) กับโมดัลบังคับติดแท็กตอนส่งตรวจ
 * ในหน้า Task — หน้าเคสของระบบ Influ มีบล็อกของตัวเอง (`HashtagBlock`) ที่แสดงเต็มกว่านี้
 *
 * `size="sm"` = ใช้ในลิสต์/โมดัลที่มีที่จำกัด (ชิปเล็กลง ไม่มีคำอธิบายท้ายบล็อก)
 */
export function HashtagChips({
  tags,
  size = "md",
  className = "",
}: {
  tags: CaseHashtag[];
  size?: "sm" | "md";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const ready = tags.filter((t) => t.tag !== null);
  const missing = tags.filter((t) => t.tag === null);
  const text = hashtagText(tags);
  const small = size === "sm";

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {ready.map((t) => (
          <span
            key={`${t.key}-${t.tag}`}
            title={t.source ? `${t.label}: ${t.source}` : t.label}
            // แท็กเป็นคำเดียวยาวๆ — ต้อง break ได้ไม่งั้นดันจอที่ 375px
            className={`min-w-0 break-words rounded-lg bg-brand-50 font-mono font-semibold text-brand-700 ring-1 ring-brand-100 ${
              small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
            }`}
          >
            {t.tag}
          </span>
        ))}
        {ready.length > 0 && (
          <Button
            variant="secondary"
            className="ml-auto shrink-0 !py-1.5 text-xs max-sm:min-h-11"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "คัดลอกแล้ว" : "คัดลอกแฮชแท็ก"}
          </Button>
        )}
      </div>

      {missing.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
          {missing.map((t) => (
            <li
              key={`miss-${t.key}`}
              className="flex items-start gap-2 text-xs leading-5 text-amber-800"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                ยังไม่มีแท็ก<span className="font-semibold">{t.label}</span>
                {t.missingHint ? ` — ${t.missingHint}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
