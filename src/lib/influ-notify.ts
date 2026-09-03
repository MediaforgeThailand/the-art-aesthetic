/**
 * ระบบแจ้งเตือนของ **ระบบ Influencer** (influ_notifications — 0095)
 *
 * ที่มา (ผู้ใช้ 2026-08-29): "เพิ่มระบบแจ้งเตือนของ influ system ให้ทีตอนนี้มันยังไม่มี
 * แจ้งเตือนอะไรเลย ... การแจ้งเตือนต้องละเอียดและมีการแบ่ง สำคัญไม่สำคัญชัดเจน
 * เช่น การปรับเปลี่ยนจาก stage A > B หากอัพเดทต้องมีการแจ้งเตือนไปหาผู้รับผิดชอบใน
 * ส่วนนั้นๆ ทุกคน (ยกเว้นตัวผู้อัพเดทเอง)"
 *
 * **กติกาที่ทำให้ "สำคัญ/ไม่สำคัญ" แยกกันจริง:**
 *   ทุกเหตุการณ์ประกาศ `scope` ว่าเป็นงานของขอบเขตไหน (memo | contract | followup)
 *   แล้วผู้รับแต่ละคนได้ระดับตามที่ตัวเองถือ:
 *     - ถือ scope นั้น            → `action` = งานของฉัน ต้องลงมือ (นับใน badge แดง)
 *     - ไม่ได้ถือ / เป็นหัวหน้างาน → `update` = รู้ไว้เฉยๆ (ไม่นับใน badge)
 *   ตรงกับโจทย์: A ถือ stage 1-2, B ถือ Follow Up, C เป็นหัวหน้า → เดินขั้น 2 แล้ว
 *   A เด้งเด่น ส่วน B/C ได้แบบเงียบ
 *
 * กติกาเชิงเทคนิค:
 * - fire-and-forget แต่ **ต้องมี `.then()` ปิดท้ายเสมอ** (supabase builder เป็น lazy thenable —
 *   ไม่มี then = ไม่ยิง request เลย; นี่คือบั๊กเดิมของระบบแจ้งเตือนฝั่ง Task)
 * - แจ้งเตือนล้มเหลวห้ามทำให้งานหลักพัง — กลืน error ทิ้ง
 * - **ไม่แจ้งเตือนตัวผู้ทำเอง** ตัดออกให้ที่นี่ที่เดียว ทุกจุดเรียกจึงไม่ต้องจำ
 */

import type { Json } from "@/lib/database.types";
import {
  type InfluEventScope,
  normalizeRoles,
  rolesCoverScope,
} from "@/lib/influ-constants";
import type { createClient } from "@/lib/supabase/client";
import type { InfluNotiLevel, InfluScope } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createClient>;

/* ---------- ชนิดเหตุการณ์ ---------- */

/** โทนสีของแจ้งเตือน — คุมทั้งไอคอนและแถบสีในกระดิ่ง */
export type InfluNotiTone = "brand" | "emerald" | "amber" | "rose" | "sky" | "stone";

/** `icon` เป็น **คีย์** ไม่ใช่ component เพราะไฟล์นี้เป็น .ts เก็บ JSX ไม่ได้
    (แผนที่คีย์ → ไอคอนอยู่ใน influ-notification-bell.tsx) */
export type InfluNotiMeta = {
  label: string;
  icon: string;
  tone: InfluNotiTone;
};

/**
 * ป้าย/ไอคอน/โทนของแต่ละชนิด — `type` ใน DB เป็น text อิสระ (แพทเทิร์นเดียวกับ
 * influ_activity_log.action) ชนิดใหม่จึงเพิ่มที่นี่ได้เลยโดยไม่ต้อง migrate
 */
