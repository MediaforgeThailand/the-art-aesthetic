import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
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
  const fetchPriceItems = async () => {
    const rows: PriceItemRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("price_items")
        .select("*")
        .order("sort", { ascending: true })
        .range(offset, offset + 999);
      if (error) return rows;
      rows.push(...((data ?? []) as PriceItemRow[]));
      if (!data || data.length < 1000) break;
    }
    return rows;
  };

  const [{ data, error }, priceItems] = await Promise.all([
    supabase
      .from("price_promotions")
      .select("*")
      .order("category", { ascending: true })
      .order("normal_price", { ascending: true }),
    fetchPriceItems(),
  ]);

  const promotions = (data ?? []) as PricePromotionRow[];
  const demo = promotions.some((p) => p.note === "demo");

  return (
    <PageContainer>
      <PriceItemsAdmin items={priceItems} />
      <PricingClient
        promotions={promotions}
        demo={demo}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
