export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type SalesSource = "manual" | "import";

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

/** สิทธิ์การมองเห็นที่ admin เปิดให้รายคนได้ */
export type AppPermission = "data" | "team" | "influ" | "pricing";

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
  /** สถานะการตรวจ: none = ยังไม่ส่ง, pending = รอตรวจ, approved = ผ่าน (completed=true) */
  review_status: "none" | "pending" | "approved";
  /** ผู้ตรวจลำดับ 2 (อนุมัติขั้นสุดท้าย) — snapshot จาก app_settings ตอนส่งตรวจ; null = ตรวจชั้นเดียว */
  reviewer2_id: string | null;
  /** ทอดที่กำลังรอตรวจ (1|2) — มีผลเฉพาะตอน review_status='pending' */
  review_step: number;
  /** เวลาที่ผู้ตรวจลำดับ 1 อนุมัติ (ก่อนส่งต่อลำดับ 2) */
  review1_approved_at: string | null;
  /** ผูกกับ influencer ที่ใช้ทำคอนเทนต์ (เลือกได้ ไม่บังคับ) */
  influencer_id: string | null;
  /** เวลาที่ผ่านการตรวจ (review_status เปลี่ยนเป็น approved) — ใช้เรียง/กรองแท็บ "งานเสร็จ" */
  approved_at: string | null;
  /** เวลาที่ทำเครื่องหมายว่า "โพส/ใช้งานแล้ว" (null = ยังไม่โพส) — ใช้ในแท็บ "งานเสร็จ" */
  posted_at: string | null;
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

export type TaskCommentRow = {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  /** true = คอมเมนต์นี้เป็นการส่งงานแก้ไข (นับครั้งเพื่อวัด KPI) */
  is_revision: boolean;
  /** ลำดับการแก้ไขของ task นี้ (1, 2, ...) — มีค่าเมื่อ is_revision */
  revision_number: number | null;
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

/** รายการแก้ไขหัตถการหน้างาน (stage 5) — เก็บใน influencers.procedure_history */
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
  /** ไฟล์สัญญาที่เซนแล้ว (อัพโหลดใน Stage 4) */
  contract_file_path: string | null;
  contract_file_name: string | null;
  contract_uploaded_at: string | null;
  maker_name: string | null;
  stage: number;
  completed: boolean;
  contract_start: string | null;
  contract_months: number;
  note: string | null;
  /** กลุ่มขนาดบนบอร์ด (ลากการ์ดย้ายเอง) — null = จัดอัตโนมัติจาก followers */
  size_group: InfluSizeGroup | null;
  /** ลำดับการ์ดในคอลัมน์บอร์ด — null = fallback จาก created_at ฝั่ง client */
  board_position: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

/** รายการใน Price List กลาง — แสดงบนหน้าสาธารณะ /price-list (anon อ่านได้) */
export type PriceItemRow = {
  id: string;
  item_no: number | null;
  category: string;
  name: string;
  benefits: string | null;
  process: string | null;
  price_normal: string | null;
  promos: PriceOffer[];
  courses: PriceOffer[];
  sort: number;
  active: boolean;
  created_at: string;
  updated_at: string;
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
      price_items: {
        Row: PriceItemRow;
        Insert: Partial<PriceItemRow> & {
          category: string;
          name: string;
        };
        Update: Partial<PriceItemRow>;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** task พร้อมข้อมูลผู้รับผิดชอบ (join จาก profiles) */
/** influencer แบบย่อ (ใช้แสดงบน task) */
export type InfluencerLite = Pick<
  InfluencerRow,
  "id" | "first_name" | "last_name" | "nickname"
>;

export type TaskWithAssignee = TaskRow & {
  assignee: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  reviewer?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  /** ผู้ตรวจลำดับ 2 (join จาก reviewer2_id) — อนุมัติขั้นสุดท้ายเมื่อมีตรวจ 2 ทอด */
  reviewer2?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
  /** ผู้สร้างการ์ด (join จาก created_by) — การ์ด creative ที่มาจาก brief = ผู้สั่ง brief */
  creator?: Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path"> | null;
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
