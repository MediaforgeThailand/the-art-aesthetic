"use client";

import { History, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FilterChip,
  FilterSection,
  FilterSummary,
  InfluFilterButton,
  useInfluFilters,
} from "@/influ/components/influ-filter-panel";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  INFLU_LOG_ACTION_ORDER,
  influLogActionMeta,
} from "@/influ/lib/influ-log";
import type { InfluActivityLogRow } from "@/lib/types";

/**
 * ประวัติการใช้งานระบบ Influencer — ใครทำอะไรกับเคสไหน เมื่อไหร่
 * (เฉพาะผู้ดูแลระบบ Influ; ตาราง log ไม่มี policy update/delete จึงลบทิ้งจากแอปไม่ได้)
 */
/** ตัวกรองของหน้าประวัติ — ปุ่มเดียวเหมือนทุกหน้าในระบบ (ผู้ใช้ 2026-08-29) */
type LogFilters = { action: string; actor: string };
const DEFAULT_LOG_FILTERS: LogFilters = { action: "all", actor: "all" };

export function LogsClient({
  logs,
  limit,
  meId,
  loadError,
}: {
  logs: InfluActivityLogRow[];
  limit: number;
  /** บัญชีที่กำลังดู — ค่าเริ่มต้นของตัวกรอง "ผู้ทำ" คือ "ของฉัน" */
  meId: string | null;
  loadError: string | null;
}) {
  const [search, setSearch] = useState("");
  const filterApi = useInfluFilters<LogFilters>({
    page: "logs",
    userId: meId,
    factory: DEFAULT_LOG_FILTERS,
  });
  const { filters, setFilters } = filterApi;
  const action = filters.action;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(l.action, (m.get(l.action) ?? 0) + 1);
    return m;
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (filters.actor !== "all") {
        const want = filters.actor === "mine" ? meId : filters.actor;
        if (!want || l.actor_id !== want) return false;
      }
      if (q === "") return true;
      return (
        l.summary.toLowerCase().includes(q) ||
        (l.influencer_name ?? "").toLowerCase().includes(q) ||
        (l.actor_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, search, action, filters.actor, meId]);

  /** ผู้ทำที่พบในประวัติ — ตัวเลือกของตัวกรอง (log เก็บชื่อ ณ ตอนนั้นไว้เอง) */
  const actors = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs)
      if (l.actor_id) m.set(l.actor_id, l.actor_name || "ไม่ทราบชื่อ");
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [logs]);

  const chips: { key: string; label: string; count: number }[] = [
    { key: "all", label: "ทั้งหมด", count: logs.length },
    ...INFLU_LOG_ACTION_ORDER.filter((a) => (counts.get(a) ?? 0) > 0).map(
      (a) => ({
        key: a,
        label: influLogActionMeta(a).label,
        count: counts.get(a) ?? 0,
      })
    ),
  ];

  return (
    <>
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดประวัติไม่สำเร็จ: {loadError}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 animate-fade-in-up">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            placeholder="ค้นหา"
            aria-label="ค้นหาประวัติการใช้งาน"
            className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <InfluFilterButton
          api={filterApi}
          count={
            (filters.action !== "all" ? 1 : 0) + (filters.actor !== "all" ? 1 : 0)
          }
          factory={DEFAULT_LOG_FILTERS}
        >
          <FilterSection title="ประเภทการกระทำ">
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <FilterChip
                  key={c.key}
                  active={filters.action === c.key}
                  onClick={() => setFilters({ ...filters, action: c.key })}
                >
                  {c.label}
                  <span className="tabular-nums text-stone-400">
                    {formatNumber(c.count)}
                  </span>
                </FilterChip>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="ผู้ทำ">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={filters.actor === "all"}
                onClick={() => setFilters({ ...filters, actor: "all" })}
              >
                ทุกคน
              </FilterChip>
              {meId && (
                <FilterChip
                  active={filters.actor === "mine"}
                  onClick={() => setFilters({ ...filters, actor: "mine" })}
                >
                  ของฉัน
                </FilterChip>
              )}
              {actors
                .filter((a) => a.id !== meId)
                .map((a) => (
                  <FilterChip
                    key={a.id}
                    active={filters.actor === a.id}
                    onClick={() => setFilters({ ...filters, actor: a.id })}
                  >
                    {a.name}
                  </FilterChip>
                ))}
            </div>
          </FilterSection>
        </InfluFilterButton>
        <span className="ml-auto text-xs text-stone-400">
          {formatNumber(filtered.length)} รายการ
        </span>
      </div>

      <FilterSummary
        chips={[
          ...(filters.action !== "all"
            ? [
                {
                  key: "action",
                  label: `ประเภท: ${influLogActionMeta(filters.action).label}`,
                  next: { ...filters, action: "all" },
                },
              ]
            : []),
          ...(filters.actor !== "all"
            ? [
                {
                  key: "actor",
                  label:
                    filters.actor === "mine"
                      ? "ผู้ทำ: ของฉัน"
                      : `ผู้ทำ: ${actors.find((a) => a.id === filters.actor)?.name ?? "ไม่ทราบชื่อ"}`,
                  next: { ...filters, actor: "all" as string },
                },
              ]
            : []),
        ]}
        onChange={setFilters}
        onClear={() => {
          setSearch("");
          setFilters(DEFAULT_LOG_FILTERS);
        }}
      />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History size={40} strokeWidth={1.5} />}
            title={
              logs.length === 0
                ? "ยังไม่มีประวัติการใช้งาน"
                : "ไม่พบรายการที่ตรงกับตัวกรอง"
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-stone-100">
            {filtered.map((l) => {
              const meta = influLogActionMeta(l.action);
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-brand-50/30"
                >
                  <Badge className={`${meta.chip} shrink-0`}>{meta.label}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-stone-800">
                      {l.summary}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
                      <span>{l.actor_name || "ไม่ทราบผู้ทำ"}</span>
                      {l.influencer_name && (
                        <>
                          <span>·</span>
                          {/* เคสที่ถูกลบแล้วลิงก์จะเปิดไม่ได้ — โชว์เป็นข้อความเฉยๆ */}
                          {l.influencer_id && l.action !== "delete" ? (
                            <Link
                              href={`/influencers/${l.influencer_id}`}
                              className="text-brand-600 transition-colors hover:text-brand-700 hover:underline"
                            >
                              {l.influencer_name}
                            </Link>
                          ) : (
                            <span>{l.influencer_name}</span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  {/* จอเล็ก: เวลาตกไปอยู่บรรทัดของตัวเอง — บีบอยู่ข้างข้อความสรุปที่ 375px
                      แล้วเหลือที่ให้สรุปไม่ถึงครึ่งบรรทัด อ่านไม่รู้เรื่อง */}
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-400 max-sm:w-full">
                    {formatDateTime(l.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* หัวข้อ/คำอธิบายหน้าถูกถอดออกแล้ว — แต่ต้องบอกว่าลิสต์ถูกตัดที่ N รายการ
          ไม่งั้นคนอ่านจะนึกว่านี่คือประวัติทั้งหมดที่มี */}
      {logs.length >= limit && (
        <p className="mt-3 text-center text-xs text-stone-400">
          แสดง {formatNumber(limit)} รายการล่าสุดเท่านั้น
        </p>
      )}
    </>
  );
}
