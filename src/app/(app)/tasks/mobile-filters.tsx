"use client";

import { EyeOff, Search, SlidersHorizontal, X } from "lucide-react";
import { Button, Input, Modal, Select } from "@/components/ui";
import type { ProfileRow } from "@/lib/types";
import { PersonSelect, type PersonOption } from "./person-select";
import { AssigneeAvatar, profileName } from "./task-card";

/* ============================================================================
   ตัวกรองเวอร์ชันมือถือ (<lg)
   ----------------------------------------------------------------------------
   แถวตัวกรองเดิมเป็น flex-wrap ของคอนโทรล 6-7 ตัว — บนจอ 375px มันตกบรรทัดจน
   สูงเกือบครึ่งจอ เหลือที่ให้บอร์ดนิดเดียว (ตามภาพที่ผู้ใช้ส่งมา). เวอร์ชันนี้
   เหลือแถวเดียว = ช่องค้นหา + ปุ่ม "ตัวกรอง" แล้วตัวกรองที่เหลือไปอยู่ในชีต
   ที่เลื่อนขึ้นมาจากขอบล่าง (ใช้ `Modal` ของระบบ ซึ่งบนมือถือเป็น bottom sheet
   พร้อม Esc/ล็อก scroll/safe-area ให้แล้ว)

   กติกา: ปุ่มตัวกรองต้องมีตัวเลขบอกจำนวนตัวกรองที่เปิดอยู่เสมอ — ตัวกรองที่
   ซ่อนอยู่ในชีตทำให้คนคิดว่าข้อมูลหาย (บทเรียนเดียวกับ my-tasks / Hunting)
   ========================================================================== */

type ProfileOption = Pick<
  ProfileRow,
  "id" | "full_name" | "email" | "avatar_path"
>;

/** ตัวเลือกสถานะที่ยกเว้นได้ — key ตรงกับตัวกรองสถานะของบอร์ด */
const EXCLUDE_STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: "working", label: "กำลังทำ" },
  { key: "pending", label: "รอตรวจ" },
  { key: "done", label: "เสร็จสมบูรณ์" },
];

/* ---------- แถบเครื่องมือแถวเดียว ---------- */

