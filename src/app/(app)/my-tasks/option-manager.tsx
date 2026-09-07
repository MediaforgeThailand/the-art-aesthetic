"use client";

/**
 * โมดัล "จัดการตัวเลือก" ของ My List — สถานะ / ความสำคัญ ที่ผู้ใช้กดเพิ่มเอง (list_options, 0072)
 * เพิ่ม / เปลี่ยนชื่อ / เปลี่ยนสี / เรียงลำดับ / ลบ — โครงเดียวกับโมดัลจัดการแท็กและหมวดหมู่
 *
 * เพิ่มตัวเลือกเร็วๆ ทำได้จากในเมนูของช่องนั้นบนตารางอยู่แล้ว (OptionPicker) —
 * ที่นี่ไว้แก้ทั้งชุดในที่เดียว และเป็นทางเดียวที่จะ "ลบ" ตัวเลือกที่พิมพ์ผิด
 *
 * ตัวเลือกในตัว (ยังไม่เสร็จ/เสร็จแล้ว/เลยกำหนด/ใกล้ครบกำหนด และความสำคัญ 4 ระดับ)
 * ไม่อยู่ในนี้ — ลบไม่ได้โดยตั้งใจ เพราะเป็นแกนที่ตัวนับ/ตัวกรองทั้งหน้าอ้างอยู่
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, ConfirmDialog, Input, Modal } from "@/components/ui";
import { LIST_TAG_COLOR_ORDER, listTagColor } from "@/lib/constants";
import type { ListOptionKind, ListOptionRow } from "@/lib/types";
import type { ListOptions } from "./list-utils";

/** ข้อความประจำชนิด — ใช้ทั้งหัวข้อในโมดัล ปุ่มเพิ่ม และข้อความยืนยันตอนลบ */
const KIND_META: Record<
  ListOptionKind,
  { title: string; hint: string; placeholder: string; onDelete: string }
> = {
  status: {
    title: "สถานะที่เพิ่มเอง",
    hint: "สถานะระหว่างทางของงานที่ยังไม่เสร็จ เช่น กำลังทำ · ติดปัญหา · รอคนอื่น",
    placeholder: "ชื่อสถานะใหม่ เช่น กำลังทำ",
    onDelete: "จะกลับไปเป็น “ยังไม่เสร็จ”",
  },
  priority: {
    title: "ความสำคัญที่เพิ่มเอง",
    hint: "ระดับเพิ่มเติมนอกจาก ด่วน · สูง · ปานกลาง · ต่ำ เช่น ไว้ก่อนก็ได้",
    placeholder: "ชื่อความสำคัญใหม่",
    onDelete: "จะกลับไปใช้ความสำคัญในตัวตามค่าเดิม",
  },
};

