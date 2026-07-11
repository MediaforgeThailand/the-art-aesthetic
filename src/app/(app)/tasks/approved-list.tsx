"use client";

import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Link2,
  Paperclip,
  Send,
} from "lucide-react";
import { useMemo } from "react";
import { formatDateBangkok } from "@/lib/format";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import { AssigneeAvatar, CardMediaPreview, profileName } from "./task-card";

/** วันตามเวลาไทยของ timestamp (YYYY-MM-DD) — จัดกลุ่มงานเป็นสัปดาห์ตามวันไทย */
const BKK_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });
function bkkDay(iso: string): string {
  return BKK_DAY.format(new Date(iso));
}

/** วันจันทร์ (ต้นสัปดาห์) ของวันที่ "YYYY-MM-DD" — คำนวณด้วย UTC ให้ไม่ขึ้นกับ tz เครื่อง */
function weekStartOfDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const diff = (dt.getUTCDay() + 6) % 7; // 0=จันทร์ ... 6=อาทิตย์
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** เวลาที่ถือว่างานเสร็จ — ตรวจผ่านเมื่อ (approved_at) ถ้าไม่มีใช้ updated_at */
function doneAt(t: TaskWithAssignee): string {
  return t.approved_at ?? t.updated_at;
}

type PersonGroup = {
  key: string;
  assignee: TaskWithAssignee["assignee"];
  name: string;
  tasks: TaskWithAssignee[];
};
type WeekGroup = {
  start: string;
  label: string;
  range: string;
  count: number;
  persons: PersonGroup[];
};

/**
 * แท็บ "งานเสร็จ" — งานที่เสร็จสมบูรณ์ทั้งทีม (ผ่านการตรวจ + เสร็จแบบไม่ตรวจ)
 * จัดกลุ่มเป็นสัปดาห์ (ล่าสุดบนสุด) แล้วในแต่ละสัปดาห์แยก section ต่อคน พร้อม preview รูป
 * · กรองได้จากแถวตัวกรองใน tasks-client
 */
