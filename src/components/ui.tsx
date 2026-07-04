"use client";

import { Loader2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

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
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${buttonVariants[variant]} ${className}`}
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

const controlBase =
  "w-full rounded-lg border border-stone-300/80 bg-white/80 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 transition-colors duration-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50 disabled:text-stone-400";

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
      className={`w-full rounded-md border border-brand-300 bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${className}`}
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
  onCloseRef.current = onClose;

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-900/30 p-4 pt-16 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl border border-white/70 bg-white/85 shadow-2xl outline-none backdrop-blur-2xl animate-scale-in`}
      >
        <div className="flex items-center justify-between border-b border-brand-100/70 px-5 py-4">
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-700 cursor-pointer active:scale-90"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------- ConfirmDialog — กล่องยืนยันการกระทำอันตราย (แทน window.confirm) ---------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "ลบ",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-6 text-stone-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button
          variant="danger"
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
   full-width: แพลตฟอร์มนี้ใช้บนคอมเป็นหลัก ไม่บีบความกว้าง ไม่เผื่อมือถือ ---------- */

export function PageContainer({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={`w-full px-6 py-6 ${className}`}>{children}</div>
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
