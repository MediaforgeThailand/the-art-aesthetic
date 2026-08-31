"use client";

import { Loader2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useHydrated } from "@/lib/use-synced-state";
import { createPortal } from "react-dom";

/* ---------- Button ---------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm hover:from-brand-600 hover:to-brand-700 hover:shadow-md disabled:from-brand-300 disabled:to-brand-300 disabled:shadow-none",
  secondary:
    "bg-white text-stone-700 border border-stone-300 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 disabled:text-stone-300 disabled:hover:bg-white",
  ghost:
    "text-stone-600 hover:bg-brand-50 hover:text-brand-700 disabled:text-stone-300",
  danger:
    "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 disabled:text-rose-300",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      // เป้านิ้ว 44px เฉพาะจอเล็ก — ใช้ max-sm: (ไม่ใช่ min-h-11 + sm:min-h-0) เพราะสอง
      // utility ที่คุม property เดียวกันจะแพ้ชนะกันตามลำดับใน CSS ไม่ใช่ตามลำดับใน class
      // ทำให้ปุ่มบนเดสก์ท็อปสูง 44px ตามไปด้วย; max-sm: ไม่ match ที่ ≥640px จึงไม่มีทางชนกัน
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 max-sm:min-h-11 max-sm:py-2.5 ${buttonVariants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Card ---------- */

