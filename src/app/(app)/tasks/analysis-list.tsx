"use client";

import {
  BarChart3,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSyncedState } from "@/lib/use-synced-state";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  ANALYSIS_CATEGORIES,
  ANALYSIS_CATEGORY_ORDER,
} from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  AnalysisCategory,
  AnalysisLinkRow,
  AnalysisPeriod,
} from "@/lib/types";

/* ---------- helpers ระดับโมดูล ---------- */

/** ชื่อเดือนไทยแบบตายตัว — ไม่ใช้ toLocaleDateString เพราะ SSR/CSR อยู่คนละ timezone */
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

/** "สิงหาคม 2569" — ปีแสดงเป็น พ.ศ. (DB เก็บ ค.ศ.) */
function monthLabel(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1] ?? month} ${year + 543}`;
}

/** ชื่อที่โชว์บนแถว — ไม่ได้ตั้งชื่อ = ใช้ชื่อหมวดแทน ทีมยังรู้ว่าไฟล์คืออะไร */
function displayTitle(item: AnalysisLinkRow): string {
  const t = item.title?.trim();
  if (t) return t;
  return `ผลวิเคราะห์ ${ANALYSIS_CATEGORIES[item.category].label}`;
}

/** เติม https:// ให้ลิงก์ที่วางมาแบบไม่มี scheme แล้วเช็คว่าเป็น URL จริง — คืน null ถ้าใช้ไม่ได้ */
function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** ลำดับในเดือนเดียวกัน: สรุปรายเดือนขึ้นก่อน → สัปดาห์ล่าสุดก่อน → ตามลำดับหมวด */
function sortInMonth(a: AnalysisLinkRow, b: AnalysisLinkRow): number {
  if (a.period !== b.period) return a.period === "monthly" ? -1 : 1;
  if (a.week !== b.week) return (b.week ?? 0) - (a.week ?? 0);
  const catDiff =
    ANALYSIS_CATEGORY_ORDER.indexOf(a.category) -
    ANALYSIS_CATEGORY_ORDER.indexOf(b.category);
  if (catDiff !== 0) return catDiff;
  return a.created_at.localeCompare(b.created_at);
}

/** ค่าตั้งต้นของฟอร์ม "เพิ่มลิงก์" — เดือน/สัปดาห์ปัจจุบันตามเวลาไทย
    (เรียกใช้เฉพาะใน event handler — ห้ามเรียกตอน render เพราะอ่านเวลาปัจจุบัน) */
function currentDefaults(): { year: number; month: number; week: number } {
  const [y, m, d] = todayISO().split("-").map(Number);
  return { year: y, month: m, week: Math.min(5, Math.ceil(d / 7)) };
}

type FormValue = {
  period: AnalysisPeriod;
  category: AnalysisCategory;
  year: number;
  month: number;
  week: number;
  url: string;
  title: string;
  note: string;
};

/**
 * แท็บ "ผลวิเคราะห์" — คลังลิงก์ Canva ผลวิเคราะห์ content / ads / artwork
 * ราย สัปดาห์/เดือน ที่หัวหน้าทีมแปะแชร์ให้ทีมใช้เป็นต้นแบบ
 * ทุกคนที่มีสิทธิ์ team เห็นและกดเปิดลิงก์ได้ — เพิ่ม/แก้/ลบเฉพาะ admin
 * จัดกลุ่มตามเดือน (ล่าสุดบนสุด): สรุปรายเดือนขึ้นก่อน แล้วไล่ W5 → W1
 */
export function AnalysisList({
  initialItems,
  isAdmin,
  userId,
}: {
  initialItems: AnalysisLinkRow[];
  isAdmin: boolean;
  userId: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // seed จาก server แล้ว sync ใหม่ทุกครั้งที่ router.refresh() ส่ง props ชุดใหม่มา
  const [items, setItems] = useSyncedState(initialItems);

  const [catFilter, setCatFilter] = useState<AnalysisCategory | "all">("all");
  const [modal, setModal] = useState<
    | { mode: "create"; init: FormValue }
    | { mode: "edit"; item: AnalysisLinkRow }
    | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<AnalysisLinkRow | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  /* ---------- จัดกลุ่มตามเดือน ---------- */

  const filtered = useMemo(
    () =>
      catFilter === "all"
        ? items
        : items.filter((i) => i.category === catFilter),
    [items, catFilter]
  );

  const monthGroups = useMemo(() => {
    const map = new Map<number, AnalysisLinkRow[]>();
    for (const item of filtered) {
      const key = item.year * 100 + item.month;
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([key, list]) => ({
        year: Math.floor(key / 100),
        month: key % 100,
        items: list.sort(sortInMonth),
      }));
  }, [filtered]);

  const countByCat = useMemo(() => {
    const counts = new Map<AnalysisCategory, number>();
    for (const item of items)
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return counts;
  }, [items]);

  /* ---------- mutations (admin) ---------- */

  const saveNew = async (v: FormValue): Promise<string | null> => {
    const clean = normalizeUrl(v.url);
    if (!clean) return "ลิงก์ไม่ถูกต้อง — วางลิงก์เต็มจาก Canva (ขึ้นต้น https://)";
    const { data, error: err } = await supabase
      .from("analysis_links")
      .insert({
        title: v.title.trim() || null,
        url: clean,
        category: v.category,
        period: v.period,
        year: v.year,
        month: v.month,
        week: v.period === "weekly" ? v.week : null,
        note: v.note.trim() || null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (err) return `บันทึกไม่สำเร็จ: ${err.message}`;
    setItems((cur) => [data as AnalysisLinkRow, ...cur]);
    router.refresh();
    return null;
  };

  const saveEdit = async (
    item: AnalysisLinkRow,
    v: FormValue
  ): Promise<string | null> => {
    const clean = normalizeUrl(v.url);
    if (!clean) return "ลิงก์ไม่ถูกต้อง — วางลิงก์เต็มจาก Canva (ขึ้นต้น https://)";
    const patch = {
      title: v.title.trim() || null,
      url: clean,
      category: v.category,
      period: v.period,
      year: v.year,
      month: v.month,
      week: v.period === "weekly" ? v.week : null,
      note: v.note.trim() || null,
    };
    const { error: err } = await supabase
      .from("analysis_links")
      .update(patch)
      .eq("id", item.id);
    if (err) return `บันทึกไม่สำเร็จ: ${err.message}`;
    setItems((cur) =>
      cur.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
    );
    router.refresh();
    return null;
  };

  const removeItem = async (item: AnalysisLinkRow) => {
    setError(null);
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== item.id));
    const { error: err } = await supabase
      .from("analysis_links")
      .delete()
      .eq("id", item.id);
    if (err) {
      setItems(prev);
      setError(`ลบไม่สำเร็จ: ${err.message}`);
      return;
    }
    router.refresh();
  };

  /* ---------- render ---------- */

  return (
    <div className="px-4 pb-6 pt-1 sm:px-6">
      {/* หัวแท็บ: คำอธิบาย + ตัวกรองหมวด + ปุ่มเพิ่ม (admin) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCatFilter("all")}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              catFilter === "all"
                ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                : "bg-white/70 text-stone-500 hover:text-brand-700"
            }`}
          >
            ทั้งหมด ({items.length})
          </button>
          {ANALYSIS_CATEGORY_ORDER.map((cat) => {
            const count = countByCat.get(cat) ?? 0;
            if (cat === "other" && count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  setCatFilter((cur) => (cur === cat ? "all" : cat))
                }
                className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                  catFilter === cat
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                    : `${ANALYSIS_CATEGORIES[cat].chip} hover:opacity-80`
                }`}
              >
                {ANALYSIS_CATEGORIES[cat].label} ({count})
              </button>
            );
          })}
        </div>
        {isAdmin && (
          <Button
            className="ml-auto"
            onClick={() =>
              setModal({
                mode: "create",
                init: {
                  period: "weekly",
                  category: "content",
                  ...currentDefaults(),
                  url: "",
                  title: "",
                  note: "",
                },
              })
            }
          >
            <Plus size={16} />
            เพิ่มลิงก์
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {error}
        </div>
      )}

      {monthGroups.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.5} />}
          title={
            items.length === 0
              ? "ยังไม่มีลิงก์ผลวิเคราะห์"
              : "ไม่มีลิงก์ในหมวดที่เลือก"
          }
          description={
            items.length === 0
              ? "ผลวิเคราะห์ Content / Ads / Artwork รายสัปดาห์และรายเดือนจะถูกแชร์ไว้ที่นี่ให้ทีมใช้เป็นต้นแบบ"
              : "ลองเปลี่ยนหมวดด้านบน หรือกด \"ทั้งหมด\""
          }
        />
      ) : (
        <div className="space-y-6">
          {monthGroups.map((group) => (
            <section key={`${group.year}-${group.month}`}>
              <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-stone-700">
                {monthLabel(group.year, group.month)}
                <span className="text-xs font-normal text-stone-400">
                  {group.items.length} ลิงก์
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                {group.items.map((item) => (
                  <AnalysisRow
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    onEdit={() => setModal({ mode: "edit", item })}
                    onDelete={() => setDeleteTarget(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* โมดัลเพิ่ม/แก้ — key บังคับ remount ให้ฟอร์มเริ่มค่าตามรายการที่เลือกเสมอ */}
      {modal && (
        <AnalysisFormModal
          key={modal.mode === "edit" ? modal.item.id : "create"}
          title={modal.mode === "edit" ? "แก้ไขลิงก์ผลวิเคราะห์" : "เพิ่มลิงก์ผลวิเคราะห์"}
          init={
            modal.mode === "edit"
              ? {
                  period: modal.item.period,
                  category: modal.item.category,
                  year: modal.item.year,
                  month: modal.item.month,
                  week: modal.item.week ?? 1,
                  url: modal.item.url,
                  title: modal.item.title ?? "",
                  note: modal.item.note ?? "",
                }
              : modal.init
          }
          onClose={() => setModal(null)}
          onSave={(v) =>
            modal.mode === "edit" ? saveEdit(modal.item, v) : saveNew(v)
          }
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบลิงก์ผลวิเคราะห์"
        message={
          deleteTarget
            ? `ลบ "${displayTitle(deleteTarget)}" (${
                deleteTarget.period === "monthly"
                  ? "รายเดือน"
                  : `W${deleteTarget.week}`
              } ${monthLabel(deleteTarget.year, deleteTarget.month)}) ออกจากคลัง? ลิงก์ต้นทางใน Canva ไม่ถูกลบ`
            : ""
        }
        onConfirm={() => {
          if (deleteTarget) void removeItem(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ---------- แถวลิงก์หนึ่งรายการ — ทั้งแถวเป็นลิงก์เปิดแท็บใหม่ ---------- */

function AnalysisRow({
  item,
  isAdmin,
  onEdit,
  onDelete,
}: {
  item: AnalysisLinkRow;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = ANALYSIS_CATEGORIES[item.category];
  const monthly = item.period === "monthly";
  return (
    <div className="flex items-stretch gap-1.5">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className={`group flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md ${
          monthly
            ? "border-amber-200/80 bg-amber-50/70 hover:border-amber-300"
            : "border-white/80 bg-white/85 hover:border-brand-300"
        }`}
      >
        {/* ป้ายช่วงเวลา — รู้ทันทีว่า W ไหน หรือสรุปทั้งเดือน */}
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold ${
            monthly
              ? "bg-gradient-to-b from-amber-400 to-amber-500 text-[10px] text-white shadow-sm"
              : "bg-brand-50 text-sm text-brand-700"
          }`}
        >
          {monthly ? "เดือน" : `W${item.week}`}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-800">
            {displayTitle(item)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-400">
            <span
              className={`inline-flex rounded-full px-1.5 py-px text-[10px] font-semibold ${cat.chip}`}
            >
              {cat.label}
            </span>
            <span className="truncate">
              {monthly ? "สรุปรายเดือน" : `สัปดาห์ที่ ${item.week}`}
              {item.note ? ` · ${item.note}` : ""}
            </span>
          </p>
        </div>
        <ExternalLink
          size={16}
          className="shrink-0 text-stone-300 transition-colors group-hover:text-brand-500"
        />
      </a>
      {isAdmin && (
        <div className="flex shrink-0 flex-col justify-center gap-0.5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onEdit}
            title="แก้ไข"
            aria-label={`แก้ไข ${displayTitle(item)}`}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white/70 hover:text-brand-700 max-sm:h-11 max-sm:w-11"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="ลบ"
            aria-label={`ลบ ${displayTitle(item)}`}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 max-sm:h-11 max-sm:w-11"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- โมดัลเพิ่ม/แก้ลิงก์ (admin) ---------- */

/** ปีในตัวเลือก — ครอบคลุมปีก่อน/หน้า และปีของรายการที่กำลังแก้ (ข้อมูลเก่า) */
function yearOptions(current: number, selected: number): number[] {
  const set = new Set([current - 1, current, current + 1, selected]);
  return [...set].sort((a, b) => b - a);
}

function AnalysisFormModal({
  title,
  init,
  onClose,
  onSave,
}: {
  title: string;
  init: FormValue;
  onClose: () => void;
  /** คืน error message ถ้าบันทึกไม่ผ่าน — null = สำเร็จ (โมดัลปิดเอง) */
  onSave: (v: FormValue) => Promise<string | null>;
}) {
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!v.url.trim()) {
      setErr("วางลิงก์ Canva ก่อนบันทึก");
      return;
    }
    setBusy(true);
    setErr(null);
    const result = await onSave(v);
    setBusy(false);
    if (result) setErr(result);
    else onClose();
  };

  const segBtn = (active: boolean) =>
    `cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "border-brand-400 bg-brand-50 text-brand-700"
        : "border-stone-200 bg-white text-stone-500 hover:border-brand-200 hover:text-brand-600"
    }`;

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* ช่วงเวลา: รายสัปดาห์ / รายเดือน */}
        <div>
          <Label>ช่วงเวลา</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={segBtn(v.period === "weekly")}
              onClick={() => setV((c) => ({ ...c, period: "weekly" }))}
            >
              รายสัปดาห์
            </button>
            <button
              type="button"
              className={segBtn(v.period === "monthly")}
              onClick={() => setV((c) => ({ ...c, period: "monthly" }))}
            >
              รายเดือน (สรุปทั้งเดือน)
            </button>
          </div>
        </div>

        {/* เดือน + ปี (พ.ศ.) */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="analysis-month">เดือน</Label>
            <Select
              id="analysis-month"
              value={v.month}
              onChange={(e) =>
                setV((c) => ({ ...c, month: Number(e.target.value) }))
              }
            >
              {THAI_MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {String(i + 1).padStart(2, "0")} — {name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="analysis-year">ปี (พ.ศ.)</Label>
            <Select
              id="analysis-year"
              value={v.year}
              onChange={(e) =>
                setV((c) => ({ ...c, year: Number(e.target.value) }))
              }
            >
              {yearOptions(init.year, v.year).map((y) => (
                <option key={y} value={y}>
                  {y + 543}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* สัปดาห์ที่ — เฉพาะรายสัปดาห์ */}
        {v.period === "weekly" && (
          <div>
            <Label>สัปดาห์ที่</Label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((w) => (
                <button
                  key={w}
                  type="button"
                  className={segBtn(v.week === w)}
                  onClick={() => setV((c) => ({ ...c, week: w }))}
                >
                  W{w}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* หมวด */}
        <div>
          <Label>หมวด</Label>
          <div className="flex flex-wrap gap-2">
            {ANALYSIS_CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                className={segBtn(v.category === cat)}
                onClick={() => setV((c) => ({ ...c, category: cat }))}
              >
                {ANALYSIS_CATEGORIES[cat].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="analysis-url">ลิงก์ Canva</Label>
          <Input
            id="analysis-url"
            type="url"
            inputMode="url"
            placeholder="วางลิงก์ เช่น https://www.canva.com/design/..."
            value={v.url}
            onChange={(e) => setV((c) => ({ ...c, url: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="analysis-title">ชื่อกำกับ (เว้นว่างได้)</Label>
          <Input
            id="analysis-title"
            placeholder={`เช่น ผลวิเคราะห์ ${ANALYSIS_CATEGORIES[v.category].label}${
              v.period === "weekly" ? ` W${v.week}` : " ทั้งเดือน"
            }`}
            value={v.title}
            onChange={(e) => setV((c) => ({ ...c, title: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="analysis-note">หมายเหตุถึงทีม (เว้นว่างได้)</Label>
          <Textarea
            id="analysis-note"
            rows={2}
            placeholder="เช่น สัปดาห์นี้ตัวอย่างที่ดีคือคลิปรีวิว Botox ดูโครงเรื่องหน้า 3"
            value={v.note}
            onChange={(e) => setV((c) => ({ ...c, note: e.target.value }))}
          />
        </div>

        {err && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
            {err}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            บันทึก
          </Button>
        </div>
      </div>
    </Modal>
  );
}
