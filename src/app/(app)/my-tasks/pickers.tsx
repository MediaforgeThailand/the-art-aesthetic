"use client";

/**
 * ตัวเลือกของ My List — ความสำคัญ + แท็ก
 * เมนูทั้งสองตัวเป็น "เมนูลอย" ที่ render ผ่าน portal + position:fixed และผูกพฤติกรรม
 * มาตรฐานผ่าน useAnchoredMenu (แตะนอก/Esc = ปิด, เลื่อนจอ = ย้ายตาม ไม่ใช่หุบ)
 * — ห้ามเขียน listener resize/scroll เอง ไม่งั้นคีย์บอร์ดมือถือเด้งแล้วเมนูหุบก่อนเลือกได้
 */

import { Check, ChevronDown, Plus, Tag as TagIcon, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type MenuBox, menuBox, useAnchoredMenu } from "@/components/anchored-menu";
import {
  LIST_PRIORITY,
  LIST_PRIORITY_ORDER,
  LIST_TAG_COLOR_ORDER,
  listTagColor,
} from "@/lib/constants";
import type { ListTagRow, TaskPriority } from "@/lib/types";

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

/* ---------- เลือกความสำคัญ ---------- */

export function PriorityPicker({
  value,
  onChange,
  variant = "chip",
  disabled = false,
}: {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
  /** chip = ชิปสีบนแถวลิสต์ · cell = ช่องสีทึบเต็มเซลล์ในตาราง · field = ปุ่มเต็มความกว้างในแผงรายละเอียด */
  variant?: "chip" | "cell" | "field";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuBox | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = (btn: HTMLElement) => menuBox(btn, { width: 200, maxHeight: 240 });

  useAnchoredMenu({
    open,
    anchorRef: btnRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: (b) => setPos(place(b)),
  });

  const meta = LIST_PRIORITY[value];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`ความสำคัญ: ${meta.label}`}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (!open && btnRef.current) setPos(place(btnRef.current));
          setOpen((o) => !o);
        }}
        className={
          variant === "chip"
            ? `inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-transform active:scale-95 disabled:cursor-not-allowed max-sm:min-h-8 max-sm:px-3 sm:py-1 ${meta.chip}`
            : variant === "cell"
              ? `flex h-full w-full cursor-pointer items-center justify-center px-2 text-xs font-medium transition-[filter] hover:brightness-95 disabled:cursor-not-allowed ${meta.cell}`
              : "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-stone-300/80 bg-white/80 px-3 py-2 text-left text-sm text-stone-900 transition-colors hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 max-sm:min-h-11"
        }
      >
        {variant === "field" && (
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
        )}
        <span className="truncate">{meta.label}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ left: pos.x, top: pos.y, width: pos.width, maxHeight: pos.height }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed z-[60] overflow-y-auto overscroll-contain rounded-lg border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl animate-scale-in"
          >
            {LIST_PRIORITY_ORDER.map((p) => {
              const m = LIST_PRIORITY[p];
              return (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={p === value}
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-brand-50 max-sm:min-h-11 ${
                    p === value ? "bg-brand-50/80 text-brand-800" : "text-stone-700"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} />
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  {p === value && <Check size={14} className="shrink-0 text-brand-600" />}
                </button>
              );
            })}
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
                placeholder="ค้นหา / พิมพ์ชื่อแท็กใหม่"
                /* text-base บนจอเล็ก: ต่ำกว่า 16px แล้ว iOS จะซูมหน้าเข้าเองและไม่ซูมกลับ */
                className="w-full rounded-md border border-stone-300/80 bg-white px-2.5 py-1.5 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm"
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
              {shown.length === 0 && !q.trim() && (
                <p className="px-2 py-3 text-center text-xs text-stone-400">
                  ยังไม่มีแท็ก — พิมพ์ชื่อด้านบนเพื่อสร้างอันแรก
                </p>
              )}
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
