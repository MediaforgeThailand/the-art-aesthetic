import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import { getAccess, hasPermission } from "@/lib/access";
import { AccessNotice } from "@/components/access-notice";
import { WorkloadClient } from "./workload-client";

export const metadata: Metadata = {
  title: "ภาระงานทีม",
};

export default async function WorkloadPage() {
  const access = await getAccess();
  if (!hasPermission(access, "team")) return <AccessNotice />;

  const supabase = await createClient();

  // ดึง tasks แบบแบ่งหน้า — PostgREST ตัดที่ ~1,000 แถว
  const fetchTasks = async () => {
    const pageSize = 1000;
    const rows: TaskWithAssignee[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`โหลดข้อมูลงานไม่สำเร็จ: ${error.message}`);
      rows.push(...((data ?? []) as unknown as TaskWithAssignee[]));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  };

  // จุดเริ่มเดือนปัจจุบันตามเวลาไทย — ใช้นับ "ส่งงานแก้ไข" เดือนนี้ (วัด KPI รายคน)
  const bkkNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );
  const monthStart = `${bkkNow.getFullYear()}-${String(
    bkkNow.getMonth() + 1
  ).padStart(2, "0")}-01T00:00:00+07:00`;

  const [
    taskData,
    { data: profileData, error: profilesError },
    { data: sectionData, error: sectionsError },
    { data: revisionData, error: revisionsError },
  ] = await Promise.all([
    fetchTasks(),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true }),
    supabase
      .from("task_sections")
      .select("*")
      .order("position", { ascending: true }),
    supabase
      .from("task_comments")
      .select("task_id")
      .eq("is_revision", true)
      .gte("created_at", monthStart),
  ]);
  if (profilesError) {
    throw new Error(`โหลดข้อมูลทีมไม่สำเร็จ: ${profilesError.message}`);
  }
  if (sectionsError) {
    throw new Error(`โหลดข้อมูล section ไม่สำเร็จ: ${sectionsError.message}`);
  }
  if (revisionsError) {
    throw new Error(
      `โหลดข้อมูลการแก้ไขไม่สำเร็จ: ${revisionsError.message}`
    );
  }

  const tasks = taskData;
  const profiles = profileData ?? [];
  const sections = (sectionData ?? []) as TaskSectionRow[];
  const monthRevisions = (revisionData ?? []) as { task_id: string }[];

  return (
    <PageContainer>
      <WorkloadClient
        tasks={tasks}
        profiles={profiles}
        sections={sections}
        monthRevisions={monthRevisions}
      />
    </PageContainer>
  );
}
