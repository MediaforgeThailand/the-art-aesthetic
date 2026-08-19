export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type SalesSource = "manual" | "import" | "sheet";

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "member";
  /** สิทธิ์การมองเห็นรายคน แยกอิสระ (admin เปิดให้):
      'data' = แดชบอร์ด+รายงาน, 'team' = Task/Team Workload/คลังไฟล์/โปรไฟล์ Influencer,
      'influ' = Influ Manager (บอร์ด Influ Management pipeline + สัญญา), 'pricing' = จัดการราคา.
      โปรไฟล์รายคน /influencers/[id] เปิดจากแกลเลอรีได้ → เห็นได้ทั้ง team และ influ */
  permissions: AppPermission[];
  /** ผู้ตรวจอัตโนมัติของฉัน — auto เลือกเป็นผู้ตรวจตอนสร้างงานใหม่ (null = ไม่ตั้ง) */
  default_reviewer_id: string | null;
  /** รูปโปรไฟล์ — path ใน storage bucket documents (avatars/{uid}/...) แสดงแทนตัวอักษรใน avatar */
  avatar_path: string | null;
  /** ตำแหน่งงาน (เลือกได้) — Graphic/Editor | Content | Marketer | null */
  job_title: string | null;
  created_at: string;
};

/** สิทธิ์การมองเห็นที่ admin เปิดให้รายคนได้
    — ระบบ Influencer แยกเป็น 3 ระดับ (ดูนิยามที่ INFLU_LEVELS ใน permissions.ts):
      'influ_view'   = ดูเฉยๆ (อ่านได้ทุกหน้า แก้/เพิ่ม/ลบไม่ได้เลย)
      'influ_hunter' = Hunter (สร้างการ์ด + แก้ + ลบเคสของตัวเองได้ แต่ไม่ใช่ผู้ดูแล)
      'influ'        = ผู้ดูแลระบบ Influ (ทำได้ทุกอย่าง + log/ถังขยะ/ทะเบียนหมอ) */
export type AppPermission =
  | "data"
  | "team"
  | "influ"
  | "influ_hunter"
  | "influ_view"
  | "pricing";

/** รายชื่อคนที่เป็นผู้ตรวจงานได้ (roster — จัดการจากหน้า /tasks) */
export type TaskReviewerRow = {
  profile_id: string;
  created_at: string;
};

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  /** เลิกใช้แล้ว — คงไว้เพื่อความเข้ากันได้กับข้อมูลเก่า ใช้ section_id + completed แทน */
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  due_date: string | null;
  assignee_id: string | null;
  section_id: string | null;
  completed: boolean;
  position: number;
  /** ลิงก์งานที่ได้รับอนุมัติ (เช่น Google Drive) */
  deliverable_url: string | null;
  /** ไฟล์งานที่ได้รับอนุมัติ (path ใน storage) */
  deliverable_file_path: string | null;
  /** ผู้ตรวจงานที่ระบุ (ลำดับ 1) — คนที่จะกด approve ทอดแรก */
  reviewer_id: string | null;
  /** ผู้ตรวจลำดับ 1 คนที่ 2 (ผู้ตรวจร่วม — ไม่บังคับ): ทอดแรกต้องอนุมัติครบทั้งสองคน
      ก่อนส่งต่อลำดับ 2 (หรือปิดงาน ถ้าไม่มีลำดับ 2) — คนที่อนุมัติแล้วดูจาก *_approved_at รายช่อง */
  reviewer1b_id: string | null;
  /** เวลาที่ผู้ตรวจช่องหลัก (reviewer_id) อนุมัติทอดแรก — null = ยังไม่อนุมัติ
      (ล้างตอนยกเลิก/ตีกลับ/เปิดงานใหม่/ส่งตรวจรอบใหม่ พร้อม review1_approved_at) */
  reviewer1_approved_at: string | null;
  /** เวลาที่ผู้ตรวจร่วม (reviewer1b_id) อนุมัติทอดแรก — null = ยังไม่อนุมัติ */
  reviewer1b_approved_at: string | null;
  /** สถานะการตรวจ: none = ยังไม่ส่ง, pending = รอตรวจ, approved = ผ่าน (completed=true) */
  review_status: "none" | "pending" | "approved";
  /** ผู้ตรวจลำดับ 2 (อนุมัติขั้นสุดท้าย) — snapshot จาก app_settings ตอนส่งตรวจ; null = ตรวจชั้นเดียว */
  reviewer2_id: string | null;
  /** ทอดที่กำลังรอตรวจ (1|2) — มีผลเฉพาะตอน review_status='pending' */
  review_step: number;
  /** เวลาที่ผู้ตรวจลำดับ 1 อนุมัติ (ก่อนส่งต่อลำดับ 2) */
  review1_approved_at: string | null;
  /** เวลาที่กดส่งตรวจ — ใช้แสดง "รอมานานเท่าไร" (ล้างตอนยกเลิก/ตีกลับ/เปิดงานใหม่) */
  review_submitted_at: string | null;
  /** ผูกกับ influencer ที่ใช้ทำคอนเทนต์ (เลือกได้ ไม่บังคับ) */
  influencer_id: string | null;
  /** เวลาที่ผ่านการตรวจ (review_status เปลี่ยนเป็น approved) — ใช้เรียง/กรองแท็บ "งานเสร็จ" */
  approved_at: string | null;
  /** เวลาที่ทำเครื่องหมายว่า "โพส/ใช้งานแล้ว" (null = ยังไม่โพส) — ใช้ในแท็บ "งานเสร็จ" */
  posted_at: string | null;
  /** ผู้กดปุ่ม "โพสแล้ว" (null = ยังไม่โพส หรืองานเก่าก่อนมีคอลัมน์นี้) — ล้างพร้อม posted_at ตอนกดยกเลิก */
  posted_by: string | null;
  /** ถังขยะ — เวลาที่ถูกลบ (null = ยังอยู่); เก็บกู้คืนได้ 14 วันแล้วถูกลบถาวร */
  deleted_at: string | null;
  /** Brief workflow — ชนิดงานที่สั่ง (graphic|video); ตั้งบนการ์ด brief และสำเนาไปการ์ด creative */
  brief_content_type: string | null;
  /** เวลาที่ผู้รับกด "รับงาน" บนการ์ด brief (null = ยังไม่รับ) */
  brief_accepted_at: string | null;
  /** บนการ์ด creative — ชี้กลับไปการ์ด brief ต้นทางที่สร้างมัน */
  brief_source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** ไฟล์งานแนบของ task (รูป/วิดีโอ หลายไฟล์) */
