import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalysisLinkRow,
  InfluencerLite,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import { TasksClient } from "./tasks-client";

export const metadata: Metadata = {
  title: "จัดการงาน",
};

export default async function TasksPage() {
  const supabase = await createClient();

  // ดึง tasks แบบแบ่งหน้า — PostgREST ตัดที่ ~1,000 แถว
  const fetchTasks = async () => {
    const pageSize = 1000;
    const rows: TaskWithAssignee[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_path), reviewer:profiles!tasks_reviewer_id_fkey(id, full_name, email, avatar_path), reviewer1b:profiles!tasks_reviewer1b_id_fkey(id, full_name, email, avatar_path), reviewer2:profiles!tasks_reviewer2_id_fkey(id, full_name, email, avatar_path), creator:profiles!tasks_created_by_fkey(id, full_name, email, avatar_path), poster:profiles!tasks_posted_by_fkey(id, full_name, email, avatar_path), influencer:influencers!tasks_influencer_id_fkey(id, first_name, last_name, nickname), files:task_files(id, task_id, file_path, file_name, created_at)"
        )
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return { rows, error: error.message };
      rows.push(...((data ?? []) as unknown as TaskWithAssignee[]));
      if (!data || data.length < pageSize) break;
    }
    return { rows, error: null as string | null };
  };

  // getAccess ยิงขนานกับ query หลัก — ไม่รอเช็คสิทธิ์จบก่อน (RLS กันข้อมูลอยู่แล้ว
  // แค่ทิ้งผลลัพธ์ถ้าไม่มีสิทธิ์) ประหยัด round trip ไป DB หนึ่งเที่ยวต่อการเปิดหน้า
  const [
    access,
    sectionsResult,
    tasksResult,
    profilesResult,
    influencersResult,
    reviewersResult,
    categoriesResult,
    settingsResult,
    analysisResult,
  ] = await Promise.all([
    getAccess(),
    supabase
      .from("task_sections")
      .select("*")
      .order("position", { ascending: true }),
    fetchTasks(),
    supabase
      .from("profiles")
      .select("id, full_name, email, avatar_path, default_reviewer_id")
      .order("full_name", { ascending: true }),
    supabase
      .from("influencers")
      .select("id, first_name, last_name, nickname")
      // ไม่รวมข้อมูลเก่าที่นำเข้า (archive-only) ในตัวเลือกผูกงานคอนเทนต์
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    supabase.from("task_reviewers").select("profile_id"),
    supabase
      .from("task_categories")
      .select("name")
      .order("created_at", { ascending: true }),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "default_reviewer_id",
        "default_reviewer1b_id",
        "default_reviewer2_id",
      ]),
    // แท็บ "ผลวิเคราะห์" — เรียง/จัดกลุ่มจริงทำฝั่ง client (ข้อมูลโตช้า สัปดาห์ละไม่กี่ลิงก์)
    supabase
      .from("analysis_links")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (!hasPermission(access, "team")) return <AccessNotice />;
  const userId = access.uid;

  const sections = (sectionsResult.data ?? []) as TaskSectionRow[];
  const tasks = tasksResult.rows;
  const profiles = profilesResult.data ?? [];
  const influencers = (influencersResult.data ?? []) as InfluencerLite[];
  const reviewerIds = (reviewersResult.data ?? []).map((r) => r.profile_id);
  const categories = (categoriesResult.data ?? []).map((c) => c.name);
  const settingRows = settingsResult.data ?? [];
  const defaultReviewerId =
    settingRows.find((r) => r.key === "default_reviewer_id")?.value ?? null;
  const defaultReviewer1bId =
    settingRows.find((r) => r.key === "default_reviewer1b_id")?.value ?? null;
  const defaultReviewer2Id =
    settingRows.find((r) => r.key === "default_reviewer2_id")?.value ?? null;
  const analysisLinks = (analysisResult.data ?? []) as AnalysisLinkRow[];
  const loadError =
    sectionsResult.error?.message ??
    tasksResult.error ??
    profilesResult.error?.message ??
    influencersResult.error?.message ??
    reviewersResult.error?.message ??
    categoriesResult.error?.message ??
    analysisResult.error?.message ??
    null;

  return (
    <TasksClient
      sections={sections}
      tasks={tasks}
      profiles={profiles}
      influencers={influencers}
      reviewerIds={reviewerIds}
      defaultReviewerId={defaultReviewerId}
      defaultReviewer1bId={defaultReviewer1bId}
      defaultReviewer2Id={defaultReviewer2Id}
      categories={categories}
      analysisLinks={analysisLinks}
      userId={userId}
      isAdmin={access.isAdmin}
      loadError={loadError}
    />
  );
}
