"use client";

import {
  BadgeCheck,
  ClipboardCheck,
  EyeOff,
  ListTodo,
  Search,
  Send,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DemoBanner } from "@/components/demo-badge";
import {
  Button,
  type ButtonVariant,
  ConfirmDialog,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  CONTENT_FORMAT_ORDER,
  CONTENT_FORMATS,
  DEFAULT_REVISION_KIND,
  DEFAULT_TASK_CATEGORY,
  postOwnerIdOf,
  REVISION_KIND_ORDER,
  REVISION_KINDS,
  STORAGE_BUCKET_DOCUMENTS,
} from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  AnalysisLinkRow,
  ContentCategoryRow,
  ContentFormat,
  InfluencerLite,
  NotificationType,
  ProfileRow,
  RevisionKind,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import { AnalysisList } from "./analysis-list";
import { ApprovedList } from "./approved-list";
import { KanbanBoard, type QuickAddPlacement } from "./board";
import { ExcludeFilter } from "./exclude-filter";
import { MobileBoard } from "./mobile-board";
import {
  MobileApprovedFilterSheet,
  MobileFilterBar,
  MobileWorkFilterSheet,
} from "./mobile-filters";
import { MobileReviewList } from "./mobile-review";
import { MobileTabs } from "./mobile-tabs";
import { PersonSelect } from "./person-select";
import { PostingList } from "./posting-list";
import { ReviewList } from "./review-list";
import {
  AssigneeAvatar,
  currentReviewerIds,
  currentReviewerPersons,
  isTempId,
  profileName,
  reviewWaitStart,
} from "./task-card";
import { TaskPanel, type TaskPatch } from "./task-panel";
import { TRASH_KEEP_DAYS, TrashList } from "./trash-list";

type ProfileOption = Pick<ProfileRow, "id" | "full_name" | "email" | "avatar_path">;
/** โปรไฟล์พร้อมค่าผู้ตรวจอัตโนมัติ (ใช้เฉพาะในหน้านี้) */
type ProfileWithDefault = ProfileOption & {
  default_reviewer_id: string | null;
};

/** วันตามเวลาไทยของ timestamp — ใช้กรองช่วงวันที่แท็บ "ตรวจแล้ว"
    (formatter สร้างครั้งเดียวระดับโมดูล — สร้างต่อ call แพงมากเมื่องานหลักพันแถว) */
const BANGKOK_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
});
function bangkokDay(iso: string): string {
  return BANGKOK_DAY_FORMAT.format(new Date(iso));
}

/** select ของ task พร้อม join (assignee/reviewer/creator/poster/influencer/files) — ใช้ตอน insert แล้วอ่านกลับ */
const TASK_SELECT =
  "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_path), reviewer:profiles!tasks_reviewer_id_fkey(id, full_name, email, avatar_path), reviewer1b:profiles!tasks_reviewer1b_id_fkey(id, full_name, email, avatar_path), reviewer2:profiles!tasks_reviewer2_id_fkey(id, full_name, email, avatar_path), creator:profiles!tasks_created_by_fkey(id, full_name, email, avatar_path), poster:profiles!tasks_posted_by_fkey(id, full_name, email, avatar_path), influencer:influencers!tasks_influencer_id_fkey(id, first_name, last_name, nickname, round_no), files:task_files(id, task_id, file_path, file_name, created_at)";

type ConfirmState = {
  title: string;
  message: string;
  /** ป้าย/โทนปุ่มยืนยัน — ไม่ระบุ = "ลบ" สีแดง (ค่าเดิมของกล่องลบ) */
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
};

/** ค่าตัวกรองที่จำไว้ใน localStorage (ต่อผู้ใช้) — array อาจไม่มีในค่าที่บันทึกไว้เดิม */
type SavedFilters = {
  search?: string;
  assignee?: string;
  status?: string;
  dueFrom?: string;
  dueTo?: string;
  excludeAssignees?: string[];
  excludeStatuses?: string[];
};

