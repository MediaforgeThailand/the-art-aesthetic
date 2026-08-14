"use client";

import { ArrowLeft, History, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  INFLU_LOG_ACTION_ORDER,
  influLogActionMeta,
} from "@/lib/influ-log";
import type { InfluActivityLogRow } from "@/lib/types";

/**
 * ประวัติการใช้งานระบบ Influencer — ใครทำอะไรกับเคสไหน เมื่อไหร่
 * (เฉพาะผู้ดูแลระบบ Influ; ตาราง log ไม่มี policy update/delete จึงลบทิ้งจากแอปไม่ได้)
 */
export function LogsClient({
  logs,
  limit,
  loadError,
}: {
  logs: InfluActivityLogRow[];
  limit: number;
  loadError: string | null;
}) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("all");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(l.action, (m.get(l.action) ?? 0) + 1);
    return m;
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (q === "") return true;
      return (
        l.summary.toLowerCase().includes(q) ||
        (l.influencer_name ?? "").toLowerCase().includes(q) ||
        (l.actor_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, search, action]);

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
      <PageHeader
        title="ประวัติการใช้งาน (Log)"
        description={`บันทึกทุกการเปลี่ยนแปลงในระบบ Influencer — แสดง ${formatNumber(
          logs.length
        )} รายการล่าสุด (สูงสุด ${formatNumber(limit)})`}
        action={
          <Link
            href="/influencer-management"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-4 py-2 text-sm font-medium text-brand-700 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            กลับหน้ารวม
          </Link>
        }
      />

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดประวัติไม่สำเร็จ: {loadError}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 animate-fade-in-up">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            type="search"
            placeholder="ค้นหาชื่อเคส ผู้ทำ หรือรายละเอียด..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const active = action === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setAction(c.key)}
                className={`cursor-pointer rounded-full px-3.5 py-2.5 text-xs font-medium transition-all duration-200 active:scale-[0.95] sm:py-1.5 ${
                  active
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                    : "border border-brand-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                {c.label}
                <span className={active ? "opacity-80" : "text-stone-400"}>
                  {" "}
                  ({formatNumber(c.count)})
                </span>
              </button>
            );
          })}
        </div>
        {(search !== "" || action !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setAction("all");
            }}
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
          >
            <X size={14} />
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History size={40} strokeWidth={1.5} />}
            title={
              logs.length === 0
                ? "ยังไม่มีประวัติการใช้งาน"
                : "ไม่พบรายการที่ตรงกับตัวกรอง"
            }
            description={
              logs.length === 0
                ? "ทุกการเพิ่ม/แก้/ลบในระบบ Influencer จะถูกบันทึกที่นี่โดยอัตโนมัติ"
                : "ลองเปลี่ยนคำค้นหาหรือชนิดการกระทำ"
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
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-400">
                    {formatDateTime(l.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