export type TaskFileRow = {
  id: string;
  task_id: string;
  file_path: string;
  file_name: string | null;
  created_at: string;
};

export type TaskSectionRow = {
  id: string;
  name: string;
  position: number;
  /** ชนิดเซคชัน: work = ชิ้นงานปกติ, brief = สั่งงาน (การ์ดมีปุ่มรับงาน) */
  type: "work" | "brief";
  created_at: string;
};

export type TaskSubtaskRow = {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
};

/** ไฟล์แนบของงานย่อย (แนบได้หลายไฟล์ต่อ 1 งานย่อย) */
export type TaskSubtaskFileRow = {
  id: string;
  subtask_id: string;
  file_path: string;
  file_name: string | null;
  created_at: string;
};

/** หมวดหมู่งานที่จัดการได้ (เพิ่มได้จากหน้างาน) */
export type TaskCategoryRow = {
  id: string;
  name: string;
  created_at: string;
};

/** ตั้งค่ากลางของระบบ (key/value) เช่น default_reviewer_id */
export type AppSettingRow = {
  key: string;
  value: string | null;
  updated_at: string;
};

/** ประเภทการตีกลับ (migration 0063) — mistake = ข้อผิดพลาด นับเป็น KPI,
    addition = ผู้ตรวจขอให้ปรับเพิ่มเพื่อคุมคุณภาพ บันทึกไว้แต่ไม่นับเป็นข้อผิดพลาด */
export type RevisionKind = "mistake" | "addition";

export type TaskCommentRow = {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  /** true = คอมเมนต์นี้เป็นการตีกลับให้แก้ไข (นับครั้งเพื่อวัด KPI) */
  is_revision: boolean;
  /** ลำดับการแก้ไขของ task นี้ (1, 2, ...) — มีค่าเมื่อ is_revision */
  revision_number: number | null;
  /** ประเภทการตีกลับ — มีค่าเมื่อ is_revision เท่านั้น (DB บังคับด้วย check constraint) */
  revision_kind: RevisionKind | null;
  /** ไฟล์แนบในคอมเมนต์ (path ใน storage) */
  file_path: string | null;
  /** ลิงก์แนบในคอมเมนต์ (เช่น Google Drive) */
  link_url: string | null;
  created_at: string;
};

/** ชนิดการแจ้งเตือน (กระดิ่ง) — สร้างจาก client ตอนเกิดเหตุการณ์ */
export type NotificationType =
  | "mention"
  | "comment"
  | "assign"
  | "review_request"
  | "approved"
  | "rejected"
  | "brief_accepted";

export type NotificationRow = {
  id: string;
  /** ผู้รับการแจ้งเตือน */
  recipient_id: string;
  /** คนที่ทำให้เกิดเหตุการณ์ (คนแท็ก/คนมอบหมาย/...) */
  actor_id: string | null;
  task_id: string | null;
  type: NotificationType;
  /** ข้อความย่อ (เช่นเนื้อคอมเมนต์/เหตุผลตีกลับ) */
  preview: string | null;
  /** เวลาอ่าน — null = ยังไม่อ่าน */
  read_at: string | null;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type DataImportRow = {
  id: string;
  file_name: string;
  total_rows: number | null;
  imported_rows: number | null;
  status: string;
  error: string | null;
  imported_by: string | null;
  created_at: string;
};

export type SalesRecordRow = {
  id: string;
  record_date: string;
  branch: string | null;
  category: string | null;
  item_name: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number;
  customer_name: string | null;
  staff_name: string | null;
  payment_method: string | null;
  note: string | null;
  source: SalesSource;
  import_id: string | null;
  created_by: string | null;
  created_at: string;
  /* ฟิลด์จากชีท DA (source='sheet' — migration 0038); แถว manual เก่าเป็น null */
  receipt_no: string | null;
  receipt_total: number | null;
  product: string | null;
  doctor_name: string | null;
  hn: string | null;
  lead_source: string | null;
  nationality: string | null;
  customer_type: string | null;
  sales_team: string | null;
  staff_name2: string | null;
};

/** log การ sync ข้อมูลจากชีท (migration 0038) */
export type SheetSyncRunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error";
  detail: string | null;
  rows_synced: number | null;
};

