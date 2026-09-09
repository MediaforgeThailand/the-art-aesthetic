"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * กันไม่ให้ความผิดพลาดชั่วคราว (เช่นฐานข้อมูลตอบ 401 ระหว่างอ่านสิทธิ์)
 * กลายเป็นหน้าเปล่าที่อ่านไม่ออก — บอกให้ลองใหม่ตรงๆ ดีกว่า
 */
export default function QueueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="glass mx-auto mt-6 max-w-md rounded-xl p-6 text-center">
      <AlertCircle size={36} className="mx-auto text-rose-500" />
      <h1 className="mt-3 text-base font-semibold text-stone-900">ระบบขัดข้องชั่วคราว</h1>
      <p className="mt-1 text-sm text-stone-600">
        โหลดข้อมูลไม่สำเร็จ กดลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งแอดมิน
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-stone-400">รหัสอ้างอิง {error.digest}</p>
      )}
      <Button className="mx-auto mt-4" onClick={reset}>
        <RotateCw size={16} /> ลองอีกครั้ง
      </Button>
    </div>
  );
}
