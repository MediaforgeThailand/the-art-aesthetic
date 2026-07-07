"use client";

import { useEffect, useState } from "react";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

/** cache signed URL ต่อ path — component ถูก unmount/mount บ่อย (เช่นพิมพ์ค้นหาแล้วการ์ด remount)
    ไม่ต้องยิงขอ URL ใหม่ทุกรอบ (แบบเดียวกับ signedUrlCache ใน tasks/task-card.tsx) */
const signedUrlCache = new Map<string, { url: string; at: number }>();
const SIGNED_URL_CACHE_MS = 50 * 60 * 1000; // ขอใหม่ก่อน URL หมดอายุจริง (1 ชม.)

/** แปลง storage path → signed URL (bucket documents เป็น private)
    failed = ขอ URL ไม่สำเร็จ (เช่นไฟล์ถูกลบจาก bucket) — ผู้เรียกควรแสดง placeholder นิ่ง
    แทนโครง "กำลังโหลด..." ค้างตลอดไป */
export function useSignedUrl(path: string | null): {
  url: string | null;
  failed: boolean;
} {
  const hit = path ? signedUrlCache.get(path) : undefined;
  const fresh =
    hit && Date.now() - hit.at < SIGNED_URL_CACHE_MS ? hit.url : null;
  const [url, setUrl] = useState<string | null>(fresh);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!path) {
      setUrl(null);
      return;
    }
    const cached = signedUrlCache.get(path);
    if (cached && Date.now() - cached.at < SIGNED_URL_CACHE_MS) {
      setUrl(cached.url);
      return;
    }
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
            setUrl(data?.signedUrl ?? null);
            setFailed(!data?.signedUrl);
          }
        },
        () => {
          if (alive) setFailed(true);
        }
      );
    return () => {
      alive = false;
    };
  }, [path]);

  return { url, failed };
}