export function Card({
  className = "",
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={style}
      className={`glass rounded-xl shadow-[0_8px_28px_rgba(94,58,49,0.08)] transition-shadow duration-300 hover:shadow-[0_12px_36px_rgba(94,58,49,0.14)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------- Form controls ---------- */

/* text-base บนจอเล็ก: iOS Safari ซูมหน้าเข้าอัตโนมัติเมื่อโฟกัสช่องที่ฟอนต์ < 16px
   แล้วไม่ซูมกลับ — ผู้ใช้ต้องถ่างนิ้วออกเองทุกครั้งที่กรอกฟอร์ม (จอ ≥sm ใช้ 14px ตามเดิม) */
// placeholder เป็น stone-500 ไม่ใช่ 400 — 400 บนพื้นขาวได้คอนทราสต์ ~2.9:1
// (ต่ำกว่าเกณฑ์ 4.5:1) ทีมอ่านข้อความในช่องไม่ออกจนคิดว่าจอเบลอ (ผู้ใช้ 2026-08-30)
const controlBase =
  "w-full rounded-lg border border-stone-300/80 bg-white/80 px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 transition-colors duration-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50 disabled:text-stone-400 sm:text-sm";

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlBase} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlBase} ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${controlBase} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Label({
  className = "",
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1.5 block text-sm font-medium text-stone-700 ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}

/* ---------- InlineInput — ช่องกรอกแบบ inline ขนาดกะทัดรัด (rename, composer) ---------- */

export function InlineInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      // text-base บนจอเล็กเหมือน controlBase — ช่องนี้ปล่อยให้ผู้เรียกกำหนดฟอนต์เองมาตลอด
      // ทำให้ composer/rename โดน iOS ซูมเข้าแล้วไม่ซูมกลับทุกครั้งที่แตะ
      className={`w-full rounded-md border border-brand-300 bg-white text-base text-stone-900 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm ${className}`}
      {...props}
    />
  );
}

/* ---------- Badge ---------- */

export function Badge({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // เก็บ onClose ใน ref — ผูกเป็น dependency ตรงๆ ไม่ได้ เพราะทุกหน้าส่ง arrow function
  // ใหม่ทุก render ทำให้ effect รันซ้ำและขโมยโฟกัสจากช่องที่กำลังพิมพ์
  const onCloseRef = useRef(onClose);
  // เขียน ref ใน effect ไม่ใช่ระหว่าง render (กฎ react-hooks/refs) — handler อ่านค่า
  // ตอนเกิดอีเวนต์อยู่แล้ว จึงได้ onClose ล่าสุดเหมือนเดิม
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // portal ออกไป body — กัน parent ที่มี backdrop-filter/transform (เช่น sidebar)
  // ทำให้ position:fixed ยึดกับกล่องนั้นแทนทั้งจอ (modal เลยดูแคบติดมุม)
  const mounted = useHydrated();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    // โฟกัสเข้ากล่อง + ล็อค scroll พื้นหลัง แล้วคืนโฟกัสเดิมตอนปิด
    const prevFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      /* มือถือ = bottom sheet (ชิดขอบล่าง นิ้วเอื้อมถึง), จอ ≥sm = กล่องกลางจอแบบเดิม
         z-[80] เพราะ drawer เมนูมือถือเป็น z-[60] — โมดัลที่เปิดจาก drawer เคยไปอยู่ข้างใต้ */
      className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden bg-brand-900/30 backdrop-blur-sm animate-fade-in sm:items-start sm:overflow-y-auto sm:p-4 sm:pt-16"
      onMouseDown={(e) => {
        // overlay เป็นทั้งพื้นที่ปิด modal และกล่อง scroll — คลิก/ลาก scrollbar แนวตั้ง
        // จะโดน e.target === overlay ด้วย ทำให้ modal ปิดและฟอร์มที่กรอกค้างหายหมด
        // clientWidth ไม่รวม scrollbar จึงใช้กรองคลิกที่ตกในโซน scrollbar ออก
        if (e.target === e.currentTarget && e.clientX < e.currentTarget.clientWidth) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        /* max-h + flex column: หัวกล่องติดหนึบ เนื้อในเลื่อนเอง
           ของเดิมไม่มี max-h เลย ฟอร์มยาว (เพิ่มบัญชี/แก้ราคา) ปุ่มบันทึกจึงตกใต้ fold
           และปุ่มปิดเลื่อนหลุดจอจนปิดไม่ได้ */
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-white/70 bg-white/95 shadow-2xl outline-none animate-slide-in-up sm:max-h-[85dvh] sm:rounded-xl sm:bg-white/85 sm:backdrop-blur-2xl sm:animate-scale-in ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-brand-100/70 px-5 py-3.5">
          <h2 className="min-w-0 truncate pr-2 text-base font-semibold text-stone-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="-mr-1.5 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90 max-sm:-mr-2 max-sm:h-11 max-sm:w-11"
            aria-label="ปิด"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-safe-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------- ConfirmDialog — กล่องยืนยันการกระทำอันตราย (แทน window.confirm) ---------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "ลบ",
  confirmVariant = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  /** โทนปุ่มยืนยัน — default danger (แดง) สำหรับการลบ; การกระทำอื่นส่ง "primary" มาได้ */
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-6 text-stone-600">{message}</p>
      {/* มือถือ: ปุ่มเต็มความกว้างซ้อนกัน ปุ่มยืนยัน (มักเป็น "ลบ") อยู่บน ปุ่มยกเลิกอยู่ล่าง
          ใกล้นิ้วโป้งกว่า — ของเดิมวางเรียงกันห่าง 8px บนเป้า 36px กดพลาดลบของจริงได้ */}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button
          variant={confirmVariant}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- Spinner / EmptyState ---------- */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <Loader2 size={24} className="animate-spin text-brand-500" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center animate-fade-in">
      {icon && <div className="text-brand-200">{icon}</div>}
      <p className="text-sm font-medium text-stone-600">{title}</p>
      {description && <p className="text-sm text-stone-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------- PageContainer — กรอบมาตรฐานของหน้าปกติ (คุม scroll แนวตั้งเอง)
   full-width ไม่บีบความกว้าง; จอแคบลด padding ให้เนื้อหาได้พื้นที่เต็ม ---------- */

export function PageContainer({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={`w-full px-3 py-4 sm:px-6 sm:py-6 ${className}`}>
        {children}
      </div>
    </div>
  );
}

/* ---------- PageHeader ---------- */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
