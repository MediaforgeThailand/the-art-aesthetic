"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Settings2,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, EmptyState, Modal } from "@/components/ui";
import { CONTENT_FORMATS } from "@/lib/constants";
import { isImagePath, isVideoPath } from "@/lib/media";
import type {
  ContentCategoryRow,
  ContentFormat,
  ContentKpiRow,
} from "@/lib/types";
import {
  KpiViewTabs,
  PaceBar,
  PersonAvatar,
  StatusPill,
} from "./kpi-ui";
import {
  computeKpiMonth,
  firstWeekdayIndex,
  HEAT_CELL,
  HEAT_LEGEND,
  heatLevel,
  monthLabel,
  paceTone,
  pctOf,
  type PersonStat,
  personName,
  type ProfileLite,
  shiftMonth,
  shortName,
  type TaskAt,
  thaiDateLabel,
  type TrackedTask,
  WEEKDAYS_MON,
  WORK_STATES,
  workStateOf,
} from "./kpi-utils";

/* ---------- helpers ระดับโมดูล ---------- */

/** จำนวนชิปที่ช่องวันหนึ่งแสดงได้ก่อนยุบเป็น "+N" (จอ ≥sm — จอเล็กเป็นแท่งสีล้วน) */
const MAX_CHIPS = 3;

/** งานของวันหนึ่งจัดกลุ่มตามคน — โหมด "ทุกคน" ใช้แสดงชิป "ชื่อ ×N" ในช่องปฏิทิน */
type DayPersonGroup = { id: string; total: number; approved: number };

function groupByPerson(list: TaskAt[]): DayPersonGroup[] {
  const map = new Map<string, DayPersonGroup>();
  for (const { t } of list) {
    const key = t.assignee_id ?? "";
    const g = map.get(key) ?? { id: key, total: 0, approved: 0 };
    g.total += 1;
    if (workStateOf(t) === "approved") g.approved += 1;
    map.set(key, g);
  }
  return [...map.values()].sort(
    (a, b) => b.total - a.total || (a.id === "" ? 1 : 0) - (b.id === "" ? 1 : 0)
  );
}

/** ยอดของขอบเขตที่กำลังดู (คนเดียวหรือทั้งทีม) — ใช้ได้แม้คนนั้นยังไม่ถูกตั้งเป้า KPI */
type ScopeSummary = {
  total: number;
  approved: number;
  waiting: number;
  sent: number;
  posted: number;
  untagged: number;
  activeDays: number;
  byFormat: Record<ContentFormat | "none", number>;
  files: number;
  fileImage: number;
  fileVideo: number;
};

/* ---------- ชิ้นส่วนเล็ก ---------- */

