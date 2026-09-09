"use client";

import {
  AlertCircle,
  Check,
  ChevronRight,
  Inbox,
  RefreshCw,
  Settings2,
  UserRoundCog,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button, EmptyState, Label, Modal, Select, Textarea } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import {
  acknowledgeAssignment,
  assignPending,
  reassign,
  voidAssignment,
} from "@/lib/queue/actions";
import type { QueueAssignmentRow } from "@/lib/queue/data";
import { StatusBadge } from "./pieces";

export type MemberChoice = { id: string; display_name: string };

type DialogKind = "menu" | "reassign" | "void" | "assign";
type Dialog = { kind: DialogKind; row: QueueAssignmentRow } | null;

const DIALOG_TITLE: Record<DialogKind, string> = {
  menu: "จัดการคิวนี้",
  reassign: "ย้ายคิวไปคนอื่น",
  void: "ยกเลิกคิวนี้",
  assign: "จ่ายคิวเอง",
};

/* คอลัมน์ตารางบนจอ ≥sm: คิว | ลูกค้า | หัตถการ | นัด | ผู้รับ | สถานะ | ปุ่ม
   หัวตารางกับทุกแถวต้องใช้ template เดียวกันถึงจะตรงคอลัมน์ */
const GRID_COLS =
  "sm:grid-cols-[2.5rem_minmax(0,1.25fr)_minmax(0,1fr)_6.75rem_6.5rem_7.5rem_2.75rem]";

/** นัดแบบสั้นสำหรับแถวตาราง เช่น "30 ส.ค. 14:00" */
function appointmentLabel(row: QueueAssignmentRow): string {
  const c = row.case;
  if (!c?.appointment_date) return "—";
  const time = c.appointment_time ? ` ${c.appointment_time.slice(0, 5)}` : "";
  return `${formatDateShort(c.appointment_date)}${time}`;
}

