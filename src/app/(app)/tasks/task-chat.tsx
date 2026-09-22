"use client";

import { Link2, Paperclip, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_REVISION_KIND,
  REVISION_KINDS,
  STORAGE_BUCKET_DOCUMENTS,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { uploadBlockedMessage, uploadWithProgress } from "@/lib/upload";
import { prepareUploadFile } from "@/lib/upload-prepare";
import type {
  NotificationPriority,
  NotificationType,
  TaskCommentRow,
  TaskCommentWithAuthor,
  TaskWithAssignee,
} from "@/lib/types";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  AssigneeAvatar,
  currentReviewerIds,
  isImagePath,
  type ProfileOption,
  profileName,
} from "./task-card";
import { matchesSearch, searchTerms } from "@/lib/fuzzy";

/* ============================================================================
   แชทของงาน (task_comments) — hook + ชิ้น UI ใช้ร่วมกัน
   ----------------------------------------------------------------------------
   ย้ายออกมาจาก task-panel.tsx เพื่อให้หน้าตรวจงานแบบเต็มจอ (review-viewer)
   ใช้แชทชุดเดียวกันได้โดยไม่ copy โค้ด — พฤติกรรมเดิมทุกอย่าง:
   โหลดครั้งแรก + realtime + @mention + ส่งพร้อมไฟล์แนบ/ลิงก์ + แจ้งเตือน
   ⚠️ ห้าม mount useTaskChat ของงานเดียวกันซ้อนกัน 2 ตัว — ชื่อ realtime channel
   `task-comments-${task.id}` จะชนกัน (tasks-client จึงเปิดแผง/viewer ทีละอัน)
   ========================================================================== */

/** กันชื่อไฟล์ภาษาไทย/อักขระพิเศษพัง URL ของ storage */
const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");

/** path ใหม่พร้อม timestamp — helper ระดับโมดูลตามกฎ react-hooks/purity (Date.now) */
const stampedPath = (dir: string, fileName: string) =>
  `${dir}/${Date.now()}_${sanitizeFileName(fileName)}`;

