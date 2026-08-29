"use client";

/**
 * หน้า **Follow Up** (`/influencers/contracts`) — รื้อใหญ่ 2026-08-29 ตามคำสั่งผู้ใช้
 *
 * เดิมชื่อ "สัญญา & ติดตามผลงาน" มีกล่อง stats 4 ใบกินพื้นที่ครึ่งจอ ผู้ใช้สั่งให้:
 *  1. เอากล่อง 4 ใบออก ทำ section แรกเป็น **ปฏิทิน heatmap** ของวันที่ influ เข้ามา
 *     (= วันที่อัพไฟล์สัญญาแล้วเริ่มนับ) ระบายสีตามความคืบหน้าส่วนที่ force แล้วลิสต์เลื่อนลงมา
 *  2. หน้านี้เป็นทั้งที่ "ตั้งเป้าติดตาม" และ "ติดตามจริง" — ขั้น Follow up ในหน้าเคส
 *     ถูกถอดออกจาก pipeline ทั้งขั้น (migration 0092)
 *  3. กดแถว = แผงติดตาม · กดปุ่มเป้าในแถว = แผงตั้งเป้าโพส
 *  4. ตัวกรองรวมเป็นปุ่มเดียว + popup (followup-filters)
 *
 * สิ่งที่ force = **การลงคลิปตามเป้า** เท่านั้น (ดู followup-utils) — เช็คพอยต์รูป/เช็คลิสต์
 * ยังบันทึกได้ในแผง แต่เป็นส่วนรอง ไม่มีผลกับสถานะ/ปฏิทิน
 */

import { Check, FileSignature, Search, Target, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import {
  INFLU_POST_KINDS,
  INFLU_POST_PLATFORM_ORDER,
  INFLU_POST_PLATFORMS,
  INFLU_TIERS,
  postPlatformLabel,
  roundLabel,
} from "@/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type {
  InfluCampaignRow,
  InfluencerRow,
  InfluPostKind,
  InfluPostLinkRow,
  InfluPostPlatform,
  InfluTaskRow,
} from "@/lib/types";
import { normalizeUrl } from "../influ-links";
import {
  DEFAULT_FOLLOW_FILTERS,
  followFilterChips,
  FollowFilterButton,
  followStatusGroups,
  matchFollowFilters,
  type FollowFilters,
} from "./followup-filters";
import { FollowupHeatmap } from "./followup-heatmap";
import {
  buildTrackRows,
  influName,
  TRACK_STATUSES,
  type TrackRow,
  type TrackStatus,
} from "./followup-utils";
import {
  ClipProgressBar,
  PhotoDots,
  TrackingPanel,
  type PanelMode,
} from "./tracking-panel";

export type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string;
};

/* คอลัมน์: Influencer / คลิปตามสัญญา / อายุสัญญา / ผลลัพธ์ / ผู้รับผิดชอบ
   — ชุดเดียวใช้ทั้งหัวตารางและแถว (เพิ่ม-ลดคอลัมน์ต้องแก้ทั้งสองที่พร้อมกัน);
   ปุ่มตั้งเป้าอยู่นอกกริด (เป็นปุ่มพี่น้องของแถว — ห้ามซ้อน button ใน button) */
const GRID_COLS =
  "minmax(180px,1.2fr) minmax(240px,1.6fr) 150px 118px minmax(100px,0.8fr)";

