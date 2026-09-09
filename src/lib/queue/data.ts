import { createClient } from "@/lib/supabase/server";
import type { Availability, AssignmentStatus, CaseType, MemberRole } from "./types";

/** วันที่/เดือนตามเวลาไทย — ต้องตรงกับ sq_today()/sq_period_key() ฝั่ง Postgres */
export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function bangkokPeriodKey(now: Date = new Date()): string {
  return bangkokToday(now).slice(0, 7);
}

export type QueueCaseSummary = {
  id: string;
  case_no: number;
  case_type: CaseType;
  status: string;
  customer_name: string;
  phone: string | null;
  line_id: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  treatment_main: string | null;
  doctor: string | null;
  branch: string | null;
  channel: string | null;
  created_at: string;
};

export type QueueAssignmentRow = {
  id: string;
  case_id: string;
  member_id: string | null;
  member_name: string | null;
  status: AssignmentStatus;
  rank_snapshot: number | null;
  weight_snapshot: number;
  seq_today: number | null;
  assigned_at: string;
  acknowledged_at: string | null;
  assigned_date: string;
  reason: string | null;
  case: QueueCaseSummary | null;
};

const CASE_SELECT = `
  id, case_no, case_type, status, customer_name, phone, line_id,
  appointment_date, appointment_time, treatment_main, doctor, branch, channel, created_at
`;

const ASSIGNMENT_SELECT = `
  id, case_id, member_id, status, rank_snapshot, weight_snapshot, seq_today,
  assigned_at, acknowledged_at, assigned_date, reason,
  sq_members ( display_name ),
  sq_cases ( ${CASE_SELECT} )
`;

function shapeCase(row: Record<string, unknown>): QueueCaseSummary {
  return {
    id: row.id as string,
    case_no: row.case_no as number,
    case_type: row.case_type as CaseType,
    status: row.status as string,
    customer_name: row.customer_name as string,
    phone: (row.phone as string) ?? null,
    line_id: (row.line_id as string) ?? null,
    appointment_date: (row.appointment_date as string) ?? null,
    appointment_time: (row.appointment_time as string) ?? null,
    treatment_main: (row.treatment_main as string) ?? null,
    doctor: (row.doctor as string) ?? null,
    branch: (row.branch as string) ?? null,
    channel: (row.channel as string) ?? null,
    created_at: row.created_at as string,
  };
}

type RawAssignment = Record<string, unknown> & {
  sq_members?: { display_name: string } | null;
  sq_cases?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function shapeAssignment(row: RawAssignment): QueueAssignmentRow {
  const rawCase = one(row.sq_cases as never) as Record<string, unknown> | null;

  return {
    id: row.id as string,
    case_id: row.case_id as string,
    member_id: (row.member_id as string) ?? null,
    member_name: one(row.sq_members as never)?.["display_name"] ?? null,
    status: row.status as AssignmentStatus,
    rank_snapshot: (row.rank_snapshot as number) ?? null,
    weight_snapshot: (row.weight_snapshot as number) ?? 1,
    seq_today: (row.seq_today as number) ?? null,
    assigned_at: row.assigned_at as string,
    acknowledged_at: (row.acknowledged_at as string) ?? null,
    assigned_date: row.assigned_date as string,
    reason: (row.reason as string) ?? null,
    case: rawCase ? shapeCase(rawCase) : null,
  };
}

export async function getRecentAssignments(limit = 40): Promise<QueueAssignmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_assignments")
    .select(ASSIGNMENT_SELECT)
    .in("status", ["assigned", "acknowledged", "pending_manual_assignment"])
    .order("assigned_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as RawAssignment[]).map(shapeAssignment);
}

export async function getMyAssignments(limit = 40): Promise<QueueAssignmentRow[]> {
  // RLS จำกัดให้เห็นเฉพาะของตัวเองอยู่แล้ว — ไม่ต้องกรอง member_id ซ้ำที่ client
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_assignments")
    .select(ASSIGNMENT_SELECT)
    .order("assigned_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as RawAssignment[]).map(shapeAssignment);
}

/**
 * เคสที่ไม่ได้เข้าคิวรัน (ทุกประเภทที่ไม่ใช่ Online) — ไม่มีแถวใน sq_assignments
 * จึงไม่โผล่ในรายการคิว ต้องดึงจาก sq_cases ตรงๆ ไม่งั้นบันทึกแล้วหาย
 * RLS ของ sq_cases ยอมให้เฉพาะแอดมินเห็นเคสที่ไม่มีผู้รับ
 */
export async function getUnqueuedCases(limit = 30): Promise<QueueCaseSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_cases")
    .select(CASE_SELECT)
    .neq("case_type", "online")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(shapeCase);
}

export async function getAssignmentByCase(caseId: string): Promise<QueueAssignmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("case_id", caseId)
    .order("assigned_at", { ascending: false });
  return ((data ?? []) as unknown as RawAssignment[]).map(shapeAssignment);
}

export type MemberWithStats = {
  id: string;
  user_id: string;
  display_name: string;
  employee_code: string | null;
  role: MemberRole;
  is_active: boolean;
  queue_enabled: boolean;
  availability: Availability;
  deactivation_reason: string | null;
  rank: number | null;
  weight: number;
  today: number;
  month: number;
  /** เวลาแถวคิวล่าสุด — ใช้พรีวิว "คิวถัดไป" ให้ตรงกับตัวตัดสินใน sq_pick_member */
  last_assigned_at: string | null;
};

