"use client";

import { Check, Plus, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TASK_CATEGORIES,
  TASK_PRIORITY,
  TASK_PRIORITY_ORDER,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  TaskCommentWithAuthor,
  TaskPriority,
  TaskRow,
  TaskSectionRow,
  TaskSubtaskRow,
  TaskWithAssignee,
} from "@/lib/types";
import {
  AssigneeAvatar,
  CompleteToggle,
  type ProfileOption,
  profileName,
} from "./task-card";

/** patch ที่ส่งกลับ: ส่วนที่เขียนลง DB + ส่วนที่อัปเดตเฉพาะ state ฝั่งจอ (เช่น assignee object) */
export type TaskPatch = {
  db: Partial<TaskRow>;
  local?: Partial<TaskWithAssignee>;
};

/* สไตล์ field แบบ "ไร้กล่อง" (Asana) — โผล่ขอบเฉพาะตอน hover/focus */
const bareControl =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-stone-800 transition-colors hover:border-stone-200/80 hover:bg-white/70 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100";
const bareSelect = `${bareControl} cursor-pointer appearance-none`;

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={htmlFor}
        className="w-28 shrink-0 text-sm text-stone-500"
      >
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * แผงรายละเอียดงานฝั่งขวาแบบ Asana — สูงเต็มจอ, field ไร้กล่อง, งานย่อย + ความคิดเห็น
 * mount ด้วย key={task.id} เพื่อรีเซ็ต draft เมื่อสลับงาน
 */
