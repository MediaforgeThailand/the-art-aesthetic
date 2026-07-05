import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import { TasksClient } from "./tasks-client";

export const metadata: Metadata = {
  title: "จัดการงาน",
};

export default async function TasksPage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  // ดึง tasks แบบแบ่งหน้า — PostgREST ตัดที่ ~1,000 แถว
  const fetchTasks = async () => {
    const pageSize = 1000;
    const rows: TaskWithAssignee[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email), reviewer:profiles!tasks_reviewer_id_fkey(id, full_name, email)"
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

  const [sectionsResult, tasksResult, profilesResult] = await Promise.all([
    supabase
      .from("task_sections")
      .select("*")
      .order("position", { ascending: true }),
    fetchTasks(),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true }),
  ]);

  const sections = (sectionsResult.data ?? []) as TaskSectionRow[];
  const tasks = tasksResult.rows;
  const profiles = profilesResult.data ?? [];
  const loadError =
    sectionsResult.error?.message ??
    tasksResult.error ??
    profilesResult.error?.message ??
    null;

  return (
    <TasksClient
      sections={sections}
      tasks={tasks}
      profiles={profiles}
      userId={userId}
      loadError={loadError}
    />
  );
}
