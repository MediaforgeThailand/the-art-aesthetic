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
  | "pricing"
  // ระบบ Wellness — สิทธิ์แยกอิสระ 4 บทบาท (ติ๊กรวมกันได้ ดู WELLNESS_ROLES ใน permissions.ts):
  // bc = สร้าง/แก้การ์ดลูกค้า, lab = อัพ/ลบไฟล์ผลตรวจ + ยืนยันผล,
  // admin = ลงคิว/จัดการทุกอย่าง, doctor = ดูปฏิทินคิว + ผลตรวจ (อ่านอย่างเดียว)
  | "wellness_bc"
  | "wellness_lab"
  | "wellness_admin"
  | "wellness_doctor"
  // เพิ่ม/แก้/ลบทะเบียนหมอ (ตาราง doctors — ใช้ร่วมกันทั้งหน้า "จัดการแท็ก" ของทีมคอนเทนต์
  // และ /influ-doctors ของระบบ Influencer) — เดิมล็อกเฉพาะ role admin เท่านั้น เปิดเป็น
  // สิทธิ์แยกได้ตั้งแต่ 2026-09-07 ตามคำขอผู้ใช้ (isAdmin ยังทำได้เหมือนเดิมด้วย)
  | "doctor_manage";

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
  /** ทอดที่กำลังรอตรวจ — มีผลเฉพาะตอน review_status='pending'
      0 = ผู้สั่ง brief ตรวจก่อน (เฉพาะการ์ดที่มาจาก brief) · 1 = ผู้ตรวจจริง · 2 = ผู้ตรวจลำดับ 2 */
  review_step: number;
  /** เวลาที่ผู้ตรวจลำดับ 1 อนุมัติ (ก่อนส่งต่อลำดับ 2) */
  review1_approved_at: string | null;
  /** เวลาที่กดส่งตรวจ — ใช้แสดง "รอมานานเท่าไร" (ล้างตอนยกเลิก/ตีกลับ/เปิดงานใหม่) */
  review_submitted_at: string | null;
  /** แท็ก influencer ที่ใช้ทำคอนเทนต์ — เลือกได้ทุกเคสที่ยังเดินงานอยู่ (ไม่เอา archived/ปฏิเสธ) */
  influencer_id: string | null;
  /** แท็กหมอเจ้าของเคสในคอนเทนต์ชิ้นนี้ (ทะเบียนเดียวกับระบบ Influ) — migration 0100 */
  doctor_id: string | null;
  /** เวลาที่ยืนยันแท็กครบแล้ว — null = ยังไม่เคยยืนยัน ระบบจะบังคับให้เลือกตอนกดส่งตรวจ
      (ตอบว่า "ไม่มีหมอ/ไม่มี influ" ก็นับว่ายืนยันแล้ว จึงเก็บแยกจาก doctor_id/influencer_id) */
  tags_set_at: string | null;
  /** เวลาที่ผ่านการตรวจ (review_status เปลี่ยนเป็น approved) — ใช้เรียง/กรองแท็บ "งานเสร็จ" */
  approved_at: string | null;
  /** เวลาที่ทำเครื่องหมายว่า "โพส/ใช้งานแล้ว" (null = ยังไม่โพส) — ใช้ในแท็บ "งานเสร็จ" */
  posted_at: string | null;
  /** ผู้กดปุ่ม "โพสแล้ว" (null = ยังไม่โพส หรืองานเก่าก่อนมีคอลัมน์นี้) — ล้างพร้อม posted_at ตอนกดยกเลิก */
  posted_by: string | null;
  /** ประเภทชิ้นงานคอนเทนต์ (ภาพ|วิดีโอ) — ใช้นับ KPI ทีมคอนเทนต์; null = ยังไม่ระบุ/ไม่ใช่งานคอนเทนต์
      (คนละช่องกับ brief_content_type ซึ่งเป็นชนิดงานที่สั่งบนการ์ด brief) — migration 0085 */
  content_format: ContentFormat | null;
  /** หมวดเนื้อหา (ขาย/Value/หมอ/สวย ... จากตาราง content_categories) — ใช้นับ KPI; FK SET NULL */
  content_category_id: string | null;
  /** ถังขยะ — เวลาที่ถูกลบ (null = ยังอยู่); เก็บกู้คืนได้ 14 วันแล้วถูกลบถาวร */
  deleted_at: string | null;
  /** Brief workflow — ชนิดงานที่สั่ง (graphic|video); ตั้งบนการ์ด brief และสำเนาไปการ์ด creative */
  brief_content_type: string | null;
  /** เวลาที่ผู้รับกด "รับงาน" บนการ์ด brief (null = ยังไม่รับ) */
  brief_accepted_at: string | null;
  /** บนการ์ด creative — ชี้กลับไปการ์ด brief ต้นทางที่สร้างมัน */
  brief_source_id: string | null;
  /** ผู้ตีกลับล่าสุด — งานที่แก้แล้วกด "ส่งตรวจแก้" จะวิ่งกลับมาที่คนนี้ตรงๆ (ข้ามผู้สั่ง brief);
      ล้างตอนอนุมัติ/ยกเลิกส่งตรวจ/เปิดงานใหม่ — migration 0098 */
  rejected_by: string | null;
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

