import type { Metadata } from "next";
import { SALES_ASSISTANT_FROM } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { PromoPackageWithItems } from "@/lib/types";
import { PriceListClient } from "./price-list-client";

export const metadata: Metadata = {
  title: "Price List & Promotion",
  description:
    "The ART Aesthetic — โปรโมชันหัตถการความงามที่เปิดขายอยู่ตอนนี้ พร้อมส่วนลดและวันหมดเขต",
};

// หน้าสาธารณะ ราคา/โปรอัพเดทจากหลังบ้านต้องสดเสมอ
export const dynamic = "force-dynamic";

export default async function PriceListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // `?from=sales` = เปิดมาจากแอป Sales Assistant บน iPad → โชว์ปุ่มกลับ
  // อ่านฝั่ง server เลย ไม่ใช้ useSearchParams เพื่อไม่ต้องมี Suspense คร่อม client
  const { from } = await searchParams;
  const fromSales = from === SALES_ASSISTANT_FROM;

  const supabase = await createClient();

  // ดึงทั้งหมดแบบแบ่งหน้า — PostgREST ตัดที่ ~1,000 แถว
  const items: PromoPackageWithItems[] = [];
  let loadError: string | null = null;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("promo_packages")
      .select("*, items:promo_package_items(*)")
      .eq("active", true)
      .order("sort", { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      loadError = error.message;
      break;
    }
    items.push(...((data ?? []) as unknown as PromoPackageWithItems[]));
    if (!data || data.length < 1000) break;
  }

  return (
    <PriceListClient
      packages={items}
      loadError={loadError}
      fromSales={fromSales}
    />
  );
}
