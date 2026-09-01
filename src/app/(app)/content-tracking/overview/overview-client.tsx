"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, EmptyState, Input, Modal, Select } from "@/components/ui";
import { CONTENT_FORMATS, CONTENT_KPI_BASIS_ORDER } from "@/lib/constants";
import {
  MEDIA_RANGES,
  type MediaRangeKey,
  rangeStart,
} from "@/lib/media";
import type {
  ContentCategoryRow,
  ContentFormat,
  ContentKpiRow,
} from "@/lib/types";
import {
  BasisChip,
  KpiViewTabs,
  PaceBar,
  PersonAvatar,
  PostBacklogModal,
  StatBox,
  StatusPill,
} from "../kpi-ui";
import {
  addToPieceAgg,
  computeKpiMonth,
  emptyPieceAgg,
  emptyPostStat,
  monthLabel,
  pad2,
  paceTone,
  pctOf,
  type PersonStat,
  personName,
  type PieceAgg,
  type ProfileLite,
  shiftMonth,
  type TrackedTask,
  workDayOf,
} from "../kpi-utils";

/* ---------- ตารางเทียบรายคน ---------- */

/**
 * คอลัมน์ของตารางเทียบ — ชุดเดียวใช้ทั้งหัวตารางและแถว
 * (เพิ่ม/ลดคอลัมน์ต้องแก้ GRID_COLS + SORT_COLUMNS + เซลล์ในแถว พร้อมกันเสมอ)
 */
const GRID_COLS =
  "grid grid-cols-[minmax(11rem,1.6fr)_9rem_6rem_6rem_6rem_4.5rem_4.5rem_5rem_6rem_4.5rem_5.5rem]";

/** คอลัมน์ของตารางจำนวนชิ้นงาน (การ์ด vs ไฟล์) — ชุดเดียวใช้ทั้งหัวตารางและแถว */
const PIECE_COLS =
  "grid grid-cols-[minmax(9rem,1.4fr)_5rem_5rem_5rem_5rem_5rem_5rem]";

/** แถว KPI รวมทีมแยกตามฟอร์แมต — วิดีโอขึ้นก่อนตามที่ผู้ใช้ยกตัวอย่าง ("VDO = 42/100") */
const FORMAT_ROWS: { key: ContentFormat; label: string }[] = [
  { key: "video", label: "วิดีโอ (VDO)" },
  { key: "image", label: "ภาพ" },
];

type SortKey =
  | "default"
  | "name"
  | "progress"
  | "behind"
  | "video"
  | "image"
  | "submitted"
  | "approved"
  | "waiting"
  | "posted"
  | "files"
  | "prev";

type SortState = { key: SortKey; desc: boolean };

function sortValue(s: PersonStat, key: SortKey): number {
  switch (key) {
    case "progress":
      return s.overallTarget > 0 ? s.doneTotal / s.overallTarget : -1;
    case "behind":
      return Math.max(0, s.expectedOverall - s.doneTotal);
    case "video":
      return s.formats.video.done;
    case "image":
      return s.formats.image.done;
    case "submitted":
      return s.submitted;
    case "approved":
      return s.approved;
    case "waiting":
      return s.waiting + s.sent;
    // เรียงตาม "ดองไว้กี่ชิ้น" — สิ่งที่ต้องตามจริง (ไม่ใช่สัดส่วนที่โพสไปแล้ว)
    case "posted":
      return s.post.backlog;
    case "files":
      return s.pieces.files;
    case "prev":
      return s.lastTotal;
    default:
      return 0;
  }
}

/** หัวคอลัมน์ที่กดเรียงได้ — กดซ้ำสลับมาก↔น้อย, กดคอลัมน์เดิมรอบสามกลับเป็นค่าเริ่มต้น */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  hint,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  hint?: string;
}) {
  const on = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={hint ?? `เรียงตาม${label}`}
      className={`inline-flex min-h-8 cursor-pointer items-center gap-0.5 rounded px-0.5 text-[11px] font-semibold transition-colors hover:text-brand-600 ${
        align === "right" ? "justify-end" : "justify-start"
      } ${on ? "text-brand-600" : "text-stone-500"}`}
    >
      {label}
      {on &&
        (sort.desc ? (
          <ArrowDown size={11} className="shrink-0" />
        ) : (
          <ArrowUp size={11} className="shrink-0" />
        ))}
    </button>
  );
}

/** ตัวเลข "ทำได้/เป้า" ของฟอร์แมตหนึ่ง — เป้า 0 = ยังไม่ตั้งเป้าฟอร์แมตนี้ */
function FormatCell({
  done,
  target,
  expected,
  isCurrentMonth,
}: {
  done: number;
  target: number;
  expected: number;
  isCurrentMonth: boolean;
}) {
  if (target === 0)
    return (
      <span className="text-right text-xs tabular-nums text-stone-400">
        {done}
        <span className="text-[10px]"> ชิ้น</span>
      </span>
    );
  const met = done >= target;
  const behind = isCurrentMonth && done < expected;
  return (
    <span
      className={`text-right text-xs font-bold tabular-nums ${
        met ? "text-emerald-600" : behind ? "text-rose-600" : "text-stone-700"
      }`}
    >
      {done}
      <span className="font-normal text-stone-400">/{target}</span>
    </span>
  );
}