export function ContractsClient({
  influencers,
  campaigns,
  postLinks,
  tasks,
  profiles,
  canEdit,
  actor,
}: {
  influencers: InfluencerRow[];
  campaigns: InfluCampaignRow[];
  postLinks: InfluPostLinkRow[];
  /** งาน checklist ทั้งหมดของเคสที่เริ่มนับสัญญาแล้ว (ทั้ง 2 โหมด) */
  tasks: InfluTaskRow[];
  profiles: ProfileLite[];
  /** ระดับ "ดูเฉยๆ" = ดูได้อย่างเดียว ไม่มีปุ่มแก้ */
  canEdit: boolean;
  actor: InfluLogActor;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  /* ---- optimistic state: adjust-during-render sync กับ props ---- */
  const [influsS, setInflusS] = useState({
    base: influencers,
    list: influencers,
  });
  if (influsS.base !== influencers)
    setInflusS({ base: influencers, list: influencers });

  const [linksS, setLinksS] = useState({ base: postLinks, list: postLinks });
  if (linksS.base !== postLinks)
    setLinksS({ base: postLinks, list: postLinks });

  const [tasksS, setTasksS] = useState({ base: tasks, list: tasks });
  if (tasksS.base !== tasks) setTasksS({ base: tasks, list: tasks });

  const [campsS, setCampsS] = useState({ base: campaigns, list: campaigns });
  if (campsS.base !== campaigns)
    setCampsS({ base: campaigns, list: campaigns });

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FollowFilters>(DEFAULT_FOLLOW_FILTERS);
  const [months, setMonths] = useState(6);
  const [panel, setPanel] = useState<{ id: string; mode: PanelMode } | null>(
    null
  );
  const [err, setErr] = useState<string | null>(null);

  const ownerNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, p.full_name?.trim() || p.email);
    return m;
  }, [profiles]);

  const rows = useMemo(
    () =>
      buildTrackRows({
        influencers: influsS.list,
        links: linksS.list,
        tasks: tasksS.list,
        campaigns: campsS.list,
        ownerNames,
        today,
      }),
    [influsS.list, linksS.list, tasksS.list, campsS.list, ownerNames, today]
  );

  /* ---- ค้นหา + ตัวกรอง ---- */
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const i = r.influ;
      return [
        i.first_name,
        i.last_name,
        i.nickname,
        i.influ_code,
        i.note,
        i.procedure_text,
        r.ownerName,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search]);

  const meId = actor.id;
  const filtered = useMemo(
    () => searched.filter((r) => matchFollowFilters(r, filters, meId)),
    [searched, filters, meId]
  );

  const statusCounts = useMemo(() => {
    const c: Record<TrackStatus, number> = {
      overdue: 0,
      noquota: 0,
      ontrack: 0,
      complete: 0,
      expired: 0,
    };
    for (const r of searched) c[r.status] += 1;
    return c;
  }, [searched]);

  const people = useMemo(
    () =>
      profiles
        .map((p) => ({ id: p.id, name: p.full_name?.trim() || p.email }))
        .sort((a, b) => a.name.localeCompare(b.name, "th")),
    [profiles]
  );
  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people]
  );
  const filterChips = useMemo(
    () => followFilterChips(filters, peopleById),
    [filters, peopleById]
  );

  const sections = useMemo(
    () =>
      followStatusGroups(filters)
        .map((s) => ({
          status: s,
          rows: filtered
            .filter((r) => r.status === s)
            .sort((a, b) => a.daysLeft - b.daysLeft),
        }))
        .filter((g) => g.rows.length > 0),
    [filtered, filters]
  );

  const shown = filtered.length;
  const clearAll = () => {
    setSearch("");
    setFilters(DEFAULT_FOLLOW_FILTERS);
  };

  const toggleStatus = (s: TrackStatus) =>
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(s)
        ? f.statuses.filter((x) => x !== s)
        : [...f.statuses, s],
    }));

  /* กดช่องวันในปฏิทิน = ตั้งตัวกรอง day — แต่ผลลัพธ์อยู่ใต้ heatmap ลงไปอีกหลายจอ
     บนมือถือ (คนกดแล้วนึกว่าไม่มีอะไรเกิดขึ้น) ⇒ เลื่อนไปที่ลิสต์ให้เลย
     รอ 1 เฟรมให้ลิสต์ re-render ตามตัวกรองใหม่ก่อน ไม่งั้นเลื่อนไปที่ความสูงเดิม */
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectDay = (day: string) => {
    setFilters((f) => ({ ...f, day }));
    if (day)
      requestAnimationFrame(() =>
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
  };

  /* ---- mutations (optimistic + log + router.refresh) ---- */

  const patchInflu = (
    influ: InfluencerRow,
    patch: Partial<InfluencerRow>,
    summary: string
  ) => {
    setErr(null);
    const prevList = influsS.list;
    setInflusS((p) => ({
      ...p,
      list: p.list.map((x) => (x.id === influ.id ? { ...x, ...patch } : x)),
    }));
    void supabase
      .from("influencers")
      .update(patch)
      .eq("id", influ.id)
      .then(({ error }) => {
        if (error) {
          setInflusS((p) => ({ ...p, list: prevList }));
          setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
          return;
        }
        logInflu(supabase, actor, {
          action: "completed" in patch ? "status" : "update",
          entity: "influencer",
          entityId: influ.id,
          influencerId: influ.id,
          influencerName: influName(influ),
          summary,
          meta: { patch: Object.keys(patch) },
        });
        router.refresh();
      });
  };

  const addPostLink = async (
    influ: InfluencerRow,
    kind: InfluPostKind,
    platform: InfluPostPlatform,
    rawUrl: string,
    note: string
  ): Promise<string | null> => {
    const clean = normalizeUrl(rawUrl);
    if (!clean)
      return "ลิงก์ไม่ถูกต้อง — วางลิงก์เต็มของโพส/คอมเมนต์ (ขึ้นต้น https://)";
    const mine = linksS.list.filter((l) => l.influencer_id === influ.id);
    const { data, error } = await supabase
      .from("influ_post_links")
      .insert({
        influencer_id: influ.id,
        kind,
        platform,
        url: clean,
        note: note || null,
        position: Math.max(0, ...mine.map((l) => l.position)) + 1,
      })
      .select("*")
      .single();
    if (error || !data)
      return `เพิ่มลิงก์ไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`;
    setLinksS((p) => ({ ...p, list: [...p.list, data as InfluPostLinkRow] }));
    logInflu(supabase, actor, {
      action: "create",
      entity: "post_link",
      entityId: data.id,
      influencerId: influ.id,
      influencerName: influName(influ),
      summary: `เพิ่มลิงก์${INFLU_POST_KINDS[kind].label} ${INFLU_POST_PLATFORMS[platform].label}`,
      meta: { url: clean, platform },
    });
    router.refresh();
    return null;
  };

  const removePostLink = (influ: InfluencerRow, link: InfluPostLinkRow) => {
    setErr(null);
    const prevList = linksS.list;
    setLinksS((p) => ({ ...p, list: p.list.filter((l) => l.id !== link.id) }));
    void supabase
      .from("influ_post_links")
      .delete()
      .eq("id", link.id)
      .then(({ error }) => {
        if (error) {
          setLinksS((p) => ({ ...p, list: prevList }));
          setErr(`ลบลิงก์ไม่สำเร็จ: ${error.message}`);
          return;
        }
        logInflu(supabase, actor, {
          action: "delete",
          entity: "post_link",
          entityId: link.id,
          influencerId: influ.id,
          influencerName: influName(influ),
          summary: `ลบลิงก์${INFLU_POST_KINDS[link.kind].label} ${postPlatformLabel(link.url)}`,
          meta: { url: link.url },
        });
        router.refresh();
      });
  };

  const toggleTask = (influ: InfluencerRow, task: InfluTaskRow) => {
    setErr(null);
    const next = !task.done;
    const doneAt = next ? new Date().toISOString() : null;
    const prevList = tasksS.list;
    setTasksS((p) => ({
      ...p,
      list: p.list.map((t) =>
        t.id === task.id ? { ...t, done: next, done_at: doneAt } : t
      ),
    }));
    void supabase
      .from("influ_tasks")
      .update({ done: next, done_at: doneAt })
      .eq("id", task.id)
      .then(({ error }) => {
        if (error) {
          setTasksS((p) => ({ ...p, list: prevList }));
          setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
          return;
        }
        logInflu(supabase, actor, {
          action: "status",
          entity: "followup",
          entityId: task.id,
          influencerId: influ.id,
          influencerName: influName(influ),
          summary: `${next ? "ติ๊กทำแล้ว" : "ยกเลิกติ๊ก"} "${task.title}"`,
        });
        router.refresh();
      });
  };

  const addCampaign = async (
    influ: InfluencerRow,
    f: { name: string; date: string; detail: string }
  ): Promise<string | null> => {
    const { data, error } = await supabase
      .from("influ_campaigns")
      .insert({
        influencer_id: influ.id,
        name: f.name,
        detail: f.detail || null,
        campaign_date: f.date === "" ? null : f.date,
      })
      .select("*")
      .single();
    if (error || !data)
      return `บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`;
    setCampsS((p) => ({ ...p, list: [data as InfluCampaignRow, ...p.list] }));
    logInflu(supabase, actor, {
      action: "create",
      entity: "campaign",
      entityId: data.id,
      influencerId: influ.id,
      influencerName: influName(influ),
      summary: `เพิ่ม Sub Campaign "${f.name}"`,
    });
    router.refresh();
    return null;
  };

  // หาแถวของแผงจาก rows เต็ม (ไม่ใช่ filtered) — ตัวกรองเปลี่ยนไม่ทำให้แผงปิดเอง
  const panelRow =
    panel !== null ? (rows.find((r) => r.influ.id === panel.id) ?? null) : null;

  if (rows.length === 0)
    return (
      <div className="glass rounded-xl">
        <EmptyState
          icon={<FileSignature size={40} strokeWidth={1.5} />}
          title="ยังไม่มี Influencer ที่เริ่มนับสัญญา"
          description="เมื่ออัพโหลดไฟล์สัญญาที่เซนแล้วในขั้น 'เซนสัญญา + วันรับบริการ' ระบบจะเริ่มนับสัญญาและพาเคสมาติดตามที่หน้านี้"
        />
      </div>
    );

  return (
    <>
      {err && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}

      {/* ---------- section แรก: ปฏิทิน heatmap + สรุป ---------- */}
      <FollowupHeatmap
        rows={rows}
        today={today}
        months={months}
        onMonthsChange={setMonths}
        selectedDay={filters.day}
        onSelectDay={selectDay}
        statusFilter={filters.statuses}
        onToggleStatus={toggleStatus}
      />

      {/* ---------- แถบเครื่องมือ ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส Influ / โน้ต"
            className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-300 focus:outline-none sm:text-sm"
          />
        </div>
        <FollowFilterButton
          filters={filters}
          onChange={setFilters}
          people={people}
          meId={meId}
          statusCounts={statusCounts}
          resultCount={filtered.length}
        />
        <span className="ml-auto text-xs text-stone-400">
          แสดง {formatNumber(shown)} จาก {formatNumber(rows.length)} เคส
        </span>
      </div>

      {/* ชิปสรุปตัวกรองที่เปิดอยู่ — ต้องเห็นเสมอว่ากำลังซ่อนอะไรอยู่ */}
      {filterChips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-stone-400">กรองอยู่:</span>
          {filterChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilters(c.next)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 active:scale-[0.97] max-sm:min-h-11 max-sm:px-3 max-sm:text-sm"
            >
              {c.label}
              <X size={12} />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer text-xs text-stone-500 underline-offset-2 hover:text-brand-700 hover:underline max-sm:min-h-11 max-sm:text-sm"
          >
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* ---------- ลิสต์ ---------- */}
      {/* ref อยู่ที่กล่องนอกสุด (ไม่ใช่ในกิ่ง if) — กดวันในปฏิทินแล้วเลื่อนมาถึงเสมอ
          ทั้งตอนมีผลลัพธ์และตอนตัวกรองซ่อนหมด; scroll-mt เผื่อขอบบนไม่ให้ชนพอดีเป๊ะ */}
      <div ref={listRef} className="scroll-mt-3">
        {sections.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 animate-fade-in">
            <span>ตัวกรองซ่อนรายการทั้งหมดอยู่ — ข้อมูลยังอยู่ครบ</span>
            <button
              type="button"
              onClick={clearAll}
              className="cursor-pointer rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 max-sm:min-h-11"
            >
              แสดงทั้งหมด
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map(({ status, rows: groupRows }) => {
              const meta = TRACK_STATUSES[status];
              return (
                <section key={status} className="flex animate-fade-in-up">
                  <div className={`w-1.5 shrink-0 rounded-l-xl ${meta.dot}`} />
                  <div className="glass min-w-0 flex-1 overflow-x-auto rounded-l-none rounded-r-xl">
                    <div className="sm:min-w-[1030px]">
                      <div className="flex flex-wrap items-baseline gap-2 px-4 pb-1.5 pt-3">
                        <h2 className="text-sm font-semibold text-stone-800">
                          {meta.label}
                        </h2>
                        <span className="text-xs text-stone-400">
                          {formatNumber(groupRows.length)} เคส · {meta.hint}
                        </span>
                      </div>
                      <div className="hidden items-center border-y border-brand-100/60 bg-white/40 px-4 py-1.5 text-[11px] font-medium text-stone-400 sm:flex">
                        <div
                          className="grid min-w-0 flex-1 gap-3"
                          style={{ gridTemplateColumns: GRID_COLS }}
                        >
                          <span>Influencer</span>
                          <span>คลิปตามสัญญา (ลงจริง/เป้า)</span>
                          <span>อายุสัญญา</span>
                          <span>ผลลัพธ์ (ไม่บังคับ)</span>
                          <span>ผู้รับผิดชอบ</span>
                        </div>
                        <span className="w-11 shrink-0" />
                      </div>
                      {groupRows.map((r) => (
                        <TrackRowLine
                          key={r.influ.id}
                          r={r}
                          today={today}
                          onOpen={(mode) => setPanel({ id: r.influ.id, mode })}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {panelRow && panel && (
        <TrackingPanel
          key={panelRow.influ.id}
          row={panelRow}
          mode={panel.mode}
          onModeChange={(mode) => setPanel({ id: panelRow.influ.id, mode })}
          today={today}
          canEdit={canEdit}
          onClose={() => setPanel(null)}
          onPatchInflu={(patch, summary) =>
            patchInflu(panelRow.influ, patch, summary)
          }
          onAddLink={(k, p, u, n) => addPostLink(panelRow.influ, k, p, u, n)}
          onRemoveLink={(l) => removePostLink(panelRow.influ, l)}
          onToggleTask={(t) => toggleTask(panelRow.influ, t)}
          onAddCampaign={(f) => addCampaign(panelRow.influ, f)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* แถวในตาราง                                                          */
/* ------------------------------------------------------------------ */

function TrackRowLine({
  r,
  today,
  onOpen,
}: {
  r: TrackRow;
  today: string;
  onOpen: (mode: PanelMode) => void;
}) {
  const i = r.influ;
  // ช่องทางที่โชว์บนแถว = ตั้งเป้าไว้ หรือมีโพสลงจริง
  const cellPlatforms = INFLU_POST_PLATFORM_ORDER.filter(
    (p) => (r.quotas[p] ?? 0) > 0 || (r.postCounts[p] ?? 0) > 0
  );

  return (
    <div className="flex items-stretch border-b border-brand-100/50 last:border-b-0 hover:bg-brand-50/40">
      <button
        type="button"
        onClick={() => onOpen("track")}
        aria-label={`เปิดการติดตามของ ${influName(i)}`}
        style={{ gridTemplateColumns: GRID_COLS }}
        className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2.5 text-left sm:grid sm:gap-3 sm:px-4 sm:py-2"
      >
        {/* Influencer */}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-stone-800">
              {influName(i)}
            </span>
            {roundLabel(i.round_no) && (
              <span className="shrink-0 text-[11px] text-stone-400">
                {roundLabel(i.round_no)}
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-stone-400">
            {i.tier ? INFLU_TIERS[i.tier].label : ""}
            {i.tier && i.influ_code ? " · " : ""}
            {i.influ_code ?? ""}
          </span>
        </span>

        {/* คลิปตามสัญญา — ส่วนที่ force */}
        <span className="min-w-0">
          {r.quotaTotal === 0 ? (
            <span className="text-xs text-amber-700">ยังไม่ตั้งเป้าโพส</span>
          ) : (
            <>
              <span className="flex flex-wrap items-center gap-1">
                <span className="text-xs font-medium tabular-nums text-stone-700">
                  {r.metCount}/{r.quotaTotal}
                </span>
                {cellPlatforms.map((p) => {
                  const pm = INFLU_POST_PLATFORMS[p];
                  const q = r.quotas[p] ?? 0;
                  const c = r.postCounts[p] ?? 0;
                  const met = q > 0 && c >= q;
                  return (
                    <span
                      key={p}
                      title={`${pm.label} — ลงจริง ${c}${q > 0 ? ` จากเป้า ${q}` : " (ไม่ได้ตั้งเป้า)"}`}
                      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${pm.chip}`}
                    >
                      {pm.short} {q > 0 ? `${c}/${q}` : c}
                      {met && <Check size={10} strokeWidth={3} />}
                    </span>
                  );
                })}
              </span>
              <span className="mt-1 block max-w-56">
                <ClipProgressBar row={r} />
              </span>
            </>
          )}
        </span>

        {/* อายุสัญญา */}
        <span className="text-xs">
          <span className="block text-stone-600">
            {formatDate(r.start)} – {formatDate(r.end)}
          </span>
          <span
            className={`block text-[11px] ${
              r.expired
                ? "text-rose-500"
                : r.daysLeft <= 30
                  ? "text-amber-700"
                  : "text-emerald-700"
            }`}
          >
            {r.expired ? "หมดแล้ว" : `เหลือ ${formatNumber(r.daysLeft)} วัน`}
          </span>
        </span>

        {/* ผลลัพธ์ (ส่วนรอง ไม่ force) — ซ่อนบนจอเล็กเหมือนคอลัมน์ผู้รับผิดชอบ:
            หัวตารางซ่อนอยู่แล้ว และแถวมือถือควรเหลือแต่ชื่อ/คลิป/อายุสัญญาที่ต้องตาม
            (ดูครบได้ในแผงติดตาม) */}
        <span className="hidden items-center gap-1.5 text-xs sm:flex">
          {i.followup_mode === "custom" ? (
            <span className="text-stone-400">แพ็คเกจเฉพาะ</span>
          ) : r.photoTasks.length === 0 ? (
            <span className="text-stone-300">—</span>
          ) : (
            <>
              <PhotoDots tasks={r.photoTasks} today={today} />
              <span className="text-stone-400">
                {r.photoDone}/{r.photoTasks.length}
              </span>
            </>
          )}
        </span>

        {/* ผู้รับผิดชอบ (ซ่อนบนจอเล็ก) */}
        <span className="hidden truncate text-xs text-stone-500 sm:block">
          {r.ownerName ?? "—"}
        </span>
      </button>

      {/* ปุ่มตั้งเป้า — พี่น้องของแถว ไม่ใช่ปุ่มซ้อนปุ่ม */}
      <button
        type="button"
        onClick={() => onOpen("quota")}
        title="ตั้งเป้าโพสตามสัญญา"
        aria-label={`ตั้งเป้าโพสของ ${influName(i)}`}
        className={`flex w-11 shrink-0 cursor-pointer items-center justify-center transition-colors ${
          r.quotaTotal === 0
            ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600"
            : "text-stone-300 hover:bg-white/70 hover:text-brand-600"
        }`}
      >
        <Target size={16} />
      </button>
    </div>
  );
}
