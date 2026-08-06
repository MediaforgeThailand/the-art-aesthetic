"use client";

import { Eraser, PenLine, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui";

/**
 * ครอปพื้นที่ว่างรอบลายเซนออก (เหลือขอบ 12px) — ลายเซนจะได้แสดงเต็มช่องในเอกสาร
 * ไม่ใช่ภาพเล็กจิ๋วกลางผืน canvas ใหญ่
 */
function trimmedPng(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  const { width, height } = canvas;
  const alpha = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL("image/png");
  const margin = 12;
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(width - 1, maxX + margin);
  maxY = Math.min(height - 1, maxY + margin);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return out.toDataURL("image/png");
}

/**
 * แผ่นเซนลายเซนดิจิทัลเต็มจอ — วาดด้วยเมาส์/นิ้ว หมึกสีน้ำเงิน
 * ใช้ไลบรารี signature_pad (Bézier curve + ความหนาเส้นตามความเร็วปากกา) ให้เส้นโค้งลื่นเหมือนเซนจริง
 * บันทึกเป็น PNG data URL (พื้นโปร่งใส) เพื่อแปะลงช่องเซนในเอกสาร
 */
export function SignaturePad({
  title,
  signerName,
  onSave,
  onClose,
}: {
  title: string;
  signerName?: string | null;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [dirty, setDirty] = useState(false);

  // Esc ปิด pad (stopPropagation กัน Modal ที่ซ้อนอยู่ข้างล่างปิดตาม)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      penColor: "#1d4ed8", // หมึกน้ำเงิน
      minWidth: 1,
      maxWidth: 2.8,
      throttle: 0, // เก็บทุกจุด ไม่ข้ามจุดตอนลากเร็ว — เส้นลื่นสุด
      minDistance: 1,
    });
    padRef.current = pad;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return; // ยังไม่ถูก layout — รอรอบถัดไป
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = Math.round(rect.width * ratio);
      const h = Math.round(rect.height * ratio);
      if (canvas.width === w && canvas.height === h) return;
      const data = pad.toData();
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.fromData(data); // วาดเส้นเดิมกลับหลัง resize
    };
    resize();

    // ResizeObserver ครอบคลุมทุกกรณีที่ขนาด canvas เปลี่ยน (ย่อหน้าต่าง, CSS โหลดช้า ฯลฯ)
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const onBegin = () => setDirty(true);
    pad.addEventListener("beginStroke", onBegin);
    window.addEventListener("resize", resize); // เผื่อ devicePixelRatio เปลี่ยน (ย้ายจอ)
    return () => {
      pad.removeEventListener("beginStroke", onBegin);
      window.removeEventListener("resize", resize);
      observer.disconnect();
      pad.off();
    };
  }, []);

  const undo = () => {
    const pad = padRef.current;
    if (!pad) return;
    const data = pad.toData();
    data.pop();
    pad.fromData(data);
    setDirty(data.length > 0);
  };

  const clear = () => {
    padRef.current?.clear();
    setDirty(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad || pad.isEmpty()) return;
    onSave(trimmedPng(canvas));
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-brand-900/40 p-4 backdrop-blur-sm animate-fade-in sm:p-8">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col rounded-2xl border border-white/70 bg-white shadow-2xl animate-scale-in">
        <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
          <PenLine size={17} className="text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-stone-900">{title}</p>
            {signerName && (
              <p className="text-xs text-stone-500">ผู้เซน: {signerName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="ml-auto cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 p-4">
          <canvas
            ref={canvasRef}
            className="h-full w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50"
          />
          {!dirty && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-300">
              ✍️ เซนลายเซนของคุณที่นี่
            </p>
          )}
          <div className="pointer-events-none absolute inset-x-16 bottom-14 border-b border-dotted border-stone-300" />
        </div>

        <div className="flex items-center gap-2 border-t border-stone-100 px-5 py-3 pb-safe-3 sm:pb-3">
          <Button variant="ghost" onClick={clear} disabled={!dirty}>
            <Eraser size={15} />
            ล้าง
          </Button>
          <Button variant="ghost" onClick={undo} disabled={!dirty}>
            <Undo2 size={15} />
            ย้อน
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={!dirty}>
              <PenLine size={15} />
              บันทึกลายเซน
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ช่องเซนในเอกสาร — ว่าง = ปุ่มกดเพื่อเซน, เซนแล้ว = แสดงลายเซนน้ำเงิน + วันที่ */
export function SignatureSlot({
  heading,
  name,
  position,
  signature,
  signedAt,
  onSign,
}: {
  heading: string;
  name: string | null;
  position?: string | null;
  signature: string | null;
  signedAt: string | null;
  onSign?: () => void;
}) {
  return (
    <div className="flex flex-col items-center border border-stone-300 px-3 py-3 text-center">
      <p className="text-sm font-semibold text-stone-800">{heading}</p>
      <div className="flex h-16 w-full items-center justify-center">
        {signature ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signature}
            alt={`ลายเซน${heading}`}
            className="max-h-16 max-w-full object-contain"
          />
        ) : onSign ? (
          <button
            type="button"
            onClick={onSign}
            className="cursor-pointer rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-4 py-2 text-xs font-medium text-brand-700 transition-all hover:bg-brand-100 active:scale-95"
          >
            ✍️ กดเพื่อเซน
          </button>
        ) : (
          <span className="text-xs text-stone-300">รอเซน</span>
        )}
      </div>
      <p className="w-full border-t border-dotted border-stone-300 pt-1.5 text-xs text-stone-700">
        ({name ?? "....................."})
      </p>
      {position && <p className="text-[11px] text-stone-500">{position}</p>}
      <p className="mt-1 text-[11px] text-stone-500">
        วันที่{" "}
        <span className="font-medium text-blue-700">
          {signedAt
            ? new Date(signedAt).toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "..................."}
        </span>
      </p>
    </div>
  );
}