/** ฟอร์แมตชิ้นงานคอนเทนต์ (migration 0085) — ภาพนิ่ง | วิดีโอ; label อยู่ CONTENT_FORMATS ใน constants.ts */
export type ContentFormat = "image" | "video";

/** หมวดเนื้อหาคอนเทนต์ (ขาย/Value/หมอ/สวย ...) — จัดการได้จากหน้า KPI คอนเทนต์ (migration 0085) */
export type ContentCategoryRow = {
  id: string;
  name: string;
  position: number;
  /** false = ซ่อนจากตัวเลือกบนการ์ดงาน (หมวดเก่าที่เลิกใช้ — งานที่ติดไว้ยังแสดงชื่อได้) */
  active: boolean;
  created_at: string;
};

/** คาบของเป้า KPI คอนเทนต์ (migration 0087) — 'month' = ชิ้น/เดือน (ค่าเดิม), 'day' = ชิ้น/วัน
    (แดชบอร์ดแปลงกติกา day เป็นเป้าทั้งเดือน = target × จำนวนวันของเดือนที่ดู) */
export type ContentKpiPeriod = "month" | "day";

/** ฐานการนับของกติกา KPI (migration 0095 + 'brief_work' ที่ 0101) —
    "ผลงาน 1 ชิ้น" ของแต่ละคนไม่เหมือนกัน:
    'work'       = การ์ดชิ้นงานที่ตัวเองรับผิดชอบ นับตอนกดส่งตรวจ (พฤติกรรมเดิม / ค่า default)
    'brief_work' = เฉพาะการ์ดที่ "รับมาจากใบ Brief ของคนอื่น" นับตอนกดส่งตรวจ (subset ของ 'work')
    'brief'      = การ์ด Brief ที่ตัวเองสั่ง นับตอนถูกรับงาน **และ** การ์ดลูกถูกส่งตรวจถึงผู้ตรวจจริงแล้ว
    'posted'     = งานที่ตัวเองต้องเป็นคนโพส นับตอนกด "โพสแล้ว"
    เจ้าของแต่ละฐานอยู่ที่ `postOwnerIdOf`/`CONTENT_KPI_BASES` ใน constants.ts */
export type ContentKpiBasis = "work" | "brief_work" | "brief" | "posted";

/** กติกา KPI รายคนของทีมคอนเทนต์ — เป้าจำนวนชิ้นต่อคาบ (ไม่มีคอลัมน์เดือน = กติกายืน
    แดชบอร์ดคำนวณผลของเดือนที่เลือกจาก "วันส่งงาน" ของ tasks เอง)
    format null = ทุกฟอร์แมต, category_id null = ทุกหมวด — งานชิ้นเดียวนับได้หลายกติกาที่ตรงเงื่อนไข */
export type ContentKpiRow = {
  id: string;
  profile_id: string;
  format: ContentFormat | null;
  category_id: string | null;
  target: number;
  /** คาบของเป้า (migration 0087) — DB default 'month' */
  period: ContentKpiPeriod;
  /** ฐานการนับ (migration 0095 + 0101) — DB default 'work' (งานที่ทำเอง) */
  basis: ContentKpiBasis;
  position: number;
  created_at: string;
  created_by: string | null;
};

/** ตั้งค่ากลางของระบบ (key/value) เช่น default_reviewer_id */
export type AppSettingRow = {
  key: string;
  value: string | null;
  updated_at: string;
};

/** ประเภทการตีกลับ (migration 0063) — mistake = ข้อผิดพลาด นับเป็น KPI,
    addition = ผู้ตรวจขอให้ปรับเพิ่มเพื่อคุมคุณภาพ บันทึกไว้แต่ไม่นับเป็นข้อผิดพลาด */
export type RevisionKind = "mistake" | "addition" | "brief";

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

/** ระดับความสำคัญของแจ้งเตือน — primary = ต้องลงมือทำ (ป้ายเรืองแสง + เด้งเข้าเครื่อง)
    secondary = แค่เกี่ยวข้อง (ขึ้นในกระดิ่งแบบเงียบ ไม่เด้ง) — migration 0098 */