/** ตัวเลขคู่กับป้าย — ใช้ในแผงสถิติด้านขวา (แน่นกว่า StatBox ของหน้าอื่น) */
function MiniStat({
  label,
  value,
  tone = "text-stone-800",
  sub,
}: {
  label: string;
  value: number | string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200/70 bg-white/70 px-2.5 py-2">
      <p className="text-[10px] leading-tight text-stone-500">{label}</p>
      <p className={`text-lg font-bold leading-tight tabular-nums ${tone}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] leading-tight text-stone-400">{sub}</p>}
    </div>
  );
}

/** แถวเป้าหนึ่งบรรทัด: ป้าย + ทำได้/เป้า + แถบ pace */
function TargetRow({
  label,
  hint,
  done,
  target,
  expected,
  tickPct,
  isCurrentMonth,
  trailing,
}: {
  label: string;
  hint?: string | null;
  done: number;
  target: number;
  expected: number;
  tickPct: number | null;
  isCurrentMonth: boolean;
  trailing?: string;
}) {
  const met = target > 0 && done >= target;
  const behind = Math.max(0, expected - done);
  const tone = paceTone(done, target, expected);
  return (
    <li>
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="min-w-0 truncate text-stone-600">
          {label}
          {hint && <span className="text-stone-400"> · {hint}</span>}
        </span>
        {met ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700">
            ครบ
          </span>
        ) : behind > 0 ? (
          <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">
            {isCurrentMonth ? `ตามหลัง ${behind}` : `ขาด ${target - done}`}
          </span>
        ) : null}
        <span
          className={`ml-auto shrink-0 font-bold tabular-nums ${
            met
              ? "text-emerald-600"
              : behind > 0
                ? "text-rose-600"
                : "text-stone-700"
          }`}
        >
          {done}/{target}
        </span>
        {trailing && (
          <span className="shrink-0 text-[10px] tabular-nums text-stone-400">
            {trailing}
          </span>
        )}
      </div>
      <PaceBar
        done={done}
        target={target}
        tickPct={tickPct}
        tone={tone}
        className="h-1.5"
      />
    </li>
  );
}

/**
 * แดชบอร์ด KPI คอนเทนต์ — **มุมมองปฏิทินรายคน** (redesign 2026-08-28 ตามคำสั่งผู้ใช้:
 * กราฟแท่งเดิมดูยาก ขอเป็นปฏิทินที่กดเลือกคนได้ เห็นว่าส่งงานวันไหนบ้าง พร้อม stats)
 *
 * โครงหน้า: เลือกเดือน → แถวชื่อทุกคน (กดเลือก) → ปฏิทิน heatmap (ซ้าย) + แผงสถิติ (ขวา)
 *  - **heatmap**: เทา = ยังไม่ส่ง · ส้มอ่อน = ส่งแล้วยังไม่ผ่านตรวจ · ส้มเข้ม = ตรวจผ่านแล้ว
 *    (ไล่ระดับตามสัดส่วนงานที่ผ่านในวันนั้น — เห็นได้ว่างานเก่าถูกแก้/ตรวจจบไปแล้วแค่ไหน)
 *  - ในช่องวันมีลิสต์งานจริง (โหมดทุกคนยุบเป็นชิป "ชื่อ ×N") กดช่องเพื่อดูรายละเอียดทั้งวัน
 *  - แผงขวา = สถิติของคนที่เลือกทั้งหมด (เป้า KPI/ทำได้/ส่ง/ผ่าน/รอตรวจ/ไฟล์/เดือนก่อน)
 * ภาพรวมเทียบทั้งทีมอยู่คนละหน้า → `/content-tracking/overview`
 */
export function TrackingClient({
  tasks,
  categories,
  kpis,
  profiles,
  isAdmin,
  initialPerson,
  initialYear,
  initialMonth,
  initialDay,
  loadError,
}: {
  tasks: TrackedTask[];
  categories: ContentCategoryRow[];
  kpis: ContentKpiRow[];
  profiles: ProfileLite[];
  isAdmin: boolean;
  /** คนที่ให้เลือกไว้ตั้งแต่เปิดหน้า ("all" = ทั้งทีม) — มาจาก `?person=` */
  initialPerson: string;
  /** วันนี้ตามเวลาไทย — คำนวณจาก server (client ไม่แตะ Date.now() ตอน render) */
  initialYear: number;
  initialMonth: number;
  initialDay: number;
  loadError: string | null;
}) {
  const [ym, setYm] = useState({ year: initialYear, month: initialMonth });
  /** "all" = ทั้งทีม, ไม่งั้นเป็น profile id ของคนที่กดเลือกจากแถวชื่อ */
  const [personId, setPersonId] = useState(initialPerson);
  /** วันที่เปิดดูรายละเอียด (dayIndex 0-based ของเดือนที่ดูอยู่) */
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const today = useMemo(
    () => ({ year: initialYear, month: initialMonth, day: initialDay }),
    [initialYear, initialMonth, initialDay]
  );

  const month = useMemo(
    () =>
      computeKpiMonth({
        tasks,
        profiles,
        kpis,
        year: ym.year,
        month: ym.month,
        today,
      }),
    [tasks, profiles, kpis, ym, today]
  );

  const {
    daysInMonth,
    elapsedDays,
    isCurrentMonth,
    inMonth,
    statsById,
    people,
    team,
  } = month;

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const categoryName = (id: string | null) =>
    id === null
      ? null
      : (categories.find((c) => c.id === id)?.name ?? "หมวดที่ถูกลบ");

  /** คนที่ถูกเลือกอยู่ (undefined = โหมดทั้งทีม) */
  const selected = personId === "all" ? undefined : profileById.get(personId);
  const stat: PersonStat | undefined =
    personId === "all" ? undefined : statsById.get(personId);

  /** งานในเดือนตามขอบเขตที่เลือก */
  const scopeTasks = useMemo(
    () =>
      personId === "all"
        ? inMonth
        : inMonth.filter(({ t }) => t.assignee_id === personId),
    [inMonth, personId]
  );

  /** สรุปยอดของขอบเขตที่เลือก — ทำงานได้ทั้งโหมดทีมและคนที่ยังไม่มีเป้า KPI */
  const summary: ScopeSummary = useMemo(() => {
    const s: ScopeSummary = {
      total: 0,
      approved: 0,
      waiting: 0,
      sent: 0,
      posted: 0,
      untagged: 0,
      activeDays: 0,
      byFormat: { image: 0, video: 0, none: 0 },
      files: 0,
      fileImage: 0,
      fileVideo: 0,
    };
    const days = new Set<number>();
    for (const { t, dayIndex } of scopeTasks) {
      s.total += 1;
      days.add(dayIndex);
      const state = workStateOf(t);
      if (state === "approved") s.approved += 1;
      else if (state === "waiting") s.waiting += 1;
      else s.sent += 1;
      if (t.posted_at !== null) s.posted += 1;
      if (t.content_format === null) s.untagged += 1;
      s.byFormat[t.content_format ?? "none"] += 1;
      // นับเฉพาะไฟล์ภาพ/วิดีโอ (pdf/zip ฯลฯ ไม่ใช่ชิ้นงาน) — ใช้ helper กลางจาก @/lib/media
      for (const f of t.files) {
        if (isImagePath(f.file_path)) {
          s.fileImage += 1;
          s.files += 1;
        } else if (isVideoPath(f.file_path)) {
          s.fileVideo += 1;
          s.files += 1;
        }
      }
    }
    s.activeDays = days.size;
    return s;
  }, [scopeTasks]);

  /** งานของแต่ละวันในเดือน (index 0-based) */
  const byDay = useMemo(() => {
    const map = new Map<number, TaskAt[]>();
    for (const at of scopeTasks) {
      const list = map.get(at.dayIndex);
      if (list) list.push(at);
      else map.set(at.dayIndex, [at]);
    }
    return map;
  }, [scopeTasks]);

  /** จำนวนงานที่ส่งในเดือนนี้ต่อคน — ตัวเลขบนปุ่มเลือกคน (คิดครั้งเดียว ไม่ filter ต่อปุ่ม) */
  const countByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const { t } of inMonth) {
      if (t.assignee_id === null) continue;
      map.set(t.assignee_id, (map.get(t.assignee_id) ?? 0) + 1);
    }
    return map;
  }, [inMonth]);

  /** รายชื่อบนแถวเลือกคน — คนที่เลือกอยู่ต้องมีปุ่มเสมอ แม้เดือนนี้เขาไม่มีงาน/ไม่มีเป้า
      (เปลี่ยนเดือนหรือเข้ามาด้วย `?person=` แล้วปุ่มหาย = ดูเหมือนตัวกรองค้างโดยไม่มีทางกลับ) */
  const tabPeople = useMemo(() => {
    if (personId === "all" || people.some((p) => p.id === personId))
      return people;
    const extra = profileById.get(personId);
    return extra ? [...people, extra] : people;
  }, [people, personId, profileById]);

  /** ช่องปฏิทินทั้งหมด (เติมช่องว่างหน้าเดือนให้เริ่มวันจันทร์) — null = ช่องนอกเดือน */
  const cells = useMemo(() => {
    const lead = firstWeekdayIndex(ym.year, ym.month);
    const out: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [ym, daysInMonth]);

  /** งานยังไม่ระบุประเภทในขอบเขตที่เลือก — ยุบเป็นปุ่มแจ้งเตือน + โมดัลรายชื่อ */
  const untagged = useMemo(
    () => scopeTasks.filter(({ t }) => t.content_format === null).map((a) => a.t),
    [scopeTasks]
  );
  const untaggedGroups = useMemo(() => {
    const map = new Map<string, TrackedTask[]>();
    for (const t of untagged) {
      const key = t.assignee_id ?? "";
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    const keys = [
      ...profiles.filter((p) => map.has(p.id)).map((p) => p.id),
      ...(map.has("") ? [""] : []),
    ];
    return keys.map((key) => ({ key, list: map.get(key) ?? [] }));
  }, [untagged, profiles]);

  const tickPct = isCurrentMonth
    ? Math.round((elapsedDays / daysInMonth) * 100)
    : null;

  /* เป้า/ทำได้ของขอบเขตที่เลือก — โหมดทีมใช้ยอดรวมทั้งทีม
     **คนที่เลือกแต่ยังไม่ถูกตั้งเป้า = เป้า 0** (ห้ามตกไปใช้ยอดของทีม ไม่งั้นการ์ดของคนนั้น
     จะโชว์ตัวเลขทั้งทีมเหมือนเป็นของเขา) — เป้า 0 ทำให้การ์ดขึ้นข้อความ "ยังไม่ถูกตั้งเป้า" */
  const scopeTarget = stat
    ? stat.overallTarget
    : selected
      ? 0
      : team.overallTarget;
  const scopeExpected = stat
    ? stat.expectedOverall
    : selected
      ? 0
      : team.overallExpected;
  const scopeDone = stat
    ? stat.doneTotal
    : selected
      ? summary.total
      : team.overallDone;

  const dayTasks = openDay === null ? [] : (byDay.get(openDay) ?? []);
  const dayApproved = dayTasks.filter(
    ({ t }) => workStateOf(t) === "approved"
  ).length;

  return (
    <>
      <PageHeaderRow isAdmin={isAdmin} />

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm text-rose-700">
          โหลดข้อมูลไม่ครบ: {loadError}
        </div>
      )}

      {/* ---------- เลือกเดือน + ปุ่มแจ้งเตือนงานยังไม่ระบุประเภท ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setYm(shiftMonth(ym.year, ym.month, -1));
            setOpenDay(null);
          }}
          aria-label="เดือนก่อนหน้า"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-stone-200 bg-white/70 text-stone-500 hover:bg-white sm:h-9 sm:w-9"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-36 text-center text-base font-semibold text-stone-800">
          {monthLabel(ym.year, ym.month)}
        </p>
        <button
          type="button"
          onClick={() => {
            setYm(shiftMonth(ym.year, ym.month, 1));
            setOpenDay(null);
          }}
          aria-label="เดือนถัดไป"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-stone-200 bg-white/70 text-stone-500 hover:bg-white sm:h-9 sm:w-9"
        >
          <ChevronRight size={18} />
        </button>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => {
              setYm({ year: initialYear, month: initialMonth });
              setOpenDay(null);
            }}
            className="min-h-11 cursor-pointer rounded-lg px-3 text-sm text-brand-600 hover:bg-brand-50 sm:min-h-9"
          >
            กลับเดือนนี้
          </button>
        )}
        {untagged.length > 0 && (
          <button
            type="button"
            onClick={() => setNoticeOpen(true)}
            className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 sm:min-h-9"
          >
            <AlertTriangle size={15} />
            ยังไม่ระบุประเภท {untagged.length} งาน
          </button>
        )}
      </div>

      {/* ---------- แถวเลือกคน (กดชื่อเพื่อดูปฏิทินของคนนั้น) ---------- */}
      <div className="-mx-3 mb-4 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          <button
            type="button"
            onClick={() => setPersonId("all")}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition-colors sm:min-h-10 ${
              personId === "all"
                ? "border-brand-500 bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                : "border-stone-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:text-brand-700"
            }`}
          >
            <span className="font-semibold">ทั้งทีม</span>
            <span
              className={`tabular-nums ${personId === "all" ? "text-white/80" : "text-stone-400"}`}
            >
              {team.submitted}
            </span>
          </button>
          {tabPeople.map((p) => {
            const s = statsById.get(p.id);
            const on = personId === p.id;
            const count = countByPerson.get(p.id) ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPersonId(p.id);
                  setOpenDay(null);
                }}
                title={`ดูปฏิทินของ ${personName(p)}`}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-2.5 text-sm transition-colors sm:min-h-10 ${
                  on
                    ? "border-brand-500 bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                    : "border-stone-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:text-brand-700"
                }`}
              >
                <PersonAvatar profile={p} size={6} />
                <span className="max-w-32 truncate font-medium">
                  {personName(p)}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${on ? "text-white/85" : "text-stone-400"}`}
                >
                  {count}
                  {s && s.overallTarget > 0 ? `/${s.overallTarget}` : ""}
                </span>
                {s?.status === "behind" && (
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-white" : "bg-rose-500"}`}
                    title={
                      isCurrentMonth ? "ตามหลังเป้าวันนี้" : "ไม่ครบเป้าเดือนนี้"
                    }
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- ปฏิทิน (ซ้าย) + แผงสถิติ (ขวา) ----------
          DOM เรียงแผงสถิติก่อน = จอเล็กเห็นตัวเลขสรุปก่อนต้องเลื่อนดูปฏิทิน;
          จอ ≥lg ถูกจับกลับไปคอลัมน์ขวาด้วย grid placement (col-start-2) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_21rem]">
        {/* แผงยาวกว่าจอได้ (คนที่มีหลายกติกา) — sticky + เลื่อนในตัวเอง ไม่งั้นท้ายแผงถูกตัดหาย */}
        <aside className="space-y-3 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-0.5">
          <Card className="p-4">
            {/* หัวแผง — คนที่เลือก หรือ ภาพรวมทีม */}
            <div className="flex items-center gap-2.5">
              {selected ? (
                <PersonAvatar profile={selected} size={10} />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-stone-200 to-stone-300 text-stone-600">
                  <Users size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-900">
                  {selected ? personName(selected) : "ภาพรวมทั้งทีม"}
                </p>
                <p className="text-[11px] text-stone-400">
                  {monthLabel(ym.year, ym.month)}
                  {isCurrentMonth && ` · ถึงวันที่ ${initialDay}/${daysInMonth}`}
                </p>
              </div>
              {stat && (
                <StatusPill
                  status={stat.status}
                  behindRules={stat.behindRules}
                  isCurrentMonth={isCurrentMonth}
                />
              )}
            </div>

            {/* ส่งกี่งาน / เสร็จกี่งาน — คำถามหลักที่ผู้ใช้ขอให้เห็นในหน้านี้ */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat
                label="ส่งงานเดือนนี้"
                value={summary.total}
                sub={`ใน ${summary.activeDays} วัน`}
              />
              <MiniStat
                label="ตรวจผ่านแล้ว"
                value={summary.approved}
                tone="text-amber-600"
                sub={
                  summary.total > 0
                    ? `${pctOf(summary.approved, summary.total)}% ของที่ส่ง`
                    : undefined
                }
              />
              <MiniStat
                label="รอตรวจ"
                value={summary.waiting + summary.sent}
                tone={
                  summary.waiting + summary.sent > 0
                    ? "text-amber-700"
                    : "text-stone-800"
                }
                sub={summary.sent > 0 ? `ไม่อยู่ในคิวตรวจ ${summary.sent}` : undefined}
              />
              <MiniStat
                label="โพสแล้ว"
                value={summary.posted}
                sub={
                  stat && stat.pending > 0
                    ? `รอกดโพสอีก ${stat.pending}`
                    : undefined
                }
              />
            </div>

            {/* เป้า KPI ตอนนี้เท่าไหร่ + ทำได้เท่าไหร่ */}
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold text-stone-500">
                {selected ? "เป้า KPI ของคนนี้" : "เป้า KPI รวมทั้งทีม"}
              </p>
              {scopeTarget === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-500">
                  {selected
                    ? "ยังไม่ถูกตั้งเป้า KPI — ตั้งได้ที่หน้า “ตั้งค่า KPI”"
                    : "ยังไม่มีใครถูกตั้งเป้า KPI"}
                </p>
              ) : (
                <>
                  <div className="mb-1 flex items-baseline gap-2 text-xs">
                    <span className="text-stone-600">ทำได้</span>
                    <span className="font-bold tabular-nums text-stone-800">
                      {scopeDone}
                      <span className="font-normal text-stone-400">
                        /{scopeTarget}
                      </span>
                    </span>
                    <span className="text-stone-400">
                      ({pctOf(scopeDone, scopeTarget)}%)
                    </span>
                    {isCurrentMonth && (
                      <span className="ml-auto text-stone-500">
                        เป้าถึงวันนี้{" "}
                        <span className="font-semibold tabular-nums">
                          {scopeExpected}
                        </span>
                      </span>
                    )}
                  </div>
                  <PaceBar
                    done={scopeDone}
                    target={scopeTarget}
                    tickPct={tickPct}
                    tone={paceTone(scopeDone, scopeTarget, scopeExpected)}
                    className="h-2.5"
                  />
                </>
              )}
            </div>

            {/* รายกติกาของคนที่เลือก / แยกฟอร์แมตของทีม */}
            {stat && stat.ruleStats.length > 0 && (
              <ul className="mt-3 space-y-2.5">
                {stat.ruleStats.map((rs) => (
                  <TargetRow
                    key={rs.rule.id}
                    label={
                      rs.rule.format === null
                        ? "ทุกฟอร์แมต"
                        : CONTENT_FORMATS[rs.rule.format].label
                    }
                    hint={
                      [
                        categoryName(rs.rule.category_id),
                        rs.rule.period === "day"
                          ? `เป้า ${rs.rule.target}/วัน`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                    done={rs.done}
                    target={rs.target}
                    expected={rs.expected}
                    tickPct={tickPct}
                    isCurrentMonth={isCurrentMonth}
                    trailing={`เดือนก่อน ${rs.lastDone}`}
                  />
                ))}
              </ul>
            )}
            {/* โหมดทีมเท่านั้น — คนที่เลือกแล้วไม่มีกติกา ห้ามโชว์เป้าของทีมในการ์ดของเขา */}
            {!stat && !selected && team.overallTarget > 0 && (
              <ul className="mt-3 space-y-2.5">
                {(["video", "image"] as const).map((f) => (
                  <TargetRow
                    key={f}
                    label={CONTENT_FORMATS[f].label}
                    done={team.formats[f].done}
                    target={team.formats[f].target}
                    expected={team.formats[f].expected}
                    tickPct={tickPct}
                    isCurrentMonth={isCurrentMonth}
                  />
                ))}
              </ul>
            )}

            {/* ชิ้นงานจริงที่อัพในการ์ด — การ์ด 1 ใบมีได้หลายไฟล์ */}
            <div className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-600">
              <p className="mb-1 font-semibold text-stone-500">
                ชิ้นงานในเดือนนี้
              </p>
              <p>
                การ์ด{" "}
                <span className="font-bold tabular-nums text-stone-800">
                  {summary.total}
                </span>{" "}
                <span className="text-stone-400">
                  (วิดีโอ {summary.byFormat.video} · ภาพ {summary.byFormat.image}
                  {summary.byFormat.none > 0 &&
                    ` · ยังไม่ระบุ ${summary.byFormat.none}`}
                  )
                </span>
              </p>
              <p className="mt-0.5">
                ไฟล์ที่อัพจริง{" "}
                <span className="font-bold tabular-nums text-stone-800">
                  {summary.files}
                </span>{" "}
                <span className="text-stone-400">
                  (ภาพ {summary.fileImage} · วิดีโอ {summary.fileVideo}
                  {summary.total > 0 &&
                    ` · เฉลี่ย ${(summary.files / summary.total).toFixed(1)}/การ์ด`}
                  )
                </span>
              </p>
              {stat && (
                <p className="mt-0.5 text-stone-500">
                  เดือนก่อน{" "}
                  <span className="tabular-nums">{stat.lastTotal}</span> ชิ้น
                  (ผ่าน {stat.lastMetRules}/{stat.ruleStats.length} กติกา)
                </p>
              )}
              {!stat && !selected && (
                <p className="mt-0.5 text-stone-500">
                  เดือนก่อนทั้งทีม{" "}
                  <span className="tabular-nums">{team.prevSubmitted}</span> ชิ้น
                </p>
              )}
            </div>

            {stat && stat.pending > 0 && (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle size={12} />
                ตรวจผ่านแล้วแต่ยังไม่กดโพส {stat.pending} งาน
              </p>
            )}
            {!stat && !selected && team.pendingPost > 0 && (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle size={12} />
                ทั้งทีมตรวจผ่านแล้วรอกดโพส {team.pendingPost} งาน
              </p>
            )}
          </Card>

          {/* โหมดทีม: สรุปสั้นๆ ว่าใครตามหลัง + ทางไปหน้าเทียบทั้งทีม */}
          {!selected && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-stone-500">
                  สถานะรายคน
                </p>
                <Link
                  href="/content-tracking/overview"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline max-sm:min-h-11"
                >
                  เทียบทั้งทีม
                  <ExternalLink size={11} />
                </Link>
              </div>
              {month.personStats.length === 0 ? (
                <p className="mt-2 text-xs text-stone-500">
                  ยังไม่มีใครถูกตั้งเป้า KPI
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {month.personStats.map((s) => (
                    <li key={s.profile.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPersonId(s.profile.id);
                          setOpenDay(null);
                        }}
                        className="flex w-full min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left hover:bg-brand-50/70 sm:min-h-9"
                      >
                        <PersonAvatar profile={s.profile} size={6} />
                        <span className="min-w-0 flex-1 truncate text-xs text-stone-700">
                          {personName(s.profile)}
                        </span>
                        <span
                          className={`shrink-0 text-xs font-bold tabular-nums ${
                            s.status === "behind"
                              ? "text-rose-600"
                              : s.status === "done"
                                ? "text-emerald-600"
                                : "text-stone-700"
                          }`}
                        >
                          {s.doneTotal}/{s.overallTarget}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* คนที่เลือกยังไม่มีเป้า — บอกตรงๆ พร้อมทางไปตั้งค่า */}
          {selected && !stat && (
            <Card className="p-4">
              {/* {" "} จำเป็น — JSX text ที่กินหลายบรรทัดจะถูกตัดช่องว่างนำหน้าทิ้ง */}
              <p className="text-xs text-stone-600">
                {personName(selected)}{" "}
                ยังไม่ถูกตั้งเป้า KPI — ตัวเลขด้านบนเป็นผลงานจริงที่ส่งในเดือนนี้
              </p>
              <Link
                href="/content-kpi"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline max-sm:min-h-11"
              >
                {isAdmin ? "ไปตั้งเป้าให้คนนี้" : "ดูเป้าที่ตั้งไว้"}
                <ExternalLink size={11} />
              </Link>
            </Card>
          )}
        </aside>

        {/* ---------- ปฏิทิน heatmap ---------- */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Card className="p-3 sm:p-4">
            {/* คำอธิบายสี + ยอดของเดือนที่กำลังดู */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm font-semibold text-stone-700">
                {selected ? `ปฏิทินส่งงาน · ${personName(selected)}` : "ปฏิทินส่งงานของทีม"}
              </p>
              {/* ตัวเลขสำคัญอยู่บนปฏิทินเลย (ผู้ใช้ขอ) — ไม่ต้องกวาดตาไปแผงขวา */}
              <p className="text-xs text-stone-500">
                ส่ง{" "}
                <span className="font-bold tabular-nums text-stone-800">
                  {summary.total}
                </span>{" "}
                · ผ่าน{" "}
                <span className="font-bold tabular-nums text-amber-600">
                  {summary.approved}
                </span>{" "}
                · รอตรวจ{" "}
                <span className="font-bold tabular-nums text-stone-700">
                  {summary.waiting + summary.sent}
                </span>
                {scopeTarget > 0 && (
                  <>
                    {" "}
                    · KPI{" "}
                    <span className="font-bold tabular-nums text-stone-800">
                      {scopeDone}/{scopeTarget}
                    </span>{" "}
                    <span className="text-stone-400">
                      ({pctOf(scopeDone, scopeTarget)}%)
                    </span>
                    {isCurrentMonth && scopeDone < scopeExpected && (
                      <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">
                        ตามหลัง {scopeExpected - scopeDone}
                      </span>
                    )}
                  </>
                )}
              </p>
              <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone-500">
                {HEAT_LEGEND.map((l) => (
                  <span key={l.level} className="inline-flex items-center gap-1">
                    <span
                      className={`h-3 w-3 rounded-sm border border-stone-300/70 ${HEAT_CELL[l.level]}`}
                    />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>

            {/* หัวคอลัมน์วัน — เริ่มวันจันทร์ อาทิตย์เป็นสีแดง (แบบเดียวกับปฏิทินคิว Influ) */}
            <div className="grid grid-cols-7">
              {WEEKDAYS_MON.map((w, idx) => (
                <div
                  key={w}
                  className={`pb-1 text-center text-[11px] font-semibold sm:text-xs ${
                    idx === 6 ? "text-rose-500" : "text-stone-500"
                  }`}
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-stone-200/70 bg-stone-200/70">
              {cells.map((day, idx) => {
                if (day === null)
                  return (
                    <div
                      key={`blank-${idx}`}
                      className="min-h-[74px] bg-white/40 sm:min-h-[112px]"
                    />
                  );
                const dayIndex = day - 1;
                const list = byDay.get(dayIndex) ?? [];
                const approved = list.filter(
                  ({ t }) => workStateOf(t) === "approved"
                ).length;
                const level = heatLevel(list.length, approved);
                const isToday =
                  isCurrentMonth && day === Math.min(initialDay, daysInMonth);
                const future =
                  ym.year * 10000 + ym.month * 100 + day >
                  initialYear * 10000 + initialMonth * 100 + initialDay;
                const sunday = idx % 7 === 6;
                const groups =
                  personId === "all" ? groupByPerson(list) : [];
                const shown = personId === "all" ? groups.length : list.length;
                const hidden = Math.max(0, shown - MAX_CHIPS);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setOpenDay(dayIndex)}
                    title={
                      list.length === 0
                        ? `${thaiDateLabel(ym.year, ym.month, day)} — ยังไม่มีงานที่ส่ง`
                        : `${thaiDateLabel(ym.year, ym.month, day)} — ส่ง ${list.length} งาน · ตรวจผ่านแล้ว ${approved}`
                    }
                    className={`flex min-h-[74px] cursor-pointer flex-col gap-1 p-1 text-left transition-colors sm:min-h-[112px] sm:p-1.5 ${
                      HEAT_CELL[level]
                    } ${future && list.length === 0 ? "opacity-60" : ""} ${
                      openDay === dayIndex
                        ? "ring-2 ring-inset ring-brand-500"
                        : ""
                    } hover:brightness-[0.97]`}
                  >
                    <span className="flex items-center gap-1">
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums sm:h-6 sm:min-w-6 sm:text-xs ${
                          isToday
                            ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                            : sunday
                              ? "text-rose-500"
                              : "text-stone-700"
                        }`}
                      >
                        {day}
                      </span>
                      {list.length > 0 && (
                        <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-amber-900/70 sm:text-[11px]">
                          {approved}/{list.length}
                        </span>
                      )}
                    </span>

                    {/* จอเล็ก: แท่งสีล้วนต่อ 1 งาน (ช่องกว้าง ~48px — ข้อความอ่านไม่ออก) */}
                    <span className="flex w-full min-w-0 flex-col gap-0.5 sm:hidden">
                      {list.slice(0, 4).map(({ t }) => (
                        <span
                          key={t.id}
                          className={`h-1.5 w-full rounded-full ${WORK_STATES[workStateOf(t)].dot}`}
                        />
                      ))}
                      {list.length > 4 && (
                        <span className="text-[9px] leading-none text-stone-500">
                          +{list.length - 4}
                        </span>
                      )}
                    </span>

                    {/* จอ ≥sm: ลิสต์งานจริงในช่องวัน (โหมดทีมยุบเป็น "ชื่อ ×N") */}
                    <span className="hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
                      {personId === "all"
                        ? groups.slice(0, MAX_CHIPS).map((g) => (
                            <span
                              key={g.id || "none"}
                              title={`${
                                g.id === ""
                                  ? "ไม่ระบุผู้รับผิดชอบ"
                                  : personName(profileById.get(g.id))
                              } · ส่ง ${g.total} · ผ่าน ${g.approved}`}
                              className={`flex w-full items-center gap-1 rounded px-1 py-px text-[11px] leading-tight ${
                                g.approved === g.total
                                  ? WORK_STATES.approved.chip
                                  : WORK_STATES.waiting.chip
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {g.id === ""
                                  ? "ไม่ระบุคน"
                                  : shortName(profileById.get(g.id))}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                {g.total}
                              </span>
                            </span>
                          ))
                        : list.slice(0, MAX_CHIPS).map(({ t }) => (
                            <span
                              key={t.id}
                              title={`${t.title} — ${WORK_STATES[workStateOf(t)].label}`}
                              className={`w-full truncate rounded px-1 py-px text-[11px] leading-tight ${WORK_STATES[workStateOf(t)].chip}`}
                            >
                              {t.title}
                            </span>
                          ))}
                      {hidden > 0 && (
                        <span className="px-1 text-[10px] font-medium leading-tight text-stone-500">
                          +{hidden} {personId === "all" ? "คน" : "งาน"}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {summary.total === 0 && (
              <p className="mt-3 text-center text-sm text-stone-400">
                ยังไม่มีงานที่ส่งในเดือนนี้
                {selected ? ` สำหรับ ${personName(selected)}` : ""}
              </p>
            )}
          </Card>

          {/* คนที่มีผลงานแต่ยังไม่ถูกตั้งเป้า — เห็นเฉพาะโหมดทีม */}
          {personId === "all" && month.offRadar.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-stone-500">
                ส่งงานในเดือนนี้แต่ยังไม่ถูกตั้งเป้า KPI
              </p>
              <div className="flex flex-wrap gap-2">
                {month.offRadar.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setPersonId(row.id)}
                    className="min-h-11 cursor-pointer rounded-full border border-stone-200 bg-white/70 px-3 text-xs text-stone-600 hover:border-brand-300 hover:text-brand-700 sm:min-h-8"
                  >
                    {personName(row.profile)} · {row.count} ชิ้น
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- รายละเอียดงานของวันที่กด ---------- */}
      <Modal
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        title={
          openDay === null
            ? ""
            : thaiDateLabel(ym.year, ym.month, openDay + 1)
        }
        wide
      >
        <p className="mb-3 text-xs text-stone-500">
          {selected ? `${personName(selected)} · ` : ""}
          ส่ง{" "}
          <span className="font-bold tabular-nums text-stone-700">
            {dayTasks.length}
          </span>{" "}
          งาน · ตรวจผ่านแล้ว{" "}
          <span className="font-bold tabular-nums text-amber-600">
            {dayApproved}
          </span>{" "}
          · รอตรวจ{" "}
          <span className="font-bold tabular-nums text-stone-700">
            {dayTasks.length - dayApproved}
          </span>
        </p>
        {dayTasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            วันนี้ยังไม่มีงานที่ส่ง
          </p>
        ) : (
          <ul className="space-y-1.5">
            {dayTasks.map(({ t }) => {
              const state = workStateOf(t);
              const cat = categoryName(t.content_category_id);
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-stone-200/70 bg-white/70 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${WORK_STATES[state].chip}`}
                    >
                      {WORK_STATES[state].short}
                    </span>
                    <Link
                      href={`/tasks?task=${t.id}`}
                      className="inline-flex min-w-0 flex-1 items-center gap-1 text-sm text-stone-800 hover:text-brand-600 hover:underline"
                    >
                      <span className="line-clamp-1">{t.title}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </Link>
                    {t.content_format !== null ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONTENT_FORMATS[t.content_format].chip}`}
                      >
                        {CONTENT_FORMATS[t.content_format].label}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                        ยังไม่ระบุประเภท
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-stone-400">
                    {personId === "all" && (
                      <span>
                        {t.assignee_id === null
                          ? "ไม่ระบุผู้รับผิดชอบ"
                          : personName(profileById.get(t.assignee_id))}
                      </span>
                    )}
                    {cat !== null && <span>หมวด {cat}</span>}
                    <span>{t.posted_at !== null ? "โพสแล้ว" : "ยังไม่โพส"}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      {/* ---------- โมดัลงานยังไม่ระบุประเภท ---------- */}
      <Modal
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        title={`ยังไม่ระบุประเภท ${untagged.length} งาน`}
      >
        <p className="mb-3 text-xs text-stone-500">
          งานพวกนี้ถูกนับรวมในกติกา &quot;ทุกฟอร์แมต&quot; แต่ยังนับเข้ากติกาที่เจาะ
          ภาพ/วิดีโอ หรือหมวดไม่ได้ — เปิดงานแล้วเลือก
          &quot;ชิ้นงาน/เนื้อหา&quot; ในแผงได้เลย (หรือกด &quot;โพสแล้ว&quot;
          ระบบจะถามประเภทให้เอง)
        </p>
        <div className="space-y-4">
          {untaggedGroups.map(({ key, list }) => (
            <div key={key || "none"}>
              <p className="mb-1.5 text-xs font-semibold text-stone-600">
                {key === ""
                  ? "ไม่ระบุผู้รับผิดชอบ"
                  : personName(profileById.get(key))}{" "}
                · {list.length} งาน
              </p>
              <ul className="space-y-1">
                {list.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tasks?task=${t.id}`}
                      className="inline-flex max-w-full items-center gap-1 text-sm text-stone-700 hover:text-brand-600 hover:underline"
                    >
                      <span className="line-clamp-1">{t.title}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>

      {month.personStats.length === 0 && month.inMonth.length === 0 && (
        <Card className="mt-4">
          <EmptyState
            icon={<Target size={40} strokeWidth={1.5} />}
            title="ยังไม่มีข้อมูลในเดือนนี้"
            description="ยังไม่มีงานที่ส่งในเดือนที่เลือก และยังไม่มีใครถูกตั้งเป้า KPI"
          />
        </Card>
      )}
    </>
  );
}

/** หัวหน้า — ชื่อหน้า + แท็บสลับมุมมอง + ปุ่มไปหน้าตั้งค่า */
function PageHeaderRow({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-stone-900">KPI คอนเทนต์</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          นับผลงานจากวันที่ &quot;ส่งงาน&quot; (กดส่งตรวจ) — กดชื่อคนเพื่อดู
          ปฏิทินของคนนั้น
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <KpiViewTabs active="calendar" />
        <Link
          href="/content-kpi"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 sm:min-h-9"
        >
          <Settings2 size={16} />
          {isAdmin ? "ตั้งค่า KPI" : "ดูเป้า KPI"}
        </Link>
      </div>
    </div>
  );
}
