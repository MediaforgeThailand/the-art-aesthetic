import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { ListGroupRow, ListTagRow, ListTaskRow } from "@/lib/types";
import type { MyTask } from "./list-utils";
import { MyTasksClient } from "./my-tasks-client";

export const metadata: Metadata = {
  title: "งานของฉัน",
};

/**
 * My List — ลิสต์งาน/โน้ตส่วนตัว
 *
 * ไม่มี permission guard โดยตั้งใจ: เป็นพื้นที่ส่วนตัวของแต่ละบัญชี ไม่ใช่ข้อมูลของแผนก
 * ใครล็อกอินได้ก็มีลิสต์ของตัวเอง (RLS ที่ list_tasks ยึด owner_id จึงไม่มีทางเห็นของคนอื่น)
 * — ต่างจากหน้าอื่นในระบบที่ต้องรอ admin เปิดสิทธิ์ให้ก่อน
 */
export default async function MyTasksPage() {
  const supabase = await createClient();

  // ยิงขนานทั้งหมดรวม getAccess (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มี uid)
  const [access, tasksRes, tagsRes, linkRes, groupsRes] = await Promise.all([
    getAccess(),
    supabase
      .from("list_tasks")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("list_tags").select("*").order("name", { ascending: true }),
    supabase.from("list_task_tags").select("task_id, tag_id"),
    supabase
      .from("list_groups")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  // proxy เด้งคนที่ยังไม่ล็อกอินไป /login อยู่แล้ว — เช็คซ้ำเพื่อให้ TS มั่นใจว่ามีเจ้าของลิสต์
  if (!access.uid) return <AccessNotice />;

  const tagIdsByTask = new Map<string, string[]>();
  for (const l of linkRes.data ?? []) {
    const arr = tagIdsByTask.get(l.task_id);
    if (arr) arr.push(l.tag_id);
    else tagIdsByTask.set(l.task_id, [l.tag_id]);
  }

  const tasks: MyTask[] = ((tasksRes.data ?? []) as ListTaskRow[]).map((t) => ({
    ...t,
    tagIds: tagIdsByTask.get(t.id) ?? [],
  }));

  return (
    <PageContainer>
      <MyTasksClient
        uid={access.uid}
        tasks={tasks}
        tags={(tagsRes.data ?? []) as ListTagRow[]}
        groups={(groupsRes.data ?? []) as ListGroupRow[]}
        loadError={
          tasksRes.error?.message ??
          tagsRes.error?.message ??
          linkRes.error?.message ??
          groupsRes.error?.message ??
          null
        }
      />
    </PageContainer>
  );
}