export function TaskPanel({
  task,
  sections,
  profiles,
  userId,
  suspendEsc = false,
  onPatch,
  onDelete,
  onClose,
}: {
  task: TaskWithAssignee;
  sections: TaskSectionRow[];
  profiles: ProfileOption[];
  userId: string | null;
  /** true เมื่อมี dialog อื่นเปิดอยู่ — ให้ Esc เป็นของ dialog นั้น */
  suspendEsc?: boolean;
  onPatch: (id: string, patch: TaskPatch) => void;
  onDelete: (task: TaskWithAssignee) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const asideRef = useRef<HTMLElement>(null);
  const me = profiles.find((p) => p.id === userId) ?? null;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDraft, setDueDraft] = useState(
    task.due_date ? task.due_date.slice(0, 10) : ""
  );
  const [panelError, setPanelError] = useState<string | null>(null);
  const showError = (msg: string) => {
    setPanelError(msg);
    window.setTimeout(() => setPanelError(null), 5000);
  };

  /* ---------- งานย่อย + ความคิดเห็น (โหลดเมื่อเปิดงาน) ---------- */

  const [subtasks, setSubtasks] = useState<TaskSubtaskRow[] | null>(null);
  const [comments, setComments] = useState<TaskCommentWithAuthor[] | null>(
    null
  );

  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase
        .from("task_subtasks")
        .select("*")
        .eq("task_id", task.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("task_comments")
        .select("*, author:profiles!task_comments_author_id_fkey(full_name, email)")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true }),
    ]).then(([s, c]) => {
      if (!alive) return;
      // merge กับของที่ผู้ใช้เพิ่งเพิ่มระหว่างรอโหลด — ไม่ทับทิ้ง
      const fetchedSubs = (s.data ?? []) as TaskSubtaskRow[];
      setSubtasks((cur) => {
        if (cur === null) return fetchedSubs;
        const ids = new Set(fetchedSubs.map((x) => x.id));
        return [...fetchedSubs, ...cur.filter((x) => !ids.has(x.id))];
      });
      const fetchedComments = (c.data ?? []) as unknown as TaskCommentWithAuthor[];
      setComments((cur) => {
        if (cur === null) return fetchedComments;
        const ids = new Set(fetchedComments.map((x) => x.id));
        return [...fetchedComments, ...cur.filter((x) => !ids.has(x.id))];
      });
    });
    return () => {
      alive = false;
    };
  }, [supabase, task.id]);

  /* ---------- Esc: blur ช่องที่พิมพ์อยู่ก่อน (บันทึก) — กดซ้ำจึงปิดแผง ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || suspendEsc) return;
      const el = document.activeElement as HTMLElement | null;
      // กำลังพิมพ์อยู่ที่ไหนก็ตาม (รวมช่องค้นหานอกแผง) — Esc แค่ blur ไม่ปิดแผง
      if (el && ["TEXTAREA", "INPUT", "SELECT"].includes(el.tagName)) {
        el.blur();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, suspendEsc]);

  useEffect(() => {
    asideRef.current?.focus({ preventScroll: true });
  }, []);

  /* ---------- autosave หลัก ---------- */

  const saveTitle = () => {
    const trimmed = title.trim();
    if (trimmed === "" || trimmed === task.title) {
      setTitle(task.title);
      return;
    }
    onPatch(task.id, { db: { title: trimmed } });
  };

  const saveDescription = () => {
    const value = description.trim() === "" ? null : description.trim();
    if (value === task.description) return;
    onPatch(task.id, { db: { description: value } });
  };

  const saveDueDate = (value: string) => {
    const current = task.due_date ? task.due_date.slice(0, 10) : "";
    if (value === current) return;
    onPatch(task.id, { db: { due_date: value === "" ? null : value } });
  };

  /* ---------- งานย่อย ---------- */

  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState("");

  const addSubtask = async (title: string) => {
    const position =
      subtasks && subtasks.length > 0
        ? Math.max(...subtasks.map((s) => s.position)) + 1
        : 1;
    const tempId = `temp-${Date.now()}`;
    const optimistic: TaskSubtaskRow = {
      id: tempId,
      task_id: task.id,
      title,
      completed: false,
      position,
      created_at: new Date().toISOString(),
    };
    setSubtasks((cur) => [...(cur ?? []), optimistic]);
    const { data, error } = await supabase
      .from("task_subtasks")
      .insert({ task_id: task.id, title, position })
      .select()
      .single();
    if (error || !data) {
      setSubtasks((cur) => (cur ?? []).filter((s) => s.id !== tempId));
      showError(`เพิ่มงานย่อยไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setSubtasks((cur) =>
      (cur ?? []).map((s) => (s.id === tempId ? (data as TaskSubtaskRow) : s))
    );
  };

  const toggleSubtask = (sub: TaskSubtaskRow) => {
    if (sub.id.startsWith("temp-")) return;
    const next = !sub.completed;
    setSubtasks((cur) =>
      (cur ?? []).map((s) => (s.id === sub.id ? { ...s, completed: next } : s))
    );
    void supabase
      .from("task_subtasks")
      .update({ completed: next })
      .eq("id", sub.id)
      .then(({ error }) => {
        if (error) {
          setSubtasks((cur) =>
            (cur ?? []).map((s) =>
              s.id === sub.id ? { ...s, completed: !next } : s
            )
          );
          showError(`บันทึกไม่สำเร็จ: ${error.message}`);
        }
      });
  };

  const renameSubtask = (sub: TaskSubtaskRow, name: string) => {
    const trimmed = name.trim();
    if (sub.id.startsWith("temp-") || trimmed === "" || trimmed === sub.title) {
      return;
    }
    const prev = sub.title;
    setSubtasks((cur) =>
      (cur ?? []).map((s) => (s.id === sub.id ? { ...s, title: trimmed } : s))
    );
    void supabase
      .from("task_subtasks")
      .update({ title: trimmed })
      .eq("id", sub.id)
      .then(({ error }) => {
        if (error) {
          setSubtasks((cur) =>
            (cur ?? []).map((s) =>
              s.id === sub.id ? { ...s, title: prev } : s
            )
          );
          showError(`บันทึกไม่สำเร็จ: ${error.message}`);
        }
      });
  };

  const deleteSubtask = (sub: TaskSubtaskRow) => {
    if (sub.id.startsWith("temp-")) return;
    setSubtasks((cur) => (cur ?? []).filter((s) => s.id !== sub.id));
    void supabase
      .from("task_subtasks")
      .delete()
      .eq("id", sub.id)
      .then(({ error }) => {
        if (error) {
          setSubtasks((cur) =>
            (cur ?? []).some((s) => s.id === sub.id) ? cur : [...(cur ?? []), sub]
          );
          showError(`ลบงานย่อยไม่สำเร็จ: ${error.message}`);
        }
      });
  };

  /* ---------- ความคิดเห็น ---------- */

  const [commentDraft, setCommentDraft] = useState("");
  const [sending, setSending] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const sendComment = async () => {
    const body = commentDraft.trim();
    if (body === "" || sending) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: TaskCommentWithAuthor = {
      id: tempId,
      task_id: task.id,
      author_id: userId,
      body,
      created_at: new Date().toISOString(),
      author: me,
    };
    setComments((cur) => [...(cur ?? []), optimistic]);
    setCommentDraft("");
    window.setTimeout(
      () => commentsEndRef.current?.scrollIntoView({ block: "nearest" }),
      50
    );

    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: task.id, author_id: userId, body })
      .select("*, author:profiles!task_comments_author_id_fkey(full_name, email)")
      .single();
    setSending(false);
    if (error || !data) {
      setComments((cur) => (cur ?? []).filter((c) => c.id !== tempId));
      setCommentDraft(body);
      showError(`ส่งความคิดเห็นไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setComments((cur) =>
      (cur ?? []).map((c) =>
        c.id === tempId ? (data as unknown as TaskCommentWithAuthor) : c
      )
    );
  };

  const subDone = (subtasks ?? []).filter((s) => s.completed).length;

  /* ---------- render ---------- */

  return (
    <aside
      ref={asideRef}
      tabIndex={-1}
      aria-label="รายละเอียดงาน"
      className="flex h-full w-[26rem] shrink-0 flex-col border-l border-white/60 bg-white/80 shadow-xl outline-none backdrop-blur-2xl animate-slide-in-right"
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-stone-200/60 px-4 py-3">
        <button
          type="button"
          onClick={() =>
            onPatch(task.id, { db: { completed: !task.completed } })
          }
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
            task.completed
              ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
              : "border-stone-300 bg-white/80 text-stone-600 hover:border-emerald-400 hover:text-emerald-600"
          }`}
        >
          <Check size={15} strokeWidth={3} />
          {task.completed ? "ทำเสร็จแล้ว" : "ทำเครื่องหมายว่าเสร็จ"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDelete(task)}
            title="ลบงาน"
            aria-label="ลบงาน"
            className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 active:scale-90"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="ปิด (Esc)"
            aria-label="ปิดแผงรายละเอียด"
            className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* title */}
        <textarea
          value={title}
          rows={2}
          aria-label="ชื่องาน"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          placeholder="ชื่องาน"
          className={`w-full resize-none rounded-md border border-transparent px-2 py-1 text-xl font-semibold leading-snug transition-colors hover:border-stone-200/80 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
            task.completed ? "text-stone-400 line-through" : "text-stone-900"
          }`}
        />

        {/* fields — ไร้กล่องแบบ Asana */}
        <div className="space-y-0.5">
          <FieldRow label="ผู้รับผิดชอบ" htmlFor="task-assignee">
            <div className="flex items-center gap-2 px-2">
              <AssigneeAvatar assignee={task.assignee} />
              <select
                id="task-assignee"
                value={task.assignee_id ?? ""}
                onChange={(e) => {
                  const id = e.target.value === "" ? null : e.target.value;
                  const person = profiles.find((p) => p.id === id) ?? null;
                  onPatch(task.id, {
                    db: { assignee_id: id },
                    local: { assignee: person },
                  });
                }}
                className={`${bareSelect} px-1.5`}
              >
                <option value="">ไม่ระบุ</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {profileName(p)}
                  </option>
                ))}
              </select>
            </div>
          </FieldRow>

          <FieldRow label="กำหนดส่ง" htmlFor="task-due">
            <input
              id="task-due"
              type="date"
              value={dueDraft}
              onChange={(e) => {
                setDueDraft(e.target.value);
                if (e.target.value.length === 10) saveDueDate(e.target.value);
              }}
              onBlur={(e) => saveDueDate(e.target.value)}
              className={`${bareControl} cursor-pointer`}
            />
          </FieldRow>

          <FieldRow label="เซคชัน" htmlFor="task-section">
            <select
              id="task-section"
              value={task.section_id ?? ""}
              onChange={(e) =>
                onPatch(task.id, { db: { section_id: e.target.value } })
              }
              className={bareSelect}
            >
              {task.section_id === null && (
                <option value="" disabled>
                  ยังไม่ระบุ
                </option>
              )}
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="ความสำคัญ" htmlFor="task-priority">
            <select
              id="task-priority"
              value={task.priority}
              onChange={(e) =>
                onPatch(task.id, {
                  db: { priority: e.target.value as TaskPriority },
                })
              }
              className={bareSelect}
            >
              {TASK_PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY[p].label}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="หมวดหมู่" htmlFor="task-category">
            <select
              id="task-category"
              value={task.category}
              onChange={(e) =>
                onPatch(task.id, { db: { category: e.target.value } })
              }
              className={bareSelect}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {!(TASK_CATEGORIES as readonly string[]).includes(
                task.category
              ) && <option value={task.category}>{task.category}</option>}
            </select>
          </FieldRow>
        </div>

        {/* description */}
        <div>
          <p className="mb-1 px-2 text-sm text-stone-500">รายละเอียด</p>
          <textarea
            value={description}
            rows={3}
            aria-label="รายละเอียดงาน"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            placeholder="งานนี้เกี่ยวกับอะไร..."
            className={`${bareControl} min-h-20 resize-y leading-6`}
          />
        </div>

        {/* subtasks */}
        <div>
          <p className="mb-1 flex items-center gap-2 px-2 text-sm text-stone-500">
            งานย่อย
            {subtasks !== null && subtasks.length > 0 && (
              <span className="text-xs text-stone-400">
                {subDone}/{subtasks.length}
              </span>
            )}
          </p>
          <div className="space-y-0.5">
            {(subtasks ?? []).map((sub) => (
              <SubtaskRowItem
                key={sub.id}
                sub={sub}
                onToggle={() => toggleSubtask(sub)}
                onRename={(name) => renameSubtask(sub, name)}
                onDelete={() => deleteSubtask(sub)}
              />
            ))}
            {addingSub ? (
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="h-4 w-4 shrink-0 rounded-full border border-stone-300" />
                <input
                  autoFocus
                  value={subDraft}
                  placeholder="พิมพ์ชื่องานย่อย แล้วกด Enter"
                  onChange={(e) => setSubDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const t = subDraft.trim();
                      setSubDraft("");
                      if (t !== "") void addSubtask(t);
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setSubDraft("");
                      setAddingSub(false);
                    }
                  }}
                  onBlur={() => {
                    const t = subDraft.trim();
                    setSubDraft("");
                    setAddingSub(false);
                    if (t !== "") void addSubtask(t);
                  }}
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSub(true)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-stone-400 transition-colors hover:bg-white/70 hover:text-brand-700"
              >
                <Plus size={14} />
                เพิ่มงานย่อย
              </button>
            )}
          </div>
        </div>

        {/* comments */}
        <div className="border-t border-stone-200/60 pt-3">
          <p className="mb-2 px-2 text-sm text-stone-500">ความคิดเห็น</p>
          <div className="space-y-3">
            {(comments ?? []).map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 px-2">
                <AssigneeAvatar assignee={c.author} size={7} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-stone-500">
                    <span className="font-medium text-stone-700">
                      {profileName(c.author)}
                    </span>{" "}
                    · {formatDateTime(c.created_at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-stone-800">
                    {c.body}
                  </p>
                </div>
              </div>
            ))}
            {comments !== null && comments.length === 0 && (
              <p className="px-2 text-xs text-stone-400">
                ยังไม่มีความคิดเห็น — เริ่มคุยเรื่องงานนี้ได้เลย
              </p>
            )}
            <div ref={commentsEndRef} />
          </div>
        </div>

        <p className="px-2 text-[11px] text-stone-300">
          สร้างเมื่อ {formatDateTime(task.created_at)}
        </p>
      </div>

      {panelError && (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-600 animate-fade-in">
          {panelError}
        </div>
      )}

      {/* comment composer — ติดล่างเสมอ */}
      <div className="flex items-start gap-2.5 border-t border-stone-200/60 bg-white/60 px-4 py-3">
        <AssigneeAvatar assignee={me} size={7} />
        <textarea
          value={commentDraft}
          rows={commentDraft.includes("\n") ? 3 : 1}
          placeholder="แสดงความคิดเห็น... (Enter เพื่อส่ง)"
          aria-label="เขียนความคิดเห็น"
          onChange={(e) => setCommentDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendComment();
            }
          }}
          className="min-h-9 min-w-0 flex-1 resize-none rounded-lg border border-stone-200/80 bg-white/80 px-3 py-1.5 text-sm leading-6 text-stone-800 placeholder:text-stone-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={() => void sendComment()}
          disabled={commentDraft.trim() === "" || sending}
          title="ส่งความคิดเห็น"
          aria-label="ส่งความคิดเห็น"
          className="cursor-pointer rounded-lg p-2 text-brand-600 transition-all duration-200 hover:bg-brand-50 active:scale-90 disabled:cursor-not-allowed disabled:text-stone-300"
        >
          <Send size={16} />
        </button>
      </div>
    </aside>
  );
}

/* ---------- แถวงานย่อย: ติ๊กเสร็จ + แก้ชื่อ inline + ลบตอน hover ---------- */

function SubtaskRowItem({
  sub,
  onToggle,
  onRename,
  onDelete,
}: {
  sub: TaskSubtaskRow;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(sub.title);
  useEffect(() => setDraft(sub.title), [sub.title]);
  const temp = sub.id.startsWith("temp-");

  return (
    <div
      className={`group flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-white/70 ${
        temp ? "opacity-60" : ""
      }`}
    >
      <CompleteToggle
        completed={sub.completed}
        onToggle={temp ? undefined : onToggle}
        size={16}
      />
      <input
        value={draft}
        aria-label="ชื่องานย่อย"
        disabled={temp}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() === "") {
            setDraft(sub.title);
          } else {
            onRename(draft);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(sub.title);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`min-w-0 flex-1 border-none bg-transparent text-sm focus:outline-none ${
          sub.completed ? "text-stone-400 line-through" : "text-stone-800"
        }`}
      />
      {!temp && (
        <button
          type="button"
          onClick={onDelete}
          title="ลบงานย่อย"
          aria-label="ลบงานย่อย"
          className="cursor-pointer rounded p-1 text-stone-300 opacity-0 transition-all hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 active:scale-90"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
