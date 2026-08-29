"use client";

/**
 * ผู้รับผิดชอบเคส (0095) — รูปโปรไฟล์บนการ์ด + ตัวจัดการในหน้าเคส
 *
 * ผู้ใช้ 2026-08-29:
 *   "ตอนนี้ card จะแสดงผู้สร้าง ให้เก็บเป็นข้อมูลไว้ ส่วนอันที่แสดงให้แสดงเป็นผู้รับผิดชอบแทน
 *    โดยสามารถมีได้มากกว่า 1 คน และการแสดงให้แสดงเป็น profile คนนั้นแทนการแสดง text
 *    และถ้าอยากรู้ชื่อทำให้เอาเมาส์ไปชี้แล้วจะเห็น ถ้าเป็น mobile กด profile แล้วจะแสดงชื่อแทน"
 *
 * `influencers.owner_id` (ผู้สร้างการ์ด) **ยังอยู่ครบและไม่ถูกแทนที่** — แค่ไม่ใช่สิ่งที่การ์ดแสดง
 * อีกต่อไป (ดูได้ที่หน้าเคส บรรทัด "สร้างโดย")
 *
 * กติกาที่ต้องรักษา:
 * - เมาส์ชี้ = ชื่อจาก `title` (ทำงานทุกที่ ไม่ต้องรอ JS) · แตะ/คลิก = แผงรายชื่อเต็ม
 *   ผ่าน portal z-[60] (ทัชสกรีนไม่มี hover — กติกาเป้านิ้วของระบบ)
 * - บนการ์ดของบอร์ดต้อง `stopPropagation` ไม่งั้นแตะรูปแล้วเด้งเข้าหน้าเคส
 */

import { Check, Plus, Search, UserRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  menuBox,
  useAnchoredMenu,
  type MenuBox,
} from "@/components/anchored-menu";
import { INFLU_SCOPE_ORDER, INFLU_SCOPES } from "@/lib/influ-constants";
import { useSignedUrl } from "@/lib/use-signed-url";
import type { InfluScope } from "@/lib/types";

/** บัญชีในระบบ (ย่อ) — ที่มาของรูป/ชื่อบนการ์ดและในตัวเลือก */
export type InfluPerson = {
  id: string;
  name: string;
  avatarPath: string | null;
  jobTitle: string | null;
};

/** ผู้รับผิดชอบ 1 คนของเคส */
export type CaseAssignee = {
  userId: string;
  scopes: InfluScope[];
};

/* ---------- รูปโปรไฟล์ ---------- */

export function PersonAvatar({
  person,
  size = 24,
  ring = true,
}: {
  person: InfluPerson | undefined;
  size?: number;
  ring?: boolean;
}) {
  const { url } = useSignedUrl(person?.avatarPath ?? null);
  const style = { width: size, height: size };
  const cls = `shrink-0 rounded-full object-cover ${
    ring ? "ring-2 ring-white" : ""
  }`;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed URL ชั่วคราว ใช้ next/image ไม่ได้
      <img src={url} alt="" style={style} className={cls} />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-semibold text-brand-800 ${
        ring ? "ring-2 ring-white" : ""
      }`}
    >
      {(person?.name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

/** ป้ายขอบเขตงานเล็กๆ */
export function ScopeChip({ scope }: { scope: InfluScope }) {
  const m = INFLU_SCOPES[scope];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${m.chip}`}
      title={m.desc}
    >
      {m.short}
    </span>
  );
}