export function AssignmentList({
  rows,
  canManage = false,
  canAcknowledge = false,
  myMemberId,
  members = [],
  todayKey,
  emptyText = "ยังไม่มีคิว",
}: {
  rows: QueueAssignmentRow[];
  /** แอดมิน: จ่ายคิว / ย้ายคิว / ยกเลิก — ทั้งหมดอยู่หลังปุ่มฟันเฟือง ไม่โชว์เป็นปุ่มปกติ */
  canManage?: boolean;
  /** เจ้าของคิว (หน้า "คิวของฉัน"): กดรับทราบได้ */
  canAcknowledge?: boolean;
  /** แอดมินที่ลงคิวเองด้วย — ให้กดรับทราบคิวของตัวเองได้จากหน้ารวม */
  myMemberId?: string;
  members?: MemberChoice[];
  /** วันที่วันนี้ (เวลาไทย, YYYY-MM-DD) — ใช้ขึ้นหัว "วันนี้" คั่นรายการข้ามวัน */
  todayKey?: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [cancelCase, setCancelCase] = useState(true);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "ทำรายการไม่สำเร็จ");
        return;
      }
      setDialog(null);
      router.refresh();
    });
  }

  function openForm(kind: Exclude<DialogKind, "menu">, row: QueueAssignmentRow) {
    setReason("");
    setTarget("");
    setCancelCase(true);
    setError(null);
    setDialog({ kind, row });
  }

  function submitDialog() {
    if (!dialog || dialog.kind === "menu") return;
    const { kind, row } = dialog;
    if (kind === "reassign") {
      if (!reason.trim()) return setError("ต้องระบุเหตุผลก่อนย้ายคิว");
      run(() => reassign(row.id, reason.trim(), target || null));
    } else if (kind === "void") {
      if (!reason.trim()) return setError("ต้องระบุเหตุผลก่อนยกเลิก");
      run(() => voidAssignment(row.id, reason.trim(), cancelCase));
    } else {
      run(() => assignPending(row.id, target || null, reason.trim() || undefined));
    }
  }

  if (rows.length === 0) {
    return <EmptyState icon={<Inbox size={40} />} title={emptyText} />;
  }

  return (
    <div>
      {error && !dialog && (
        <p className="mb-2 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="glass overflow-hidden rounded-xl">
        {/* หัวตาราง — จอ ≥sm เท่านั้น (มือถือเป็นแถว 2 บรรทัด ไม่มีคอลัมน์ให้ตั้งหัว) */}
        <div
          className={`hidden gap-2 border-b border-stone-200/70 px-3 py-2 text-xs font-medium text-stone-400 sm:grid ${GRID_COLS}`}
        >
          <span className="text-center">คิว</span>
          <span>ลูกค้า</span>
          <span>หัตถการ</span>
          <span>นัด</span>
          <span>ผู้รับ</span>
          <span>สถานะ</span>
          <span />
        </div>

        <ul>
          {rows.map((row, index) => {
            const c = row.case;
            const needsAck = row.status === "assigned";
            const isPending = row.status === "pending_manual_assignment";
            const open = needsAck || row.status === "acknowledged" || isPending;
            const showAck =
              needsAck && (canAcknowledge || (myMemberId != null && row.member_id === myMemberId));
            const showGear = canManage && open;

            // รายการเรียงจากใหม่ไปเก่า — พอวันเปลี่ยนให้คั่นหัววันที่ จะได้ไม่งงว่า
            // "คิววันนี้" ทำไมมีของเมื่อวานปน (แถวเก่าเก็บไว้ให้ตามย้อนหลังได้)
            const prevDate = index > 0 ? rows[index - 1].assigned_date : null;
            const dateHeader =
              row.assigned_date !== prevDate
                ? todayKey && row.assigned_date === todayKey
                  ? "วันนี้"
                  : formatDateShort(row.assigned_date)
                : null;

            const action: ReactNode = showAck ? (
              <Button
                variant="primary"
                className="relative z-10 shrink-0 px-3 py-1.5 text-xs max-sm:min-h-9 max-sm:py-1.5"
                loading={pending}
                onClick={() => run(() => acknowledgeAssignment(row.id))}
              >
                <Check size={14} /> รับทราบ
              </Button>
            ) : showGear ? (
              <button
                onClick={() => setDialog({ kind: "menu", row })}
                aria-label="จัดการคิวนี้"
                className={`relative z-10 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center justify-self-center rounded-lg transition-colors duration-200 ${
                  isPending
                    ? "bg-rose-100 text-rose-600 hover:bg-rose-200"
                    : "text-stone-400 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                <Settings2 size={17} />
              </button>
            ) : (
              <ChevronRight
                size={16}
                className="shrink-0 justify-self-center text-stone-300"
                aria-hidden
              />
            );

            const seqBadge = (
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                  isPending ? "bg-rose-100 text-rose-700" : "bg-brand-100 text-brand-800"
                }`}
              >
                {row.seq_today ?? "!"}
              </span>
            );

            const nameLink = (
              <Link
                href={`/queue/cases/${row.case_id}`}
                className="min-w-0 truncate text-sm font-semibold text-stone-900 before:absolute before:inset-0 before:content-['']"
              >
                {c?.customer_name ?? "—"}
              </Link>
            );

            return (
              <li key={row.id} className="border-t border-stone-200/60 first:border-t-0">
                {dateHeader && (
                  <p className="border-b border-stone-200/60 bg-stone-50/70 px-3 py-1 text-[11px] font-semibold text-stone-400">
                    {dateHeader}
                  </p>
                )}

                <div
                  className={`relative transition-colors duration-150 ${
                    isPending ? "bg-rose-50/80" : ""
                  } ${open ? "hover:bg-white/70" : "opacity-55"}`}
                >
                  {/* มือถือ: 2 บรรทัดกะทัดรัด — แตะทั้งแถวเพื่อดูรายละเอียด */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5 sm:hidden">
                    {seqBadge}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {nameLink}
                        <StatusBadge status={row.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        นัด {appointmentLabel(row)}
                        {" · "}
                        {isPending ? (
                          <span className="font-medium text-rose-600">ยังไม่มีผู้รับ</span>
                        ) : (
                          (row.member_name ?? "—")
                        )}
                        {c?.treatment_main ? ` · ${c.treatment_main}` : ""}
                      </p>
                    </div>
                    {action}
                  </div>

                  {/* จอ ≥sm: แถวตารางคอลัมน์ตรงกับหัวตาราง */}
                  <div className={`hidden items-center gap-2 px-3 py-2 sm:grid ${GRID_COLS}`}>
                    <span className="justify-self-center">{seqBadge}</span>
                    {nameLink}
                    <span className="truncate text-sm text-stone-600">
                      {c?.treatment_main || "—"}
                    </span>
                    <span className="truncate text-xs text-stone-500">
                      {appointmentLabel(row)}
                    </span>
                    {isPending ? (
                      <span className="truncate text-xs font-medium text-rose-600">
                        ยังไม่มีผู้รับ
                      </span>
                    ) : (
                      <span className="truncate text-sm text-stone-700">
                        {row.member_name ?? "—"}
                      </span>
                    )}
                    <span className="min-w-0">
                      <StatusBadge status={row.status} />
                    </span>
                    {action}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog ? DIALOG_TITLE[dialog.kind] : ""}
      >
        {dialog && (
          <div className="space-y-4">
            <p className="text-sm text-stone-600">
              {dialog.row.case?.customer_name ?? "—"}
              {dialog.row.seq_today != null && ` · คิวที่ ${dialog.row.seq_today}`}
            </p>

            {dialog.kind === "menu" ? (
              <div className="space-y-2">
                {dialog.row.status === "pending_manual_assignment" ? (
                  <MenuItem
                    icon={<UserRoundCog size={18} />}
                    title="จ่ายคิว"
                    desc="เลือกคนเอง หรือให้ระบบเลือกตามลำดับคิว"
                    tone="primary"
                    onClick={() => openForm("assign", dialog.row)}
                  />
                ) : (
                  <MenuItem
                    icon={<RefreshCw size={18} />}
                    title="ย้ายคิวไปคนอื่น"
                    desc="คิวเดิมยังนับสิทธิ์ของคนเดิมตามกติกา"
                    onClick={() => openForm("reassign", dialog.row)}
                  />
                )}
                <MenuItem
                  icon={<X size={18} />}
                  title="ยกเลิกคิวนี้"
                  desc="เช่น ลูกค้ายกเลิกนัด หรือวางข้อมูลผิด"
                  tone="danger"
                  onClick={() => openForm("void", dialog.row)}
                />
              </div>
            ) : (
              <>
                {dialog.kind !== "void" && (
                  <div>
                    <Label htmlFor="target">ผู้รับคิว</Label>
                    <Select
                      id="target"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">ให้ระบบเลือกตามคิว</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.display_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="reason">
                    เหตุผล{dialog.kind === "assign" ? " (ไม่บังคับ)" : ""}
                  </Label>
                  <Textarea
                    id="reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="เหตุผล"
                  />
                </div>

                {dialog.kind === "void" && (
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      checked={cancelCase}
                      onChange={(e) => setCancelCase(e.target.checked)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    ยกเลิกเคสนี้ด้วย (ไม่จ่ายคิวใหม่)
                  </label>
                )}

                {error && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setError(null);
                      setDialog({ kind: "menu", row: dialog.row });
                    }}
                  >
                    กลับ
                  </Button>
                  <Button
                    variant={dialog.kind === "void" ? "danger" : "primary"}
                    loading={pending}
                    onClick={submitDialog}
                  >
                    ยืนยัน
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** ปุ่มรายการในเมนูฟันเฟือง — ใหญ่พอสำหรับนิ้ว บอกชัดว่ากดแล้วเกิดอะไร */
function MenuItem({
  icon,
  title,
  desc,
  tone = "default",
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  tone?: "default" | "primary" | "danger";
  onClick: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-200 text-rose-700 hover:bg-rose-50"
      : tone === "primary"
        ? "border-brand-300 bg-brand-50/70 text-brand-800 hover:bg-brand-100"
        : "border-stone-200 text-stone-700 hover:bg-brand-50";
  return (
    <button
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-white/70 px-4 py-3 text-left transition-colors duration-150 ${toneClass}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs opacity-70">{desc}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 opacity-40" />
    </button>
  );
}