export function MobileFilterBar({
  search,
  onSearch,
  placeholder,
  activeCount,
  onOpen,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  /** จำนวนตัวกรองที่เปิดอยู่ (ไม่นับช่องค้นหาที่เห็นอยู่แล้ว) */
  activeCount: number;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
        <Input
          type="search"
          placeholder={placeholder}
          className="min-h-11 rounded-full pl-9"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label="เปิดตัวกรอง"
        className={`relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors ${
          activeCount > 0
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-stone-300/80 bg-white/80 text-stone-500"
        }`}
      >
        <SlidersHorizontal size={18} />
        {activeCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold leading-none text-cream">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}

/* ---------- โครงชีต (ใช้ร่วมทั้งแท็บบันทึกงานและแท็บงานเสร็จ) ---------- */

function FilterSheet({
  open,
  onClose,
  onClear,
  hasFilter,
  resultLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  hasFilter: boolean;
  /** ข้อความบนปุ่มปิดชีต เช่น "ดูผลลัพธ์ 12 งาน" */
  resultLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title="ตัวกรอง">
      <div className="space-y-4">
        {children}
        {/* แถบท้ายติดหนึบ — bleed ออกไปชนขอบชีต (-mx-5) แล้วทาพื้นทึบ ไม่งั้นรายการ
            ที่เลื่อนอยู่ข้างหลังทะลุขึ้นมาปนกับปุ่ม */}
        <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-stone-200/70 bg-white px-5 pb-1 pt-3">
          {hasFilter && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-500 transition-colors active:bg-stone-100"
            >
              <X size={15} />
              ล้างตัวกรอง
            </button>
          )}
          <Button onClick={onClose} className="flex-1">
            {resultLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SheetField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-stone-500">{label}</p>
      {children}
    </div>
  );
}

function CheckRow({
  checked,
  label,
  avatar,
  onToggle,
}: {
  checked: boolean;
  label: string;
  avatar?: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-stone-700 transition-colors active:bg-brand-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
      />
      {avatar}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

/* ---------- ชีตของแท็บ "บันทึกงาน" ---------- */

export function MobileWorkFilterSheet({
  open,
  onClose,
  profiles,
  userId,
  meProfile,
  assigneeFilter,
  onAssigneeFilter,
  statusFilter,
  onStatusFilter,
  statusCounts,
  dueFrom,
  dueTo,
  onDueFrom,
  onDueTo,
  excludeAssignees,
  excludeStatuses,
  onToggleExcludeAssignee,
  onToggleExcludeStatus,
  hasFilter,
  onClear,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  profiles: ProfileOption[];
  userId: string | null;
  meProfile: ProfileOption | null;
  assigneeFilter: string;
  onAssigneeFilter: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  statusCounts: { all: number; working: number; pending: number; done: number };
  dueFrom: string;
  dueTo: string;
  onDueFrom: (v: string) => void;
  onDueTo: (v: string) => void;
  excludeAssignees: string[];
  excludeStatuses: string[];
  onToggleExcludeAssignee: (id: string) => void;
  onToggleExcludeStatus: (key: string) => void;
  hasFilter: boolean;
  onClear: () => void;
  resultCount: number;
}) {
  const assigneeOptions: PersonOption[] = [
    { value: "all", label: "ทั้งหมด" },
    ...(userId !== null
      ? [
          { value: "involved", label: "เกี่ยวข้องกับฉัน", profile: meProfile },
          { value: "me", label: "งานของฉัน", profile: meProfile },
        ]
      : []),
    { value: "none", label: "ไม่ระบุ", profile: null },
    ...profiles
      .filter((p) => p.id !== userId)
      .map((p) => ({ value: p.id, profile: p })),
  ];

  return (
    <FilterSheet
      open={open}
      onClose={onClose}
      onClear={onClear}
      hasFilter={hasFilter}
      resultLabel={`ดูผลลัพธ์ ${resultCount} งาน`}
    >
      <SheetField label="ผู้รับผิดชอบ">
        <PersonSelect
          ariaLabel="กรองตามผู้รับผิดชอบ"
          value={assigneeFilter}
          onChange={onAssigneeFilter}
          options={assigneeOptions}
        />
      </SheetField>

      <SheetField label="สถานะ">
        <Select
          aria-label="กรองตามสถานะ"
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value)}
        >
          <option value="all">ทั้งหมด ({statusCounts.all})</option>
          <option value="working">กำลังทำ ({statusCounts.working})</option>
          <option value="pending">รอตรวจ ({statusCounts.pending})</option>
          <option value="done">เสร็จสมบูรณ์ ({statusCounts.done})</option>
        </Select>
      </SheetField>

      <SheetField label="กำหนดส่ง">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="กำหนดส่งตั้งแต่วันที่"
            value={dueFrom}
            onChange={(e) => onDueFrom(e.target.value)}
            className="min-h-11 min-w-0"
          />
          <span className="shrink-0 text-xs text-stone-400">ถึง</span>
          <Input
            type="date"
            aria-label="กำหนดส่งถึงวันที่"
            value={dueTo}
            onChange={(e) => onDueTo(e.target.value)}
            className="min-h-11 min-w-0"
          />
        </div>
      </SheetField>

      {/* ยกเว้น (ซ่อน) — บนมือถือกางเป็นลิสต์ในชีตเลย ไม่ใช้ popover ลอยแบบจอใหญ่
          (popover เป็น z-[60] จะถูกชีต z-[80] บังทั้งอัน) */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500">
          <EyeOff size={13} />
          ยกเว้น (ซ่อน) งานที่…
        </p>
        <div className="rounded-xl border border-stone-200/80 bg-white/70 p-1">
          <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
            สถานะ
          </p>
          {EXCLUDE_STATUS_OPTIONS.map((s) => (
            <CheckRow
              key={s.key}
              checked={excludeStatuses.includes(s.key)}
              label={s.label}
              onToggle={() => onToggleExcludeStatus(s.key)}
            />
          ))}
          <p className="px-2 pt-2 text-[11px] font-medium uppercase tracking-wide text-stone-400">
            ผู้รับผิดชอบ
          </p>
          <div className="max-h-60 overflow-y-auto">
            <CheckRow
              checked={excludeAssignees.includes("none")}
              label="ไม่ระบุผู้รับผิดชอบ"
              avatar={<AssigneeAvatar assignee={null} size={5} />}
              onToggle={() => onToggleExcludeAssignee("none")}
            />
            {profiles.map((p) => (
              <CheckRow
                key={p.id}
                checked={excludeAssignees.includes(p.id)}
                label={`${profileName(p)}${p.id === userId ? " (ฉัน)" : ""}`}
                avatar={<AssigneeAvatar assignee={p} size={5} />}
                onToggle={() => onToggleExcludeAssignee(p.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </FilterSheet>
  );
}

/* ---------- ชีตของแท็บ "งานเสร็จ" (ตรวจแล้ว) ---------- */

export function MobileApprovedFilterSheet({
  open,
  onClose,
  profiles,
  reviewerOptions,
  userId,
  meProfile,
  assignee,
  onAssignee,
  reviewer,
  onReviewer,
  posted,
  onPosted,
  from,
  to,
  onFrom,
  onTo,
  hasFilter,
  onClear,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  profiles: ProfileOption[];
  reviewerOptions: ProfileOption[];
  userId: string | null;
  meProfile: ProfileOption | null;
  assignee: string;
  onAssignee: (v: string) => void;
  reviewer: string;
  onReviewer: (v: string) => void;
  posted: string;
  onPosted: (v: string) => void;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  hasFilter: boolean;
  onClear: () => void;
  resultCount: number;
}) {
  return (
    <FilterSheet
      open={open}
      onClose={onClose}
      onClear={onClear}
      hasFilter={hasFilter}
      resultLabel={`ดูผลลัพธ์ ${resultCount} งาน`}
    >
      <SheetField label="ผู้รับผิดชอบ">
        <PersonSelect
          ariaLabel="กรองตามผู้รับผิดชอบ"
          value={assignee}
          onChange={onAssignee}
          options={[
            { value: "all", label: "ทั้งหมด" },
            ...(userId !== null
              ? [{ value: "me", label: "งานของฉัน", profile: meProfile }]
              : []),
            { value: "none", label: "ไม่ระบุ", profile: null },
            ...profiles
              .filter((p) => p.id !== userId)
              .map((p) => ({ value: p.id, profile: p })),
          ]}
        />
      </SheetField>

      <SheetField label="ผู้ตรวจ">
        <PersonSelect
          ariaLabel="กรองตามผู้ตรวจ"
          value={reviewer}
          onChange={onReviewer}
          options={[
            { value: "all", label: "ทั้งหมด" },
            ...(userId !== null
              ? [{ value: "me", label: "ฉันเป็นผู้ตรวจ", profile: meProfile }]
              : []),
            ...reviewerOptions
              .filter((p) => p.id !== userId)
              .map((p) => ({ value: p.id, profile: p })),
          ]}
        />
      </SheetField>

      <SheetField label="การใช้งาน">
        <Select
          aria-label="กรองตามสถานะการโพส"
          value={posted}
          onChange={(e) => onPosted(e.target.value)}
        >
          <option value="all">ทั้งหมด</option>
          <option value="unposted">ยังไม่ได้โพส</option>
          <option value="posted">โพส/ใช้แล้ว</option>
        </Select>
      </SheetField>

      <SheetField label="ตรวจผ่านเมื่อ">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="ตรวจผ่านตั้งแต่วันที่"
            value={from}
            onChange={(e) => onFrom(e.target.value)}
            className="min-h-11 min-w-0"
          />
          <span className="shrink-0 text-xs text-stone-400">ถึง</span>
          <Input
            type="date"
            aria-label="ตรวจผ่านถึงวันที่"
            value={to}
            onChange={(e) => onTo(e.target.value)}
            className="min-h-11 min-w-0"
          />
        </div>
      </SheetField>
    </FilterSheet>
  );
}
