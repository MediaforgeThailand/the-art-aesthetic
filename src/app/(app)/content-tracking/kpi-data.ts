import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { ContentCategoryRow, ContentKpiRow } from "@/lib/types";
import type { ProfileLite, TrackedTask } from "./kpi-utils";

/** คอลัมน์ของ tasks ที่ระบบ KPI ใช้ — ใช้ร่วมทั้ง query หลักและ query เก็บตกงานที่ถูกตีกลับ */
const TASK_COLUMNS =
  "id, title, assignee_id, created_by, posted_at, approved_at, review_submitted_at, review_status, review_step, completed, content_format, content_category_id, brief_accepted_at, brief_source_id, brief_content_type, files:task_files(file_path)";

/** แถวดิบจาก DB — ยังไม่มีข้อมูลการตีกลับ (เติมทีหลังจาก task_comments) */
type RawTask = Omit<TrackedTask, "revision_at" | "revision_kind">;

type RevisionInfo = { at: string; kind: string | null };

/**
 * โหลดข้อมูลของระบบ KPI คอนเทนต์ (**server เท่านั้น** — import `@/lib/supabase/server`
 * ซึ่งดึง next/headers; ห้าม import จาก client component)
 *
 * ใช้ร่วมกันทั้งหน้าปฏิทิน `/content-tracking`
 * และหน้าภาพรวมทีม `/content-tracking/overview` (สอง route ต้องเห็นชุดข้อมูลเดียวกัน
 * ไม่งั้นตัวเลขสองหน้าจะเพี้ยนจากกันเมื่อวันหนึ่งมีคนแก้ query แค่ฝั่งเดียว)
 */
export async function loadKpiData() {
  const supabase = await createClient();

  // ดึงเฉพาะงานที่เคยส่งตรวจ/ตรวจผ่าน/โพสแล้ว/เป็น Brief ที่ถูกรับงาน คอลัมน์เท่าที่ใช้
  // — ไม่โหลด join/description มาทั้งก้อนแบบหน้า /tasks
  // embed task_files (เฉพาะ file_path) ให้ตัววิเคราะห์จำนวนชิ้นงานนับไฟล์ภาพ/วิดีโอต่อการ์ดได้
  const fetchTasks = async () => {
    const pageSize = 1000;
    const rows: RawTask[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .is("deleted_at", null)
        // brief_accepted_at เข้ามาด้วยตั้งแต่ 0095 — การ์ด Brief ที่ถูกรับงานคือ KPI ของผู้สั่ง Brief
        // (การ์ดพวกนี้ไม่เคยส่งตรวจ/โพส เงื่อนไขเดิมจึงกรองทิ้งหมด)
        .or(
          "posted_at.not.is.null,review_status.eq.approved,review_submitted_at.not.is.null,brief_accepted_at.not.is.null"
        )
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return { rows, error: error.message };
      rows.push(...((data ?? []) as unknown as RawTask[]));
      if (!data || data.length < pageSize) break;
    }
    return { rows, error: null as string | null };
  };

  /**
   * การตีกลับล่าสุดต่อการ์ด (คอมเมนต์ is_revision) — **จำเป็นต่อการนับ KPI ให้ครบ**:
   * migration 0036 ล้าง `review_submitted_at` ทิ้งตอนตีกลับ งานที่กำลังแก้อยู่จึงไม่มี
   * timestamp ไหนเหลือเลยและถูก `.or()` ข้างบนกรองทิ้งทั้งใบ (ตอนเขียนมี 12 การ์ด)
   * ตารางนี้เล็ก (หลักร้อยแถว) จึงดึงมาทั้งหมดแล้วยุบฝั่ง server
   */
  const fetchRevisions = async () => {
    const { data, error } = await supabase
      .from("task_comments")
      .select("task_id, created_at, revision_kind")
      .eq("is_revision", true)
      .order("created_at", { ascending: true });
    const map = new Map<string, RevisionInfo>();
    for (const row of (data ?? []) as unknown as {
      task_id: string;
      created_at: string;
      revision_kind: string | null;
    }[]) {
      // เรียงเก่า→ใหม่ ทับไปเรื่อยๆ = เหลือครั้งล่าสุดของแต่ละการ์ด
      map.set(row.task_id, { at: row.created_at, kind: row.revision_kind });
    }
    return { map, error: error?.message ?? null };
  };

  const [access, tasksResult, revResult, categoriesResult, kpisResult, profilesResult] =
    await Promise.all([
      getAccess(),
      fetchTasks(),
      fetchRevisions(),
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

  // เก็บตกการ์ดที่ถูกตีกลับแล้วไม่มี timestamp อื่นเหลือ — query แยกแบบมีขอบเขต (.in ทีละก้อน)
  const rawTasks = tasksResult.rows;
  const seen = new Set(rawTasks.map((t) => t.id));
  const missing = [...revResult.map.keys()].filter((id) => !seen.has(id));
  let backfillError: string | null = null;
  for (let i = 0; i < missing.length; i += 200) {
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .is("deleted_at", null)
      .in("id", missing.slice(i, i + 200));
    if (error) {
      backfillError = error.message;
      break;
    }
    rawTasks.push(...((data ?? []) as unknown as RawTask[]));
  }

  const tasks: TrackedTask[] = rawTasks.map((t) => {
    const rev = revResult.map.get(t.id);
    return {
      ...t,
      revision_at: rev?.at ?? null,
      revision_kind: rev?.kind ?? null,
    };
  });

  // เดือน/วันปัจจุบันตามเวลาไทย คำนวณฝั่ง server — client render ครั้งแรกไม่ต้องแตะ Date.now()
  const bangkokNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );

  return {
    access,
    tasks,
    categories: (categoriesResult.data ?? []) as ContentCategoryRow[],
    kpis: (kpisResult.data ?? []) as ContentKpiRow[],
    profiles: (profilesResult.data ?? []) as ProfileLite[],
    today: {
      year: bangkokNow.getFullYear(),
      month: bangkokNow.getMonth() + 1,
      day: bangkokNow.getDate(),
    },
    loadError:
      tasksResult.error ??
      revResult.error ??
      backfillError ??
      categoriesResult.error?.message ??
      kpisResult.error?.message ??
      profilesResult.error?.message ??
      null,
  };
}
