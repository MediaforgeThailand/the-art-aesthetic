"use client";

/**
 * Influencer Cost — สรุปต้นทุนค่าบริการของ influencer รายโปรแกรม
 * — แยก "ใช้บริการแล้ว / กำลังจะมา / ยังไม่เคาะวัน" ตามวันเข้ารับบริการของเคส
 * — แก้ต้นทุน + ติ๊ก "แบรนด์ support" ได้ตรงจากหน้านี้ (รายการ support นับเป็น ฿0)
 * — รายการถูกเพิ่ม/ลบจากหน้าเดินงาน Stage 2 ของแต่ละเคส (/influencers/[id])
 */

import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Gift,
  Search,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HeroCard } from "@/components/report-viz";
import { Badge, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  COST_USAGE_META,
  COST_USAGE_ORDER,
  type CostUsage,
  costUsageOf,
  itemEffectiveCost,
  roundLabel,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluProcedureItemRow } from "@/lib/types";
import {
  CostPriceInput,
  SupportToggle,
} from "../influencers/procedure-items-editor";

/** ข้อมูลเคสที่ join มากับรายการต้นทุน */
export type CostInflu = {
  id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  /** รอบที่เท่าไหร่ของคนนี้ — ต้นทุนแยกรายรอบ ชื่อซ้ำกันได้ต้องบอกรอบกำกับ */
  round_no: number;
  service_date: string | null;
  stage: number;
  completed: boolean;
  archived: boolean;
  declined_at: string | null;
};

export type CostItem = InfluProcedureItemRow & { influencer: CostInflu | null };

/** "ยังไม่กรอกต้นทุน" = ไม่ support + ราคา 0 + ไม่ได้ผูก Price List
    (แถวที่ผูก Price List ราคาอ้างอิงจากเมนูและล็อกไว้ — เป็น 0 ก็คือของแถมราคา 0 จริง) */
const isUnpriced = (r: CostItem) =>
  !r.is_supported && Number(r.price) === 0 && !r.price_item_id;

function influName(i: CostInflu): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

type Group = {
  influ: CostInflu;
  usage: CostUsage;
  items: CostItem[];
  effective: number;
  saved: number;
  unpriced: number;
};

