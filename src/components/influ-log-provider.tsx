"use client";

/**
 * ตัวส่งต่อ "ผู้ทำ" + "ผู้รับผิดชอบเคส" ของหน้าเดินงาน Influencer
 *
 * หน้าเดินงาน (`/influencers/[id]`) มี component ลูกหลายชั้นที่แก้ข้อมูลได้เอง
 * (stage ต่างๆ, โมดัลแก้ชื่อ, อัปโหลดไฟล์) — ส่ง actor เป็น prop ทีละชั้นแล้วพลาดง่าย
 * และทุกครั้งที่เพิ่ม UI แก้ไขใหม่จะลืมต่อสายจนไม่มี log
 *
 * จึงห่อทั้งหน้าไว้ด้วย provider ตัวเดียว แล้วให้ทุกจุดที่แก้ข้อมูลเรียก `useInfluLog()`
 * (ผู้ใช้ 2026-08-14: ทีมอื่นเข้ามาใช้ระบบด้วย ทุกการเปลี่ยนข้อมูลต้องรู้ว่าใครทำ)
 *
 * ตั้งแต่ 0095 provider เดียวกันนี้ถือ "ผู้รับผิดชอบของเคสที่เปิดอยู่" ด้วย เพื่อให้
 * `useInfluNotify()` ส่งแจ้งเตือนได้จากทุกชั้นโดยไม่ต้องรู้ว่าใครรับผิดชอบขั้นไหน
 * (ผู้ใช้ 2026-08-29: "การเปลี่ยน stage ต้องแจ้งเตือนผู้รับผิดชอบส่วนนั้นทุกคน")
 *
 * **เพิ่ม mutation ใหม่ในหน้าเคส = ต้องเรียกทั้ง `useInfluLog()` และ `useInfluNotify()`**
 */

import { createContext, useCallback, useContext, useMemo } from "react";
import { logInflu, type InfluLogActor, type InfluLogEntry } from "@/lib/influ-log";
import {
  notifyInflu,
  type InfluNotifyInput,
  type InfluNotifyTarget,
} from "@/lib/influ-notify";
import { createClient } from "@/lib/supabase/client";

const ActorContext = createContext<InfluLogActor>({ id: null, name: null });

/** เคสที่เปิดอยู่ + ผู้รับผิดชอบของมัน — null = หน้านั้นไม่ได้ผูกเคสใดเคสหนึ่ง */
type NotifyCase = {
  id: string;
  name: string;
  assignees: InfluNotifyTarget[];
};

const CaseContext = createContext<NotifyCase | null>(null);

export function InfluLogProvider({
  userId,
  userName,
  notifyCase = null,
  children,
}: {
  userId: string | null;
  userName: string | null;
  /** เคสที่หน้านี้กำลังเปิด — ส่งมาเมื่อไหร่ useInfluNotify() ถึงจะส่งแจ้งเตือนได้ */
  notifyCase?: NotifyCase | null;
  children: React.ReactNode;
}) {
  const actor = useMemo<InfluLogActor>(
    () => ({ id: userId, name: userName }),
    [userId, userName]
  );
  return (
    <ActorContext.Provider value={actor}>
      <CaseContext.Provider value={notifyCase}>{children}</CaseContext.Provider>
    </ActorContext.Provider>
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

/** สิ่งที่จุดเรียกต้องบอก — ที่เหลือ (เคส/ผู้รับ/ผู้ทำ) provider เติมให้ */
export type InfluNotifyEvent = Omit<
  InfluNotifyInput,
  "assignees" | "influencerId" | "influencerName"
>;

/**
 * คืนฟังก์ชันส่งแจ้งเตือนถึงผู้รับผิดชอบของเคสที่เปิดอยู่
 * (ตัดผู้ทำเองออกให้แล้วใน notifyInflu — จุดเรียกไม่ต้องเช็ค)
 */
export function useInfluNotify() {
  const actor = useContext(ActorContext);
  const c = useContext(CaseContext);
  const supabase = useMemo(() => createClient(), []);
  return useCallback(
    (event: InfluNotifyEvent) => {
      if (!c) return;
      notifyInflu(supabase, actor, {
        ...event,
        influencerId: c.id,
        influencerName: c.name,
        assignees: c.assignees,
      });
    },
    [supabase, actor, c]
  );
}
