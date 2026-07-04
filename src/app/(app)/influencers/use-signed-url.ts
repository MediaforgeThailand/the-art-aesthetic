"use client";

import { useEffect, useState } from "react";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

/** แปลง storage path → signed URL (bucket documents เป็น private) */
export function useSignedUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let alive = true;
    const supabase = createClient();
    void supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  return url;
}
