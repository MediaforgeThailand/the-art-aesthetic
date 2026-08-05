"use client";

/**
 * ตัวช่วยของ "เมนูลอย" ที่ render ผ่าน portal + position:fixed
 * (DoctorSelect, PersonSelect, AssigneePicker, ตัวกรองยกเว้น ฯลฯ)
 *
 * ทำไมต้องมีไฟล์นี้ — บทเรียนจาก audit 2026-08-05:
 * เมนูพวกนี้เคยสั่งปิดตัวเองเมื่อได้ยิน `resize`/`scroll` เพราะตำแหน่ง fixed จะค้างผิดที่
 * แต่บนมือถือ **คีย์บอร์ดที่เด้งขึ้นยิง `resize` ทันที** และการแตะก็ทำให้หน้าเลื่อนนิดหน่อย
 * เมนูจึงหุบก่อนนิ้วจะแตะเลือกได้ = อาการ "กดเลือกไม่ได้" ที่ผู้ใช้เจอ
 * วิธีที่ถูกคือ **ย้ายตำแหน่งตามปุ่ม** แล้วปิดเฉพาะตอนปุ่มเลื่อนพ้นจอไปจริงๆ
 */

import { useEffect, useRef, type RefObject } from "react";

export type MenuBox = { x: number; y: number; width: number; height: number };

/**
 * กล่องเมนูที่หนีบให้อยู่ในจอเสมอ — กางลงล่างถ้าที่พอ ไม่งั้นกางขึ้นบน
 * จอแคบกว่าความกว้างที่ขอ จะย่อให้พอดีจอ (เว้นขอบข้างละ 8px)
 */
export function menuBox(
  anchor: HTMLElement,
  opts: { width?: number; maxHeight?: number; gap?: number } = {}
): MenuBox {
  const { width: want = 280, maxHeight = 320, gap = 4 } = opts;
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(want, vw - 16);
  const spaceBelow = vh - r.bottom - gap - 8;
  const spaceAbove = r.top - gap - 8;
  const below = spaceBelow >= Math.min(maxHeight, 200) || spaceBelow >= spaceAbove;
  const height = Math.max(
    160,
    Math.min(maxHeight, below ? spaceBelow : spaceAbove)
  );
  return {
    x: Math.max(8, Math.min(r.left, vw - width - 8)),
    y: below ? r.bottom + gap : Math.max(8, r.top - height - gap),
    width,
    height,
  };
}

/**
 * ผูกพฤติกรรมมาตรฐานของเมนูลอยให้ครบทีเดียว:
 * แตะนอกเมนู = ปิด · Esc = ปิด · เลื่อนจอ/ย่อขยาย = ย้ายตำแหน่งตามปุ่ม
 * (เลื่อนภายในเมนูเองไม่นับ, ปุ่มพ้นจอแล้วค่อยปิด)
 */
export function useAnchoredMenu({
  open,
  anchorRef,
  menuRef,
  onClose,
  onReposition,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** คำนวณตำแหน่งใหม่จากปุ่ม — เรียกทุกครั้งที่จอขยับ */
  onReposition: (anchor: HTMLElement) => void;
}) {
  // เก็บ callback ล่าสุดไว้ใน ref — ผู้เรียกส่ง arrow function ใหม่ทุก render
  // ผูกเป็น dependency ตรงๆ จะถอด/ใส่ listener ไม่จบ
  // (เขียน ref ใน effect ไม่ใช่ตอน render — react-hooks/refs ห้ามแตะ .current ระหว่าง render)
  const closeRef = useRef(onClose);
  const placeRef = useRef(onReposition);
  useEffect(() => {
    closeRef.current = onClose;
    placeRef.current = onReposition;
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    const reposition = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        closeRef.current();
        return;
      }
      placeRef.current(a);
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
  }, [open, anchorRef, menuRef]);
}
