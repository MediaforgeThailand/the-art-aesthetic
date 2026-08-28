import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { hasPermission } from "@/lib/access";
import { loadKpiData } from "../kpi-data";
import { OverviewClient } from "./overview-client";

export const metadata: Metadata = {
  title: "ภาพรวม KPI ทีมคอนเทนต์",
};

/**
 * ภาพรวม KPI ทีมคอนเทนต์ — หน้าเทียบทุกคนแบบ list/table (ผู้ใช้ 2026-08-28:
 * "ไม่เอากราฟแท่งที่ดูยาก เน้นเป็น list, table, stats แบบ KPI รวม : VDO = 42/100")
 *
 * ใช้ชุดข้อมูล + ตรรกะเดียวกับหน้าปฏิทิน `/content-tracking` เป๊ะ (loadKpiData +
 * computeKpiMonth) ตัวเลขสองหน้าจึงตรงกันเสมอ
 */
export default async function ContentOverviewPage() {
  const { access, tasks, categories, kpis, profiles, today, loadError } =
    await loadKpiData();

  if (!hasPermission(access, "team")) return <AccessNotice />;

  return (
    <PageContainer>
      <OverviewClient
        tasks={tasks}
        categories={categories}
        kpis={kpis}
        profiles={profiles}
        isAdmin={access.isAdmin}
        initialYear={today.year}
        initialMonth={today.month}
        initialDay={today.day}
        loadError={loadError}
      />
    </PageContainer>
  );
}