export const INFLU_NOTI_TYPES: Record<string, InfluNotiMeta> = {
  /* --- ขั้นงาน --- */
  stage_forward: { label: "เดินขั้นงาน", icon: "arrow-right", tone: "brand" },
  stage_back: { label: "ย้อนขั้นงาน", icon: "rotate", tone: "amber" },
  /* --- เอกสาร --- */
  memo_uploaded: { label: "ไฟล์ Memo", icon: "file", tone: "sky" },
  memo_sent: { label: "ส่งเรื่อง Memo", icon: "send", tone: "sky" },
  memo_submitted: { label: "ทำ Memo ส่งแล้ว", icon: "send", tone: "brand" },
  contract_uploaded: {
    label: "ไฟล์สัญญา",
    icon: "file-signature",
    tone: "brand",
  },
  contract_removed: { label: "ลบไฟล์สัญญา", icon: "file-x", tone: "amber" },
  /* --- คิว/ปฏิทิน --- */
  service_booked: { label: "ลงคิวเข้ารับบริการ", icon: "calendar-check", tone: "emerald" },
  calendar_changed: { label: "คิวในปฏิทิน", icon: "calendar", tone: "sky" },
  /* --- Follow Up --- */
  quota_set: { label: "เป้าโพสตามสัญญา", icon: "target", tone: "brand" },
  post_added: { label: "ลิงก์ผลงานใหม่", icon: "link", tone: "emerald" },
  post_removed: { label: "ลบลิงก์ผลงาน", icon: "link", tone: "amber" },
  followup_task: { label: "เช็คลิสต์ผลลัพธ์", icon: "check", tone: "stone" },
  followup_overdue: { label: "งานตามเลยกำหนด", icon: "bell", tone: "amber" },
  /* --- สถานะเคส --- */
  case_created: { label: "เคสใหม่", icon: "sparkles", tone: "emerald" },
  case_completed: { label: "ปิดงาน", icon: "check-circle", tone: "emerald" },
  case_reopened: { label: "เปิดเคสกลับมา", icon: "rotate", tone: "amber" },
  case_declined: { label: "ปฏิเสธ", icon: "ban", tone: "rose" },
  case_declined_undo: { label: "ยกเลิกปฏิเสธ", icon: "rotate", tone: "stone" },
  case_updated: { label: "แก้ข้อมูลเคส", icon: "pencil", tone: "stone" },
  case_deleted: { label: "ลบเคส", icon: "trash", tone: "rose" },
  round_started: { label: "เปิดรอบใหม่", icon: "repeat", tone: "brand" },
  /* --- ผู้รับผิดชอบ --- */
  assigned: { label: "มอบหมายงาน", icon: "user-plus", tone: "brand" },
  unassigned: { label: "ถอดผู้รับผิดชอบ", icon: "user-minus", tone: "stone" },
  scope_changed: { label: "เปลี่ยนขอบเขตงาน", icon: "user-cog", tone: "sky" },
};

/** ป้ายกลางของชนิดที่ยังไม่ได้ประกาศ (แถวเก่า/ชนิดใหม่จากอีก session) */
export const INFLU_NOTI_FALLBACK: InfluNotiMeta = {
  label: "อัพเดท",
  icon: "bell",
  tone: "stone",
};

export function influNotiMeta(type: string): InfluNotiMeta {
  return INFLU_NOTI_TYPES[type] ?? INFLU_NOTI_FALLBACK;
}

/* ---------- ผู้รับ ---------- */

/** ผู้รับผิดชอบ 1 คนของเคส (ย่อ) — ที่มาของการตัดสินระดับความสำคัญ */
export type InfluNotifyTarget = { userId: string; scopes: InfluScope[] };

export type InfluNotifyActor = { id: string | null; name: string | null };

export type InfluNotifyInput = {
  influencerId: string | null;
  influencerName: string | null;
  type: string;
  title: string;
  body?: string | null;
  /** ปลายทางตอนกด — ไม่ส่ง = สร้างให้อัตโนมัติจาก influencerId */
  href?: string | null;
  /** ขอบเขตที่ "เป็นเจ้าของ" เหตุการณ์นี้ — ผู้ที่ถือบทบาทที่คุมขอบเขตนี้
      (ตาม covers ใน INFLU_ROLES หลัง normalizeRoles) ได้ระดับ action */
  scope?: InfluEventScope | null;
  /** ระดับของคนที่ไม่ได้ถือขอบเขตนั้น (และของทุกคนเมื่อ scope เป็น null) */
  baseLevel?: InfluNotiLevel;
  /** ผู้รับผิดชอบทั้งหมดของเคส (รวมหัวหน้างานที่ scopes ว่าง) */
  assignees: InfluNotifyTarget[];
  /** บังคับระดับ action ให้บาง uid เสมอ เช่นคนที่เพิ่งถูกมอบหมายงาน */
  forceAction?: (string | null | undefined)[];
  /** ผู้รับเพิ่มนอกเหนือจาก assignees เช่นคนที่เพิ่งถูกถอดออกจากเคส */
  extra?: (string | null | undefined)[];
  meta?: Json;
};

/**
 * ส่งแจ้งเตือนถึงผู้รับผิดชอบของเคส — คิดระดับความสำคัญให้ตาม scope ที่แต่ละคนถือ
 * เรียกได้เลยไม่ต้อง await (มี .then ปิดท้ายให้แล้ว)
 */
export function notifyInflu(
  supabase: SupabaseClient,
  actor: InfluNotifyActor,
  input: InfluNotifyInput
): void {
  const rows = buildInfluNotifications(actor, input);
  if (rows.length === 0) return;
  void supabase
    .from("influ_notifications")
    .insert(rows)
    .then(() => {
      // ตั้งใจไม่ทำอะไรต่อ — แจ้งเตือนเป็นข้อมูลประกอบ ไม่ควรรบกวนงานหลักถ้าเขียนไม่สำเร็จ
    });
}