export type NotificationPriority = "primary" | "secondary";

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
  /** ประเภทการตีกลับ (มีค่าเฉพาะ type = 'rejected') — ใช้แยกป้าย "แก้คำผิด"/"แก้เพิ่มเติม" */
  revision_kind: RevisionKind | null;
  /** ความสำคัญ — ตัวคุมว่าป้ายเรืองแสงและเด้งเข้าเครื่องไหม (ดู NotificationPriority) */
  priority: NotificationPriority;
  /** เวลาที่ "เห็นแล้ว" (เปิดแผงกระดิ่ง) — null = ยังนับอยู่ในตัวเลขบนกระดิ่ง */
  seen_at: string | null;
  /** เวลาอ่าน — null = ยังไม่อ่าน (แถวขึ้นเส้นขอบเด่นแบบกล่องอีเมล) */
  read_at: string | null;
  created_at: string;
};

/** อุปกรณ์ที่กดอนุญาตแจ้งเตือน (Web Push) — 1 แถว = 1 เบราว์เซอร์/เครื่อง */
export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  /** endpoint ของ push service — unique, ถือเป็นความลับของเครื่องนั้น */
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_success_at: string | null;
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
  /** มูลค่าเคสรวม = วงเงิน voucher + ค่าตัว (0106) — **ไม่รวมราคาสินค้าที่เลือกแล้ว**
      คำนวณให้เองตอนบันทึก ผ่าน caseValueOf() ห้ามกรอกมือ */
  case_value: number | null;
  /** จำนวน voucher ที่เปิดวงเงินให้เคสนี้ (0106) — 0 = ยังไม่เปิดวงเงิน */
  voucher_count: number;
  /** ราคาต่อ voucher 1 ใบ ณ ตอนเปิดวงเงิน (บาท) — snapshot ต่อเคส ไม่ใช่ค่าคงที่ที่อ่านสด
      (ค่าคงที่ INFLU_VOUCHER_UNIT ใช้เฉพาะตอน "เปิดวงเงินใหม่") */
  voucher_unit: number;
  /** true = เคส "รอปรึกษา" — เปิดเคส/ทำ Memo ได้โดยยังไม่ระบุหัตถการ (ปกติบังคับต้องมี) */
  consult_only: boolean;
  /** ค่าตัวที่ต้องจ่ายให้ influencer (บาท) — null = เคสแลกหัตถการไม่มีค่าตัว */
  talent_fee: number | null;
  service_date: string | null;
  doctor_name: string | null;
  /** ช่องทางที่ใช้คุยงานเคสนี้ เช่น ชื่อกลุ่มไลน์ (0089) — ต่อรอบ คนละก้อนกับ
      influ_profile_channels ที่เป็นช่องทางระดับตัวบุคคล */
  contact_channel: string | null;
  photo_path: string | null;
  channel_photo_path: string | null;
  memo_file_path: string | null;
  memo_file_name: string | null;
  memo_uploaded_at: string | null;
  /** เวลาที่ถือว่าข้อมูลพร้อมทำ Memo (null = ยังไม่พร้อม) — เคสที่สร้างจาก "สร้างนัดใหม่" ตั้งให้ทันที */
  memo_ready_at: string | null;
  /** เวลาที่ยืนยัน "ส่งเรื่อง Memo" ในขั้น 1.0 (null = ยังไม่ส่ง) — จบขั้น 1.0 เข้าสู่ 1.1 (0104) */
  docs_sent_at: string | null;
  /** เวลาที่ผู้ออก Memo ยืนยันว่า "ทำ Memo ส่งแล้ว" (ขั้น 1.1 → 1.2, 0104) — null = ยังไม่ยืนยัน;
      ขั้น 1.2 จบเมื่ออัพไฟล์ Memo ที่อนุมัติแล้ว (memo_file_path) ซึ่งเลื่อนเข้า stage 2 ให้เอง */
  memo_submitted_at: string | null;
  /** ไฟล์สัญญาที่เซนแล้ว (อัพโหลดในขั้น "เซนสัญญา + วันรับบริการ") */
  contract_file_path: string | null;
  contract_file_name: string | null;
  contract_uploaded_at: string | null;
  maker_name: string | null;
  stage: number;
  completed: boolean;
  contract_start: string | null;
  contract_months: number;
  /** เป้าจำนวนโพสต่อช่องทางตามสัญญา (0084) — null = ยังไม่ตั้งเป้า;
      ยอดที่ลงจริงไม่เก็บซ้ำ นับจาก influ_post_links (kind='post') แยกช่องทางจาก hostname */
  post_quotas: InfluPostQuotas | null;
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
  /** รหัส Influ ID — ระบบออกให้อัตโนมัติเป็น INF-00001 ผ่าน RPC `next_influ_code()` (0093)
      DB บังคับไม่ให้ซ้ำ (unique index บน lower(influ_code)); null = เคสเก่าที่ยังไม่ได้ออกรหัส */
  influ_code: string | null;
  /** แคมเปญของเคสนี้ (0093) — null = ไม่ได้อยู่ในแคมเปญไหน (แฮชแท็กแคมเปญจะไม่ถูกบังคับ) */
  campaign_id: string | null;
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

