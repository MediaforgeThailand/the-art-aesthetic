"use client";

/**
 * ตัวส่งต่อ "ผู้ทำ" ของ log ระบบ Influencer
 *
 * หน้าเดินงาน (`/influencers/[id]`) มี component ลูกหลายชั้นที่แก้ข้อมูลได้เอง
 * (stage ต่างๆ, โมดัลแก้ชื่อ, อัปโหลดไฟล์) — ส่ง actor เป็น prop ทีละชั้นแล้วพลาดง่าย
 * และทุกครั้งที่เพิ่ม UI แก้ไขใหม่จะลืมต่อสายจนไม่มี log
 *
 * จึงห่อทั้งหน้าไว้ด้วย provider ตัวเดียว แล้วให้ทุกจุดที่แก้ข้อมูลเรียก `useInfluLog()`
 * (ผู้ใช้ 2026-08-14: ทีมอื่นเข้ามาใช้ระบบด้วย ทุกการเปลี่ยนข้อมูลต้องรู้ว่าใครทำ)
 */

import { createContext, useCallback, useContext, useMemo } from "react";
import { logInflu, type InfluLogActor, type InfluLogEntry } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";

const ActorContext = createContext<InfluLogActor>({ id: null, name: null });

export function InfluLogProvider({
  userId,
  userName,
  children,
}: {
  userId: string | null;
  userName: string | null;
  children: React.ReactNode;
}) {
  const actor = useMemo<InfluLogActor>(
    () => ({ id: userId, name: userName }),
    [userId, userName]
  );
  return (
    <ActorContext.Provider value={actor}>{children}</ActorContext.Provider>
  );
}

/** คืนฟังก์ชันบันทึก log — เรียกได้เลยไม่ต้อง await (fire-and-forget ที่มี .then ให้แล้ว) */
export function useInfluLog() {
  const actor = useContext(ActorContext);
  const supabase = useMemo(() => createClient(), []);
  return useCallback(
    (entry: InfluLogEntry) => logInflu(supabase, actor, entry),
    [supabase, actor]
  );
}