/** แถวที่จะ insert — แยกออกมาเพื่อให้ทดสอบ/ตรวจ logic ได้โดยไม่ต้องแตะ DB */
export function buildInfluNotifications(
  actor: InfluNotifyActor,
  input: InfluNotifyInput
) {
  const base: InfluNotiLevel = input.baseLevel ?? "update";
  const forced = new Set(
    (input.forceAction ?? []).filter((v): v is string => !!v)
  );

  /** uid → ระดับ (คนเดียวอาจถูกใส่มาหลายทาง — ระดับเด่นกว่าชนะ) */
  const levelByUser = new Map<string, InfluNotiLevel>();
  const put = (uid: string, level: InfluNotiLevel) => {
    // ตัวผู้ทำเองไม่ต้องได้แจ้งเตือนการกระทำของตัวเอง (กติกาผู้ใช้)
    if (!uid || uid === actor.id) return;
    if (levelByUser.get(uid) === "action") return;
    levelByUser.set(uid, level);
  };

  for (const a of input.assignees) {
    // **ผู้เกี่ยวข้อง (ไม่ถือบทบาทไหนเลย) = เงียบเสมอ** ไม่ว่าเหตุการณ์จะตั้ง baseLevel
    // มาเป็นอะไร — นี่คือนิยามของบทบาทนี้ (ผู้ใช้ 2026-09-03: "ไม่ได้มีหน้าที่อะไร
    // แต่ต้องได้รับแจ้งเตือนเป็น second primary") จุดเรียกจึงไม่ต้องจำกฎนี้เอง
    // (ยกเว้น forceAction ซึ่งใส่ทีหลังโดยตั้งใจ เช่นคนที่เพิ่งถูกมอบหมายงาน)
    if (normalizeRoles(a.scopes).length === 0) {
      put(a.userId, "update");
      continue;
    }
    // ค่าใน scopes เป็น "บทบาท" (0104 — และค่าขอบเขตเก่าก่อนหน้านั้น) ห้ามเทียบดิบ:
    // ต้อง normalize เป็นบทบาทก่อนแล้วดูว่ามีบทบาทไหนคุมขอบเขตของเหตุการณ์นี้
    const owns = rolesCoverScope(a.scopes, input.scope);
    put(a.userId, owns ? "action" : base);
  }
  for (const uid of input.extra ?? []) {
    if (uid) put(uid, base);
  }
  for (const uid of forced) put(uid, "action");

  const href =
    input.href ??
    (input.influencerId ? `/influencers/${input.influencerId}` : null);

  return [...levelByUser.entries()].map(([recipient_id, level]) => ({
    recipient_id,
    actor_id: actor.id,
    actor_name: actor.name,
    influencer_id: input.influencerId,
    influencer_name: input.influencerName,
    type: input.type,
    level,
    title: input.title,
    body: input.body ?? null,
    href,
    meta: input.meta ?? ({} as Json),
  }));
}

/* ---------- โหลดผู้รับผิดชอบตอนที่หน้าไม่มีข้อมูลอยู่ในมือ ---------- */

/**
 * อ่านผู้รับผิดชอบของเคสจาก DB — ใช้ในหน้าที่ไม่ได้โหลด assignees มาเป็น prop
 * (เช่นปฏิทินคิว / หน้า Follow Up ที่แก้เคสได้แต่ไม่ได้แสดงผู้รับผิดชอบ)
 */
export async function fetchInfluAssignees(
  supabase: SupabaseClient,
  influencerId: string
): Promise<InfluNotifyTarget[]> {
  const { data } = await supabase
    .from("influ_assignees")
    .select("user_id, scopes")
    .eq("influencer_id", influencerId);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    scopes: (r.scopes ?? []) as InfluScope[],
  }));
}

/**
 * ส่งแจ้งเตือนโดยโหลดผู้รับผิดชอบเองก่อน — สำหรับจุดที่ไม่มี assignees ในมือ
 * (ยังเป็น fire-and-forget: เรียกแล้วไม่ต้อง await)
 */
export function notifyInfluByCase(
  supabase: SupabaseClient,
  actor: InfluNotifyActor,
  input: Omit<InfluNotifyInput, "assignees"> & { influencerId: string }
): void {
  void fetchInfluAssignees(supabase, input.influencerId)
    .then((assignees) => notifyInflu(supabase, actor, { ...input, assignees }))
    .catch(() => {
      // อ่านผู้รับผิดชอบไม่ได้ = ไม่ส่ง — ห้ามทำให้งานหลักพัง
    });
}
