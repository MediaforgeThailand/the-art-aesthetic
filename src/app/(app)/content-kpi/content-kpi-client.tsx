"use client";

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Eye,
  EyeOff,
  Plus,
  Tags,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSyncedState } from "@/lib/use-synced-state";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import {
  CONTENT_FORMAT_ORDER,
  CONTENT_FORMATS,
  CONTENT_KPI_BASES,
  CONTENT_KPI_BASIS_ORDER,
  CONTENT_KPI_PERIOD_ORDER,
  CONTENT_KPI_PERIODS,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type {
  ContentCategoryRow,
  ContentFormat,
  ContentKpiBasis,
  ContentKpiRow,
} from "@/lib/types";

/* ---------- helpers ระดับโมดูล ---------- */

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function personName(p: ProfileLite): string {
  return p.full_name?.trim() || p.email || "ไม่ทราบชื่อ";
}

/** ป้ายเงื่อนไขของกติกา เช่น "ส่งงาน · วิดีโอ · หมอ" — ใช้ในข้อความยืนยันลบ */
function ruleLabel(rule: ContentKpiRow, cats: ContentCategoryRow[]): string {
  const fmt =
    rule.format === null ? "ทุกฟอร์แมต" : CONTENT_FORMATS[rule.format].label;
  const cat =
    rule.category_id === null
      ? "ทุกหมวด"
      : (cats.find((c) => c.id === rule.category_id)?.name ?? "หมวดที่ถูกลบ");
  return `${CONTENT_KPI_BASES[rule.basis].label} · ${fmt} · ${cat}`;
}

/**
 * หน้าตั้งค่า KPI ทีมคอนเทนต์ — 2 ส่วน:
 * 1) หมวดเนื้อหา (content_categories): เพิ่ม/เปลี่ยนชื่อ/สลับลำดับ/ซ่อน/ลบ
 * 2) เป้ารายคน (content_kpis): กติกาแบบ [ฟอร์แมต × หมวด × จำนวนชิ้น × คาบ] หลายแถวต่อคน
 *    format null = ทุกฟอร์แมต, category null = ทุกหมวด — งานชิ้นเดียวนับให้ทุกกติกาที่ตรง
 *    period 'month' = ชิ้น/เดือน, 'day' = ชิ้น/วัน (แดชบอร์ดคูณจำนวนวันของเดือนเป็นเป้าทั้งเดือน)
 * ทุกคนที่มีสิทธิ์ team เห็น (ช่องถูก disabled) — แก้ไขเฉพาะ admin
 */
export function ContentKpiClient({
  initialCategories,
  initialKpis,
  profiles,
  isAdmin,
  userId,
  loadError,
}: {
  initialCategories: ContentCategoryRow[];
  initialKpis: ContentKpiRow[];
  profiles: ProfileLite[];
  isAdmin: boolean;
  userId: string | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // seed จาก server แล้ว sync ใหม่ทุกครั้งที่ router.refresh() ส่ง props ชุดใหม่มา
  const [cats, setCats] = useSyncedState(initialCategories);
  const [rules, setRules] = useSyncedState(initialKpis);

  const [newCatName, setNewCatName] = useState("");
  const [error, setError] = useState<string | null>(loadError);
  const [confirmDel, setConfirmDel] = useState<
    | { kind: "cat"; cat: ContentCategoryRow }
    | { kind: "rule"; rule: ContentKpiRow }
    | null
  >(null);

  const fail = (msg: string) => setError(`บันทึกไม่สำเร็จ: ${msg}`);

  /* ---------- หมวดเนื้อหา ---------- */

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const position =
      (cats.length ? Math.max(...cats.map((c) => c.position)) : 0) + 1;
    const { data, error: err } = await supabase
      .from("content_categories")
      .insert({ name, position })
      .select("*")
      .single();
    if (err) return fail(err.message);
    setCats((prev) => [...prev, data as ContentCategoryRow]);
    setNewCatName("");
    router.refresh();
  };

  const renameCategory = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c))
    );
    const { error: err } = await supabase
      .from("content_categories")
      .update({ name: trimmed })
      .eq("id", id);
    if (err) fail(err.message);
    router.refresh();
  };

  const toggleCategory = async (cat: ContentCategoryRow) => {
    setCats((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, active: !cat.active } : c))
    );
    const { error: err } = await supabase
      .from("content_categories")
      .update({ active: !cat.active })
      .eq("id", cat.id);
    if (err) fail(err.message);
    router.refresh();
  };

  /** สลับลำดับกับเพื่อนบ้าน — สลับค่า position ของสองแถว (DB เก็บ float) */
  const moveCategory = async (id: string, dir: -1 | 1) => {
    const idx = cats.findIndex((c) => c.id === id);
    const other = cats[idx + dir];
    if (idx < 0 || !other) return;
    const me = cats[idx];
    const next = cats.slice();
    next[idx] = { ...other, position: me.position };
    next[idx + dir] = { ...me, position: other.position };
    setCats(next);
    const [r1, r2] = await Promise.all([
      supabase
        .from("content_categories")
        .update({ position: other.position })
        .eq("id", me.id),
      supabase
        .from("content_categories")
        .update({ position: me.position })
        .eq("id", other.id),
    ]);
    if (r1.error || r2.error) fail((r1.error ?? r2.error)!.message);
    router.refresh();
  };

  const deleteCategory = async (cat: ContentCategoryRow) => {
    // FK: content_kpis.category_id เป็น CASCADE (กติกาที่ผูกหมวดนี้หายด้วย)
    // ส่วน tasks.content_category_id เป็น SET NULL (งานเก่าไม่หาย แค่กลายเป็น "ไม่ระบุ")
    setCats((prev) => prev.filter((c) => c.id !== cat.id));
    setRules((prev) => prev.filter((r) => r.category_id !== cat.id));
    const { error: err } = await supabase
      .from("content_categories")
      .delete()
      .eq("id", cat.id);
    if (err) fail(err.message);
    router.refresh();
  };

  /* ---------- กติกา KPI รายคน ---------- */

  const addRule = async (
    profileId: string,
    init?: Partial<
      Pick<ContentKpiRow, "format" | "category_id" | "target" | "basis">
    >
  ) => {
    const mine = rules.filter((r) => r.profile_id === profileId);
    const position =
      (mine.length ? Math.max(...mine.map((r) => r.position)) : 0) + 1;
    const { data, error: err } = await supabase
      .from("content_kpis")
      .insert({
        profile_id: profileId,
        format: init?.format ?? null,
        category_id: init?.category_id ?? null,
        target: init?.target ?? 1,
        // basis ไม่ส่ง = พึ่ง DB default 'work' (ชิ้นงานที่ทำเอง — พฤติกรรมเดิมของระบบ)
        ...(init?.basis ? { basis: init.basis } : {}),
        position,
        created_by: userId,
      })
      .select("*")
      .single();
    if (err) return fail(err.message);
    setRules((prev) => [...prev, data as ContentKpiRow]);
    router.refresh();
  };

  const patchRule = async (id: string, patch: Partial<ContentKpiRow>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    const { error: err } = await supabase
      .from("content_kpis")
      .update(patch)
      .eq("id", id);
    if (err) fail(err.message);
    router.refresh();
  };

  const deleteRule = async (rule: ContentKpiRow) => {
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    const { error: err } = await supabase
      .from("content_kpis")
      .delete()
      .eq("id", rule.id);
    if (err) fail(err.message);
    router.refresh();
  };

  /* ---------- derived ---------- */

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  // คนที่มีกติกาแล้ว — เรียงตามลำดับรายชื่อ (profiles มาจาก server เรียงชื่อแล้ว)
  const peopleWithRules = useMemo(() => {
    const ids = new Set(rules.map((r) => r.profile_id));
    return profiles.filter((p) => ids.has(p.id));
  }, [profiles, rules]);
  const peopleWithoutRules = useMemo(() => {
    const ids = new Set(rules.map((r) => r.profile_id));
    return profiles.filter((p) => !ids.has(p.id));
  }, [profiles, rules]);

  return (
    <>
      <PageHeader
        title="ตั้งค่า KPI คอนเทนต์"
        action={
          <Link href="/content-tracking">
            <Button variant="secondary">
              <BarChart3 size={16} />
              ดูแดชบอร์ดติดตาม
            </Button>
          </Link>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ---------- หมวดเนื้อหา ---------- */}
        <Card className="self-start p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Tags size={16} className="text-brand-500" />
            <h2 className="text-sm font-semibold text-stone-800">
              หมวดเนื้อหา
            </h2>
          </div>
          <ul className="space-y-1.5">
            {cats.map((cat, idx) => (
              <li
                key={cat.id}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
                  cat.active
                    ? "border-stone-200/80 bg-white/70"
                    : "border-dashed border-stone-200 bg-stone-50/60"
                }`}
              >
                {isAdmin ? (
                  <input
                    key={`${cat.id}:${cat.name}`}
                    defaultValue={cat.name}
                    aria-label={`ชื่อหมวด ${cat.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v) e.target.value = cat.name;
                      else if (v !== cat.name) void renameCategory(cat.id, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className={`min-w-0 flex-1 bg-transparent text-base focus:outline-none sm:text-sm ${
                      cat.active ? "text-stone-800" : "text-stone-400"
                    }`}
                  />
                ) : (
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      cat.active ? "text-stone-800" : "text-stone-400"
                    }`}
                  >
                    {cat.name}
                  </span>
                )}
                {!cat.active && (
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
                    ซ่อนอยู่
                  </span>
                )}
                {isAdmin && (
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => void moveCategory(cat.id, -1)}
                      disabled={idx === 0}
                      title="เลื่อนขึ้น"
                      className="flex h-11 w-8 cursor-pointer items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:cursor-default disabled:opacity-30 sm:h-7 sm:w-7"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveCategory(cat.id, 1)}
                      disabled={idx === cats.length - 1}
                      title="เลื่อนลง"
                      className="flex h-11 w-8 cursor-pointer items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:cursor-default disabled:opacity-30 sm:h-7 sm:w-7"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleCategory(cat)}
                      title={
                        cat.active
                          ? "ซ่อนจากตัวเลือกบนการ์ดงาน"
                          : "แสดงในตัวเลือกอีกครั้ง"
                      }
                      className="flex h-11 w-8 cursor-pointer items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-600 sm:h-7 sm:w-7"
                    >
                      {cat.active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDel({ kind: "cat", cat })}
                      title="ลบหมวด"
                      className="flex h-11 w-8 cursor-pointer items-center justify-center rounded text-stone-400 hover:bg-rose-50 hover:text-rose-600 sm:h-7 sm:w-7"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </li>
            ))}
            {cats.length === 0 && (
              <li className="rounded-lg border border-dashed border-stone-200 px-3 py-4 text-center text-sm text-stone-400">
                ยังไม่มีหมวดเนื้อหา
              </li>
            )}
          </ul>
          {isAdmin && (
            <div className="mt-3 flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addCategory();
                }}
                placeholder="หมวดใหม่"
                className="flex-1"
              />
              <Button
                variant="secondary"
                disabled={newCatName.trim() === ""}
                onClick={() => void addCategory()}
              >
                <Plus size={16} />
                เพิ่ม
              </Button>
            </div>
          )}
        </Card>

        {/* ---------- เป้ารายคน ---------- */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-stone-800">
              เป้า KPI รายคน
            </h2>
            {isAdmin && peopleWithoutRules.length > 0 && (
              <label className="inline-flex items-center gap-2 text-sm text-stone-500">
                <UserPlus size={15} className="text-brand-500" />
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) void addRule(e.target.value);
                  }}
                  className="w-auto min-w-44"
                  aria-label="เพิ่มทีมงานที่ต้องมี KPI"
                >
                  <option value="">+ เพิ่มทีมงาน...</option>
                  {peopleWithoutRules.map((p) => (
                    <option key={p.id} value={p.id}>
                      {personName(p)}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          {peopleWithRules.length === 0 ? (
            <Card>
              <EmptyState
                icon={<UserPlus size={40} strokeWidth={1.5} />}
                title="ยังไม่มีใครถูกตั้งเป้า KPI"
              />
            </Card>
          ) : (
            peopleWithRules.map((person) => {
              const mine = rules
                .filter((r) => r.profile_id === person.id)
                .sort((a, b) => a.position - b.position);
              // เป้ารวมโดยประมาณ = ผลรวมเฉพาะแถวที่ระบุฟอร์แมต (แถว "ทุกฟอร์แมต"
              // มักเป็นเป้ารวมอยู่แล้ว นับซ้ำจะเกินจริง) — แยกหน่วยตามคาบ โชว์เป็น hint เฉยๆ
              const fmtTotals = CONTENT_KPI_PERIOD_ORDER.map((p) => ({
                unit: CONTENT_KPI_PERIODS[p].unit,
                total: mine.reduce(
                  (sum, r) =>
                    r.format !== null && r.period === p ? sum + r.target : sum,
                  0
                ),
              })).filter((t) => t.total > 0);
              // ฐานที่คนนี้ถูกวัดผล — คนที่ brief อย่างเดียวต้องเห็นชัดว่ากติกาเขาไม่ได้นับการ์ด creative
              const basisTotals = CONTENT_KPI_BASIS_ORDER.map((b) => ({
                basis: b,
                count: mine.filter((r) => r.basis === b).length,
              })).filter((b) => b.count > 0);
              return (
                <Card key={person.id} className="p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-stone-800">
                      {personName(person)}
                    </p>
                    <span className="text-xs text-stone-400">
                      {mine.length} กติกา
                      {fmtTotals.length > 0 &&
                        ` · รวมแบบระบุฟอร์แมต ${fmtTotals
                          .map((t) => `${t.total} ${t.unit}`)
                          .join(" + ")}`}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      {basisTotals.map((b) => (
                        <span
                          key={b.basis}
                          title={CONTENT_KPI_BASES[b.basis].desc}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONTENT_KPI_BASES[b.basis].chip}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${CONTENT_KPI_BASES[b.basis].dot}`}
                          />
                          {CONTENT_KPI_BASES[b.basis].label} {b.count}
                        </span>
                      ))}
                    </span>
                  </div>
                  {/* กติกาเป็นการ์ดสั้นใน grid — ผู้ใช้ 2026-08-26: แถวยาวเต็มจออ่านยาก */}
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                    {mine.map((rule) => (
                      <li
                        key={rule.id}
                        className="rounded-xl border border-stone-200/80 bg-white/70 p-2.5"
                      >
                        <div className="flex items-start gap-1">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            {/* ฐานการนับ (migration 0095) — ตัวชี้ขาดว่า "ผลงาน 1 ชิ้น" ของคนนี้คืออะไร */}
                            <Select
                              value={rule.basis}
                              disabled={!isAdmin}
                              aria-label="นับจาก"
                              onChange={(e) =>
                                void patchRule(rule.id, {
                                  basis: e.target.value as ContentKpiBasis,
                                })
                              }
                            >
                              {CONTENT_KPI_BASIS_ORDER.map((b) => (
                                <option key={b} value={b}>
                                  นับจาก: {CONTENT_KPI_BASES[b].label}
                                </option>
                              ))}
                            </Select>
                            <div className="grid grid-cols-2 gap-1.5">
                              <Select
                                value={rule.format ?? "any"}
                                disabled={!isAdmin}
                                aria-label="ฟอร์แมตชิ้นงาน"
                                onChange={(e) =>
                                  void patchRule(rule.id, {
                                    format:
                                      e.target.value === "any"
                                        ? null
                                        : (e.target.value as ContentFormat),
                                  })
                                }
                              >
                                <option value="any">ทุกฟอร์แมต</option>
                                {CONTENT_FORMAT_ORDER.map((f) => (
                                  <option key={f} value={f}>
                                    {CONTENT_FORMATS[f].label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                value={rule.category_id ?? "any"}
                                disabled={!isAdmin}
                                aria-label="หมวดเนื้อหา"
                                onChange={(e) =>
                                  void patchRule(rule.id, {
                                    category_id:
                                      e.target.value === "any"
                                        ? null
                                        : e.target.value,
                                  })
                                }
                              >
                                <option value="any">ทุกหมวด</option>
                                {cats
                                  .filter(
                                    (c) => c.active || c.id === rule.category_id
                                  )
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                              </Select>
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDel({ kind: "rule", rule })
                              }
                              title="ลบกติกานี้"
                              className="-mr-1 -mt-0.5 flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded text-stone-400 hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-stone-500">เป้า</span>
                          <Input
                            key={`${rule.id}:${rule.target}`}
                            type="number"
                            min={1}
                            defaultValue={rule.target}
                            disabled={!isAdmin}
                            aria-label="เป้าจำนวนชิ้น"
                            onBlur={(e) => {
                              const v = Math.floor(Number(e.target.value));
                              if (!Number.isFinite(v) || v < 1) {
                                e.target.value = String(rule.target);
                              } else if (v !== rule.target) {
                                void patchRule(rule.id, { target: v });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className="w-16 text-center"
                          />
                          {/* คาบของเป้า — "วัน" = แดชบอร์ดคูณจำนวนวันของเดือนเป็นเป้าทั้งเดือนให้เอง */}
                          <span className="inline-flex shrink-0 rounded-full border border-stone-200 bg-stone-50/80 p-0.5">
                            {CONTENT_KPI_PERIOD_ORDER.map((p) => (
                              <button
                                key={p}
                                type="button"
                                disabled={!isAdmin}
                                onClick={() => {
                                  if (rule.period !== p)
                                    void patchRule(rule.id, { period: p });
                                }}
                                title={`เป้าเป็น${CONTENT_KPI_PERIODS[p].label}`}
                                className={`min-h-11 cursor-pointer rounded-full px-3 text-xs transition sm:min-h-7 sm:px-2.5 ${
                                  rule.period === p
                                    ? "bg-gradient-to-r from-brand-500 to-brand-600 font-medium text-white shadow-sm"
                                    : "text-stone-500 hover:text-stone-700"
                                } disabled:cursor-default`}
                              >
                                {CONTENT_KPI_PERIODS[p].short}
                              </button>
                            ))}
                          </span>
                          <span className="text-xs text-stone-400">
                            ชิ้น{CONTENT_KPI_PERIODS[rule.period].label}
                          </span>
                        </div>
                      </li>
                    ))}
                    {isAdmin && (
                      <li>
                        <button
                          type="button"
                          onClick={() => void addRule(person.id)}
                          className="flex h-full min-h-[5.25rem] w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 text-sm text-brand-600 hover:border-brand-300 hover:bg-brand-50/60"
                        >
                          <Plus size={15} />
                          เพิ่มกติกา
                        </button>
                      </li>
                    )}
                  </ul>
                </Card>
              );
            })
          )}

        </div>
      </div>

      {/* ---------- ยืนยันลบ ---------- */}
      <ConfirmDialog
        open={confirmDel !== null}
        title={confirmDel?.kind === "cat" ? "ลบหมวดเนื้อหา" : "ลบกติกา KPI"}
        message={
          confirmDel?.kind === "cat"
            ? `ลบหมวด "${confirmDel.cat.name}" ? กติกา KPI ที่เจาะหมวดนี้จะถูกลบไปด้วย ส่วนงานที่ติดหมวดนี้ไว้จะกลายเป็น "ไม่ระบุ" (ถ้าแค่เลิกใช้ชั่วคราว กดปุ่มรูปตาเพื่อซ่อนแทน)`
            : confirmDel?.kind === "rule"
              ? `ลบกติกา "${ruleLabel(confirmDel.rule, cats)} — เป้า ${confirmDel.rule.target} ${CONTENT_KPI_PERIODS[confirmDel.rule.period].unit}" ของ ${personName(profileById.get(confirmDel.rule.profile_id) ?? { id: "", full_name: null, email: null })} ?`
              : ""
        }
        onConfirm={() => {
          if (confirmDel?.kind === "cat") void deleteCategory(confirmDel.cat);
          else if (confirmDel?.kind === "rule")
            void deleteRule(confirmDel.rule);
        }}
        onClose={() => setConfirmDel(null)}
      />
    </>
  );
}
