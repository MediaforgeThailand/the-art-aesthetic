import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { PriceItemRow } from "@/lib/types";
import { PriceListClient } from "./price-list-client";

export const metadata: Metadata = {
  title: "Price List & Promotion",
  description:
    "The ART Aesthetic — รายการราคาและโปรโมชันหัตถการความงาม อัปเดตล่าสุดจากคลินิก",
};

// หน้าสาธารณะ ราคา/โปรอัพเดทจากหลังบ้านต้องสดเสมอ
export const dynamic = "force-dynamic";

export default async function PriceListPage() {
  const supabase = await createClient();

  // ดึงทั้งหมดแบบแบ่งหน้า — PostgREST ตัดที่ ~1,000 แถว
  const items: PriceItemRow[] = [];
  let loadError: string | null = null;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("price_items")
      .select("*")
      .eq("active", true)
      .order("sort", { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      loadError = error.message;
      break;
    }
    items.push(...((data ?? []) as PriceItemRow[]));
    if (!data || data.length < 1000) break;
  }

  return <PriceListClient items={items} loadError={loadError} />;
}
