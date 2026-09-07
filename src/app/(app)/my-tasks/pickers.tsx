"use client";

/**
 * ตัวเลือกของ My List — สถานะ / ความสำคัญ / แท็ก
 * ทุกเมนูเป็น "เมนูลอย" ที่ render ผ่าน portal + position:fixed และผูกพฤติกรรม
 * มาตรฐานผ่าน useAnchoredMenu (แตะนอก/Esc = ปิด, เลื่อนจอ = ย้ายตาม ไม่ใช่หุบ)
 * — ห้ามเขียน listener resize/scroll เอง ไม่งั้นคีย์บอร์ดมือถือเด้งแล้วเมนูหุบก่อนเลือกได้
 *
 * ทั้งสามเมนู "กดเพิ่มตัวเลือกใหม่ได้จากในเมนูเลย" (สถานะ/ความสำคัญ = list_options 0072,
 * แท็ก = list_tags) — ไม่ต้องเข้าโมดัลก่อนถึงจะมีตัวเลือกใช้
 */

import {
  Check,
  ChevronDown,
  Plus,
  Settings2,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type MenuBox, menuBox, useAnchoredMenu } from "@/components/anchored-menu";
import { LIST_TAG_COLOR_ORDER, listTagColor } from "@/lib/constants";
import type { ListTagRow } from "@/lib/types";
import type { OptionView } from "./list-utils";

/** โฟกัสช่องค้นหาอัตโนมัติเฉพาะเครื่องที่มีเมาส์ — บนมือถือคีย์บอร์ดจะเด้งมาบังลิสต์ */
function autoFocusSearch(el: HTMLInputElement | null) {
  if (!el) return;
  if (window.matchMedia("(pointer: fine)").matches) el.focus();
}

/* ---------- ปุ่มตัวกรองบนแถบเครื่องมือ (ไร้กรอบแบบ Monday) ---------- */

export type ToolbarOption = {
  key: string;
  label: string;
  selected: boolean;
  /** จุดสี/ช่องสีนำหน้าตัวเลือก (คลาสเต็มของ Tailwind) */
  dot?: string;
  onPick: () => void;
};

/**
 * ปุ่มบนแถบเครื่องมือที่กดแล้วกางเมนูตัวเลือก — ไม่มีกรอบ/พื้นจนกว่าจะถูกใช้งาน
 * (ตัวกรองที่ "ทำงานอยู่" ถึงจะมีพื้นสีแบรนด์ให้เห็นว่ายังกรองค้างอยู่)
 */
