"use client";

import { useEffect } from "react";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { useSyncedState } from "@/lib/use-synced-state";

/** cache signed URL ต่อ path — component ถูก unmount/mount บ่อย (เช่นพิมพ์ค้นหาแล้วการ์ด remount
    หรือลากย้ายคอลัมน์บนบอร์ด) ไม่ต้องยิงขอ URL ใหม่ทุกรอบ
    **cache ก้อนนี้ต้องมีก้อนเดียวทั้งแอป** — เคยมี hook `useCachedSignedUrl` ซ้ำอีกตัวใน
    tasks/task-card.tsx พร้อม cache ของตัวเอง ทำให้ path เดียวกันถูกขอ URL สองรอบ
    (การ์ดบอร์ดใช้ตัวหนึ่ง แกลเลอรี/แผงงานใช้อีกตัว) — รวมเป็นตัวนี้แล้ว 2026-08-31 */
const signedUrlCache = new Map<string, { url: string; at: number }>();
const SIGNED_URL_CACHE_MS = 50 * 60 * 1000; // ขอใหม่ก่อน URL หมดอายุจริง (1 ชม.)

/** URL ที่ยัง cache อยู่ (null = ไม่มี/หมดอายุ)
    อยู่ระดับโมดูลเพราะเรียก Date.now() — เรียกตรงๆ ในตัว hook จะติดกฎ react-hooks/purity */
function cachedUrl(path: string | null): string | null {
  if (!path) return null;
  const hit = signedUrlCache.get(path);
  return hit && Date.now() - hit.at < SIGNED_URL_CACHE_MS ? hit.url : null;
}

/** แปลง storage path → signed URL (bucket documents เป็น private)
    failed = ขอ URL ไม่สำเร็จ (เช่นไฟล์ถูกลบจาก bucket) — ผู้เรียกควรแสดง placeholder นิ่ง
    แทนโครง "กำลังโหลด..." ค้างตลอดไป */
export function useSignedUrl(path: string | null): {
  url: string | null;
  failed: boolean;
} {
  // path เปลี่ยน = รีเซ็ตค่าให้ตอน render เลย (ไม่ใช่ setState ใน effect)
  const [state, setState] = useSyncedState(path, (p) => ({
    url: cachedUrl(p),
    failed: false,
  }));

  useEffect(() => {
    if (!path) return;
    // มีใน cache แล้ว — ค่าถูกใส่ให้ตั้งแต่ตอน render ไม่ต้องยิงซ้ำ
    if (cachedUrl(path)) return;
    let alive = true;
    const supabase = createClient();
    void supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .createSignedUrl(path, 3600)
      .then(
        ({ data }) => {
          if (data?.signedUrl) {
            signedUrlCache.set(path, { url: data.signedUrl, at: Date.now() });
          }
          if (alive) {
            setState({
              url: data?.signedUrl ?? null,
              failed: !data?.signedUrl,
            });
          }
        },
        () => {
          if (alive) setState((s) => ({ ...s, failed: true }));
        }
      );
    return () => {
      alive = false;
    };
  }, [path, setState]);

  return state;
}
