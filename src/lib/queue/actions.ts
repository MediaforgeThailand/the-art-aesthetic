"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireQueueSession } from "./session";
import type { CaseType, MemberRole } from "./types";

/**
 * ทุก action ผ่าน RPC ที่เป็น SECURITY DEFINER ซึ่งตรวจสิทธิ์ซ้ำที่ฐานข้อมูล
 * client ไม่มีสิทธิ์ INSERT/UPDATE/DELETE ตารางไหนเลย
 *
 * ห้าม log payload ของหน้าวางข้อมูล — มี PII ของลูกค้าอยู่ (ข้อ 14)
 */

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string };

const ERROR_TEXT: Record<string, string> = {
  forbidden: "ไม่มีสิทธิ์ทำรายการนี้",
  not_found: "ไม่พบรายการที่ต้องการ",
  invalid_state: "สถานะเปลี่ยนไปแล้ว — รีเฟรชหน้าแล้วลองใหม่",
  reason_required: "ต้องระบุเหตุผลก่อนทำรายการ",
  force_reason_required: "ต้องระบุเหตุผลก่อนสร้างเคสซ้ำ",
  no_eligible_member: "ตอนนี้ไม่มี BC ที่พร้อมรับคิว — จ่ายคิวเองหรือให้ทีมเปิดสถานะก่อน",
  target_not_eligible: "คนที่เลือกไม่อยู่ในทีมที่รับคิวได้แล้ว",
  invalid_case_type: "ประเภทเคสไม่ถูกต้อง",
  invalid_role: "บทบาทไม่ถูกต้อง",
  invalid_availability: "สถานะไม่ถูกต้อง",
  user_not_found: "ไม่พบผู้ใช้รายนี้ในระบบหลัก",
  field_not_editable: "มีช่องที่แก้ไม่ได้ปนมา",
  entries_required: "ไม่มีรายชื่อในตารางที่จะประกาศ",
  invalid_period: "เดือนที่เลือกไม่ถูกต้อง",
};

/** แปลง error ของ Postgres เป็นข้อความไทย โดยไม่ปล่อย stack trace หรือข้อมูลลูกค้าออกไป */
function toMessage(error: { message?: string } | null): string {
  const raw = error?.message ?? "";
  for (const [code, text] of Object.entries(ERROR_TEXT)) {
    if (raw.includes(code)) return text;
  }
  if (raw.includes("duplicate key")) return "มีรายการนี้อยู่แล้ว";
  return "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง";
}

function revalidateQueue() {
  revalidatePath("/queue");
  revalidatePath("/queue/team");
  revalidatePath("/queue/ranking");
}

export type CreateCaseInput = {
  payload: Record<string, string | number | null>;
  caseType: CaseType;
  idempotencyKey: string;
  force?: boolean;
  forceReason?: string;
};

export async function createCase(input: CreateCaseInput): Promise<ActionResult<{ result: Record<string, unknown> }>> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("sq_create_case", {
    p_payload: input.payload,
    p_case_type: input.caseType,
    p_idempotency_key: input.idempotencyKey,
    p_force: input.force ?? false,
    p_force_reason: input.forceReason ?? null,
  });

  if (error) return { ok: false, error: toMessage(error) };

  const result = (data ?? {}) as Record<string, unknown>;
  revalidateQueue();

  return { ok: true, result };
}

export async function acknowledgeAssignment(assignmentId: string): Promise<ActionResult> {
  await requireQueueSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("sq_acknowledge", { p_assignment_id: assignmentId });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return { ok: true };
}

export async function reassign(
  assignmentId: string,
  reason: string,
  targetMemberId?: string | null
): Promise<ActionResult<{ memberName?: string }>> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sq_reassign", {
    p_assignment_id: assignmentId,
    p_reason: reason,
    p_target_member_id: targetMemberId || null,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return { ok: true, memberName: (data as { member_name?: string })?.member_name };
}

export async function assignPending(
  assignmentId: string,
  targetMemberId?: string | null,
  reason?: string
): Promise<ActionResult<{ memberName?: string }>> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sq_assign_pending", {
    p_assignment_id: assignmentId,
    p_target_member_id: targetMemberId || null,
    p_reason: reason || null,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return { ok: true, memberName: (data as { member_name?: string })?.member_name };
}

export async function voidAssignment(
  assignmentId: string,
  reason: string,
  cancelCase = true
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("sq_void_assignment", {
    p_assignment_id: assignmentId,
    p_reason: reason,
    p_cancel_case: cancelCase,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return { ok: true };
}

export async function updateCase(
  caseId: string,
  patch: Record<string, string | number | null>,
  reason?: string
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("sq_update_case", {
    p_case_id: caseId,
    p_patch: patch,
    p_reason: reason || null,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidatePath(`/queue/cases/${caseId}`);
  revalidateQueue();
  return { ok: true };
}

export async function addMember(
  userId: string,
  employeeCode?: string,
  role: MemberRole = "bc",
  /** null = ให้ฐานข้อมูลตัดสินเอง (viewer ไม่รับคิวเสมอ, ที่เหลือรับคิว) */
  queueEnabled?: boolean
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("sq_add_member", {
    p_user_id: userId,
    p_employee_code: employeeCode || null,
    p_role: role,
    p_queue_enabled: queueEnabled ?? null,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return { ok: true };
}

export async function updateMember(input: {
  memberId: string;
  isActive?: boolean;
  queueEnabled?: boolean;
  availability?: string;
  role?: MemberRole;
  employeeCode?: string;
  reason?: string;
}): Promise<ActionResult<{ openAssignments?: number }>> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sq_update_member", {
    p_member_id: input.memberId,
    p_is_active: input.isActive ?? null,
    p_queue_enabled: input.queueEnabled ?? null,
    p_availability: input.availability ?? null,
    p_role: input.role ?? null,
    p_employee_code: input.employeeCode ?? null,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return {
    ok: true,
    openAssignments: (data as { open_assignments?: number })?.open_assignments,
  };
}

export async function setMyAvailability(
  availability: "available" | "busy"
): Promise<ActionResult> {
  await requireQueueSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("sq_set_my_availability", {
    p_availability: availability,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return { ok: true };
}

export async function publishRanking(
  periodKey: string,
  entries: { member_id: string; rank: number; drag_paid_bills: number; drag_net_sales: number; cancel_count: number | null; source_name: string; source_row: number }[],
  sourceNote?: string
): Promise<ActionResult<{ version?: number }>> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sq_publish_ranking", {
    p_period_key: periodKey,
    p_entries: entries,
    p_source_note: sourceNote || null,
  });
  if (error) return { ok: false, error: toMessage(error) };
  revalidateQueue();
  return { ok: true, version: (data as { version?: number })?.version };
}
