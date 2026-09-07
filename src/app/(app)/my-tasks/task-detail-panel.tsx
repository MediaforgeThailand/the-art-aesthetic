"use client";

/**
 * แผงรายละเอียดของงานใน My List — เปิดจากการกดแถวในลิสต์
 * ลอยทับเนื้อหาแบบเดียวกับแผงข้างของ Influ Calendar (portal ออกไป body เสมอ:
 * parent ที่มี backdrop-filter/transform จะทำให้ position:fixed ไปยึดกับกล่องนั้นแทนทั้งจอ)
 *
 * ทุกช่องบันทึกทันที — ยกเว้นชื่อ/โน้ตที่บันทึกตอนออกจากช่อง (blur) และตอนแผงถูกปิด
 * (ปิดด้วย Esc/แตะฉากหลังไม่การันตีว่าเกิด blur ก่อน unmount — ไม่ flush ตอนปิด ข้อความที่เพิ่งพิมพ์จะหาย)
 *
 * หน้าแม่ mount แผงนี้ด้วย key={task.id} — สลับงานแล้ว state ในฟอร์มรีเซ็ตเองโดยไม่ต้อง sync ผ่าน effect
 */

import { CalendarDays, Check, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type {
  ListGroupRow,
  ListTagRow,
  ListTaskFileRow,
  ListTaskRow,
} from "@/lib/types";
import {
  dueInfo,
  type MyTask,
  type OptionUi,
  priorityViewOf,
  statusSelectedKey,
  statusViewOf,
} from "./list-utils";
import { OptionPicker, TagChip, TagPicker } from "./pickers";
import { FilesSection, type UploadProgress } from "./task-files";

export function TaskDetailPanel({
  task,
  tags,
  groups,
  opt,
  uploading,
  uploadProgress,
  onClose,
  onPatch,
  onToggleTag,
  onCreateTag,
  onDelete,
  onUploadFiles,
  onRemoveFile,
}: {
  task: MyTask;
  tags: ListTagRow[];
  /** หมวดหมู่ทั้งหมดของฉัน (เรียงตามบอร์ดแล้ว) — ไว้ย้ายงานเข้าหมวดจากแผงโดยไม่ต้องลาก */
  groups: ListGroupRow[];
  /** ตัวเลือกสถานะ/ความสำคัญ (รวมที่ผู้ใช้เพิ่มเอง) + callback ของ dropdown ทั้งสองช่อง */
  opt: OptionUi;
  /** งานนี้กำลังอัพโหลดไฟล์อยู่ (state อยู่ที่หน้าแม่ — แถวในตารางกับแผงจึงตรงกันเสมอ) */
  uploading: boolean;
  uploadProgress: UploadProgress | null;
  onClose: () => void;
  onPatch: (patch: Partial<ListTaskRow>) => void;
  onToggleTag: (tagId: string, on: boolean) => void;
  onCreateTag: (name: string) => Promise<string | null>;
  onDelete: () => void;
  onUploadFiles: (files: FileList) => void;
  onRemoveFile: (file: ListTaskFileRow) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");

  // ค่าที่ต้องอ่านตอน unmount/ตอนกด Esc — เก็บใน ref แล้วอัปเดตใน effect
  // (react-hooks/refs ห้ามเขียน .current ระหว่าง render)
  const flushRef = useRef<() => void>(() => {});
  const closeRef = useRef(onClose);

  const commitTitle = (v: string) => {
    const next = v.trim();
    if (!next) {
      setTitle(task.title); // ชื่อว่างไม่บันทึก — คืนค่าเดิมกลับไป
      return;
    }
    if (next !== task.title) onPatch({ title: next });
  };

  const commitNote = (v: string) => {
    const next = v.trim();
    if (next !== (task.note ?? "")) onPatch({ note: next || null });
  };

  useEffect(() => {
    closeRef.current = onClose;
    flushRef.current = () => {
      commitTitle(title);
      commitNote(note);
    };
  });

  // flush ตอนแผงถูกปิด (unmount) — ครอบทั้ง Esc, แตะฉากหลัง และการสลับไปงานอื่น
  useEffect(() => () => flushRef.current(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const due = dueInfo(task.due_date, task.done);
  const taskTags = task.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is ListTagRow => t !== undefined);
  const meta = priorityViewOf(task, opt.priority);
  const statusMeta = statusViewOf(task, opt.status);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="ปิดแผงรายละเอียด"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-stone-900/15 backdrop-blur-[2px] animate-fade-in"
      />
      {/* pt-safe อยู่ที่ตัว aside (ไม่ใช่ที่หัวแผง) เพราะ element นี้ไม่มี padding แนวตั้งของตัวเอง
          — ใส่ทับกับ py-* จะแย่งกันเองตามลำดับใน CSS ไม่ใช่ตามลำดับใน class */}
      <aside
        aria-label={`รายละเอียด: ${task.title}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-white/70 bg-white/95 pt-safe shadow-[0_0_60px_rgba(94,58,49,0.25)] backdrop-blur-2xl animate-slide-in-right sm:inset-y-3 sm:right-3 sm:rounded-2xl sm:border sm:pt-0"
      >
        {/* ---- หัวแผง ---- */}
        <div className="flex shrink-0 items-center gap-2 border-b border-brand-100/70 px-4 py-3">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.bar}`}
            aria-hidden
          />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
            รายละเอียดงาน
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแผง"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 max-sm:h-11 max-sm:w-11"
          >
            <X size={18} />
          </button>
        </div>

        {/* ---- เนื้อใน ---- */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          <div>
            <Label htmlFor="mytask-title">ชื่องาน</Label>
            <Input
              id="mytask-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => commitTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className={task.done ? "line-through decoration-stone-400" : ""}
            />
          </div>

          <Button
            variant={task.done ? "secondary" : "primary"}
            onClick={() => onPatch({ done: !task.done })}
            className="w-full"
          >
            {task.done ? <RotateCcw size={16} /> : <Check size={16} />}
            {task.done ? "กลับมาทำต่อ" : "ทำเสร็จแล้ว"}
          </Button>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mytask-due">กำหนดส่ง</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mytask-due"
                  type="date"
                  value={task.due_date ?? ""}
                  onChange={(e) => onPatch({ due_date: e.target.value || null })}
                />
                {task.due_date && (
                  <button
                    type="button"
                    onClick={() => onPatch({ due_date: null })}
                    aria-label="ล้างกำหนดส่ง"
                    title="ล้างกำหนดส่ง"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 max-sm:h-11 max-sm:w-11"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {due && (
                <span
                  className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${due.chip}`}
                >
                  <CalendarDays size={11} />
                  {due.label}
                </span>
              )}
            </div>
            <div>
              <Label>ความสำคัญ</Label>
              <OptionPicker
                label="ความสำคัญ"
                variant="field"
                view={meta}
                views={opt.priorityMenu}
                onPick={(v) => opt.onPickPriority(task.id, v)}
                onCreate={(name) => opt.onCreate("priority", task.id, name)}
                addLabel="เพิ่มความสำคัญ"
                placeholder="ชื่อระดับความสำคัญ"
                onManage={opt.onManage}
              />
              <p className="mt-1.5 text-xs text-stone-400">
                สีของแถวในลิสต์เปลี่ยนตามค่านี้
              </p>
            </div>
          </div>

          <div>
            <Label>สถานะ</Label>
            <OptionPicker
              label="สถานะ"
              variant="field"
              view={statusMeta}
              views={opt.statusMenu}
              selectedKey={statusSelectedKey(task)}
              onPick={(v) => opt.onPickStatus(task.id, v)}
              onCreate={(name) => opt.onCreate("status", task.id, name)}
              addLabel="เพิ่มสถานะ"
              placeholder="ชื่อสถานะ"
              onManage={opt.onManage}
            />
          </div>

          {groups.length > 0 && (
            <div>
              <Label htmlFor="mytask-group">หมวดหมู่</Label>
              <Select
                id="mytask-group"
                /* group_id ที่ชี้หมวดที่เพิ่งถูกลบ (state ยังไม่ทัน sync) fallback เป็น "" ได้เอง */
                value={task.group_id ?? ""}
                onChange={(e) => onPatch({ group_id: e.target.value || null })}
              >
                <option value="">ยังไม่จัดหมวดหมู่</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label>แท็ก</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {taskTags.map((t) => (
                <TagChip key={t.id} tag={t} onRemove={() => onToggleTag(t.id, false)} />
              ))}
              <TagPicker
                tags={tags}
                selected={task.tagIds}
                onToggle={onToggleTag}
                onCreate={onCreateTag}
                label={taskTags.length ? "เพิ่ม" : "เพิ่มแท็ก"}
              />
            </div>
          </div>

          <FilesSection
            files={task.files}
            uploading={uploading}
            progress={uploadProgress}
            onPick={onUploadFiles}
            onRemove={onRemoveFile}
          />

          <div>
            <Label htmlFor="mytask-note">โน้ต / รายละเอียด</Label>
            <Textarea
              id="mytask-note"
              value={note}
              rows={8}
              onChange={(e) => setNote(e.target.value)}
              onBlur={(e) => commitNote(e.target.value)}
            />
          </div>

          <dl className="space-y-1 border-t border-brand-100/70 pt-3 text-xs text-stone-400">
            <div className="flex justify-between gap-2">
              <dt>สร้างเมื่อ</dt>
              <dd className="text-right">{formatDateTime(task.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>แก้ไขล่าสุด</dt>
              <dd className="text-right">{formatDateTime(task.updated_at)}</dd>
            </div>
            {task.done_at && (
              <div className="flex justify-between gap-2">
                <dt>ทำเสร็จเมื่อ</dt>
                <dd className="text-right">{formatDateTime(task.done_at)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* ---- ท้ายแผง ---- */}
        <div className="shrink-0 border-t border-brand-100/70 px-4 py-3 pb-safe-3 sm:pb-3">
          <Button variant="danger" onClick={onDelete} className="w-full">
            <Trash2 size={16} />
            ลบงานนี้
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}
