"use client";

/**
 * โมดัล "จัดการหมวดหมู่" ของ My List — เพิ่ม / เปลี่ยนชื่อ / เปลี่ยนสี / เรียงลำดับ / ลบ
 * (หมวดหมู่ = หัวข้อใหญ่บนบอร์ดแบบกลุ่มของ Monday — ตาราง list_groups, migration 0067)
 * หมวดเป็นของเจ้าของลิสต์แต่ละคน (RLS ยึด owner_id) — ที่นี่จึงเห็นเฉพาะหมวดของตัวเอง
 * เปลี่ยนชื่อเร็วๆ ทำ inline ที่หัวกลุ่มบนบอร์ดได้ด้วย โมดัลนี้ไว้จัดการทั้งชุดในที่เดียว
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, ConfirmDialog, Input, Modal } from "@/components/ui";
import { LIST_TAG_COLOR_ORDER, listTagColor } from "@/lib/constants";
import type { ListGroupRow } from "@/lib/types";

export function GroupManagerModal({
  open,
  onClose,
  groups,
  usage,
  onCreate,
  onRename,
  onRecolor,
  onMove,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** เรียงตามลำดับบนบอร์ดมาแล้ว (sortListGroups) — ปุ่มลูกศรจึงตรงกับที่เห็นจริง */
  groups: ListGroupRow[];
  /** จำนวนงานในแต่ละหมวด (เตือนก่อนลบ) */
  usage: Map<string, number>;
  onCreate: (name: string) => Promise<string | null>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  /** ย้ายหมวดขึ้น/ลงหนึ่งขั้น */
  onMove: (id: string, dir: -1 | 1) => void;
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

  const pendingDelete = groups.find((g) => g.id === confirmId) ?? null;

  return (
    <>
      <Modal open={open} onClose={onClose} title="จัดการหมวดหมู่">
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
            placeholder="ชื่อหมวดหมู่ใหม่"
            maxLength={60}
          />
          <Button onClick={() => void add()} loading={adding} className="shrink-0">
            <Plus size={16} />
            เพิ่ม
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {groups.map((g, i) => {
            const used = usage.get(g.id) ?? 0;
            return (
              <div
                key={g.id}
                className="rounded-lg border border-stone-200/80 bg-white/70 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${listTagColor(g.color).dot}`}
                  />
                  <Input
                    defaultValue={g.name}
                    maxLength={60}
                    aria-label={`ชื่อหมวด ${g.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v) {
                        e.target.value = g.name;
                        return;
                      }
                      if (v !== g.name) onRename(g.id, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="min-w-0 flex-1"
                  />
                  {/* ลำดับบนบอร์ด — ขึ้น/ลงทีละขั้น (แถวบนสุด = กลุ่มบนสุดของบอร์ด) */}
                  <button
                    type="button"
                    onClick={() => onMove(g.id, -1)}
                    disabled={i === 0}
                    aria-label={`เลื่อนหมวด ${g.name} ขึ้น`}
                    title="เลื่อนขึ้น"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 disabled:cursor-default disabled:opacity-30 max-sm:h-11 max-sm:w-11"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(g.id, 1)}
                    disabled={i === groups.length - 1}
                    aria-label={`เลื่อนหมวด ${g.name} ลง`}
                    title="เลื่อนลง"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 active:scale-90 disabled:cursor-default disabled:opacity-30 max-sm:h-11 max-sm:w-11"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(g.id)}
                    aria-label={`ลบหมวด ${g.name}`}
                    title="ลบหมวด"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-90 max-sm:h-11 max-sm:w-11"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
                  {LIST_TAG_COLOR_ORDER.map((c) => {
                    const meta = listTagColor(c);
                    const on = c === g.color;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onRecolor(g.id, c)}
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
                    {used > 0 ? `มีงาน ${used} รายการ` : "ยังไม่มีงาน"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ลบหมวดหมู่"
        message={
          pendingDelete
            ? `ลบหมวด “${pendingDelete.name}” ใช่ไหม? ${
                (usage.get(pendingDelete.id) ?? 0) > 0
                  ? `งาน ${usage.get(pendingDelete.id)} รายการในหมวดจะย้ายไป “ยังไม่จัดหมวดหมู่” (ตัวงานไม่ถูกลบ)`
                  : "หมวดนี้ยังไม่มีงานอยู่"
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