/** บทบาทผู้รับผิดชอบในเคส (0095 → รื้อเป็นบทบาท 0104)
    owner = ผู้ดูแล (สร้างเคส ตามจนเซนสัญญา) · follower = ผู้ติดตาม (สัญญา → follow up)
    memo = ผู้ออก Memo (ทำขั้น 1.1, 1.2)
    — ค่าเก่าก่อน 0104 (`contract`/`followup`) ถูกแปลงเป็น owner/follower ทั้งฐาน
    ที่ migration 0106 แล้ว (รวม payload ในถังขยะ) และ check ของ DB บีบเหลือ 3 ค่านี้ —
    แต่โค้ดยังอ่านผ่าน normalizeRoles() (influ-constants) เสมอเพื่อกันข้อมูลที่มาจาก SQL มือ
    — array ว่าง = ผู้เกี่ยวข้อง/หัวหน้างาน (เห็นความเคลื่อนไหวแต่ไม่ใช่เจ้าของงาน) */
export type InfluScope = "owner" | "follower" | "memo";

/** ผู้รับผิดชอบเคส (0095) — 1 เคสมีได้หลายคน แต่ละคนถือขอบเขตของตัวเอง
    คนละเรื่องกับ `influencers.owner_id` ที่ยังเป็น "ผู้สร้างการ์ด" ตามเดิม */
export type InfluAssigneeRow = {
  id: string;
  influencer_id: string;
  user_id: string;
  scopes: InfluScope[];
  created_by: string | null;
  created_at: string;
};

/** ระดับความสำคัญของการแจ้งเตือน (0095)
    action = งานในขอบเขตของผู้รับ ต้องลงมือ (นับใน badge สีแดง)
    update = ความเคลื่อนไหวที่เกี่ยวข้อง เช่นหัวหน้างานที่ไม่ได้ถือขั้นนั้น (ไม่นับใน badge) */
export type InfluNotiLevel = "action" | "update";

/** แจ้งเตือนของระบบ Influencer (0095) — แยกตารางจาก `notifications` ของระบบ Task
    เพราะคนละแอป คนละกระดิ่ง และปลายทางที่นี่เป็น href อิสระ ไม่ผูก task_id */
export type InfluNotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  /** ชื่อ ณ ตอนที่ทำ — บัญชีถูกลบแล้วยังบอกได้ว่าใครทำ */
  actor_name: string | null;
  /** null = เคสถูกลบไปแล้ว (FK set null) — แจ้งเตือนยังอยู่แต่กดไปต่อไม่ได้ */
  influencer_id: string | null;
  influencer_name: string | null;
  /** text อิสระ — ป้าย/ไอคอนอยู่ที่ INFLU_NOTI_TYPES (influ-notify.ts) มี fallback ให้ค่าที่ไม่รู้จัก */
  type: string;
  level: InfluNotiLevel;
  title: string;
  body: string | null;
  href: string | null;
  meta: Json;
  /** เห็นแล้ว (เปิดแผงกระดิ่ง) — badge ดับที่นี่ (0109) */
  seen_at: string | null;
  /** อ่านแล้ว (กดเข้าไปดู) — คนละเรื่องกับ seen_at */
  read_at: string | null;
  created_at: string;
};

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

/** Product team ของหัตถการ (migration 0080 · ขยายเป็น 9 ทีมที่ 0103) — บริษัทแบ่งทีมสินค้า
    aesthetics = สกินทั้งหมด / breast = เสริมหน้าอก / abdomen = ตัดหนังหน้าท้อง /
    lipo = ดูดไขมัน-เติมไขมัน / noseopen = เสริมจมูก Open / noseclosed = เสริมจมูก Closed /
    chin = เสริมคาง / eyes = ตาสองชั้น-Subbrow / facelift = ดึงหน้า Endotine
    ค่าคีย์ = แฮชแท็กของทีม จึงต้องเป็นตัวพิมพ์เล็กล้วนเสมอ
    เพิ่มทีมใหม่ต้องแก้ 3 ที่: type นี้, INFLU_PRODUCT_TEAMS (influ-constants)
    และ check constraint ใน migration ใหม่ (influ_services.team + influ_procedure_items.product_team
    + doctors.teams) */