export type AdminRecordRow = {
  id: string;
  record_date: string;
  admin_name: string | null;
  channel: string | null;
  new_leads: number;
  chats_handled: number;
  bookings: number;
  closed_amount: number;
  note: string | null;
  source: SalesSource;
  import_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type SalesTargetRow = {
  id: string;
  month: string;
  branch: string | null;
  target_amount: number;
  note: string | null;
  created_at: string;
};

/* ---------- Influ Management ---------- */

export type InfluTier = "nano" | "micro" | "mid" | "macro" | "celebrity";

/** กลุ่มขนาดบนบอร์ด Influ Management — s เล็ก (<100K) / m กลาง (100K–1M) / l ใหญ่ (1M+) */
export type InfluSizeGroup = "s" | "m" | "l";

/** โหมด checklist ของขั้นตามงาน — standard = เทมเพลต 5 หมวดตามเอกสารแนบท้ายสัญญา,
    custom = แพ็คเกจเฉพาะ (เคสดารา/จ่ายค่าตัว) กรอกเงื่อนไขเอง */
export type InfluFollowupMode = "standard" | "custom";

/** รายการแก้ไขหัตถการหน้างาน (ขั้นสัญญา + วันรับบริการ) — เก็บใน influencers.procedure_history */
export type ProcedureChange = {
  old: string;
  next: string;
  signed_by: string;
  /** ลายเซนหัวหน้างาน (data URL) */
  signature_data: string;
  changed_at: string;
};

export type InfluencerRow = {
  id: string;
  /** ตัวบุคคล (โปรไฟล์) — influ 1 คนเข้ามาทำได้หลายรอบ ทุกรอบแชร์ person_id เดียวกัน
      (0073; แถวเดิม backfill = id ของตัวเอง — เพิ่มคนใหม่ DB gen ให้เอง, เปิดรอบใหม่ client ส่งของคนเดิม) */
  person_id: string;
  /** รอบที่เท่าไหร่ของคนนี้ (เริ่ม 1) — เปิดรอบใหม่ = แถวใหม่ round_no ต่อจากรอบล่าสุด */
  round_no: number;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  occupation: string | null;
  followers: number | null;
  follower_note: string | null;
  tier: InfluTier | null;
  procedure_text: string | null;
  procedure_history: ProcedureChange[];
  case_value: number | null;
  service_date: string | null;
  doctor_name: string | null;
  photo_path: string | null;
  channel_photo_path: string | null;
  memo_file_path: string | null;
  memo_file_name: string | null;
  memo_uploaded_at: string | null;
  /** เวลาที่ติ๊กว่าข้อมูลสำหรับทำ memo ครบแล้ว (null = ยังไม่ติ๊ก) — แท็บ "รอทำ Memo" ใช้กรอง */
  memo_ready_at: string | null;
  /** เวลาที่ติ๊กว่า "ส่งเอกสารแล้ว" ในคิวรอทำ Memo (null = ยังไม่ส่ง) — กันทีมทำงานซ้ำ */
  docs_sent_at: string | null;
  /** ไฟล์สัญญาที่เซนแล้ว (อัพโหลดในขั้น "เซนสัญญา + วันรับบริการ") */
  contract_file_path: string | null;
  contract_file_name: string | null;
  contract_uploaded_at: string | null;
  maker_name: string | null;
  stage: number;
  completed: boolean;
  contract_start: string | null;
  contract_months: number;
  note: string | null;
  /** โหมด checklist ของขั้นตามงาน — สลับได้ในหน้านั้น (ข้อของอีกโหมดถูกซ่อน ไม่ถูกลบ) */
  followup_mode: InfluFollowupMode;
  /** ขอบเขตงานตามแพ็คเกจเฉพาะ (โหมด custom) — สิ่งที่ตกลงว่าเขาต้องทำ */
  package_note: string | null;
  /** กลุ่มขนาดบนบอร์ด (ลากการ์ดย้ายเอง) — null = จัดอัตโนมัติจาก followers */
  size_group: InfluSizeGroup | null;
  /** ลำดับการ์ดในคอลัมน์บอร์ด — null = fallback จาก created_at ฝั่ง client */
  board_position: number | null;
  /** true = ข้อมูล influencer เก่าที่นำเข้ามาเพื่อเก็บ/ค้นหา (archive-only) —
      ซ่อนจากบอร์ด Influ Management + หน้าอายุสัญญา, แสดงเฉพาะหน้าโปรไฟล์ Influencer */
  archived: boolean;
  /** เวลาที่ mark ว่า "ปฏิเสธ" (ไม่ร่วมงาน) — null = ไม่ได้ปฏิเสธ; ตัวกรองยกเว้นซ่อนได้ */
  declined_at: string | null;
  /** รหัส Influ ID ที่ทีมกำหนดเอง — DB บังคับไม่ให้ซ้ำ (เทียบแบบไม่สนตัวพิมพ์) */
  influ_code: string | null;
  /** ผู้รับผิดชอบเคส = คนที่สร้างการ์ด (null = บัญชีถูกลบไปแล้ว) */
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** log ทุกการกระทำในระบบ Influencer — insert ได้อย่างเดียว (ไม่มี policy update/delete) */
export type InfluActivityLogRow = {
  id: string;
  actor_id: string | null;
  /** ชื่อ ณ ตอนที่ทำ — บัญชีถูกลบแล้ว log ต้องยังบอกได้ว่าใครทำ */
  actor_name: string | null;
  action: InfluLogAction;
  entity: string;
  entity_id: string | null;
  /** ไม่ผูก FK: เคสถูกลบไปแล้ว log ของเคสนั้นต้องยังอยู่ */
  influencer_id: string | null;
  influencer_name: string | null;
  summary: string;
  meta: Json;
  created_at: string;
};

/** ชนิดการกระทำใน log — ป้าย/สีอยู่ที่ INFLU_LOG_ACTIONS (influ-log.ts)
    ค่าอื่นที่ไม่รู้จักยังเก็บได้ (DB เป็น text อิสระ) แค่แสดงเป็นป้ายกลาง */
export type InfluLogAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "stage"
  | "upload"
  | "status";

/** สำเนาเคสที่ถูกลบ — เก็บ 30 วันแล้วล้างอัตโนมัติ (influ_purge_expired_backups) */
export type InfluDeletedBackupRow = {
  id: string;
  entity: string;
  entity_id: string;
  label: string;
  payload: Json;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  purge_after: string;
  restored_at: string | null;
  restored_by: string | null;
};

export type InfluFollowupRow = {
  id: string;
  influencer_id: string;
  round: number;
  comment: string | null;
  created_at: string;
};

export type InfluSignatureRow = {
  id: string;
  influencer_id: string;
  doc: string;
  role: string;
  signer_name: string | null;
  signature_data: string;
  signed_at: string;
};

export type InfluTaskRow = {
  id: string;
  influencer_id: string;
  step: number;
  title: string;
  script: string | null;
  channel: string | null;
  due_date: string | null;
  description: string | null;
  /** หมวดของ checklist (เอกสาร 5 หมวด) — null = งานจากเทมเพลตเดิม */
  section: string | null;
  /** หมายเหตุเพิ่มเติมรายข้อ */
  note: string | null;
  /** true = ข้อที่ทีมพิมพ์เอง (โหมดแพ็คเกจเฉพาะ) — แสดงเฉพาะเมื่อ influencer.followup_mode = 'custom' */
  is_custom: boolean;
  done: boolean;
  done_at: string | null;
};

export type InfluCampaignRow = {
  id: string;
  influencer_id: string;
  name: string;
  detail: string | null;
  campaign_date: string | null;
  created_at: string;
};

/** ประเภทคิวบนปฏิทิน Influ Calendar — DB มี check constraint ตามรายการนี้
    (เพิ่มชนิดใหม่ต้องแก้ทั้ง constraint และ INFLU_CALENDAR_KINDS) */
export type InfluCalendarKind =
  | "service"
  | "shoot"
  | "post"
  | "meeting"
  | "followup"
  | "other";

/** คิวงาน influencer บนปฏิทินรายเดือน (/influ-calendar)
    influencer_id null = คิวทั่วไปไม่ผูกคน · start_time null = ทั้งวัน (ยังไม่เคาะเวลา) */
export type InfluCalendarEventRow = {
  id: string;
  influencer_id: string | null;
  title: string;
  kind: InfluCalendarKind;
  /** แพทย์ที่รับคิวนี้ — เติมอัตโนมัติจาก influencers.doctor_name ตอนเลือก influencer แต่แก้ได้ */
  doctor_name: string | null;
  /** วันที่ของคิว (YYYY-MM-DD — date ล้วน ไม่มี timezone) */
  event_date: string;
  /** เวลาเริ่ม/สิ้นสุด (HH:MM:SS) — null = ทั้งวัน */
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  note: string | null;
  done: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Product team ของหัตถการ (migration 0080) — บริษัทแบ่งทีมสินค้า:
    aesthetics = สกินทั้งหมด / breast = หน้าอก / abdomen = หนังหน้าท้อง / lipo = ดูดไขมัน
    เพิ่มทีมใหม่ต้องแก้ 3 ที่: type นี้, INFLU_PRODUCT_TEAMS (influ-constants)
    และ check constraint ใน migration ใหม่ (influ_services.team + influ_procedure_items.product_team) */
export type InfluProductTeam = "aesthetics" | "breast" | "abdomen" | "lipo";

/** โปรไฟล์ "ตัวบุคคล" ของ influencer (migration 0080) — 1 แถว = 1 คน
    มีโปรไฟล์ = ตกลงร่วมงานกันแล้ว แต่ยังไม่ confirm หัตถการ/วันนัด
    เคสทุกรอบของคนเดียวกันชี้มาที่นี่ผ่าน influencers.person_id (FK) */
export type InfluProfileRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  occupation: string | null;
  followers: number | null;
  follower_note: string | null;
  tier: InfluTier | null;
  /** แถว backfill ชี้ไฟล์ในโฟลเดอร์ของเคสเดิม — เคสถูกลบ = ไฟล์หาย ต้อง fallback ได้เสมอ */
  photo_path: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** ช่องทางติดต่อ/โซเชียลของโปรไฟล์ — หลายช่องต่อคน (IG/TikTok/Line/เบอร์สำรอง ...) */
export type InfluProfileChannelRow = {
  id: string;
  profile_id: string;
  /** ชื่อแพลตฟอร์ม text อิสระ — ตัวเลือกแนะนำอยู่ INFLU_CHANNEL_PLATFORMS (influ-constants) */
  platform: string;
  /** ลิงก์ / handle / เบอร์ — ขึ้นต้น http = กดเปิดได้ */
  value: string;
  /** ยอดผู้ติดตามของช่องนี้ (ยอดรวมของคนอยู่ที่ influ_profiles.followers) */
  followers: number | null;
  position: number;
  created_at: string;
};

/** ทะเบียนหัตถการที่ทีมเพิ่มเอง แยกตาม product team (migration 0080)
    ทีม aesthetics ใช้ price_items เป็นเมนูหลัก — ตารางนี้เก็บเฉพาะที่ทีมพิมพ์เพิ่มใหม่
    ทีมอื่น (หน้าอก/หนังหน้าท้อง/ดูดไขมัน) ยังไม่มีเมนูกลาง = รายการทั้งหมดมาจากตารางนี้ */
export type InfluServiceRow = {
  id: string;
  team: InfluProductTeam;
  name: string;
  /** ต้นทุนอ้างอิงตั้งต้น (บาท) — null/0 = ยังไม่รู้ */
  default_price: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
};

/** รายการโปรแกรม/หัตถการของ influencer รายรายการ (Influencer Cost)
    price = ต้นทุนค่าบริการ (บาท; 0 = ยังไม่กรอก — backfill จาก procedure_text เดิมเป็น 0 ทั้งหมด)
    is_supported = แบรนด์สินค้า support ของ → ต้นทุนรายการนี้นับเป็น 0 */
export type InfluProcedureItemRow = {
  id: string;
  influencer_id: string;
  name: string;
  price: number;
  is_supported: boolean;
  /** ลิงก์ไป price_items (เลือกจาก dropdown Price List) — เพิ่มเองอิสระได้ = null */
  price_item_id: string | null;
  /** หัตถการนี้เป็นของ product team ไหน (0080) — ของเดิมทั้งหมด = aesthetics */
  product_team: InfluProductTeam;
  position: number;
  created_at: string;
  updated_at: string;
};

/** ลิงก์ไฟล์ source ของ influencer (Google Drive ฯลฯ) — แปะได้หลายลิงก์ต่อคน
    เปิดเร็วจากการ์ดบอร์ด / การ์ดแกลเลอรี / หน้า detail */
export type InfluLinkRow = {
  id: string;
  influencer_id: string;
  /** ชื่อกำกับลิงก์ — null/ว่าง = แสดง hostname แทน */
  title: string | null;
  url: string;
  position: number;
  created_by: string | null;
  created_at: string;
};

/** ชนิดของลิงก์ผลงานที่ influencer ลงจริง — โพส/คลิป หรือคอมเมนต์รีวิว */
export type InfluPostKind = "post" | "comment";

/** ลิงก์โพส/คอมเมนต์ที่ influencer ลงจริง (ขั้นตามงาน — migration 0066)
    แปะได้หลายลิงก์ต่อคน: โพสหลัก/โพสเสริม และคอมเมนต์รีวิว + โน้ตกำกับ */
export type InfluPostLinkRow = {
  id: string;
  influencer_id: string;
  kind: InfluPostKind;
  url: string;
  /** โน้ตกำกับ เช่น "คลิปรีวิวหลัก TikTok" — null = ไม่มี */
  note: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
};

/** หมวดของผลวิเคราะห์ที่แชร์ในแท็บ "ผลวิเคราะห์" หน้า Task (migration 0065) */
export type AnalysisCategory = "content" | "ads" | "artwork" | "other";

/** ช่วงเวลาของผลวิเคราะห์ — รายสัปดาห์ (week = 1-5) หรือรายเดือน (week = null) */
export type AnalysisPeriod = "weekly" | "monthly";

/** ลิงก์ผลวิเคราะห์ (Canva) — หัวหน้าทีมแปะแชร์ให้ทีมใช้เป็นต้นแบบ (migration 0065)
    เพิ่ม/แก้/ลบเฉพาะ admin (คุมที่ UI) — ทีม team เห็นอ่านอย่างเดียว */
export type AnalysisLinkRow = {
  id: string;
  /** ชื่อกำกับลิงก์ — null/ว่าง = แสดงชื่อหมวดแทน */
  title: string | null;
  url: string;
  category: AnalysisCategory;
  period: AnalysisPeriod;
  /** ปี ค.ศ. เสมอ (DB มี check 2020-2100 กันเผลอกรอกปี พ.ศ.) */
  year: number;
  month: number;
  /** สัปดาห์ที่ในเดือน 1-5 — null เมื่อ period = monthly (DB บังคับด้วย constraint) */
  week: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/** ทะเบียนแพทย์ (จัดการหมอ) — ตัวเลือก "แพทย์ที่รับเคส" ใน Influ Management / Influ Calendar
    จับคู่กับ influencers.doctor_name และ influ_calendar_events.doctor_name ด้วย "ชื่อ" (text)
    active=false = ซ่อนจากตัวเลือก แต่ชื่อในเคส/คิวเก่ายังแสดงตามเดิม */
export type DoctorRow = {
  id: string;
  name: string;
  /** รูปโปรไฟล์ใน bucket documents path doctors/{id}/... — null = แสดงไอคอนแทน */
  photo_path: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PricePromotionRow = {
  id: string;
  category: string;
  item_name: string;
  detail: string | null;
  normal_price: number;
  promo_price: number;
  starts_on: string | null;
  expires_on: string | null;
  approved_by: string | null;
  note: string | null;
  /** รูปโปรโมชัน — null = ระบบ generate ภาพแบรนด์ให้อัตโนมัติ */
  image_url: string | null;
  created_at: string;
};

/** ข้อเสนอราคา (โปรโมชัน/คอร์ส) ของรายการใน price list — เก็บใน jsonb */
export type PriceOffer = {
  label: string;
  /** เก็บเป็นข้อความ เช่น "4,990" หรือ "3,745/เส้น" */
  price: string;
  /** YYYY-MM-DD */
  start: string;
  end: string;
};

/** กลุ่มหัตถการของรายการ Price List — 1 รายการติดได้หลายกลุ่ม
    (แพ็กเกจรวมมักมีทั้งเครื่องและฉีด เช่น "Ultraformer + Botox") */
export type PriceGroup = "injection" | "treatment" | "device";

/** รายการใน Price List กลาง — แสดงบนหน้าสาธารณะ /price-list (anon อ่านได้) */
export type PriceItemRow = {
  id: string;
  item_no: number | null;
  category: string;
  name: string;
  benefits: string | null;
  process: string | null;
  /** คำค้นเพิ่มเติม/ชื่อเรียกปากเปล่า (เช่น Hutox = "Botox Korea โบเกาหลี") — ใช้ประกอบการค้นหา ไม่แสดงบนเมนู (migration 0059) */
  search_aliases: string | null;
  price_normal: string | null;
  promos: PriceOffer[];
  courses: PriceOffer[];
  /** ต้องมีอย่างน้อย 1 กลุ่มเสมอ — DB บังคับด้วย constraint price_items_groups_valid */
  groups: PriceGroup[];
  sort: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** ชนิดของสิ่งที่ขาย: promo = โปรช่วงเวลาที่อนุมัติระหว่างปี (มีวันหมดเขตจริง)
    / package = แพ็กเกจประจำในระบบ (คอร์ส 5-10 ครั้ง ฯลฯ ยกเข้าระบบทีเดียวทั้งปี) */
export type PromoPackageKind = "promo" | "package";

/** หัตถการที่ได้รับในแพ็กเกจ 1 บรรทัด — "โปรนี้ได้อะไรบ้าง" (migration 0071) */
export type PromoPackageItemRow = {
  id: string;
  package_id: string;
  /** รหัสหัตถการในระบบ POS (AES-68xxxxx) — null ได้ถ้าไฟล์ไม่มีรหัส */
  item_sku: string | null;
  item_name: string;
  qty: number;
  unit: string | null;
  /** ราคา Price list ต่อหน่วย (ราคาเต็ม — ไม่ใช่ต้นทุน) */
  unit_price: number | null;
  position: number;
  created_at: string;
};

/** โปร/แพ็กเกจที่ขายจริง — แหล่งข้อมูลของหน้าสาธารณะ /price-list (migration 0071) */
export type PromoPackageRow = {
  id: string;
  /** รหัสแพ็กเกจในระบบ POS เช่น PKAES-6811002 — กุญแจตอน re-import */
  sku: string;
  name: string;
  category: string;
  /** แท็บ ฉีด/ทรีตเม้น/เครื่อง — ชุดเดียวกับ price_items.groups */
  groups: PriceGroup[];
  kind: PromoPackageKind;
  sale_price: number;
  /** ราคาเต็ม = Σ (จำนวน × ราคา Price list ต่อหน่วย); null = คิด % ส่วนลดไม่ได้ */
  full_price: number | null;
  starts_on: string | null;
  /** null = ไม่ระบุวันหมดเขต (ขายต่อเนื่อง) — คนละเรื่องกับหมดเขตแล้ว */
  ends_on: string | null;
  /** แพ็กเกจหัตถการเดียว: ใช้จับกลุ่มแถวแบบตาราง Price List; null = แพ็กเกจรวม */
  base_item_sku: string | null;
  base_item_name: string | null;
  base_qty: number | null;
  base_unit: string | null;
  base_unit_price: number | null;
  /** เลขที่เอกสารอนุมัติ — ใช้ในหลังบ้าน ไม่แสดงบนหน้าสาธารณะ */
  memo: string | null;
  note: string | null;
  active: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
};

/** แพ็กเกจพร้อมรายการหัตถการที่ได้ (embed จาก promo_package_items) */
export type PromoPackageWithItems = PromoPackageRow & {
  items: PromoPackageItemRow[];
};

export type StaffKpiRow = {
  id: string;
  /** วันแรกของเดือน (YYYY-MM-01) */
  month: string;
  person_name: string;
  team: "sales" | "admin";
  target_amount: number;
  note: string | null;
  created_at: string;
};

export type FileLinkRow = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  source_type: string;
  category: string;
  /** path ใน storage bucket `documents` — มีค่าเมื่อเป็นไฟล์ที่อัปโหลด (url จะเป็น "") */
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
};

/* ---------- My List — งาน/โน้ตส่วนตัว (/my-tasks) ---------- */

/** ระดับการเปิดเผยของรายการใน My List — วันนี้ทุกแถวเป็น 'private'
    ('shared' เตรียมไว้ให้ UI แชร์ในอนาคต คู่กับตาราง list_task_shares) */
export type ListVisibility = "private" | "shared";

/** งาน/โน้ตส่วนตัวหนึ่งรายการ — เห็นเฉพาะเจ้าของ (RLS ยึด owner_id ไม่ใช่ "authenticated ทั้งหมด") */
export type ListTaskRow = {
  id: string;
  /** เจ้าของรายการ — ทุก policy ยึดคอลัมน์นี้ (ลบบัญชี = ลิสต์ส่วนตัวหายไปด้วย) */
  owner_id: string;
  title: string;
  /** โน้ต/รายละเอียดยาว (แก้ในแผงรายละเอียด) */
  note: string | null;
  /** ใช้ชุดเดียวกับบอร์ดทีม — สีของแถวเปลี่ยนตามค่านี้ (LIST_PRIORITY ใน constants)
   *  มีผลเมื่อ priority_id เป็น null (เลือกความสำคัญที่เพิ่มเอง = อ่านจากตัวเลือกนั้นแทน) */
  priority: TaskPriority;
  /** ความสำคัญที่ผู้ใช้เพิ่มเอง (list_options kind=priority) — null = ใช้คอลัมน์ priority (migration 0072) */
  priority_id: string | null;
  /** สถานะที่ผู้ใช้เพิ่มเอง (list_options kind=status) — null = ใช้สถานะคำนวณจาก done + due_date
   *  ค่านี้เป็นสถานะ "ระหว่างทาง" เสมอ: ติ๊กเสร็จเมื่อไหร่ client ล้างเป็น null ให้ (migration 0072) */
  status_id: string | null;
  due_date: string | null;
  done: boolean;
  /** DB ตั้ง/ล้างเองจาก trigger list_tasks_set_done_at — client ส่งมาก็ถูกทับ */
  done_at: string | null;
  /** ลำดับในลิสต์ (ลากเรียงเอง) — float กึ่งกลางเพื่อนบ้านเหมือนบอร์ด Task/Influ */
  position: number;
  /** หมวดหมู่ (list_groups) ที่งานอยู่ — null = ยังไม่จัดหมวด (ลบหมวดแล้ว DB SET NULL ให้เอง) */
  group_id: string | null;
  visibility: ListVisibility;
  created_at: string;
  updated_at: string;
};

/** หมวดหมู่ของ My List — หัวข้อใหญ่บนบอร์ดที่ผู้ใช้ตั้งเองรายคนแบบกลุ่มของ Monday
    (migration 0067; ชื่อซ้ำได้โดยตั้งใจ ต่างจากแท็กที่ unique เพราะใช้ค้น/กรอง) */
export type ListGroupRow = {
  id: string;
  owner_id: string;
  name: string;
  /** key ของชุดสีใน LIST_TAG_COLORS — ค่าที่ไม่รู้จัก fallback เป็น brand (DB ไม่มี check) */
  color: string;
  /** ลำดับหมวดบนบอร์ด — float กึ่งกลางเพื่อนบ้านเหมือน position ของงาน */
  position: number;
  created_at: string;
};

/** ชนิดของ dropdown ที่ตัวเลือกอยู่ — เพิ่มชนิดใหม่ต้องแก้ check constraint ของ list_options ด้วย */
export type ListOptionKind = "status" | "priority";

/** ตัวเลือกที่ผู้ใช้ "กดเพิ่มเอง" ให้ dropdown ของ My List (migration 0072)
    — เป็นชั้นเสริมของตัวเลือกในตัว: งานที่ไม่ได้เลือก (status_id/priority_id = null)
    ยังใช้สถานะคำนวณ/ความสำคัญ 4 ระดับเดิมทุกประการ */
export type ListOptionRow = {
  id: string;
  owner_id: string;
  kind: ListOptionKind;
  name: string;
  /** key ของชุดสีใน LIST_TAG_COLORS — ค่าที่ไม่รู้จัก fallback เป็น brand (DB ไม่มี check) */
  color: string;
  /** ลำดับในเมนู — float กึ่งกลางเพื่อนบ้านเหมือน position ของงาน */
  position: number;
  created_at: string;
};

/** แท็กของ My List — เป็นของรายคน (unique ที่ owner_id + ชื่อ ไม่สนตัวพิมพ์) */
export type ListTagRow = {
  id: string;
  owner_id: string;
  name: string;
  /** key ของชุดสีใน LIST_TAG_COLORS — ค่าที่ไม่รู้จัก fallback เป็น brand (DB ไม่มี check) */
  color: string;
  created_at: string;
};

export type ListTaskTagRow = {
  task_id: string;
  tag_id: string;
};

/** ไฟล์แนบของงานใน My List — วิดีโอ/รูป/ไอเดียของเจ้าของลิสต์ (migration 0070)
    ไฟล์จริงอยู่ใน bucket documents path `my-tasks/{task_id}/` — คนละชุดกับ task_files
    ของบอร์ดทีม (ไฟล์ส่วนตัวจึงไม่เข้าคลังรวม All Media) */
export type ListTaskFileRow = {
  id: string;
  task_id: string;
  file_path: string;
  /** ชื่อไฟล์เดิมตอนอัพ — path จริงมี timestamp นำหน้ากันชนกัน */
  file_name: string;
  created_at: string;
};

/** การแชร์รายการให้คนอื่น — เตรียมโครงไว้ ยังไม่มี UI สร้างแถว
    (policy วันนี้ให้สิทธิ์อ่านอย่างเดียว; can_edit จะมีผลเมื่อเปิด UI แชร์) */
export type ListTaskShareRow = {
  task_id: string;
  profile_id: string;
  can_edit: boolean;
  created_at: string;
};

/** รายการพร้อมแท็กที่ติดอยู่ — ประกอบฝั่ง client จาก list_task_tags */
export type ListTaskWithTags = ListTaskRow & { tagIds: string[] };

/** อีเมลที่ได้รับอนุญาตให้มีบัญชี — จัดการผ่าน edge function `admin-users` เท่านั้น (RLS ไม่มี policy) */
export type AllowedEmailRow = {
  email: string;
  note: string | null;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      allowed_emails: {
        Row: AllowedEmailRow;
        Insert: Partial<AllowedEmailRow> & { email: string };
        Update: Partial<AllowedEmailRow>;
        Relationships: [];
      };
      task_reviewers: {
        Row: TaskReviewerRow;
        Insert: Partial<TaskReviewerRow> & { profile_id: string };
        Update: Partial<TaskReviewerRow>;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: Partial<TaskRow> & { title: string };
        Update: Partial<TaskRow>;
        Relationships: [];
      };
      documents: {
        Row: DocumentRow;
        Insert: Partial<DocumentRow> & { name: string; file_path: string };
        Update: Partial<DocumentRow>;
        Relationships: [];
      };
      data_imports: {
        Row: DataImportRow;
        Insert: Partial<DataImportRow> & { file_name: string };
        Update: Partial<DataImportRow>;
        Relationships: [];
      };
      sales_records: {
        Row: SalesRecordRow;
        Insert: Partial<SalesRecordRow> & { record_date: string; amount: number };
        Update: Partial<SalesRecordRow>;
        Relationships: [];
      };
      sheet_sync_runs: {
        Row: SheetSyncRunRow;
        Insert: Partial<SheetSyncRunRow>;
        Update: Partial<SheetSyncRunRow>;
        Relationships: [];
      };
      file_links: {
        Row: FileLinkRow;
        Insert: Partial<FileLinkRow> & { title: string; url: string };
        Update: Partial<FileLinkRow>;
        Relationships: [];
      };
      task_sections: {
        Row: TaskSectionRow;
        Insert: Partial<TaskSectionRow> & { name: string };
        Update: Partial<TaskSectionRow>;
        Relationships: [];
      };
      task_subtasks: {
        Row: TaskSubtaskRow;
        Insert: Partial<TaskSubtaskRow> & { task_id: string; title: string };
        Update: Partial<TaskSubtaskRow>;
        Relationships: [];
      };
      task_subtask_files: {
        Row: TaskSubtaskFileRow;
        Insert: Partial<TaskSubtaskFileRow> & {
          subtask_id: string;
          file_path: string;
        };
        Update: Partial<TaskSubtaskFileRow>;
        Relationships: [];
      };
      task_categories: {
        Row: TaskCategoryRow;
        Insert: Partial<TaskCategoryRow> & { name: string };
        Update: Partial<TaskCategoryRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingRow;
        Insert: Partial<AppSettingRow> & { key: string };
        Update: Partial<AppSettingRow>;
        Relationships: [];
      };
      task_comments: {
        Row: TaskCommentRow;
        Insert: Partial<TaskCommentRow> & { task_id: string; body: string };
        Update: Partial<TaskCommentRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow> & {
          recipient_id: string;
          type: NotificationType;
        };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      task_files: {
        Row: TaskFileRow;
        Insert: Partial<TaskFileRow> & { task_id: string; file_path: string };
        Update: Partial<TaskFileRow>;
        Relationships: [];
      };
      admin_records: {
        Row: AdminRecordRow;
        Insert: Partial<AdminRecordRow> & { record_date: string };
        Update: Partial<AdminRecordRow>;
        Relationships: [];
      };
      sales_targets: {
        Row: SalesTargetRow;
        Insert: Partial<SalesTargetRow> & { month: string; target_amount: number };
        Update: Partial<SalesTargetRow>;
        Relationships: [];
      };
      influencers: {
        Row: InfluencerRow;
        Insert: Partial<InfluencerRow> & { first_name: string };
        Update: Partial<InfluencerRow>;
        Relationships: [];
      };
      influ_followups: {
        Row: InfluFollowupRow;
        Insert: Partial<InfluFollowupRow> & {
          influencer_id: string;
          round: number;
        };
        Update: Partial<InfluFollowupRow>;
        Relationships: [];
      };
      influ_signatures: {
        Row: InfluSignatureRow;
        Insert: Partial<InfluSignatureRow> & {
          influencer_id: string;
          doc: string;
          role: string;
          signature_data: string;
        };
        Update: Partial<InfluSignatureRow>;
        Relationships: [];
      };
      influ_tasks: {
        Row: InfluTaskRow;
        Insert: Partial<InfluTaskRow> & {
          influencer_id: string;
          step: number;
          title: string;
        };
        Update: Partial<InfluTaskRow>;
        Relationships: [];
      };
      influ_campaigns: {
        Row: InfluCampaignRow;
        Insert: Partial<InfluCampaignRow> & {
          influencer_id: string;
          name: string;
        };
        Update: Partial<InfluCampaignRow>;
        Relationships: [];
      };
      influ_calendar_events: {
        Row: InfluCalendarEventRow;
        Insert: Partial<InfluCalendarEventRow> & {
          title: string;
          event_date: string;
        };
        Update: Partial<InfluCalendarEventRow>;
        Relationships: [];
      };
      influ_procedure_items: {
        Row: InfluProcedureItemRow;
        Insert: Partial<InfluProcedureItemRow> & {
          influencer_id: string;
          name: string;
        };
        Update: Partial<InfluProcedureItemRow>;
        Relationships: [];
      };
      influ_profiles: {
        Row: InfluProfileRow;
        Insert: Partial<InfluProfileRow> & { first_name: string };
        Update: Partial<InfluProfileRow>;
        Relationships: [];
      };
      influ_profile_channels: {
        Row: InfluProfileChannelRow;
        Insert: Partial<InfluProfileChannelRow> & {
          profile_id: string;
          platform: string;
          value: string;
        };
        Update: Partial<InfluProfileChannelRow>;
        Relationships: [];
      };
      influ_services: {
        Row: InfluServiceRow;
        Insert: Partial<InfluServiceRow> & {
          team: InfluProductTeam;
          name: string;
        };
        Update: Partial<InfluServiceRow>;
        Relationships: [];
      };
      doctors: {
        Row: DoctorRow;
        Insert: Partial<DoctorRow> & { name: string };
        Update: Partial<DoctorRow>;
        Relationships: [];
      };
      influ_links: {
        Row: InfluLinkRow;
        Insert: Partial<InfluLinkRow> & {
          influencer_id: string;
          url: string;
        };
        Update: Partial<InfluLinkRow>;
        Relationships: [];
      };
      influ_post_links: {
        Row: InfluPostLinkRow;
        Insert: Partial<InfluPostLinkRow> & {
          influencer_id: string;
          url: string;
        };
        Update: Partial<InfluPostLinkRow>;
        Relationships: [];
      };
      influ_activity_log: {
        Row: InfluActivityLogRow;
        Insert: Partial<InfluActivityLogRow> & {
          action: InfluLogAction;
          summary: string;
        };
        /** log แก้ไม่ได้ (ไม่มี policy update) — type ปิดไว้ให้ตรงกับ DB */
        Update: never;
        Relationships: [];
      };
      influ_deleted_backups: {
        Row: InfluDeletedBackupRow;
        Insert: Partial<InfluDeletedBackupRow> & {
          entity_id: string;
          label: string;
          payload: Json;
        };
        Update: Partial<InfluDeletedBackupRow>;
        Relationships: [];
      };
      analysis_links: {
        Row: AnalysisLinkRow;
        /** week บังคับมีเมื่อ period='weekly' (DB constraint — type บังคับให้ไม่ได้) */
        Insert: Partial<AnalysisLinkRow> & {
          url: string;
          period: AnalysisPeriod;
          year: number;
          month: number;
        };
        Update: Partial<AnalysisLinkRow>;
        Relationships: [];
      };
      price_items: {
        Row: PriceItemRow;
        Insert: Partial<PriceItemRow> & {
          category: string;
          name: string;
          /** DB บังคับอย่างน้อย 1 กลุ่ม — insert โดยไม่ส่งจะติด constraint */
          groups: PriceGroup[];
        };
        Update: Partial<PriceItemRow>;
        Relationships: [];
      };
      promo_packages: {
        Row: PromoPackageRow;
        Insert: Partial<PromoPackageRow> & {
          sku: string;
          name: string;
          category: string;
          /** DB บังคับอย่างน้อย 1 กลุ่ม (constraint promo_packages_groups_valid) */
          groups: PriceGroup[];
          sale_price: number;
        };
        Update: Partial<PromoPackageRow>;
        Relationships: [];
      };
      promo_package_items: {
        Row: PromoPackageItemRow;
        Insert: Partial<PromoPackageItemRow> & {
          package_id: string;
          item_name: string;
        };
        Update: Partial<PromoPackageItemRow>;
        Relationships: [];
      };
      price_promotions: {
        Row: PricePromotionRow;
        Insert: Partial<PricePromotionRow> & {
          category: string;
          item_name: string;
          normal_price: number;
          promo_price: number;
        };
        Update: Partial<PricePromotionRow>;
        Relationships: [];
      };
      list_tasks: {
        Row: ListTaskRow;
        Insert: Partial<ListTaskRow> & { owner_id: string; title: string };
        Update: Partial<ListTaskRow>;
        Relationships: [];
      };
      list_groups: {
        Row: ListGroupRow;
        Insert: Partial<ListGroupRow> & { owner_id: string; name: string };
        Update: Partial<ListGroupRow>;
        Relationships: [];
      };
      list_options: {
        Row: ListOptionRow;
        Insert: Partial<ListOptionRow> & {
          owner_id: string;
          kind: ListOptionKind;
          name: string;
        };
        Update: Partial<ListOptionRow>;
        Relationships: [];
      };
      list_tags: {
        Row: ListTagRow;
        Insert: Partial<ListTagRow> & { owner_id: string; name: string };
        Update: Partial<ListTagRow>;
        Relationships: [];
      };
      list_task_tags: {
        Row: ListTaskTagRow;
        Insert: ListTaskTagRow;
        Update: Partial<ListTaskTagRow>;
        Relationships: [];
      };
      list_task_files: {
        Row: ListTaskFileRow;
        Insert: Partial<ListTaskFileRow> & {
          task_id: string;
          file_path: string;
          file_name: string;
        };
        Update: Partial<ListTaskFileRow>;
        Relationships: [];
      };
      list_task_shares: {
        Row: ListTaskShareRow;
        Insert: Partial<ListTaskShareRow> & {
          task_id: string;
          profile_id: string;
        };
        Update: Partial<ListTaskShareRow>;
        Relationships: [];
      };
      staff_kpis: {
        Row: StaffKpiRow;
        Insert: Partial<StaffKpiRow> & {
          month: string;
          person_name: string;
          team: "sales" | "admin";
          target_amount: number;
        };
        Update: Partial<StaffKpiRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    /* RPC aggregate ยอดขาย (migration 0038) — คืน jsonb ให้ cast เป็น type ใน report-utils */
    Functions: {
      sales_dash_summary: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      sales_totals: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      sales_monthly_series: {
        Args: { p_from: string };
        Returns: Json;
      };
      sales_staff_detail: {
        Args: { p_name: string; p_from: string; p_to: string };
        Returns: Json;
      };
      /** ลบเคส Influ = สำรองลง influ_deleted_backups ก่อนเสมอ — คืน id ของสำเนา */
      influ_delete_with_backup: {
        Args: { p_id: string };
        Returns: string;
      };
      /** กู้คืนเคสจากสำเนา (พร้อมลูกทุกตาราง) — คืน id ของเคสที่กลับมา */
      influ_restore_backup: {
        Args: { p_backup_id: string };
        Returns: string;
      };
      /** ล้างสำเนาที่เกิน 30 วัน — คืนจำนวนที่ล้าง (เรียกตอนเปิดหน้าถังขยะ) */
      influ_purge_expired_backups: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** task พร้อมข้อมูลผู้รับผิดชอบ (join จาก profiles) */
/** influencer แบบย่อ (ใช้แสดงบน task) */
export type InfluencerLite = Pick<
  InfluencerRow,
  "id" | "first_name" | "last_name" | "nickname" | "round_no"
>;

/** ข้อมูลย่อของ "รอบงาน" หนึ่งรอบของคนเดียวกัน — แถบสลับรอบบนหน้าเดินงาน (/influencers/[id]) */
export type InfluRoundLite = Pick<
  InfluencerRow,
  | "id"
  | "round_no"
  | "stage"
  | "completed"
  | "declined_at"
  | "archived"
  | "service_date"
  | "created_at"
>;

export type TaskWithAssignee = TaskRow & {
  assignee: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  reviewer?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  /** ผู้ตรวจลำดับ 1 คนที่ 2 (join จาก reviewer1b_id) — ผู้ตรวจร่วมทอดแรก ต้องอนุมัติครบทุกคน */
  reviewer1b?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  /** ผู้ตรวจลำดับ 2 (join จาก reviewer2_id) — อนุมัติขั้นสุดท้ายเมื่อมีตรวจ 2 ทอด */
  reviewer2?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  /** ผู้สร้างการ์ด (join จาก created_by) — การ์ด creative ที่มาจาก brief = ผู้สั่ง brief */
  creator?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  /** ผู้กด "โพสแล้ว" (join จาก posted_by) — โชว์บนการ์ดงานเสร็จ/แผงรายละเอียด */
  poster?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  influencer?: InfluencerLite | null;
  files?: TaskFileRow[];
};

/** ลิงก์ไฟล์พร้อมชื่อผู้เพิ่ม (join จาก profiles) */
export type FileLinkWithCreator = FileLinkRow & {
  creator: Pick<ProfileRow, "full_name" | "email"> | null;
};

/** ความคิดเห็นพร้อมชื่อผู้เขียน (join จาก profiles) */
export type TaskCommentWithAuthor = TaskCommentRow & {
  author: Pick<ProfileRow, "full_name" | "email" | "avatar_path"> | null;
};

/** การแจ้งเตือนพร้อมข้อมูลคนทำ + ชื่องาน (join สำหรับแสดงในกระดิ่ง) */
export type NotificationWithJoins = NotificationRow & {
  actor: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  task: Pick<TaskRow, "id" | "title"> | null;
};
