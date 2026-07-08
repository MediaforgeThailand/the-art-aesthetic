import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type {
  InfluencerLite,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import { TasksClient } from "./tasks-client";

export const metadata: Metadata = {
  title: "จัดการงาน",
};

export default async function TasksPage() {
  const access = await getAccess();
  if (!hasPermission(access, "team")) return <AccessNotice />;

  const supabase = await createClient();

  const userId = access.uid;

  // ดึง tasks แบบแบ่งหน้า — PostgREST ตัดที่ ~1,000 แถว
  const fetchTasks = async () => {
    const pageSize = 1000;
    const rows: TaskWithAssignee[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email), reviewer:profiles!tasks_reviewer_id_fkey(id, full_name, email), influencer:influencers!tasks_influencer_id_fkey(id, first_name, last_name, nickname), files:task_files(id, task_id, file_path, file_name, created_at)"
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

  const [
    sectionsResult,
    tasksResult,
    profilesResult,
    influencersResult,
    reviewersResult,
  ] = await Promise.all([
    supabase
      .from("task_sections")
      .select("*")
      .order("position", { ascending: true }),
    fetchTasks(),
    supabase
      .from("profiles")
      .select("id, full_name, email, default_reviewer_id")
      .order("full_name", { ascending: true }),
    supabase
      .from("influencers")
      .select("id, first_name, last_name, nickname")
      .order("created_at", { ascending: false }),
    supabase.from("task_reviewers").select("profile_id"),
  ]);

  const sections = (sectionsResult.data ?? []) as TaskSectionRow[];
  const tasks = tasksResult.rows;
  const profiles = profilesResult.data ?? [];
  const influencers = (influencersResult.data ?? []) as InfluencerLite[];
  const reviewerIds = (reviewersResult.data ?? []).map((r) => r.profile_id);
  const loadError =
    sectionsResult.error?.message ??
    tasksResult.error ??
    profilesResult.error?.message ??
    influencersResult.error?.message ??
    reviewersResult.error?.message ??
    null;

  return (
    <TasksClient
      sections={sections}
      tasks={tasks}
      profiles={profiles}
      influencers={influencers}
      reviewerIds={reviewerIds}
      userId={userId}
      isAdmin={access.isAdmin}
      loadError={loadError}
    />
  );
}