/**
 * นับคิววันนี้/เดือนนี้ในหน่วยความจำ — เดือนหนึ่งมีไม่กี่ร้อยแถว
 * (PostgREST ไม่มี group by และไม่อยากเพิ่ม view ให้ระบบหลักเพียงเพื่อนับ)
 */
export async function getMembersWithStats(): Promise<MemberWithStats[]> {
  const supabase = await createClient();
  const periodKey = bangkokPeriodKey();
  const today = bangkokToday();

  const [{ data: members }, { data: period }, { data: assignments }] = await Promise.all([
    supabase.from("sq_members").select("*").order("display_name"),
    supabase
      .from("sq_ranking_periods")
      .select("id")
      .eq("period_key", periodKey)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("sq_assignments")
      .select("member_id, assigned_date, assigned_at, quota_consumed")
      .eq("period_key", periodKey),
  ]);

  const periodId = (period as { id?: string } | null)?.id ?? null;
  const { data: entries } = periodId
    ? await supabase
        .from("sq_ranking_entries")
        .select("member_id, rank, weight")
        .eq("period_id", periodId)
    : { data: [] as { member_id: string; rank: number; weight: number }[] };

  const rankByMember = new Map(
    ((entries ?? []) as { member_id: string; rank: number; weight: number }[]).map((e) => [
      e.member_id,
      e,
    ])
  );

  const allRows = (assignments ?? []) as {
    member_id: string | null;
    assigned_date: string;
    assigned_at: string;
    quota_consumed: boolean;
  }[];
  const counted = allRows.filter((a) => a.member_id && a.quota_consumed);

  // คิวล่าสุดของแต่ละคน — sq_pick_member ใช้ max(assigned_at) แบบไม่กรองสถานะ จึงนับทุกแถวเหมือนกัน
  const lastByMember = new Map<string, string>();
  for (const a of allRows) {
    if (!a.member_id) continue;
    const prev = lastByMember.get(a.member_id);
    if (!prev || a.assigned_at > prev) lastByMember.set(a.member_id, a.assigned_at);
  }

  return ((members ?? []) as Record<string, unknown>[]).map((m) => {
    const id = m.id as string;
    const ranking = rankByMember.get(id);
    return {
      id,
      user_id: m.user_id as string,
      display_name: m.display_name as string,
      employee_code: (m.employee_code as string) ?? null,
      role: m.role as MemberRole,
      is_active: m.is_active as boolean,
      queue_enabled: m.queue_enabled as boolean,
      availability: m.availability as Availability,
      deactivation_reason: (m.deactivation_reason as string) ?? null,
      rank: ranking?.rank ?? null,
      weight: ranking?.weight ?? 1,
      today: counted.filter((a) => a.member_id === id && a.assigned_date === today).length,
      month: counted.filter((a) => a.member_id === id).length,
      last_assigned_at: lastByMember.get(id) ?? null,
    };
  });
}

export type RankingPeriodRow = {
  id: string;
  period_key: string;
  version: number;
  status: string;
  source_note: string | null;
  published_at: string | null;
  entries: {
    member_id: string;
    member_name: string;
    rank: number;
    weight: number;
    drag_paid_bills: number;
    drag_net_sales: number;
    cancel_count: number | null;
  }[];
};

export async function getRankingHistory(periodKey: string): Promise<RankingPeriodRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_ranking_periods")
    .select(
      `id, period_key, version, status, source_note, published_at,
       sq_ranking_entries ( member_id, rank, weight, drag_paid_bills, drag_net_sales, cancel_count, sq_members ( display_name ) )`
    )
    .eq("period_key", periodKey)
    .order("version", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    period_key: row.period_key as string,
    version: row.version as number,
    status: row.status as string,
    source_note: (row.source_note as string) ?? null,
    published_at: (row.published_at as string) ?? null,
    entries: ((row.sq_ranking_entries ?? []) as Record<string, unknown>[])
      .map((e) => ({
        member_id: e.member_id as string,
        member_name: one(e.sq_members as never)?.["display_name"] ?? "—",
        rank: e.rank as number,
        weight: e.weight as number,
        drag_paid_bills: e.drag_paid_bills as number,
        drag_net_sales: Number(e.drag_net_sales ?? 0),
        cancel_count: (e.cancel_count as number) ?? null,
      }))
      .sort((a, b) => a.rank - b.rank),
  }));
}

export async function getOnlineChannels(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_settings")
    .select("value")
    .eq("key", "online_channels")
    .maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  return Array.isArray(value) ? (value as string[]) : ["L10"];
}

export type ProfileOption = { id: string; full_name: string | null; email: string | null };

/** ผู้ใช้จาก SSO ของระบบหลัก — ใช้ตอนเพิ่ม BC เข้าทีม */
export async function getProfileOptions(): Promise<ProfileOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name");
  return (data ?? []) as ProfileOption[];
}

export type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  summary: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
};

export async function getAuditLog(limit = 100): Promise<AuditRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_audit_log")
    .select("id, action, entity_type, entity_id, reason, summary, created_at, actor_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as Record<string, unknown>[];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as ProfileOption[] };
  const names = new Map(
    ((profiles ?? []) as ProfileOption[]).map((p) => [p.id, p.full_name ?? p.email ?? "—"])
  );

  return rows.map((r) => ({
    id: r.id as number,
    action: r.action as string,
    entity_type: r.entity_type as string,
    entity_id: (r.entity_id as string) ?? null,
    reason: (r.reason as string) ?? null,
    summary: (r.summary as Record<string, unknown>) ?? {},
    created_at: r.created_at as string,
    actor_name: r.actor_id ? names.get(r.actor_id as string) ?? null : null,
  }));
}

export async function getCaseDetail(caseId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sq_cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}
