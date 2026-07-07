"use client";

import {
  BadgeCheck,
  ClipboardCheck,
  ListTodo,
  Search,
  UserCog,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DemoBanner } from "@/components/demo-badge";
import { ConfirmDialog, Input, Modal, Select } from "@/components/ui";
import {
  DEFAULT_TASK_CATEGORY,
  STORAGE_BUCKET_DOCUMENTS,
} from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluencerLite,
  ProfileRow,
  TaskSectionRow,
  TaskWithAssignee,
} from "@/lib/types";
import { ApprovedList } from "./approved-list";
import { KanbanBoard, type QuickAddPlacement } from "./board";
import { ReviewList } from "./review-list";
import { AssigneeAvatar, isTempId, profileName } from "./task-card";
import { TaskPanel, type TaskPatch } from "./task-panel";

type ProfileOption = Pick<ProfileRow, "id" | "full_name" | "email">;
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

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

export function TasksClient({
  sections: initialSections,
  tasks,
  profiles,
  influencers,
  reviewerIds,
  userId,
  loadError,
}: {
  sections: TaskSectionRow[];
  tasks: TaskWithAssignee[];
  profiles: ProfileWithDefault[];
  influencers: InfluencerLite[];
  reviewerIds: string[];
  userId: string | null;
  loadError: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  // state ฝั่งจอเป็นแหล่งความจริงระหว่างใช้งาน — ทุกการแก้ไข optimistic ทันที
  const [items, setItems] = useState<TaskWithAssignee[]>(tasks);
  const [sections, setSections] = useState<TaskSectionRow[]>(initialSections);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"work" | "review" | "approved">("work");
  useEffect(() => setItems(tasks), [tasks]);
  useEffect(() => setSections(initialSections), [initialSections]);

  /* ---------- roster ผู้ตรวจ + ผู้ตรวจอัตโนมัติของฉัน ---------- */

  const [reviewerSet, setReviewerSet] = useState<Set<string>>(
    () => new Set(reviewerIds)
  );
  useEffect(() => setReviewerSet(new Set(reviewerIds)), [reviewerIds]);
  const [reviewerModalOpen, setReviewerModalOpen] = useState(false);

  /** คนที่เลือกเป็นผู้ตรวจงานได้ (ตามลำดับชื่อจาก profiles) */
  const reviewerProfiles = useMemo(
    () => profiles.filter((p) => reviewerSet.has(p.id)),
    [profiles, reviewerSet]
  );

  const myProfile = useMemo(
    () => profiles.find((p) => p.id === userId) ?? null,
    [profiles, userId]
  );
  const [myDefaultReviewerId, setMyDefaultReviewerId] = useState<string | null>(
    myProfile?.default_reviewer_id ?? null
  );
  useEffect(
    () => setMyDefaultReviewerId(myProfile?.default_reviewer_id ?? null),
    [myProfile?.default_reviewer_id]
  );

  // งานที่ฉันเป็นผู้ตรวจและกำลังรอตรวจ — โชว์เลขบนแท็บ
  const reviewQueue = useMemo(
    () =>
      userId === null
        ? []
        : items.filter(
            (t) => t.reviewer_id === userId && t.review_status === "pending"
          ),
    [items, userId]
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
    }
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
    }
  };

  /** ตั้ง/ยกเลิกผู้ตรวจอัตโนมัติของฉัน — บันทึกลงโปรไฟล์ตัวเอง */
  const saveDefaultReviewer = async (id: string | null) => {
    if (userId === null) return;
    const prev = myDefaultReviewerId;
    setMyDefaultReviewerId(id);
    const { error: e } = await supabase
      .from("profiles")
      .update({ default_reviewer_id: id })
      .eq("id", userId);
    if (e) {
      setMyDefaultReviewerId(prev);
      showError(`บันทึกผู้ตรวจอัตโนมัติไม่สำเร็จ: ${e.message}`);
    }
  };

  /* ---------- filters ---------- */

  const [search, setSearch] = useState("");
  /** all | me | none | <profileId> */
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  /** all | pending | done */
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");

  const hasFilter =
    search.trim() !== "" ||
    assigneeFilter !== "all" ||
    statusFilter !== "all" ||
    dueFrom !== "" ||
    dueTo !== "";

  const clearFilters = () => {
    setSearch("");
    setAssigneeFilter("all");
    setStatusFilter("all");
    setDueFrom("");
    setDueTo("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (statusFilter === "working" && t.review_status !== "none") return false;
      if (statusFilter === "pending" && t.review_status !== "pending")
        return false;
      if (statusFilter === "done" && !t.completed) return false;
      if (assigneeFilter === "me") {
        if (userId === null || t.assignee_id !== userId) return false;
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
  }, [items, search, assigneeFilter, statusFilter, dueFrom, dueTo, userId]);

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

  /* ---------- แท็บ "ตรวจแล้ว" + ตัวกรองของแท็บ ---------- */

  const [apSearch, setApSearch] = useState("");
  /** all | me | none | <profileId> */
  const [apAssignee, setApAssignee] = useState<string>("all");
  /** all | me | <profileId> */
  const [apReviewer, setApReviewer] = useState<string>("all");
  const [apFrom, setApFrom] = useState("");
  const [apTo, setApTo] = useState("");

  const hasApFilter =
    apSearch.trim() !== "" ||
    apAssignee !== "all" ||
    apReviewer !== "all" ||
    apFrom !== "" ||
    apTo !== "";

  const clearApFilters = () => {
    setApSearch("");
    setApAssignee("all");
    setApReviewer("all");
    setApFrom("");
    setApTo("");
  };

  const approvedAll = useMemo(
    () => items.filter((t) => t.review_status === "approved"),
    [items]
  );

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
        if (apReviewer === "me") {
          if (userId === null || t.reviewer_id !== userId) return false;
        } else if (apReviewer !== "all" && t.reviewer_id !== apReviewer) {
          return false;
        }
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
  }, [approvedAll, apSearch, apAssignee, apReviewer, apFrom, apTo, userId]);

  /** ตัวเลือกกรองผู้ตรวจ = roster ปัจจุบัน + คนที่เคยตรวจงานใน "ตรวจแล้ว" แม้ถูกถอดจาก roster ไปแล้ว */
  const apReviewerOptions = useMemo(() => {
    const seen = new Map<string, ProfileOption>(
      reviewerProfiles.map((p) => [p.id, p] as const)
    );
    for (const t of approvedAll) {
      if (t.reviewer && !seen.has(t.reviewer.id)) {
        seen.set(t.reviewer.id, t.reviewer);
      }
    }
    return [...seen.values()];
  }, [reviewerProfiles, approvedAll]);

  const hasDemo = items.some((t) => t.description === "demo");
  const today = todayISO();
  const selectedTask = selectedId ? (taskById.get(selectedId) ?? null) : null;

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
        }
      });
  };

  /* ---------- review workflow ---------- */

  /** ส่งตรวจงาน → รอตรวจ (ต้องระบุผู้ตรวจก่อน) */
  const submitForReview = (task: TaskWithAssignee) => {
    if (!task.reviewer_id) {
      showError("เลือกผู้ตรวจงานก่อนจึงจะส่งตรวจได้");
      return;
    }
    patchTask(task.id, { db: { review_status: "pending", completed: false } });
  };

  /** ยกเลิกการส่งตรวจ (ผู้ส่งดึงกลับมาแก้) */
  const cancelReview = (task: TaskWithAssignee) => {
    patchTask(task.id, { db: { review_status: "none", completed: false } });
  };

  /** ผู้ตรวจกด approve → เสร็จสมบูรณ์ (จดเวลาไว้ใช้ในแท็บ "ตรวจแล้ว") */
  const approveTask = (task: TaskWithAssignee) => {
    patchTask(task.id, {
      db: {
        review_status: "approved",
        completed: true,
        approved_at: new Date().toISOString(),
      },
    });
  };

  /** เปิดงานที่เสร็จแล้วกลับมาแก้ */
  const reopenTask = (task: TaskWithAssignee) => {
    patchTask(task.id, {
      db: { review_status: "none", completed: false, approved_at: null },
    });
  };

  /** เปลี่ยนผู้ตรวจงาน */
  const setReviewer = (task: TaskWithAssignee, profileId: string | null) => {
    if (task.reviewer_id === profileId) return;
    const person = profiles.find((p) => p.id === profileId) ?? null;
    patchTask(task.id, {
      db: { reviewer_id: profileId },
      local: { reviewer: person },
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

  /** เปลี่ยนผู้รับผิดชอบจากวงกลมบนการ์ดโดยตรง */
  const assignTask = (task: TaskWithAssignee, profileId: string | null) => {
    if (task.assignee_id === profileId) return;
    const person = profiles.find((p) => p.id === profileId) ?? null;
    patchTask(task.id, {
      db: { assignee_id: profileId },
      local: { assignee: person },
    });
  };

  const quickAdd = async (
    sectionId: string,
    title: string,
    placement: QuickAddPlacement
  ) => {
    if (isTempId(sectionId)) return;
    // ใช้กติกาเดียวกับที่บอร์ดแสดงผล (งานไร้ section ถูกพักไว้คอลัมน์แรก)
    const inSection = items.filter((t) => bucketOf(t) === sectionId);
    const position =
      inSection.length === 0
        ? 1024
        : placement === "top"
          ? Math.min(...inSection.map((t) => t.position)) - 1
          : Math.max(...inSection.map((t) => t.position)) + 1;

    // ผู้ตรวจอัตโนมัติของฉัน — auto เลือกให้ตอนสร้างงาน (ต้องยังอยู่ใน roster)
    const autoReviewerId =
      myDefaultReviewerId !== null && reviewerSet.has(myDefaultReviewerId)
        ? myDefaultReviewerId
        : null;
    const autoReviewer = autoReviewerId
      ? (profiles.find((p) => p.id === autoReviewerId) ?? null)
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
      assignee_id: null,
      section_id: sectionId,
      completed: false,
      position,
      deliverable_url: null,
      deliverable_file_path: null,
      reviewer_id: autoReviewerId,
      review_status: "none",
      influencer_id: null,
      approved_at: null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee: null,
      reviewer: autoReviewer,
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
        reviewer_id: autoReviewerId,
        created_by: userId,
      })
      .select(
        "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email), reviewer:profiles!tasks_reviewer_id_fkey(id, full_name, email), influencer:influencers!tasks_influencer_id_fkey(id, first_name, last_name, nickname), files:task_files(id, task_id, file_path, file_name, created_at)"
      )
      .single();

    if (e || !data) {
      setItems((cur) => cur.filter((t) => t.id !== tempId));
      showError(`เพิ่มงานไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    const real = data as unknown as TaskWithAssignee;
    setItems((cur) => cur.map((t) => (t.id === tempId ? real : t)));
    setSelectedId((sel) => (sel === tempId ? real.id : sel));
  };

  const requestDeleteTask = (task: TaskWithAssignee) => {
    if (isTempId(task.id)) return;
    setConfirm({
      title: "ลบงาน",
      message: `ลบงาน "${task.title}" ใช่หรือไม่? การลบย้อนกลับไม่ได้`,
      onConfirm: () => {
        setItems((cur) => cur.filter((t) => t.id !== task.id));
        setSelectedId((sel) => (sel === task.id ? null : sel));
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
            // เก็บกวาดไฟล์ของงานใน storage (best effort) — cascade ลบให้เฉพาะแถวใน DB
            // โครง path มี 2 ระดับ: ไฟล์งาน tasks/{id}/ และไฟล์แนบคอมเมนต์ tasks/{id}/comments/
            const storage = supabase.storage.from(STORAGE_BUCKET_DOCUMENTS);
            void (async () => {
              const paths: string[] = [];
              for (const prefix of [
                `tasks/${task.id}`,
                `tasks/${task.id}/comments`,
              ]) {
                const { data } = await storage.list(prefix, { limit: 1000 });
                for (const obj of data ?? []) {
                  paths.push(`${prefix}/${obj.name}`);
                }
              }
              if (paths.length > 0) await storage.remove(paths);
            })().catch(() => {
              // เพิกเฉย — แถวใน DB ถูกลบไปแล้ว
            });
          });
      },
    });
  };

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
    const full = items
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

  const addSection = async (name: string) => {
    const position =
      sections.length > 0
        ? Math.max(...sections.map((s) => s.position)) + 1
        : 1;
    const tempId = `temp-${Date.now()}`;
    setSections((cur) => [
      ...cur,
      { id: tempId, name, position, created_at: new Date().toISOString() },
    ]);
    const { data, error: e } = await supabase
      .from("task_sections")
      .insert({ name, position })
      .select()
      .single();
    if (e || !data) {
      setSections((cur) => cur.filter((s) => s.id !== tempId));
      showError(`สร้างเซคชันไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setSections((cur) => cur.map((s) => (s.id === tempId ? data : s)));
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
    const affected = items.filter((t) => bucketOf(t) === sectionId);
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
      <div className="shrink-0 px-4 pt-5 sm:px-6">
        <div className="mb-3 animate-fade-in-up">
          <h1 className="text-xl font-semibold text-stone-900">บันทึกงาน</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            สร้างงานที่ทำ · แนบไฟล์/ลิงก์งาน · กด &quot;ส่งตรวจงาน&quot; แล้ว
            ผู้ตรวจงานที่ระบุจะอนุมัติในแท็บ &quot;รอฉันตรวจ&quot;
          </p>
        </div>

        {/* แท็บ: บันทึกงาน / รอฉันตรวจ */}
        <div className="mb-3 flex gap-1">
          <button
            type="button"
            onClick={() => setTab("work")}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
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
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === "review"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
            }`}
          >
            <ClipboardCheck size={16} />
            รอฉันตรวจ
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
          <button
            type="button"
            onClick={() => setTab("approved")}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === "approved"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "text-stone-500 hover:bg-white/70 hover:text-brand-700"
            }`}
          >
            <BadgeCheck size={16} />
            ตรวจแล้ว
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
          <button
            type="button"
            onClick={() => setReviewerModalOpen(true)}
            title="เพิ่ม/ลบผู้ตรวจ และตั้งผู้ตรวจอัตโนมัติของฉัน"
            className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:bg-white/70 hover:text-brand-700"
          >
            <UserCog size={16} />
            จัดการผู้ตรวจ
          </button>
        </div>

        {hasDemo && tab === "work" && <DemoBanner onWhat="งานบางส่วน" />}

        {loadError && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
            โหลดข้อมูลไม่สำเร็จ: {loadError} — ลองรีเฟรชหน้าอีกครั้ง
          </div>
        )}

        {tab === "work" && (
        <div className="mb-3 flex flex-wrap items-center gap-3 animate-fade-in-up">
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
          <div className="w-44">
            <Select
              aria-label="กรองตามผู้รับผิดชอบ"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="all">ผู้รับผิดชอบ: ทั้งหมด</option>
              {userId !== null && <option value="me">งานของฉัน</option>}
              <option value="none">ไม่ระบุ</option>
              {profiles
                .filter((p) => p.id !== userId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {profileName(p)}
                  </option>
                ))}
            </Select>
          </div>
          <div className="w-40">
            <Select
              aria-label="กรองตามสถานะ"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">สถานะ: ทั้งหมด</option>
              <option value="working">กำลังทำ</option>
              <option value="pending">รอตรวจ</option>
              <option value="done">เสร็จสมบูรณ์</option>
            </Select>
          </div>
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

        {tab === "approved" && (
          <div className="mb-3 flex flex-wrap items-center gap-3 animate-fade-in-up">
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
            <div className="w-44">
              <Select
                aria-label="กรองตามผู้รับผิดชอบ"
                value={apAssignee}
                onChange={(e) => setApAssignee(e.target.value)}
              >
                <option value="all">ผู้รับผิดชอบ: ทั้งหมด</option>
                {userId !== null && <option value="me">งานของฉัน</option>}
                <option value="none">ไม่ระบุ</option>
                {profiles
                  .filter((p) => p.id !== userId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {profileName(p)}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                aria-label="กรองตามผู้ตรวจ"
                value={apReviewer}
                onChange={(e) => setApReviewer(e.target.value)}
              >
                <option value="all">ผู้ตรวจ: ทั้งหมด</option>
                {userId !== null && <option value="me">ฉันเป็นผู้ตรวจ</option>}
                {apReviewerOptions
                  .filter((p) => p.id !== userId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {profileName(p)}
                    </option>
                  ))}
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

      {/* เนื้อหา — บอร์ดเลื่อนแนวนอน (แบบ Trello), แท็บรอตรวจ scroll แนวตั้ง */}
      <div
        className={`min-h-0 flex-1 ${
          tab === "work" ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto"
        }`}
      >
        {tab === "work" ? (
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
            onAddSection={(name) => void addSection(name)}
            onDeleteSection={requestDeleteSection}
          />
        ) : tab === "review" ? (
          <ReviewList
            queue={reviewQueue}
            sections={sections}
            today={today}
            selectedId={selectedId}
            onRowClick={(t) => setSelectedId(t.id)}
            onApprove={approveTask}
          />
        ) : (
          <ApprovedList
            tasks={approvedFiltered}
            totalApproved={approvedAll.length}
            sections={sections}
            selectedId={selectedId}
            onRowClick={(t) => setSelectedId(t.id)}
          />
        )}
      </div>
      </div>

      {/* แผงรายละเอียด — สูงเต็มจอชนขอบบน */}
      {selectedTask && (
        <TaskPanel
          key={selectedTask.id}
          task={selectedTask}
          sections={sections}
          profiles={profiles}
          reviewerProfiles={reviewerProfiles}
          influencers={influencers}
          userId={userId}
          suspendEsc={confirm !== null || reviewerModalOpen}
          onPatch={patchTask}
          onDelete={requestDeleteTask}
          onClose={() => setSelectedId(null)}
          onSubmitReview={submitForReview}
          onCancelReview={cancelReview}
          onApprove={approveTask}
          onReopen={reopenTask}
          onSetReviewer={setReviewer}
          onSetInfluencer={setInfluencer}
        />
      )}

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
              htmlFor="my-default-reviewer"
              className="text-sm font-medium text-stone-700"
            >
              ผู้ตรวจอัตโนมัติของฉัน
            </label>
            <p className="mb-2 mt-0.5 text-xs text-stone-400">
              เวลาฉันสร้างงานใหม่ ระบบจะเลือกคนนี้เป็นผู้ตรวจงานให้ทันที
              (เปลี่ยนผู้ตรวจของแต่ละงานได้ในแผงรายละเอียด)
            </p>
            <Select
              id="my-default-reviewer"
              value={myDefaultReviewerId ?? ""}
              disabled={userId === null}
              onChange={(e) =>
                void saveDefaultReviewer(
                  e.target.value === "" ? null : e.target.value
                )
              }
            >
              <option value="">ไม่ตั้งอัตโนมัติ (เลือกเองทุกครั้ง)</option>
              {reviewerProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {profileName(p)}
                </option>
              ))}
            </Select>
            {myDefaultReviewerId !== null &&
              !reviewerSet.has(myDefaultReviewerId) && (
                <p className="mt-1.5 text-xs text-amber-600">
                  ผู้ตรวจอัตโนมัติที่ตั้งไว้ถูกเอาออกจากรายชื่อผู้ตรวจแล้ว —
                  ระบบจะไม่เลือกให้จนกว่าจะตั้งใหม่
                </p>
              )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
