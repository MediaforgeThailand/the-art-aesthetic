/**
 * Type ของตาราง sq_* — เขียนมือแทนการ generate ทั้งสคีมา
 * เพราะฐานข้อมูลนี้ใช้ร่วมกับระบบหลักที่มีตารางอีกหลายสิบตัว
 */

export type CaseType =
  | "online"
  | "walk_in"
  | "existing"
  | "referral"
  | "drag_surgery"
  | "other";

export type CaseStatus = "open" | "pending_manual_assignment" | "cancelled";

export type AssignmentStatus =
  | "assigned"
  | "acknowledged"
  | "reassigned"
  | "pending_manual_assignment"
  | "cancelled"
  | "voided";

export type Availability = "available" | "busy" | "paused" | "offline";

/** viewer = เห็นคิวทั้งทีมได้ แต่ไม่ถูกจ่ายลูกค้าให้ (เช่น หัวหน้าหรือแอดมินที่ไม่ลงคิว) */
export type MemberRole = "bc" | "admin" | "viewer";

export type SqMember = {
  id: string;
  user_id: string;
  display_name: string;
  employee_code: string | null;
  role: MemberRole;
  is_active: boolean;
  queue_enabled: boolean;
  availability: Availability;
  joined_at: string;
  deactivated_at: string | null;
  deactivation_reason: string | null;
};

export type SqCase = {
  id: string;
  case_no: number;
  case_type: CaseType;
  status: CaseStatus;
  customer_name: string;
  customer_age: number | null;
  phone: string | null;
  line_id: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  treatment_main: string | null;
  treatment_detail: string | null;
  doctor: string | null;
  branch: string | null;
  channel: string | null;
  seller_name: string | null;
  owner_bc_name: string | null;
  discussion_start_date: string | null;
  closed_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type SqAssignment = {
  id: string;
  case_id: string;
  member_id: string | null;
  status: AssignmentStatus;
  rank_snapshot: number | null;
  weight_snapshot: number;
  seq_today: number | null;
  quota_consumed: boolean;
  assigned_date: string;
  period_key: string;
  assigned_at: string;
  acknowledged_at: string | null;
  reason: string | null;
};

export type SqRankingEntry = {
  id: string;
  period_id: string;
  member_id: string;
  rank: number;
  weight: number;
  drag_paid_bills: number;
  drag_net_sales: number;
  cancel_count: number | null;
  source_name: string | null;
};

export type SqAuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  summary: Record<string, unknown>;
  created_at: string;
};

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  online: "Online — เข้าระบบรันคิว",
  walk_in: "Walk-in",
  existing: "ลูกค้าเก่า/เจ้าของเดิม",
  referral: "แนะนำต่อ",
  drag_surgery: "Drag จากลูกค้าศัลยกรรม",
  other: "อื่นๆ",
};

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  assigned: "รอรับทราบ",
  acknowledged: "รับทราบแล้ว",
  reassigned: "ย้ายคิวแล้ว",
  pending_manual_assignment: "รอจ่ายคิวเอง",
  cancelled: "ยกเลิก",
  voided: "ยกเลิกคิว",
};

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  bc: "Beauty Consult",
  admin: "แอดมิน",
  viewer: "ผู้ดูอย่างเดียว",
};

export const MEMBER_ROLE_HINT: Record<MemberRole, string> = {
  bc: "รับคิวลูกค้า เห็นเฉพาะเคสของตัวเอง",
  admin: "จัดการได้ทุกอย่าง เลือกได้ว่าจะรับคิวลูกค้าด้วยหรือไม่",
  viewer: "ดูคิวและเคสของทั้งทีมได้ แต่ไม่ถูกจ่ายลูกค้าให้ และแก้ไขอะไรไม่ได้",
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "พร้อมรับคิว",
  busy: "ไม่ว่าง",
  paused: "พักคิว",
  offline: "ลา/ออฟไลน์",
};
