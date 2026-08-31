"use client";

import { useState, useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * state ที่ seed จาก props แล้วรีเซ็ตตาม props ชุดใหม่ทุกครั้งที่ค่าอ้างอิงเปลี่ยน
 * — ใช้แทนแพตเทิร์น `useEffect(() => setX(prop), [prop])` ที่กระจายอยู่ทั้งระบบ
 *
 * ทำไมต้องเปลี่ยน: effect sync ทำให้ React render รอบแรกด้วย "ค่าเก่า" commit ลงจอ
 * แล้วค่อย setState ใน effect → render รอบสอง (ผู้ใช้เห็นข้อมูลชุดก่อนวูบหนึ่งเฟรม
 * ทุกครั้งที่ router.refresh() ส่ง props ใหม่มา) การปรับ state ระหว่าง render แบบนี้
 * React จะทิ้ง output รอบแรกแล้ว render ใหม่ทันทีก่อน commit — ไม่มีเฟรมค่าเก่าเลย
 * และเป็นแพตเทิร์นที่ React แนะนำเองแทน effect sync
 *
 * `transform` ใช้เมื่อรูปของ state ไม่ตรงกับ props (เช่น array → Set)
 * — ถูกเรียกเฉพาะตอน source เปลี่ยนจริงเท่านั้น
 */
export function useSyncedState<S>(
  source: S
): [S, Dispatch<SetStateAction<S>>];
export function useSyncedState<S, T>(
  source: S,
  transform: (value: S) => T
): [T, Dispatch<SetStateAction<T>>];
export function useSyncedState<S, T>(
  source: S,
  transform?: (value: S) => T
): [T, Dispatch<SetStateAction<T>>] {
  const map = (value: S): T =>
    transform ? transform(value) : (value as unknown as T);
  const [value, setValue] = useState<T>(() => map(source));
  const [seen, setSeen] = useState<S>(source);
  if (!Object.is(seen, source)) {
    setSeen(source);
    setValue(map(source));
  }
  return [value, setValue];
}

const subscribeNever = () => () => {};

/**
 * false ตอน SSR และ render รอบแรกของ client, true หลัง hydrate เสร็จ
 * — ใช้แทน `useEffect(() => setMounted(true), [])` สำหรับ UI ที่ต้องวัดขนาดจริง
 * หรือพึ่ง API ของเบราว์เซอร์ (ค่า server/client รอบแรกตรงกันเสมอ จึงไม่เกิด hydration mismatch)
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}
