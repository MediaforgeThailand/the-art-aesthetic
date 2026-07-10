"use client";

import { EyeOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProfileRow } from "@/lib/types";
import { AssigneeAvatar, profileName } from "./task-card";

type ProfileOption = Pick<
  ProfileRow,
  "id" | "full_name" | "email" | "avatar_path"
>;

/** ตัวเลือกสถานะที่ยกเว้นได้ — key ตรงกับตัวกรองสถานะของบอร์ด */
const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: "working", label: "กำลังทำ" },
  { key: "pending", label: "รอตรวจ" },
  { key: "done", label: "เสร็จสมบูรณ์" },
];

/**
 * ตัวกรองแบบ "ยกเว้น" (ซ่อน) — ปุ่มเดียวในแถวตัวกรอง เปิด popover
 * ให้ยกเว้นได้ทั้งผู้รับผิดชอบและสถานะพร้อมกัน งานที่ตรงกับที่เลือกจะถูกซ่อน
 */
export function ExcludeFilter({
  profiles,
  userId,
  excludeAssignees,
  excludeStatuses,
  onToggleAssignee,
  onToggleStatus,
  onClear,
}: {
  profiles: ProfileOption[];
  userId: string | null;
  excludeAssignees: string[];
  excludeStatuses: string[];
  onToggleAssignee: (id: string) => void;
  onToggleStatus: (key: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // ปิด popover เมื่อคลิกนอกกล่อง หรือกด Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = excludeAssignees.length + excludeStatuses.length;
  const active = count > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="ยกเว้น (ซ่อน) งานตามผู้รับผิดชอบหรือสถานะ"
        aria-expanded={open}
        className={`inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
          active
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-stone-300/80 bg-white/80 text-stone-600 hover:border-brand-300 hover:text-brand-700"
        }`}
      >
        <EyeOff size={15} />
        ยกเว้น
        {active && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-cream">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="glass absolute left-0 top-full z-30 mt-1.5 w-64 rounded-xl p-3 shadow-xl animate-scale-in">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-700">
              ยกเว้น (ซ่อน) งานที่…
            </p>
            {active && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex cursor-pointer items-center gap-0.5 text-xs text-stone-400 transition-colors hover:text-brand-700"
              >
                <X size={12} />
                ล้าง
              </button>
            )}
          </div>

          {/* ยกเว้นตามสถานะ */}
          <p className="mb-1 mt-2 text-[11px] font-medium uppercase tracking-wide text-stone-400">
            สถานะ
          </p>
          <div className="space-y-0.5">
            {STATUS_OPTIONS.map((s) => (
              <CheckRow
                key={s.key}
                checked={excludeStatuses.includes(s.key)}
                label={s.label}
                onToggle={() => onToggleStatus(s.key)}
              />
            ))}
          </div>

          {/* ยกเว้นตามผู้รับผิดชอบ */}
          <p className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-wide text-stone-400">
            ผู้รับผิดชอบ
          </p>
          <div className="max-h-52 space-y-0.5 overflow-y-auto pr-0.5">
            <CheckRow
              checked={excludeAssignees.includes("none")}
              label="ไม่ระบุผู้รับผิดชอบ"
              avatar={<AssigneeAvatar assignee={null} size={5} />}
              onToggle={() => onToggleAssignee("none")}
            />
            {profiles.map((p) => (
              <CheckRow
                key={p.id}
                checked={excludeAssignees.includes(p.id)}
                label={`${profileName(p)}${p.id === userId ? " (ฉัน)" : ""}`}
                avatar={<AssigneeAvatar assignee={p} size={5} />}
                onToggle={() => onToggleAssignee(p.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckRow({
  checked,
  label,
  avatar,
  onToggle,
}: {
  checked: boolean;
  label: string;
  /** รูปโปรไฟล์หน้าชื่อ (แถวที่เป็นคน) */
  avatar?: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-stone-700 transition-colors hover:bg-brand-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-brand-600"
      />
      {avatar}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}
