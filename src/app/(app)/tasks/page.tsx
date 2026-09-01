import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { getAccess, hasPermission } from "@/lib/access";
import { fetchInfluTagOptions } from "@/lib/influ-tags";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalysisLinkRow,
  ContentCategoryRow,
  DoctorLite,
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
          "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_path), reviewer:profiles!tasks_reviewer_id_fkey(id, full_name, email, avatar_path), reviewer1b:profiles!tasks_reviewer1b_id_fkey(id, full_name, email, avatar_path), reviewer2:profiles!tasks_reviewer2_id_fkey(id, full_name, email, avatar_path), creator:profiles!tasks_created_by_fkey(id, full_name, email, avatar_path), poster:profiles!tasks_posted_by_fkey(id, full_name, email, avatar_path), influencer:influencers!tasks_influencer_id_fkey(id, first_name, last_name, nickname, round_no), doctor:doctors!tasks_doctor_id_fkey(id, name, nickname, license_no, photo_path), files:task_files(id, task_id, file_path, file_name, created_at)"
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
    influOptions,
    doctorsResult,
    reviewersResult,
    categoriesResult,
    contentCategoriesResult,
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
      // ระบบทีมมีแค่คนที่มีสิทธิ์ team — คนที่มีแต่สิทธิ์ระบบ Influencer/Wellness
      // ต้องไม่โผล่ในตัวเลือกผู้รับผิดชอบ/ผู้ตรวจ และเมนูแท็กคนในแชท
      .contains("permissions", ["team"])
      .order("full_name", { ascending: true }),
    // ตัวเลือก influ ของแท็ก — เฉพาะเคสที่ผ่าน Memo แล้ว (ตั้งแต่ขั้นสัญญาเป็นต้นไป)
    // พร้อมข้อมูลที่ใช้ประกอบแฮชแท็กบังคับ ดู `fetchInfluTagOptions`
    fetchInfluTagOptions(),
    // ทะเบียนหมอที่ยังเปิดใช้ — หมอที่ถูกซ่อนแล้วยังโชว์บนงานเก่าได้ผ่าน embed `doctor`
    // ทีมคอนเทนต์ติดแท็กเฉพาะหมอทีม Aesthetics (0103) — กรองที่ DB ไม่ต้อง select teams
    supabase
      .from("doctors")
      .select("id, name, nickname, license_no, photo_path")
      .contains("teams", ["aesthetics"])
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase.from("task_reviewers").select("profile_id"),
    supabase
      .from("task_categories")
      .select("name")
      .order("created_at", { ascending: true }),
    // หมวดเนื้อหาคอนเทนต์ (KPI) — ใช้ในกล่องติดประเภทตอนกดโพส + ช่องในแผงงาน
    supabase
      .from("content_categories")
      .select("*")
      .order("position", { ascending: true }),
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
  const doctors = (doctorsResult.data ?? []) as DoctorLite[];
  const reviewerIds = (reviewersResult.data ?? []).map((r) => r.profile_id);
  const categories = (categoriesResult.data ?? []).map((c) => c.name);
  const contentCategories = (contentCategoriesResult.data ??
    []) as ContentCategoryRow[];
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
    doctorsResult.error?.message ??
    reviewersResult.error?.message ??
    categoriesResult.error?.message ??
    contentCategoriesResult.error?.message ??
    analysisResult.error?.message ??
    null;

  return (
    <TasksClient
      sections={sections}
      tasks={tasks}
      profiles={profiles}
      influencers={influOptions}
      doctors={doctors}
      reviewerIds={reviewerIds}
      defaultReviewerId={defaultReviewerId}
      defaultReviewer1bId={defaultReviewer1bId}
      defaultReviewer2Id={defaultReviewer2Id}
      categories={categories}
      contentCategories={contentCategories}
      analysisLinks={analysisLinks}
      userId={userId}
      isAdmin={access.isAdmin}
      loadError={loadError}
    />
  );
}