export function ApprovedList({
  tasks,
  totalApproved,
  sections,
  today,
  selectedId,
  onRowClick,
  onTogglePosted,
}: {
  tasks: TaskWithAssignee[];
  /** จำนวนงานเสร็จทั้งหมด (ก่อนกรอง) — ใช้แยกข้อความ empty state */
  totalApproved: number;
  sections: TaskSectionRow[];
  /** วันนี้ (YYYY-MM-DD เวลาไทย) — ใช้ป้าย "สัปดาห์นี้/สัปดาห์ที่แล้ว" */
  today: string;
  selectedId: string | null;
  onRowClick: (task: TaskWithAssignee) => void;
  /** สลับสถานะ "โพส/ใช้งานแล้ว" ของงาน */
  onTogglePosted: (task: TaskWithAssignee) => void;
}) {
  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? null;

  const weeks = useMemo<WeekGroup[]>(() => {
    const todayWeek = weekStartOfDateStr(today);
    const prevWeek = addDaysStr(todayWeek, -7);

    // จัดเป็นสัปดาห์
    const byWeek = new Map<string, TaskWithAssignee[]>();
    for (const t of tasks) {
      const wk = weekStartOfDateStr(bkkDay(doneAt(t)));
      const list = byWeek.get(wk);
      if (list) list.push(t);
      else byWeek.set(wk, [t]);
    }

    return [...byWeek.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])) // สัปดาห์ล่าสุดก่อน
      .map(([start, wkTasks]) => {
        // แยกต่อคนในสัปดาห์นั้น
        const byPerson = new Map<string, TaskWithAssignee[]>();
        for (const t of wkTasks) {
          const key = t.assignee_id ?? "none";
          const list = byPerson.get(key);
          if (list) list.push(t);
          else byPerson.set(key, [t]);
        }
        const persons: PersonGroup[] = [...byPerson.entries()]
          .map(([key, ts]) => {
            const sorted = [...ts].sort((a, b) =>
              doneAt(b).localeCompare(doneAt(a))
            );
            const assignee = sorted.find((t) => t.assignee)?.assignee ?? null;
            return {
              key,
              assignee,
              name: key === "none" ? "ไม่ระบุผู้ทำ" : profileName(assignee),
              tasks: sorted,
            };
          })
          // คนที่มีงานเสร็จล่าสุดอยู่บนก่อน
          .sort((a, b) => doneAt(b.tasks[0]).localeCompare(doneAt(a.tasks[0])));

        const range = `${formatDateBangkok(`${start}T00:00:00+07:00`)} – ${formatDateBangkok(`${addDaysStr(start, 6)}T00:00:00+07:00`)}`;
        const label =
          start === todayWeek
            ? "สัปดาห์นี้"
            : start === prevWeek
              ? "สัปดาห์ที่แล้ว"
              : range;
        return { start, label, range, count: wkTasks.length, persons };
      });
  }, [tasks, today]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
        <BadgeCheck size={40} strokeWidth={1.5} className="text-emerald-200" />
        <p className="text-sm font-medium text-stone-600">
          {totalApproved === 0
            ? "ยังไม่มีงานที่เสร็จ"
            : "ไม่พบงานที่ตรงกับตัวกรอง"}
        </p>
        <p className="max-w-sm text-sm text-stone-400">
          {totalApproved === 0
            ? "งานที่ผู้ตรวจอนุมัติ หรือกด “เสร็จแล้ว” จะมาแสดงรวมกันที่นี่"
            : "ลองเปลี่ยนคำค้นหา ผู้รับผิดชอบ ผู้ตรวจ หรือช่วงวันที่"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7 px-4 pb-6 pt-1 sm:px-6">
      {weeks.map((week) => (
        <section key={week.start}>
          {/* หัวสัปดาห์ */}
          <div className="mb-3 flex items-center gap-2 border-b border-stone-200/70 pb-2">
            <h3 className="text-sm font-bold text-stone-900">{week.label}</h3>
            {week.label !== week.range && (
              <span className="text-xs text-stone-400">{week.range}</span>
            )}
            <span className="ml-auto text-xs text-stone-400">
              {week.count} งาน
            </span>
          </div>

          {/* section ต่อคน */}
          <div className="space-y-5">
            {week.persons.map((person) => (
              <div key={person.key}>
                <div className="mb-2 flex items-center gap-2">
                  <AssigneeAvatar assignee={person.assignee} size={7} />
                  <span className="text-sm font-semibold text-stone-800">
                    {person.name}
                  </span>
                  <span className="text-xs text-stone-400">
                    {person.tasks.length} งาน
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {person.tasks.map((task) => (
                    <ApprovedCard
                      key={task.id}
                      task={task}
                      section={sectionName(task.section_id)}
                      selected={selectedId === task.id}
                      onClick={() => onRowClick(task)}
                      onTogglePosted={() => onTogglePosted(task)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- การ์ดงานเสร็จหนึ่งใบ — preview รูปเหมือนบอร์ด + วันเสร็จ/ผู้ตรวจ ---------- */

function ApprovedCard({
  task,
  section,
  selected,
  onClick,
  onTogglePosted,
}: {
  task: TaskWithAssignee;
  section: string | null;
  selected: boolean;
  onClick: () => void;
  onTogglePosted: () => void;
}) {
  const files = task.files ?? [];
  const posted = task.posted_at !== null;
  const togglePosted = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onTogglePosted();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`งานเสร็จ ${task.title}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`relative cursor-pointer rounded-lg border p-3 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
        posted
          ? "border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200"
          : selected
            ? "border-brand-400 bg-white/85 ring-1 ring-brand-300"
            : "border-white/80 bg-white/85 hover:border-brand-300"
      }`}
    >
      {/* Badge สถานะโพส ขวาบน — กดสลับได้ (โพสแล้ว = ติ๊กเขียวเด่น) */}
      <button
        type="button"
        onClick={togglePosted}
        onKeyDown={(e) => e.stopPropagation()}
        title={posted ? "โพสแล้ว — คลิกเพื่อยกเลิก" : "ทำเครื่องหมายว่าโพสแล้ว"}
        aria-label={posted ? "ยกเลิกโพสแล้ว" : "ทำเครื่องหมายว่าโพสแล้ว"}
        aria-pressed={posted}
        className={`absolute right-2 top-2 z-10 inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm transition-all active:scale-90 ${
          posted
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : "border border-stone-300 bg-white/90 text-stone-400 opacity-70 hover:border-emerald-400 hover:text-emerald-600 hover:opacity-100"
        }`}
      >
        {posted ? (
          <>
            <Check size={12} strokeWidth={3.5} />
            ใช้แล้ว
          </>
        ) : (
          <>
            <Send size={11} />
            โพส?
          </>
        )}
      </button>

      <div className="flex items-start gap-2 pr-16">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-stone-800">
          {task.title}
        </p>
      </div>

      <CardMediaPreview files={files} />

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
        <span className="text-stone-400">{formatDateBangkok(doneAt(task))}</span>
        {section && <span className="text-stone-400">· {section}</span>}
        {task.reviewer && (
          <span
            className="inline-flex items-center gap-1 text-emerald-700"
            title={task.reviewer2 ? "ผู้ตรวจลำดับ 1" : "ผู้ตรวจ"}
          >
            <BadgeCheck size={12} />
            {profileName(task.reviewer)}
          </span>
        )}
        {/* งานที่ผ่านการตรวจ 2 ทอด — โชว์ผู้อนุมัติขั้นสุดท้ายต่อท้าย */}
        {task.reviewer2 && (
          <span
            className="inline-flex items-center gap-1 text-emerald-700"
            title="ผู้ตรวจลำดับ 2 (อนุมัติขั้นสุดท้าย)"
          >
            <BadgeCheck size={12} />
            {profileName(task.reviewer2)}
          </span>
        )}
        {task.deliverable_url && (
          <a
            href={task.deliverable_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-sky-600 hover:underline"
          >
            <Link2 size={12} />
            ลิงก์งาน
          </a>
        )}
        {files.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-brand-600">
            <Paperclip size={11} />
            {files.length}
          </span>
        )}
      </div>

      {/* ปุ่มกด "โพสแล้ว / ใช้งานแล้ว" ในการ์ด */}
      <button
        type="button"
        onClick={togglePosted}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={posted}
        className={`mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] ${
          posted
            ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
            : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {posted ? (
          <>
            <Check size={14} strokeWidth={3} />
            โพสแล้ว (ใช้งานแล้ว)
          </>
        ) : (
          <>
            <Send size={13} />
            ทำเครื่องหมายว่าโพสแล้ว
          </>
        )}
      </button>
    </div>
  );
}
