import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { hasPermission } from "@/lib/access";
import { loadKpiData } from "./kpi-data";
import { TrackingClient } from "./tracking-client";

export const metadata: Metadata = {
  title: "KPI คอนเทนต์",
};

/**
 * แดชบอร์ดติดตาม KPI ทีมคอนเทนต์ (migration 0085) — **มุมมองปฏิทินรายคน**
 * (redesign 2026-08-28: กราฟแท่งรายวันเดิมดูยาก ผู้ใช้ขอเป็นปฏิทิน heatmap
 * ที่กดเลือกชื่อคนแล้วเห็นว่าส่งงานวันไหนบ้าง พร้อมแผงสถิติของคนนั้นด้านขวา)
 *
 * นับจาก "วันส่งงาน" (review_submitted_at → approved_at → posted_at ตามคำสั่งผู้ใช้
 * 2026-08-22) ภายในเดือนที่เลือก (เวลาไทย) แยกตามผู้รับผิดชอบงาน (assignee_id)
 * — ภาพรวมเทียบทั้งทีมอยู่ที่ `/content-tracking/overview`
 */
export default async function ContentTrackingPage({
  searchParams,
}: {
  /** `?person=<profile id>` — ลิงก์จากตารางภาพรวมทีมเปิดปฏิทินของคนนั้นได้ตรงๆ */
  searchParams: Promise<{ person?: string }>;
}) {
  const [{ access, tasks, categories, kpis, profiles, today, loadError }, sp] =
    await Promise.all([loadKpiData(), searchParams]);

  if (!hasPermission(access, "team")) return <AccessNotice />;

  // id ที่ไม่มีจริง (ลิงก์เก่า/คนถูกลบบัญชี) ตกกลับเป็นมุมมองทั้งทีม ไม่ใช่หน้าว่าง
  const initialPerson =
    sp.person && profiles.some((p) => p.id === sp.person) ? sp.person : "all";

  return (
    <PageContainer>
      <TrackingClient
        tasks={tasks}
        categories={categories}
        kpis={kpis}
        profiles={profiles}
        isAdmin={access.isAdmin}
        initialPerson={initialPerson}
        initialYear={today.year}
        initialMonth={today.month}
        initialDay={today.day}
        loadError={loadError}
      />
    </PageContainer>
  );
}
