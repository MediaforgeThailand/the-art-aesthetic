import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type {
  PriceItemRow,
  PricePromotionRow,
  PromoPackageWithItems,
} from "@/lib/types";
import { PriceItemsAdmin } from "./price-items-admin";
import { PricingClient } from "./pricing-client";
import { PromoPackagesAdmin } from "./promo-packages-admin";

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

  // โปรที่ขึ้นหน้าสาธารณะ /price-list — หลังบ้านต้องเห็นทั้งที่ซ่อนอยู่ (active=false)
  const fetchPromoPackages = async (): Promise<{
    rows: PromoPackageWithItems[];
    error: string | null;
  }> => {
    const rows: PromoPackageWithItems[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("promo_packages")
        .select("*, items:promo_package_items(*)")
        .order("sort", { ascending: true })
        .range(offset, offset + 999);
      if (error) return { rows, error: error.message };
      rows.push(...((data ?? []) as unknown as PromoPackageWithItems[]));
      if (!data || data.length < 1000) break;
    }
    return { rows, error: null };
  };

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [access, { data, error }, priceItemsResult, promoResult] = await Promise.all([
    getAccess(),
    supabase
      .from("price_promotions")
      .select("*")
      // โปรที่เลยวันหมดเขตถือว่าปิดไปแล้ว — ไม่ดึงมาแสดง (แถวยังอยู่ในตารางเป็นประวัติ)
      .or(`expires_on.is.null,expires_on.gte.${todayISO()}`)
      .order("category", { ascending: true })
      .order("normal_price", { ascending: true }),
    fetchPriceItems(),
    fetchPromoPackages(),
  ]);
  if (!hasPermission(access, "pricing")) return <AccessNotice />;

  const promotions = (data ?? []) as PricePromotionRow[];
  const demo = promotions.some((p) => p.note === "demo");

  return (
    <PageContainer>
      <PromoPackagesAdmin
        packages={promoResult.rows}
        loadError={promoResult.error}
      />
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