export function TasksClient({
  sections: initialSections,
  tasks,
  profiles,
  influencers,
  reviewerIds,
  defaultReviewerId,
  defaultReviewer1bId,
  defaultReviewer2Id,
  categories: initialCategories,
  contentCategories,
  analysisLinks,
  userId,
  isAdmin,
  loadError,
}: {
  sections: TaskSectionRow[];
  tasks: TaskWithAssignee[];
  profiles: ProfileWithDefault[];
  influencers: InfluencerLite[];
  reviewerIds: string[];
  /** ผู้ตรวจเริ่มต้นของทั้งทีม (app_settings) — auto ใส่ให้ตอนสร้างงาน (= ผู้ตรวจลำดับ 1) */
  defaultReviewerId: string | null;
  /** ผู้ตรวจลำดับ 1 คนที่ 2 ของทีม (app_settings) — ผู้ตรวจร่วมทอดแรก ต้องอนุมัติครบทุกคน */
  defaultReviewer1bId: string | null;
  /** ผู้ตรวจลำดับ 2 ของทีม (app_settings) — ถ้าตั้งไว้ งานที่ส่งตรวจจะไหลเป็นทอด 1 → 2 */
  defaultReviewer2Id: string | null;
  /** หมวดหมู่งานที่จัดการได้ (task_categories) */
  categories: string[];
  /** หมวดเนื้อหาคอนเทนต์ (content_categories) — ใช้ติดประเภทชิ้นงานตอนกดโพส + ในแผงงาน */
  contentCategories: ContentCategoryRow[];
  /** ลิงก์ผลวิเคราะห์ (Canva) ของแท็บ "ผลวิเคราะห์" — จัดกลุ่ม/เรียงใน AnalysisList */
  analysisLinks: AnalysisLinkRow[];
  userId: string | null;
  isAdmin: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  /** บอกให้ Next ทิ้ง cache ของหน้านี้ (staleTimes.dynamic = 30 วิ) หลังเขียน DB สำเร็จ
      — Realtime ส่งเฉพาะเหตุการณ์ที่เกิด "หลัง" subscribe จึงซ่อมกรณีนี้ไม่ได้:
      ออกจากหน้าแล้วกลับมาใน 30 วิ (หรือกดปุ่ม Back) จะได้ payload ก่อนแก้ แล้ว state
      ถูก re-seed จาก props เก่า = การ์ดที่เพิ่งลบกลับมา / ตำแหน่งที่เพิ่งลากเด้งกลับ
      รวบเป็นครั้งเดียวด้วย timeout สั้นๆ เพราะการลากหนึ่งครั้งยิง patchTask หลายรอบ */
  const refreshTimer = useRef<number | null>(null);
  const markServerStale = () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 400);
  };
  // ออกจากหน้าก่อนครบ 400ms = ต้อง "flush" ไม่ใช่ทิ้ง — เคสที่ต้องการแก้คือแก้เสร็จแล้ว
  // เดินออกทันทีพอดี ถ้าทิ้ง timer ไปเฉยๆ cache จะยังเป็นของเก่าเหมือนเดิม
  useEffect(
    () => () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
        router.refresh();
      }
    },
    [router]
  );

  /** หมวดหมู่งาน — เพิ่มได้จากแผงรายละเอียด */
  const [categories, setCategories] = useState<string[]>(initialCategories);
  useEffect(() => setCategories(initialCategories), [initialCategories]);

  const addCategory = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed === "" || categories.includes(trimmed)) return;
    setCategories((cur) => [...cur, trimmed]); // optimistic
    const { error: e } = await supabase
      .from("task_categories")
      .insert({ name: trimmed });
    if (e) {
      setCategories((cur) => cur.filter((c) => c !== trimmed));
      showError(`เพิ่มหมวดหมู่ไม่สำเร็จ: ${e.message}`);
      return;
    }
    markServerStale();
  };

  // state ฝั่งจอเป็นแหล่งความจริงระหว่างใช้งาน — ทุกการแก้ไข optimistic ทันที
  const [items, setItems] = useState<TaskWithAssignee[]>(tasks);
  const [sections, setSections] = useState<TaskSectionRow[]>(initialSections);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "work" | "review" | "posting" | "approved" | "analysis" | "trash"
  >("work");
  useEffect(() => setItems(tasks), [tasks]);
  useEffect(() => setSections(initialSections), [initialSections]);

  /** งานที่ยังอยู่ (ไม่อยู่ในถังขยะ) — บอร์ด/แท็บหลักใช้ตัวนี้ทั้งหมด */
  const activeItems = useMemo(
    () => items.filter((t) => !t.deleted_at),
    [items]
  );
  /** งานในถังขยะ — ล่าสุดก่อน (เก็บ 14 วันแล้วถูกลบถาวรตอนเปิดหน้า) */
  const trashedItems = useMemo(
    () =>
      items
        .filter((t) => t.deleted_at != null)
        .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "")),
    [items]
  );

  /* ---------- roster ผู้ตรวจ + ผู้ตรวจอัตโนมัติของฉัน ---------- */

  const [reviewerSet, setReviewerSet] = useState<Set<string>>(
    () => new Set(reviewerIds)
  );
  useEffect(() => setReviewerSet(new Set(reviewerIds)), [reviewerIds]);
  const [reviewerModalOpen, setReviewerModalOpen] = useState(false);
  /** โชว์ช่องเลือก "ผู้ตรวจลำดับ 1 คนที่ 2" ในโมดัล — เปิดค้างเมื่อมีค่าตั้งไว้แล้ว */
  const [show1bPicker, setShow1bPicker] = useState(false);

  /* ---------- ตีกลับงาน (reject) — เปิดกล่องระบุเหตุผลก่อนยืนยัน ---------- */
  const [rejectTarget, setRejectTarget] = useState<TaskWithAssignee | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  /** ประเภทการตีกลับ — "คำผิด" นับเป็นข้อผิดพลาดใน KPI, "เพิ่มเติม" ไม่นับ */
  const [rejectKind, setRejectKind] =
    useState<RevisionKind>(DEFAULT_REVISION_KIND);

  /* ---------- ยืนยันโพส + ติดประเภทชิ้นงาน (KPI คอนเทนต์) ---------- */
  // งานที่ยังไม่เคยระบุ content_format ตอนกด "โพสแล้ว" จะเปิดกล่องนี้ก่อน —
  // บังคับเลือก ภาพ/วิดีโอ (หมวดเนื้อหาไม่บังคับ) แล้วค่อยบันทึกโพสทีเดียว
  const [postTarget, setPostTarget] = useState<TaskWithAssignee | null>(null);
  const [postFormat, setPostFormat] = useState<ContentFormat | null>(null);
  const [postCategoryId, setPostCategoryId] = useState<string>("");

  /** คนที่เลือกเป็นผู้ตรวจงานได้ (ตามลำดับชื่อจาก profiles) */
  const reviewerProfiles = useMemo(
    () => profiles.filter((p) => reviewerSet.has(p.id)),
    [profiles, reviewerSet]
  );

  /** โปรไฟล์ของฉัน — ใช้แสดงรูปในตัวเลือก "งานของฉัน"/"ฉันเป็นผู้ตรวจ" */
  const meProfile = useMemo(
    () => (userId ? (profiles.find((p) => p.id === userId) ?? null) : null),
    [profiles, userId]
  );

  // ผู้ตรวจเริ่มต้นของทั้งทีม (คนเดียวกันทุกคน) — ตั้งค่าโดย admin, เก็บใน app_settings
  const [globalReviewerId, setGlobalReviewerId] = useState<string | null>(
    defaultReviewerId
  );
  useEffect(() => setGlobalReviewerId(defaultReviewerId), [defaultReviewerId]);

  // ผู้ตรวจลำดับ 1 คนที่ 2 ของทีม (ผู้ตรวจร่วม) — งานใหม่ได้ 2 คน ทอดแรกต้องอนุมัติครบทั้งคู่
  // (override เหนือค่า server เฉพาะหลังกดบันทึกในหน้านี้: undefined = ใช้ค่าจาก server)
  const [reviewer1bOverride, setReviewer1bOverride] = useState<
    string | null | undefined
  >(undefined);
  const globalReviewer1bId =
    reviewer1bOverride === undefined ? defaultReviewer1bId : reviewer1bOverride;

  // ผู้ตรวจลำดับ 2 ของทีม — ถ้าตั้งไว้ การส่งตรวจจะเป็นทอด: ลำดับ 1 อนุมัติ → ลำดับ 2 อนุมัติ = เสร็จ
  // (override เหนือค่า server เฉพาะหลังกดบันทึกในหน้านี้: undefined = ใช้ค่าจาก server)
  const [reviewer2Override, setReviewer2Override] = useState<
    string | null | undefined
  >(undefined);
  const globalReviewer2Id =
    reviewer2Override === undefined ? defaultReviewer2Id : reviewer2Override;

  // งานที่รอ "ฉัน" ตรวจในทอดปัจจุบัน — โชว์เลขบนแท็บ (ทอด 2 ที่ผู้ตรวจหาย ตกกลับให้ลำดับ 1 กดปิดงานได้)
  const reviewQueue = useMemo(
    () =>
      userId === null
        ? []
        : activeItems.filter(
            (t) =>
              t.review_status === "pending" &&
              currentReviewerIds(t).includes(userId)
          ),
    [activeItems, userId]
  );

  // งานรอตรวจที่เหลือของทีม (ค้างอยู่ที่ผู้ตรวจคนอื่น) — ให้ทุกคนเห็นว่างานค้างที่ใคร
  // เรียงงานที่รอนานสุดขึ้นก่อน (ไม่รู้เวลาส่งตรวจ = ท้ายลิสต์)
  const teamPendingReview = useMemo(
    () =>
      activeItems
        .filter(
          (t) =>
            t.review_status === "pending" &&
            (userId === null || !currentReviewerIds(t).includes(userId))
        )
        .sort((a, b) => {
          const wa = reviewWaitStart(a);
          const wb = reviewWaitStart(b);
          if (wa === null && wb === null) return 0;
          if (wa === null) return 1;
          if (wb === null) return -1;
          return wa.localeCompare(wb);
        }),
    [activeItems, userId]
  );

  const showError = (msg: string) => {
    setError(msg);
    window.setTimeout(() => setError(null), 6000);
  };

  /** เพิ่มคนเข้า roster ผู้ตรวจ — upsert แบบข้าม conflict: อีก session อาจเพิ่มไปก่อนแล้ว ถือว่าสำเร็จ */
  const addReviewer = async (profileId: string) => {
    setReviewerSet((cur) => new Set(cur).add(profileId));
    const { error: e } = await supabase
      .from("task_reviewers")
      .upsert(
        { profile_id: profileId },
        { onConflict: "profile_id", ignoreDuplicates: true }
      );
    if (e) {
      setReviewerSet((cur) => {
        const n = new Set(cur);
        n.delete(profileId);
        return n;
      });
      showError(`เพิ่มผู้ตรวจไม่สำเร็จ: ${e.message}`);
      return;
    }
    // ไม่ mark stale = refresh จาก mutation อื่น (หรือกลับเข้าหน้าใน 30 วิ) จะ re-seed
    // reviewerSet จาก payload ก่อนเพิ่ม → คนที่เพิ่งเพิ่มหายจากตัวเลือกผู้ตรวจทั้งที่ DB บันทึกแล้ว
    markServerStale();
  };

  /** เอาคนออกจาก roster ผู้ตรวจ (งานเดิมที่คนนี้ตรวจอยู่ไม่ถูกแตะ) */
  const removeReviewer = async (profileId: string) => {
    setReviewerSet((cur) => {
      const n = new Set(cur);
      n.delete(profileId);
      return n;
    });
    const { error: e } = await supabase
      .from("task_reviewers")
      .delete()
      .eq("profile_id", profileId);
    if (e) {
      setReviewerSet((cur) => new Set(cur).add(profileId));
      showError(`เอาผู้ตรวจออกไม่สำเร็จ: ${e.message}`);
      return;
    }
    markServerStale();
  };

  /** ตั้งผู้ตรวจเริ่มต้นของทั้งทีม (admin) — บันทึกลง app_settings, ใช้กับทุกคน */
  const saveDefaultReviewer = async (id: string | null) => {
    const prev = globalReviewerId;
    setGlobalReviewerId(id);
    const { error: e } = await supabase
      .from("app_settings")
      .upsert(
        { key: "default_reviewer_id", value: id, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (e) {
      setGlobalReviewerId(prev);
      showError(`บันทึกผู้ตรวจเริ่มต้นไม่สำเร็จ: ${e.message}`);
      return;
    }
    markServerStale();
    // เลือกคนหลักซ้ำกับผู้ตรวจร่วม — ล้างช่องร่วมให้ ไม่งั้นคนเดียวกันติดสองช่อง
    if (id !== null && id === globalReviewer1bId) {
      void saveDefaultReviewer1b(null);
    }
  };

  /** ตั้งผู้ตรวจลำดับ 1 คนที่ 2 ของทีม (admin) — งานใหม่จะมีผู้ตรวจทอดแรก 2 คน ต้องอนุมัติครบทั้งคู่ */
  const saveDefaultReviewer1b = async (id: string | null) => {
    const prev = globalReviewer1bId;
    setReviewer1bOverride(id);
    const { error: e } = await supabase
      .from("app_settings")
      .upsert(
        { key: "default_reviewer1b_id", value: id, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (e) {
      setReviewer1bOverride(prev);
      showError(`บันทึกผู้ตรวจคนที่ 2 ไม่สำเร็จ: ${e.message}`);
      return;
    }
    markServerStale();
  };

  /** ตั้งผู้ตรวจลำดับ 2 ของทีม (admin) — งานที่ส่งตรวจหลังจากนี้จะไหลเป็นทอด 1 → 2 */
  const saveDefaultReviewer2 = async (id: string | null) => {
    const prev = globalReviewer2Id;
    setReviewer2Override(id);
    const { error: e } = await supabase
      .from("app_settings")
      .upsert(
        { key: "default_reviewer2_id", value: id, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (e) {
      setReviewer2Override(prev);
      showError(`บันทึกผู้ตรวจลำดับ 2 ไม่สำเร็จ: ${e.message}`);
      return;
    }
    markServerStale();
  };

  /* ---------- filters (จำค่าไว้ใน localStorage, เริ่มต้น = งานของฉัน) ---------- */

  // อ่านค่าตัวกรองที่เคยตั้งไว้ (ต่อผู้ใช้) — ครั้งแรกที่ไม่มีค่าใช้ default ใหม่
  // (key เวอร์ชัน 2: บังคับทุกคนเริ่มด้วย "เกี่ยวข้องกับฉัน" + ยกเว้นงานเสร็จสมบูรณ์)
  const filterStorageKey = `tasks-filters-v2:${userId ?? "anon"}`;
  const savedFilters = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(filterStorageKey);
      return raw ? (JSON.parse(raw) as SavedFilters) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useState(savedFilters?.search ?? "");
  /** all | involved (เกี่ยวข้องกับฉัน — default) | me | none | <profileId> */
  const [assigneeFilter, setAssigneeFilter] = useState<string>(
    savedFilters?.assignee ?? (userId ? "involved" : "all")
  );
  /** all | pending | done */
  const [statusFilter, setStatusFilter] = useState<string>(
    savedFilters?.status ?? "all"
  );
  const [dueFrom, setDueFrom] = useState(savedFilters?.dueFrom ?? "");
  const [dueTo, setDueTo] = useState(savedFilters?.dueTo ?? "");
  /** ยกเว้น (ซ่อน) งานของผู้รับผิดชอบที่เลือก — เก็บ profileId หรือ "none" (ไม่ระบุ) */
  const [excludeAssignees, setExcludeAssignees] = useState<string[]>(
    savedFilters?.excludeAssignees ?? []
  );
  /** ยกเว้น (ซ่อน) งานตามสถานะที่เลือก — working | pending | done
      (default = ซ่อนงานเสร็จสมบูรณ์ ให้บอร์ดโชว์เฉพาะงานที่ยังเดินอยู่) */
  const [excludeStatuses, setExcludeStatuses] = useState<string[]>(
    savedFilters?.excludeStatuses ?? ["done"]
  );

  const toggleExcludeAssignee = (id: string) =>
    setExcludeAssignees((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  const toggleExcludeStatus = (key: string) =>
    setExcludeStatuses((cur) =>
      cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]
    );
  const clearExclude = () => {
    setExcludeAssignees([]);
    setExcludeStatuses([]);
  };

  /** true = การล้างตัวกรองรอบนี้เป็นระบบทำเอง (เปิดงานจากแจ้งเตือน) ไม่ใช่ผู้ใช้ตั้งใจ
      — ข้ามการเขียนทับค่าที่จำไว้ 1 ครั้ง ไม่งั้นกดแจ้งเตือนทีเดียวตัวกรองที่ตั้งไว้หายถาวร */
  const skipPersistRef = useRef(false);

  // จำค่าตัวกรองทุกครั้งที่เปลี่ยน
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(
        filterStorageKey,
        JSON.stringify({
          search,
          assignee: assigneeFilter,
          status: statusFilter,
          dueFrom,
          dueTo,
          excludeAssignees,
          excludeStatuses,
        } satisfies SavedFilters)
      );
    } catch {
      // เพิกเฉย — localStorage เต็ม/ปิดอยู่ ไม่กระทบการใช้งาน
    }
  }, [
    search,
    assigneeFilter,
    statusFilter,
    dueFrom,
    dueTo,
    excludeAssignees,
    excludeStatuses,
    filterStorageKey,
  ]);

  const hasFilter =
    search.trim() !== "" ||
    assigneeFilter !== "all" ||
    statusFilter !== "all" ||
    dueFrom !== "" ||
    dueTo !== "" ||
    excludeAssignees.length > 0 ||
    excludeStatuses.length > 0;

  const clearFilters = () => {
    setSearch("");
    setAssigneeFilter("all");
    setStatusFilter("all");
    setDueFrom("");
    setDueTo("");
    clearExclude();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // ตัวกรองสถานะที่เลือกไว้ชนะ "ยกเว้น" เสมอ — ไม่งั้นเลือกสถานะที่ถูกยกเว้นอยู่
    // (default ยกเว้น "done") จะกรองชนกันเองจนบอร์ดว่างทั้งที่มีงานสถานะนั้นอยู่จริง
    const excludeSt =
      statusFilter === "all"
        ? excludeStatuses
        : excludeStatuses.filter((s) => s !== statusFilter);
    // กติกาเดียวกันกับสถานะ: คนที่ "เลือกดูอยู่" ต้องชนะรายการยกเว้น ไม่งั้นยกเว้นคน A ไว้
    // แล้วเลือกดูงานของคน A จะได้บอร์ดว่างเปล่า ("งานของฉัน"/"เกี่ยวข้องกับฉัน" = ตัวเรา)
    const pickedAssignee =
      assigneeFilter === "me" || assigneeFilter === "involved"
        ? userId
        : assigneeFilter === "all"
          ? null
          : assigneeFilter;
    const excludeAs =
      pickedAssignee === null
        ? excludeAssignees
        : excludeAssignees.filter((a) => a !== pickedAssignee);
    return activeItems.filter((t) => {
      // ยกเว้น (ซ่อน) ตามผู้รับผิดชอบที่เลือก — "none" = งานที่ไม่ระบุผู้รับผิดชอบ
      if (
        excludeAs.length > 0 &&
        excludeAs.includes(t.assignee_id ?? "none")
      ) {
        return false;
      }
      // ยกเว้น (ซ่อน) ตามสถานะที่เลือก — กติกาเดียวกับตัวกรองสถานะ
      if (excludeSt.length > 0) {
        if (excludeSt.includes("working") && t.review_status === "none")
          return false;
        if (excludeSt.includes("pending") && t.review_status === "pending")
          return false;
        if (excludeSt.includes("done") && t.completed) return false;
      }
      if (statusFilter === "working" && t.review_status !== "none") return false;
      if (statusFilter === "pending" && t.review_status !== "pending")
        return false;
      if (statusFilter === "done" && !t.completed) return false;
      if (assigneeFilter === "involved") {
        // "เกี่ยวข้องกับฉัน" = ฉันเป็นผู้รับผิดชอบ/ถูกมอบหมาย หรือฉันเป็นผู้สร้าง/สั่งงาน
        // (ครอบคลุม brief ที่ฉันสั่ง แม้มอบหมายให้คนอื่นไปแล้ว)
        const related = t.assignee_id === userId || t.created_by === userId;
        if (userId === null || !related) return false;
      } else if (assigneeFilter === "me") {
        // "งานของฉัน" = งานที่ฉันรับผิดชอบ + brief ที่ฉันสั่งเอง (ยังไม่ได้ส่งมอบให้ใคร assignee=null)
        // — ไม่งั้น brief ที่เพิ่งสร้างจะถูกซ่อนทันที (assignee_id=null) ดูเหมือนสร้างไม่สำเร็จ
        const mine =
          t.assignee_id === userId ||
          (t.assignee_id === null && t.created_by === userId);
        if (userId === null || !mine) return false;
      } else if (assigneeFilter === "none") {
        if (t.assignee_id !== null) return false;
      } else if (assigneeFilter !== "all" && t.assignee_id !== assigneeFilter) {
        return false;
      }
      // กรองช่วงวันกำหนดส่ง — งานที่ไม่มีกำหนดส่งจะถูกซ่อนเมื่อระบุช่วง
      const due = t.due_date ? t.due_date.slice(0, 10) : null;
      if (dueFrom !== "" && (due === null || due < dueFrom)) return false;
      if (dueTo !== "" && (due === null || due > dueTo)) return false;
      if (q === "") return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [
    activeItems,
    search,
    assigneeFilter,
    statusFilter,
    dueFrom,
    dueTo,
    userId,
    excludeAssignees,
    excludeStatuses,
  ]);

  /** จำนวนงานต่อสถานะของทั้งทีม (ไม่สนตัวกรองอื่น) — ใช้บอกว่าตัวกรองซ่อนงานไว้เท่าไร
      เกณฑ์เดียวกับตัวกรองสถานะ: งานที่ติ๊กเสร็จเองโดยไม่ส่งตรวจถูกนับทั้ง "กำลังทำ" และ "เสร็จสมบูรณ์" */
  const statusCounts = useMemo(() => {
    let working = 0;
    let pending = 0;
    let done = 0;
    for (const t of activeItems) {
      if (t.review_status === "none") working++;
      else if (t.review_status === "pending") pending++;
      if (t.completed) done++;
    }
    return { all: activeItems.length, working, pending, done };
  }, [activeItems]);

  /** งานทั้งหมดของสถานะที่เลือก — เทียบกับที่เห็นจริงแล้วได้จำนวนที่ตัวกรองอื่นซ่อนไว้ */
  const statusTotal =
    statusFilter === "working"
      ? statusCounts.working
      : statusFilter === "pending"
        ? statusCounts.pending
        : statusFilter === "done"
          ? statusCounts.done
          : statusCounts.all;
  const hiddenCount = Math.max(0, statusTotal - filtered.length);

  /* ---------- ตัวกรองบนมือถือ (<lg): ชีตที่เลื่อนขึ้นมาจากขอบล่าง ---------- */

  /** ชีตตัวกรองที่เปิดอยู่ — null = ปิด (แท็บละชุด ไม่ปนกัน) */
  const [filterSheet, setFilterSheet] = useState<"work" | "approved" | null>(
    null
  );
  /** จำนวนตัวกรองที่เปิดอยู่ของแท็บบันทึกงาน (ไม่นับช่องค้นหาที่เห็นอยู่แล้วบนแถบ) */
  const workFilterCount =
    (assigneeFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (dueFrom !== "" || dueTo !== "" ? 1 : 0) +
    excludeAssignees.length +
    excludeStatuses.length;

  /** งานที่ section หายไป (null/ไม่รู้จัก) ถูกพักไว้ที่คอลัมน์แรก — กติกาเดียวกับตอนลบ section */
  const bucketOf = (t: TaskWithAssignee): string | null => {
    if (t.section_id && sections.some((s) => s.id === t.section_id)) {
      return t.section_id;
    }
    return sections[0]?.id ?? null;
  };

  const tasksBySection = useMemo(() => {
    const map: Record<string, TaskWithAssignee[]> = {};
    for (const s of sections) map[s.id] = [];
    for (const t of filtered) {
      const bucket = bucketOf(t);
      if (bucket) map[bucket].push(t);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position - b.position);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sections]);

  const taskById = useMemo(
    () => new Map(items.map((t) => [t.id, t])),
    [items]
  );

  /* ---------- realtime: บอร์ดอัพเดทสดเมื่อมีใครสร้าง/แก้/ลบงานหรือเซคชัน (ไม่ต้อง refresh) ---------- */

  useEffect(() => {
    /** ดึงแถวเต็มพร้อม join แล้ว upsert เข้า state — event ของตัวเองก็ idempotent (id ซ้ำ = แทนที่) */
    const upsertTaskFromDb = (id: string) => {
      void supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return; // แถวถูกลบไปแล้วระหว่างรอ — เดี๋ยว event DELETE จัดการเอง
          const row = data as unknown as TaskWithAssignee;
          setItems((cur) =>
            cur.some((t) => t.id === row.id)
              ? cur.map((t) => (t.id === row.id ? row : t))
              : [...cur, row]
          );
        });
    };
    const channel = supabase
      .channel("tasks-board")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (p) => upsertTaskFromDb((p.new as { id: string }).id)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (p) => upsertTaskFromDb((p.new as { id: string }).id)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks" },
        (p) => {
          const id = (p.old as { id?: string }).id;
          if (!id) return;
          setItems((cur) => cur.filter((t) => t.id !== id));
          setSelectedId((sel) => (sel === id ? null : sel));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_sections" },
        (p) => {
          if (p.eventType === "DELETE") {
            const id = (p.old as { id?: string }).id;
            if (id) setSections((cur) => cur.filter((s) => s.id !== id));
            return;
          }
          const row = p.new as TaskSectionRow;
          setSections((cur) => {
            const next = cur.some((s) => s.id === row.id)
              ? cur.map((s) => (s.id === row.id ? row : s))
              : [...cur, row];
            return [...next].sort((a, b) => a.position - b.position);
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  /* ---------- การแจ้งเตือน (กระดิ่ง) — แถวถูก insert ให้ผู้เกี่ยวข้องแบบ fire-and-forget ---------- */

  const notify = (
    task: TaskWithAssignee,
    rows: {
      recipient: string | null | undefined;
      type: NotificationType;
      preview?: string | null;
    }[]
  ) => {
    if (isTempId(task.id)) return;
    const seen = new Set<string>();
    const inserts: {
      recipient_id: string;
      actor_id: string | null;
      task_id: string;
      type: NotificationType;
      preview: string | null;
    }[] = [];
    for (const r of rows) {
      // ไม่แจ้งเตือนตัวเอง + กันแถวซ้ำ (คนเดียวกัน+ชนิดเดียวกัน)
      if (!r.recipient || r.recipient === userId) continue;
      const key = `${r.recipient}:${r.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      inserts.push({
        recipient_id: r.recipient,
        actor_id: userId,
        task_id: task.id,
        type: r.type,
        preview: r.preview ?? null,
      });
    }
    if (inserts.length > 0) {
      // แจ้งเตือนพลาดไม่ต้องเด้ง error — งานหลัก (บันทึก/คอมเมนต์) สำเร็จไปแล้ว
      // (ต้องมี .then เสมอ: builder ของ supabase-js เป็น lazy thenable — ไม่ then = ไม่ยิง request)
      void supabase
        .from("notifications")
        .insert(inserts)
        .then(({ error: e }) => {
          if (e) console.warn("ส่งแจ้งเตือนไม่สำเร็จ:", e.message);
        });
    }
  };

  /* ---------- แท็บ "ตรวจแล้ว" + ตัวกรองของแท็บ ---------- */

  const [apSearch, setApSearch] = useState("");
  /** all | me | none | <profileId> — เริ่มต้น = งานของฉัน */
  const [apAssignee, setApAssignee] = useState<string>(userId ? "me" : "all");
  /** all | me | <profileId> */
  const [apReviewer, setApReviewer] = useState<string>("all");
  /** all | posted (โพสแล้ว) | unposted (ยังไม่ได้โพส) — เริ่มต้น = ยังไม่ได้โพส */
  const [apPosted, setApPosted] = useState<string>("unposted");
  const [apFrom, setApFrom] = useState("");
  const [apTo, setApTo] = useState("");

  const hasApFilter =
    apSearch.trim() !== "" ||
    apAssignee !== "all" ||
    apReviewer !== "all" ||
    apPosted !== "all" ||
    apFrom !== "" ||
    apTo !== "";

  const clearApFilters = () => {
    setApSearch("");
    setApAssignee("all");
    setApReviewer("all");
    setApPosted("all");
    setApFrom("");
    setApTo("");
  };

  /** จำนวนตัวกรองที่เปิดอยู่ของแท็บ "งานเสร็จ" — ป้ายบนปุ่มตัวกรองฝั่งมือถือ */
  const apFilterCount =
    (apAssignee !== "all" ? 1 : 0) +
    (apReviewer !== "all" ? 1 : 0) +
    (apPosted !== "all" ? 1 : 0) +
    (apFrom !== "" || apTo !== "" ? 1 : 0);

  const approvedAll = useMemo(
    () => activeItems.filter((t) => t.review_status === "approved"),
    [activeItems]
  );

  /* ---------- แท็บ "รอโพส" + ตัวกรองของแท็บ ----------
     จงใจไม่จำค่าลง localStorage (ต่างจากตัวกรองบอร์ด): เปิดหน้ามาใหม่ต้องเห็นคิวของตัวเองก่อนเสมอ */

  /** all | me | none | <profileId> — เริ่มต้น = คิวของฉัน */
  const [pqAssignee, setPqAssignee] = useState<string>(userId ? "me" : "all");

  /** คิว "รอโพส" ทั้งทีม — งานตรวจผ่านแล้วแต่ยังไม่ถูกทำเครื่องหมายว่าโพส เรียงรอนานสุดก่อน */
  const postQueueAll = useMemo(
    () =>
      approvedAll
        .filter((t) => t.posted_at === null)
        .sort((a, b) =>
          (a.approved_at ?? a.updated_at).localeCompare(
            b.approved_at ?? b.updated_at
          )
        ),
    [approvedAll]
  );

  /** คิวที่โชว์จริง = กรองตาม "คนที่ต้องโพส" — badge บนแท็บก็นับชุดนี้ เลขจะได้ตรงกับที่เห็นในลิสต์
      เจ้าของคิว = ผู้สั่ง Brief ถ้าการ์ดมาจาก Brief ไม่งั้นผู้รับผิดชอบการ์ด (`postOwnerIdOf`,
      กติกาผู้ใช้ 2026-08-29) — เกณฑ์เดียวกับที่ระบบ KPI ใช้ ห้ามกลับไปเช็ค assignee_id ตรงๆ
      ("ของฉัน" ที่ไม่รู้ว่าใคร (userId หาย) ตกกลับเป็นทั้งทีม — ดีกว่าโชว์คิวว่างให้เข้าใจผิดว่าไม่มีงานค้าง) */
  const postQueue = useMemo(() => {
    if (pqAssignee === "all") return postQueueAll;
    if (pqAssignee === "none")
      return postQueueAll.filter((t) => postOwnerIdOf(t) === null);
    const targetId = pqAssignee === "me" ? userId : pqAssignee;
    if (targetId === null) return postQueueAll;
    return postQueueAll.filter((t) => postOwnerIdOf(t) === targetId);
  }, [postQueueAll, pqAssignee, userId]);

  const approvedFiltered = useMemo(() => {
    const q = apSearch.trim().toLowerCase();
    return approvedAll
      .filter((t) => {
        if (apAssignee === "me") {
          if (userId === null || t.assignee_id !== userId) return false;
        } else if (apAssignee === "none") {
          if (t.assignee_id !== null) return false;
        } else if (apAssignee !== "all" && t.assignee_id !== apAssignee) {
          return false;
        }
        // ผู้ตรวจ = ลำดับ 1 (ทั้งคนหลักและผู้ตรวจร่วม) หรือลำดับ 2 ก็นับว่าเกี่ยวข้องกับงานนั้น
        if (apReviewer === "me") {
          if (
            userId === null ||
            (t.reviewer_id !== userId &&
              t.reviewer1b_id !== userId &&
              t.reviewer2_id !== userId)
          )
            return false;
        } else if (
          apReviewer !== "all" &&
          t.reviewer_id !== apReviewer &&
          t.reviewer1b_id !== apReviewer &&
          t.reviewer2_id !== apReviewer
        ) {
          return false;
        }
        // กรองสถานะโพส/ใช้งาน
        if (apPosted === "posted" && t.posted_at === null) return false;
        if (apPosted === "unposted" && t.posted_at !== null) return false;
        // กรองช่วงวันที่ตรวจผ่าน — เทียบเป็นวันตามเวลาไทย (คิดเฉพาะเมื่อตั้งช่วงไว้)
        if (apFrom !== "" || apTo !== "") {
          const day = bangkokDay(t.approved_at ?? t.updated_at);
          if (apFrom !== "" && day < apFrom) return false;
          if (apTo !== "" && day > apTo) return false;
        }
        if (q === "") return true;
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        (b.approved_at ?? b.updated_at).localeCompare(
          a.approved_at ?? a.updated_at
        )
      );
  }, [approvedAll, apSearch, apAssignee, apReviewer, apPosted, apFrom, apTo, userId]);

  /** ตัวเลือกกรองผู้ตรวจ = roster ปัจจุบัน + คนที่เคยตรวจงานใน "ตรวจแล้ว" แม้ถูกถอดจาก roster ไปแล้ว */
  const apReviewerOptions = useMemo(() => {
    const seen = new Map<string, ProfileOption>(
      reviewerProfiles.map((p) => [p.id, p] as const)
    );
    for (const t of approvedAll) {
      if (t.reviewer && !seen.has(t.reviewer.id)) {
        seen.set(t.reviewer.id, t.reviewer);
      }
      if (t.reviewer1b && !seen.has(t.reviewer1b.id)) {
        seen.set(t.reviewer1b.id, t.reviewer1b);
      }
      if (t.reviewer2 && !seen.has(t.reviewer2.id)) {
        seen.set(t.reviewer2.id, t.reviewer2);
      }
    }
    return [...seen.values()];
  }, [reviewerProfiles, approvedAll]);

  const hasDemo = activeItems.some((t) => t.description === "demo");
  const today = todayISO();
  // งานที่เลือกถูกย้ายไปถังขยะ (เช่นโดนคนอื่นลบผ่าน realtime) — ปิดแผงให้เอง
  const selectedRaw = selectedId ? (taskById.get(selectedId) ?? null) : null;
  const selectedTask =
    selectedRaw !== null && !selectedRaw.deleted_at ? selectedRaw : null;

  /* ---------- ลิงก์ Brief ↔ Creative (การ์ดที่เชื่อมกัน) ---------- */

  // การ์ด brief ต้นทางของงาน creative ที่เปิดอยู่ (ถ้ามาจาก brief)
  const briefSource =
    selectedTask?.brief_source_id
      ? (taskById.get(selectedTask.brief_source_id) ?? null)
      : null;
  // การ์ด creative ที่ถูกสร้างจาก brief ที่เปิดอยู่ (ถ้าเป็นการ์ด brief)
  const linkedCreatives = useMemo(
    () =>
      selectedTask
        ? activeItems.filter((t) => t.brief_source_id === selectedTask.id)
        : [],
    [activeItems, selectedTask]
  );

  /** เปิดแผงของงานที่ลิงก์ + เลื่อนบอร์ดไปที่การ์ดนั้น (ล้างตัวกรองให้การ์ดโผล่แน่นอน) */
  const navigateToTask = (taskId: string) => {
    // ล้างตัวกรองเพื่อให้การ์ดเป้าหมายโผล่แน่ๆ แต่ไม่ทับค่าที่ผู้ใช้ตั้งไว้ใน localStorage
    skipPersistRef.current = true;
    clearFilters();
    setTab("work");
    setSelectedId(taskId);
    // รอบอร์ด re-render (สลับแท็บ/ล้างตัวกรอง/masonry) แล้วค่อยหา element เพื่อเลื่อน
    const scroll = (attempts = 0) => {
      const el = document.querySelector(`[data-task-id="${taskId}"]`);
      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
        return;
      }
      if (attempts < 12) window.setTimeout(() => scroll(attempts + 1), 50);
    };
    window.setTimeout(() => scroll(), 60);
  };

  /* ---------- deep link จากกระดิ่งแจ้งเตือน: /tasks?task=<id> → เปิดแผง + เลื่อนไปที่การ์ด ---------- */

  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task");
  const handledTaskParam = useRef<string | null>(null);
  useEffect(() => {
    if (!taskParam) {
      handledTaskParam.current = null;
      return;
    }
    if (handledTaskParam.current === taskParam) return;
    if (!taskById.has(taskParam)) {
      // งานที่ชี้ถึงถูกลบไปแล้ว (บอร์ดโหลดครบแต่หาไม่เจอ) — ล้าง param ทิ้ง ไม่ให้ effect วนเช็คค้าง
      if (items.length > 0) {
        handledTaskParam.current = taskParam;
        window.history.replaceState(null, "", "/tasks");
      }
      return;
    }
    handledTaskParam.current = taskParam;
    // ล้าง param ออกจาก URL (ไม่ trigger navigation) — คลิกแจ้งเตือนเดิมซ้ำแล้วเปิดได้อีก
    window.history.replaceState(null, "", "/tasks");
    // เปิดแผงถัดจาก render รอบนี้ (ไม่ setState กลาง effect) — จงใจไม่ clear ตอน cleanup:
    // effect นี้ re-run ได้ทุกครั้งที่ items เปลี่ยน (realtime) ถ้า clear จะกินคำสั่งเปิดแผงทิ้ง
    const target = taskById.get(taskParam);
    window.setTimeout(() => {
      if (target?.deleted_at) {
        setTab("trash"); // งานอยู่ในถังขยะ — การ์ดไม่อยู่บนบอร์ด เปิดแท็บถังขยะแทน
      } else {
        navigateToTask(taskParam);
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskParam, taskById]);

  /* ---------- task mutations (optimistic ทั้งหมด) ---------- */

  const patchTask = (id: string, patch: TaskPatch) => {
    if (isTempId(id)) return; // แถวยังไม่ถึง DB — กัน update ด้วย id ปลอม
    const prev = items.find((t) => t.id === id);
    if (!prev) return;
    const merged = { ...patch.db, ...(patch.local ?? {}) };
    // undo เฉพาะ field ที่แก้ — ไม่ทับการแก้ไขอื่นที่สำเร็จไปแล้ว
    const undo: Record<string, unknown> = {};
    for (const key of Object.keys(merged)) {
      undo[key] = prev[key as keyof TaskWithAssignee];
    }
    setItems((cur) =>
      cur.map((t) => (t.id === id ? ({ ...t, ...merged } as TaskWithAssignee) : t))
    );
    void supabase
      .from("tasks")
      .update(patch.db)
      .eq("id", id)
      .then(({ error: e }) => {
        if (e) {
          setItems((cur) =>
            cur.map((t) =>
              t.id === id ? ({ ...t, ...undo } as TaskWithAssignee) : t
            )
          );
          showError(`บันทึกไม่สำเร็จ: ${e.message}`);
          return;
        }
        markServerStale();
      });
  };

  /* ---------- review workflow ---------- */

  /** ส่งตรวจงาน → รอตรวจ (ต้องระบุผู้ตรวจก่อน)
      ถ้าทีมตั้ง "ผู้ตรวจลำดับ 2" ไว้ → snapshot ใส่งาน แล้วการตรวจไหลเป็นทอด 1 → 2

      **งานของผู้ตรวจเอง = ลำดับนั้นถือว่าอนุมัติแล้วตั้งแต่ตอนส่งตรวจ** (ผู้ใช้ 2026-08-12):
      ไม่มีใครต้องมากดอนุมัติงานที่ตัวเองเป็นคนทำ — ช่องของคนนั้นถูกจดเวลาไว้เลย
      งานจึงไหลไปหาผู้ตรวจร่วมที่เหลือ / ลำดับ 2 / หรือเสร็จสมบูรณ์ทันทีถ้าไม่เหลือใคร */
  const submitForReview = (task: TaskWithAssignee) => {
    if (!task.reviewer_id) {
      showError("เลือกผู้ตรวจงานก่อนจึงจะส่งตรวจได้");
      return;
    }
    // ลิงก์ Google Drive เป็นของบังคับตั้งแต่ 2026-08-29 — ผู้ตรวจต้องเปิดไฟล์จริงได้
    // ทุกใบ ไม่ใช่ดูจากรูป preview อย่างเดียว (ปุ่มในแผงถูก disable ไว้แล้ว
    // ตัวนี้เป็นกันชนอีกชั้นเผื่อมีทางเรียกอื่นในอนาคต)
    if ((task.deliverable_url ?? "").trim() === "") {
      showError(
        "ต้องวางลิงก์ Google Drive ของงานก่อนจึงจะส่งตรวจได้ — ใส่ได้ที่ช่อง \"ลิงก์งาน (Google Drive)\" ในแผงรายละเอียด"
      );
      return;
    }
    const now = new Date().toISOString();
    // "งานของตัวเอง" ยึดผู้รับผิดชอบ (คนที่ทำงานใบนี้) ไม่ใช่คนกดส่งตรวจ —
    // การ์ดจาก brief ผู้สั่งเป็นคนกดส่ง แต่คนทำคือ assignee
    const owner = task.assignee_id;
    const selfPrimary = owner !== null && owner === task.reviewer_id;
    const selfCo = owner !== null && owner === task.reviewer1b_id;
    // ลำดับ 2 ต้องยังอยู่ใน roster, ไม่ซ้ำกับผู้ตรวจลำดับ 1 ทั้งสองคน และไม่ใช่เจ้าของงานเอง
    // (ซ้ำ/เป็นเจ้าของงาน = ไม่ chain — ลำดับนั้นผ่านอยู่แล้วโดยกติกาข้างบน)
    const reviewer2Id =
      globalReviewer2Id !== null &&
      reviewerSet.has(globalReviewer2Id) &&
      globalReviewer2Id !== task.reviewer_id &&
      globalReviewer2Id !== task.reviewer1b_id &&
      globalReviewer2Id !== owner
        ? globalReviewer2Id
        : null;
    const reviewer2Person = reviewer2Id
      ? (profiles.find((p) => p.id === reviewer2Id) ?? null)
      : null;
    const base: TaskPatch["db"] = {
      reviewer2_id: reviewer2Id,
      review_submitted_at: now,
      reviewer1_approved_at: selfPrimary ? now : null,
      reviewer1b_approved_at: selfCo ? now : null,
    };
    const local: NonNullable<TaskPatch["local"]> = { reviewer2: reviewer2Person };
    // ทอดแรกเหลือใครที่ต้องตรวจจริงๆ บ้าง (คนที่ไม่ใช่เจ้าของงาน)
    const stage1Pending: (string | null)[] = [];
    if (!selfPrimary) stage1Pending.push(task.reviewer_id);
    if (task.reviewer1b_id !== null && !selfCo)
      stage1Pending.push(task.reviewer1b_id);

    if (stage1Pending.length > 0) {
      patchTask(task.id, {
        db: {
          ...base,
          review_status: "pending",
          completed: false,
          review_step: 1,
          review1_approved_at: null,
        },
        local,
      });
      // แจ้งเฉพาะคนที่ยังต้องตรวจ (ช่องที่ผ่านอัตโนมัติไม่ต้องเตือนใคร)
      notify(
        task,
        stage1Pending.map((id) => ({ recipient: id, type: "review_request" as const }))
      );
      return;
    }
    // ทอดแรกผ่านครบตั้งแต่ส่ง (ผู้ตรวจลำดับ 1 ทุกคนคือเจ้าของงานเอง)
    if (reviewer2Id !== null) {
      patchTask(task.id, {
        db: {
          ...base,
          review_status: "pending",
          completed: false,
          review_step: 2,
          review1_approved_at: now,
        },
        local,
      });
      notify(task, [{ recipient: reviewer2Id, type: "review_request" }]);
      return;
    }
    // ไม่เหลือใครต้องตรวจเลย — งานเสร็จสมบูรณ์ทันที
    patchTask(task.id, {
      db: {
        ...base,
        review_status: "approved",
        completed: true,
        approved_at: now,
        review_step: 1,
        review1_approved_at: null,
      },
      local,
    });
    notify(task, [
      { recipient: task.assignee_id, type: "approved" },
      { recipient: task.created_by, type: "approved" },
    ]);
  };

  /** ยกเลิกการส่งตรวจ (ผู้ส่งดึงกลับมาแก้) — ล้างทอดการตรวจ ให้ส่งใหม่เริ่มทอด 1 เสมอ */
  const cancelReview = (task: TaskWithAssignee) => {
    patchTask(task.id, {
      db: {
        review_status: "none",
        completed: false,
        review_step: 1,
        review1_approved_at: null,
        reviewer1_approved_at: null,
        reviewer1b_approved_at: null,
        review_submitted_at: null,
      },
    });
  };

  /** ผู้ตรวจกด approve — ทอดแรกต้อง "อนุมัติครบทุกคน" (คนหลัก + ผู้ตรวจร่วมถ้ามี) ก่อน:
      คนแรกที่กด = จดเวลาลงช่องของตัวเอง งานยังค้างรออีกคน; คนสุดท้ายที่กด = ผ่านทอด 1
      → ส่งต่อให้ลำดับ 2 (ถ้ามี) หรือเสร็จสมบูรณ์เลย (งานตรวจชั้นเดียว) */
  const approveTask = (task: TaskWithAssignee) => {
    const step = task.review_step ?? 1;
    const now = new Date().toISOString();
    if (step < 2) {
      const isPrimary = userId !== null && userId === task.reviewer_id;
      const isCo = userId !== null && userId === task.reviewer1b_id;
      if (!isPrimary && !isCo) return; // ไม่ใช่ผู้ตรวจทอดนี้ (UI ค้าง/กดแทนกันไม่ได้)
      // ช่องที่ผู้ตรวจคือเจ้าของงานเอง = ผ่านอัตโนมัติ (ปกติถูกจดตั้งแต่ตอนส่งตรวจแล้ว —
      // เช็คซ้ำที่นี่เพื่อครอบงานเก่าที่ส่งตรวจไว้ก่อนมีกติกานี้ ไม่ให้ค้างรอคนอนุมัติงานตัวเอง)
      const owner = task.assignee_id;
      const selfPrimary = owner !== null && owner === task.reviewer_id;
      const selfCo = owner !== null && owner === task.reviewer1b_id;
      const slotDb: TaskPatch["db"] = {};
      if (isPrimary) slotDb.reviewer1_approved_at = now;
      else if (isCo) slotDb.reviewer1b_approved_at = now;
      if (selfPrimary && task.reviewer1_approved_at === null)
        slotDb.reviewer1_approved_at = now;
      if (selfCo && task.reviewer1b_approved_at === null)
        slotDb.reviewer1b_approved_at = now;
      // นับรวมการกดครั้งนี้แล้ว ครบทุกช่องที่มีคนหรือยัง
      const primaryDone =
        task.reviewer_id === null ||
        task.reviewer1_approved_at !== null ||
        isPrimary ||
        selfPrimary;
      const coDone =
        task.reviewer1b_id === null ||
        task.reviewer1b_approved_at !== null ||
        isCo ||
        selfCo;
      if (!(primaryDone && coDone)) {
        // ยังไม่ครบ — จดว่าฉันอนุมัติแล้ว งานคงสถานะรอตรวจทอด 1 รออีกคน
        patchTask(task.id, { db: slotDb });
        const other = isPrimary ? task.reviewer1b_id : task.reviewer_id;
        notify(task, [
          {
            recipient: other,
            type: "review_request",
            preview: "ผู้ตรวจร่วมอนุมัติแล้ว — เหลือคุณอีกคน งานจึงจะผ่านลำดับ 1",
          },
        ]);
        return;
      }
      if (task.reviewer2_id !== null) {
        patchTask(task.id, {
          db: { ...slotDb, review_step: 2, review1_approved_at: now },
        });
        // ทอดแรกครบทุกคนแล้ว — ส่งไม้ต่อให้ผู้ตรวจลำดับ 2 มาตรวจขั้นสุดท้าย
        notify(task, [{ recipient: task.reviewer2_id, type: "review_request" }]);
        return;
      }
      patchTask(task.id, {
        db: { ...slotDb, review_status: "approved", completed: true, approved_at: now },
      });
      notify(task, [
        { recipient: task.assignee_id, type: "approved" },
        { recipient: task.created_by, type: "approved" },
      ]);
      return;
    }
    // ทอด 2 — ผู้ตรวจลำดับ 2 อนุมัติขั้นสุดท้าย
    patchTask(task.id, {
      db: { review_status: "approved", completed: true, approved_at: now },
    });
    // บอกทั้งผู้รับผิดชอบและผู้สร้างการ์ด (เช่น content ที่สั่ง brief) ว่างานผ่านแล้ว
    notify(task, [
      { recipient: task.assignee_id, type: "approved" },
      { recipient: task.created_by, type: "approved" },
    ]);
  };

  /** ผู้ตรวจทอดแรกกด "อนุมัติจบทันที" — ปิดงานเป็นเสร็จสมบูรณ์เลย ข้ามทุกคนที่ยังไม่ได้ตรวจ
      (ผู้ตรวจร่วมที่ยังไม่อนุมัติ + ผู้ตรวจลำดับ 2) และถอดชื่อคนที่ไม่ได้ตรวจออกจากงาน
      เพื่อไม่บันทึกว่าเขาเป็นผู้อนุมัติทั้งที่ไม่ได้ตรวจ */
  const approveTaskBypass = (task: TaskWithAssignee) => {
    const now = new Date().toISOString();
    const isPrimary = userId !== null && userId === task.reviewer_id;
    const isCo = userId !== null && userId === task.reviewer1b_id;
    const primaryApproved = task.reviewer1_approved_at !== null || isPrimary;
    const coApproved = task.reviewer1b_approved_at !== null || isCo;
    const db: TaskPatch["db"] = {
      review_status: "approved",
      completed: true,
      approved_at: now,
      reviewer2_id: null,
      review_step: 1,
      review1_approved_at: null,
    };
    const local: NonNullable<TaskPatch["local"]> = { reviewer2: null };
    if (isPrimary) db.reviewer1_approved_at = now;
    if (isCo) db.reviewer1b_approved_at = now;
    if (task.reviewer1b_id !== null && !coApproved) {
      // ผู้ตรวจร่วมยังไม่ได้ตรวจ — ถอดออก
      db.reviewer1b_id = null;
      db.reviewer1b_approved_at = null;
      local.reviewer1b = null;
    } else if (task.reviewer1b_id !== null && coApproved && !primaryApproved) {
      // คนหลักไม่ได้ตรวจเลย แต่ผู้ตรวจร่วมเป็นคนปิดงาน — เลื่อนผู้ตรวจร่วมขึ้นช่องหลัก
      db.reviewer_id = task.reviewer1b_id;
      db.reviewer1_approved_at = db.reviewer1b_approved_at ?? task.reviewer1b_approved_at;
      db.reviewer1b_id = null;
      db.reviewer1b_approved_at = null;
      local.reviewer = task.reviewer1b ?? null;
      local.reviewer1b = null;
    }
    patchTask(task.id, { db, local });
    notify(task, [
      { recipient: task.assignee_id, type: "approved" },
      { recipient: task.created_by, type: "approved" },
    ]);
  };

  /** ปุ่ม bypass ต้องยืนยันก่อน — เป็นการข้ามคนที่ยังไม่ได้ตรวจทั้งหมด ให้กดพลาดยาก */
  const requestApproveBypass = (task: TaskWithAssignee) => {
    if (isTempId(task.id)) return;
    // รายชื่อคนที่จะถูกข้าม: ผู้ตรวจร่วมทอดแรกที่ยังไม่อนุมัติ (ไม่ใช่ตัวฉัน) + ผู้ตรวจลำดับ 2
    const skipped: string[] = [];
    for (const p of currentReviewerPersons(task)) {
      if (p.id !== userId) skipped.push(profileName(p));
    }
    if (task.reviewer2_id !== null) {
      skipped.push(task.reviewer2 ? profileName(task.reviewer2) : "ผู้ตรวจลำดับ 2");
    }
    const who = skipped.length > 0 ? skipped.join(" และ ") : "คนที่เหลือ";
    setConfirm({
      title: "อนุมัติจบทันที (ข้ามคนที่ยังไม่ได้ตรวจ)",
      message: `งาน "${task.title}" จะเสร็จสมบูรณ์ทันทีโดยไม่ต้องให้ ${who} ตรวจ ใช่หรือไม่?`,
      confirmLabel: "อนุมัติจบทันที",
      confirmVariant: "primary",
      onConfirm: () => approveTaskBypass(task),
    });
  };

  /** ผู้ตรวจกด "ตีกลับ" → เปิดกล่องระบุเหตุผล */
  const requestReject = (task: TaskWithAssignee) => {
    if (isTempId(task.id)) return;
    setRejectReason("");
    setRejectKind(DEFAULT_REVISION_KIND);
    setRejectTarget(task);
  };

  /** ยืนยันตีกลับ — บันทึกคอมเมนต์ revision (นับเป็นการแก้ไข 1 ครั้งของผู้รับผิดชอบ)
      แล้วดึงงานกลับสถานะ "กำลังทำ" ให้ผู้รับผิดชอบแก้แล้วส่งตรวจใหม่ */
  const confirmReject = async () => {
    const task = rejectTarget;
    if (!task || rejecting) return;
    setRejecting(true);

    // เลขรอบแก้ไขถัดไป — อ่านเลขสูงสุดจริงจาก DB ก่อน (state ฝั่งจอไม่ได้โหลดคอมเมนต์ทุกงาน)
    const { data: maxRow, error: maxErr } = await supabase
      .from("task_comments")
      .select("revision_number")
      .eq("task_id", task.id)
      .eq("is_revision", true)
      .order("revision_number", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) {
      setRejecting(false);
      showError(`ตีกลับไม่สำเร็จ: ${maxErr.message}`);
      return;
    }
    const revisionNumber = (maxRow?.revision_number ?? 0) + 1;

    const { error: cErr } = await supabase.from("task_comments").insert({
      task_id: task.id,
      author_id: userId,
      body: rejectReason.trim(),
      is_revision: true,
      revision_number: revisionNumber,
      revision_kind: rejectKind,
    });
    setRejecting(false);
    if (cErr) {
      showError(`บันทึกการตีกลับไม่สำเร็จ: ${cErr.message}`);
      return;
    }
    // ดึงกลับเป็น "กำลังทำ" — ล้างสถานะ approve + ทอดการตรวจ (ส่งใหม่เริ่มทอด 1 ใหม่ทั้งสาย)
    patchTask(task.id, {
      db: {
        review_status: "none",
        completed: false,
        approved_at: null,
        review_step: 1,
        review1_approved_at: null,
        reviewer1_approved_at: null,
        reviewer1b_approved_at: null,
        review_submitted_at: null,
      },
    });
    notify(task, [
      {
        recipient: task.assignee_id,
        type: "rejected",
        // ใส่ประเภทนำหน้าเหตุผล — ผู้รับผิดชอบต้องรู้ตั้งแต่ในกระดิ่งว่าเป็นคำผิดหรือแค่ขอเพิ่มเติม
        preview: `[${REVISION_KINDS[rejectKind].label}] ${rejectReason.trim()}`.trim(),
      },
    ]);
    setRejectTarget(null);
    setRejectReason("");
  };

  /** เปิดงานที่เสร็จแล้วกลับมาแก้ — ล้างทอดการตรวจด้วย ให้ส่งตรวจใหม่เริ่มจากลำดับ 1 */
  const reopenTask = (task: TaskWithAssignee) => {
    patchTask(task.id, {
      db: {
        review_status: "none",
        completed: false,
        approved_at: null,
        review_step: 1,
        review1_approved_at: null,
        reviewer1_approved_at: null,
        reviewer1b_approved_at: null,
        review_submitted_at: null,
      },
    });
  };

  /** สลับสถานะ "โพส/ใช้งานแล้ว" (ปุ่มใหญ่ในแท็บรอโพส + การ์ดในแท็บงานเสร็จ)
      เก็บคนกดไว้ด้วย (posted_by) ให้รู้ว่าใครเป็นคนโพส — กดยกเลิกล้างทั้งเวลาและคนกด
      งานที่ยังระบุประเภทไม่ครบ → เปิดกล่องติดประเภทก่อนค่อยบันทึกโพส
      **ทั้งประเภทชิ้นงาน (ภาพ/วิดีโอ) และหมวดเนื้อหา (สวย/หมอ/Before-After ...) เป็นข้อบังคับ**
      (ผู้ใช้ 2026-08-29 — เดิมหมวดเป็น optional ทำให้กติกา KPI ที่เจาะหมวดนับไม่ได้);
      ยกเว้นตอนที่ทีมยังไม่ได้สร้างหมวดไว้เลย ไม่งั้นจะกดโพสไม่ได้ทั้งระบบ */
  const togglePosted = (task: TaskWithAssignee) => {
    const unposting = task.posted_at !== null;
    const needsCategory =
      task.content_category_id === null &&
      contentCategories.some((c) => c.active);
    if (!unposting && (task.content_format === null || needsCategory)) {
      setPostFormat(task.content_format);
      setPostCategoryId(task.content_category_id ?? "");
      setPostTarget(task);
      return;
    }
    patchTask(task.id, {
      db: {
        posted_at: unposting ? null : new Date().toISOString(),
        posted_by: unposting ? null : userId,
      },
      local: { poster: unposting ? null : meProfile },
    });
  };

  /** ยืนยันจากกล่องติดประเภท — บันทึกประเภทชิ้นงาน + สถานะโพสในการแก้ครั้งเดียว */
  const confirmMarkPosted = () => {
    if (postTarget === null || postFormat === null) return;
    patchTask(postTarget.id, {
      db: {
        content_format: postFormat,
        content_category_id: postCategoryId === "" ? null : postCategoryId,
        posted_at: new Date().toISOString(),
        posted_by: userId,
      },
      local: { poster: meProfile },
    });
    setPostTarget(null);
  };

  /** เปลี่ยนผู้ตรวจงาน (ลำดับ 1 คนหลัก) */
  const setReviewer = (task: TaskWithAssignee, profileId: string | null) => {
    if (task.reviewer_id === profileId) return;
    // ล้างคนหลักทั้งที่มีผู้ตรวจร่วมอยู่ — เลื่อนคนที่ 2 ขึ้นเป็นคนหลักแทน
    // (ช่องหลักต้องมีคนเสมอก่อนส่งตรวจ: ปุ่มส่งตรวจเช็ค reviewer_id)
    if (profileId === null && task.reviewer1b_id !== null) {
      patchTask(task.id, {
        db: { reviewer_id: task.reviewer1b_id, reviewer1b_id: null },
        local: { reviewer: task.reviewer1b ?? null, reviewer1b: null },
      });
      return;
    }
    const person = profiles.find((p) => p.id === profileId) ?? null;
    // เลือกคนเดียวกับผู้ตรวจร่วม = คนนั้นขึ้นเป็นคนหลัก แล้วล้างช่องร่วม (กันชื่อซ้ำสองช่อง)
    const dupWithB = profileId !== null && profileId === task.reviewer1b_id;
    patchTask(task.id, {
      db: {
        reviewer_id: profileId,
        ...(dupWithB ? { reviewer1b_id: null } : {}),
      },
      local: {
        reviewer: person,
        ...(dupWithB ? { reviewer1b: null } : {}),
      },
    });
  };

  /** เปลี่ยน/เอาออก ผู้ตรวจลำดับ 1 คนที่ 2 (ผู้ตรวจร่วม) ของงาน */
  const setReviewer1b = (task: TaskWithAssignee, profileId: string | null) => {
    if (task.reviewer1b_id === profileId) return;
    // ห้ามซ้ำกับคนหลัก (ตัวเลือกใน UI ตัดออกแล้ว — กันไว้อีกชั้น)
    if (profileId !== null && profileId === task.reviewer_id) return;
    const person = profiles.find((p) => p.id === profileId) ?? null;
    patchTask(task.id, {
      db: { reviewer1b_id: profileId },
      local: { reviewer1b: person },
    });
  };

  /** ผูก/ยกเลิก influencer ของงาน */
  const setInfluencer = (task: TaskWithAssignee, influencerId: string | null) => {
    if (task.influencer_id === influencerId) return;
    const inf = influencers.find((i) => i.id === influencerId) ?? null;
    patchTask(task.id, {
      db: { influencer_id: influencerId },
      local: { influencer: inf },
    });
  };

  /** เปลี่ยนผู้รับผิดชอบ (วงกลมบนการ์ด + ช่องในแผงรายละเอียด) — แจ้งเตือนคนที่ถูกมอบหมาย */
  const assignTask = (task: TaskWithAssignee, profileId: string | null) => {
    if (task.assignee_id === profileId) return;
    const person = profiles.find((p) => p.id === profileId) ?? null;
    patchTask(task.id, {
      db: { assignee_id: profileId },
      local: { assignee: person },
    });
    notify(task, [{ recipient: profileId, type: "assign" }]);
  };

  const quickAdd = async (
    sectionId: string,
    title: string,
    placement: QuickAddPlacement
  ) => {
    markServerStale(); // เขียน DB = cache ของหน้านี้เก่าแล้ว
    if (isTempId(sectionId)) return;
    const section = sections.find((s) => s.id === sectionId);
    const isBrief = section?.type === "brief";
    // ใช้กติกาเดียวกับที่บอร์ดแสดงผล (งานไร้ section ถูกพักไว้คอลัมน์แรก)
    const inSection = activeItems.filter((t) => bucketOf(t) === sectionId);
    const position =
      inSection.length === 0
        ? 1024
        : placement === "top"
          ? Math.min(...inSection.map((t) => t.position)) - 1
          : Math.max(...inSection.map((t) => t.position)) + 1;

    // เซคชัน brief: ผู้ตรวจ = ผู้สร้าง (auto) และยังไม่ระบุผู้รับ (รอกำหนด "ส่งมอบให้")
    // เซคชัน work: ผู้รับผิดชอบ = ตัวเอง, ผู้ตรวจ = ผู้ตรวจเริ่มต้นของทีม 2 คน (ถ้ายังอยู่ใน roster)
    let reviewerId = isBrief
      ? userId
      : globalReviewerId !== null && reviewerSet.has(globalReviewerId)
        ? globalReviewerId
        : null;
    let reviewer1bId = isBrief
      ? null
      : globalReviewer1bId !== null &&
          reviewerSet.has(globalReviewer1bId) &&
          globalReviewer1bId !== reviewerId
        ? globalReviewer1bId
        : null;
    // คนหลักใช้ไม่ได้ (ว่าง/หลุด roster) แต่คนที่ 2 ยังอยู่ — เลื่อนขึ้นเป็นคนหลัก
    if (reviewerId === null && reviewer1bId !== null) {
      reviewerId = reviewer1bId;
      reviewer1bId = null;
    }
    const reviewerPerson = reviewerId
      ? (profiles.find((p) => p.id === reviewerId) ?? null)
      : null;
    const reviewer1bPerson = reviewer1bId
      ? (profiles.find((p) => p.id === reviewer1bId) ?? null)
      : null;
    const assigneeId = isBrief ? null : userId;
    const assigneePerson = assigneeId
      ? (profiles.find((p) => p.id === assigneeId) ?? null)
      : null;
    const creatorPerson = userId
      ? (profiles.find((p) => p.id === userId) ?? null)
      : null;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: TaskWithAssignee = {
      id: tempId,
      title,
      description: null,
      status: "todo",
      priority: "medium",
      category: DEFAULT_TASK_CATEGORY,
      due_date: null,
      assignee_id: assigneeId,
      section_id: sectionId,
      completed: false,
      position,
      deliverable_url: null,
      deliverable_file_path: null,
      reviewer_id: reviewerId,
      reviewer1b_id: reviewer1bId,
      review_status: "none",
      reviewer2_id: null,
      review_step: 1,
      review1_approved_at: null,
      reviewer1_approved_at: null,
      reviewer1b_approved_at: null,
      review_submitted_at: null,
      influencer_id: null,
      approved_at: null,
      posted_at: null,
      posted_by: null,
      content_format: null,
      content_category_id: null,
      brief_content_type: null,
      brief_accepted_at: null,
      brief_source_id: null,
      deleted_at: null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee: assigneePerson,
      reviewer: reviewerPerson,
      reviewer1b: reviewer1bPerson,
      reviewer2: null,
      creator: creatorPerson,
      poster: null,
      influencer: null,
      files: [],
    };
    setItems((cur) => [...cur, optimistic]);

    const { data, error: e } = await supabase
      .from("tasks")
      .insert({
        title,
        section_id: sectionId,
        position,
        assignee_id: assigneeId,
        reviewer_id: reviewerId,
        reviewer1b_id: reviewer1bId,
        created_by: userId,
      })
      .select(TASK_SELECT)
      .single();

    if (e || !data) {
      setItems((cur) => cur.filter((t) => t.id !== tempId));
      showError(`เพิ่มงานไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    const real = data as unknown as TaskWithAssignee;
    setItems((cur) =>
      // realtime อาจเพิ่มแถวจริงเข้ามาก่อนคำตอบ insert ถึง — ตัด temp ทิ้งแทนการแทนที่ (กันการ์ดซ้ำ)
      cur.some((t) => t.id === real.id)
        ? cur.filter((t) => t.id !== tempId)
        : cur.map((t) => (t.id === tempId ? real : t))
    );
    setSelectedId((sel) => (sel === tempId ? real.id : sel));
  };

  /* ---------- Brief workflow ---------- */

  // เซคชันปลายทางของ "รับงาน" = เซคชันชนิด work อันแรก (ปกติคือ Creatives)
  const creativesSectionId = useMemo(() => {
    const work = sections
      .filter((s) => s.type === "work")
      .sort((a, b) => a.position - b.position);
    return work[0]?.id ?? sections[0]?.id ?? null;
  }, [sections]);

  /** เลือกชนิดงานของ brief (graphic/video) */
  const setBriefContentType = (task: TaskWithAssignee, type: string) => {
    if (task.brief_content_type === type) return;
    patchTask(task.id, { db: { brief_content_type: type } });
  };

  /** ผู้รับกด "รับงาน" — ปิด brief (รับแล้ว) + สร้างการ์ด creative ในเซคชัน Creatives ทันที */
  const acceptBrief = async (task: TaskWithAssignee) => {
    markServerStale(); // เขียน DB = cache ของหน้านี้เก่าแล้ว
    if (isTempId(task.id) || task.brief_accepted_at) return;
    if (!creativesSectionId) {
      showError("ยังไม่มีเซคชันชิ้นงาน (Creatives) สำหรับวางงานที่รับ");
      return;
    }
    // 1) ทำเครื่องหมายว่ารับแล้ว
    patchTask(task.id, {
      db: { brief_accepted_at: new Date().toISOString(), completed: true },
    });

    // 2) สร้างการ์ด creative (ผู้รับผิดชอบ = ผู้รับงาน, ผู้สร้างการ์ด = ผู้สั่ง brief)
    //    ผู้ตรวจ = ผู้ตรวจเริ่มต้นของทีม (คนใน "จัดการผู้ตรวจ") — ไม่ใช่ผู้สั่ง brief:
    //    ผู้สั่ง brief แค่ตรวจทาน/คุยในแชท แล้วเป็นคนกด "ส่งตรวจ" ให้ผู้ตรวจจริง
    const inSection = activeItems.filter(
      (t) => bucketOf(t) === creativesSectionId
    );
    const position =
      inSection.length === 0
        ? 1024
        : Math.min(...inSection.map((t) => t.position)) - 1;
    const briefCreatorPerson =
      task.creator ??
      (task.created_by
        ? (profiles.find((p) => p.id === task.created_by) ?? null)
        : null);
    let reviewerId =
      globalReviewerId !== null && reviewerSet.has(globalReviewerId)
        ? globalReviewerId
        : null;
    let reviewer1bId =
      globalReviewer1bId !== null &&
      reviewerSet.has(globalReviewer1bId) &&
      globalReviewer1bId !== reviewerId
        ? globalReviewer1bId
        : null;
    // คนหลักใช้ไม่ได้ (ว่าง/หลุด roster) แต่คนที่ 2 ยังอยู่ — เลื่อนขึ้นเป็นคนหลัก
    if (reviewerId === null && reviewer1bId !== null) {
      reviewerId = reviewer1bId;
      reviewer1bId = null;
    }
    const reviewerPerson = reviewerId
      ? (profiles.find((p) => p.id === reviewerId) ?? null)
      : null;
    const reviewer1bPerson = reviewer1bId
      ? (profiles.find((p) => p.id === reviewer1bId) ?? null)
      : null;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: TaskWithAssignee = {
      id: tempId,
      title: task.title,
      description: task.description,
      status: "todo",
      priority: "medium",
      category: task.category,
      due_date: null,
      assignee_id: task.assignee_id,
      section_id: creativesSectionId,
      completed: false,
      position,
      deliverable_url: null,
      deliverable_file_path: null,
      reviewer_id: reviewerId,
      reviewer1b_id: reviewer1bId,
      review_status: "none",
      reviewer2_id: null,
      review_step: 1,
      review1_approved_at: null,
      reviewer1_approved_at: null,
      reviewer1b_approved_at: null,
      review_submitted_at: null,
      influencer_id: task.influencer_id,
      approved_at: null,
      posted_at: null,
      posted_by: null,
      content_format: null,
      content_category_id: null,
      brief_content_type: task.brief_content_type,
      brief_accepted_at: null,
      brief_source_id: task.id,
      deleted_at: null,
      created_by: task.created_by ?? userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee: task.assignee ?? null,
      reviewer: reviewerPerson,
      reviewer1b: reviewer1bPerson,
      reviewer2: null,
      creator: briefCreatorPerson,
      poster: null,
      influencer: task.influencer ?? null,
      files: [],
    };
    setItems((cur) => [...cur, optimistic]);

    const { data, error: e } = await supabase
      .from("tasks")
      .insert({
        title: task.title,
        description: task.description,
        section_id: creativesSectionId,
        position,
        assignee_id: task.assignee_id,
        reviewer_id: reviewerId,
        reviewer1b_id: reviewer1bId,
        influencer_id: task.influencer_id,
        category: task.category,
        brief_content_type: task.brief_content_type,
        brief_source_id: task.id,
        created_by: task.created_by ?? userId,
      })
      .select(TASK_SELECT)
      .single();

    if (e || !data) {
      setItems((cur) => cur.filter((t) => t.id !== tempId));
      showError(`สร้างการ์ดชิ้นงานไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    const created = data as unknown as TaskWithAssignee;
    setItems((cur) =>
      // realtime อาจเพิ่มแถวจริงเข้ามาก่อนคำตอบ insert ถึง — ตัด temp ทิ้งแทนการแทนที่ (กันการ์ดซ้ำ)
      cur.some((t) => t.id === created.id)
        ? cur.filter((t) => t.id !== tempId)
        : cur.map((t) => (t.id === tempId ? created : t))
    );
    // บอกผู้สั่ง brief ว่ามีคนรับงานแล้ว
    notify(task, [{ recipient: task.created_by, type: "brief_accepted" }]);
  };

  /** ลบงาน = ย้ายไปถังขยะ (soft delete) — เก็บ 14 วัน กู้คืนได้จากแท็บ "ถังขยะ" */
  const requestDeleteTask = (task: TaskWithAssignee) => {
    if (isTempId(task.id)) return;
    setConfirm({
      title: "ย้ายไปถังขยะ",
      message: `ย้ายงาน "${task.title}" ไปถังขยะใช่หรือไม่? งานจะถูกเก็บไว้ ${TRASH_KEEP_DAYS} วัน กู้คืนได้จากแท็บ "ถังขยะ"`,
      onConfirm: () => {
        setSelectedId((sel) => (sel === task.id ? null : sel));
        patchTask(task.id, { db: { deleted_at: new Date().toISOString() } });
      },
    });
  };

  /** กู้งานคืนจากถังขยะ — กลับไปเซคชัน/สถานะเดิมทุกอย่าง */
  const restoreTask = (task: TaskWithAssignee) => {
    markServerStale(); // เขียน DB = cache ของหน้านี้เก่าแล้ว
    patchTask(task.id, { db: { deleted_at: null } });
  };

  /** เก็บกวาดไฟล์ของงานใน storage (best effort) — ไฟล์งาน tasks/{id}/,
      ไฟล์แนบคอมเมนต์ tasks/{id}/comments/ และไฟล์แนบงานย่อย tasks/{id}/subtasks/{subId}/ */
  const cleanupTaskStorage = async (taskId: string) => {
    const storage = supabase.storage.from(STORAGE_BUCKET_DOCUMENTS);
    try {
      const prefixes = [`tasks/${taskId}`, `tasks/${taskId}/comments`];
      // โฟลเดอร์งานย่อยซ้อนอีกชั้น — list หาโฟลเดอร์ subId ก่อน
      const { data: subDirs } = await storage.list(`tasks/${taskId}/subtasks`, {
        limit: 1000,
      });
      for (const dir of subDirs ?? []) {
        prefixes.push(`tasks/${taskId}/subtasks/${dir.name}`);
      }
      const paths: string[] = [];
      for (const prefix of prefixes) {
        const { data } = await storage.list(prefix, { limit: 1000 });
        for (const obj of data ?? []) {
          // list คืนทั้งไฟล์และโฟลเดอร์ — โฟลเดอร์ไม่มี id, remove ใช้ได้กับไฟล์เท่านั้น
          if (obj.id) paths.push(`${prefix}/${obj.name}`);
        }
      }
      if (paths.length > 0) await storage.remove(paths);
    } catch {
      // เพิกเฉย — แถว DB เป็นหลัก ไฟล์ตกค้างไม่กระทบการใช้งาน
    }
  };

  /** ลบถาวรจากถังขยะ (ย้อนกลับไม่ได้) — ลบแถว DB (cascade ตารางลูก) แล้วเก็บกวาดไฟล์ */
  const requestHardDeleteTask = (task: TaskWithAssignee) => {
    if (isTempId(task.id)) return;
    setConfirm({
      title: "ลบถาวร",
      message: `ลบงาน "${task.title}" ถาวรใช่หรือไม่? ไฟล์และความคิดเห็นทั้งหมดจะหายไป ย้อนกลับไม่ได้`,
      onConfirm: () => {
        setItems((cur) => cur.filter((t) => t.id !== task.id));
        void supabase
          .from("tasks")
          .delete()
          .eq("id", task.id)
          .then(({ error: e }) => {
            if (e) {
              // คืนเฉพาะแถวที่ลบ — ไม่ทับ state อื่นที่เปลี่ยนไประหว่างรอ
              setItems((cur) =>
                cur.some((t) => t.id === task.id) ? cur : [...cur, task]
              );
              showError(`ลบงานไม่สำเร็จ: ${e.message}`);
              return;
            }
            void cleanupTaskStorage(task.id);
          });
      },
    });
  };

  /* ---------- ถังขยะ: เก็บกวาดงานที่ค้างเกินกำหนด (ลบถาวรเงียบๆ ตอนเปิดหน้า) ---------- */

  useEffect(() => {
    const cutoff = new Date(
      Date.now() - TRASH_KEEP_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    void supabase
      .from("tasks")
      .select("id")
      .lt("deleted_at", cutoff)
      .then(async ({ data }) => {
        for (const row of data ?? []) {
          const { error: e } = await supabase
            .from("tasks")
            .delete()
            .eq("id", row.id);
          if (!e) {
            await cleanupTaskStorage(row.id);
            setItems((cur) => cur.filter((t) => t.id !== row.id));
          }
        }
      });
    // ทำครั้งเดียวตอนเปิดหน้า — cleanupTaskStorage เสถียรพอ ไม่ต้องเป็น dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* ---------- ลากการ์ด/เรียงเซคชันบนบอร์ด ---------- */

  /** ย้าย/เรียงการ์ด — position เป็น float กึ่งกลางเพื่อนบ้าน (กติกาเดิมของบอร์ด)
      คิดจากลิสต์เต็มของ section เสมอ: บอร์ดส่งเพื่อนบ้านเฉพาะที่มองเห็น (หลังกรอง)
      ถ้าคิดกึ่งกลางจากคู่ที่มองเห็น position อาจชนกับงานที่ถูกซ่อนแล้วลำดับเพี้ยน */
  const moveTask = (
    taskId: string,
    sectionId: string,
    prevId: string | null,
    nextId: string | null
  ) => {
    if (isTempId(sectionId)) return;
    const prev = prevId ? taskById.get(prevId) : null;
    const next = nextId ? taskById.get(nextId) : null;
    const full = activeItems
      .filter((t) => t.id !== taskId && bucketOf(t) === sectionId)
      .sort((a, b) => a.position - b.position);
    let position: number;
    if (prev) {
      // วางถัดจากเพื่อนบ้านบนที่มองเห็นทันที — เพื่อนบ้านล่างจริงคือแถวถัดไปในลิสต์เต็ม
      const i = full.findIndex((t) => t.id === prev.id);
      const after = i >= 0 ? full[i + 1] : undefined;
      position = after
        ? (prev.position + after.position) / 2
        : prev.position + 1;
    } else if (next) {
      const i = full.findIndex((t) => t.id === next.id);
      const before = i > 0 ? full[i - 1] : undefined;
      position = before
        ? (before.position + next.position) / 2
        : next.position - 1;
    } else {
      position =
        full.length > 0 ? Math.max(...full.map((t) => t.position)) + 1 : 1024;
    }
    patchTask(taskId, { db: { section_id: sectionId, position } });
  };

  /** ลากหัวคอลัมน์เพื่อเรียงเซคชัน — อัพเดตเฉพาะตัวที่ลาก (float กึ่งกลางเพื่อนบ้าน) */
  const reorderSections = (activeId: string, overId: string) => {
    markServerStale(); // เขียน DB = cache ของหน้านี้เก่าแล้ว
    if (isTempId(activeId) || isTempId(overId)) return;
    const from = sections.findIndex((s) => s.id === activeId);
    const to = sections.findIndex((s) => s.id === overId);
    if (from < 0 || to < 0 || from === to) return;

    const prevPosition = sections[from].position;
    const prevBeforeId = from > 0 ? sections[from - 1].id : null;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const idx = next.findIndex((s) => s.id === activeId);
    const before = next[idx - 1];
    const after = next[idx + 1];
    const position =
      before && after
        ? (before.position + after.position) / 2
        : before
          ? before.position + 1
          : after
            ? after.position - 1
            : 1;

    setSections(next.map((s) => (s.id === activeId ? { ...s, position } : s)));
    void supabase
      .from("task_sections")
      .update({ position })
      .eq("id", activeId)
      .then(({ error: e }) => {
        if (e) {
          // คืนเฉพาะคอลัมน์ที่ลาก (ทั้งค่า position และช่องใน array) —
          // ไม่ทับ rename/เพิ่ม/ลบเซคชันอื่นที่สำเร็จไประหว่างรอ
          setSections((cur) => {
            const dragged = cur.find((s) => s.id === activeId);
            if (!dragged) return cur;
            const rest = cur.filter((s) => s.id !== activeId);
            const at = prevBeforeId
              ? rest.findIndex((s) => s.id === prevBeforeId) + 1
              : 0;
            rest.splice(at < 0 ? 0 : at, 0, {
              ...dragged,
              position: prevPosition,
            });
            return rest;
          });
          showError(`เรียงเซคชันไม่สำเร็จ: ${e.message}`);
        }
      });
  };

  /* ---------- section mutations ---------- */

  const renameSection = (sectionId: string, name: string) => {
    markServerStale(); // เขียน DB = cache ของหน้านี้เก่าแล้ว
    if (isTempId(sectionId)) return;
    const prevName = sections.find((s) => s.id === sectionId)?.name;
    if (prevName === undefined || prevName === name) return;
    setSections((cur) =>
      cur.map((s) => (s.id === sectionId ? { ...s, name } : s))
    );
    void supabase
      .from("task_sections")
      .update({ name })
      .eq("id", sectionId)
      .then(({ error: e }) => {
        if (e) {
          setSections((cur) =>
            cur.map((s) => (s.id === sectionId ? { ...s, name: prevName } : s))
          );
          showError(`เปลี่ยนชื่อไม่สำเร็จ: ${e.message}`);
        }
      });
  };

  /** สลับชนิดเซคชัน work ↔ brief */
  const toggleSectionType = (sectionId: string) => {
    markServerStale(); // เขียน DB = cache ของหน้านี้เก่าแล้ว
    if (isTempId(sectionId)) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const next: "work" | "brief" = section.type === "brief" ? "work" : "brief";
    setSections((cur) =>
      cur.map((s) => (s.id === sectionId ? { ...s, type: next } : s))
    );
    void supabase
      .from("task_sections")
      .update({ type: next })
      .eq("id", sectionId)
      .then(({ error: e }) => {
        if (e) {
          setSections((cur) =>
            cur.map((s) =>
              s.id === sectionId ? { ...s, type: section.type } : s
            )
          );
          showError(`เปลี่ยนชนิดเซคชันไม่สำเร็จ: ${e.message}`);
        }
      });
  };

  const requestDeleteSection = (sectionId: string) => {
    if (isTempId(sectionId)) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const remaining = sections.filter((s) => s.id !== sectionId);
    if (remaining.length === 0) {
      showError("ต้องเหลืออย่างน้อย 1 เซคชัน");
      return;
    }
    // นับตามที่ตาเห็นจริง — รวมงานไร้ section ที่ถูกพักไว้คอลัมน์แรกด้วย
    const affected = activeItems.filter((t) => bucketOf(t) === sectionId);
    const target = remaining[0];

    const run = () => void doDeleteSection(section, target, affected);
    if (affected.length > 0) {
      setConfirm({
        title: "ลบเซคชัน",
        message: `เซคชัน "${section.name}" มีงาน ${affected.length} รายการ — งานทั้งหมดจะย้ายไป "${target.name}" แล้วลบเซคชันนี้ ใช่หรือไม่?`,
        onConfirm: run,
      });
    } else {
      run();
    }
  };

  const doDeleteSection = async (
    section: TaskSectionRow,
    target: TaskSectionRow,
    affected: TaskWithAssignee[]
  ) => {
    const index = sections.findIndex((s) => s.id === section.id);
    const wasFirst = index === 0;
    const originalSection = new Map(
      affected.map((t) => [t.id, t.section_id] as const)
    );

    setSections((cur) => cur.filter((s) => s.id !== section.id));
    setItems((cur) =>
      cur.map((t) =>
        originalSection.has(t.id) ? { ...t, section_id: target.id } : t
      )
    );

    const restoreSection = () =>
      setSections((cur) => {
        if (cur.some((s) => s.id === section.id)) return cur;
        const list = [...cur];
        list.splice(Math.min(index, list.length), 0, section);
        return list;
      });

    // ย้ายฝั่ง server เสมอ (no-op ถ้าไม่มีงาน) — กันงานที่เครื่องอื่นเพิ่งเพิ่มค้างอยู่จน FK ห้ามลบ
    let moveErr = (
      await supabase
        .from("tasks")
        .update({ section_id: target.id })
        .eq("section_id", section.id)
    ).error;
    if (!moveErr && wasFirst) {
      // งานไร้ section แสดงอยู่คอลัมน์แรก — ย้ายให้ตรงกับที่ผู้ใช้เห็น
      moveErr = (
        await supabase
          .from("tasks")
          .update({ section_id: target.id })
          .is("section_id", null)
      ).error;
    }
    if (moveErr) {
      setItems((cur) =>
        cur.map((t) =>
          originalSection.has(t.id)
            ? { ...t, section_id: originalSection.get(t.id) ?? null }
            : t
        )
      );
      restoreSection();
      showError(`ย้ายงานไม่สำเร็จ: ${moveErr.message}`);
      return;
    }

    const { error: delErr } = await supabase
      .from("task_sections")
      .delete()
      .eq("id", section.id);
    if (delErr) {
      // งานย้ายสำเร็จแล้ว (ตรงกับ DB) — คืนเฉพาะตัวเซคชัน
      restoreSection();
      showError(`ลบเซคชันไม่สำเร็จ: ${delErr.message}`);
    }
  };

  /* ---------- render ---------- */

  return (
    <div className="flex h-full min-h-0">
      {/* ฝั่งซ้าย: หัวข้อ + ตัวกรอง + บอร์ด — แผงรายละเอียดอยู่นอกคอลัมน์นี้จึงสูงเต็มจอ */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* ส่วนหัว + ตัวกรอง — ชิดซ้าย ให้พื้นที่ที่เหลือเป็นของบอร์ด */}
      <div className="shrink-0 px-3 pt-2 sm:px-6 lg:px-4 lg:pt-5">
        {/* หัวข้อหน้าเป็นของจอใหญ่เท่านั้น — บนมือถือแถบเมนูล่างไฮไลต์ "งาน" อยู่แล้ว
            และพื้นที่แนวตั้งมีค่ากว่า (บอร์ดในภาพที่ผู้ใช้ส่งมาเหลือที่นิดเดียว) */}
        <div className="mb-3 hidden animate-fade-in-up lg:block">
          <h1 className="text-xl font-semibold text-stone-900">Task</h1>
        </div>

        {/* แท็บเวอร์ชันมือถือ — grid 5 ช่องพอดีจอ ไม่ต้องเลื่อนแนวนอน */}
        <div className="mb-2 lg:hidden">
          <MobileTabs
            tab={tab}
            onChange={setTab}
            reviewCount={reviewQueue.length}
            postingCount={postQueue.length}
            approvedCount={approvedAll.length}
            trashCount={trashedItems.length}
            isAdmin={isAdmin}
            onManageReviewers={() => {
              setShow1bPicker(false);
              setReviewerModalOpen(true);
            }}
          />
        </div>

        {/* แท็บ: บันทึกงาน / รอฉันตรวจ — จอแคบเลื่อนแนวนอนได้ ไม่ดันตกบรรทัด */}
        <div className="mb-3 hidden gap-1 overflow-x-auto [scrollbar-width:none] lg:flex">
          <button
            type="button"
            onClick={() => setTab("work")}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === "work"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
            }`}
          >
            <ListTodo size={16} />
            บันทึกงาน
          </button>
          <button
            type="button"
            onClick={() => setTab("review")}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === "review"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
            }`}
          >
            <ClipboardCheck size={16} />
            รอตรวจ
            {reviewQueue.length > 0 && (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  tab === "review"
                    ? "bg-white/25 text-cream"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {reviewQueue.length}
              </span>
            )}
          </button>
          {/* รอโพส = คิวงานตรวจผ่านที่ยังไม่ได้โพส — badge นับตามตัวกรองที่เลือก (เริ่มต้น = ของฉัน) */}
          <button
            type="button"
            onClick={() => setTab("posting")}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === "posting"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
            }`}
          >
            <Send size={16} />
            รอโพส
            {postQueue.length > 0 && (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  tab === "posting"
                    ? "bg-white/25 text-cream"
                    : "bg-sky-100 text-sky-700"
                }`}
              >
                {postQueue.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("approved")}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === "approved"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
            }`}
          >
            <BadgeCheck size={16} />
            งานเสร็จ
            {approvedAll.length > 0 && (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  tab === "approved"
                    ? "bg-white/25 text-cream"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {approvedAll.length}
              </span>
            )}
          </button>
          {/* แท็บ "ผลวิเคราะห์" (คลังลิงก์ Canva) ถูกซ่อนเพื่อเร่ง v1.0 เมื่อ 2026-08-29
              ตามคำสั่งผู้ใช้ — ไม่เคยมีใครแปะลิงก์เลยสักอัน (analysis_links 0 แถว)
              โค้ด/ข้อมูล/ตารางยังอยู่ครบ (AnalysisList + query ใน page.tsx)
              เอากลับมาได้ด้วยการปลดคอมเมนต์ปุ่มนี้:
          <button
            type="button"
            onClick={() => setTab("analysis")}
            className={...}
          >
            <BarChart3 size={16} /> ผลวิเคราะห์
          </button> */}
          <button
            type="button"
            onClick={() => setTab("trash")}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === "trash"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
            }`}
          >
            <Trash2 size={16} />
            ถังขยะ
            {trashedItems.length > 0 && (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  tab === "trash"
                    ? "bg-white/25 text-cream"
                    : "bg-stone-200 text-stone-600"
                }`}
              >
                {trashedItems.length}
              </span>
            )}
          </button>
          {/* จัดการผู้ตรวจ = สิทธิ์ admin เท่านั้น */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setShow1bPicker(false);
                setReviewerModalOpen(true);
              }}
              title="เพิ่ม/ลบผู้ตรวจ และตั้งผู้ตรวจเริ่มต้นของทีม"
              className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:bg-white/70 hover:text-brand-700"
            >
              <UserCog size={16} />
              จัดการผู้ตรวจ
            </button>
          )}
        </div>

        {hasDemo && tab === "work" && <DemoBanner onWhat="งานบางส่วน" />}

        {loadError && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
            โหลดข้อมูลไม่สำเร็จ: {loadError} — ลองรีเฟรชหน้าอีกครั้ง
          </div>
        )}

        {/* มือถือ: แถวเดียว = ค้นหา + ปุ่มตัวกรอง (ที่เหลืออยู่ในชีตที่เลื่อนขึ้นจากขอบล่าง) */}
        {tab === "work" && (
          <div className="mb-2 space-y-1.5 lg:hidden">
            <MobileFilterBar
              search={search}
              onSearch={setSearch}
              placeholder="ค้นหางาน..."
              activeCount={workFilterCount}
              onOpen={() => setFilterSheet("work")}
            />
            {hiddenCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                  <EyeOff size={12} className="shrink-0" />
                  <span className="truncate">
                    แสดง {filtered.length} จาก {statusTotal} · ซ่อน{" "}
                    {hiddenCount}
                  </span>
                </span>
                {hasFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="shrink-0 cursor-pointer text-[11px] text-stone-400 underline underline-offset-2"
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "work" && (
        <div className="mb-3 hidden flex-wrap items-center gap-3 animate-fade-in-up lg:flex">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <Input
              type="search"
              placeholder="ค้นหางาน..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-48">
            <PersonSelect
              ariaLabel="กรองตามผู้รับผิดชอบ"
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={[
                { value: "all", label: "ผู้รับผิดชอบ: ทั้งหมด" },
                ...(userId !== null
                  ? [
                      // เกี่ยวข้องกับฉัน = ฉันรับผิดชอบ/ถูกมอบหมาย หรือฉันสั่งงาน (default)
                      {
                        value: "involved",
                        label: "เกี่ยวข้องกับฉัน",
                        profile: meProfile,
                      },
                      { value: "me", label: "งานของฉัน", profile: meProfile },
                    ]
                  : []),
                { value: "none", label: "ไม่ระบุ", profile: null },
                ...profiles
                  .filter((p) => p.id !== userId)
                  .map((p) => ({ value: p.id, profile: p })),
              ]}
            />
          </div>
          <div className="w-40">
            <Select
              aria-label="กรองตามสถานะ"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">สถานะ: ทั้งหมด ({statusCounts.all})</option>
              <option value="working">กำลังทำ ({statusCounts.working})</option>
              <option value="pending">รอตรวจ ({statusCounts.pending})</option>
              <option value="done">เสร็จสมบูรณ์ ({statusCounts.done})</option>
            </Select>
          </div>
          <ExcludeFilter
            profiles={profiles}
            userId={userId}
            excludeAssignees={excludeAssignees}
            excludeStatuses={excludeStatuses}
            onToggleAssignee={toggleExcludeAssignee}
            onToggleStatus={toggleExcludeStatus}
            onClear={clearExclude}
          />
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <span>กำหนดส่ง</span>
            <Input
              type="date"
              aria-label="กำหนดส่งตั้งแต่วันที่"
              value={dueFrom}
              onChange={(e) => setDueFrom(e.target.value)}
              className="!w-36 !py-1.5 !text-xs"
            />
            <span>ถึง</span>
            <Input
              type="date"
              aria-label="กำหนดส่งถึงวันที่"
              value={dueTo}
              onChange={(e) => setDueTo(e.target.value)}
              className="!w-36 !py-1.5 !text-xs"
            />
          </div>
          {/* บอกตรงๆ ว่าตัวกรองซ่อนงานไว้กี่งาน — default ("เกี่ยวข้องกับฉัน" + ยกเว้นงานเสร็จ)
              เคยทำให้เข้าใจผิดว่างานหายไปจากระบบ */}
          {hiddenCount > 0 && (
            <span
              title="ตัวกรองที่ตั้งไว้ซ่อนงานบางส่วนอยู่ — กด 'ล้างตัวกรอง' เพื่อดูทั้งหมด"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700"
            >
              <EyeOff size={13} />
              แสดง {filtered.length} จาก {statusTotal} · ซ่อนอยู่ {hiddenCount}
            </span>
          )}
          {hasFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
            >
              <X size={14} />
              ล้างตัวกรอง
            </button>
          )}
        </div>
        )}

        {tab === "posting" && (
          <div className="mb-3 flex flex-wrap items-center gap-3 animate-fade-in-up">
            <div className="w-full sm:w-56">
              <PersonSelect
                ariaLabel="กรองคิวรอโพสตามคนที่ต้องโพส"
                value={pqAssignee}
                onChange={setPqAssignee}
                options={[
                  { value: "all", label: "รอโพส: ทั้งทีม" },
                  ...(userId !== null
                    ? [
                        {
                          value: "me",
                          label: "รอโพสของฉัน",
                          profile: meProfile,
                        },
                      ]
                    : []),
                  { value: "none", label: "ไม่รู้ว่าใครต้องโพส", profile: null },
                  ...profiles
                    .filter((p) => p.id !== userId)
                    .map((p) => ({ value: p.id, profile: p })),
                ]}
              />
            </div>
            {/* กรองอยู่ก็ยังต้องรู้ว่าทั้งทีมค้างเท่าไร — กดแล้วสลับไปดูทั้งหมดได้เลย */}
            {pqAssignee !== "all" && postQueueAll.length > postQueue.length && (
              <button
                type="button"
                onClick={() => setPqAssignee("all")}
                className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
              >
                <Send size={14} />
                ทั้งทีมค้างโพส {postQueueAll.length} งาน — ดูทั้งหมด
              </button>
            )}
          </div>
        )}

        {tab === "approved" && (
          <div className="mb-2 lg:hidden">
            <MobileFilterBar
              search={apSearch}
              onSearch={setApSearch}
              placeholder="ค้นหางานที่ตรวจแล้ว..."
              activeCount={apFilterCount}
              onOpen={() => setFilterSheet("approved")}
            />
          </div>
        )}

        {tab === "approved" && (
          <div className="mb-3 hidden flex-wrap items-center gap-3 animate-fade-in-up lg:flex">
            <div className="relative min-w-56 flex-1 sm:max-w-xs">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <Input
                type="search"
                placeholder="ค้นหางานที่ตรวจแล้ว..."
                className="pl-9"
                value={apSearch}
                onChange={(e) => setApSearch(e.target.value)}
              />
            </div>
            <div className="w-48">
              <PersonSelect
                ariaLabel="กรองตามผู้รับผิดชอบ"
                value={apAssignee}
                onChange={setApAssignee}
                options={[
                  { value: "all", label: "ผู้รับผิดชอบ: ทั้งหมด" },
                  ...(userId !== null
                    ? [{ value: "me", label: "งานของฉัน", profile: meProfile }]
                    : []),
                  { value: "none", label: "ไม่ระบุ", profile: null },
                  ...profiles
                    .filter((p) => p.id !== userId)
                    .map((p) => ({ value: p.id, profile: p })),
                ]}
              />
            </div>
            <div className="w-48">
              <PersonSelect
                ariaLabel="กรองตามผู้ตรวจ"
                value={apReviewer}
                onChange={setApReviewer}
                options={[
                  { value: "all", label: "ผู้ตรวจ: ทั้งหมด" },
                  ...(userId !== null
                    ? [
                        {
                          value: "me",
                          label: "ฉันเป็นผู้ตรวจ",
                          profile: meProfile,
                        },
                      ]
                    : []),
                  ...apReviewerOptions
                    .filter((p) => p.id !== userId)
                    .map((p) => ({ value: p.id, profile: p })),
                ]}
              />
            </div>
            <div className="w-40">
              <Select
                aria-label="กรองตามสถานะการโพส"
                value={apPosted}
                onChange={(e) => setApPosted(e.target.value)}
              >
                <option value="all">การใช้งาน: ทั้งหมด</option>
                <option value="unposted">ยังไม่ได้โพส</option>
                <option value="posted">โพส/ใช้แล้ว</option>
              </Select>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <span>ตรวจผ่านตั้งแต่</span>
              <Input
                type="date"
                aria-label="ตรวจผ่านตั้งแต่วันที่"
                value={apFrom}
                onChange={(e) => setApFrom(e.target.value)}
                className="!w-36 !py-1.5 !text-xs"
              />
              <span>ถึง</span>
              <Input
                type="date"
                aria-label="ตรวจผ่านถึงวันที่"
                value={apTo}
                onChange={(e) => setApTo(e.target.value)}
                className="!w-36 !py-1.5 !text-xs"
              />
            </div>
            {hasApFilter && (
              <button
                type="button"
                onClick={clearApFilters}
                className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
              >
                <X size={14} />
                ล้างตัวกรอง
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
            {error}
          </div>
        )}
      </div>

      {/* เนื้อหา — บอร์ดเลื่อนได้ทั้งแนวนอน+แนวตั้งทั้งจอ (คอลัมน์ไม่ scroll ในตัวเอง), แท็บรอตรวจ scroll แนวตั้ง */}
      <div
        className={`min-h-0 flex-1 ${
          tab === "work"
            ? // มือถือ: บอร์ดปาดข้างคุม scroll ในตัวเอง (overflow-hidden) / จอใหญ่: เลื่อนทั้งบอร์ดเหมือนเดิม
              "overflow-hidden lg:overflow-auto"
            : "overflow-y-auto"
        }`}
      >
        {tab === "work" ? (
          <>
            {/* lg:contents = ตัว wrapper หายไปจาก layout ตอนจอใหญ่ ทำให้ KanbanBoard
                ยังเป็นลูกโดยตรงของกล่อง scroll (min-h-full ของบอร์ดจึงยังอ้างอิงถูกตัว) */}
            <div className="hidden lg:contents">
              <KanbanBoard
                sections={sections}
                tasksBySection={tasksBySection}
                taskById={taskById}
                today={today}
                selectedId={selectedId}
                profiles={profiles}
                onAssign={assignTask}
                onMoveTask={moveTask}
                onReorderSections={reorderSections}
                onCardClick={(t) => setSelectedId(t.id)}
                onQuickAdd={(sectionId, title, placement) =>
                  void quickAdd(sectionId, title, placement)
                }
                onRenameSection={renameSection}
                onToggleSectionType={toggleSectionType}
                onDeleteSection={requestDeleteSection}
              />
            </div>
            <div className="h-full lg:hidden">
              <MobileBoard
                sections={sections}
                tasksBySection={tasksBySection}
                today={today}
                selectedId={selectedId}
                onCardClick={(t) => setSelectedId(t.id)}
                onQuickAdd={(sectionId, title, placement) =>
                  void quickAdd(sectionId, title, placement)
                }
              />
            </div>
          </>
        ) : tab === "review" ? (
          <>
            <div className="hidden lg:contents">
              <ReviewList
                queue={reviewQueue}
                teamPending={teamPendingReview}
                sections={sections}
                today={today}
                userId={userId}
                selectedId={selectedId}
                onRowClick={(t) => setSelectedId(t.id)}
                onApprove={approveTask}
                onApproveBypass={requestApproveBypass}
                onReject={requestReject}
              />
            </div>
            {/* มือถือ: การ์ดโปสเตอร์ชุดเดียวกับบอร์ด — ปุ่มอนุมัติ/ตีกลับอยู่บนสุด
                ของชีตรายละเอียดที่เลื่อนขึ้นมาตอนกดการ์ด (ไม่มีปุ่มบนการ์ด) */}
            <div className="lg:hidden">
              <MobileReviewList
                queue={reviewQueue}
                teamPending={teamPendingReview}
                userId={userId}
                today={today}
                selectedId={selectedId}
                onRowClick={(t) => setSelectedId(t.id)}
              />
            </div>
          </>
        ) : tab === "posting" ? (
          <PostingList
            tasks={postQueue}
            totalPending={postQueueAll.length}
            sections={sections}
            contentCategories={contentCategories}
            selectedId={selectedId}
            onRowClick={(t) => setSelectedId(t.id)}
            onMarkPosted={togglePosted}
          />
        ) : tab === "approved" ? (
          <ApprovedList
            tasks={approvedFiltered}
            totalApproved={approvedAll.length}
            sections={sections}
            today={today}
            selectedId={selectedId}
            onRowClick={(t) => setSelectedId(t.id)}
            onTogglePosted={togglePosted}
          />
        ) : tab === "analysis" ? (
          <AnalysisList
            initialItems={analysisLinks}
            isAdmin={isAdmin}
            userId={userId}
          />
        ) : (
          <TrashList
            tasks={trashedItems}
            sections={sections}
            onRestore={restoreTask}
            onHardDelete={requestHardDeleteTask}
          />
        )}
      </div>
      </div>

      {/* แผงรายละเอียด — สูงเต็มจอชนขอบบน */}
      {selectedTask && (
        <TaskPanel
          key={selectedTask.id}
          task={selectedTask}
          section={
            selectedTask.section_id
              ? (sections.find((s) => s.id === selectedTask.section_id) ?? null)
              : null
          }
          profiles={profiles}
          reviewerProfiles={reviewerProfiles}
          teamReviewer2={
            globalReviewer2Id !== null && reviewerSet.has(globalReviewer2Id)
              ? (profiles.find((p) => p.id === globalReviewer2Id) ?? null)
              : null
          }
          influencers={influencers}
          categories={categories}
          contentCategories={contentCategories}
          briefSource={briefSource}
          linkedCreatives={linkedCreatives}
          onNavigateToTask={navigateToTask}
          onAddCategory={addCategory}
          userId={userId}
          suspendEsc={
            confirm !== null ||
            reviewerModalOpen ||
            rejectTarget !== null ||
            postTarget !== null ||
            filterSheet !== null
          }
          onPatch={patchTask}
          onAssign={assignTask}
          onDelete={requestDeleteTask}
          onClose={() => setSelectedId(null)}
          onSubmitReview={submitForReview}
          onCancelReview={cancelReview}
          onApprove={approveTask}
          onApproveBypass={requestApproveBypass}
          onReject={requestReject}
          onReopen={reopenTask}
          onSetReviewer={setReviewer}
          onSetReviewer1b={setReviewer1b}
          onSetInfluencer={setInfluencer}
          onAcceptBrief={acceptBrief}
          onSetBriefContentType={setBriefContentType}
        />
      )}

      {/* ชีตตัวกรองของมือถือ — เลื่อนขึ้นมาจากขอบล่าง (Modal ของระบบเป็น bottom sheet ที่ <sm) */}
      <MobileWorkFilterSheet
        open={filterSheet === "work"}
        onClose={() => setFilterSheet(null)}
        profiles={profiles}
        userId={userId}
        meProfile={meProfile}
        assigneeFilter={assigneeFilter}
        onAssigneeFilter={setAssigneeFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        statusCounts={statusCounts}
        dueFrom={dueFrom}
        dueTo={dueTo}
        onDueFrom={setDueFrom}
        onDueTo={setDueTo}
        excludeAssignees={excludeAssignees}
        excludeStatuses={excludeStatuses}
        onToggleExcludeAssignee={toggleExcludeAssignee}
        onToggleExcludeStatus={toggleExcludeStatus}
        hasFilter={hasFilter}
        onClear={clearFilters}
        resultCount={filtered.length}
      />
      <MobileApprovedFilterSheet
        open={filterSheet === "approved"}
        onClose={() => setFilterSheet(null)}
        profiles={profiles}
        reviewerOptions={apReviewerOptions}
        userId={userId}
        meProfile={meProfile}
        assignee={apAssignee}
        onAssignee={setApAssignee}
        reviewer={apReviewer}
        onReviewer={setApReviewer}
        posted={apPosted}
        onPosted={setApPosted}
        from={apFrom}
        to={apTo}
        onFrom={setApFrom}
        onTo={setApTo}
        hasFilter={hasApFilter}
        onClear={clearApFilters}
        resultCount={approvedFiltered.length}
      />

      {/* จัดการผู้ตรวจ: เพิ่ม/ลบ roster + ตั้งผู้ตรวจอัตโนมัติของฉัน */}
      <Modal
        open={reviewerModalOpen}
        onClose={() => setReviewerModalOpen(false)}
        title="จัดการผู้ตรวจงาน"
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-stone-700">
              รายชื่อผู้ตรวจ
            </p>
            <p className="mb-2 mt-0.5 text-xs text-stone-400">
              เฉพาะคนที่อยู่ในรายชื่อนี้จะถูกเลือกเป็น
              &quot;ผู้ตรวจงาน&quot; ได้ — งานเดิมที่ตรวจอยู่ไม่ถูกกระทบ
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {profiles.map((p) => {
                const isReviewer = reviewerSet.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                      isReviewer
                        ? "border-brand-200 bg-brand-50/60"
                        : "border-stone-200/80 bg-white/80"
                    }`}
                  >
                    <AssigneeAvatar assignee={p} />
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                      {profileName(p)}
                      {p.id === userId && (
                        <span className="ml-1.5 text-xs text-stone-400">
                          (ฉัน)
                        </span>
                      )}
                    </span>
                    {isReviewer ? (
                      <button
                        type="button"
                        onClick={() => void removeReviewer(p.id)}
                        className="shrink-0 cursor-pointer rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 active:scale-95"
                      >
                        เอาออก
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void addReviewer(p.id)}
                        className="shrink-0 cursor-pointer rounded-md border border-brand-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 active:scale-95"
                      >
                        เพิ่มเป็นผู้ตรวจ
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-stone-100 pt-4">
            <label
              htmlFor="default-reviewer"
              className="text-sm font-medium text-stone-700"
            >
              ผู้ตรวจลำดับ 1 — ผู้ตรวจเริ่มต้น (ใช้กับทุกคน)
            </label>
            <p className="mb-2 mt-0.5 text-xs text-stone-400">
              เวลาใครก็ตามสร้างงานใหม่ ระบบจะเลือกคนนี้เป็นผู้ตรวจงานให้ทันที
              — ตั้งได้ 2 คน (กด &quot;+ เพิ่มอีกคน&quot; ด้านล่าง)
              งานต้องผ่านการอนุมัติครบทั้งสองคน จึงถือว่าผ่านลำดับ 1
              (ตั้งได้เฉพาะ admin — เปลี่ยนผู้ตรวจของแต่ละงานได้ในแผงรายละเอียด)
            </p>
            <PersonSelect
              id="default-reviewer"
              value={globalReviewerId ?? ""}
              onChange={(v) => void saveDefaultReviewer(v === "" ? null : v)}
              options={[
                { value: "", label: "ไม่ตั้งอัตโนมัติ (เลือกเองทุกครั้ง)" },
                ...reviewerProfiles
                  .filter((p) => p.id !== globalReviewer1bId)
                  .map((p) => ({ value: p.id, profile: p })),
              ]}
            />
            {globalReviewerId !== null &&
              !reviewerSet.has(globalReviewerId) && (
                <p className="mt-1.5 text-xs text-amber-600">
                  ผู้ตรวจเริ่มต้นที่ตั้งไว้ถูกเอาออกจากรายชื่อผู้ตรวจแล้ว —
                  ระบบจะไม่เลือกให้จนกว่าจะตั้งใหม่
                </p>
              )}

            {/* ผู้ตรวจลำดับ 1 คนที่ 2 (ผู้ตรวจร่วม) — ทอดแรกต้องอนุมัติครบทั้งสองคน */}
            {globalReviewer1bId !== null || show1bPicker ? (
              <div className="mt-3">
                <label
                  htmlFor="default-reviewer1b"
                  className="text-xs font-medium text-stone-600"
                >
                  คนที่ 2 (ต้องอนุมัติครบทั้งคู่ งานจึงผ่านลำดับ 1)
                </label>
                <div className="mt-1">
                  <PersonSelect
                    id="default-reviewer1b"
                    value={globalReviewer1bId ?? ""}
                    onChange={(v) => {
                      if (v === "") setShow1bPicker(false);
                      void saveDefaultReviewer1b(v === "" ? null : v);
                    }}
                    options={[
                      { value: "", label: "ไม่ใช้ (ตรวจคนเดียว)" },
                      ...reviewerProfiles
                        .filter((p) => p.id !== globalReviewerId)
                        .map((p) => ({ value: p.id, profile: p })),
                    ]}
                  />
                </div>
                {globalReviewer1bId !== null &&
                  !reviewerSet.has(globalReviewer1bId) && (
                    <p className="mt-1.5 text-xs text-amber-600">
                      ผู้ตรวจคนที่ 2 ที่ตั้งไว้ถูกเอาออกจากรายชื่อผู้ตรวจแล้ว —
                      งานใหม่จะไม่ใส่ให้จนกว่าจะตั้งใหม่
                    </p>
                  )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShow1bPicker(true)}
                className="mt-2 cursor-pointer text-xs font-medium text-brand-700 hover:underline"
              >
                + เพิ่มผู้ตรวจลำดับ 1 อีกคน (ช่วยกันตรวจ)
              </button>
            )}
          </div>

          <div className="border-t border-stone-100 pt-4">
            <label
              htmlFor="default-reviewer2"
              className="text-sm font-medium text-stone-700"
            >
              ผู้ตรวจลำดับ 2 — อนุมัติขั้นสุดท้าย (ไม่บังคับ)
            </label>
            <p className="mb-2 mt-0.5 text-xs text-stone-400">
              ถ้าตั้งไว้ การตรวจจะเป็นทอด: ผู้ตรวจลำดับ 1 อนุมัติครบทุกคนแล้ว
              งานจะถูกส่งต่อให้คนนี้ตรวจอีกชั้นเป็นขั้นสุดท้าย
              (เว้นว่าง = ตรวจชั้นเดียวแบบเดิม)
            </p>
            <PersonSelect
              id="default-reviewer2"
              value={globalReviewer2Id ?? ""}
              onChange={(v) => void saveDefaultReviewer2(v === "" ? null : v)}
              options={[
                { value: "", label: "ไม่ใช้ (ตรวจชั้นเดียว)" },
                ...reviewerProfiles.map((p) => ({ value: p.id, profile: p })),
              ]}
            />
            {globalReviewer2Id !== null &&
              !reviewerSet.has(globalReviewer2Id) && (
                <p className="mt-1.5 text-xs text-amber-600">
                  ผู้ตรวจลำดับ 2 ที่ตั้งไว้ถูกเอาออกจากรายชื่อผู้ตรวจแล้ว —
                  งานที่ส่งตรวจหลังจากนี้จะตรวจชั้นเดียวจนกว่าจะตั้งใหม่
                </p>
              )}
            {globalReviewer2Id !== null &&
              globalReviewer2Id === globalReviewerId && (
                <p className="mt-1.5 text-xs text-amber-600">
                  ลำดับ 2 เป็นคนเดียวกับลำดับ 1 —
                  ระบบจะตรวจชั้นเดียว (ไม่ส่งซ้ำให้คนเดิม)
                </p>
              )}
          </div>
        </div>
      </Modal>

      {/* ตีกลับงาน: เลือกประเภท + ระบุสิ่งที่ต้องแก้ (ไม่บังคับ) → งานกลับไป "กำลังทำ"
          ทั้งสองประเภท ต่างกันแค่ "คำผิด" นับเป็นข้อผิดพลาดใน KPI ส่วน "เพิ่มเติม" ไม่นับ */}
      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="ตีกลับงานให้แก้ไข"
      >
        <p className="text-sm leading-6 text-stone-600">
          งาน &quot;
          <span className="font-medium text-stone-800">
            {rejectTarget?.title}
          </span>
          &quot; จะถูกส่งกลับให้{" "}
          <span className="font-medium text-stone-800">
            {rejectTarget?.assignee
              ? profileName(rejectTarget.assignee)
              : "ผู้รับผิดชอบ"}
          </span>{" "}
          แก้ไข
        </p>
        <div className="mt-4">
          <Label htmlFor="reject-kind">ประเภทการตีกลับ</Label>
          <div id="reject-kind" className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {REVISION_KIND_ORDER.map((k) => {
              const meta = REVISION_KINDS[k];
              const active = rejectKind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRejectKind(k)}
                  className={`cursor-pointer rounded-xl border p-3 text-left transition-all active:scale-[0.99] ${
                    active
                      ? "border-brand-400 bg-brand-50/70 shadow-sm"
                      : "border-stone-200 bg-white/60 hover:border-stone-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${meta.dot} ${
                        active ? "" : "opacity-40"
                      }`}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        active ? "text-brand-800" : "text-stone-700"
                      }`}
                    >
                      {meta.label}
                    </span>
                    {meta.countsAsError && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                        นับ KPI
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-stone-500">
                    {meta.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="reject-reason">สิ่งที่ต้องแก้ไข / เหตุผล (ไม่บังคับ)</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="ระบุสิ่งที่ต้องแก้ไข เพื่อให้ผู้รับผิดชอบเห็นในความคิดเห็น..."
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectTarget(null)}>
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            loading={rejecting}
            onClick={() => void confirmReject()}
          >
            ตีกลับ ({REVISION_KINDS[rejectKind].label})
          </Button>
        </div>
      </Modal>

      {/* ยืนยันโพส + ติดประเภทชิ้นงาน — เปิดเมื่อกด "โพสแล้ว" กับงานที่ระบุประเภทไม่ครบ
          (จุดเก็บข้อมูล KPI คอนเทนต์: **บังคับทั้งภาพ/วิดีโอ และหมวดเนื้อหา** ตั้งแต่ 2026-08-29) */}
      <Modal
        open={postTarget !== null}
        onClose={() => setPostTarget(null)}
        title="โพสแล้ว — ชิ้นงานนี้เป็นประเภทไหน?"
      >
        <p className="text-sm leading-6 text-stone-600">
          งาน &quot;
          <span className="font-medium text-stone-800">
            {postTarget?.title}
          </span>
          &quot; ยังระบุประเภทไม่ครบ — เลือกทั้งประเภทชิ้นงานและหมวดเนื้อหา
          ก่อนบันทึกโพส เพื่อให้นับเข้า KPI คอนเทนต์ได้
        </p>
        <div className="mt-4">
          <Label htmlFor="post-format">ประเภทชิ้นงาน</Label>
          <div id="post-format" className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {CONTENT_FORMAT_ORDER.map((f) => {
              const meta = CONTENT_FORMATS[f];
              const active = postFormat === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPostFormat(f)}
                  className={`cursor-pointer rounded-xl border p-3 text-left transition-all active:scale-[0.99] ${
                    active
                      ? "border-brand-400 bg-brand-50/70 shadow-sm"
                      : "border-stone-200 bg-white/60 hover:border-stone-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${meta.dot} ${
                        active ? "" : "opacity-40"
                      }`}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        active ? "text-brand-800" : "text-stone-700"
                      }`}
                    >
                      {meta.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="post-category">หมวดเนื้อหา</Label>
          <Select
            id="post-category"
            value={postCategoryId}
            onChange={(e) => setPostCategoryId(e.target.value)}
          >
            <option value="">เลือกหมวด...</option>
            {contentCategories
              .filter((c) => c.active || c.id === postCategoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
          <p className="mt-1 text-xs text-stone-400">
            เช่น สวย / หมอ / Before-After — ใช้ตั้งเป้า KPI แบบเจาะหมวด
            (เพิ่มหมวดใหม่ได้ที่หน้า &quot;ตั้งค่า KPI&quot;)
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPostTarget(null)}>
            ยกเลิก
          </Button>
          <Button
            disabled={
              postFormat === null ||
              (postCategoryId === "" &&
                contentCategories.some((c) => c.active))
            }
            onClick={confirmMarkPosted}
          >
            บันทึกโพสแล้ว
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        confirmVariant={confirm?.confirmVariant}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
