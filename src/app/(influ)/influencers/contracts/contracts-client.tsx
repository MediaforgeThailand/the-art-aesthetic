"use client";

/**
 * หน้า "สัญญา & ติดตามผลงาน" — redesign 2026-08-20
 *
 * อ้างอิงตารางติดตามของทีม branding เดิม (Excel "สัญญาการลงช่องทางรีวิว ติดตาม"):
 * เห็นภาพรวมทุกสัญญาในหน้าเดียว — ช่องทางโพส (ลงจริง/เป้า), รูปติดตาม 7 งวด,
 * อายุสัญญา, ผู้รับผิดชอบ, หมายเหตุ — แทนการ์ดรายเคสเดิมที่บอกแค่อายุสัญญา.
 *
 * แพตเทิร์นเดียวกับหน้า /influ-cost: การ์ดสรุป 4 ใบ = ตัวกรองสถานะ,
 * ลิสต์เป็นตารางจัดกลุ่มตามสถานะ (แถบสีซ้าย + GRID_COLS ชุดเดียวทั้งหัว/แถว),
 * กดแถว = เปิดแผงข้าง TrackingPanel (แก้เป้า/ลิงก์/ติ๊กรูป/แคมเปญ/โน้ตจากแผงเลย).
 */

import { Check, FileSignature, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import {
  contractEndDate,
  INFLU_POST_KINDS,
  INFLU_POST_PLATFORM_ORDER,
  INFLU_POST_PLATFORMS,
  INFLU_TIERS,
  postPlatformLabel,
  postPlatformOf,
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
  influName,
  PhotoDots,
  TRACK_STATUS_ORDER,
  TRACK_STATUSES,
  TrackingPanel,
  type TrackRow,
  type TrackStatus,
} from "./tracking-panel";

export type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string;
};

/* คอลัมน์: Influencer / สัญญา / โพสตามสัญญา / รูปติดตาม / ผู้รับผิดชอบ / หมายเหตุ
   — ชุดเดียวใช้ทั้งหัวตารางและแถว (เพิ่ม-ลดคอลัมน์ต้องแก้ทั้งสองที่พร้อมกัน);
   จอ <sm แถวเป็น flex-wrap ซ่อนคอลัมน์ผู้รับผิดชอบ/หมายเหตุ */
const GRID_COLS =
  "minmax(190px,1.3fr) 150px minmax(230px,1.7fr) 150px 110px minmax(120px,1fr)";

