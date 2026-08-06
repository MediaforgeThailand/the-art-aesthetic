"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type MenuBox, menuBox, useAnchoredMenu } from "@/components/anchored-menu";
import { AssigneeAvatar, type ProfileOption, profileName } from "./task-card";

/** ตัวเลือกหนึ่งรายการของ PersonSelect
    - มี profile (object) = แสดงรูปโปรไฟล์/อักษรย่อหน้าชื่อ
    - profile: null = วงกลมเส้นประ (เช่น "ไม่ระบุ")
    - ไม่ส่ง profile = ตัวเลือกข้อความล้วน (เช่น "ทั้งหมด") */
export type PersonOption = {
  value: string;
  /** ป้ายที่แสดง — ไม่ส่งจะใช้ชื่อจาก profile */
  label?: string;
  profile?: ProfileOption | null;
};

function optionLabel(o: PersonOption): string {
  return o.label ?? (o.profile ? profileName(o.profile) : "-");
}

/**
 * Dropdown เลือกคนที่แสดงรูปโปรไฟล์ในทุกตัวเลือก — ใช้แทน <select> เดิม
 * (select พื้นฐานของเบราว์เซอร์แสดงรูปใน option ไม่ได้)
 * เมนู render ผ่าน portal + fixed position แบบเดียวกับ AssigneePicker กันโดน overflow ตัด
 */
export function PersonSelect({
  value,
  options,
  onChange,
  disabled = false,
  id,
  ariaLabel,
  size = "md",
}: {
  value: string;
  options: PersonOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  /** md = แถวตัวกรอง (สูงเท่า Select ปกติ), sm = โซนตั้งค่าในแผงรายละเอียด (ไร้กล่อง) */
  size?: "md" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuBox | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = (btn: HTMLElement) =>
    menuBox(btn, {
      width: 248,
      maxHeight: Math.min(48 * options.length + 12, 288),
    });

  useAnchoredMenu({
    open,
    anchorRef: btnRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: (b) => setPos(place(b)),
  });

  const toggle = () => {
    if (disabled) return;
    if (!open && btnRef.current) setPos(place(btnRef.current));
    setOpen((o) => !o);
  };

  const selected = options.find((o) => o.value === value) ?? null;
  const triggerClass =
    size === "md"
      ? "flex h-[38px] w-full cursor-pointer items-center gap-2 rounded-lg border border-stone-300/80 bg-white/80 px-3 text-left text-sm text-stone-900 transition-colors duration-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
      : "flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-left text-xs text-stone-800 transition-colors hover:border-stone-200/80 hover:bg-white/70 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className={triggerClass}
      >
        {selected && selected.profile !== undefined && (
          <AssigneeAvatar assignee={selected.profile} size={5} />
        )}
        <span className="min-w-0 flex-1 truncate">
          {selected ? optionLabel(selected) : "-"}
        </span>
        <ChevronDown size={size === "md" ? 15 : 13} className="shrink-0 text-stone-400" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              left: pos.x,
              top: pos.y,
              width: pos.width,
              maxHeight: pos.height,
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed z-[60] overflow-y-auto overscroll-contain rounded-lg border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl animate-scale-in"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-brand-50 sm:py-1.5 ${
                  o.profile === undefined ? "text-stone-600" : "text-stone-700"
                }`}
              >
                {o.profile !== undefined && (
                  <AssigneeAvatar assignee={o.profile} />
                )}
                <span className="min-w-0 flex-1 truncate text-left">
                  {optionLabel(o)}
                </span>
                {o.value === value && (
                  <Check size={14} className="ml-auto shrink-0 text-brand-600" />
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
