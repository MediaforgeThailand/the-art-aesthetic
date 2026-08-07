// ฝั่ง server เท่านั้น — ใช้ createClient ของ server ที่ดึง next/headers (import จาก client จะพัง)
import { createClient } from "@/lib/supabase/server";
import { type MediaItem, mediaKindOf } from "@/lib/media";

/**
 * ดึงไฟล์ทั้งหมดในระบบ Task มารวมเป็นรายการเดียว (เรียงใหม่ก่อน)
 *
 * ทำ query ขนานกันแล้ว join ฝั่ง JS ด้วย map — จงใจไม่ใช้ embed `!inner` ของ PostgREST
 * เพราะต้อง join ข้ามตาราง 2 ชั้น (subtask → task) และหน้าเว็บต้องใช้ข้อมูล task
 * (ชื่อ/ผู้รับผิดชอบ) อยู่แล้ว; จำนวนไฟล์ทั้งระบบหลักร้อย–พัน ไม่ใช่ปัญหา
 *
 * งานที่อยู่ในถังขยะ (`tasks.deleted_at`) ถูกตัดออก — ไฟล์ของงานที่ถูกลบไม่ควรโผล่ในคลัง
 */
export async function fetchTaskMedia(): Promise<MediaItem[]> {
  const supabase = await createClient();

  const [tasksRes, filesRes, subFilesRes, commentsRes, subtasksRes] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, assignee_id")
        .is("deleted_at", null),
      supabase
        .from("task_files")
        .select("id, task_id, file_path, file_name, created_at"),
      supabase
        .from("task_subtask_files")
        .select("id, subtask_id, file_path, file_name, created_at"),
      supabase
        .from("task_comments")
        .select("id, task_id, file_path, created_at")
        .not("file_path", "is", null),
      // แผนที่ subtask → task (ไม่ใช้ embed ของ PostgREST เพื่อให้ตรงไปตรงมาและ type ชัด)
      supabase.from("task_subtasks").select("id, task_id"),
    ]);

  const tasks = new Map(
    (tasksRes.data ?? []).map((t) => [
      t.id as string,
      { title: (t.title as string) ?? "", assigneeId: t.assignee_id as string | null },
    ])
  );

  const items: MediaItem[] = [];
  const push = (
    source: MediaItem["source"],
    rowId: string,
    taskId: string | null,
    filePath: string | null,
    fileName: string | null,
    createdAt: string
  ) => {
    if (!filePath || !taskId) return;
    const task = tasks.get(taskId);
    if (!task) return; // งานถูกลบ/อยู่ถังขยะ
    items.push({
      key: `${source}:${rowId}`,
      source,
      filePath,
      fileName,
      uploadedAt: createdAt,
      kind: mediaKindOf(filePath),
      taskId,
      taskTitle: task.title,
      assigneeId: task.assigneeId,
    });
  };

  for (const r of filesRes.data ?? []) {
    push(
      "task",
      r.id as string,
      r.task_id as string,
      r.file_path as string,
      (r.file_name as string | null) ?? null,
      r.created_at as string
    );
  }
  const subtaskTask = new Map(
    (subtasksRes.data ?? []).map((r) => [r.id as string, r.task_id as string])
  );
  for (const r of subFilesRes.data ?? []) {
    push(
      "subtask",
      r.id as string,
      subtaskTask.get(r.subtask_id as string) ?? null,
      r.file_path as string,
      (r.file_name as string | null) ?? null,
      r.created_at as string
    );
  }
  for (const r of commentsRes.data ?? []) {
    push(
      "comment",
      r.id as string,
      r.task_id as string,
      r.file_path as string | null,
      null,
      r.created_at as string
    );
  }

  return items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