export function OptionManagerModal({
  open,
  onClose,
  options,
  usage,
  onCreate,
  onRename,
  onRecolor,
  onMove,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** แยกชนิด + เรียงตามลำดับในเมนูมาแล้ว (splitOptions) — ปุ่มลูกศรจึงตรงกับที่เห็นจริง */
  options: ListOptions;
  /** จำนวนงานที่ใช้ตัวเลือกนั้นอยู่ (เตือนก่อนลบ) */
  usage: Map<string, number>;
  onCreate: (kind: ListOptionKind, name: string) => Promise<string | null>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  /** ย้ายขึ้น/ลงหนึ่งขั้นในชนิดของตัวเอง */
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const all = [...options.status, ...options.priority];
  const pendingDelete = all.find((o) => o.id === confirmId) ?? null;
  const pendingUsed = pendingDelete ? usage.get(pendingDelete.id) ?? 0 : 0;

  return (
    <>
      <Modal open={open} onClose={onClose} title="จัดการตัวเลือก">
        <div className="space-y-5">
          <OptionSection
            kind="status"
            rows={options.status}
            usage={usage}
            onCreate={onCreate}
            onRename={onRename}
            onRecolor={onRecolor}
            onMove={onMove}
            onAskDelete={setConfirmId}
          />
          <OptionSection
            kind="priority"
            rows={options.priority}
            usage={usage}
            onCreate={onCreate}
            onRename={onRename}
            onRecolor={onRecolor}
            onMove={onMove}
            onAskDelete={setConfirmId}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ลบตัวเลือก"
        message={
          pendingDelete
            ? `ลบ “${pendingDelete.name}” ใช่ไหม? ${
                pendingUsed > 0
                  ? `งาน ${pendingUsed} รายการที่ใช้อยู่${
                      KIND_META[pendingDelete.kind].onDelete
                    } (ตัวงานยังอยู่ครบ)`
                  : "ตัวเลือกนี้ยังไม่ได้ใช้กับงานไหน"
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

function OptionSection({
  kind,
  rows,
  usage,
  onCreate,
  onRename,
  onRecolor,
  onMove,
  onAskDelete,
}: {
  kind: ListOptionKind;
  rows: ListOptionRow[];
  usage: Map<string, number>;
  onCreate: (kind: ListOptionKind, name: string) => Promise<string | null>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAskDelete: (id: string) => void;
}) {
  const meta = KIND_META[kind];
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    const id = await onCreate(kind, name);
    setAdding(false);
    if (id) setNewName("");
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-stone-800">{meta.title}</h3>
      <p className="mb-2 mt-0.5 text-xs text-stone-400">{meta.hint}</p>

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
          placeholder={meta.placeholder}
          aria-label={meta.placeholder}
          maxLength={30}
        />
        <Button onClick={() => void add()} loading={adding} className="shrink-0">
          <Plus size={16} />
          เพิ่ม
        </Button>
      </div>

      <div className="mt-2 space-y-2">
        {rows.map((o, i) => {
          const used = usage.get(o.id) ?? 0;
          return (
            <div
              key={o.id}
              className="rounded-lg border border-stone-200/80 bg-white/70 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${listTagColor(o.color).dot}`}
                />
                <Input
                  defaultValue={o.name}
                  maxLength={30}
                  aria-label={`ชื่อตัวเลือก ${o.name}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) {
                      e.target.value = o.name;
                      return;
                    }
                    if (v !== o.name) onRename(o.id, v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="min-w-0 flex-1"
                />
                <div className="flex shrink-0 items-center">
                  <IconBtn
                    label={`ย้าย ${o.name} ขึ้น`}
                    disabled={i === 0}
                    onClick={() => onMove(o.id, -1)}
                  >
                    <ArrowUp size={16} />
                  </IconBtn>
                  <IconBtn
                    label={`ย้าย ${o.name} ลง`}
                    disabled={i === rows.length - 1}
                    onClick={() => onMove(o.id, 1)}
                  >
                    <ArrowDown size={16} />
                  </IconBtn>
                  <IconBtn
                    label={`ลบตัวเลือก ${o.name}`}
                    danger
                    onClick={() => onAskDelete(o.id)}
                  >
                    <Trash2 size={16} />
                  </IconBtn>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
                {LIST_TAG_COLOR_ORDER.map((c) => {
                  const cm = listTagColor(c);
                  const on = c === o.color;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onRecolor(o.id, c)}
                      aria-label={`สี${cm.label}`}
                      aria-pressed={on}
                      title={cm.label}
                      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-90 max-sm:h-11 max-sm:w-11 ${
                        on ? "ring-2 ring-brand-400 ring-offset-1" : ""
                      }`}
                    >
                      <span className={`h-4 w-4 rounded-full ${cm.dot}`} />
                    </button>
                  );
                })}
                <span className="ml-auto text-xs text-stone-400">
                  {used > 0 ? `ใช้อยู่ ${used} งาน` : "ยังไม่ได้ใช้"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IconBtn({
  label,
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 max-sm:h-11 max-sm:w-11 ${
        danger
          ? "hover:bg-rose-50 hover:text-rose-600"
          : "hover:bg-brand-50 hover:text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}