export function CostClient({
  items,
  canEdit,
  loadError,
}: {
  items: CostItem[];
  /** ระดับ "ดูเฉยๆ" = แก้ราคา/ติ๊ก support ไม่ได้ (ตัวเลขยังเห็นครบ) */
  canEdit: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // local copy — แก้ราคา/ติ๊ก support แบบ optimistic แล้วค่อย refresh เบื้องหลัง
  // ต้องรับค่าใหม่จาก props ด้วย ไม่งั้น router.refresh() ที่เรียกหลังบันทึกไม่มีผลอะไรเลย
  // (ของที่คนอื่นแก้ไม่ขึ้น และรายการที่ถูกลบใน Stage 2 ยังค้างเป็นแถวผี)
  const [rows, setRows] = useState<CostItem[]>(items);
  useEffect(() => setRows(items), [items]);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState<"all" | CostUsage>("all");
  const [supportFilter, setSupportFilter] = useState<
    "all" | "supported" | "unsupported"
  >("all");
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // เคสเก่า (archive) + เคสที่ปฏิเสธ ซ่อนโดย default — ข้อมูลนำเข้าเก่าเยอะมาก
  const [includeOld, setIncludeOld] = useState(false);

  const commitPrice = (id: string, price: number) => {
    setErr(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, price } : r)));
    void supabase
      .from("influ_procedure_items")
      .update({ price })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setErr(`บันทึกราคาไม่สำเร็จ: ${error.message}`);
        else router.refresh();
      });
  };

  const toggleSupport = (id: string) => {
    const cur = rows.find((r) => r.id === id);
    if (!cur) return;
    setErr(null);
    const nextVal = !cur.is_supported;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_supported: nextVal } : r))
    );
    void supabase
      .from("influ_procedure_items")
      .update({ is_supported: nextVal })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setErr(`บันทึกสถานะ support ไม่สำเร็จ: ${error.message}`);
        else router.refresh();
      });
  };

  /** ชุดข้อมูลหลังกรองทุกอย่างยกเว้นสถานะการใช้ — ใช้ทั้งการ์ดสรุปและลิสต์ */
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const inf = r.influencer;
      if (!inf) return false;
      if (!includeOld && (inf.archived || inf.declined_at !== null))
        return false;
      if (supportFilter === "supported" && !r.is_supported) return false;
      if (supportFilter === "unsupported" && r.is_supported) return false;
      if (unpricedOnly && !isUnpriced(r)) return false;
      if (dateFrom || dateTo) {
        // กรองช่วงวันเข้ารับบริการ — เคสที่ยังไม่เคาะวันไม่เข้าช่วง
        if (!inf.service_date) return false;
        if (dateFrom && inf.service_date < dateFrom) return false;
        if (dateTo && inf.service_date > dateTo) return false;
      }
      if (q) {
        const hay = `${influName(inf)} ${r.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, supportFilter, unpricedOnly, dateFrom, dateTo, includeOld]);

  // สรุปยอดแยกตามสถานะการใช้ (จาก base — ไม่ผูกกับตัวกรองสถานะ)
  const sums = useMemo(() => {
    const s = {
      total: 0,
      used: 0,
      upcoming: 0,
      unscheduled: 0,
      saved: 0,
      supportedCount: 0,
      unpricedCount: 0,
      influIds: new Set<string>(),
    };
    for (const r of base) {
      if (!r.influencer) continue;
      const usage = costUsageOf(r.influencer);
      const eff = itemEffectiveCost(r);
      s.total += eff;
      s[usage] += eff;
      if (r.is_supported) {
        s.saved += Number(r.price) || 0;
        s.supportedCount += 1;
      } else if (isUnpriced(r)) {
        s.unpricedCount += 1;
      }
      s.influIds.add(r.influencer.id);
    }
    return s;
  }, [base]);

  // จัดกลุ่มตามเคส แล้วแยกเป็น section ตามสถานะการใช้
  const sections = useMemo(() => {
    const byInflu = new Map<string, Group>();
    for (const r of base) {
      const inf = r.influencer;
      if (!inf) continue;
      const usage = costUsageOf(inf);
      if (usageFilter !== "all" && usage !== usageFilter) continue;
      let g = byInflu.get(inf.id);
      if (!g) {
        g = {
          influ: inf,
          usage,
          items: [],
          effective: 0,
          saved: 0,
          unpriced: 0,
        };
        byInflu.set(inf.id, g);
      }
      g.items.push(r);
      g.effective += itemEffectiveCost(r);
      if (r.is_supported) g.saved += Number(r.price) || 0;
      else if (isUnpriced(r)) g.unpriced += 1;
    }
    const groups = [...byInflu.values()];
    for (const g of groups)
      g.items.sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1));
    return COST_USAGE_ORDER.map((usage) => {
      const list = groups.filter((g) => g.usage === usage);
      // กำลังจะมา = วันใกล้สุดก่อน · ใช้แล้ว = ล่าสุดก่อน · ยังไม่เคาะวัน = รายการเพิ่มล่าสุดก่อน
      if (usage === "upcoming")
        list.sort((a, b) =>
          (a.influ.service_date ?? "").localeCompare(b.influ.service_date ?? "")
        );
      else if (usage === "used")
        list.sort((a, b) =>
          (b.influ.service_date ?? "").localeCompare(a.influ.service_date ?? "")
        );
      else
        list.sort((a, b) => {
          const la = a.items.reduce(
            (m, i) => (i.created_at > m ? i.created_at : m),
            ""
          );
          const lb = b.items.reduce(
            (m, i) => (i.created_at > m ? i.created_at : m),
            ""
          );
          return lb.localeCompare(la);
        });
      return { usage, groups: list };
    }).filter((s) => s.groups.length > 0);
  }, [base, usageFilter]);

  return (
    <div>
      <PageHeader
        title="Influencer Cost"
        description="ต้นทุนค่าบริการของ influencer รายโปรแกรม — แก้ราคา/ติ๊ก support ได้จากหน้านี้ ส่วนเพิ่ม-ลบรายการทำที่ Stage 2 ของแต่ละเคส"
      />

      {loadError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </p>
      )}
      {err && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}

      {/* การ์ดสรุป */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroCard
          icon={Wallet}
          label="ต้นทุนรวม"
          value={formatCurrency(sums.total)}
          sub={`${base.length} รายการ · ${sums.influIds.size} เคส${
            sums.unpricedCount > 0
              ? ` · ยังไม่กรอกต้นทุน ${sums.unpricedCount} รายการ`
              : ""
          }`}
        />
        <HeroCard
          icon={CheckCircle2}
          iconClass="bg-emerald-50 text-emerald-600"
          label="ใช้บริการแล้ว"
          value={formatCurrency(sums.used)}
          sub="เคสที่ผ่านขั้นรับบริการแล้ว"
          delay={40}
        />
        <HeroCard
          icon={CalendarClock}
          iconClass="bg-sky-50 text-sky-600"
          label="กำลังจะมา"
          value={formatCurrency(sums.upcoming)}
          sub={
            sums.unscheduled > 0
              ? `+ ยังไม่เคาะวันอีก ${formatCurrency(sums.unscheduled)}`
              : "ตามวันเข้ารับบริการที่นัดไว้"
          }
          delay={80}
        />
        <HeroCard
          icon={Gift}
          iconClass="bg-pink-50 text-pink-600"
          label="แบรนด์ Support ประหยัด"
          value={formatCurrency(sums.saved)}
          sub={`${sums.supportedCount} รายการที่แบรนด์ส่งของมาให้`}
          delay={120}
        />
      </div>

      {/* แถบตัวกรอง */}
      <div className="mb-5 flex flex-wrap items-center gap-2 animate-fade-in-up">
        <div className="relative w-full sm:w-64">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ influ / โปรแกรม..."
            className="pl-9"
          />
        </div>
        <Select
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value as "all" | CostUsage)}
          className="w-auto"
        >
          <option value="all">สถานะ: ทั้งหมด</option>
          {COST_USAGE_ORDER.map((u) => (
            <option key={u} value={u}>
              {COST_USAGE_META[u].label}
            </option>
          ))}
        </Select>
        <Select
          value={supportFilter}
          onChange={(e) =>
            setSupportFilter(
              e.target.value as "all" | "supported" | "unsupported"
            )
          }
          className="w-auto"
        >
          <option value="all">Support: ทั้งหมด</option>
          <option value="supported">เฉพาะได้ Support</option>
          <option value="unsupported">ไม่ได้ Support</option>
        </Select>
        <span className="flex items-center gap-1.5 text-xs text-stone-500">
          วันรับบริการ
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-auto"
          />
          –
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-auto"
          />
        </span>
        <button
          type="button"
          onClick={() => setUnpricedOnly((v) => !v)}
          className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97] max-sm:min-h-11 ${
            unpricedOnly
              ? "border-amber-300 bg-amber-100 text-amber-700"
              : "border-stone-200 bg-white/60 text-stone-500 hover:bg-white"
          }`}
        >
          ยังไม่กรอกต้นทุน{sums.unpricedCount > 0 && ` (${sums.unpricedCount})`}
        </button>
        <button
          type="button"
          onClick={() => setIncludeOld((v) => !v)}
          title="รวมข้อมูลเก่าที่นำเข้า (archive) และเคสที่ปฏิเสธ"
          className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97] max-sm:min-h-11 ${
            includeOld
              ? "border-brand-300 bg-brand-100 text-brand-700"
              : "border-stone-200 bg-white/60 text-stone-500 hover:bg-white"
          }`}
        >
          รวมเคสเก่า/ปฏิเสธ
        </button>
      </div>

      {/* ลิสต์แยก section ตามสถานะการใช้ */}
      {sections.length === 0 ? (
        <EmptyState
          icon={<Wallet size={40} />}
          title="ไม่พบรายการต้นทุนตามตัวกรอง"
          description="เพิ่มโปรแกรมของแต่ละเคสได้ที่ Stage 2 ในหน้าเคสดำเนินงาน"
        />
      ) : (
        <div className="space-y-6">
          {sections.map(({ usage, groups }) => {
            const meta = COST_USAGE_META[usage];
            const subtotal = groups.reduce((s, g) => s + g.effective, 0);
            return (
              <section key={usage} className="animate-fade-in-up">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                  <h2 className="text-sm font-semibold text-stone-900">
                    {meta.label}
                  </h2>
                  <span className="text-xs text-stone-400">
                    {groups.length} เคส · รวม{" "}
                    <span className="font-medium tabular-nums text-stone-600">
                      {formatCurrency(subtotal)}
                    </span>
                  </span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {groups.map((g) => (
                    <Card key={g.influ.id} className="p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/influencers/${g.influ.id}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-stone-900 transition-colors hover:text-brand-700"
                        >
                          {influName(g.influ)}
                          <ArrowUpRight
                            size={13}
                            className="text-stone-300"
                          />
                        </Link>
                        {/* คนเดิมเข้ามาหลายรอบ — ต้นทุนแยกเคสต่อรอบ บอกรอบกำกับกันสับสน */}
                        {roundLabel(g.influ.round_no) && (
                          <Badge className="border border-stone-200 bg-stone-50 text-stone-500">
                            {roundLabel(g.influ.round_no)}
                          </Badge>
                        )}
                        {g.influ.archived && (
                          <Badge className="border border-stone-200 bg-stone-100 text-stone-500">
                            ข้อมูลเก่า
                          </Badge>
                        )}
                        {g.influ.declined_at && (
                          <Badge className="border border-rose-200 bg-rose-50 text-rose-600">
                            ปฏิเสธแล้ว
                          </Badge>
                        )}
                        <Badge className={`border ${meta.chip}`}>
                          {meta.label}
                          {g.influ.service_date &&
                            ` · ${formatDate(g.influ.service_date)}`}
                        </Badge>
                        <span className="ml-auto text-sm font-semibold tabular-nums text-stone-800">
                          {formatCurrency(g.effective)}
                        </span>
                      </div>
                      {g.saved > 0 && (
                        <p className="mb-1 text-[11px] text-pink-600">
                          แบรนด์ support ประหยัด {formatCurrency(g.saved)}
                        </p>
                      )}
                      <ul className="divide-y divide-stone-100">
                        {g.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5"
                          >
                            <span
                              className="min-w-[150px] flex-1 truncate text-sm text-stone-700"
                              title={`${item.name} — เพิ่มเมื่อ ${formatDate(item.created_at)}`}
                            >
                              {item.name}
                            </span>
                            {isUnpriced(item) && (
                              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                                ยังไม่กรอก
                              </span>
                            )}
                            {item.is_supported ? (
                              <span className="text-xs tabular-nums text-pink-600">
                                {Number(item.price) > 0 && (
                                  <span className="mr-1 text-stone-300 line-through">
                                    {formatCurrency(Number(item.price))}
                                  </span>
                                )}
                                ฿0
                              </span>
                            ) : item.price_item_id ? (
                              /* ผูกกับ Price List = ราคาอ้างอิงจากเมนูกลาง ล็อกไว้ ห้ามกรอกเอง */
                              <span
                                title="ราคาอ้างอิงจาก Price List — แก้เองไม่ได้ (แก้รายการได้ที่ Stage 2 ของเคส)"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-2 py-1 text-xs tabular-nums text-brand-800"
                              >
                                {formatCurrency(Number(item.price) || 0)}
                                <span className="text-[10px] font-medium uppercase tracking-wide text-brand-400">
                                  Price List
                                </span>
                              </span>
                            ) : (
                              <CostPriceInput
                                value={Number(item.price) || 0}
                                disabled={!canEdit}
                                onCommit={(n) => commitPrice(item.id, n)}
                              />
                            )}
                            <SupportToggle
                              on={item.is_supported}
                              disabled={!canEdit}
                              onToggle={() => toggleSupport(item.id)}
                              compact
                            />
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
