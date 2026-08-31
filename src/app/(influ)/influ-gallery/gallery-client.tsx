"use client";

import {
  Archive,
  CheckCircle2,
  FileSignature,
  ListChecks,
  Repeat,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FilterChip,
  FilterSection,
  FilterSummary,
  InfluFilterButton,
  useInfluFilters,
  type FilterSummaryChip,
} from "@/components/influ-filter-panel";
import { Badge, Card, EmptyState, Select } from "@/components/ui";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import {
  contractEndDate,
  INFLU_STAGES,
  INFLU_TIER_ORDER,
  INFLU_TIERS,
} from "@/lib/influ-constants";
import type { InfluTier } from "@/lib/types";
import {
  type InfluLinkLite,
  SourceLinkQuickButton,
} from "../influencers/influ-links";
import { useSignedUrl } from "@/lib/use-signed-url";
import {
  influName,
  type InfluencerListRow,
} from "../influencers/influencers-client";

/** วันคงเหลือของสัญญา (บวก = ยังเหลือ, ลบ = หมดแล้ว, null = ไม่มีข้อมูลสัญญา) */
function contractDaysLeftOf(i: InfluencerListRow, today: string): number | null {
  if (!i.contract_start) return null;
  const end = contractEndDate(i.contract_start, i.contract_months);
  return Math.round(
    (new Date(end).getTime() - new Date(today).getTime()) / 86400000
  );
}

/** ช่วงเวลาระหว่าง 2 วัน แบบ "Y เดือน Z วัน" (นับเป็นเดือนปฏิทิน ไม่ใช่หาร 30)
    ใช้ทั้งเวลาเหลือจนหมดสัญญา และเวลาที่เลยกำหนดมาแล้ว */
function monthsDaysBetween(fromISO: string, toISO: string): string {
  const a = new Date(fromISO);
  const b = new Date(toISO);
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  let days = b.getUTCDate() - a.getUTCDate();
  if (days < 0) {
    months -= 1;
    // จำนวนวันของเดือนก่อนหน้าเดือนปลายทาง (เติมวันที่ยืมมา)
    days += new Date(
      Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)
    ).getUTCDate();
  }
  const parts: string[] = [];
  if (months > 0) parts.push(`${months} เดือน`);
  if (days > 0) parts.push(`${days} วัน`);
  return parts.length ? parts.join(" ") : "วันนี้";
}

type ContractFilter = "all" | "active" | "expired";

/** ตัวกรองของหน้าโปรไฟล์ — ปุ่มเดียว กดแล้วแผงลอย (กติกาทุกหน้าในระบบ) */
export type GalleryFilters = {
  /** "all" | "mine" | uid — ผู้รับผิดชอบ (match ได้จากรอบไหนของคนนั้นก็ได้) */
  owner: string;
  contract: ContractFilter;
  tiers: InfluTier[];
  /** true = รวมข้อมูลเก่าที่นำเข้า (archive) */
  includeArchived: boolean;
};

/** ค่าโรงงาน — เริ่มที่ "ของฉัน" ตามกติกาทุกหน้า (ผู้ใช้ 2026-08-29) */
export const DEFAULT_GALLERY_FILTERS: GalleryFilters = {
  owner: "mine",
  contract: "all",
  tiers: [],
  includeArchived: true,
};

function galleryFilterCount(f: GalleryFilters): number {
  return (
    (f.owner !== "all" ? 1 : 0) +
    (f.contract !== "all" ? 1 : 0) +
    (f.tiers.length ? 1 : 0) +
    (f.includeArchived ? 0 : 1)
  );
}

const CONTRACT_LABELS: Record<ContractFilter, string> = {
  all: "ทั้งหมด",
  active: "สัญญายังไม่หมด",
  expired: "หมดสัญญาแล้ว",
};

/** โปรไฟล์ 1 คน — influ ที่เข้ามาทำหลายรอบ (person_id เดียวกัน) ถูกรวมเป็นการ์ดเดียว
    หน้านี้คือมุมมอง "ตัวบุคคล" ส่วนบอร์ด Influ Management ยังเป็นการ์ดต่อรอบงาน (0073) */
