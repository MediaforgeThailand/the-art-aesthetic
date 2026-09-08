"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Search,
  Stethoscope,
  Tag,
  Users,
  X,
} from "lucide-react";
import { DoctorManagerPanel } from "@/influ-bridge/doctor-manager";
import type { InfluLogActor } from "@/influ-bridge/influ-log";
import { HashtagChips } from "@/influ-bridge/hashtag-chips";
import { InfluTagAvatar } from "@/influ-bridge/influ-tag-avatar";
import { Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { fuzzyFilter } from "@/lib/fuzzy";
import {
  DEFAULT_PRODUCT_TEAM,
  INFLU_PRODUCT_TEAM_ORDER,
  INFLU_PRODUCT_TEAMS,
  influLabel,
  influTagHashtags,
  missingHashtagCount,
} from "@/influ-bridge/constants";
import type {
  ContentCategoryRow,
  DoctorRow,
  InfluProductTeam,
  InfluTagOption,
} from "@/lib/types";

type TabKey = "doctor" | "influ" | "category";
type TeamFilter = InfluProductTeam | "all";

const TABS: { key: TabKey; label: string; icon: typeof Stethoscope }[] = [
  { key: "doctor", label: "หมอ", icon: Stethoscope },
  { key: "influ", label: "Influencer", icon: Users },
  { key: "category", label: "หมวดเนื้อหา", icon: Tag },
];

/* ---------- แท็บ Influencer ---------- */

function InfluTagCard({ option }: { option: InfluTagOption }) {
  const tags = influTagHashtags(option);
  const missing = missingHashtagCount(tags);
  return (
    <div className="rounded-xl border border-stone-200 bg-white/70 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <InfluTagAvatar influ={option} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-800">
            {influLabel(option)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {option.influ_code && (
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600">
                {option.influ_code}
              </span>
            )}
            {option.teams.map((t) => (
              <span
                key={t}
                className={`rounded-md px-1.5 py-0.5 text-[11px] ${INFLU_PRODUCT_TEAMS[t].chip}`}
              >
                {INFLU_PRODUCT_TEAMS[t].label}
              </span>
            ))}
            {option.teams.length === 0 && (
              <span className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                <AlertTriangle size={10} /> ยังไม่ระบุหัตถการ
              </span>
            )}
            {option.campaign_name && (
              <span className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">
                {option.campaign_name}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-stone-400">
            แพทย์ที่รับเคส : {option.doctor_name ?? "ยังไม่ระบุ"}
          </p>
        </div>
        {missing > 0 && (
          <span className="shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
            แท็กไม่ครบ {missing}
          </span>
        )}
      </div>
      <div className="mt-3 border-t border-stone-100 pt-3">
        <HashtagChips tags={tags} size="sm" />
      </div>
    </div>
  );
}

function InfluTab({ options }: { options: InfluTagOption[] }) {
  /* ทีมคอนเทนต์ทำงานกับหัตถการ Aesthetics เท่านั้น จึงเริ่มที่ทีมนี้เสมอ
     แต่เปิดตัวกรองหัตถการอื่นไว้ เผื่อทีมอื่นเอาระบบไปใช้ในอนาคต */
  const [team, setTeam] = useState<TeamFilter>(DEFAULT_PRODUCT_TEAM);
  const [query, setQuery] = useState("");

  const byTeam = useMemo(
    () =>
      team === "all"
        ? options
        : /* เคสที่ยังไม่มีรายการหัตถการ แยกทีมไม่ได้ — โชว์ในทุกตัวกรอง
             ไม่งั้นหายจากทุกหน้าจอโดยไม่มีใครรู้ว่าหายไปไหน */
          options.filter((o) => o.teams.length === 0 || o.teams.includes(team)),
    [options, team]
  );

  const shown = useMemo(
    () =>
      fuzzyFilter(byTeam, query, (o) => [
        influLabel(o),
        o.first_name,
        o.last_name,
        o.nickname,
        o.influ_code,
        o.doctor_name,
        o.campaign_tag,
        o.campaign_name,
        o.promo_skus.join(" "),
      ]),
    [byTeam, query]
  );

  const incomplete = shown.filter(
    (o) => missingHashtagCount(influTagHashtags(o)) > 0
  ).length;

  const teamChips: { key: TeamFilter; label: string }[] = [
    { key: "all", label: "ทุกหัตถการ" },
    ...INFLU_PRODUCT_TEAM_ORDER.map((t) => ({
      key: t as TeamFilter,
      label: INFLU_PRODUCT_TEAMS[t].label,
    })),
  ];

  return (
    <Card className="p-3 sm:p-5">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-stone-500">
          รายชื่อที่ติดแท็กได้ = influencer
          ทุกเคสที่ยังเดินงานอยู่บนบอร์ดเคส (ไม่รวมข้อมูลเก่า เคสที่ปฏิเสธ และเคสที่ปิดงานแล้ว) —
          แฮชแท็กของแต่ละคนมาจากข้อมูลในระบบ Influ แก้ที่หน้าเคสของคนนั้น
        </p>

        {/* ค้นหา + ตัวกรองหัตถการ */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา"
              className="!pl-9 !pr-9"
            />
            {query !== "" && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="ล้างคำค้น"
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {teamChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setTeam(c.key)}
                className={`rounded-full px-3 text-xs font-medium transition-colors max-sm:min-h-11 sm:py-1.5 ${
                  team === c.key
                    ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                    : "border border-stone-200 bg-white/70 text-stone-600 hover:text-stone-800"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-stone-400">
          แสดง {shown.length} คน
          {incomplete > 0 && (
            <span className="text-amber-700"> · แท็กไม่ครบ {incomplete} คน</span>
          )}
        </p>

        {shown.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={
              query !== ""
                ? "ไม่พบรายชื่อที่ใกล้เคียง"
                : "ยังไม่มี influencer ในหัตถการนี้"
            }
          />
        ) : (
          <div className="grid gap-2.5 xl:grid-cols-2">
            {shown.map((o) => (
              <InfluTagCard key={o.id} option={o} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- แท็บหมวดเนื้อหา (อ่านอย่างเดียว) ---------- */

function CategoryTab({ categories }: { categories: ContentCategoryRow[] }) {
  const active = categories.filter((c) => c.active);
  const hidden = categories.filter((c) => !c.active);
  return (
    <Card className="p-3 sm:p-5">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {active.map((c) => (
            <span
              key={c.id}
              className="rounded-lg border border-stone-200 bg-white/70 px-2.5 py-1 text-sm text-stone-700"
            >
              {c.name}
            </span>
          ))}
          {active.length === 0 && (
            <p className="text-sm text-stone-400">ยังไม่มีหมวดเนื้อหา</p>
          )}
        </div>
        {hidden.length > 0 && (
          <p className="text-xs text-stone-400">
            ซ่อนจากตัวเลือกอยู่ : {hidden.map((c) => c.name).join(" · ")}
          </p>
        )}
        <Link href="/content-kpi" className="inline-block">
          <Button variant="secondary">
            <ExternalLink size={14} /> เพิ่ม/แก้หมวดที่หน้าตั้งค่า KPI
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/* ---------- หน้าหลัก ---------- */

export function TagManagementClient({
  doctors,
  influOptions,
  categories,
  canManageDoctors,
  actor,
}: {
  doctors: DoctorRow[];
  influOptions: InfluTagOption[];
  categories: ContentCategoryRow[];
  /** isAdmin หรือสิทธิ์ doctor_manage แยกเท่านั้นที่เพิ่ม/แก้/ลบทะเบียนหมอได้
      (เกณฑ์เดียวกับหน้า /influ-doctors) */
  canManageDoctors: boolean;
  /** ผู้ทำ — ทะเบียนหมอที่หน้านี้แก้ต้องเขียน log เหมือนกับ /influ-doctors */
  actor: InfluLogActor;
}) {
  const [tab, setTab] = useState<TabKey>("doctor");
  return (
    <>
      <PageHeader
        title="จัดการแท็ก"
      />

      <div className="mb-4 flex overflow-x-auto rounded-full border border-stone-200 bg-white/70 p-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-colors sm:min-h-9 ${
                on
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ทะเบียนเดียวกับระบบ Influ แต่ทีมคอนเทนต์เห็นเฉพาะหมอทีม Aesthetics
          — หมอที่เพิ่มในหน้าไหนก็ได้ ถ้าติดทีม aesthetics ไว้จะโผล่ที่นี่เอง */}
      {tab === "doctor" && (
        <DoctorManagerPanel
          doctors={doctors}
          canEdit={canManageDoctors}
          teamFilter="aesthetics"
          actor={actor}
        />
      )}
      {tab === "influ" && <InfluTab options={influOptions} />}
      {tab === "category" && <CategoryTab categories={categories} />}
    </>
  );
}