export function ToolbarMenu({
  icon,
  text,
  active,
  ariaLabel,
  options,
  width = 224,
}: {
  icon: ReactNode;
  text: string;
  active: boolean;
  ariaLabel: string;
  options: ToolbarOption[];
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuBox | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = (btn: HTMLElement) => menuBox(btn, { width, maxHeight: 340 });

  useAnchoredMenu({
    open,
    anchorRef: btnRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: (b) => setPos(place(b)),
  });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!open && btnRef.current) setPos(place(btnRef.current));
          setOpen((o) => !o);
        }}
        className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors active:scale-[0.97] max-sm:min-h-11 max-sm:px-3 ${
          active
            ? "bg-brand-100/90 text-brand-800"
            : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
        }`}
      >
        {icon}
        {text}
        <ChevronDown size={13} className="opacity-50" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ left: pos.x, top: pos.y, width: pos.width, maxHeight: pos.height }}
            className="fixed z-[60] overflow-y-auto overscroll-contain rounded-lg border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl animate-scale-in"
          >
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={o.selected}
                onClick={() => {
                  o.onPick();
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-brand-50 max-sm:min-h-11 ${
                  o.selected ? "bg-brand-50/80 text-brand-800" : "text-stone-700"
                }`}
              >
                {o.dot && (
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${o.dot}`} />
                )}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.selected && (
                  <Check size={14} className="shrink-0 text-brand-600" />
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

/* ---------- ชิปแท็ก ---------- */

export function TagChip({
  tag,
  onRemove,
  size = "sm",
}: {
  tag: ListTagRow;
  onRemove?: () => void;
  size?: "sm" | "xs";
}) {
  const color = listTagColor(tag.color);
  return (
    <span
      className={`inline-flex max-w-[10rem] items-center gap-1 rounded-full ${
        size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"
      } font-medium ${color.chip}`}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`เอาแท็ก ${tag.name} ออก`}
          /* จอเล็กขยายเป้าเป็น 32px — ชิปสูง 44px จะกินพื้นที่แถวเกินไป และการถอดแท็ก
             ยังทำได้อีกทางผ่านเมนู "เพิ่มแท็ก" ที่แต่ละแถวสูง 44px เต็ม */
          className="-mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-black/10 active:scale-90 max-sm:h-8 max-sm:w-8"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/* ---------- เลือกสถานะ / ความสำคัญ (ตัวเลือกในตัว + ที่ผู้ใช้กดเพิ่มเอง) ---------- */

/**
 * เมนูของคอลัมน์ "สถานะ" และ "ความสำคัญ" — ใช้คอมโพเนนต์เดียวกันทั้งสองช่อง เพราะตั้งแต่
 * migration 0072 ทั้งคู่มีโครงเดียวกัน: ตัวเลือกในตัว + ตัวเลือกที่ผู้ใช้เพิ่มเอง (list_options)
 * ซึ่งถูกแปลงเป็น OptionView รูปแบบเดียวกันมาแล้วจาก list-utils
 *
 * ท้ายเมนูมีช่อง "เพิ่มตัวเลือก" — พิมพ์ชื่อแล้วกด Enter = สร้างตัวเลือกใหม่แล้วตั้งให้งานนี้เลย
 * (แนวเดียวกับ TagPicker ที่สร้างแท็กจากในเมนูได้ ไม่ต้องเข้าโมดัลก่อน)
 *
 * ตัวเลือกที่ "เลือกเองไม่ได้" (เลยกำหนด/ใกล้ครบกำหนด ซึ่งมาจากวันกำหนดส่ง) ถูกกรองออก
 * ตั้งแต่ฝั่งคนเรียกแล้ว — ที่นี่แสดงทุกอันใน views เสมอ
 */
export function OptionPicker({
  view,
  views,
  selectedKey,
  onPick,
  onCreate,
  addLabel,
  placeholder,
  hint = null,
  onManage,
  variant = "cell",
  label,
  disabled = false,
}: {
  /** ค่าปัจจุบันของงานนี้ (ป้ายที่โชว์บนปุ่ม) */
  view: OptionView;
  /** ตัวเลือกทั้งหมดที่เลือกได้ (ในตัว + ที่เพิ่มเอง) */
  views: OptionView[];
  /** ตัวที่ให้ติ๊กถูกในเมนู — ใส่เมื่อป้ายที่โชว์ไม่ใช่ตัวเลือกในเมนู (เช่นสถานะ "เลยกำหนด"
   *  ที่มาจากวันที่ ซึ่งยังนับว่าเลือก "ยังไม่เสร็จ" อยู่); ไม่ใส่ = ใช้ค่าที่โชว์ */
  selectedKey?: string;
  onPick: (v: OptionView) => void;
  /** สร้างตัวเลือกใหม่แล้วตั้งให้งานนี้ — คืน id ใหม่ (null = ล้มเหลว, คงช่องไว้ให้แก้) */
  onCreate: (name: string) => Promise<string | null>;
  /** ป้ายปุ่มเพิ่มตัวเลือก เช่น "เพิ่มสถานะ" */
  addLabel: string;
  placeholder: string;
  /** คำอธิบายท้ายเมนู (เช่น สถานะที่เปลี่ยนตามวันกำหนดส่งอัตโนมัติ) */
  hint?: string | null;
  /** เปิดโมดัลจัดการตัวเลือก — โชว์เมื่อมีตัวเลือกที่เพิ่มเองแล้ว (ทางเข้าเดียวที่ใช้เปลี่ยนชื่อ/สี/ลบ) */
  onManage?: () => void;
  /** cell = ช่องสีทึบเต็มเซลล์ในตาราง · field = ปุ่มเต็มความกว้างในแผงรายละเอียด */
  variant?: "cell" | "field";
  /** ชื่อช่องสำหรับ screen reader เช่น "สถานะ" */
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuBox | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = (btn: HTMLElement) => menuBox(btn, { width: 232, maxHeight: 360 });

  useAnchoredMenu({
    open,
    anchorRef: btnRef,
    menuRef,
    onClose: () => {
      setOpen(false);
      setAdding(false);
      setName("");
    },
    onReposition: (b) => setPos(place(b)),
  });

  const create = async () => {
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    const id = await onCreate(clean);
    setSaving(false);
    if (!id) return; // ล้มเหลว = คงช่องไว้ (ข้อความ error โผล่บนหัวหน้าแล้ว)
    setName("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${view.label} — กดเพื่อเลือก`}
        title={`เลือก${label}`}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (!open && btnRef.current) setPos(place(btnRef.current));
          setOpen((o) => !o);
        }}
        className={
          variant === "cell"
            ? `flex h-full w-full cursor-pointer items-center justify-center gap-1 px-2 text-xs font-medium transition-[filter] hover:brightness-95 disabled:cursor-not-allowed ${view.cell}`
            : "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-stone-300/80 bg-white/80 px-3 py-2 text-left text-sm text-stone-900 transition-colors hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed max-sm:min-h-11"
        }
      >
        {variant === "field" && (
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${view.bar}`} />
        )}
        <span className="min-w-0 flex-1 truncate">{view.label}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ left: pos.x, top: pos.y, width: pos.width, maxHeight: pos.height }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-white/70 bg-white/95 shadow-xl backdrop-blur-xl animate-scale-in"
          >
            <div
              role="listbox"
              aria-label={label}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
            >
              {views.map((v) => {
                const selected = v.key === (selectedKey ?? view.key);
                return (
                  <button
                    key={v.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      if (!selected) onPick(v);
                      setOpen(false);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-brand-50 max-sm:min-h-11 ${
                      selected ? "bg-brand-50/80 text-brand-800" : "text-stone-700"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.bar}`} />
                    <span className="min-w-0 flex-1 truncate">{v.label}</span>
                    {selected && <Check size={14} className="shrink-0 text-brand-600" />}
                  </button>
                );
              })}
            </div>

            {/* ---- ท้ายเมนู: เพิ่มตัวเลือกใหม่ / ทางเข้าโมดัลจัดการ / คำอธิบาย ---- */}
            <div className="shrink-0 border-t border-brand-100/70 p-1.5">
              {adding ? (
                <input
                  /* เปิดจากการกดปุ่ม "เพิ่ม…" เสมอ — โฟกัสให้เลยทุกเครื่อง (คีย์บอร์ดคือสิ่งที่ผู้ใช้ตั้งใจ
                     ต่างจากช่องค้นหาในเมนูลอยที่ห้ามโฟกัสเองบนมือถือเพราะจะบังลิสต์)
                     เมนูนี้ผูก useAnchoredMenu จึงย้ายตามปุ่มตอนคีย์บอร์ดเด้ง ไม่หุบทิ้ง
                     text-base บนจอเล็ก: ต่ำกว่า 16px แล้ว iOS ซูมหน้าเข้าเองและไม่ซูมกลับ */
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={30}
                  placeholder={placeholder}
                  aria-label={addLabel}
                  /* Esc ไม่ต้องดักเอง — useAnchoredMenu ฟังแบบ capture ที่ document
                     จึงปิดทั้งเมนูให้อยู่แล้ว (onClose ล้างช่องนี้ให้ด้วย) */
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void create();
                    }
                  }}
                  className="w-full rounded-md border border-stone-300/80 bg-white px-2.5 py-1.5 text-base text-stone-900 placeholder:text-stone-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 max-sm:min-h-11"
                >
                  <Plus size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{addLabel}</span>
                </button>
              )}
              {onManage && views.some((v) => v.custom) && !adding && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onManage();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-stone-500 transition-colors hover:bg-brand-50 hover:text-brand-700 max-sm:min-h-11"
                >
                  <Settings2 size={13} className="shrink-0" />
                  แก้ชื่อ / สี / ลบตัวเลือก
                </button>
              )}
              {hint && !adding && (
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-4 text-stone-400">
                  {hint}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
/* ---------- เลือก/สร้างแท็ก ---------- */

export function TagPicker({
  tags,
  selected,
  onToggle,
  onCreate,
  label = "เพิ่มแท็ก",
}: {
  tags: ListTagRow[];
  selected: string[];
  onToggle: (tagId: string, on: boolean) => void;
  /** สร้างแท็กใหม่แล้วติดให้รายการนี้เลย — คืน id ใหม่ (null = ล้มเหลว) */
  onCreate: (name: string) => Promise<string | null>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuBox | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = (btn: HTMLElement) => menuBox(btn, { width: 260, maxHeight: 320 });

  useAnchoredMenu({
    open,
    anchorRef: btnRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: (b) => setPos(place(b)),
  });

  const keyword = q.trim().toLowerCase();
  const shown = keyword
    ? tags.filter((t) => t.name.toLowerCase().includes(keyword))
    : tags;
  const exact = tags.some((t) => t.name.trim().toLowerCase() === keyword);

  const create = async () => {
    const name = q.trim();
    if (!name || creating) return;
    setCreating(true);
    const id = await onCreate(name);
    setCreating(false);
    if (id) {
      setQ("");
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && btnRef.current) setPos(place(btnRef.current));
          setOpen((o) => !o);
        }}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:scale-95 max-sm:min-h-11 max-sm:px-4"
      >
        <TagIcon size={12} />
        {label}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ left: pos.x, top: pos.y, width: pos.width, maxHeight: pos.height }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-white/70 bg-white/95 shadow-xl backdrop-blur-xl animate-scale-in"
          >
            <div className="shrink-0 border-b border-brand-100/70 p-2">
              <input
                ref={autoFocusSearch}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !q.trim()) return;
                  e.preventDefault();
                  // ชื่อตรงกับแท็กที่มีอยู่ = ติดแท็กนั้นให้เลย (เดิมกด Enter แล้วเงียบ)
                  const existing = tags.find(
                    (t) => t.name.trim().toLowerCase() === keyword
                  );
                  if (existing) {
                    if (!selected.includes(existing.id))
                      onToggle(existing.id, true);
                    setQ("");
                    setOpen(false);
                    return;
                  }
                  void create();
                }}
                placeholder="ค้นหา"
                /* text-base บนจอเล็ก: ต่ำกว่า 16px แล้ว iOS จะซูมหน้าเข้าเองและไม่ซูมกลับ */
                className="w-full rounded-md border border-stone-300/80 bg-white px-2.5 py-1.5 text-base text-stone-900 placeholder:text-stone-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              {shown.map((t) => {
                const on = selected.includes(t.id);
                const color = listTagColor(t.color);
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => onToggle(t.id, !on)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-brand-50 max-sm:min-h-11"
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    {on && <Check size={14} className="shrink-0 text-brand-600" />}
                  </button>
                );
              })}
              {q.trim() && !exact && (
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={creating}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60 max-sm:min-h-11"
                >
                  <Plus size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    สร้างแท็ก “{q.trim()}”
                  </span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/** สีถัดไปที่จะให้แท็กใหม่ — ไล่วนตามจำนวนแท็กที่มี ให้ลิสต์ดูมีสีสันโดยไม่ต้องเลือกเอง
    (เปลี่ยนสีทีหลังได้ในโมดัล "จัดการแท็ก") */
export function nextTagColor(count: number): string {
  return LIST_TAG_COLOR_ORDER[count % LIST_TAG_COLOR_ORDER.length];
}
