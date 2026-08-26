import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { ContentCategoryRow, ContentKpiRow } from "@/lib/types";
import { TrackingClient, type TrackedTask } from "./tracking-client";

export const metadata: Metadata = {
  title: "KPI คอนเทนต์",
};

/**
 * แดชบอร์ดติดตาม KPI ทีมคอนเทนต์ (migration 0085) — หัวหน้าทีมดูรายเดือนว่าแต่ละคน
 * ทำครบตามเป้าที่ตั้งไว้ใน /content-kpi หรือยัง; นับจาก "วันส่งงาน"
 * (review_submitted_at → approved_at → posted_at ตามคำสั่งผู้ใช้ 2026-08-22)
 * ภายในเดือนที่เลือก (เวลาไทย) แยกตามผู้รับผิดชอบงาน (assignee_id)
 */
export default async function ContentTrackingPage() {
  const supabase = await createClient();

  // ดึงเฉพาะงานที่เคยส่งตรวจ/ตรวจผ่าน/โพสแล้ว คอลัมน์เท่าที่ใช้
  // — ไม่โหลด join/description มาทั้งก้อนแบบหน้า /tasks
  // embed task_files (เฉพาะ file_path) ให้ตัววิเคราะห์จำนวนชิ้นงานนับไฟล์ภาพ/วิดีโอต่อการ์ดได้
  const fetchTasks = async () => {
    const pageSize = 1000;
    const rows: TrackedTask[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, assignee_id, posted_at, approved_at, review_submitted_at, review_status, completed, content_format, content_category_id, files:task_files(file_path)"
        )
        .is("deleted_at", null)
        .or(
          "posted_at.not.is.null,review_status.eq.approved,review_submitted_at.not.is.null"
        )
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return { rows, error: error.message };
      rows.push(...((data ?? []) as unknown as TrackedTask[]));
      if (!data || data.length < pageSize) break;
    }
    return { rows, error: null as string | null };
  };

  const [access, tasksResult, categoriesResult, kpisResult, profilesResult] =
    await Promise.all([
      getAccess(),
      fetchTasks(),
      supabase
        .from("content_categories")
        .select("*")
        .order("position", { ascending: true }),
      supabase
        .from("content_kpis")
        .select("*")
        .order("position", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, full_name, email, avatar_path")
        .order("full_name", { ascending: true }),
    ]);

  if (!hasPermission(access, "team")) return <AccessNotice />;

  // เดือนปัจจุบันตามเวลาไทย คำนวณฝั่ง server — client render ครั้งแรกไม่ต้องแตะ Date.now()
  const bangkokNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );

  const loadError =
    tasksResult.error ??
    categoriesResult.error?.message ??
    kpisResult.error?.message ??
    profilesResult.error?.message ??
    null;

  return (
    <PageContainer>
      <TrackingClient
        tasks={tasksResult.rows}
        categories={(categoriesResult.data ?? []) as ContentCategoryRow[]}
        kpis={(kpisResult.data ?? []) as ContentKpiRow[]}
        profiles={profilesResult.data ?? []}
        isAdmin={access.isAdmin}
        initialYear={bangkokNow.getFullYear()}
        initialMonth={bangkokNow.getMonth() + 1}
        initialDay={bangkokNow.getDate()}
        loadError={loadError}
      />
    </PageContainer>
  );
}