export type InfluProductTeam =
  | "aesthetics"
  | "breast"
  | "abdomen"
  | "lipo"
  | "noseopen"
  | "noseclosed"
  | "chin"
  | "eyes"
  | "facelift";

/** โปรไฟล์ "ตัวบุคคล" ของ influencer (migration 0080) — 1 แถว = 1 คน
    มีโปรไฟล์ = ตกลงร่วมงานกันแล้ว แต่ยังไม่ confirm หัตถการ/วันนัด
    เคสทุกรอบของคนเดียวกันชี้มาที่นี่ผ่าน influencers.person_id (FK) */
export type InfluProfileRow = {
  id: string;
  /** รหัสประจำตัว INF-xxxxx (0107) — ต้นทางของ influencers.influ_code ทุกรอบของคนนี้
      ระบบออกให้ตอน insert (trigger influ_profiles_set_code) ห้ามพิมพ์เอง */
  influ_code: string;
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

/** รูปภาพของโปรไฟล์ — หลายรูปต่อคน (migration 0082)
    รูปแรกตาม position = รูปหน้าปก ฝั่งแอป sync ลง influ_profiles.photo_path เสมอ
    ไฟล์จากฟีเจอร์นี้อยู่ documents/influ-profiles/{profile_id}/ — แถว backfill
    ยังชี้โฟลเดอร์เคสเดิม ห้ามลบไฟล์ตอนลบแถว (แอปเช็ค prefix ก่อน remove) */
export type InfluProfilePhotoRow = {
  id: string;
  profile_id: string;
  file_path: string;
  file_name: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
};

/** kind ของ influ_case_photos — "photo" = รูป influencer, "channel" = รูปช่องทาง/สกรีนช็อตยอดผู้ติดตาม */
export type InfluCasePhotoKind = "photo" | "channel";

/** รูปภาพของ "เคส" (migration 0105) — หลายรูปต่อเคส แยกชนิด photo/channel
    รูปแรกตาม position (ต่อชนิด) = รูปหน้าปก ฝั่งแอป sync ลง influencers.photo_path /
    channel_photo_path เสมอ — ไฟล์อยู่ documents/influencers/{influencer_id}/ */
export type InfluCasePhotoRow = {
  id: string;
  influencer_id: string;
  kind: InfluCasePhotoKind;
  file_path: string;
  file_name: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
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

/** สถานะบน pipeline ของบอร์ด Hunting (influ_prospects.status — migration 0081)
    new → contacted → negotiating → accepted | declined
    ป้าย/สี/ลำดับอยู่ INFLU_PROSPECT_STATUSES (influ-constants) */
export type InfluProspectStatus =
  | "new"
  | "contacted"
  | "negotiating"
  | "accepted"
  | "declined";

/** ช่องทางโซเชียลที่จดไว้ตอนล่า — เก็บเป็น jsonb ใน influ_prospects.channels
    (โครงเดียวกับแถว influ_profile_channels — ถูกแปลงเป็นแถวจริงตอนตอบรับ) */
export type InfluProspectChannel = {
  platform: string;
  value: string;
  followers: number | null;
};

/** คนที่กำลังตามล่า/ติดต่อ ยังไม่ตอบรับ — บอร์ด Hunting (migration 0081)
    ตอบรับเมื่อไหร่ = สร้าง influ_profiles + ตั้ง profile_id/accepted_at แล้วไปเดินเคสต่อ */
export type InfluProspectRow = {
  id: string;
  /** ชื่อเดียว (ตอนล่ามักรู้แค่ชื่อช่อง) — แตกชื่อ/นามสกุลทีหลังตอนเป็นโปรไฟล์ */
  name: string;
  nickname: string | null;
  phone: string | null;
  occupation: string | null;
  followers: number | null;
  photo_path: string | null;
  channels: InfluProspectChannel[];
  /** เจอมาจากไหน (ค้น TikTok / มีคนแนะนำ / ทักมาเอง ...) */
  source: string | null;
  /** ความน่าสนใจ 0-5 ดาว (0 = ยังไม่ให้คะแนน) */
  rating: number;
  /** หัตถการที่น่าจะเสนอ/สนใจ — ข้อความอิสระ ยังไม่ confirm */
  interested_services: string | null;
  note: string | null;
  status: InfluProspectStatus;
  /** นัดตามครั้งถัดไป — เลยวันแล้วขึ้นเตือนบนบอร์ด */
  next_followup_on: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  /** โปรไฟล์ที่สร้างตอนตอบรับ (FK SET NULL) */
  profile_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** log การติดต่อรายครั้งของ prospect (วันที่/ช่องทาง/ผลลัพธ์) */
export type InfluProspectContactRow = {
  id: string;
  prospect_id: string;
  contacted_on: string;
  channel: string | null;
  note: string | null;
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
  /** ลิงก์ไป promo_packages (เลือกโปรที่ขึ้นหน้า /price-list จาก dropdown — 0090)
      ล็อกราคาเหมือน price_item_id: ราคาเปลี่ยน = ลบแล้วเลือกใหม่ */
  promo_package_id: string | null;
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

/** ช่องทางโซเชียลของโพส — แยกจาก hostname ของลิงก์ผ่าน postPlatformOf() (influ-constants)
    ชุดเดียวกับคีย์ใน influencers.post_quotas (migration 0084) */
export type InfluPostPlatform =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "youtube"
  | "lemon8"
  | "x"
  | "line"
  | "other";

/** เป้าจำนวนโพสต่อช่องทางตามสัญญา (influencers.post_quotas — migration 0084)
    เช่น {"tiktok": 6, "instagram": 6} — null/ไม่มีคีย์ = ช่องทางนั้นไม่ได้ตั้งเป้า */
export type InfluPostQuotas = Partial<Record<InfluPostPlatform, number>>;

/** ลิงก์โพส/คอมเมนต์ที่ influencer ลงจริง (ขั้นตามงาน — migration 0066)
    แปะได้หลายลิงก์ต่อคน: โพสหลัก/โพสเสริม และคอมเมนต์รีวิว + โน้ตกำกับ */
export type InfluPostLinkRow = {
  id: string;
  influencer_id: string;
  kind: InfluPostKind;
  url: string;
  /** ช่องทางที่ทีมเลือกเองตอนแปะลิงก์ (migration 0092 — ฟอร์มบังคับให้เลือกจากเป้าที่ตั้งไว้)
      null = แถวเก่าก่อนมีคอลัมน์นี้ → อ่านผ่าน postLinkPlatform() ซึ่งเดาจาก hostname ให้ */
  platform: InfluPostPlatform | null;
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
  /** ชื่อที่แสดง — ประกอบจาก title/first_name/last_name/nickname ตอนบันทึก (doctorDisplayName())
      และเป็น "กุญแจ" ที่จับคู่กับ influencers.doctor_name / influ_calendar_events.doctor_name */
  name: string;
  /** เลขใบประกอบวิชาชีพเวชกรรม (0093) — ห้ามซ้ำ, เป็นที่มาของแฮชแท็ก #DR<เลข> */
  license_no: string | null;
  /** คำนำหน้า เช่น นพ. / พญ. */
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  /** รูปโปรไฟล์ใน bucket documents path doctors/{id}/... — null = แสดงไอคอนแทน */
  photo_path: string | null;
  /** ทีม product ที่หมอท่านนี้ทำ (0103) — 1 คนอยู่ได้หลายทีม, DB บังคับอย่างน้อย 1 ทีม
      ระบบทีมคอนเทนต์ (mention/แท็ก) แสดงเฉพาะหมอที่มี "aesthetics" อยู่ในชุดนี้ */
  teams: InfluProductTeam[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** แคมเปญการตลาดระดับระบบ (0093) — 1 แคมเปญ = 1 แท็กที่ influ ต้องติดในโพส
    ⚠️ คนละก้อนกับ `InfluCampaignRow` (Sub Campaign รายเคสในหน้าสัญญา) */
export type InfluCampaignDefRow = {
  id: string;
  name: string;
  /** แท็กที่บังคับให้ติดในโพส — เก็บโดยไม่มี # นำหน้า และห้ามมี "-"/ช่องว่าง
      (IG/FB ตัดคำที่ขีดกลาง แท็กที่มีขีดจะ track ไม่ได้) */
  tag: string;
  detail: string | null;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** influ ที่อยู่ในแคมเปญ — ผูกกับ "ตัวบุคคล" (influ_profiles) ไม่ใช่เคส
    เพราะคนหนึ่งอยู่ในแคมเปญแล้วอาจเปิดเคสหลายรอบภายใต้แคมเปญเดียวกัน */
export type InfluCampaignMemberRow = {
  id: string;
  campaign_id: string;
  profile_id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
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

/* ============================================================
   Wellness System (migration 0091) — การ์ดลูกค้า + ไฟล์ผล lab + คิวปรึกษาแพทย์
   ============================================================ */

/** การ์ดลูกค้า Wellness — BC สร้างหลังลูกค้าศัลยกรรมตรวจเลือด
    สถานะเคสเป็นค่า "คำนวณ" จาก 3 ช่องเวลา (ดู wellnessStatusOf ใน wellness-constants):
    รอผล lab → lab ยืนยันแล้ว (รอนัด) → ลงคิวแล้ว → ปิดเคส */
export type WellnessCustomerRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  /** หัตถการศัลยกรรมที่ทำ (ที่มาของการตรวจเลือด) */
  procedure_text: string;
  note: string;
  /** Lab กดยืนยันผลครบ = ส่งต่อ Admin โทรนัด (null = ยังรอผล) */
  lab_confirmed_at: string | null;
  lab_confirmed_by: string | null;
  /** ปิดเคส — ฟังผล + ปรึกษาแพทย์เสร็จแล้ว */
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** ไฟล์ผลตรวจเลือด (PDF) ของการ์ดลูกค้า — ไฟล์จริงอยู่ bucket documents
    path `wellness/{customer_id}/` (ลบแถวต้องลบไฟล์ storage เอง best effort) */
export type WellnessLabFileRow = {
  id: string;
  customer_id: string;
  file_path: string;
  /** ชื่อไฟล์เดิมตอนอัพ — path จริงมี timestamp นำหน้ากันชนกัน */
  file_name: string;
  uploaded_by: string | null;
  created_at: string;
};

export type WellnessApptStatus = "scheduled" | "done" | "cancelled";

/** คิวปรึกษาแพทย์ Wellness — Admin กรอกเวลาเอง เลือก 1/2/3 ชั่วโมง
    DB มี exclusion constraint กันคิว scheduled เวลาทับกัน (ชน = error 23P01) */
export type WellnessAppointmentRow = {
  id: string;
  customer_id: string;
  /** วันที่คิว (YYYY-MM-DD) */
  appt_date: string;
  /** เวลาเริ่ม (HH:MM:SS) */
  start_time: string;
  duration_hours: number;
  status: WellnessApptStatus;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
      content_categories: {
        Row: ContentCategoryRow;
        Insert: Partial<ContentCategoryRow> & { name: string };
        Update: Partial<ContentCategoryRow>;
        Relationships: [];
      };
      content_kpis: {
        Row: ContentKpiRow;
        Insert: Partial<ContentKpiRow> & { profile_id: string; target: number };
        Update: Partial<ContentKpiRow>;
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
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Partial<PushSubscriptionRow> & {
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
        };
        Update: Partial<PushSubscriptionRow>;
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
      influ_profile_photos: {
        Row: InfluProfilePhotoRow;
        Insert: Partial<InfluProfilePhotoRow> & {
          profile_id: string;
          file_path: string;
        };
        Update: Partial<InfluProfilePhotoRow>;
        Relationships: [];
      };
      influ_case_photos: {
        Row: InfluCasePhotoRow;
        Insert: Partial<InfluCasePhotoRow> & {
          influencer_id: string;
          kind: InfluCasePhotoKind;
          file_path: string;
        };
        Update: Partial<InfluCasePhotoRow>;
        Relationships: [];
      };
      influ_prospects: {
        Row: InfluProspectRow;
        Insert: Partial<InfluProspectRow> & { name: string };
        Update: Partial<InfluProspectRow>;
        Relationships: [];
      };
      influ_prospect_contacts: {
        Row: InfluProspectContactRow;
        Insert: Partial<InfluProspectContactRow> & { prospect_id: string };
        Update: Partial<InfluProspectContactRow>;
        Relationships: [];
      };
      doctors: {
        Row: DoctorRow;
        Insert: Partial<DoctorRow> & { name: string };
        Update: Partial<DoctorRow>;
        Relationships: [];
      };
      influ_campaign_defs: {
        Row: InfluCampaignDefRow;
        Insert: Partial<InfluCampaignDefRow> & { name: string; tag: string };
        Update: Partial<InfluCampaignDefRow>;
        Relationships: [];
      };
      influ_campaign_members: {
        Row: InfluCampaignMemberRow;
        Insert: Partial<InfluCampaignMemberRow> & {
          campaign_id: string;
          profile_id: string;
        };
        Update: Partial<InfluCampaignMemberRow>;
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
      influ_assignees: {
        Row: InfluAssigneeRow;
        Insert: Partial<InfluAssigneeRow> & {
          influencer_id: string;
          user_id: string;
        };
        Update: Partial<InfluAssigneeRow>;
        Relationships: [];
      };
      influ_notifications: {
        Row: InfluNotificationRow;
        Insert: Partial<InfluNotificationRow> & {
          recipient_id: string;
          type: string;
          title: string;
        };
        Update: Partial<InfluNotificationRow>;
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
      wellness_customers: {
        Row: WellnessCustomerRow;
        Insert: Partial<WellnessCustomerRow> & { first_name: string };
        Update: Partial<WellnessCustomerRow>;
        Relationships: [];
      };
      wellness_lab_files: {
        Row: WellnessLabFileRow;
        Insert: Partial<WellnessLabFileRow> & {
          customer_id: string;
          file_path: string;
          file_name: string;
        };
        Update: Partial<WellnessLabFileRow>;
        Relationships: [];
      };
      wellness_appointments: {
        Row: WellnessAppointmentRow;
        Insert: Partial<WellnessAppointmentRow> & {
          customer_id: string;
          appt_date: string;
          start_time: string;
          duration_hours: number;
        };
        Update: Partial<WellnessAppointmentRow>;
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
      /** ลงทะเบียนอุปกรณ์รับ Web Push ของคนที่ล็อกอินอยู่ (ย้ายเจ้าของ endpoint ให้เองเมื่อ
          เครื่องเดิมสลับคนใช้ — ดู migration 0097) */
      register_push_subscription: {
        Args: {
          p_endpoint: string;
          p_p256dh: string;
          p_auth: string;
          p_user_agent?: string | null;
        };
        Returns: undefined;
      };
      /** สร้างเคส Influ ใหม่ทั้งก้อนใน transaction เดียว (0108) — เคส + หัตถการ +
          ผู้รับผิดชอบ; เลขรอบคำนวณใน DB (ล็อกแถวโปรไฟล์) และรหัส Influ ID มาจาก trigger
          payload: { person_id, stage?, campaign_id?, consult_only?, talent_fee?, case_value?,
          service_date?, doctor_name?, contact_channel?, procedure_text?,
          procedures: [{name, price, price_item_id, promo_package_id, product_team}],
          assignees: [{user_id, scopes}] } */
      influ_create_case: {
        Args: { p: Json };
        Returns: string;
      };
      /** รวมโปรไฟล์ซ้ำเป็นคนเดียวกัน (0111) — ย้ายเคส/ช่องทาง/รูป/แคมเปญจาก p_from
          ไป p_into แล้วลบ p_from; รหัสที่รอด = เลขเก่ากว่า (กติกาผู้ใช้ 2026-09-03)
          คืน id ของโปรไฟล์ที่รอด */
      influ_merge_profiles: {
        Args: { p_from: string; p_into: string };
        Returns: string;
      };
      /** ลบโปรไฟล์ที่ยังไม่มีเคส (0111) — มีเคสอยู่ = raise ข้อความไทย */
      influ_delete_profile: {
        Args: { p_id: string };
        Returns: undefined;
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
      /** ออกรหัส Influ ID ถัดไป (INF-00001) — ไม่ซ้ำทั้งระบบ (0093) */
      next_influ_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      /** ออกแท็กแคมเปญถัดไป (CMP00001) เมื่อทีมไม่อยากตั้งเอง (0093) */
      next_campaign_tag: {
        Args: Record<string, never>;
        Returns: string;
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

/** หมอแบบย่อ (ใช้เป็นแท็กบน task + ตัวเลือกในหน้าจัดการแท็ก) */
export type DoctorLite = Pick<
  DoctorRow,
  "id" | "name" | "nickname" | "license_no" | "photo_path"
>;

/** ตัวเลือกแท็ก influencer ของทีมคอนเทนต์ — เคสที่ยังเดินงานอยู่ พร้อมของที่ใช้ทำแฮชแท็ก */
export type InfluTagOption = InfluencerLite & {
  influ_code: string | null;
  doctor_name: string | null;
  campaign_id: string | null;
  photo_path: string | null;
  /** ทีมหัตถการที่เคสนี้มี (จาก influ_procedure_items) — ตัวกรอง "หัตถการ" ของหน้าแท็ก */
  teams: InfluProductTeam[];
  /** รหัสโปรโมชันของหัตถการที่ผูกโปรไว้ — ส่วนหนึ่งของชุดแฮชแท็ก */
  promo_skus: string[];
  /** เลขใบ ปว. ของหมอที่รับเคส (จับคู่จากทะเบียนด้วยชื่อ) — null = หมอท่านนั้นยังไม่มีเลข */
  doctor_license: string | null;
  /** แท็ก/ชื่อแคมเปญที่เคสสังกัด — resolve มาให้แล้วเพื่อให้ caseHashtags() เรียกได้จากก้อนเดียว */
  campaign_tag: string | null;
  campaign_name: string | null;
};

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
  /** หมอที่แท็กไว้ (join จาก doctor_id) */
  doctor?: DoctorLite | null;
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
