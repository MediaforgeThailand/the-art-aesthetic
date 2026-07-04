import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { PricePromotionRow } from "@/lib/types";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = {
  title: "Product Pricing",
};

export default async function PricingPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("price_promotions")
    .select("*")
    .order("category", { ascending: true })
    .order("normal_price", { ascending: true });

  const promotions = (data ?? []) as PricePromotionRow[];
  const demo = promotions.some((p) => p.note === "demo");

  return (
    <PageContainer>
      <PricingClient
        promotions={promotions}
        demo={demo}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
