"use client";

import { Check, ChevronDown, Stethoscope } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DoctorRow } from "@/lib/types";
import { useSignedUrl } from "./use-signed-url";

/* รูปโปรไฟล์หมอ — photo_path จาก bucket documents (signed URL มี cache ใน useSignedUrl)
   ไม่มีรูป = วงกลมไอคอนหูฟังแพทย์, doctor = null = วงกลมเส้นประ ("ไม่ระบุ") */

const AVATAR_SIZES = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-10 w-10",
} as const;

const AVATAR_ICON = { sm: 11, md: 14, lg: 18 } as const;

export function DoctorAvatar({
  doctor,
  size = "md",
}: {
  doctor: Pick<DoctorRow, "name" | "photo_path"> | null;
  size?: keyof typeof AVATAR_SIZES;
}) {
  const { url } = useSignedUrl(doctor?.photo_path ?? null);
  const cls = AVATAR_SIZES[size];
  if (!doctor) {
    return (
      <span
        className={`${cls} shrink-0 rounded-full border border-dashed border-stone-300 bg-white/50`}
      />
    );
  }
  if (doctor.photo_path && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={doctor.name}
        className={`${cls} shrink-0 rounded-full object-cover shadow-sm`}
      />
    );
  }
  return (
    <span
      className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700`}
    >
      <Stethoscope size={AVATAR_ICON[size]} />
    </span>
  );
}

/** แสดง "รูป + ชื่อหมอ" จากค่า doctor_name (text) — หาโปรไฟล์จากทะเบียนด้วยชื่อ
    ชื่อเก่าที่ไม่อยู่ในทะเบียน (ถูกลบ/สะกดต่าง) ยังแสดงเป็นข้อความพร้อมไอคอนตามเดิม */
export function DoctorNameChip({
  name,
  doctors,
  size = "sm",
}: {
  name: string | null;
  doctors: Pick<DoctorRow, "name" | "photo_path">[];
  size?: keyof typeof AVATAR_SIZES;
}) {
  if (!name) return null;
  const doctor = doctors.find((d) => d.name === name) ?? { name, photo_path: null };
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <DoctorAvatar doctor={doctor} size={size} />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

/**
 * Dropdown เลือกแพทย์จากทะเบียน (แสดงรูปโปรไฟล์ทุกตัวเลือก) — ใช้แทนช่องพิมพ์ชื่อเดิม
 * ค่าที่เก็บยังเป็น doctor_name (text) เหมือนเดิม: เลือกหมอ = ใส่ชื่อหมอลงช่อง
 * เมนู render ผ่าน portal + fixed แบบเดียวกับ PersonSelect (กันโดน overflow/transform ตัด)
 * ค่าเดิมที่ไม่ตรงกับทะเบียน (เคสเก่าพิมพ์เอง) แสดงเป็นตัวเลือก "ชื่อเดิม" ให้คงไว้ได้
 */
/** ขนาด/ตำแหน่งเมนูที่หนีบให้อยู่ในจอเสมอ — จอแคบใช้เกือบเต็มความกว้าง
    (ค่าเดิมตรึงไว้ 268px + คำนวณ x จาก innerWidth-276 ทำให้จอ <300px เมนูโผล่นอกจอ) */
function menuBox(btn: HTMLElement) {
  const r = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(300, vw - 16);
  const spaceBelow = vh - r.bottom - 8;
  const spaceAbove = r.top - 8;
  // กางลงล่างถ้าที่พอ ไม่งั้นกางขึ้นบน — สูงสุดเท่าที่ฝั่งนั้นเหลือ (ไม่เกิน 340)
  const below = spaceBelow >= Math.min(240, spaceAbove) || spaceBelow >= 240;
  const height = Math.min(340, below ? spaceBelow : spaceAbove);
  return {
    x: Math.max(8, Math.min(r.left, vw - width - 8)),
    y: below ? r.bottom + 4 : Math.max(8, r.top - height - 4),
    width,
    height: Math.max(160, height),
  };
}

export function DoctorSelect({
  doctors,
  value,
  onChange,
  disabled = false,
  id,
  placeholder = "— เลือกแพทย์ —",
}: {
  doctors: DoctorRow[];
  /** doctor_name ปัจจุบัน ("" = ไม่ระบุ) */
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<ReturnType<typeof menuBox> | null>(null);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    /* เลื่อนจอ/ย่อขยาย = ย้ายเมนูตามปุ่ม ไม่ใช่ปิดเมนู
       (ของเดิมปิดทิ้ง — บนมือถือคีย์บอร์ดที่เด้งขึ้นยิง resize ทันทีที่เมนูเปิด
        เมนูเลยหุบก่อนจะกดเลือกได้ = อาการ "กดเลือกหมอไม่ได้")
       เลื่อนภายในเมนูเองไม่ต้องคิดตำแหน่งใหม่ */
    const reposition = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      // ปุ่มถูกเลื่อนพ้นจอไปแล้ว — เมนูลอยเท้งเต้งไม่มีประโยชน์ ปิดทิ้ง
      if (r.bottom < 0 || r.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      setPos(menuBox(b));
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const active = doctors
    .filter((d) => d.active)
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
  // ค่าปัจจุบันไม่อยู่ในตัวเลือก (หมอถูกซ่อน/ถูกลบ/ชื่อสะกดแบบเก่า) — คงไว้ให้เลือกซ้ำได้
  const legacy =
    value !== "" && !active.some((d) => d.name === value) ? value : null;
  const q = query.trim().toLowerCase();
  const filtered =
    q === "" ? active : active.filter((d) => d.name.toLowerCase().includes(q));

  const toggle = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      setPos(menuBox(btnRef.current));
      setQuery("");
    }
    setOpen((o) => !o);
  };

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const selectedDoctor =
    value === "" ? null : (doctors.find((d) => d.name === value) ?? { name: value, photo_path: null });

  // py-2.5 = สูง ~44px ตามขนาดเป้านิ้วขั้นต่ำ (ของเดิม py-1.5 = 38px กดพลาดง่ายบนมือถือ)
  const itemClass =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-sm text-stone-700 transition-colors hover:bg-brand-50";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-lg border border-stone-300/80 bg-white/80 px-3 text-left text-sm text-stone-900 transition-colors duration-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400 sm:h-[38px]"
      >
        {selectedDoctor ? (
          <>
            <DoctorAvatar doctor={selectedDoctor} size="sm" />
            <span className="min-w-0 flex-1 truncate">{value}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-stone-400">
            {placeholder}
          </span>
        )}
        <ChevronDown size={15} className="shrink-0 text-stone-400" />
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
            className="fixed z-[60] flex flex-col rounded-lg border border-white/70 bg-white/95 shadow-xl backdrop-blur-xl animate-scale-in"
          >
            {/* ช่องกรอง — ทะเบียนมีได้หลายสิบชื่อ พิมพ์บางส่วนแล้วเลือกเร็วกว่าไล่หา
                โฟกัสอัตโนมัติเฉพาะเมาส์: บนมือถือคีย์บอร์ดจะเด้งมาบังลิสต์ทันที
                ทั้งที่ส่วนใหญ่แค่อยากกดเลือกจากรายการสั้นๆ (แตะช่องเองได้ถ้าจะค้น) */}
            <div className="p-1.5 pb-0">
              <input
                autoFocus={
                  typeof window !== "undefined" &&
                  window.matchMedia("(pointer: fine)").matches
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="พิมพ์ค้นหาชื่อหมอ..."
                className="w-full rounded-md border border-stone-200 bg-white px-2 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              <button type="button" role="option" aria-selected={value === ""}
                onClick={() => pick("")} className={itemClass}>
                <DoctorAvatar doctor={null} size="md" />
                <span className="min-w-0 flex-1 truncate text-left text-stone-500">
                  ไม่ระบุ
                </span>
                {value === "" && (
                  <Check size={14} className="ml-auto shrink-0 text-brand-600" />
                )}
              </button>
              {legacy && (
                <button type="button" role="option" aria-selected={value === legacy}
                  onClick={() => pick(legacy)} className={itemClass}>
                  <DoctorAvatar doctor={{ name: legacy, photo_path: null }} size="md" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {legacy}
                    <span className="text-xs text-stone-400"> (ชื่อเดิม)</span>
                  </span>
                  {value === legacy && (
                    <Check size={14} className="ml-auto shrink-0 text-brand-600" />
                  )}
                </button>
              )}
              {filtered.map((d) => (
                <button key={d.id} type="button" role="option"
                  aria-selected={d.name === value}
                  onClick={() => pick(d.name)} className={itemClass}>
                  <DoctorAvatar doctor={d} size="md" />
                  <span className="min-w-0 flex-1 truncate text-left">{d.name}</span>
                  {d.name === value && (
                    <Check size={14} className="ml-auto shrink-0 text-brand-600" />
                  )}
                </button>
              ))}
              {filtered.length === 0 && q !== "" && (
                <p className="px-2 py-2 text-xs text-stone-400">
                  ไม่พบชื่อนี้ — เพิ่มหมอใหม่ได้ที่ปุ่ม &quot;จัดการหมอ&quot; หน้า Influ Management
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
