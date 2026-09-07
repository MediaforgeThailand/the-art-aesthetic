import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { PriceItemRow, PromoPackageWithItems } from "@/lib/types";
import { PriceItemsAdmin } from "./price-items-admin";
import { PromoPackagesAdmin } from "./promo-packages-admin";

export const metadata: Metadata = {
  title: "Product Pricing",
};

/**
 * หลังบ้านราคา — 2 ส่วน: โปรที่ขึ้นหน้า /price-list (promo_packages) + ราคาอ้างอิงกลาง (price_items)
 *
 * ⚠️ การ์ด "โปรโมชันที่อนุมัติ" (ตาราง `price_promotions` โทนชมพู) ถูกถอดออกจากหน้านี้
 * เมื่อ 2026-08-29 เพื่อเร่ง v1.0 ตามคำสั่งผู้ใช้ — ตารางไม่เคยมีข้อมูลสักแถว (0 rows)
 * และงานจริงย้ายไปอยู่ที่ promo_packages หมดแล้ว — โค้ดของการ์ดนั้น (`pricing-client.tsx`)
 * ถูกลบออกตอนเก็บกวาดโค้ด 2026-09-08 (ดูได้จาก git history) ตาราง `price_promotions`
 * ยังอยู่ใน DB
 */
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
  const [access, priceItemsResult, promoResult] = await Promise.all([
    getAccess(),
    fetchPriceItems(),
    fetchPromoPackages(),
  ]);
  if (!hasPermission(access, "pricing")) return <AccessNotice />;

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
    </PageContainer>
  );
}
