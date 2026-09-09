"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMyAvailability } from "@/lib/queue/actions";
import { AVAILABILITY_LABEL, type Availability } from "@/lib/queue/types";

/**
 * BC กดสลับสถานะตัวเองได้แค่ "พร้อมรับคิว/ไม่ว่าง"
 * ส่วน "พักคิว/ลา" เป็นสิทธิ์แอดมิน — ที่นี่แสดงผลอย่างเดียว
 */
export default function AvailabilityToggle({ current }: { current: Availability }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (current !== "available" && current !== "busy") {
    return (
      <span className="rounded-lg bg-stone-100 px-3 py-1.5 text-sm text-stone-600">
        {AVAILABILITY_LABEL[current]} — แอดมินเป็นคนเปิดคืน
      </span>
    );
  }

  function set(next: "available" | "busy") {
    setError(null);
    startTransition(async () => {
      const result = await setMyAvailability(next);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex rounded-lg border border-stone-200 bg-white/80 p-0.5">
        {(["available", "busy"] as const).map((value) => (
          <button
            key={value}
            onClick={() => set(value)}
            disabled={pending}
            aria-pressed={current === value}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 disabled:opacity-60 ${
              current === value
                ? value === "available"
                  ? "bg-emerald-500 text-white"
                  : "bg-amber-500 text-white"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            {AVAILABILITY_LABEL[value]}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
