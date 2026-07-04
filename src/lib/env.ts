// ค่า fallback ด้านล่างเป็นค่า "publishable" ของโปรเจกต์ TheArtAesthetic
// (ถูกส่งให้ browser ทุกคนอยู่แล้วโดยดีไซน์ — ไม่ใช่ secret, ข้อมูลถูกคุมด้วย RLS)
// ใส่ไว้เพื่อให้ build บน Vercel ทำงานแม้ env var ไม่ถูกส่งเข้าขั้น build
const FALLBACK_URL = "https://zcoqzasbtgfccuibteji.supabase.co";
const FALLBACK_ANON_KEY = "sb_publishable_1COg-C4NN28DNHcOUzj9Jg_YvlwMiJm";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || FALLBACK_URL;
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || FALLBACK_ANON_KEY;

/** true เมื่อตั้งค่า Supabase จริงแล้ว (ไม่ใช่ค่า placeholder) */
export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR-PROJECT") &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes("YOUR_ANON_KEY")
  );
}
