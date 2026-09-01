"use client";

/**
 * ผู้รับผิดชอบเคส (0095 → redesign เป็นเช็คลิสต์บทบาท 0104) —
 * รูปโปรไฟล์บนการ์ด + ตัวจัดการในหน้าเคส
 *
 * ผู้ใช้ 2026-09-01:
 *   "ในหน้าเลือกคนรับผิดชอบ ให้ปรับ design ใหม่เป็น check list เช่น 1.ผู้ดูแล ...
 *    2.ผู้ติดตาม ... 3.ผู้ออก Memo ... และมีช่องปุ่มด่านขวาที่ให้กดเลือกว่าใครจะรับ
 *    ต้องมี search ค้นหาด้วย"
 *
 * โมเดล: `influ_assignees.scopes` เก็บ "บทบาท" — โค้ดอ่านผ่าน normalizeRoles() เสมอ
 * (แถวเก่าก่อน 0104 เก็บขอบเขตขั้นงาน contract/followup ซึ่งถูกแปลงเป็น owner/follower)
 * ชุดว่าง = ผู้เกี่ยวข้อง/หัวหน้างาน (ได้แจ้งเตือนแบบเงียบ — กติกาเดิม 0095)
 *
 * `influencers.owner_id` (ผู้สร้างการ์ด) **ยังอยู่ครบและไม่ถูกแทนที่** — แค่ไม่ใช่สิ่งที่การ์ดแสดง
 *
 * กติกาที่ต้องรักษา:
 * - เมาส์ชี้ = ชื่อจาก `title` (ทำงานทุกที่ ไม่ต้องรอ JS) · แตะ/คลิก = แผงรายชื่อเต็ม
 *   ผ่าน portal z-[60] (ทัชสกรีนไม่มี hover — กติกาเป้านิ้วของระบบ)
 * - บนการ์ดของบอร์ดต้อง `stopPropagation` ไม่งั้นแตะรูปแล้วเด้งเข้าหน้าเคส
 * - `AssigneeRolePicker` ถูกใช้ซ้ำในขั้น 1.0 ของหน้าเคส (เลือกผู้ออก Memo) —
 *   แก้พฤติกรรมที่นี่กระทบทั้งสองที่
 */

import { Plus, Search, UserRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  menuBox,
  useAnchoredMenu,
  type MenuBox,
} from "@/components/anchored-menu";
import {
  INFLU_ROLES,
  INFLU_ROLE_ORDER,
  normalizeRoles,
  roleSummary,
  type InfluRole,
} from "@/lib/influ-constants";
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

