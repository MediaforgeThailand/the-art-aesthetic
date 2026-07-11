"use client";

import { useId } from "react";

/**
 * โลโก้ The ART — Plastic Surgery Hospital
 * สร้างเป็น typography ตาม artwork ต้นฉบับ: พื้นไล่เฉด rose gold,
 * "THE" ตัวเล็ก tracking กว้าง, "ART" serif ใหญ่สีครีม, tagline ใต้สุด
 */

/** โลโก้สี่เหลี่ยมเล็ก (sidebar / avatar) — ย่อส่วนของ artwork เป็น SVG ให้คมทุกขนาด */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  // gradient id ต้องไม่ซ้ำกันต่อ instance — มี LogoMark หลายตัวบนหน้าเดียว
  // (sidebar จอใหญ่ + topbar + drawer มือถือ) ถ้า id ซ้ำ เบราว์เซอร์จะอ้างตัวแรก
  // ซึ่งอยู่ใน subtree ที่ display:none → gradient ไม่ถูก render โลโก้กลายเป็นโปร่งใส
  const gradId = `logo-mark-bg-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dcab9c" />
          <stop offset="0.55" stopColor="#c48b78" />
          <stop offset="1" stopColor="#a3634f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradId})`} />
      <text
        x="33"
        y="25"
        textAnchor="middle"
        fontSize="9"
        letterSpacing="3.5"
        fontWeight="600"
        fill="#f6efe4"
        fontFamily="var(--font-noto-thai), ui-sans-serif, sans-serif"
      >
        THE
      </text>
      <text
        x="32"
        y="51"
        textAnchor="middle"
        fontSize="27"
        fontWeight="700"
        fill="#f6efe4"
        fontFamily="var(--font-playfair), Georgia, serif"
      >
        ART
      </text>
    </svg>
  );
}

/** โลโก้เต็มรูปแบบ ใช้บนหน้า login / พื้นสีแบรนด์ — เลย์เอาต์ตาม artwork */
export function LogoLockup({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex w-fit select-none flex-col text-cream ${className}`}
    >
      <span className="pl-1.5 text-sm font-semibold uppercase tracking-[0.5em] opacity-95">
        The
      </span>
      <span className="font-display -mt-1 text-8xl font-bold leading-[0.92]">
        ART
      </span>
      <span className="mt-4 text-[0.66rem] font-medium uppercase tracking-[0.34em] opacity-90">
        Plastic Surgery Hospital
      </span>
    </div>
  );
}

/** ชื่อแผนกแบบตัวอักษร ใช้บนพื้นสว่าง (sidebar) — โลโก้ mark คือแบรนด์ The ART อยู่แล้ว */
export function LogoWordmark() {
  return (
    <div className="flex flex-col">
      <p className="font-display text-xl font-bold leading-tight text-brand-800">
        Aesthetic
      </p>
      <p className="text-[0.5rem] font-medium uppercase tracking-[0.13em] text-brand-500">
        Plastic Surgery Hospital
      </p>
    </div>
  );
}