/** บรรทัดขอบเขตของคนหนึ่ง — ว่าง = ผู้เกี่ยวข้อง/หัวหน้างาน */
function ScopeLine({ scopes }: { scopes: InfluScope[] }) {
  if (scopes.length === 0) {
    return (
      <span className="text-[10px] text-stone-400">
        ผู้เกี่ยวข้อง (ได้แจ้งเตือนแบบเงียบ)
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {INFLU_SCOPE_ORDER.filter((s) => scopes.includes(s)).map((s) => (
        <ScopeChip key={s} scope={s} />
      ))}
    </span>
  );
}

/* ---------- กองรูปบนการ์ด ---------- */

/**
 * รูปผู้รับผิดชอบซ้อนกัน — เมาส์ชี้เห็นชื่อ (title) · แตะ/คลิกเปิดแผงรายชื่อพร้อมขอบเขตงาน
 * ไม่มีผู้รับผิดชอบ = ชิปเตือนจางๆ ให้เห็นว่ายังไม่มีเจ้าภาพ (สำคัญกว่าปล่อยว่าง)
 */
export function AssigneeStack({
  assignees,
  peopleById,
  max = 3,
  size = 24,
  emptyLabel = "ยังไม่มีผู้รับผิดชอบ",
}: {
  assignees: CaseAssignee[];
  peopleById: Map<string, InfluPerson>;
  max?: number;
  size?: number;
  emptyLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const place = (a: HTMLElement) => setBox(menuBox(a, { width: 236, maxHeight: 320 }));
  useAnchoredMenu({
    open,
    anchorRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: place,
  });

  if (assignees.length === 0) {
    if (!emptyLabel) return null;
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-[10px] text-stone-400">
        <UserRound size={10} />
        {emptyLabel}
      </span>
    );
  }

  const shown = assignees.slice(0, max);
  const rest = assignees.length - shown.length;
  const title = assignees
    .map((a) => {
      const p = peopleById.get(a.userId);
      const scopes = a.scopes.length
        ? INFLU_SCOPE_ORDER.filter((s) => a.scopes.includes(s))
            .map((s) => INFLU_SCOPES[s].short)
            .join(" · ")
        : "ผู้เกี่ยวข้อง";
      return `${p?.name ?? "ไม่ทราบชื่อ"} — ${scopes}`;
    })
    .join("\n");

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title={title}
        aria-label={`ผู้รับผิดชอบ ${assignees.length} คน — กดเพื่อดูรายชื่อ`}
        onClick={(e) => {
          // การ์ดบนบอร์ดกดแล้วเปิดหน้าเคส — แตะรูปต้องไม่ทะลุไป
          e.stopPropagation();
          e.preventDefault();
          const a = anchorRef.current;
          if (a) place(a);
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex cursor-pointer items-center rounded-full transition-transform active:scale-95"
      >
        <span className="flex items-center -space-x-1.5">
          {shown.map((a) => (
            <PersonAvatar
              key={a.userId}
              person={peopleById.get(a.userId)}
              size={size}
            />
          ))}
          {rest > 0 && (
            <span
              style={{ width: size, height: size }}
              className="flex shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-semibold text-stone-600 ring-2 ring-white"
            >
              +{rest}
            </span>
          )}
        </span>
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: box.x,
              top: box.y,
              width: box.width,
              maxHeight: box.height,
            }}
            onClick={(e) => e.stopPropagation()}
            className="z-[60] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl animate-scale-in"
          >
            <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
              ผู้รับผิดชอบ
            </p>
            {assignees.map((a) => {
              const p = peopleById.get(a.userId);
              return (
                <div
                  key={a.userId}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5"
                >
                  <PersonAvatar person={p} size={26} ring={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-stone-800">
                      {p?.name ?? "ไม่ทราบชื่อ"}
                    </span>
                    <span className="mt-0.5 block">
                      <ScopeLine scopes={a.scopes} />
                    </span>
                  </span>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

/* ---------- ตัวจัดการผู้รับผิดชอบ (หน้าเคส) ---------- */

export type AssigneeChange =
  | { kind: "add"; userId: string; scopes: InfluScope[] }
  | { kind: "remove"; userId: string }
  | { kind: "scopes"; userId: string; scopes: InfluScope[] };

/**
 * แผงจัดการผู้รับผิดชอบของเคส — เพิ่ม/ถอด/เลือกขอบเขตงานรายคน
 * ตัวเขียน DB + log + แจ้งเตือนอยู่ที่หน้าเคส (ส่งมาทาง `onChange`) เพื่อให้ที่นี่เป็น UI ล้วน
 */
export function AssigneeEditor({
  assignees,
  people,
  peopleById,
  canEdit,
  busyUserId,
  onChange,
}: {
  assignees: CaseAssignee[];
  /** ตัวเลือกทั้งหมด (บัญชีในระบบ) */
  people: InfluPerson[];
  peopleById: Map<string, InfluPerson>;
  canEdit: boolean;
  /** uid ที่กำลังบันทึกอยู่ — ล็อกปุ่มของแถวนั้น */
  busyUserId?: string | null;
  onChange: (change: AssigneeChange) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const taken = useMemo(
    () => new Set(assignees.map((a) => a.userId)),
    [assignees]
  );
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => !taken.has(p.id))
      .filter((p) => needle === "" || p.name.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [people, taken, q]);

  const toggleScope = (a: CaseAssignee, s: InfluScope) => {
    const next = a.scopes.includes(s)
      ? a.scopes.filter((x) => x !== s)
      : [...a.scopes, s];
    onChange({ kind: "scopes", userId: a.userId, scopes: next });
  };

  return (
    <div className="space-y-2">
      {assignees.length === 0 && (
        <p className="rounded-lg border border-dashed border-stone-300 px-3 py-2.5 text-xs text-stone-500">
          ยังไม่มีผู้รับผิดชอบ — เคสนี้จะไม่มีใครได้รับแจ้งเตือนเมื่อมีความเคลื่อนไหว
        </p>
      )}

      {assignees.map((a) => {
        const p = peopleById.get(a.userId);
        const busy = busyUserId === a.userId;
        return (
          <div
            key={a.userId}
            className={`rounded-lg border border-stone-200 bg-white/80 p-2.5 ${
              busy ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <PersonAvatar person={p} size={30} ring={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-stone-800">
                  {p?.name ?? "ไม่ทราบชื่อ"}
                </span>
                {p?.jobTitle && (
                  <span className="block truncate text-[11px] text-stone-400">
                    {p.jobTitle}
                  </span>
                )}
              </span>
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onChange({ kind: "remove", userId: a.userId })}
                  aria-label={`ถอด ${p?.name ?? "คนนี้"} ออกจากผู้รับผิดชอบ`}
                  title="ถอดออกจากผู้รับผิดชอบ"
                  className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-default max-sm:h-11 max-sm:w-11 sm:h-8 sm:w-8"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* ขอบเขตงาน = ตัวตัดสินว่าใครได้แจ้งเตือนแบบ "ต้องลงมือ" */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {INFLU_SCOPE_ORDER.map((s) => {
                const on = a.scopes.includes(s);
                const m = INFLU_SCOPES[s];
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => toggleScope(a, s)}
                    title={m.desc}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors max-sm:min-h-11 max-sm:px-3 max-sm:text-sm ${
                      on
                        ? `${m.chip} font-medium`
                        : "border-stone-200 bg-white text-stone-400 hover:border-stone-300"
                    } ${canEdit && !busy ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {on && <Check size={11} />}
                    {m.label}
                  </button>
                );
              })}
            </div>
            {a.scopes.length === 0 && (
              <p className="mt-1.5 text-[11px] text-stone-400">
                ไม่ได้ถือขั้นไหน = หัวหน้างาน/ผู้เกี่ยวข้อง — ได้แจ้งเตือนทุกความเคลื่อนไหว
                แต่เป็นระดับ “อัพเดท” ไม่เด่น
              </p>
            )}
          </div>
        );
      })}

      {canEdit && !adding && (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setQ("");
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 max-sm:min-h-11"
        >
          <Plus size={15} />
          เพิ่มผู้รับผิดชอบ
        </button>
      )}

      {canEdit && adding && (
        <div className="rounded-lg border border-brand-200 bg-white p-2">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ..."
              aria-label="ค้นหาบัญชีเพื่อเพิ่มเป็นผู้รับผิดชอบ"
              className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-2 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
            />
          </div>
          <div className="mt-1.5 max-h-56 overflow-y-auto">
            {options.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-stone-400">
                ไม่พบบัญชีที่ตรงกับคำค้น
              </p>
            )}
            {options.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  // เพิ่มเข้ามาแบบ "ทุกขั้น" ก่อน แล้วค่อยติ๊กเอาออกให้ตรงงานจริง —
                  // ปลอดภัยกว่าเพิ่มมาแบบไม่มีขอบเขต (จะไม่ได้แจ้งเตือนที่ต้องลงมือเลย)
                  onChange({
                    kind: "add",
                    userId: p.id,
                    scopes: [...INFLU_SCOPE_ORDER],
                  });
                  setAdding(false);
                  setQ("");
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-50/70 max-sm:min-h-11"
              >
                <PersonAvatar person={p} size={26} ring={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-stone-800">
                    {p.name}
                  </span>
                  {p.jobTitle && (
                    <span className="block truncate text-[11px] text-stone-400">
                      {p.jobTitle}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-1 w-full cursor-pointer rounded-lg px-2 py-1.5 text-xs text-stone-500 transition-colors hover:bg-stone-50 max-sm:min-h-11 max-sm:text-sm"
          >
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  );
}