export function ContractsClient({
  influencers,
  campaigns,
  postLinks,
  photoTasks,
  profiles,
  canEdit,
  actor,
}: {
  influencers: InfluencerRow[];
  campaigns: InfluCampaignRow[];
  postLinks: InfluPostLinkRow[];
  /** เช็คพอยต์รูปติดตาม — งาน checklist มาตรฐานหมวด 4 (page.tsx กรองมาแล้ว) */
  photoTasks: InfluTaskRow[];
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

  const [tasksS, setTasksS] = useState({ base: photoTasks, list: photoTasks });
  if (tasksS.base !== photoTasks)
    setTasksS({ base: photoTasks, list: photoTasks });

  const [campsS, setCampsS] = useState({ base: campaigns, list: campaigns });
  if (campsS.base !== campaigns)
    setCampsS({ base: campaigns, list: campaigns });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TrackStatus | "all">("all");
  const [panel, setPanel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ownerNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, p.full_name?.trim() || p.email);
    return m;
  }, [profiles]);

  /* ---- ประกอบข้อมูลต่อเคส ---- */
  const rows: TrackRow[] = useMemo(() => {
    const linksByInflu = new Map<string, InfluPostLinkRow[]>();
    for (const l of linksS.list) {
      const arr = linksByInflu.get(l.influencer_id);
      if (arr) arr.push(l);
      else linksByInflu.set(l.influencer_id, [l]);
    }
    const tasksByInflu = new Map<string, InfluTaskRow[]>();
    for (const t of tasksS.list) {
      const arr = tasksByInflu.get(t.influencer_id);
      if (arr) arr.push(t);
      else tasksByInflu.set(t.influencer_id, [t]);
    }
    const campsByInflu = new Map<string, InfluCampaignRow[]>();
    for (const c of campsS.list) {
      const arr = campsByInflu.get(c.influencer_id);
      if (arr) arr.push(c);
      else campsByInflu.set(c.influencer_id, [c]);
    }

    return influsS.list.map((i) => {
      const end = contractEndDate(i.contract_start!, i.contract_months);
      const total =
        new Date(end).getTime() - new Date(i.contract_start!).getTime();
      const used =
        new Date(today).getTime() - new Date(i.contract_start!).getTime();
      const daysLeft = Math.ceil(
        (new Date(end).getTime() - new Date(today).getTime()) / 86400000
      );
      const expired = daysLeft < 0;

      const links = linksByInflu.get(i.id) ?? [];
      const postCounts: Partial<Record<InfluPostPlatform, number>> = {};
      let postTotal = 0;
      for (const l of links) {
        if (l.kind !== "post") continue;
        const p = postPlatformOf(l.url);
        postCounts[p] = (postCounts[p] ?? 0) + 1;
        postTotal += 1;
      }

      const quotas = i.post_quotas ?? {};
      const quotaPlatforms = INFLU_POST_PLATFORM_ORDER.filter(
        (p) => (quotas[p] ?? 0) > 0
      );
      const quotaTotal = quotaPlatforms.reduce(
        (s, p) => s + (quotas[p] ?? 0),
        0
      );
      const quotaMet =
        quotaPlatforms.length > 0 &&
        quotaPlatforms.every((p) => (postCounts[p] ?? 0) >= (quotas[p] ?? 0));

      // เคสโหมด custom ไม่มี checklist มาตรฐาน — งานหมวด 4 ที่ค้างอยู่ถูกซ่อน
      // (กติกา activeFollowupTasks) จึงต้องไม่เอามานับ ไม่งั้นสถานะค้าง "เลยกำหนด"
      const pTasks =
        i.followup_mode === "custom" ? [] : (tasksByInflu.get(i.id) ?? []);
      const photoDone = pTasks.filter((t) => t.done).length;
      const photoOverdue = pTasks.some(
        (t) => !t.done && t.due_date !== null && t.due_date < today
      );

      const hasTargets = quotaPlatforms.length > 0 || pTasks.length > 0;
      const complete =
        hasTargets &&
        (quotaPlatforms.length === 0 || quotaMet) &&
        (pTasks.length === 0 || photoDone === pTasks.length);
      const status: TrackStatus = complete
        ? "complete"
        : expired
          ? "expired"
          : photoOverdue
            ? "overdue"
            : "ontrack";

      const ownerName =
        (i.owner_id && ownerNames.get(i.owner_id)) ||
        (i.created_by && ownerNames.get(i.created_by)) ||
        null;

      return {
        influ: i,
        end,
        daysLeft,
        expired,
        usedPct:
          total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 100,
        status,
        postCounts,
        postTotal,
        commentCount: links.length - postTotal,
        quotas,
        quotaTotal,
        photoTasks: pTasks,
        photoDone,
        photoOverdue,
        links,
        campaigns: campsByInflu.get(i.id) ?? [],
        ownerName,
      };
    });
  }, [influsS.list, linksS.list, tasksS.list, campsS.list, ownerNames, today]);

  /* ---- ค้นหา (base = ทุกสถานะ — ตัวเลขการ์ดสรุปนิ่งระหว่างกรองสถานะ) ---- */
  const base = useMemo(() => {
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

  const counts = useMemo(() => {
    const c: Record<TrackStatus, number> = {
      overdue: 0,
      ontrack: 0,
      complete: 0,
      expired: 0,
    };
    for (const r of base) c[r.status] += 1;
    return c;
  }, [base]);

  const sections = useMemo(
    () =>
      TRACK_STATUS_ORDER.filter(
        (s) => statusFilter === "all" || s === statusFilter
      )
        .map((s) => ({
          status: s,
          rows: base
            .filter((r) => r.status === s)
            .sort((a, b) => a.daysLeft - b.daysLeft),
        }))
        .filter((g) => g.rows.length > 0),
    [base, statusFilter]
  );

  const shown = sections.reduce((s, g) => s + g.rows.length, 0);
  const filterActive = search.trim() !== "" || statusFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
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
          action: "update",
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
      summary: `เพิ่มลิงก์${INFLU_POST_KINDS[kind].label} ${postPlatformLabel(clean)}`,
      meta: { url: clean },
    });
    router.refresh();
    return null;
  };

  const removePostLink = (influ: InfluencerRow, link: InfluPostLinkRow) => {
    setErr(null);
    const prevList = linksS.list;
    setLinksS((p) => ({
      ...p,
      list: p.list.filter((l) => l.id !== link.id),
    }));
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
          summary: `${next ? "ติ๊กส่งแล้ว" : "ยกเลิกติ๊ก"}เช็คพอยต์รูป "${task.title}"`,
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

  // หาแถวของแผงจาก rows เต็ม (ไม่ใช่ base) — ตัวกรอง/ค้นหาเปลี่ยนไม่ทำให้แผงปิดเอง
  const panelRow =
    panel !== null ? (rows.find((r) => r.influ.id === panel) ?? null) : null;

  return (
    <>
      {err && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="glass rounded-xl">
          <EmptyState
            icon={<FileSignature size={40} strokeWidth={1.5} />}
            title="ยังไม่มี Influencer ที่เซนสัญญา"
            description="เมื่ออัพโหลดไฟล์สัญญาที่เซนแล้วในขั้น 'เซนสัญญา + วันรับบริการ' ระบบจะเริ่มนับสัญญาและติดตามผลงานที่นี่"
          />
        </div>
      ) : (
        <>
          {/* การ์ดสรุป = ตัวกรองสถานะ (กดซ้ำ = กลับมาทุกสถานะ) */}
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TRACK_STATUS_ORDER.map((s, idx) => {
              const meta = TRACK_STATUSES[s];
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(active ? "all" : s)}
                  className={`glass cursor-pointer rounded-xl p-4 text-left transition-all animate-fade-in-up active:scale-[0.98] ${
                    active ? "ring-2 ring-brand-300" : "hover:bg-white/70"
                  }`}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <p className="flex items-center gap-1.5 text-xs text-stone-500">
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-stone-900">
                    {formatNumber(counts[s])}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    {meta.hint}
                  </p>
                </button>
              );
            })}
          </div>

          {/* แถบเครื่องมือ */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / รหัส Influ / โน้ต"
                className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-300 focus:outline-none sm:text-sm"
              />
            </div>
            {filterActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline max-sm:min-h-11"
              >
                ล้างตัวกรอง
              </button>
            )}
            <span className="ml-auto text-xs text-stone-400">
              แสดง {formatNumber(shown)} จาก {formatNumber(rows.length)} เคส
            </span>
          </div>

          {sections.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 animate-fade-in">
              <span>ตัวกรองซ่อนรายการทั้งหมดอยู่ — ข้อมูลยังอยู่ครบ</span>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 max-sm:min-h-11"
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
                      <div className="sm:min-w-[1080px]">
                        <div className="flex flex-wrap items-baseline gap-2 px-4 pb-1.5 pt-3">
                          <h2 className="text-sm font-semibold text-stone-800">
                            {meta.label}
                          </h2>
                          <span className="text-xs text-stone-400">
                            {formatNumber(groupRows.length)} เคส · {meta.hint}
                          </span>
                        </div>
                        <div
                          className="hidden gap-3 border-y border-brand-100/60 bg-white/40 px-4 py-1.5 text-[11px] font-medium text-stone-400 sm:grid"
                          style={{ gridTemplateColumns: GRID_COLS }}
                        >
                          <span>Influencer</span>
                          <span>สัญญา</span>
                          <span>โพสตามสัญญา (ลงจริง/เป้า)</span>
                          <span>รูปติดตามผล</span>
                          <span>ผู้รับผิดชอบ</span>
                          <span>หมายเหตุ</span>
                        </div>
                        {groupRows.map((r) => (
                          <TrackRowLine
                            key={r.influ.id}
                            r={r}
                            today={today}
                            onOpen={() => setPanel(r.influ.id)}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {panelRow && (
        <TrackingPanel
          key={panelRow.influ.id}
          row={panelRow}
          today={today}
          canEdit={canEdit}
          onClose={() => setPanel(null)}
          onPatchInflu={(patch, summary) =>
            patchInflu(panelRow.influ, patch, summary)
          }
          onAddLink={(k, u, n) => addPostLink(panelRow.influ, k, u, n)}
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
  onOpen: () => void;
}) {
  const i = r.influ;
  // ช่องทางที่โชว์บนแถว = มีเป้า หรือมีโพสลงจริง
  const cellPlatforms = INFLU_POST_PLATFORM_ORDER.filter(
    (p) => (r.quotas[p] ?? 0) > 0 || (r.postCounts[p] ?? 0) > 0
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ gridTemplateColumns: GRID_COLS }}
      className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-brand-100/50 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-brand-50/40 sm:grid sm:gap-3 sm:px-4 sm:py-2"
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

      {/* สัญญา */}
      <span className="text-xs">
        <span className="block text-stone-600">
          {formatDate(i.contract_start)} – {formatDate(r.end)}
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

      {/* โพสตามสัญญา */}
      <span className="flex flex-wrap items-center gap-1">
        {cellPlatforms.length === 0 && r.commentCount === 0 ? (
          <span className="text-xs text-stone-300">
            ยังไม่ตั้งเป้า / ไม่มีโพส
          </span>
        ) : (
          <>
            {cellPlatforms.map((p) => {
              const pm = INFLU_POST_PLATFORMS[p];
              const q = r.quotas[p] ?? 0;
              const c = r.postCounts[p] ?? 0;
              const met = q > 0 && c >= q;
              return (
                <span
                  key={p}
                  title={`${pm.label} — ลงจริง ${c}${q > 0 ? ` จากเป้า ${q}` : " (ยังไม่ตั้งเป้า)"}`}
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${pm.chip}`}
                >
                  {pm.short} {q > 0 ? `${c}/${q}` : c}
                  {met && <Check size={10} strokeWidth={3} />}
                </span>
              );
            })}
            {r.commentCount > 0 && (
              <span className="text-[11px] text-stone-400">
                +{r.commentCount} คอมเมนต์
              </span>
            )}
          </>
        )}
      </span>

      {/* รูปติดตามผล */}
      <span className="flex items-center gap-1.5 text-xs">
        {i.followup_mode === "custom" ? (
          <span className="text-stone-400">แพ็คเกจเฉพาะ</span>
        ) : r.photoTasks.length === 0 ? (
          <span className="text-stone-300">ยังไม่ถึงขั้นตามงาน</span>
        ) : (
          <>
            <PhotoDots tasks={r.photoTasks} today={today} />
            <span
              className={r.photoOverdue ? "text-rose-500" : "text-stone-500"}
            >
              {r.photoDone}/{r.photoTasks.length}
            </span>
          </>
        )}
      </span>

      {/* ผู้รับผิดชอบ (ซ่อนบนจอเล็ก) */}
      <span className="hidden truncate text-xs text-stone-500 sm:block">
        {r.ownerName ?? "—"}
      </span>

      {/* หมายเหตุ (ซ่อนบนจอเล็ก) */}
      <span
        className="hidden truncate text-xs text-stone-400 sm:block"
        title={i.note ?? undefined}
      >
        {i.note ?? ""}
      </span>
    </button>
  );
}