type PersonGroup = {
  /** person_id */
  key: string;
  /** ทุกรอบของคนนี้ เรียงรอบล่าสุดก่อน */
  rounds: InfluencerListRow[];
  /** รอบล่าสุด — แหล่งข้อมูลหลักของการ์ด (ชื่อ/ผู้ติดตาม/สถานะ) และปลายทางตอนคลิก */
  display: InfluencerListRow;
  /** รูปโปรไฟล์จากรอบล่าสุดที่มีรูป — รอบที่เพิ่งเปิดใหม่อาจยังไม่ได้อัพรูป */
  photoPath: string | null;
  /** รอบล่าสุดที่มีสัญญา — ใช้แสดง/กรองอายุสัญญา (รอบใหม่ยังไม่เซนสัญญา ต้องไม่ทำให้สัญญาเดิมหาย) */
  contractRow: InfluencerListRow | null;
};

/** จัดกลุ่มรอบงานเป็นรายบุคคล — ลำดับคนตามรอบที่สร้างล่าสุด (input เรียง created_at ใหม่→เก่าอยู่แล้ว) */
function groupByPerson(influencers: InfluencerListRow[]): PersonGroup[] {
  const byPerson = new Map<string, InfluencerListRow[]>();
  for (const i of influencers) {
    const arr = byPerson.get(i.person_id);
    if (arr) arr.push(i);
    else byPerson.set(i.person_id, [i]);
  }
  const groups: PersonGroup[] = [];
  for (const [key, rounds] of byPerson) {
    rounds.sort(
      (a, b) =>
        b.round_no - a.round_no || b.created_at.localeCompare(a.created_at)
    );
    groups.push({
      key,
      rounds,
      display: rounds[0],
      photoPath: rounds.find((r) => r.photo_path)?.photo_path ?? null,
      contractRow: rounds.find((r) => r.contract_start) ?? null,
    });
  }
  return groups;
}