/** ป้ายบทบาทเล็กๆ */
export function RoleChip({ role }: { role: InfluRole }) {
  const m = INFLU_ROLES[role];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${m.chip}`}
      title={m.desc}
    >
      {m.short}
    </span>
  );
}

/** บรรทัดบทบาทของคนหนึ่ง — ว่าง = ผู้เกี่ยวข้อง/หัวหน้างาน */
function RoleLine({ scopes }: { scopes: InfluScope[] }) {
  const roles = normalizeRoles(scopes);
  if (roles.length === 0) {
    return (
      <span className="text-[10px] text-stone-400">
        ผู้เกี่ยวข้อง (ได้แจ้งเตือนแบบเงียบ)
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <RoleChip key={r} role={r} />
      ))}
    </span>
  );
}

/* ---------- กองรูปบนการ์ด ---------- */

/**
 * รูปผู้รับผิดชอบซ้อนกัน — เมาส์ชี้เห็นชื่อ (title) · แตะ/คลิกเปิดแผงรายชื่อพร้อมบทบาท
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
      return `${p?.name ?? "ไม่ทราบชื่อ"} — ${roleSummary(a.scopes)}`;
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
                      <RoleLine scopes={a.scopes} />
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

/** เพิ่มบทบาทให้คนหนึ่ง — คืน AssigneeChange ที่ถูกต้อง (แถวใหม่หรือแก้ scopes แถวเดิม) */
function addRoleChange(
  existing: CaseAssignee | undefined,
  userId: string,
  role: InfluRole
): AssigneeChange {
  if (!existing) return { kind: "add", userId, scopes: [role] };
  const roles = new Set(normalizeRoles(existing.scopes));
  roles.add(role);
  return {
    kind: "scopes",
    userId,
    scopes: INFLU_ROLE_ORDER.filter((r) => roles.has(r)),
  };
}

/** ถอดบทบาทออกจากคนหนึ่ง — ไม่เหลือบทบาทเลย = ถอดออกจากเคส */
function removeRoleChange(
  existing: CaseAssignee,
  role: InfluRole
): AssigneeChange {
  const rest = normalizeRoles(existing.scopes).filter((r) => r !== role);
  if (rest.length === 0) return { kind: "remove", userId: existing.userId };
  return { kind: "scopes", userId: existing.userId, scopes: rest };
}

/**
 * แถวบทบาทเดียวของเช็คลิสต์ — หัวข้อบทบาท + รายชื่อคนที่ถือ + ปุ่ม "เลือกคน"
 * เปิดช่องค้นหา inline (ไม่ใช่เมนูลอย — ในโมดัล/การ์ดพื้นที่แคบ เมนูลอยโดนบังง่าย)
 * ใช้ทั้งใน AssigneeEditor และการ์ดขั้น 1.0 ของหน้าเคส (เลือกผู้ออก Memo)
 */
export function AssigneeRolePicker({
  role,
  assignees,
  people,
  peopleById,
  canEdit,
  busyUserId,
  onChange,
}: {
  role: InfluRole;
  assignees: CaseAssignee[];
  people: InfluPerson[];
  peopleById: Map<string, InfluPerson>;
  canEdit: boolean;
  /** uid ที่กำลังบันทึกอยู่ — ล็อกปุ่มของแถวนั้น */
  busyUserId?: string | null;
  onChange: (change: AssigneeChange) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const m = INFLU_ROLES[role];

  const members = useMemo(
    () => assignees.filter((a) => normalizeRoles(a.scopes).includes(role)),
    [assignees, role]
  );
  const memberIds = useMemo(
    () => new Set(members.map((a) => a.userId)),
    [members]
  );
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => !memberIds.has(p.id))
      .filter((p) => needle === "" || p.name.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [people, memberIds, q]);

  return (
    <div className="rounded-xl border border-stone-200 bg-white/80 p-2.5">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-stone-800">
            {m.label}
          </span>
          <span className="block text-[11px] text-stone-500">{m.desc}</span>
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setPicking((v) => !v);
              setQ("");
            }}
            aria-expanded={picking}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 max-sm:min-h-11 max-sm:px-3 max-sm:text-sm"
          >
            <Plus size={13} />
            เลือกคน
          </button>
        )}
      </div>

      {/* รายชื่อคนที่ถือบทบาทนี้ */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
        {members.length === 0 && (
          <span className="rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-[11px] text-stone-400">
            ยังไม่ได้เลือก
          </span>
        )}
        {members.map((a) => {
          const p = peopleById.get(a.userId);
          const busy = busyUserId === a.userId;
          return (
            <span
              key={a.userId}
              className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white py-1 pl-1.5 pr-2 text-xs text-stone-700 ${
                busy ? "opacity-60" : ""
              }`}
            >
              <PersonAvatar person={p} size={20} ring={false} />
              <span className="max-w-40 truncate">{p?.name ?? "ไม่ทราบชื่อ"}</span>
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onChange(removeRoleChange(a, role))}
                  aria-label={`ถอด ${p?.name ?? "คนนี้"} ออกจากบทบาท${m.short}`}
                  title={`ถอดออกจากบทบาท${m.short}`}
                  className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-default"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* ช่องค้นหา + ตัวเลือก — กาง inline ใต้แถว */}
      {canEdit && picking && (
        <div className="mt-2 rounded-lg border border-brand-200 bg-white p-2">
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
              aria-label={`ค้นหาบัญชีเพื่อเลือกเป็น${m.short}`}
              className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-8 pr-2 text-base text-stone-800 placeholder:text-stone-500 focus:border-brand-400 focus:outline-none sm:text-sm"
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
                  onChange(
                    addRoleChange(
                      assignees.find((a) => a.userId === p.id),
                      p.id,
                      role
                    )
                  );
                  setPicking(false);
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
            onClick={() => setPicking(false)}
            className="mt-1 w-full cursor-pointer rounded-lg px-2 py-1.5 text-xs text-stone-500 transition-colors hover:bg-stone-50 max-sm:min-h-11 max-sm:text-sm"
          >
            ปิด
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * แผงจัดการผู้รับผิดชอบของเคส — เช็คลิสต์ 3 บทบาท (ผู้ดูแล/ผู้ติดตาม/ผู้ออก Memo)
 * แต่ละแถวเลือกคนได้จากช่องค้นหา; คนเดียวถือหลายบทบาทได้ (เก็บเป็นแถวเดียวใน DB)
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
  // คนที่ไม่ได้ถือบทบาทไหนเลย = ผู้เกี่ยวข้อง/หัวหน้างาน (แจ้งเตือนแบบเงียบ — 0095)
  const watchers = assignees.filter(
    (a) => normalizeRoles(a.scopes).length === 0
  );

  return (
    <div className="space-y-2">
      {assignees.length === 0 && (
        <p className="rounded-lg border border-dashed border-stone-300 px-3 py-2.5 text-xs text-stone-500">
          ยังไม่มีผู้รับผิดชอบ — เคสนี้จะไม่มีใครได้รับแจ้งเตือนเมื่อมีความเคลื่อนไหว
        </p>
      )}

      {INFLU_ROLE_ORDER.map((role) => (
        <AssigneeRolePicker
          key={role}
          role={role}
          assignees={assignees}
          people={people}
          peopleById={peopleById}
          canEdit={canEdit}
          busyUserId={busyUserId}
          onChange={onChange}
        />
      ))}

      {watchers.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white/80 p-2.5">
          <span className="block text-sm font-semibold text-stone-800">
            ผู้เกี่ยวข้อง
          </span>
          <span className="block text-[11px] text-stone-500">
            ไม่ได้ถือบทบาทไหน — ได้แจ้งเตือนทุกความเคลื่อนไหวแบบเงียบ (ระดับ
            &ldquo;อัพเดท&rdquo;)
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {watchers.map((a) => {
              const p = peopleById.get(a.userId);
              const busy = busyUserId === a.userId;
              return (
                <span
                  key={a.userId}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white py-1 pl-1.5 pr-2 text-xs text-stone-700 ${
                    busy ? "opacity-60" : ""
                  }`}
                >
                  <PersonAvatar person={p} size={20} ring={false} />
                  <span className="max-w-40 truncate">
                    {p?.name ?? "ไม่ทราบชื่อ"}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onChange({ kind: "remove", userId: a.userId })
                      }
                      aria-label={`ถอด ${p?.name ?? "คนนี้"} ออกจากผู้เกี่ยวข้อง`}
                      title="ถอดออกจากเคส"
                      className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-default"
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