/**
 * ภาพรวม KPI ทีมคอนเทนต์ — เทียบทุกคนแบบ list/table ไม่มีกราฟแท่ง (ผู้ใช้ 2026-08-28)
 * โครง: KPI รวมทีม (วิดีโอ/ภาพ/รวม แบบ "42/100") → ตารางเทียบรายคน (กดหัวคอลัมน์เรียงได้)
 *       → ตารางจำนวนชิ้นงาน การ์ด vs ไฟล์ที่อัพจริง (ช่วงเวลาเลือกอิสระ)
 * ตัวเลขทุกตัวมาจาก computeKpiMonth ตัวเดียวกับหน้าปฏิทิน
 */
export function OverviewClient({
  tasks,
  categories,
  kpis,
  profiles,
  isAdmin,
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
  initialYear: number;
  initialMonth: number;
  initialDay: number;
  loadError: string | null;
}) {
  const [ym, setYm] = useState({ year: initialYear, month: initialMonth });
  const [sort, setSort] = useState<SortState>({ key: "default", desc: true });
  /* ป๊อปอัพรายละเอียดของกล่องสถิติ (ผู้ใช้ 2026-08-29: กดที่ตัวเลขแล้วดูรายละเอียดในหน้าเดิม)
     "post" = คิวงานดองโพส (ส่ง profile id มาด้วยเพื่อดูเฉพาะคนนั้น) */
  const [detail, setDetail] = useState<
    null | { kind: "credited" | "review" | "behind" } | {
      kind: "post";
      personId: string | null;
    }
  >(null);
  // ตารางจำนวนชิ้นงาน — ช่วงเวลาอิสระ ไม่ผูกกับเดือนด้านบน (เหมือนของเดิมในแดชบอร์ด)
  const [pieceRange, setPieceRange] = useState<MediaRangeKey>("1m");
  const [pieceFrom, setPieceFrom] = useState("");
  const [pieceTo, setPieceTo] = useState("");

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

  const { daysInMonth, elapsedDays, isCurrentMonth, team, personStats } = month;

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const tickPct = isCurrentMonth
    ? Math.round((elapsedDays / daysInMonth) * 100)
    : null;

  const rows = useMemo(() => {
    if (sort.key === "default") return personStats;
    const list = [...personStats];
    if (sort.key === "name") {
      list.sort((a, b) =>
        personName(a.profile).localeCompare(personName(b.profile), "th")
      );
      if (sort.desc) list.reverse();
      return list;
    }
    list.sort((a, b) => {
      const diff = sortValue(a, sort.key) - sortValue(b, sort.key);
      return sort.desc ? -diff : diff;
    });
    return list;
  }, [personStats, sort]);

  // กดหัวคอลัมน์: ครั้งแรกเรียงมาก→น้อย (ชื่อเรียง ก→ฮ), กดซ้ำสลับทิศ, กดรอบสามกลับค่าเริ่มต้น
  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key !== key
        ? { key, desc: key !== "name" }
        : s.desc === (key !== "name")
          ? { key, desc: key === "name" }
          : { key: "default", desc: true }
    );

  /* ---------- ตารางจำนวนชิ้นงาน (การ์ด vs ไฟล์ที่อัพจริง) ---------- */

  const todayStr = `${initialYear}-${pad2(initialMonth)}-${pad2(initialDay)}`;

  const pieceStats = useMemo(() => {
    const startStr =
      pieceRange === "custom" ? pieceFrom || null : rangeStart(pieceRange, todayStr);
    const endStr = pieceRange === "custom" ? pieceTo || null : null;
    const total = emptyPieceAgg();
    const perPerson = new Map<string, PieceAgg>();
    for (const t of tasks) {
      const day = workDayOf(t);
      if (day === null) continue;
      if (startStr !== null && day < startStr) continue;
      if (endStr !== null && day > endStr) continue;
      addToPieceAgg(total, t);
      const key = t.assignee_id ?? "";
      let agg = perPerson.get(key);
      if (!agg) {
        agg = emptyPieceAgg();
        perPerson.set(key, agg);
      }
      addToPieceAgg(agg, t);
    }
    // เรียงคนที่ผลิตไฟล์เยอะสุดขึ้นก่อน — แถว "ไม่ระบุผู้รับผิดชอบ" ไปท้ายสุด
    const people = [...perPerson.entries()]
      .map(([id, agg]) => ({ id, agg }))
      .sort(
        (a, b) =>
          (a.id === "" ? 1 : 0) - (b.id === "" ? 1 : 0) ||
          b.agg.files - a.agg.files ||
          b.agg.cards - a.agg.cards
      );
    return { total, people };
  }, [tasks, pieceRange, pieceFrom, pieceTo, todayStr]);

  /** กติกาที่ทีมตั้งไว้ แยกตามหมวดเนื้อหา — บอกว่าหมวดไหนถูกวัดผลอยู่บ้าง */
  const categoryRules = useMemo(() => {
    const map = new Map<string, { done: number; target: number }>();
    for (const s of personStats) {
      for (const rs of s.ruleStats) {
        if (rs.rule.category_id === null) continue;
        const key = rs.rule.category_id;
        const cur = map.get(key) ?? { done: 0, target: 0 };
        cur.done += rs.done;
        cur.target += rs.target;
        map.set(key, cur);
      }
    }
    return [...map.entries()]
      .map(([id, v]) => ({
        id,
        name: categories.find((c) => c.id === id)?.name ?? "หมวดที่ถูกลบ",
        ...v,
      }))
      .sort((a, b) => b.target - a.target);
  }, [personStats, categories]);

  return (
    <>
      {/* ---------- หัวหน้า ---------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-stone-900">
            ภาพรวม KPI ทีมคอนเทนต์
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            เทียบผลงานทุกคนในเดือนเดียวกัน — นับจากวันที่ &quot;ส่งงาน&quot;
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KpiViewTabs active="overview" />
          <Link
            href="/content-kpi"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 sm:min-h-9"
          >
            <Settings2 size={16} />
            {isAdmin ? "ตั้งค่า KPI" : "ดูเป้า KPI"}
          </Link>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm text-rose-700">
          โหลดข้อมูลไม่ครบ: {loadError}
        </div>
      )}

      {/* ---------- เลือกเดือน ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setYm(shiftMonth(ym.year, ym.month, -1))}
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
          onClick={() => setYm(shiftMonth(ym.year, ym.month, 1))}
          aria-label="เดือนถัดไป"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-stone-200 bg-white/70 text-stone-500 hover:bg-white sm:h-9 sm:w-9"
        >
          <ChevronRight size={18} />
        </button>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => setYm({ year: initialYear, month: initialMonth })}
            className="min-h-11 cursor-pointer rounded-lg px-3 text-sm text-brand-600 hover:bg-brand-50 sm:min-h-9"
          >
            กลับเดือนนี้
          </button>
        )}
        {isCurrentMonth && (
          <span className="text-xs text-stone-400">
            ถึงวันที่ {initialDay}/{daysInMonth} ของเดือน
          </span>
        )}
      </div>

      {/* ---------- KPI รวมทีม ---------- */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-semibold text-stone-700">KPI รวมทั้งทีม</p>
          {/* {" "} จำเป็น — JSX text ที่กินหลายบรรทัดจะถูกตัดช่องว่างนำหน้าทิ้ง ("3คน") */}
          <p className="text-[11px] text-stone-400">
            รวมเฉพาะคนที่ถูกตั้งเป้า {team.peopleWithTarget}{" "}
            คน (ผลผลิตจริงทั้งทีม ดูที่การ์ด &quot;ส่งงานเดือนนี้&quot;)
          </p>
        </div>
        {team.overallTarget === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-300 px-3 py-3 text-sm text-stone-500">
            ยังไม่มีใครถูกตั้งเป้า KPI — ตั้งได้ที่หน้า &quot;ตั้งค่า KPI&quot;
          </p>
        ) : (
          <ul className="space-y-3">
            {FORMAT_ROWS.map(({ key, label }) => {
              const f = team.formats[key];
              return (
                <li key={key}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${CONTENT_FORMATS[key].dot}`}
                    />
                    <span className="text-sm font-medium text-stone-700">
                      {label}
                    </span>
                    <span className="text-lg font-bold tabular-nums text-stone-900">
                      {f.done}
                      <span className="text-sm font-normal text-stone-400">
                        {" "}
                        / {f.target}
                      </span>
                    </span>
                    <span className="text-xs text-stone-400">
                      ({pctOf(f.done, f.target)}%)
                    </span>
                    {isCurrentMonth && (
                      <span className="ml-auto text-xs text-stone-500">
                        เป้าถึงวันนี้{" "}
                        <span className="font-semibold tabular-nums">
                          {f.expected}
                        </span>
                        {f.done < f.expected && (
                          <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">
                            ตามหลัง {f.expected - f.done}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <PaceBar
                    done={f.done}
                    target={f.target}
                    tickPct={tickPct}
                    tone={paceTone(f.done, f.target, f.expected)}
                    className="mt-1.5 h-2"
                  />
                </li>
              );
            })}
            <li className="border-t border-stone-100 pt-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-stone-700">
                  รวมทุกฟอร์แมต
                </span>
                <span className="text-lg font-bold tabular-nums text-stone-900">
                  {team.overallDone}
                  <span className="text-sm font-normal text-stone-400">
                    {" "}
                    / {team.overallTarget}
                  </span>
                </span>
                <span className="text-xs text-stone-400">
                  ({pctOf(team.overallDone, team.overallTarget)}%)
                </span>
                {team.untagged > 0 && (
                  <span
                    className="text-xs text-amber-700"
                    title="งานที่ยังไม่ติดประเภทชิ้นงาน — นับรวมในกติกา 'ทุกฟอร์แมต' แต่เข้ากติกาที่เจาะภาพ/วิดีโอไม่ได้"
                  >
                    · ทั้งทีมยังไม่ระบุประเภท {team.untagged} ชิ้น
                  </span>
                )}
                {isCurrentMonth && (
                  <span className="ml-auto text-xs text-stone-500">
                    เป้าถึงวันนี้{" "}
                    <span className="font-semibold tabular-nums">
                      {team.overallExpected}
                    </span>
                  </span>
                )}
              </div>
              <PaceBar
                done={team.overallDone}
                target={team.overallTarget}
                tickPct={tickPct}
                tone={paceTone(
                  team.overallDone,
                  team.overallTarget,
                  team.overallExpected
                )}
                className="mt-1.5 h-2.5"
              />
            </li>
          </ul>
        )}

        {/* กติกาที่เจาะหมวดเนื้อหา — รวมทั้งทีมต่อหมวด */}
        {categoryRules.length > 0 && (
          <div className="mt-4 border-t border-stone-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-stone-500">
              เป้าที่เจาะหมวดเนื้อหา (รวมทั้งทีม)
            </p>
            <div className="flex flex-wrap gap-2">
              {categoryRules.map((c) => (
                <span
                  key={c.id}
                  className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
                    c.done >= c.target
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-stone-200 bg-white/70 text-stone-600"
                  }`}
                >
                  {c.name}{" "}
                  <span className="font-bold">
                    {c.done}/{c.target}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---------- ตัวเลขรวมของเดือน (กดที่กล่องเพื่อดูรายละเอียดรายคน) ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox
          label="ผลงานเดือนนี้ (ทีม)"
          value={team.credited}
          unit="ชิ้น"
          sub={`ส่งตรวจ ${team.submitted} · เดือนก่อน ${team.prevSubmitted}`}
          onClick={() => setDetail({ kind: "credited" })}
          detailLabel="ดูรายคน"
        />
        <StatBox
          label="ตรวจผ่านแล้ว"
          value={team.approved}
          unit="ชิ้น"
          tone="text-sky-700"
          sub={`รอตรวจ ${team.waiting + team.sent} ชิ้น${
            team.revision > 0 ? ` · งานแก้ ${team.revision}` : ""
          }`}
          onClick={() => setDetail({ kind: "review" })}
          detailLabel="ดูรายคน"
        />
        <StatBox
          label={isCurrentMonth ? "ตามหลังเป้าวันนี้" : "ไม่ครบเป้า"}
          value={team.behindPeople}
          unit="คน"
          sub={`จากที่ตั้งเป้า ${team.peopleWithTarget} คน · ครบเป้าแล้ว ${team.donePeople}`}
          tone={team.behindPeople > 0 ? "text-rose-600" : "text-emerald-600"}
          onClick={() => setDetail({ kind: "behind" })}
          detailLabel="ดูว่าใครตามหลัง"
        />
        {/* โพสแล้วกี่ชิ้นจากกี่ชิ้น + กดดูว่าใครดองงานโพสไว้ (คำสั่งผู้ใช้ 2026-08-29) */}
        <StatBox
          label="โพสแล้ว (อนุมัติเดือนนี้)"
          value={`${team.post.done}/${team.post.due}`}
          sub={
            team.post.backlog > 0
              ? `ดองไว้ ${team.post.backlog} ชิ้น · รวม ${team.post.backlogDays} วัน`
              : "ไม่มีงานค้างโพส"
          }
          tone={team.post.backlog > 0 ? "text-amber-600" : "text-emerald-600"}
          onClick={() => setDetail({ kind: "post", personId: null })}
          detailLabel="ดูว่าใครดองไว้"
        />
      </div>

      {/* ---------- ตารางเทียบรายคน ---------- */}
      {personStats.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={40} strokeWidth={1.5} />}
            title="ยังไม่มีใครถูกตั้งเป้า KPI"
            description='ไปที่ "ตั้งค่า KPI" เพื่อเพิ่มทีมงานและกำหนดเป้าจำนวนชิ้น'
          />
        </Card>
      ) : (
        <Card className="mb-4 p-0">
          {/* จอเล็ก: การ์ดต่อคน (ตาราง 10 คอลัมน์เลื่อนอ่านบนมือถือไม่ไหว) */}
          <div className="divide-y divide-stone-100 sm:hidden">
            {rows.map((s) => {
              const behind = Math.max(0, s.expectedOverall - s.doneTotal);
              return (
                <div key={s.profile.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <PersonAvatar profile={s.profile} size={8} />
                    {/* เป้านิ้ว 44px บนจอเล็ก — การ์ดนี้แสดงเฉพาะ <sm อยู่แล้ว */}
                    <Link
                      href={`/content-tracking?person=${s.profile.id}`}
                      className="flex min-h-11 min-w-0 flex-1 items-center truncate text-sm font-medium text-stone-800"
                    >
                      {personName(s.profile)}
                    </Link>
                    <StatusPill
                      status={s.status}
                      behindRules={s.behindRules}
                      isCurrentMonth={isCurrentMonth}
                    />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 text-xs">
                    <span className="font-bold tabular-nums text-stone-800">
                      {s.doneTotal}
                      <span className="font-normal text-stone-400">
                        /{s.overallTarget}
                      </span>
                    </span>
                    <span className="text-stone-400">
                      ({pctOf(s.doneTotal, s.overallTarget)}%)
                    </span>
                    {isCurrentMonth && behind > 0 && (
                      <span className="ml-auto rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">
                        ตามหลัง {behind}
                      </span>
                    )}
                  </div>
                  <PaceBar
                    done={s.doneTotal}
                    target={s.overallTarget}
                    tickPct={tickPct}
                    tone={paceTone(
                      s.doneTotal,
                      s.overallTarget,
                      s.expectedOverall
                    )}
                    className="mt-1 h-1.5"
                  />
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-stone-500">
                    <span>
                      วิดีโอ{" "}
                      <span className="font-semibold text-stone-700">
                        {s.formats.video.done}
                        {s.formats.video.target > 0 &&
                          `/${s.formats.video.target}`}
                      </span>
                    </span>
                    <span>
                      ภาพ{" "}
                      <span className="font-semibold text-stone-700">
                        {s.formats.image.done}
                        {s.formats.image.target > 0 &&
                          `/${s.formats.image.target}`}
                      </span>
                    </span>
                    <span>
                      ผ่าน{" "}
                      <span className="font-semibold text-sky-700">
                        {s.approved}
                      </span>
                    </span>
                    <span>
                      รอตรวจ{" "}
                      <span className="font-semibold text-emerald-700">
                        {s.waiting + s.sent}
                      </span>
                    </span>
                    {s.revision > 0 && (
                      <span>
                        งานแก้{" "}
                        <span className="font-semibold text-rose-600">
                          {s.revision}
                        </span>
                      </span>
                    )}
                    <span>
                      โพส{" "}
                      <span className="font-semibold text-stone-700">
                        {s.post.done}/{s.post.due}
                      </span>
                      {s.post.backlog > 0 && (
                        <span className="text-amber-600">
                          {" "}
                          · ดอง {s.post.backlog} ({s.post.backlogDays} วัน)
                        </span>
                      )}
                    </span>
                    <span>
                      ไฟล์{" "}
                      <span className="font-semibold text-stone-700">
                        {s.pieces.files}
                      </span>
                    </span>
                    <span className="text-stone-400">
                      เดือนก่อน {s.lastTotal}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>

          {/* จอ ≥sm: ตารางเทียบเต็ม (เลื่อนแนวนอนในกล่องตัวเอง) */}
          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[70rem]">
              {/* หัวตาราง */}
              <div
                className={`${GRID_COLS} items-end gap-2 border-b border-stone-200/70 px-3 py-2`}
              >
                <SortHeader
                  label="ทีมงาน"
                  sortKey="name"
                  sort={sort}
                  onSort={onSort}
                  align="left"
                />
                <SortHeader
                  label="ทำได้ / เป้ารวม"
                  sortKey="progress"
                  sort={sort}
                  onSort={onSort}
                />
                <SortHeader
                  label={isCurrentMonth ? "ตามหลัง" : "ขาด"}
                  sortKey="behind"
                  sort={sort}
                  onSort={onSort}
                  hint="เรียงตามจำนวนที่ยังขาดจากเป้าถึงวันนี้"
                />
                <SortHeader
                  label="วิดีโอ"
                  sortKey="video"
                  sort={sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="ภาพ"
                  sortKey="image"
                  sort={sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="ส่ง"
                  sortKey="submitted"
                  sort={sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="ผ่าน"
                  sortKey="approved"
                  sort={sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="รอตรวจ"
                  sortKey="waiting"
                  sort={sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="โพสแล้ว"
                  sortKey="posted"
                  sort={sort}
                  onSort={onSort}
                  hint="โพสแล้ว/งานที่อนุมัติในเดือนนี้ของคิวคนนั้น — เรียงตามจำนวนงานที่ดองไว้"
                />
                <SortHeader
                  label="ไฟล์"
                  sortKey="files"
                  sort={sort}
                  onSort={onSort}
                  hint="ไฟล์ภาพ/วิดีโอที่อัพจริงในการ์ด"
                />
                <SortHeader
                  label="เดือนก่อน"
                  sortKey="prev"
                  sort={sort}
                  onSort={onSort}
                />
              </div>
  
              {/* แถวรายคน */}
              {rows.map((s) => {
                const behind = Math.max(0, s.expectedOverall - s.doneTotal);
                const short = Math.max(0, s.overallTarget - s.doneTotal);
                return (
                  <div
                    key={s.profile.id}
                    className={`${GRID_COLS} items-center gap-2 border-b border-stone-100 px-3 py-2.5 last:border-b-0 hover:bg-brand-50/40`}
                  >
                    {/* คน */}
                    <div className="flex min-w-0 items-center gap-2">
                      <PersonAvatar profile={s.profile} size={8} />
                      <div className="min-w-0">
                        {/* กดชื่อ = เปิดปฏิทินของคนนั้นทันที (หน้าปฏิทินอ่าน ?person= เป็นค่าเริ่มต้น) */}
                        <Link
                          href={`/content-tracking?person=${s.profile.id}`}
                          className="block truncate text-sm font-medium text-stone-800 hover:text-brand-600 hover:underline"
                          title={`${personName(s.profile)} — ดูปฏิทินรายคน`}
                        >
                          {personName(s.profile)}
                        </Link>
                        <div className="mt-0.5">
                          <StatusPill
                            status={s.status}
                            behindRules={s.behindRules}
                            isCurrentMonth={isCurrentMonth}
                          />
                        </div>
                      </div>
                    </div>
  
                    {/* ทำได้ / เป้ารวม */}
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-stone-800">
                        {s.doneTotal}
                        <span className="font-normal text-stone-400">
                          /{s.overallTarget}
                        </span>
                        <span className="ml-1 text-[10px] font-normal text-stone-400">
                          {pctOf(s.doneTotal, s.overallTarget)}%
                        </span>
                      </p>
                      <PaceBar
                        done={s.doneTotal}
                        target={s.overallTarget}
                        tickPct={tickPct}
                        tone={paceTone(
                          s.doneTotal,
                          s.overallTarget,
                          s.expectedOverall
                        )}
                        className="mt-1 h-1.5"
                      />
                    </div>
  
                    {/* ตามหลัง / ขาด */}
                    <p className="text-right text-xs tabular-nums">
                      {isCurrentMonth ? (
                        behind > 0 ? (
                          <span className="font-bold text-rose-600">{behind}</span>
                        ) : (
                          <span className="text-emerald-600">ตามเป้า</span>
                        )
                      ) : short > 0 ? (
                        <span className="font-bold text-rose-600">{short}</span>
                      ) : (
                        <span className="text-emerald-600">ครบ</span>
                      )}
                    </p>
  
                    <FormatCell
                      done={s.formats.video.done}
                      target={s.formats.video.target}
                      expected={s.formats.video.expected}
                      isCurrentMonth={isCurrentMonth}
                    />
                    <FormatCell
                      done={s.formats.image.done}
                      target={s.formats.image.target}
                      expected={s.formats.image.expected}
                      isCurrentMonth={isCurrentMonth}
                    />
  
                    <p className="text-right text-xs font-semibold tabular-nums text-stone-700">
                      {s.submitted}
                    </p>
                    <p className="text-right text-xs font-semibold tabular-nums text-sky-700">
                      {s.approved}
                    </p>
                    {/* รอตรวจ = เขียว · ตัวเลขแดงต่อท้าย = งานที่ถูกตีกลับ (งานแก้) */}
                    <p className="text-right text-xs tabular-nums text-emerald-700">
                      {s.waiting + s.sent}
                      {s.revision > 0 && (
                        <span
                          className="ml-1 font-bold text-rose-600"
                          title={`ถูกตีกลับ ${s.revision} ชิ้น — ยังไม่ได้ส่งตรวจใหม่`}
                        >
                          แก้ {s.revision}
                        </span>
                      )}
                    </p>
                    {/* โพสแล้วกี่/กี่ + ตัวเลขเหลือง = ดองไว้ (กดเปิดรายละเอียดของคนนี้) */}
                    <div className="text-right text-xs tabular-nums">
                      <span className="font-semibold text-stone-700">
                        {s.post.done}/{s.post.due}
                      </span>
                      {s.post.backlog > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDetail({ kind: "post", personId: s.profile.id })
                          }
                          title={`ดองงานโพสไว้ ${s.post.backlog} ชิ้น · รวม ${s.post.backlogDays} วัน — กดดูรายการ`}
                          className="ml-1 cursor-pointer rounded px-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50"
                        >
                          ดอง {s.post.backlog}
                        </button>
                      )}
                    </div>
                    <p className="text-right text-xs tabular-nums text-stone-600">
                      {s.pieces.files}
                    </p>
                    <p className="text-right text-xs tabular-nums text-stone-500">
                      {s.lastTotal}
                      <span className="text-[10px] text-stone-400">
                        {" "}
                        ({s.lastMetRules}/{s.ruleStats.length})
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <p className="mb-6 text-[11px] leading-5 text-stone-400">
        &quot;ทำได้ / เป้ารวม&quot; = ผลงานตามฐานที่ตั้งไว้ให้คนนั้น (ส่งงาน /
        Brief ที่ถูกรับ / งานที่ต้องโพส) · &quot;ส่ง&quot; =
        การ์ดที่ตัวเองกดส่งตรวจในเดือนนี้ · &quot;ผ่าน&quot; = ตรวจผ่านแล้ว ·
        &quot;รอตรวจ&quot; = ส่งแล้วยังไม่ผ่าน (ตัวเลขแดงต่อท้าย =
        งานที่ถูกตีกลับ ยังไม่ได้ส่งตรวจใหม่) · &quot;โพสแล้ว&quot; =
        โพสแล้ว/งานที่อนุมัติในเดือนนี้ซึ่งคนนี้เป็นคนต้องโพส (ตัวเลขเหลือง =
        ดองไว้ทั้งหมด กดดูรายการได้) · &quot;ไฟล์&quot; =
        ไฟล์ภาพ/วิดีโอที่อัพจริงในการ์ด · &quot;เดือนก่อน&quot; = จำนวนชิ้น
        (ผ่านกี่กติกา) · กดหัวคอลัมน์เพื่อเรียงลำดับ
      </p>

      {/* ---------- จำนวนชิ้นงาน: การ์ด vs ไฟล์ที่อัพจริง ---------- */}
      <Card className="mb-4 p-4">
        <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-semibold text-stone-700">
            จำนวนชิ้นงาน — การ์ด เทียบ ไฟล์ที่อัพจริง
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              value={pieceRange}
              onChange={(e) => setPieceRange(e.target.value as MediaRangeKey)}
              className="w-auto"
              aria-label="ช่วงเวลาของตัววิเคราะห์"
            >
              {MEDIA_RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
            {pieceRange === "custom" && (
              <>
                <Input
                  type="date"
                  value={pieceFrom}
                  onChange={(e) => setPieceFrom(e.target.value)}
                  className="w-auto"
                  aria-label="ตั้งแต่วันที่"
                />
                <span className="text-xs text-stone-400">ถึง</span>
                <Input
                  type="date"
                  value={pieceTo}
                  onChange={(e) => setPieceTo(e.target.value)}
                  className="w-auto"
                  aria-label="ถึงวันที่"
                />
              </>
            )}
          </div>
        </div>
        <p className="mb-3 text-[11px] text-stone-500">
          การ์ด 1 ใบใส่ได้หลายไฟล์ — เทียบ &quot;จำนวนการ์ด&quot;
          (แยกภาพ/วิดีโอตามประเภทที่ติดไว้) กับ &quot;ชิ้นงานไฟล์&quot;
          ที่นับจากไฟล์ภาพ/วิดีโอที่อัพโหลดจริงในการ์ด (ไฟล์ชนิดอื่นและไฟล์ในแชทไม่นับ)
          · นับตามวันส่งงาน ช่วงเวลาเลือกอิสระไม่ผูกกับเดือนด้านบน
        </p>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
            <p className="text-[11px] text-stone-500">การ์ด (จำนวนงานที่ส่ง)</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-stone-800">
              {pieceStats.total.cards}
              <span className="ml-1 text-xs font-normal text-stone-400">ใบ</span>
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">
              วิดีโอ {pieceStats.total.cardVideo} · ภาพ{" "}
              {pieceStats.total.cardImage}
              {pieceStats.total.cardNone > 0 &&
                ` · ยังไม่ระบุ ${pieceStats.total.cardNone}`}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
            <p className="text-[11px] text-stone-500">
              ชิ้นงานไฟล์ (ภาพ/วิดีโอที่อัพในการ์ด)
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-stone-800">
              {pieceStats.total.files}
              <span className="ml-1 text-xs font-normal text-stone-400">ชิ้น</span>
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">
              ภาพ {pieceStats.total.fileImage} · วิดีโอ{" "}
              {pieceStats.total.fileVideo}
              {pieceStats.total.cards > 0 &&
                ` · เฉลี่ย ${(pieceStats.total.files / pieceStats.total.cards).toFixed(1)} ชิ้น/การ์ด`}
            </p>
          </div>
        </div>

        {pieceStats.total.cards === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            ไม่มีงานที่ส่งในช่วงเวลานี้
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[40rem]">
              <div className={`${PIECE_COLS} gap-2 border-b border-stone-200/70 pb-1.5 text-[11px] font-semibold text-stone-500`}>
                <span>ทีมงาน</span>
                <span className="text-right">การ์ด</span>
                <span className="text-right">การ์ด VDO</span>
                <span className="text-right">การ์ดภาพ</span>
                <span className="text-right">ไฟล์รวม</span>
                <span className="text-right">ไฟล์ VDO</span>
                <span className="text-right">เฉลี่ย/การ์ด</span>
              </div>
              {pieceStats.people.map(({ id, agg }) => (
                <div
                  key={id || "none"}
                  className={`${PIECE_COLS} gap-2 border-b border-stone-100 py-2 text-xs last:border-b-0`}
                >
                  <span className="min-w-0 truncate font-medium text-stone-800">
                    {id === ""
                      ? "ไม่ระบุผู้รับผิดชอบ"
                      : personName(profileById.get(id))}
                  </span>
                  <span className="text-right font-bold tabular-nums text-stone-800">
                    {agg.cards}
                  </span>
                  <span className="text-right tabular-nums text-stone-600">
                    {agg.cardVideo}
                  </span>
                  <span className="text-right tabular-nums text-stone-600">
                    {agg.cardImage}
                  </span>
                  <span className="text-right font-bold tabular-nums text-stone-800">
                    {agg.files}
                  </span>
                  <span className="text-right tabular-nums text-stone-600">
                    {agg.fileVideo}
                  </span>
                  <span className="text-right tabular-nums text-stone-400">
                    {agg.cards > 0 ? (agg.files / agg.cards).toFixed(1) : "0"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---------- คนที่มีผลงานแต่ไม่มีเป้า ---------- */}
      {month.offRadar.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <AlertTriangle size={13} />
            มีผลงานในเดือนนี้แต่ยังไม่ถูกตั้งเป้า KPI
          </p>
          <div className="flex flex-wrap gap-2">
            {month.offRadar.map((row) => (
              <span
                key={row.id}
                className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs text-stone-600"
              >
                {personName(row.profile)} · {row.count} ชิ้น
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---------- ป๊อปอัพรายละเอียดของกล่องสถิติ (อยู่หน้าเดิม ไม่เปลี่ยนหน้า) ---------- */}
      <Modal
        open={detail !== null && detail.kind === "credited"}
        onClose={() => setDetail(null)}
        title={`ผลงานเดือนนี้รายคน · ${team.credited} ชิ้น`}
        wide
      >
        <p className="mb-3 text-xs leading-5 text-stone-500">
          &quot;ผลงาน&quot; ของแต่ละคนนับตามฐานที่ตั้งไว้ในหน้าตั้งค่า KPI —
          คนที่ทำชิ้นงานเองนับตอนส่งตรวจ · คนที่ brief อย่างเดียวนับ Brief
          ที่มีคนกดรับงาน · ฐาน &quot;งานที่ต้องโพส&quot; นับตอนกดโพส
        </p>
        {personStats.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            ยังไม่มีใครถูกตั้งเป้า KPI
          </p>
        ) : (
          <ul className="space-y-1.5">
            {[...personStats]
              .sort((a, b) => b.doneTotal - a.doneTotal)
              .map((s2) => (
                <li
                  key={s2.profile.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200/70 bg-white/70 px-3 py-2"
                >
                  <PersonAvatar profile={s2.profile} size={6} />
                  <Link
                    href={`/content-tracking?person=${s2.profile.id}`}
                    className="min-w-0 flex-1 truncate text-sm text-stone-800 hover:text-brand-600 hover:underline"
                  >
                    {personName(s2.profile)}
                  </Link>
                  {CONTENT_KPI_BASIS_ORDER.filter(
                    (b) => s2.basisCounts[b] > 0
                  ).map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center gap-1 text-[11px] text-stone-500"
                    >
                      <BasisChip basis={b} />
                      <span className="tabular-nums">{s2.basisCounts[b]}</span>
                    </span>
                  ))}
                  <span className="ml-auto shrink-0 text-xs font-bold tabular-nums text-stone-800">
                    {s2.doneTotal}
                    <span className="font-normal text-stone-400">
                      /{s2.overallTarget}
                    </span>
                    <span className="ml-1 text-[10px] font-normal text-stone-400">
                      {pctOf(s2.doneTotal, s2.overallTarget)}%
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        )}
        {month.offRadar.length > 0 && (
          <>
            <p className="mb-1.5 mt-4 text-xs font-semibold text-stone-500">
              มีผลงานแต่ยังไม่ถูกตั้งเป้า KPI
            </p>
            <div className="flex flex-wrap gap-2">
              {month.offRadar.map((row) => (
                <span
                  key={row.id}
                  className="rounded-full border border-dashed border-stone-300 px-3 py-1 text-xs text-stone-600"
                >
                  {personName(row.profile)} · {row.count} ชิ้น
                </span>
              ))}
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={detail !== null && detail.kind === "review"}
        onClose={() => setDetail(null)}
        title="สถานะการตรวจงานรายคน"
        wide
      >
        <p className="mb-3 text-xs leading-5 text-stone-500">
          นับเฉพาะการ์ดที่แต่ละคนกดส่งตรวจในเดือนนี้ (ผลงานฐาน Brief/โพส
          ไม่ผ่านคิวตรวจ จึงไม่อยู่ในตารางนี้) · ทั้งทีมส่งตรวจ {team.submitted}{" "}
          ชิ้น · ผ่าน {team.approved} · รอตรวจ {team.waiting + team.sent}
          {team.revision > 0 ? ` · งานแก้ ${team.revision}` : ""}
        </p>
        <ul className="space-y-1.5">
          {[...personStats]
            .filter((s2) => s2.submitted > 0)
            .sort((a, b) => b.waiting + b.sent - (a.waiting + a.sent))
            .map((s2) => (
              <li
                key={s2.profile.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200/70 bg-white/70 px-3 py-2"
              >
                <PersonAvatar profile={s2.profile} size={6} />
                <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                  {personName(s2.profile)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-stone-600">
                  ส่งตรวจ{" "}
                  <span className="font-bold text-stone-800">
                    {s2.submitted}
                  </span>{" "}
                  · ผ่าน{" "}
                  <span className="font-bold text-sky-700">{s2.approved}</span>{" "}
                  · รอตรวจ{" "}
                  <span className="font-bold text-emerald-700">
                    {s2.waiting + s2.sent}
                  </span>
                  {s2.revision > 0 && (
                    <>
                      {" "}
                      · งานแก้{" "}
                      <span className="font-bold text-rose-600">
                        {s2.revision}
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          {personStats.every((s2) => s2.submitted === 0) && (
            <li className="py-6 text-center text-sm text-stone-400">
              เดือนนี้ยังไม่มีใครส่งตรวจงาน
            </li>
          )}
        </ul>
      </Modal>

      <Modal
        open={detail !== null && detail.kind === "behind"}
        onClose={() => setDetail(null)}
        title={
          isCurrentMonth
            ? `ตามหลังเป้าวันนี้ ${team.behindPeople} คน`
            : `ไม่ครบเป้า ${team.behindPeople} คน`
        }
        wide
      >
        <p className="mb-3 text-xs leading-5 text-stone-500">
          {isCurrentMonth
            ? "เป้าถึงวันนี้ = เป้าทั้งเดือน × สัดส่วนวันที่ผ่านไป — ตัวเลขสีแดงคือจำนวนที่ยังขาดอยู่ ณ วันนี้"
            : "เทียบกับเป้าทั้งเดือน — ตัวเลขสีแดงคือจำนวนที่ขาดไปเมื่อจบเดือน"}
        </p>
        {team.behindPeople === 0 ? (
          <p className="py-6 text-center text-sm text-emerald-600">
            ทุกคนตามเป้าอยู่ 🎉
          </p>
        ) : (
          <ul className="space-y-2">
            {personStats
              .filter((s2) => s2.status === "behind")
              .map((s2) => (
                <li
                  key={s2.profile.id}
                  className="rounded-xl border border-stone-200/70 bg-white/70 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <PersonAvatar profile={s2.profile} size={8} />
                    <Link
                      href={`/content-tracking?person=${s2.profile.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800 hover:text-brand-600 hover:underline"
                    >
                      {personName(s2.profile)}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-stone-600">
                      ทำได้{" "}
                      <span className="font-bold text-stone-800">
                        {s2.doneTotal}
                      </span>
                      /{s2.overallTarget} · ขาด{" "}
                      <span className="font-bold text-rose-600">
                        {Math.max(0, s2.expectedOverall - s2.doneTotal)}
                      </span>
                    </span>
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {s2.ruleStats
                      .filter((rs) => rs.behind > 0)
                      .map((rs) => (
                        <li
                          key={rs.rule.id}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                        >
                          <BasisChip basis={rs.rule.basis} />
                          {rs.rule.format === null
                            ? "ทุกฟอร์แมต"
                            : CONTENT_FORMATS[rs.rule.format].label}
                          {rs.rule.category_id !== null &&
                            ` · ${
                              categories.find(
                                (c) => c.id === rs.rule.category_id
                              )?.name ?? "หมวดที่ถูกลบ"
                            }`}{" "}
                          <span className="font-bold tabular-nums">
                            {rs.done}/{rs.target}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
          </ul>
        )}
      </Modal>

      {/* คิวงานที่ดองไว้ยังไม่โพส — ใช้คอมโพเนนต์ร่วมกับหน้าปฏิทิน */}
      <PostBacklogModal
        open={detail !== null && detail.kind === "post"}
        onClose={() => setDetail(null)}
        groups={
          detail !== null && detail.kind === "post" && detail.personId !== null
            ? month.postBacklog.filter((g) => g.ownerId === detail.personId)
            : month.postBacklog
        }
        total={
          detail !== null && detail.kind === "post" && detail.personId !== null
            ? (month.postById.get(detail.personId) ?? emptyPostStat())
            : team.post
        }
        scopeLabel={
          detail !== null && detail.kind === "post" && detail.personId !== null
            ? personName(profileById.get(detail.personId))
            : "ทั้งทีม"
        }
      />
    </>
  );
}
