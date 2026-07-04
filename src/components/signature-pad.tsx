"use client";

import { Eraser, PenLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/**
 * แผ่นเซนลายเซนดิจิทัลเต็มจอ — วาดด้วยเมาส์/นิ้ว หมึกสีน้ำเงิน
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
  const drawing = useRef(false);
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
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1d4ed8"; // หมึกน้ำเงิน
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture ใช้ไม่ได้ในบางกรณี (เช่น synthetic events) — วาดต่อได้ปกติ
    }
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setDirty(true);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !dirty) return;
    onSave(canvas.toDataURL("image/png"));
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
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="h-full w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50"
          />
          {!dirty && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-300">
              ✍️ เซนลายเซนของคุณที่นี่
            </p>
          )}
          <div className="pointer-events-none absolute inset-x-16 bottom-14 border-b border-dotted border-stone-300" />
        </div>

        <div className="flex items-center gap-2 border-t border-stone-100 px-5 py-3">
          <Button variant="ghost" onClick={clear} disabled={!dirty}>
            <Eraser size={15} />
            ล้าง
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
