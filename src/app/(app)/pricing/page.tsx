import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { PriceItemRow, PricePromotionRow } from "@/lib/types";
import { PriceItemsAdmin } from "./price-items-admin";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = {
  title: "Product Pricing",
};

export default async function PricingPage() {
  const supabase = await createClient();

  // รายการ price list (สำหรับหน้าสาธารณะ) — ดึงแบบแบ่งหน้า
  // หลังบ้านต้องเห็นทุกรายการรวมที่ซ่อนจากหน้าเว็บ (active=false) — ห้ามกรอง active ที่นี่
  // ถ้าหน้าไหนโหลดพลาดต้องส่ง error กลับไปแจ้งผู้ใช้ด้วย (แถวที่ได้มาแล้วอาจไม่ครบ)
  const fetchPriceItems = async (): Promise<{
    rows: PriceItemRow[];
    error: string | null;
  }> => {
    const rows: PriceItemRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("price_items")
        .select("*")
        .order("sort", { ascending: true })
        .range(offset, offset + 999);
      if (error) return { rows, error: error.message };
      rows.push(...((data ?? []) as PriceItemRow[]));
      if (!data || data.length < 1000) break;
    }
    return { rows, error: null };
  };

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data, error }, priceItemsResult] = await Promise.all([
    getAccess(),
    supabase
      .from("price_promotions")
      .select("*")
      .order("category", { ascending: true })
      .order("normal_price", { ascending: true }),
    fetchPriceItems(),
  ]);
  if (!hasPermission(access, "pricing")) return <AccessNotice />;

  const promotions = (data ?? []) as PricePromotionRow[];
  const demo = promotions.some((p) => p.note === "demo");

  return (
    <PageContainer>
      <PriceItemsAdmin
        items={priceItemsResult.rows}
        loadError={priceItemsResult.error}
      />
      <PricingClient
        promotions={promotions}
        demo={demo}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
