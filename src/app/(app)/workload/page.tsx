import type { Metadata } from "next";
import { PageContainer } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type {
  RevisionKind,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import { getAccess, hasPermission } from "@/lib/access";
import { AccessNotice } from "@/components/access-notice";
import { fetchTaskMedia } from "@/lib/media-query";
import { WorkloadClient } from "./workload-client";

export const metadata: Metadata = {
  title: "Team Workload",
};

export default async function WorkloadPage() {
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
        .is("deleted_at", null) // ไม่นับงานในถังขยะ
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`โหลดข้อมูลงานไม่สำเร็จ: ${error.message}`);
      rows.push(...((data ?? []) as unknown as TaskWithAssignee[]));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  };

  // จุดเริ่มนับ KPI การตีกลับ — อ่านจาก app_settings key 'kpi_reset_at' (migration 0064)
  // ผู้ใช้สั่งให้ "เริ่มนับใหม่" เมื่อ 2026-08-08 จึงไม่ผูกกับต้นเดือนอีกต่อไป
  // ไม่มีค่า = ตกกลับไปนับตั้งแต่ต้นเดือนปัจจุบัน (พฤติกรรมเดิม)
  const bkkNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );
  const monthStart = `${bkkNow.getFullYear()}-${String(
    bkkNow.getMonth() + 1
  ).padStart(2, "0")}-01T00:00:00+07:00`;
  const { data: resetRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "kpi_reset_at")
    .maybeSingle();
  const kpiSince = resetRow?.value ?? monthStart;

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    access,
    taskData,
    { data: profileData, error: profilesError },
    { data: sectionData, error: sectionsError },
    { data: revisionData, error: revisionsError },
    media,
    claimsRes,
  ] = await Promise.all([
    getAccess(),
    fetchTasks(),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      // นับเฉพาะคนในทีม (สิทธิ์ team) — คนที่มีแต่สิทธิ์ระบบอื่นไม่ใช่แถวของหน้านี้
      .contains("permissions", ["team"])
      .order("full_name", { ascending: true }),
    supabase
      .from("task_sections")
      .select("*")
      .order("position", { ascending: true }),
    supabase
      // revision_kind แยก "คำผิด" (นับเป็นข้อผิดพลาด) ออกจาก "เพิ่มเติม" (ไม่นับ) — migration 0063
      .from("task_comments")
      .select("task_id, revision_kind, created_at")
      .eq("is_revision", true)
      .gte("created_at", kpiSince),
    // คลังไฟล์ของงาน — แท็บ "รายบุคคล" แสดงเป็น media card ของคนที่เลือก
    fetchTaskMedia(),
    supabase.auth.getClaims(),
  ]);
  if (!hasPermission(access, "team")) return <AccessNotice />;

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
  const monthRevisions = (revisionData ?? []) as {
    task_id: string;
    revision_kind: RevisionKind | null;
    created_at: string;
  }[];

  return (
    <PageContainer>
      <WorkloadClient
        tasks={tasks}
        profiles={profiles}
        sections={sections}
        monthRevisions={monthRevisions}
        kpiSince={kpiSince}
        media={media}
        userId={claimsRes.data?.claims.sub ?? null}
      />
    </PageContainer>
  );
}