/** ข้อความก่อน caret ที่ลงท้ายด้วย "@คำค้น" — ใช้เปิดเมนูแท็กคนในช่องแชท */
const MENTION_TAIL = /(^|\s)@([^\s@]*)$/;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function useTaskChat({
  task,
  profiles,
  userId,
  me,
  onError,
}: {
  task: TaskWithAssignee;
  profiles: ProfileOption[];
  userId: string | null;
  me: ProfileOption | null;
  /** แสดงข้อความผิดพลาดให้ผู้ใช้ — ต้องเป็นฟังก์ชัน identity นิ่ง (useCallback) */
  onError: (msg: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [comments, setComments] = useState<TaskCommentWithAuthor[] | null>(
    null
  );
  /** คอมเมนต์ที่มาทาง realtime ก่อน fetch รอบแรกจะเสร็จ — รวมเข้าลิสต์ตอน fetch จบ */
  const pendingCommentsRef = useRef<TaskCommentWithAuthor[]>([]);

  // โหลดแชทครั้งแรก
  useEffect(() => {
    let alive = true;
    void supabase
      .from("task_comments")
      .select(
        "*, author:profiles!task_comments_author_id_fkey(full_name, email, avatar_path)"
      )
      .eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .then((c) => {
        if (!alive) return;
        // โหลดพลาด — คง state เป็น null (กำลังโหลด) ไม่ให้โชว์ "ยังไม่มีข้อความ" ผิดๆ
        if (c.error) {
          onError(`โหลดแชทงานไม่สำเร็จ: ${c.error.message}`);
          return;
        }
        const fetchedComments = (c.data ??
          []) as unknown as TaskCommentWithAuthor[];
        // คอมเมนต์ที่มาทาง realtime ระหว่างรอ fetch รอบแรกถูกพักไว้ใน ref — เอามารวมด้วย
        // ไม่งั้นข้อความที่ส่งมาช่วงนั้นหายจนกว่าจะปิด-เปิดแผงใหม่
        const buffered = pendingCommentsRef.current;
        pendingCommentsRef.current = [];
        setComments((cur) => {
          const base =
            cur === null
              ? fetchedComments
              : (() => {
                  const ids = new Set(fetchedComments.map((x) => x.id));
                  return [
                    ...fetchedComments,
                    ...cur.filter((x) => !ids.has(x.id)),
                  ];
                })();
          if (buffered.length === 0) return base;
          const have = new Set(base.map((x) => x.id));
          return [...base, ...buffered.filter((x) => !have.has(x.id))];
        });
      });
    return () => {
      alive = false;
    };
  }, [supabase, task.id, onError]);

  // realtime: คอมเมนต์ใหม่ของงานนี้จากคนอื่น (หรือแท็บอื่น) โผล่ทันที
  useEffect(() => {
    const channel = supabase
      .channel(`task-comments-${task.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${task.id}`,
        },
        (payload) => {
          const row = payload.new as TaskCommentRow;
          // แถวจาก realtime ไม่มี join — เติม author จากรายชื่อ profiles ที่มีอยู่แล้ว
          const author = row.author_id
            ? (profiles.find((p) => p.id === row.author_id) ?? null)
            : null;
          setComments((cur) => {
            // ยังโหลดรอบแรกไม่เสร็จ — พักไว้ก่อน แล้วให้ fetch หลักรวมให้ตอนจบ
            // (แถวที่ insert หลัง query ยิงไปแล้วจะไม่อยู่ในผล fetch จึงต้องเก็บเอง)
            if (cur === null) {
              if (!pendingCommentsRef.current.some((c) => c.id === row.id)) {
                pendingCommentsRef.current.push({ ...row, author });
              }
              return cur;
            }
            if (cur.some((c) => c.id === row.id)) return cur;
            return [...cur, { ...row, author }];
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, task.id, profiles]);

  const [commentDraft, setCommentDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentsTopRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  /** คำค้นหลัง @ ที่ caret — null = เมนูปิด */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const updateMentionQuery = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = MENTION_TAIL.exec(before);
    setMentionQuery(m ? m[2] : null);
    setMentionIndex(0);
  };

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const terms = searchTerms(mentionQuery);
    return (
      profiles
        .filter((p) => p.id !== userId)
        .filter((p) => matchesSearch(terms, profileName(p)))
        // เมนูเลื่อนได้แล้ว จึงไม่ตัดที่ 6 คนเหมือนเดิม (ชื่อไทยเรียงท้ายสุดเลยไม่เคยโผล่)
        // เพดานนี้กันเมนูยาวเกินตอนพิมพ์ @ เปล่าๆ เท่านั้น
        .slice(0, 20)
    );
  }, [mentionQuery, profiles, userId]);

  /** เลื่อนรายการที่เลือกด้วยลูกศรให้อยู่ในสายตาเสมอ (เมนูสูงจำกัดแล้วเลื่อนเองไม่ได้) */
  const mentionListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mentionListRef.current
      ?.querySelector<HTMLElement>(`[data-mention-index="${mentionIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [mentionIndex, mentionQuery]);

  /** แทน "@คำค้น" หน้า caret ด้วย "@ชื่อเต็ม " แล้วคืน focus ให้ช่องพิมพ์ */
  const insertMention = (p: ProfileOption) => {
    const el = commentInputRef.current;
    const name = profileName(p);
    setCommentDraft((cur) => {
      const caret = el?.selectionStart ?? cur.length;
      const before = cur.slice(0, caret);
      const after = cur.slice(caret);
      if (!MENTION_TAIL.test(before)) return cur;
      const replaced = before.replace(MENTION_TAIL, `$1@${name} `);
      const newCaret = replaced.length;
      window.setTimeout(() => {
        el?.focus();
        el?.setSelectionRange(newCaret, newCaret);
      }, 0);
      return replaced + after;
    });
    setMentionQuery(null);
  };

  /** ชื่อสมาชิกทุกคน (ยาวก่อน — กันชื่อที่เป็น prefix ของกันและกัน) ใช้เน้น @ชื่อ ในฟองแชท */
  const mentionNames = useMemo(
    () =>
      profiles
        .map((p) => profileName(p))
        .filter((n) => n !== "-")
        .sort((a, b) => b.length - a.length),
    [profiles]
  );

  const sendComment = async () => {
    const body = commentDraft.trim();
    const link = linkDraft.trim();
    const file = attachFile;
    if ((body === "" && !file && link === "") || sending) return;
    if (link !== "" && !/^https?:\/\//i.test(link)) {
      onError("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
      return;
    }
    setSending(true);

    // อัพไฟล์แนบก่อน (ถ้ามี) — ล้มเหลวก็ยังไม่แตะรายการคอมเมนต์
    let filePath: string | null = null;
    if (file) {
      // ย่อรูป/บีบวิดีโอก่อน (ไฟล์อื่นส่งต่อตามเดิม) แล้วค่อยเช็คเพดาน
      const ready = await prepareUploadFile(file);
      const tooLarge = uploadBlockedMessage(ready);
      if (tooLarge) {
        setSending(false);
        onError(tooLarge);
        return;
      }
      const p = stampedPath(`tasks/${task.id}/comments`, ready.name);
      const { error: upErr } = await uploadWithProgress(
        STORAGE_BUCKET_DOCUMENTS,
        p,
        ready
      );
      if (upErr) {
        setSending(false);
        onError(`อัพโหลดไฟล์แนบไม่สำเร็จ: ${upErr.message}`);
        return;
      }
      filePath = p;
    }

    const tempId = `temp-${Date.now()}`;
    const optimistic: TaskCommentWithAuthor = {
      id: tempId,
      task_id: task.id,
      author_id: userId,
      body,
      // การแก้ไขนับจาก "การตีกลับ" ของผู้ตรวจเท่านั้น — คอมเมนต์ทั่วไปไม่ใช่ revision
      is_revision: false,
      revision_number: null,
      revision_kind: null,
      file_path: filePath,
      link_url: link === "" ? null : link,
      created_at: new Date().toISOString(),
      author: me,
    };
    setComments((cur) => [...(cur ?? []), optimistic]);
    setCommentDraft("");
    setMentionQuery(null);
    setLinkDraft("");
    setShowLinkInput(false);
    setAttachFile(null);
    window.setTimeout(
      () => commentsTopRef.current?.scrollIntoView({ block: "nearest" }),
      50
    );

    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: task.id,
        author_id: userId,
        body,
        file_path: filePath,
        link_url: link === "" ? null : link,
      })
      .select(
        "*, author:profiles!task_comments_author_id_fkey(full_name, email, avatar_path)"
      )
      .single();
    setSending(false);
    if (error || !data) {
      setComments((cur) => (cur ?? []).filter((c) => c.id !== tempId));
      setCommentDraft(body);
      setLinkDraft(link);
      setAttachFile(file); // คืนไฟล์แนบให้กดส่งใหม่ได้
      // เก็บกวาดไฟล์ที่เพิ่งอัพ (best effort) — คอมเมนต์ไม่ถูกบันทึกจึงไม่มีแถวอ้างถึง
      if (filePath) {
        try {
          await supabase.storage
            .from(STORAGE_BUCKET_DOCUMENTS)
            .remove([filePath]);
        } catch {
          // เพิกเฉย
        }
      }
      onError(`ส่งความคิดเห็นไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    const saved = data as unknown as TaskCommentWithAuthor;
    setComments((cur) =>
      // realtime อาจเพิ่มแถวจริงมาก่อนคำตอบ insert ถึง — ตัด temp ทิ้งแทนการแทนที่ (กันข้อความซ้ำ)
      (cur ?? []).some((c) => c.id === saved.id)
        ? (cur ?? []).filter((c) => c.id !== tempId)
        : (cur ?? []).map((c) => (c.id === tempId ? saved : c))
    );

    // แจ้งเตือน (กระดิ่ง): คนถูก @แท็ก + ผู้เกี่ยวข้องของงาน (ผู้รับผิดชอบ/ผู้สร้าง/ผู้ตรวจ)
    // — fire-and-forget: คอมเมนต์บันทึกแล้ว แจ้งเตือนพลาดไม่ต้องเด้ง error
    // จับ @ชื่อ ด้วย regex ชื่อยาวก่อน (กติกาเดียวกับ highlight) — includes เฉยๆ จะจับผิดคน
    // เมื่อชื่อหนึ่งเป็น prefix ของอีกชื่อ (เช่น "กาย" กับ "กายกร")
    const mentionedNames =
      mentionNames.length === 0
        ? new Set<string>()
        : new Set(
            [
              ...body.matchAll(
                new RegExp(
                  `@(?:${mentionNames.map(escapeRegExp).join("|")})`,
                  "g"
                )
              ),
            ].map((m) => m[0].slice(1))
          );
    const mentioned = profiles.filter(
      (p) => p.id !== userId && mentionedNames.has(profileName(p))
    );
    const preview =
      body !== "" ? body.slice(0, 140) : file ? `📎 ${file.name}` : link;
    const seen = new Set<string>();
    const notiRows: {
      recipient_id: string;
      actor_id: string | null;
      task_id: string;
      type: NotificationType;
      priority: NotificationPriority;
      preview: string;
    }[] = [];
    for (const p of mentioned) {
      seen.add(p.id);
      notiRows.push({
        recipient_id: p.id,
        actor_id: userId,
        task_id: task.id,
        type: "mention",
        priority: "primary",
        preview,
      });
    }
    // เจ้าของงาน + ผู้ตรวจของ "ทอดปัจจุบัน" = คนที่งานค้างอยู่จริง → แจ้งเตือนแบบเด่น
    // ส่วนคนที่แค่เกี่ยวข้อง (ผู้สั่ง brief, คนที่เคยตีกลับ) ได้แบบเงียบ —
    // ผู้ตรวจลำดับ 2 จึงไม่ถูกกวนจนกว่างานจะมาถึงทอดของเขาเอง (หรือเป็นงานที่เขาตีกลับเอง)
    const loud = new Set<string>([
      ...(task.assignee_id ? [task.assignee_id] : []),
      ...currentReviewerIds(task),
    ]);
    const quiet = new Set<string>([
      ...(task.created_by ? [task.created_by] : []),
      ...(task.rejected_by ? [task.rejected_by] : []),
    ]);
    for (const rid of [...loud, ...quiet]) {
      if (!rid || rid === userId || seen.has(rid)) continue;
      seen.add(rid);
      notiRows.push({
        recipient_id: rid,
        actor_id: userId,
        task_id: task.id,
        type: "comment",
        priority: loud.has(rid) ? "primary" : "secondary",
        preview,
      });
    }
    if (notiRows.length > 0) {
      // (ต้องมี .then เสมอ: builder ของ supabase-js เป็น lazy thenable — ไม่ then = ไม่ยิง request)
      void supabase
        .from("notifications")
        .insert(notiRows)
        .then(({ error: e }) => {
          if (e) console.warn("ส่งแจ้งเตือนไม่สำเร็จ:", e.message);
        });
    }
  };

  return {
    userId,
    me,
    comments,
    commentsTopRef,
    commentDraft,
    setCommentDraft,
    sending,
    attachFile,
    setAttachFile,
    linkDraft,
    setLinkDraft,
    showLinkInput,
    setShowLinkInput,
    commentFileRef,
    commentInputRef,
    mentionQuery,
    setMentionQuery,
    mentionIndex,
    setMentionIndex,
    mentionMatches,
    mentionListRef,
    updateMentionQuery,
    insertMention,
    mentionNames,
    sendComment,
    onError,
  };
}

type TaskChat = ReturnType<typeof useTaskChat>;

/* ---------- ลิสต์ฟองแชท (ล่าสุดอยู่บนสุด) ---------- */

export function ChatMessages({ chat }: { chat: TaskChat }) {
  // destructure ก่อนใช้ — เข้าถึง chat.commentsTopRef ตรงๆ ใน JSX ทำให้ react-hooks/refs
  // มองทั้งถุง chat เป็น ref แล้วห้ามอ่าน chat.comments ระหว่าง render (แบบเดียวกับ ChatComposer)
  const { comments, commentsTopRef, userId, mentionNames } = chat;
  return (
    <div className="space-y-2.5">
      {/* ข้อความล่าสุดอยู่บนสุด — เก็บใน DB เรียงเก่า→ใหม่เหมือนเดิม กลับด้านตอนแสดงผลเท่านั้น */}
      <div ref={commentsTopRef} />
      {[...(comments ?? [])].reverse().map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          mine={c.author_id !== null && c.author_id === userId}
          mentionNames={mentionNames}
        />
      ))}
    </div>
  );
}

/* ---------- ช่องพิมพ์แชท (แนบไฟล์/ลิงก์ + เมนูแท็กคน) ---------- */

export function ChatComposer({ chat }: { chat: TaskChat }) {
  const {
    me,
    commentDraft,
    setCommentDraft,
    sending,
    attachFile,
    setAttachFile,
    linkDraft,
    setLinkDraft,
    showLinkInput,
    setShowLinkInput,
    commentFileRef,
    commentInputRef,
    mentionQuery,
    setMentionQuery,
    mentionIndex,
    setMentionIndex,
    mentionMatches,
    mentionListRef,
    updateMentionQuery,
    insertMention,
    sendComment,
    onError,
  } = chat;
  return (
    <div className="relative border-t border-stone-100 bg-white/70 px-4 py-3 pb-safe-3 lg:pb-3">
      {/* เมนูแท็กคน — โผล่เหนือช่องพิมพ์เมื่อพิมพ์ @ */}
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 z-30 mb-1 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl animate-scale-in">
          <p className="border-b border-stone-100 px-3 py-1.5 text-[11px] text-stone-400">
            แท็กเพื่อส่งแจ้งเตือนถึงคนนั้น (↑↓ เลือก, Enter ยืนยัน)
          </p>
          {/* สูงจำกัดแล้วเลื่อนในตัวเอง — ไม่งั้นรายชื่อท้ายๆ ถูกตัดหายโดยไม่มีทางเลื่อนถึง */}
          <div
            ref={mentionListRef}
            className="max-h-56 overflow-y-auto overscroll-contain"
          >
            {mentionMatches.map((p, i) => (
              <button
                key={p.id}
                type="button"
                data-mention-index={i}
                // กัน textarea เสีย focus ก่อนคลิกถึง (mousedown มาก่อน click)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(p)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors max-sm:min-h-11 ${
                  i === mentionIndex
                    ? "bg-brand-50 text-brand-800"
                    : "text-stone-700 hover:bg-brand-50/60"
                }`}
              >
                <AssigneeAvatar assignee={p} size={5} />
                <span className="min-w-0 truncate">{profileName(p)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {showLinkInput && (
        <div className="mb-2 flex items-center gap-1.5 pl-9">
          <Link2 size={14} className="shrink-0 text-stone-400" />
          <input
            value={linkDraft}
            aria-label="ลิงก์ไฟล์แนบ"
            placeholder="ลิงก์ไฟล์ที่แก้ไข"
            onChange={(e) => setLinkDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-stone-200/80 bg-white/80 px-2.5 py-1 text-xs text-stone-800 placeholder:text-stone-500 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      )}
      {attachFile && (
        <p className="mb-2 flex items-center gap-1.5 pl-9 text-xs text-stone-500">
          <Paperclip size={12} className="shrink-0" />
          <span className="min-w-0 truncate">{attachFile.name}</span>
          <button
            type="button"
            onClick={() => setAttachFile(null)}
            title="เอาไฟล์แนบออก"
            aria-label="เอาไฟล์แนบออก"
            className="shrink-0 cursor-pointer text-stone-400 transition-colors hover:text-rose-500"
          >
            <X size={12} />
          </button>
        </p>
      )}
      <div className="flex items-start gap-2.5">
        <AssigneeAvatar assignee={me} size={7} />
        <textarea
          ref={commentInputRef}
          value={commentDraft}
          rows={commentDraft.includes("\n") ? 3 : 1}
          aria-label="พิมพ์ข้อความ"
          onChange={(e) => {
            setCommentDraft(e.target.value);
            updateMentionQuery(e.target);
          }}
          onKeyDown={(e) => {
            // เมนูแท็กคนเปิดอยู่ — ลูกศร/Enter/Tab เป็นของเมนูก่อน
            if (mentionQuery !== null && mentionMatches.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % mentionMatches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex(
                  (i) =>
                    (i - 1 + mentionMatches.length) % mentionMatches.length
                );
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insertMention(mentionMatches[mentionIndex]);
                return;
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setMentionQuery(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendComment();
            }
          }}
          className="min-h-9 min-w-0 flex-1 resize-none rounded-2xl border border-transparent bg-stone-100 px-3.5 py-2 text-sm leading-6 text-stone-800 placeholder:text-stone-500 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={() => void sendComment()}
          disabled={
            (commentDraft.trim() === "" &&
              !attachFile &&
              linkDraft.trim() === "") ||
            sending
          }
          title="ส่งความคิดเห็น"
          aria-label="ส่งความคิดเห็น"
          className="cursor-pointer rounded-lg p-2 text-brand-600 transition-all duration-200 hover:bg-brand-50 active:scale-90 disabled:cursor-not-allowed disabled:text-stone-300"
        >
          <Send size={16} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3 pl-9">
        <button
          type="button"
          onClick={() => commentFileRef.current?.click()}
          title="แนบรูป/ไฟล์"
          aria-label="แนบรูป/ไฟล์"
          className="cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700"
        >
          <Paperclip size={14} />
        </button>
        <button
          type="button"
          onClick={() => setShowLinkInput((v) => !v)}
          title="แนบลิงก์ (Google Drive)"
          aria-label="แนบลิงก์"
          className={`cursor-pointer rounded p-1 transition-colors hover:bg-brand-50 hover:text-brand-700 ${
            showLinkInput || linkDraft.trim() !== ""
              ? "text-brand-600"
              : "text-stone-400"
          }`}
        >
          <Link2 size={14} />
        </button>
        <input
          ref={commentFileRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            // บอกตั้งแต่ตอนเลือก ไม่ใช่ตอนกดส่ง
            const tooLarge = uploadBlockedMessage(f);
            if (tooLarge) {
              onError(tooLarge);
              return;
            }
            setAttachFile(f);
          }}
        />
      </div>
    </div>
  );
}

/* ---------- ข้อความแชทหนึ่งฟอง — ของฉันชิดขวา (โทน brand), ของคนอื่นชิดซ้าย (เทา) ---------- */

/** เนื้อความพร้อมเน้น @ชื่อ — เทียบกับชื่อสมาชิกทุกคน (ลิสต์ต้องเรียงชื่อยาวก่อน) */
function BodyWithMentions({
  body,
  names,
  mine,
}: {
  body: string;
  names: string[];
  mine: boolean;
}) {
  const nodes = useMemo(() => {
    if (names.length === 0) return [body];
    const re = new RegExp(`@(?:${names.map(escapeRegExp).join("|")})`, "g");
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of body.matchAll(re)) {
      const at = m.index ?? 0;
      if (at > last) out.push(body.slice(last, at));
      out.push(
        <span
          key={`${at}-${m[0]}`}
          className={
            mine
              ? "font-semibold underline decoration-cream/70"
              : "font-semibold text-brand-700"
          }
        >
          {m[0]}
        </span>
      );
      last = at + m[0].length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
  }, [body, names, mine]);
  return <p className="whitespace-pre-wrap break-words">{nodes}</p>;
}

function CommentItem({
  comment: c,
  mine,
  mentionNames,
}: {
  comment: TaskCommentWithAuthor;
  mine: boolean;
  /** ชื่อสมาชิกทุกคน (เรียงยาว→สั้น) สำหรับเน้น @ชื่อ */
  mentionNames: string[];
}) {
  const { url: fileUrl, failed: fileFailed } = useSignedUrl(c.file_path);
  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && <AssigneeAvatar assignee={c.author} size={7} />}
      <div
        className={`flex min-w-0 max-w-[82%] flex-col ${
          mine ? "items-end" : "items-start"
        }`}
      >
        {!mine && (
          <span className="mb-0.5 px-1 text-[11px] font-medium text-stone-500">
            {profileName(c.author)}
          </span>
        )}
        <div
          className={`min-w-0 rounded-2xl px-3 py-1.5 text-sm leading-6 ${
            mine
              ? "rounded-br-md bg-gradient-to-b from-brand-500 to-brand-600 text-cream"
              : "rounded-bl-md bg-stone-100 text-stone-800"
          }`}
        >
          {c.is_revision && (
            // ประเภทการตีกลับ: "คำผิด" นับเป็นข้อผิดพลาดใน KPI · "เพิ่มเติม" ไม่นับ
            // (แถวเก่าก่อน migration 0063 ไม่มีค่า → ถือเป็นคำผิดตามเดิม)
            <span
              className={`mb-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                mine
                  ? "bg-white/25 text-cream"
                  : REVISION_KINDS[c.revision_kind ?? DEFAULT_REVISION_KIND]
                      .chip
              }`}
            >
              ตีกลับ ·{" "}
              {REVISION_KINDS[c.revision_kind ?? DEFAULT_REVISION_KIND].label}{" "}
              ครั้งที่ {c.revision_number ?? "-"}
            </span>
          )}
          {c.body !== "" && (
            <BodyWithMentions body={c.body} names={mentionNames} mine={mine} />
          )}
          {c.link_url && (
            <a
              href={c.link_url}
              target="_blank"
              rel="noreferrer"
              className={`mt-1 inline-flex max-w-full items-center gap-1 text-xs hover:underline ${
                mine ? "text-cream/90" : "text-sky-600"
              }`}
            >
              <Link2 size={12} className="shrink-0" />
              <span className="min-w-0 truncate">{c.link_url}</span>
            </a>
          )}
          {c.file_path &&
            (fileUrl ? (
              isImagePath(c.file_path) ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="เปิดรูปเต็ม"
                  className="mt-1.5 block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileUrl}
                    alt="ไฟล์แนบ"
                    className="max-h-44 rounded-lg object-contain"
                  />
                </a>
              ) : (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-1 inline-flex items-center gap-1 text-xs hover:underline ${
                    mine ? "text-cream/90" : "text-brand-700"
                  }`}
                >
                  <Paperclip size={12} />
                  เปิดไฟล์แนบ
                </a>
              )
            ) : fileFailed ? (
              <p
                className={`mt-1 text-xs ${mine ? "text-cream/70" : "text-stone-400"}`}
              >
                เปิดไฟล์แนบไม่ได้
              </p>
            ) : (
              <p
                className={`mt-1 text-xs ${mine ? "text-cream/70" : "text-stone-400"}`}
              >
                กำลังโหลด...
              </p>
            ))}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-stone-400">
          {formatDateTime(c.created_at)}
        </span>
      </div>
    </div>
  );
}
