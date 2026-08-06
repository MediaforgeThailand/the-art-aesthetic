"use client";

/**
 * โมดัล "จัดการแท็ก" ของ My List — เพิ่ม / เปลี่ยนชื่อ / เปลี่ยนสี / ลบ
 * แท็กเป็นของเจ้าของลิสต์แต่ละคน (RLS ยึด owner_id) — ที่นี่จึงเห็นเฉพาะแท็กของตัวเอง
 */

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, ConfirmDialog, Input, Modal } from "@/components/ui";
import { LIST_TAG_COLOR_ORDER, listTagColor } from "@/lib/constants";
import type { ListTagRow } from "@/lib/types";

export function TagManagerModal({
  open,
  onClose,
  tags,
  usage,
  onCreate,
  onRename,
  onRecolor,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  tags: ListTagRow[];
  /** จำนวนรายการที่ใช้แท็กนั้นอยู่ (เตือนก่อนลบ) */
  usage: Map<string, number>;
  onCreate: (name: string) => Promise<string | null>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const add = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    const id = await onCreate(name);
    setAdding(false);
    if (id) setNewName("");
  };

  const pendingDelete = tags.find((t) => t.id === confirmId) ?? null;

  return (
    <>
      <Modal open={open} onClose={onClose} title="จัดการแท็ก">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="ชื่อแท็กใหม่ เช่น ส่วนตัว, งานด่วน"
            maxLength={40}
          />
          <Button onClick={() => void add()} loading={adding} className="shrink-0">
            <Plus size={16} />
            เพิ่ม
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {tags.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">
              ยังไม่มีแท็ก — เพิ่มอันแรกด้านบน แล้วนำไปติดกับงานในลิสต์ได้เลย
            </p>
          )}
          {tags.map((t) => {
            const used = usage.get(t.id) ?? 0;
            return (
              <div
                key={t.id}
                className="rounded-lg border border-stone-200/80 bg-white/70 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${listTagColor(t.color).dot}`}
                  />
                  <Input
                    defaultValue={t.name}
                    maxLength={40}
                    aria-label={`ชื่อแท็ก ${t.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v) {
                        e.target.value = t.name;
                        return;
                      }
                      if (v !== t.name) onRename(t.id, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmId(t.id)}
                    aria-label={`ลบแท็ก ${t.name}`}
                    title="ลบแท็ก"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-90 max-sm:h-11 max-sm:w-11"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
                  {LIST_TAG_COLOR_ORDER.map((c) => {
                    const meta = listTagColor(c);
                    const on = c === t.color;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onRecolor(t.id, c)}
                        aria-label={`สี${meta.label}`}
                        aria-pressed={on}
                        title={meta.label}
                        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-90 max-sm:h-11 max-sm:w-11 ${
                          on ? "ring-2 ring-brand-400 ring-offset-1" : ""
                        }`}
                      >
                        <span className={`h-4 w-4 rounded-full ${meta.dot}`} />
                      </button>
                    );
                  })}
                  <span className="ml-auto text-xs text-stone-400">
                    {used > 0 ? `ใช้อยู่ ${used} รายการ` : "ยังไม่ได้ใช้"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ลบแท็ก"
        message={
          pendingDelete
            ? `ลบแท็ก “${pendingDelete.name}” ใช่ไหม? ${
                (usage.get(pendingDelete.id) ?? 0) > 0
                  ? `แท็กจะถูกถอดออกจาก ${usage.get(pendingDelete.id)} รายการ (ตัวงานยังอยู่ครบ)`
                  : "แท็กนี้ยังไม่ได้ใช้กับรายการไหน"
              }`
            : ""
        }
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
        }}
        onClose={() => setConfirmId(null)}
      />
    </>
  );
}
