"use client";

import { useEffect, useState } from "react";

/**
 * "เลื่อนมาถึงหรือยัง" — ใช้หน่วงการโหลด thumbnail วิดีโอ
 *
 * เบราว์เซอร์จำกัดจำนวน media player ต่อแท็บ (Chrome ~75 ตัว) — บอร์ด Task ที่มี
 * การ์ดวิดีโอเยอะกว่านั้น **ตัวที่เกินโควตาจะไม่โหลดเฟรมเลย** (ได้ช่องว่างแทนรูป
 * ทั้งที่ไฟล์ปกติ) และเมื่อสลับไปแท็บอื่นโควตาก็ยังไม่ว่างทันที ทำให้การ์ดในแท็บ
 * "รอตรวจ" พลอยไม่มี thumbnail ตามไปด้วย — วัดแล้วบอร์ดเปล่า = โหลดครบทุกใบ
 * ส่วนบอร์ดเต็ม = โหลดได้ไม่ถึงครึ่ง (2026-08-29)
 *
 * โหลดเฉพาะใบที่เลื่อนมาใกล้จอ (rootMargin เผื่อไว้ล่วงหน้า) จึงไม่มีทางเต็มโควตา
 * และประหยัด bandwidth ด้วย — พอเห็นแล้วถือว่าเห็นตลอด ไม่ unmount กลับ
 * (ตัว `<img>` ใช้ `loading="lazy"` ของเบราว์เซอร์ได้เลย ไม่ต้องใช้ hook นี้)
 */
export function useInView(rootMargin = "400px") {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!node || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, inView, rootMargin]);

  return [setNode, inView] as const;
}