export function InfluGalleryClient({
  influencers,
  followupRemaining,
  contentTaskCount,
  sourceLinks,
  assignees,
  people,
  meId,
  loadError,
}: {
  influencers: InfluencerListRow[];
  followupRemaining: Record<string, number>;
  contentTaskCount: Record<string, number>;
  /** ลิงก์ไฟล์ source (Google Drive) ต่อ influencer — ปุ่มเปิดเร็วบนการ์ด */
  sourceLinks: Record<string, InfluLinkLite[]>;
  /** ผู้รับผิดชอบของทุกเคส (0095) — ตัวกรอง "ของฉัน" */
  assignees: { influencer_id: string; user_id: string }[];
  people: { id: string; name: string }[];
  meId: string | null;
  loadError: string | null;
}) {
  const today = todayISO();
  const [search, setSearch] = useState("");
  /* ตัวกรองปุ่มเดียว + บันทึกค่าเริ่มต้นของตัวเองได้ (กติกาทุกหน้าในระบบ) */
  const filterApi = useInfluFilters<GalleryFilters>({
    page: "gallery",
    userId: meId,
    factory: DEFAULT_GALLERY_FILTERS,
  });
  const { filters, setFilters } = filterApi;

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people]
  );
  /** uid ที่รับผิดชอบเคสนั้น — ใช้เทียบทีละรอบของคนหนึ่ง */
  const ownersByCase = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of assignees) {
      const cur = m.get(a.influencer_id);
      if (cur) cur.push(a.user_id);
      else m.set(a.influencer_id, [a.user_id]);
    }
    return m;
  }, [assignees]);

  // มุมมองรายบุคคล — คนที่เข้ามาหลายรอบรวมเป็นการ์ดเดียว (รายละเอียดรายรอบดูในหน้าเดินงาน)
  const persons = useMemo(() => groupByPerson(influencers), [influencers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return persons.filter((p) => {
      if (filters.contract !== "all") {
        // อายุสัญญาของคน = สัญญาจากรอบล่าสุดที่มีสัญญา
        const daysLeft = p.contractRow
          ? contractDaysLeftOf(p.contractRow, today)
          : null;
        if (daysLeft === null) return false; // ไม่มีข้อมูลสัญญา — ไม่เข้าเกณฑ์ active/expired
        if (filters.contract === "active" && daysLeft < 0) return false;
        if (filters.contract === "expired" && daysLeft >= 0) return false;
      }
      if (!filters.includeArchived && p.rounds.every((r) => r.archived))
        return false;
      if (filters.owner !== "all") {
        const want = filters.owner === "mine" ? meId : filters.owner;
        // รับผิดชอบรอบไหนของคนนี้ก็นับว่าเป็นคนของเรา
        if (
          !want ||
          !p.rounds.some((r) => (ownersByCase.get(r.id) ?? []).includes(want))
        )
          return false;
      }
      if (filters.tiers.length) {
        const tier = p.display.tier;
        if (!tier || !filters.tiers.includes(tier)) return false;
      }
      if (q === "") return true;
      // ค้นเจอจากรอบไหนก็ได้ — หัตถการรอบเก่าก็ยังค้นถึงตัวคนได้
      return p.rounds.some(
        (i) =>
          influName(i).toLowerCase().includes(q) ||
          (i.procedure_text ?? "").toLowerCase().includes(q)
      );
    });
  }, [persons, search, filters, today, meId, ownersByCase]);

  const contractCounts = useMemo(() => {
    let active = 0;
    let expired = 0;
    for (const p of persons) {
      const d = p.contractRow ? contractDaysLeftOf(p.contractRow, today) : null;
      if (d === null) continue;
      if (d < 0) expired += 1;
      else active += 1;
    }
    return { all: persons.length, active, expired };
  }, [persons, today]);

  const filterChips = useMemo(() => {
    const out: FilterSummaryChip<GalleryFilters>[] = [];
    if (filters.owner !== "all")
      out.push({
        key: "owner",
        label:
          filters.owner === "mine"
            ? "ของฉัน"
            : `ผู้รับผิดชอบ: ${peopleById.get(filters.owner) ?? "ไม่ทราบชื่อ"}`,
        next: { ...filters, owner: "all" },
      });
    if (filters.contract !== "all")
      out.push({
        key: "contract",
        label: CONTRACT_LABELS[filters.contract],
        next: { ...filters, contract: "all" },
      });
    if (filters.tiers.length)
      out.push({
        key: "tiers",
        label: `ระดับ: ${INFLU_TIER_ORDER.filter((t) => filters.tiers.includes(t))
          .map((t) => INFLU_TIERS[t].label)
          .join(", ")}`,
        next: { ...filters, tiers: [] },
      });
    if (!filters.includeArchived)
      out.push({
        key: "archived",
        label: "ซ่อนข้อมูลเก่า",
        next: { ...filters, includeArchived: true },
      });
    return out;
  }, [filters, peopleById]);

  return (
    <>
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}

      {/* แถบเครื่องมือเหลือ 2 ชิ้น: ค้นหา + ปุ่มตัวกรอง (ผู้ใช้ 2026-08-29) */}
      <div className="mb-3 flex flex-wrap items-center gap-2 animate-fade-in-up">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            placeholder="ค้นหาชื่อ หรือหัตถการ..."
            aria-label="ค้นหาโปรไฟล์"
            className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <InfluFilterButton
          api={filterApi}
          count={galleryFilterCount(filters)}
          factory={DEFAULT_GALLERY_FILTERS}
        >
          <FilterSection
            title="ผู้รับผิดชอบ"
            hint="นับจากเคสรอบไหนของคนนั้นก็ได้ — ค่าเริ่มต้นคือ “ของฉัน”"
          >
            <Select
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
              aria-label="กรองตามผู้รับผิดชอบ"
            >
              <option value="all">ทุกคน</option>
              {meId && <option value="mine">ของฉัน</option>}
              {people
                .filter((p) => p.id !== meId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </FilterSection>

          <FilterSection title="สถานะสัญญา">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "active", "expired"] as ContractFilter[]).map((k) => (
                <FilterChip
                  key={k}
                  active={filters.contract === k}
                  onClick={() => setFilters({ ...filters, contract: k })}
                >
                  {CONTRACT_LABELS[k]}
                  <span className="tabular-nums text-stone-400">
                    {k === "all"
                      ? contractCounts.all
                      : k === "active"
                        ? contractCounts.active
                        : contractCounts.expired}
                  </span>
                </FilterChip>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="ระดับผู้ติดตาม">
            <div className="flex flex-wrap gap-1.5">
              {INFLU_TIER_ORDER.map((t) => (
                <FilterChip
                  key={t}
                  active={filters.tiers.includes(t)}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      tiers: filters.tiers.includes(t)
                        ? filters.tiers.filter((x) => x !== t)
                        : [...filters.tiers, t],
                    })
                  }
                >
                  {INFLU_TIERS[t].label}
                </FilterChip>
              ))}
            </div>
          </FilterSection>

          <FilterSection
            title="ข้อมูลเก่า"
            hint="ข้อมูลที่นำเข้าจากไฟล์เดิม (archive) — โผล่เฉพาะหน้านี้หน้าเดียว"
          >
            <FilterChip
              active={filters.includeArchived}
              onClick={() =>
                setFilters({
                  ...filters,
                  includeArchived: !filters.includeArchived,
                })
              }
            >
              รวมข้อมูลเก่า
            </FilterChip>
          </FilterSection>
        </InfluFilterButton>
        <span className="ml-auto text-xs text-stone-400">
          {formatNumber(filtered.length)} จาก {formatNumber(persons.length)} คน
        </span>
      </div>

      <FilterSummary
        chips={filterChips}
        onChange={setFilters}
        onClear={() => {
          setSearch("");
          setFilters(DEFAULT_GALLERY_FILTERS);
        }}
      />

      {influencers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={40} strokeWidth={1.5} />}
            title="ยังไม่มี Influencer ในระบบ"
            description="เพิ่มโปรไฟล์และสร้างนัดได้ที่หน้าเคสดำเนินงาน"
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={40} strokeWidth={1.5} />}
            title="ไม่พบรายชื่อที่ค้นหา"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 animate-fade-in-up sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <InfluCard
              key={p.key}
              person={p}
              today={today}
              followupLeft={followupRemaining[p.display.id] ?? 0}
              // งานคอนเทนต์นับรวมทุกรอบ — เป็นผลงานของ "คน" ไม่ใช่ของรอบใดรอบหนึ่ง
              contentTasks={p.rounds.reduce(
                (n, r) => n + (contentTaskCount[r.id] ?? 0),
                0
              )}
              links={p.rounds.flatMap((r) => sourceLinks[r.id] ?? [])}
            />
          ))}
        </div>
      )}
    </>
  );
}

