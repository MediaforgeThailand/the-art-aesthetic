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
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { CONTENT_FORMATS } from "@/lib/constants";
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
  review_status: string;
  completed: boolean;
  content_format: ContentFormat | null;
  content_category_id: string | null;
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

/** งานชิ้นนี้เข้าเงื่อนไขกติกา KPI แถวนี้ไหม — null ในกติกา = ไม่จำกัด */
function matchesRule(t: TrackedTask, r: ContentKpiRow): boolean {
  if (r.format !== null && t.content_format !== r.format) return false;
  if (r.category_id !== null && t.content_category_id !== r.category_id)
    return false;
  return true;
}

/**
 * แดชบอร์ดติดตาม KPI ทีมคอนเทนต์ — อ่านอย่างเดียว (ตั้งเป้า/หมวดที่ /content-kpi)
 * นับ "โพสจริง" จาก tasks.posted_at ภายในเดือนที่เลือก แยกตามผู้รับผิดชอบงาน
 * งานที่โพสแล้วแต่ยังไม่ติดประเภท (content_format null) นับกติกาไม่ได้ — ขึ้นกล่องเตือนพร้อมลิงก์ไปติด
 */
export function TrackingClient({
  tasks,
  categories,
  kpis,
  profiles,
  isAdmin,
  initialYear,
  initialMonth,
  loadError,
}: {
  tasks: TrackedTask[];
  categories: ContentCategoryRow[];
  kpis: ContentKpiRow[];
  profiles: ProfileLite[];
  isAdmin: boolean;
  /** เดือนปัจจุบันตามเวลาไทย — คำนวณจาก server (client ไม่แตะ Date.now() ตอน render) */
  initialYear: number;
  initialMonth: number;
  loadError: string | null;
}) {
  const [ym, setYm] = useState({ year: initialYear, month: initialMonth });
  const isCurrentMonth =
    ym.year === initialYear && ym.month === initialMonth;

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const categoryName = (id: string | null) =>
    id === null
      ? null
      : (categories.find((c) => c.id === id)?.name ?? "หมวดที่ถูกลบ");

  /** งานที่โพสภายในเดือนที่เลือก */
  const postedInMonth = useMemo(() => {
    const { start, end } = monthBounds(ym.year, ym.month);
    return tasks.filter((t) => {
      if (t.posted_at === null) return false;
      const ms = Date.parse(t.posted_at);
      return !Number.isNaN(ms) && ms >= start && ms < end;
    });
  }, [tasks, ym]);

  const postedByAssignee = useMemo(() => {
    const map = new Map<string, TrackedTask[]>();
    for (const t of postedInMonth) {
      if (t.assignee_id === null) continue;
      const list = map.get(t.assignee_id);
      if (list) list.push(t);
      else map.set(t.assignee_id, [t]);
    }
    return map;
  }, [postedInMonth]);

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

  // คนที่ถูกตั้งเป้า — คงลำดับรายชื่อจาก server (เรียงชื่อแล้ว)
  const peopleWithRules = useMemo(
    () => profiles.filter((p) => rulesByPerson.has(p.id)),
    [profiles, rulesByPerson]
  );

  // โพสในเดือนนี้แต่ยังไม่ติดประเภท — นับ KPI แบบเจาะฟอร์แมต/หมวดไม่ได้
  const untagged = useMemo(
    () => postedInMonth.filter((t) => t.content_format === null),
    [postedInMonth]
  );

  // คนที่มีงานโพสในเดือนนี้แต่ยังไม่ถูกตั้งเป้า — โชว์ไว้ให้หัวหน้าเห็นว่าตกหล่นใคร
  const peopleOffRadar = useMemo(
    () =>
      [...postedByAssignee.keys()]
        .filter((id) => !rulesByPerson.has(id))
        .map((id) => ({
          profile: profileById.get(id),
          id,
          count: postedByAssignee.get(id)?.length ?? 0,
        })),
    [postedByAssignee, rulesByPerson, profileById]
  );

  return (
    <>
      <PageHeader
        title="KPI คอนเทนต์"
        description='ติดตามรายเดือนว่าทีมโพสครบตามเป้าหรือยัง — นับจากงานที่กด "โพสแล้ว" ในแท็บรอโพสของหน้า Task'
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

      {/* ---------- เลือกเดือน ---------- */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
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
            onClick={() =>
              setYm({ year: initialYear, month: initialMonth })
            }
            className="min-h-11 cursor-pointer rounded-lg px-3 text-sm text-brand-600 hover:bg-brand-50 sm:min-h-9"
          >
            กลับเดือนนี้
          </button>
        )}
        <span className="ml-auto text-xs text-stone-400">
          โพสในเดือนนี้ทั้งทีม {postedInMonth.length} ชิ้น
        </span>
      </div>

      {/* ---------- เตือนงานโพสแล้วแต่ยังไม่ติดประเภท ---------- */}
      {untagged.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle size={15} />
            โพสแล้วแต่ยังไม่ระบุประเภท {untagged.length} งาน —
            งานพวกนี้ยังไม่ถูกนับเข้ากติกาที่เจาะฟอร์แมต/หมวด
          </p>
          <ul className="space-y-1">
            {untagged.map((t) => (
              <li key={t.id} className="text-sm text-amber-900/80">
                <Link
                  href={`/tasks?task=${t.id}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <span className="line-clamp-1">{t.title}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </Link>
                <span className="text-amber-700/60">
                  {" "}
                  · {personName(
                    t.assignee_id
                      ? profileById.get(t.assignee_id)
                      : undefined
                  )}{" "}
                  — เปิดงานแล้วเลือก "ชิ้นงาน/เนื้อหา" ในแผงได้เลย
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- การ์ดรายคน ---------- */}
      {peopleWithRules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={40} strokeWidth={1.5} />}
            title="ยังไม่มีใครถูกตั้งเป้า KPI"
            description='ไปที่ "ตั้งค่า KPI & หมวดเนื้อหา" เพื่อเพิ่มทีมงานและกำหนดเป้าจำนวนชิ้นต่อเดือน'
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {peopleWithRules.map((person) => {
            const rules = rulesByPerson.get(person.id) ?? [];
            const posted = postedByAssignee.get(person.id) ?? [];
            const progress = rules.map((rule) => ({
              rule,
              count: posted.filter((t) => matchesRule(t, rule)).length,
            }));
            const allMet =
              progress.length > 0 &&
              progress.every((p) => p.count >= p.rule.target);
            const pending = pendingByAssignee.get(person.id) ?? 0;
            return (
              <Card key={person.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
                    {personName(person)}
                  </p>
                  {allMet ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <BadgeCheck size={12} />
                      ครบเป้า
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
                      โพสแล้ว {posted.length} ชิ้น
                    </span>
                  )}
                </div>

                <ul className="space-y-2.5">
                  {progress.map(({ rule, count }) => {
                    const met = count >= rule.target;
                    const pct = Math.min(
                      100,
                      Math.round((count / rule.target) * 100)
                    );
                    const fmtLabel =
                      rule.format === null
                        ? "ทุกฟอร์แมต"
                        : CONTENT_FORMATS[rule.format].label;
                    const catLabel =
                      rule.category_id === null
                        ? null
                        : categoryName(rule.category_id);
                    return (
                      <li key={rule.id}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-stone-600">
                            {fmtLabel}
                            {catLabel !== null && (
                              <span className="text-stone-400">
                                {" "}
                                · {catLabel}
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 font-bold tabular-nums ${
                              met ? "text-emerald-600" : "text-stone-700"
                            }`}
                          >
                            {count}/{rule.target}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              met
                                ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                                : "bg-gradient-to-r from-brand-400 to-brand-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {pending > 0 && (
                  <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    <AlertTriangle size={12} />
                    ตรวจผ่านแล้วแต่ยังไม่กดโพส {pending} งาน
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- คนที่โพสในเดือนนี้แต่ไม่มีเป้า ---------- */}
      {peopleOffRadar.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <Users size={13} />
            โพสในเดือนนี้แต่ยังไม่ถูกตั้งเป้า KPI
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
    </>
  );
}
