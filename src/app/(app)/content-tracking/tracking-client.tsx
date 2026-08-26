"use client";

import {
  AlertTriangle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Settings2,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { CONTENT_FORMATS } from "@/lib/constants";
import {
  isImagePath,
  isVideoPath,
  MEDIA_RANGES,
  type MediaRangeKey,
  rangeStart,
  thaiDayOf,
} from "@/lib/media";
import type {
  ContentCategoryRow,
  ContentFormat,
  ContentKpiRow,
} from "@/lib/types";

/* ---------- helpers ระดับโมดูล ---------- */

/** แถวงานแบบย่อที่หน้านี้ใช้ — select เฉพาะคอลัมน์นี้จาก page.tsx */
export type TrackedTask = {
  id: string;
  title: string;
  assignee_id: string | null;
  posted_at: string | null;
  approved_at: string | null;
  review_submitted_at: string | null;
  review_status: string;
  completed: boolean;
  content_format: ContentFormat | null;
  content_category_id: string | null;
  /** ไฟล์ที่อัพโหลดในการ์ด (task_files) — ตัววิเคราะห์จำนวนชิ้นงานใช้นับภาพ/วิดีโอจริง */
  files: { file_path: string }[];
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
};

// ชื่อเดือนไทยตารางคงที่ — ห้ามใช้ toLocaleDateString (ผล SSR/CSR ไม่ตรงกัน)
const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

function monthLabel(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1] ?? month} ${year + 543}`;
}

/** ขอบเขตเดือนตามเวลาไทย เป็น epoch ms — [start, end) */
function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = Date.parse(`${year}-${pad(month)}-01T00:00:00+07:00`);
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const end = Date.parse(`${nextY}-${pad(nextM)}-01T00:00:00+07:00`);
  return { start, end };
}

function shiftMonth(year: number, month: number, dir: -1 | 1) {
  const m = month + dir;
  if (m < 1) return { year: year - 1, month: 12 };
  if (m > 12) return { year: year + 1, month: 1 };
  return { year, month: m };
}

function personName(p: ProfileLite | undefined): string {
  if (!p) return "ไม่ทราบชื่อ";
  return p.full_name?.trim() || p.email || "ไม่ทราบชื่อ";
}

/**
 * เวลาที่งานชิ้นนี้ "ส่งงาน" — ผู้ใช้ให้นับ KPI จากการส่งงาน ไม่ใช่วันกดโพส
 * (คนโพสอาจกดช้าเป็นชุด — คนทำงานไม่ควรดูตามหลังเพราะคิวโพส):
 * ยึด review_submitted_at (กดส่งตรวจ) → งานเก่าก่อน 0036 ใช้ approved_at → posted_at
 */
function workTimeOf(t: TrackedTask): number | null {
  const raw = t.review_submitted_at ?? t.approved_at ?? t.posted_at;
  if (raw === null) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** วันส่งงานตามเวลาไทย (YYYY-MM-DD) — ตัววิเคราะห์จำนวนชิ้นงานใช้เทียบกับ filter range */
function workDayOf(t: TrackedTask): string | null {
  const raw = t.review_submitted_at ?? t.approved_at ?? t.posted_at;
  return raw === null ? null : thaiDayOf(raw);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * ยอดสะสมของตัววิเคราะห์จำนวนชิ้นงาน — แยก 2 มุมมองตามที่ผู้ใช้ขอ (2026-08-26):
 * "การ์ด" = จำนวนงาน (แยกภาพ/วิดีโอจาก content_format) และ "ชิ้นงานไฟล์" =
 * จำนวนไฟล์ภาพ/วิดีโอที่อัพโหลดจริงในการ์ด (การ์ด 1 ใบมีหลายภาพ = หลายชิ้น)
 */
type PieceAgg = {
  cards: number;
  cardImage: number;
  cardVideo: number;
  cardNone: number;
  files: number;
  fileImage: number;
  fileVideo: number;
};

function emptyPieceAgg(): PieceAgg {
  return {
    cards: 0,
    cardImage: 0,
    cardVideo: 0,
    cardNone: 0,
    files: 0,
    fileImage: 0,
    fileVideo: 0,
  };
}

/** นับงาน 1 ใบเข้ายอด — ไฟล์ที่ไม่ใช่รูป/วิดีโอ (pdf/zip ฯลฯ) ไม่นับเป็นชิ้นงาน */
function addToPieceAgg(agg: PieceAgg, t: TrackedTask) {
  agg.cards += 1;
  if (t.content_format === "image") agg.cardImage += 1;
  else if (t.content_format === "video") agg.cardVideo += 1;
  else agg.cardNone += 1;
  for (const f of t.files) {
    if (isImagePath(f.file_path)) {
      agg.fileImage += 1;
      agg.files += 1;
    } else if (isVideoPath(f.file_path)) {
      agg.fileVideo += 1;
      agg.files += 1;
    }
  }
}

/** งานชิ้นนี้เข้าเงื่อนไขกติกา KPI แถวนี้ไหม — null ในกติกา = ไม่จำกัด */
function matchesRule(t: TrackedTask, r: ContentKpiRow): boolean {
  if (r.format !== null && t.content_format !== r.format) return false;
  if (r.category_id !== null && t.content_category_id !== r.category_id)
    return false;
  return true;
}

/** เป้าที่ "ควรทำได้ถึงวันนี้" — target × (วันที่ผ่านไป ÷ วันทั้งเดือน) ปัดลง (ต้นเดือนไม่โดนธงแดงฟรี) */
function expectedByNow(target: number, elapsedDays: number, daysInMonth: number) {
  return Math.floor((target * elapsedDays) / daysInMonth + 1e-9);
}

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e7e5e4",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: 12,
};

// สีแท่งกราฟ — ตรงกับโทนชิปประเภทใน CONTENT_FORMATS (violet=ภาพ, sky=วิดีโอ), stone=ยังไม่ระบุ
const CHART_FORMAT_COLORS: Record<ContentFormat | "none", string> = {
  image: "#8b5cf6",
  video: "#0ea5e9",
  none: "#d6d3d1",
};

type RuleStat = {
  rule: ContentKpiRow;
  done: number;
  lastDone: number;
  expected: number;
  behind: number;
  met: boolean;
};

type PersonStatus = "behind" | "ontrack" | "done";

type PersonStat = {
  profile: ProfileLite;
  ruleStats: RuleStat[];
  doneTotal: number;
  lastTotal: number;
  lastMetRules: number;
  overallTarget: number;
  expectedOverall: number;
  pending: number;
  status: PersonStatus;
  behindRules: number;
};

const STATUS_RANK: Record<PersonStatus, number> = {
  behind: 0,
  ontrack: 1,
  done: 2,
};

/* ---------- ชิ้นส่วนเล็ก ---------- */

function StatBox({
  label,
  value,
  unit,
  sub,
  tone = "text-stone-800",
}: {
  label: string;
  value: number;
  unit: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>
        {value}
        <span className="ml-1 text-xs font-normal text-stone-400">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}

/** แถบ progress พร้อม "ขีดเป้าถึงวันนี้" (pace tick) — ขีดโชว์เฉพาะเดือนปัจจุบัน */
function PaceBar({
  done,
  target,
  tickPct,
  tone,
  className = "h-2",
}: {
  done: number;
  target: number;
  tickPct: number | null;
  tone: "met" | "behind" | "ontrack";
  className?: string;
}) {
  const pct = target <= 0 ? 0 : Math.min(100, Math.round((done / target) * 100));
  const fill =
    tone === "met"
      ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
      : tone === "behind"
        ? "bg-gradient-to-r from-rose-400 to-rose-500"
        : "bg-gradient-to-r from-brand-400 to-brand-500";
  return (
    <div className={`relative overflow-hidden rounded-full bg-stone-100 ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${fill}`}
        style={{ width: `${pct}%` }}
      />
      {tickPct !== null && tickPct > 0 && tickPct < 100 && (
        <div
          className="absolute inset-y-0 w-0.5 bg-stone-500/60"
          style={{ left: `${tickPct}%` }}
          title="เป้าที่ควรถึงวันนี้"
        />
      )}
    </div>
  );
}

function StatusPill({
  status,
  behindRules,
  isCurrentMonth,
}: {
  status: PersonStatus;
  behindRules: number;
  isCurrentMonth: boolean;
}) {
  if (status === "done")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
        <BadgeCheck size={12} />
        ครบเป้า
      </span>
    );
  if (status === "behind")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
        <AlertTriangle size={12} />
        {isCurrentMonth ? "ตามหลัง" : "ไม่ครบเป้า"} {behindRules} กติกา
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
      ตามเป้า
    </span>
  );
}

/**
 * แดชบอร์ดติดตาม KPI ทีมคอนเทนต์ — อ่านอย่างเดียว (ตั้งเป้า/หมวดที่ /content-kpi)
 * นับผลงานจาก "วันส่งงาน" (workTimeOf) ภายในเดือนที่เลือก แยกตามผู้รับผิดชอบงาน:
 * แถบสรุป → กราฟรายวัน/รายสัปดาห์ (แยกสีตามฟอร์แมต + เส้นวันนี้) → ลิสต์รายคนเทียบ
 * เป้าตามวัน (pace = target × วันที่ผ่านไป/วันทั้งเดือน) + เดือนก่อน; งานที่ยังไม่ระบุ
 * ประเภทยุบเป็นปุ่มแจ้งเตือน กดแล้วเปิดโมดัลรายชื่อ (คำสั่งผู้ใช้ 2026-08-22)
 */
export function TrackingClient({
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
  /** วันนี้ตามเวลาไทย — คำนวณจาก server (client ไม่แตะ Date.now() ตอน render) */
  initialYear: number;
  initialMonth: number;
  initialDay: number;
  loadError: string | null;
}) {
  const [ym, setYm] = useState({ year: initialYear, month: initialMonth });
  const [chartMode, setChartMode] = useState<"day" | "week">("day");
  const [chartPerson, setChartPerson] = useState("all");
  const [noticeOpen, setNoticeOpen] = useState(false);
  // ตัววิเคราะห์จำนวนชิ้นงาน — filter range อิสระ ไม่ผูกกับเดือนที่เลือกด้านบน
  const [pieceRange, setPieceRange] = useState<MediaRangeKey>("1m");
  const [pieceFrom, setPieceFrom] = useState("");
  const [pieceTo, setPieceTo] = useState("");

  const isCurrentMonth = ym.year === initialYear && ym.month === initialMonth;

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const categoryName = (id: string | null) =>
    id === null
      ? null
      : (categories.find((c) => c.id === id)?.name ?? "หมวดที่ถูกลบ");

  const bounds = useMemo(() => monthBounds(ym.year, ym.month), [ym]);
  const daysInMonth = Math.round((bounds.end - bounds.start) / 86400000);

  // จำนวนวันที่ผ่านไปของเดือนที่เลือก — เดือนอดีต = ทั้งเดือน, อนาคต = 0
  const ymKey = ym.year * 12 + ym.month;
  const nowKey = initialYear * 12 + initialMonth;
  const elapsedDays =
    ymKey < nowKey
      ? daysInMonth
      : ymKey > nowKey
        ? 0
        : Math.min(initialDay, daysInMonth);

  /** งานที่ส่งภายในเดือนที่เลือก พร้อมเวลาที่ใช้นับ */
  const inMonth = useMemo(() => {
    const list: { t: TrackedTask; ms: number }[] = [];
    for (const t of tasks) {
      const ms = workTimeOf(t);
      if (ms !== null && ms >= bounds.start && ms < bounds.end)
        list.push({ t, ms });
    }
    return list;
  }, [tasks, bounds]);

  /** งานที่ส่งในเดือนก่อนหน้า — ไว้เทียบ */
  const inPrevMonth = useMemo(() => {
    const prev = shiftMonth(ym.year, ym.month, -1);
    const b = monthBounds(prev.year, prev.month);
    return tasks.filter((t) => {
      const ms = workTimeOf(t);
      return ms !== null && ms >= b.start && ms < b.end;
    });
  }, [tasks, ym]);

  const byAssignee = useMemo(() => {
    const map = new Map<string, TrackedTask[]>();
    for (const { t } of inMonth) {
      if (t.assignee_id === null) continue;
      const list = map.get(t.assignee_id);
      if (list) list.push(t);
      else map.set(t.assignee_id, [t]);
    }
    return map;
  }, [inMonth]);

  const prevByAssignee = useMemo(() => {
    const map = new Map<string, TrackedTask[]>();
    for (const t of inPrevMonth) {
      if (t.assignee_id === null) continue;
      const list = map.get(t.assignee_id);
      if (list) list.push(t);
      else map.set(t.assignee_id, [t]);
    }
    return map;
  }, [inPrevMonth]);

  /** งานตรวจผ่านแล้วแต่ยังไม่กด "โพสแล้ว" — คิวค้าง ไม่ผูกเดือน */
  const pendingByAssignee = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.posted_at !== null || t.review_status !== "approved") continue;
      if (t.assignee_id === null) continue;
      map.set(t.assignee_id, (map.get(t.assignee_id) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const rulesByPerson = useMemo(() => {
    const map = new Map<string, ContentKpiRow[]>();
    for (const r of kpis) {
      const list = map.get(r.profile_id);
      if (list) list.push(r);
      else map.set(r.profile_id, [r]);
    }
    for (const list of map.values())
      list.sort((a, b) => a.position - b.position);
    return map;
  }, [kpis]);

  /** สถิติรายคน (เฉพาะคนที่ถูกตั้งเป้า) — เรียงคนตามหลังขึ้นก่อน */
  const personStats = useMemo(() => {
    const stats: PersonStat[] = [];
    for (const profile of profiles) {
      const rules = rulesByPerson.get(profile.id);
      if (!rules) continue;
      const done = byAssignee.get(profile.id) ?? [];
      const prev = prevByAssignee.get(profile.id) ?? [];
      const ruleStats: RuleStat[] = rules.map((rule) => {
        const count = done.filter((t) => matchesRule(t, rule)).length;
        const expected = expectedByNow(rule.target, elapsedDays, daysInMonth);
        return {
          rule,
          done: count,
          lastDone: prev.filter((t) => matchesRule(t, rule)).length,
          expected,
          behind: Math.max(0, expected - count),
          met: count >= rule.target,
        };
      });
      // เป้ารวมของคน: กติกา "ทุกฟอร์แมต·ทุกหมวด" ถ้ามี ไม่งั้นรวมกติกาที่ระบุฟอร์แมต
      // (กันนับซ้ำกับกติกาเจาะหมวดของฟอร์แมตเดียวกัน — convention เดียวกับ hint ใน /content-kpi)
      const anyAny = rules.find(
        (r) => r.format === null && r.category_id === null
      );
      const fmtSum = rules
        .filter((r) => r.format !== null && r.category_id === null)
        .reduce((s, r) => s + r.target, 0);
      const overallTarget =
        anyAny?.target ??
        (fmtSum > 0 ? fmtSum : rules.reduce((s, r) => s + r.target, 0));
      const behindRules = ruleStats.filter((r) => r.behind > 0).length;
      const allMet = ruleStats.length > 0 && ruleStats.every((r) => r.met);
      stats.push({
        profile,
        ruleStats,
        doneTotal: done.length,
        lastTotal: prev.length,
        lastMetRules: rules.filter(
          (rule) =>
            prev.filter((t) => matchesRule(t, rule)).length >= rule.target
        ).length,
        overallTarget,
        expectedOverall: expectedByNow(overallTarget, elapsedDays, daysInMonth),
        pending: pendingByAssignee.get(profile.id) ?? 0,
        status: allMet ? "done" : behindRules > 0 ? "behind" : "ontrack",
        behindRules,
      });
    }
    stats.sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        b.behindRules - a.behindRules
    );
    return stats;
  }, [
    profiles,
    rulesByPerson,
    byAssignee,
    prevByAssignee,
    pendingByAssignee,
    elapsedDays,
    daysInMonth,
  ]);

  // งานในเดือนที่ยังไม่ระบุประเภท — ยุบเป็นปุ่มแจ้งเตือน + โมดัล (จัดกลุ่มตามคน)
  const untagged = useMemo(
    () => inMonth.filter(({ t }) => t.content_format === null).map(({ t }) => t),
    [inMonth]
  );
  const untaggedGroups = useMemo(() => {
    const map = new Map<string, TrackedTask[]>();
    for (const t of untagged) {
      const key = t.assignee_id ?? "";
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    // เรียงตามลำดับรายชื่อจาก server — คนไม่ระบุผู้รับผิดชอบไปท้ายสุด
    const keys = [
      ...profiles.filter((p) => map.has(p.id)).map((p) => p.id),
      ...(map.has("") ? [""] : []),
    ];
    return keys.map((key) => ({ key, list: map.get(key) ?? [] }));
  }, [untagged, profiles]);

  // คนที่มีผลงานในเดือนนี้แต่ยังไม่ถูกตั้งเป้า — โชว์ไว้ให้หัวหน้าเห็นว่าตกหล่นใคร
  const peopleOffRadar = useMemo(
    () =>
      [...byAssignee.keys()]
        .filter((id) => !rulesByPerson.has(id))
        .map((id) => ({
          profile: profileById.get(id),
          id,
          count: byAssignee.get(id)?.length ?? 0,
        })),
    [byAssignee, rulesByPerson, profileById]
  );

  /* ---------- ตัววิเคราะห์จำนวนชิ้นงาน (การ์ด vs ไฟล์ที่อัพจริง) ---------- */

  const todayStr = `${initialYear}-${pad2(initialMonth)}-${pad2(initialDay)}`;

  const pieceStats = useMemo(() => {
    const startStr =
      pieceRange === "custom"
        ? pieceFrom || null
        : rangeStart(pieceRange, todayStr);
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
    const maxFiles = people.reduce((m, p) => Math.max(m, p.agg.files), 0);
    return { total, people, maxFiles };
  }, [tasks, pieceRange, pieceFrom, pieceTo, todayStr]);

  /* ---------- ข้อมูลกราฟ ---------- */

  const chartPeople = useMemo(
    () =>
      profiles.filter((p) => rulesByPerson.has(p.id) || byAssignee.has(p.id)),
    [profiles, rulesByPerson, byAssignee]
  );

  const chartData = useMemo(() => {
    const source =
      chartPerson === "all"
        ? inMonth
        : inMonth.filter(({ t }) => t.assignee_id === chartPerson);
    if (chartMode === "day") {
      const rows = Array.from({ length: daysInMonth }, (_, i) => ({
        label: String(i + 1),
        image: 0,
        video: 0,
        none: 0,
      }));
      for (const { t, ms } of source) {
        const day = Math.floor((ms - bounds.start) / 86400000);
        const row = rows[day];
        if (!row) continue;
        row[t.content_format ?? "none"] += 1;
      }
      return rows;
    }
    const weekCount = Math.ceil(daysInMonth / 7);
    const rows = Array.from({ length: weekCount }, (_, i) => ({
      label: `สัปดาห์ ${i + 1}`,
      image: 0,
      video: 0,
      none: 0,
    }));
    for (const { t, ms } of source) {
      const day = Math.floor((ms - bounds.start) / 86400000);
      const row = rows[Math.floor(day / 7)];
      if (!row) continue;
      row[t.content_format ?? "none"] += 1;
    }
    return rows;
  }, [inMonth, chartPerson, chartMode, daysInMonth, bounds]);

  const chartTotal = useMemo(
    () => chartData.reduce((s, r) => s + r.image + r.video + r.none, 0),
    [chartData]
  );

  const todayRefLabel = !isCurrentMonth
    ? null
    : chartMode === "day"
      ? String(initialDay)
      : `สัปดาห์ ${Math.floor((initialDay - 1) / 7) + 1}`;

  /* ---------- ตัวเลขแถบสรุป ---------- */

  const postedCount = inMonth.filter(({ t }) => t.posted_at !== null).length;
  const behindPeople = personStats.filter((s) => s.status === "behind").length;
  const donePeople = personStats.filter((s) => s.status === "done").length;
  const pendingTotal = [...pendingByAssignee.values()].reduce(
    (s, n) => s + n,
    0
  );

  return (
    <>
      <PageHeader
        title="KPI คอนเทนต์"
        description='นับผลงานจากวันที่ "ส่งงาน" (กดส่งตรวจ) — ดูว่าใครตามเป้าถึงวันนี้ ย้อนดูรายวัน/รายสัปดาห์ และเทียบเดือนก่อน'
        action={
          <Link href="/content-kpi">
            <Button variant="secondary">
              <Settings2 size={16} />
              {isAdmin ? "ตั้งค่า KPI & หมวดเนื้อหา" : "ดูเป้า KPI ที่ตั้งไว้"}
            </Button>
          </Link>
        }
      />

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm text-rose-700">
          โหลดข้อมูลไม่ครบ: {loadError}
        </div>
      )}

      {/* ---------- เลือกเดือน + ปุ่มแจ้งเตือนงานยังไม่ระบุประเภท ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setYm(shiftMonth(ym.year, ym.month, -1))}
          aria-label="เดือนก่อนหน้า"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-stone-200 bg-white/70 text-stone-500 hover:bg-white sm:h-9 sm:w-9"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-40 text-center text-base font-semibold text-stone-800">
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

      {/* ---------- แถบสรุป ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox
          label="ส่งงานเดือนนี้ (ทีม)"
          value={inMonth.length}
          unit="ชิ้น"
          sub={`เดือนก่อน ${inPrevMonth.length} ชิ้น · โพสแล้ว ${postedCount}`}
        />
        <StatBox
          label={isCurrentMonth ? "ตามหลังเป้าวันนี้" : "ไม่ครบเป้า"}
          value={behindPeople}
          unit="คน"
          sub={`จากที่ตั้งเป้า ${personStats.length} คน`}
          tone={behindPeople > 0 ? "text-rose-600" : "text-emerald-600"}
        />
        <StatBox
          label="ครบเป้าทั้งเดือนแล้ว"
          value={donePeople}
          unit="คน"
          tone={donePeople > 0 ? "text-emerald-600" : "text-stone-800"}
        />
        <StatBox
          label="ตรวจผ่านแล้วรอกดโพส"
          value={pendingTotal}
          unit="งาน"
          sub="คิวค้างทั้งหมด ไม่ผูกเดือน"
          tone={pendingTotal > 0 ? "text-amber-600" : "text-stone-800"}
        />
      </div>

      {/* ---------- กราฟรายวัน / รายสัปดาห์ ---------- */}
      <Card className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-semibold text-stone-700">
            ผลงาน{chartMode === "day" ? "รายวัน" : "รายสัปดาห์"}
          </p>
          <span className="flex items-center gap-2 text-[11px] text-stone-500">
            {(["image", "video"] as const).map((f) => (
              <span key={f} className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: CHART_FORMAT_COLORS[f] }}
                />
                {CONTENT_FORMATS[f].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: CHART_FORMAT_COLORS.none }}
              />
              ยังไม่ระบุ
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-full border border-stone-200 bg-white/70 p-0.5">
              {(
                [
                  ["day", "รายวัน"],
                  ["week", "รายสัปดาห์"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={`min-h-9 cursor-pointer rounded-full px-3 text-xs font-semibold sm:min-h-7 ${
                    chartMode === mode
                      ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white"
                      : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Select
              value={chartPerson}
              onChange={(e) => setChartPerson(e.target.value)}
              className="w-auto min-w-28"
              aria-label="เลือกคนที่จะดูกราฟ"
            >
              <option value="all">ทุกคน</option>
              {chartPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {personName(p)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {chartTotal === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">
            ยังไม่มีงานที่ส่งในเดือนนี้
          </p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f5f5f4"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={false}
                  interval={chartMode === "day" ? 1 : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [`${value} ชิ้น`, name]}
                  labelFormatter={(label) =>
                    chartMode === "day" ? `วันที่ ${label}` : String(label)
                  }
                />
                {todayRefLabel !== null && (
                  <ReferenceLine
                    x={todayRefLabel}
                    stroke="#a8a29e"
                    strokeDasharray="4 3"
                    label={{
                      value: "วันนี้",
                      position: "top",
                      fontSize: 10,
                      fill: "#78716c",
                    }}
                  />
                )}
                <Bar
                  dataKey="image"
                  name="ภาพ"
                  stackId="a"
                  fill={CHART_FORMAT_COLORS.image}
                />
                <Bar
                  dataKey="video"
                  name="วิดีโอ"
                  stackId="a"
                  fill={CHART_FORMAT_COLORS.video}
                />
                <Bar
                  dataKey="none"
                  name="ยังไม่ระบุ"
                  stackId="a"
                  fill={CHART_FORMAT_COLORS.none}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ---------- ตัววิเคราะห์จำนวนชิ้นงาน (การ์ด vs ไฟล์ที่อัพจริง) ---------- */}
      <Card className="mb-5 p-4">
        <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-semibold text-stone-700">
            ตัววิเคราะห์จำนวนชิ้นงาน
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
          ที่นับจากไฟล์ภาพ/วิดีโอที่อัพโหลดจริงในการ์ด
          (ไฟล์ชนิดอื่นและไฟล์ในแชทไม่นับ) · นับตามวันส่งงาน
          ช่วงเวลาเลือกอิสระไม่ผูกกับเดือนด้านบน
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
            <p className="text-[11px] text-stone-500">การ์ด (จำนวนงานที่ส่ง)</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-stone-800">
              {pieceStats.total.cards}
              <span className="ml-1 text-xs font-normal text-stone-400">ใบ</span>
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">
              ภาพ {pieceStats.total.cardImage} · วิดีโอ{" "}
              {pieceStats.total.cardVideo}
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
              <span className="ml-1 text-xs font-normal text-stone-400">
                ชิ้น
              </span>
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500">
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: CHART_FORMAT_COLORS.image }}
                />
                ภาพ {pieceStats.total.fileImage}
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: CHART_FORMAT_COLORS.video }}
                />
                วิดีโอ {pieceStats.total.fileVideo}
              </span>
              {pieceStats.total.cards > 0 && (
                <span className="text-stone-400">
                  เฉลี่ย ≈{" "}
                  {(pieceStats.total.files / pieceStats.total.cards).toFixed(1)}{" "}
                  ชิ้น/การ์ด
                </span>
              )}
            </p>
          </div>
        </div>

        {pieceStats.total.cards === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            ไม่มีงานที่ส่งในช่วงเวลานี้
          </p>
        ) : (
          <div className="mt-3">
            {pieceStats.people.map(({ id, agg }) => (
              <div
                key={id || "none"}
                className="border-t border-stone-100 py-2.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
                  <p className="min-w-0 flex-1 basis-36 truncate text-sm font-medium text-stone-800">
                    {id === ""
                      ? "ไม่ระบุผู้รับผิดชอบ"
                      : personName(profileById.get(id))}
                  </p>
                  <p className="text-stone-600">
                    การ์ด{" "}
                    <span className="font-bold tabular-nums">{agg.cards}</span>
                    <span className="text-stone-400">
                      {" "}
                      (ภาพ {agg.cardImage} · วิดีโอ {agg.cardVideo}
                      {agg.cardNone > 0 && ` · ยังไม่ระบุ ${agg.cardNone}`})
                    </span>
                  </p>
                  <p className="text-stone-600">
                    ชิ้นงาน{" "}
                    <span className="font-bold tabular-nums text-stone-800">
                      {agg.files}
                    </span>
                    <span className="text-stone-400">
                      {" "}
                      (ภาพ {agg.fileImage} · วิดีโอ {agg.fileVideo})
                    </span>
                  </p>
                  <p className="text-[11px] tabular-nums text-stone-400">
                    ≈{" "}
                    {agg.cards > 0 ? (agg.files / agg.cards).toFixed(1) : "0"}{" "}
                    ชิ้น/การ์ด
                  </p>
                </div>
                {/* แถบเทียบปริมาณไฟล์ระหว่างคน — ยาวตามสัดส่วนของคนที่มากสุด สีตามชนิดไฟล์ */}
                {pieceStats.maxFiles > 0 && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="flex h-full"
                      style={{
                        width: `${Math.round((agg.files / pieceStats.maxFiles) * 100)}%`,
                      }}
                    >
                      {agg.files > 0 && (
                        <>
                          <div
                            className="h-full"
                            style={{
                              width: `${(agg.fileImage / agg.files) * 100}%`,
                              background: CHART_FORMAT_COLORS.image,
                            }}
                          />
                          <div
                            className="h-full"
                            style={{
                              width: `${(agg.fileVideo / agg.files) * 100}%`,
                              background: CHART_FORMAT_COLORS.video,
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- ลิสต์รายคน ---------- */}
      {personStats.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={40} strokeWidth={1.5} />}
            title="ยังไม่มีใครถูกตั้งเป้า KPI"
            description='ไปที่ "ตั้งค่า KPI & หมวดเนื้อหา" เพื่อเพิ่มทีมงานและกำหนดเป้าจำนวนชิ้นต่อเดือน'
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-stone-500">
            รายคน — เรียงคนที่{isCurrentMonth ? "ตามหลังเป้า" : "ไม่ครบเป้า"}
            ขึ้นก่อน
            {isCurrentMonth &&
              ` · ขีดบนแถบ = เป้าที่ควรถึงวันนี้ (วันที่ ${initialDay}/${daysInMonth})`}
          </p>
          {personStats.map((stat) => {
            const overallTone: "met" | "behind" | "ontrack" =
              stat.doneTotal >= stat.overallTarget
                ? "met"
                : stat.doneTotal < stat.expectedOverall
                  ? "behind"
                  : "ontrack";
            const tickPct =
              isCurrentMonth && stat.overallTarget > 0
                ? Math.round((elapsedDays / daysInMonth) * 100)
                : null;
            return (
              <Card key={stat.profile.id} className="p-4">
                {/* แถวหัว — มองแวบเดียวรู้สถานะ */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="min-w-0 truncate text-sm font-semibold text-stone-800">
                    {personName(stat.profile)}
                  </p>
                  <StatusPill
                    status={stat.status}
                    behindRules={stat.behindRules}
                    isCurrentMonth={isCurrentMonth}
                  />
                  <p className="ml-auto text-xs text-stone-500">
                    เดือนนี้{" "}
                    <span className="font-bold tabular-nums text-stone-800">
                      {stat.doneTotal}
                    </span>
                    /{stat.overallTarget} ชิ้น
                    {isCurrentMonth && (
                      <>
                        {" "}
                        · เป้าถึงวันนี้{" "}
                        <span className="font-semibold tabular-nums">
                          {stat.expectedOverall}
                        </span>
                      </>
                    )}{" "}
                    · เดือนก่อน{" "}
                    <span className="tabular-nums">{stat.lastTotal}</span> ชิ้น
                    (ผ่าน {stat.lastMetRules}/{stat.ruleStats.length} กติกา)
                  </p>
                </div>

                <div className="mt-2">
                  <PaceBar
                    done={stat.doneTotal}
                    target={stat.overallTarget}
                    tickPct={tickPct}
                    tone={overallTone}
                    className="h-2.5"
                  />
                </div>

                {/* รายกติกา — บอกชัดว่าขาดประเภทไหน */}
                <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {stat.ruleStats.map((rs) => {
                    const fmtLabel =
                      rs.rule.format === null
                        ? "ทุกฟอร์แมต"
                        : CONTENT_FORMATS[rs.rule.format].label;
                    const catLabel = categoryName(rs.rule.category_id);
                    const tone: "met" | "behind" | "ontrack" = rs.met
                      ? "met"
                      : rs.behind > 0
                        ? "behind"
                        : "ontrack";
                    return (
                      <li key={rs.rule.id}>
                        <div className="mb-1 flex items-baseline gap-2 text-xs">
                          <span className="min-w-0 truncate text-stone-600">
                            {fmtLabel}
                            {catLabel !== null && (
                              <span className="text-stone-400">
                                {" "}
                                · {catLabel}
                              </span>
                            )}
                          </span>
                          {rs.met ? (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700">
                              ครบ
                            </span>
                          ) : rs.behind > 0 ? (
                            <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">
                              {isCurrentMonth
                                ? `ตามหลัง ${rs.behind}`
                                : `ขาด ${rs.rule.target - rs.done}`}
                            </span>
                          ) : null}
                          <span
                            className={`ml-auto shrink-0 font-bold tabular-nums ${
                              rs.met
                                ? "text-emerald-600"
                                : rs.behind > 0
                                  ? "text-rose-600"
                                  : "text-stone-700"
                            }`}
                          >
                            {rs.done}/{rs.rule.target}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-stone-400">
                            เดือนก่อน {rs.lastDone}
                          </span>
                        </div>
                        <PaceBar
                          done={rs.done}
                          target={rs.rule.target}
                          tickPct={
                            isCurrentMonth
                              ? Math.round((elapsedDays / daysInMonth) * 100)
                              : null
                          }
                          tone={tone}
                          className="h-1.5"
                        />
                      </li>
                    );
                  })}
                </ul>

                {stat.pending > 0 && (
                  <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    <AlertTriangle size={12} />
                    ตรวจผ่านแล้วแต่ยังไม่กดโพส {stat.pending} งาน
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- คนที่มีผลงานแต่ไม่มีเป้า ---------- */}
      {peopleOffRadar.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <Users size={13} />
            ส่งงานในเดือนนี้แต่ยังไม่ถูกตั้งเป้า KPI
          </p>
          <div className="flex flex-wrap gap-2">
            {peopleOffRadar.map((row) => (
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

      {/* ---------- โมดัลงานยังไม่ระบุประเภท ---------- */}
      <Modal
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        title={`ยังไม่ระบุประเภท ${untagged.length} งาน`}
      >
        <p className="mb-3 text-xs text-stone-500">
          งานพวกนี้ถูกนับรวมในกติกา &quot;ทุกฟอร์แมต&quot; แต่ยังนับเข้ากติกาที่เจาะ
          ภาพ/วิดีโอ หรือหมวดไม่ได้ — เปิดงานแล้วเลือก
          &quot;ชิ้นงาน/เนื้อหา&quot; ในแผงได้เลย
          (หรือกด &quot;โพสแล้ว&quot; ระบบจะถามประเภทให้เอง)
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
    </>
  );
}