function InfluCard({
  person,
  today,
  followupLeft,
  contentTasks,
  links,
}: {
  person: PersonGroup;
  today: string;
  followupLeft: number;
  contentTasks: number;
  links: InfluLinkLite[];
}) {
  // ข้อมูลแสดงหลัก = รอบล่าสุด (คลิกการ์ดก็เปิดหน้าเดินงานของรอบล่าสุด — สลับรอบอื่นได้ในนั้น)
  const i = person.display;
  const quickLinks = links.length > 0 ? links : undefined;
  // ถ้าขอ signed URL ไม่สำเร็จ (failed) จะ fallback ไปแสดงอวตารตัวอักษรด้านล่างเอง
  const { url: photoUrl } = useSignedUrl(person.photoPath);
  const followerText =
    i.follower_note ||
    (i.followers != null ? `${formatNumber(i.followers)} followers` : null);

  // อายุสัญญาอ่านจากรอบล่าสุดที่มีสัญญา — รอบใหม่ที่เพิ่งเปิดยังไม่เซน สัญญาเดิมต้องไม่หายจากการ์ด
  const contractRow = person.contractRow;
  const contractEnd = contractRow?.contract_start
    ? contractEndDate(contractRow.contract_start, contractRow.contract_months)
    : null;
  const contractDaysLeft = contractEnd
    ? Math.round(
        (new Date(contractEnd).getTime() - new Date(today).getTime()) / 86400000
      )
    : null;
  const stageInfo = INFLU_STAGES.find((s) => s.step === i.stage);

  return (
    /* ลิงก์ทั้งการ์ดเป็น "ชั้นซ้อน" (absolute inset-0) ไม่ใช่ตัวครอบ — ปุ่มเปิดไฟล์ Source
       ต้องเป็นพี่น้องของลิงก์ เพราะ HTML ห้ามซ้อน <button> ใน <a>
       **ลิงก์ต้องอยู่ "ข้างใน" Card**: utility `glass` ของ Card ตั้ง backdrop-filter ที่ ≥lg
       ซึ่งสร้าง stacking context ⇒ ถ้าลิงก์เป็นพี่น้องนอก Card มันจะวาดทับปุ่ม z-10 ที่ติดอยู่
       ข้างใน (ปุ่มไฟล์ Source กดไม่ได้บนคอม ส่วนมือถือไม่เป็นเพราะ <lg ถอด backdrop-filter)
       transform ตอน hover อยู่ที่กล่องนอกไม่ใช่ Card — ถ้า Card เป็นตัวขยับจะสร้าง
       stacking context ใหม่ตอน hover แล้วเจอปัญหาเดิมอีกทาง */
    <div className="relative transition-transform hover:-translate-y-1">
      <Card className="relative overflow-hidden p-0">
        {/* รูป influencer */}
        <div className="relative aspect-[4/3] bg-gradient-to-b from-brand-100 to-brand-200">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={influName(i)}
              // รูปเป็นไฟล์จากกล้องขนาดเต็ม (หลาย MB/ใบ) และหน้านี้แสดงทุกคนพร้อมกัน —
              // ไม่ lazy = เปิดบน 4G แล้วดึงหลายสิบเมกพร้อมกันจนแท็บถูกระบบ kill
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70 text-2xl font-semibold text-brand-500">
                {i.first_name.charAt(0)}
              </span>
            </div>
          )}
          {/* ระดับ (tier) มุมบน */}
          {i.tier && (
            <span className="absolute left-2 top-2">
              <Badge className={`shadow-sm ${INFLU_TIERS[i.tier].badge}`}>
                {INFLU_TIERS[i.tier].label}
              </Badge>
            </span>
          )}
          {/* สถานะ stage / จบงาน มุมบนขวา (ของรอบล่าสุด) */}
          <span className="absolute right-2 top-2">
            <Badge
              className={
                i.declined_at !== null
                  ? "border border-stone-300 bg-white/85 text-stone-500 shadow-sm"
                  : i.completed
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm"
                    : "bg-white/85 text-brand-700 shadow-sm"
              }
            >
              {i.declined_at !== null
                ? "ปฏิเสธ"
                : i.completed
                  ? "จบงานแล้ว"
                  : `${i.stage}. ${stageInfo?.short ?? ""}`}
            </Badge>
          </span>
          {/* ข้อมูลเก่าที่นำเข้า (archive-only) — ไม่โผล่บนบอร์ด Influ Management */}
          {i.archived && (
            <span className="absolute bottom-2 left-2">
              <Badge className="border border-stone-300 bg-white/85 text-stone-600 shadow-sm">
                <Archive size={11} /> ข้อมูลเก่า
              </Badge>
            </span>
          )}
          {/* เข้ามาทำหลายรอบ — จำนวนการ์ด/รอบงานของคนนี้ */}
          {person.rounds.length > 1 && (
            <span className="absolute bottom-2 right-2">
              <Badge className="border border-stone-300 bg-white/85 text-stone-600 shadow-sm">
                <Repeat size={11} /> {person.rounds.length} รอบ
              </Badge>
            </span>
          )}
        </div>

        {/* ข้อมูล */}
        <div className="space-y-2 p-4">
          <p className="truncate font-semibold text-stone-900">{influName(i)}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
            {followerText && (
              <span className="inline-flex items-center gap-1">
                <UsersRound size={12} /> {followerText}
              </span>
            )}
            {/* ปุ่มเปิดไฟล์ source — z-10 ให้ลอยเหนือชั้นลิงก์ที่คลุมทั้งการ์ด
                (render เฉพาะตอนมีลิงก์ ไม่งั้นได้ span ว่างที่ยังกิน gap ของ flex) */}
            {quickLinks && (
              <span className="relative z-10 inline-flex">
                <SourceLinkQuickButton links={quickLinks} />
              </span>
            )}
          </div>

          {/* อายุสัญญาคงเหลือ — บอกเป็น "เดือน + วัน" */}
          {contractDaysLeft !== null && contractEnd && (
            <div>
              {contractDaysLeft < 0 ? (
                <Badge className="border border-rose-200 bg-rose-50 text-rose-600">
                  <FileSignature size={11} /> หมดสัญญาแล้ว ·{" "}
                  {monthsDaysBetween(contractEnd, today)}ก่อน
                </Badge>
              ) : (
                <Badge
                  className={
                    contractDaysLeft <= 30
                      ? "border border-amber-200 bg-amber-50 text-amber-700"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }
                >
                  <FileSignature size={11} /> สัญญาเหลือ{" "}
                  {monthsDaysBetween(today, contractEnd)}
                </Badge>
              )}
            </div>
          )}

          {/* จำนวนคอนเทนต์ + follow-up เหลือ */}
          <div className="flex flex-wrap gap-1.5 border-t border-stone-100 pt-2">
            <Badge className="border border-brand-200 bg-brand-50 text-brand-700">
              <Sparkles size={11} /> คอนเทนต์ {formatNumber(contentTasks)} งาน
            </Badge>
            {/* 0092: ไม่มีขั้นตามงานแล้ว — เริ่มนับสัญญา = อยู่ระหว่างติดตาม */}
            {i.contract_start !== null &&
              !i.completed &&
              (followupLeft > 0 ? (
                <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                  <ListChecks size={11} /> follow-up เหลือ {followupLeft} ข้อ
                </Badge>
              ) : (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={11} /> follow-up ครบ
                </Badge>
              ))}
          </div>

          {contractRow?.contract_start && contractEnd && (
            <p className="text-[11px] text-stone-400">
              สัญญาถึง {formatDate(contractEnd)}
            </p>
          )}
        </div>
        <Link
          href={`/influencers/${i.id}`}
          aria-label={`เปิดเคสของ ${influName(i)}`}
          className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
      </Card>
    </div>
  );
}
