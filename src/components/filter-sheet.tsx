"use client";

/**
 * ตัวกรองบนมือถือของระบบ Influencer — "ปุ่มเดียว + แผ่นเลื่อนขึ้นจากขอบล่าง"
 *
 * ผู้ใช้ 2026-08-30: "ตัว filter ทำให้เป็นปุ่มเดียวแล้วกด ก็เลื่อน tab setting มาจาก
 * ด้านล่างขึ้นมาสัก 2/3 ของจอให้เลือก" — ทุกหน้าในกลุ่ม (influ) จึงใช้คู่นี้ชุดเดียวกัน
 * แทนที่จะมีชิปตัวกรองลอยเต็มแถบเครื่องมือจนกินจอมือถือไปครึ่งหนึ่ง
 *
 * กติกา:
 * - **แผ่นนี้เป็นของจอเล็กเท่านั้น** (ตัวเรียกครอบด้วย `sm:hidden` เอง) — จอ ≥sm ยังใช้
 *   แถวตัวกรอง inline / เมนู popup เดิมที่ทำไว้ดีแล้ว ไม่ต้องรื้อ
 * - z-[80] เท่ากับ Modal ของระบบ (แผ่นนี้คือโมดัลชนิดหนึ่ง) — dropdown แบบ portal ที่
 *   ถูกใช้ "ข้างใน" แผ่นต้องเป็น z-[90] ตามกติกาเดียวกับโมดัล
 * - เนื้อในเลื่อนเองในแผ่น หัวกับปุ่มท้ายติดหนึบ ปุ่มจึงกดถึงเสมอแม้ตัวกรองยาว
 */

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** ปุ่ม "ตัวกรอง" ปุ่มเดียวบนแถบเครื่องมือ — มีตัวเลขบอกว่ากรองอยู่กี่อย่าง */
export function FilterButton({
  count = 0,
  onClick,
  label = "ตัวกรอง",
  className = "",
}: {
  /** จำนวนตัวกรองที่ไม่ใช่ค่าเริ่มต้น (0 = ไม่โชว์ป้าย) */
  count?: number;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors active:scale-[0.97] ${
        count > 0
          ? "border-brand-400 bg-brand-50 text-brand-700"
          : "border-brand-200 bg-white/70 text-stone-600"
      } ${className}`}
    >
      <SlidersHorizontal size={16} />
      {label}
      {count > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * ชิปสรุป "ตัวกรองที่เปิดอยู่" — วางไว้ใต้แถบเครื่องมือ
 *
 * จำเป็นเพราะพอย้ายตัวกรองเข้าแผ่นที่ปิดอยู่ ผู้ใช้จะมองไม่เห็นว่ากำลังกรองอะไรค้างไว้
 * แล้วเข้าใจว่าข้อมูลหาย (บทเรียนเดียวกับ my-tasks / Hunting) — กดกากบาทปลดทีละอันได้
 */
export function ActiveFilterChips({
  items,
  className = "",
}: {
  items: { key: string; label: string; onClear: () => void }[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* ทั้งชิปเป็นปุ่มปลดตัวกรอง (ไม่ใช่กากบาทเล็กๆ ข้างใน) — เป้านิ้วจึงเต็มชิป 44px
          บนจอเล็ก แพตเทิร์นเดียวกับชิปสรุปของบอร์ด Hunting ที่ทำไว้ก่อนแล้ว */}
      {items.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onClear}
          aria-label={`ปลดตัวกรอง ${c.label}`}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50/80 px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 active:scale-[0.97] max-sm:min-h-11 max-sm:text-sm"
        >
          {c.label}
          <X size={13} className="text-brand-500" />
        </button>
      ))}
    </div>
  );
}

/** หัวข้อกลุ่มตัวกรองในแผ่น — ให้ทุกหน้าหน้าตาเหมือนกัน */
export function FilterGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-stone-700">{label}</h3>
      {hint && <p className="-mt-1.5 mb-2 text-xs text-stone-400">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

/** ปุ่มตัวเลือกในแผ่น (ชิปสูง 44px กดง่ายด้วยนิ้ว) */
export function FilterChip({
  active,
  onClick,
  children,
  count,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors active:scale-[0.97] ${
        active
          ? "border-brand-400 bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
          : "border-stone-200 bg-white/80 text-stone-600"
      }`}
    >
      {children}
      {count !== undefined && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
            active ? "bg-white/25 text-cream" : "bg-stone-100 text-stone-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * แผ่นตัวกรองเลื่อนขึ้นจากขอบล่าง สูง ~2/3 จอ
 * — ตัวเรียกเป็นคนคุมว่าจะ render เฉพาะจอเล็ก (`<div className="sm:hidden">`)
 */
export function FilterSheet({
  open,
  onClose,
  title = "ตัวกรอง",
  onClear,
  clearDisabled = false,
  resultCount,
  resultNoun = "รายการ",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** ล้างตัวกรองทั้งหมด — ไม่ส่ง = ไม่มีปุ่มล้าง */
  onClear?: () => void;
  clearDisabled?: boolean;
  /** จำนวนผลลัพธ์หลังกรอง — โชว์บนปุ่มปิด ให้เห็นผลก่อนกดกลับไปดู */
  resultCount?: number;
  resultNoun?: string;
  children: ReactNode;
}) {
  // onClose เปลี่ยนทุก render (arrow function ของตัวเรียก) — เก็บใน ref ไม่งั้น effect รันซ้ำไม่จบ
  // (เขียนค่าใน effect ไม่ใช่ตอน render — กฎ react-hooks ห้ามแตะ ref ระหว่าง render)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Esc ปิด + ล็อค scroll พื้นหลังระหว่างเปิด (แพตเทิร์นเดียวกับ Modal ของระบบ)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /* แผ่นนี้ถูกซ่อนด้วย `sm:hidden` — ถ้าผู้ใช้หมุนเครื่องเป็นแนวนอน (375→667px = ข้าม sm)
     ขณะเปิดอยู่ แผ่นจะหายไปแต่ state ยังเปิดค้างและ body ยังโดนล็อค scroll
     ⇒ ปิดให้เองเมื่อจอโตข้าม breakpoint */
  useEffect(() => {
    if (!open) return;
    // ฟังทั้ง resize และ matchMedia — เหตุการณ์ change ของ media query ไม่ยิงทุกเบราว์เซอร์
    // (ยืนยันแล้วว่าไม่ยิงตอนเปลี่ยนขนาดจอแบบ emulate) resize เป็นตัวที่เชื่อถือได้จริง
    const check = () => {
      if (window.innerWidth >= 640) onCloseRef.current();
    };
    check();
    const mq = window.matchMedia("(min-width: 640px)");
    window.addEventListener("resize", check);
    mq.addEventListener("change", check);
    return () => {
      window.removeEventListener("resize", check);
      mq.removeEventListener("change", check);
    };
  }, [open]);

  // ตัวเรียกทุกที่เริ่มด้วย open=false เสมอ (แผ่นเปิดจากการกดปุ่ม) — ตอน SSR จึงไม่มีทาง
  // render แผ่น การเช็ค document จึงพอ ไม่ต้องมี state `mounted` + effect
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // sm:hidden อยู่บน root ของ portal (ไม่ใช่ที่ตัวเรียก) — portal หลุดออกไป body
    // คลาสที่ครอบจากฝั่งตัวเรียกจึงไม่มีผลกับเนื้อในแผ่น
    <div className="fixed inset-0 z-[80] sm:hidden">
      <button
        type="button"
        aria-label="ปิดตัวกรอง"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-brand-900/30 backdrop-blur-sm animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 2/3 จอตามคำสั่งผู้ใช้ — ตัวกรองสั้นก็ยังสูงเท่านี้ (นิ้วโป้งเอื้อมถึงทั้งแผ่น)
        className="absolute inset-x-0 bottom-0 flex h-[68dvh] max-h-[92dvh] flex-col rounded-t-3xl border border-white/70 bg-cream-soft/95 shadow-2xl backdrop-blur-2xl animate-slide-in-up"
      >
        <div className="shrink-0 px-5 pb-2 pt-2.5">
          {/* แถบจับ — บอกว่าแผ่นนี้เลื่อนขึ้นมาและปิดได้ */}
          <span
            aria-hidden
            className="mx-auto mb-2.5 block h-1 w-10 rounded-full bg-stone-300"
          />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดตัวกรอง"
              className="-mr-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white/70 hover:text-brand-700 active:scale-90"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4">
          {children}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-white/70 bg-white/60 px-5 py-3 pb-safe-3">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={clearDisabled}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border border-stone-200 bg-white/80 px-4 text-sm font-medium text-stone-600 transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ล้างตัวกรอง
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-4 text-sm font-semibold text-cream shadow-sm transition-all active:scale-[0.97]"
          >
            {resultCount === undefined
              ? "ดูผลลัพธ์"
              : `ดูผลลัพธ์ ${resultCount} ${resultNoun}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
