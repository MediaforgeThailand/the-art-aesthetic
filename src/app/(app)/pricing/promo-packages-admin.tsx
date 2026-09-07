"use client";

import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  PRICE_GROUP_ORDER,
  PRICE_GROUPS,
  PROMO_CATEGORY_ORDER,
  PROMO_ENDING_SOON_DAYS,
  comparePromoCategories,
  sortPriceGroups,
} from "@/lib/constants";
import { formatNumber, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  PriceGroup,
  PromoPackageKind,
  PromoPackageWithItems,
} from "@/lib/types";

type ItemDraft = {
  item_name: string;
  qty: string;
  unit: string;
  unit_price: string;
};

type Draft = {
  name: string;
  category: string;
  groups: PriceGroup[];
  kind: PromoPackageKind;
  sale_price: string;
  full_price: string;
  starts_on: string;
  ends_on: string;
  note: string;
  active: boolean;
  items: ItemDraft[];
};

const emptyDraft: Draft = {
  name: "",
  category: "",
  groups: [],
  kind: "promo",
  sale_price: "",
  full_price: "",
  starts_on: "",
  ends_on: "",
  note: "",
  active: true,
  items: [],
};

function toDraft(p: PromoPackageWithItems): Draft {
  return {
    name: p.name,
    category: p.category,
    groups: sortPriceGroups(p.groups),
    kind: p.kind,
    sale_price: String(p.sale_price ?? ""),
    full_price: p.full_price === null ? "" : String(p.full_price),
    starts_on: p.starts_on ?? "",
    ends_on: p.ends_on ?? "",
    note: p.note ?? "",
    active: p.active,
    items: [...p.items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        item_name: i.item_name,
        qty: String(i.qty),
        unit: i.unit ?? "",
        unit_price: i.unit_price === null ? "" : String(i.unit_price),
      })),
  };
}

/** ส่วนลดเทียบราคาเต็ม — null = คิดไม่ได้/ไม่ได้ลด (กติกาเดียวกับหน้าสาธารณะ) */
function pctOff(sale: number, full: number | null): number | null {
  if (!full || full <= 0) return null;
  const pct = Math.round((1 - sale / full) * 100);
  return pct >= 1 ? pct : null;
}

function daysTo(end: string, today: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(today).getTime()) / 86400000
  );
}

/* ---------- ช่องเลือกกลุ่มหัตถการ ---------- */

function GroupPicker({
  value,
  onChange,
}: {
  value: PriceGroup[];
  onChange: (next: PriceGroup[]) => void;
}) {
  return (
    <div>
      <Label className="!mb-1">กลุ่มหัตถการ * (เลือกได้มากกว่า 1)</Label>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {PRICE_GROUP_ORDER.map((g) => {
          const on = value.includes(g);
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  sortPriceGroups(
                    on ? value.filter((x) => x !== g) : [...value, g]
                  )
                )
              }
              className={`cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors max-sm:min-h-11 ${
                on
                  ? "border-brand-400 bg-brand-50"
                  : "border-stone-200 bg-white hover:border-brand-200 hover:bg-brand-50/40"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-stone-300 bg-white"
                  }`}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                {PRICE_GROUPS[g].label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- ตัวแก้ "ได้อะไรบ้าง" ---------- */

function ContentEditor({
  list,
  onChange,
}: {
  list: ItemDraft[];
  onChange: (next: ItemDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<ItemDraft>) =>
    onChange(list.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="!mb-0">ได้อะไรบ้าง (แสดงในป๊อปอัพหน้าเว็บ)</Label>
        <button
          type="button"
          onClick={() =>
            onChange([...list, { item_name: "", qty: "1", unit: "ครั้ง", unit_price: "" }])
          }
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <Plus size={12} />
          เพิ่มหัตถการ
        </button>
      </div>
      <div className="space-y-1.5">
        {list.map((o, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <Input
              value={o.qty}
              onChange={(e) => set(i, { qty: e.target.value })}
              placeholder="จำนวน"
              className="!w-20 !px-2 !py-1.5 !text-xs"
            />
            <Input
              value={o.unit}
              onChange={(e) => set(i, { unit: e.target.value })}
              placeholder="หน่วย"
              className="!w-24 !px-2 !py-1.5 !text-xs"
            />
            <Input
              value={o.item_name}
              onChange={(e) => set(i, { item_name: e.target.value })}
              placeholder="ชื่อหัตถการ"
              className="!w-64 !px-2 !py-1.5 !text-xs"
            />
            <Input
              value={o.unit_price}
              onChange={(e) => set(i, { unit_price: e.target.value })}
              placeholder="ราคาเต็ม/หน่วย"
              className="!w-32 !px-2 !py-1.5 !text-xs"
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              title="ลบแถวนี้"
              aria-label="ลบแถวนี้"
              className="cursor-pointer rounded p-1 text-stone-300 hover:text-rose-500"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- ส่วนจัดการโปร (หลังบ้าน) ---------- */

type StatusFilter = "all" | "shown" | "hidden" | "ending" | "expired";

export function PromoPackagesAdmin({
  packages,
  loadError,
}: {
  packages: PromoPackageWithItems[];
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PromoPackageWithItems | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PromoPackageWithItems | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(packages.map((p) => p.category))].sort(comparePromoCategories),
    [packages]
  );

  const expiredCount = useMemo(
    () => packages.filter((p) => p.ends_on !== null && p.ends_on < today).length,
    [packages, today]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (status === "shown" && !p.active) return false;
      if (status === "hidden" && p.active) return false;
      if (status === "expired" && !(p.ends_on !== null && p.ends_on < today))
        return false;
      if (
        status === "ending" &&
        !(
          p.ends_on !== null &&
          p.ends_on >= today &&
          daysTo(p.ends_on, today) <= PROMO_ENDING_SOON_DAYS
        )
      )
        return false;
      if (q === "") return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.items.some((i) => i.item_name.toLowerCase().includes(q))
      );
    });
  }, [packages, search, category, status, today]);

  const openAdd = () => {
    setEditing(null);
    setDraft({ ...emptyDraft, starts_on: today, category: categories[0] ?? "" });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (p: PromoPackageWithItems) => {
    setEditing(p);
    setDraft(toDraft(p));
    setError(null);
    setModalOpen(true);
  };

  /** ซ่อน/แสดงบนหน้าสาธารณะ — ปุ่มเดียวจบ ไม่ต้องเปิดโมดัล */
  const toggleActive = async (p: PromoPackageWithItems) => {
    setBusyId(p.id);
    const { error: e } = await supabase
      .from("promo_packages")
      .update({ active: !p.active })
      .eq("id", p.id);
    setBusyId(null);
    if (e) {
      setError(`อัปเดตไม่สำเร็จ: ${e.message}`);
      return;
    }
    router.refresh();
  };

  const save = async () => {
    if (draft.name.trim() === "" || draft.category.trim() === "") {
      setError("ต้องกรอกชื่อโปรและหมวด");
      return;
    }
    if (draft.groups.length === 0) {
      setError(
        "ต้องเลือกกลุ่มหัตถการอย่างน้อย 1 กลุ่ม — หน้า Price List แบ่งแท็บตามกลุ่มนี้ ถ้าไม่เลือกโปรจะไม่โผล่ในแท็บไหนเลย"
      );
      return;
    }
    const sale = Number(draft.sale_price.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(sale) || sale <= 0) {
      setError("ราคาโปรต้องเป็นตัวเลขมากกว่า 0");
      return;
    }
    setSaving(true);
    setError(null);
    const fullRaw = draft.full_price.replace(/[^0-9.]/g, "");
    const payload = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      groups: draft.groups,
      kind: draft.kind,
      sale_price: sale,
      full_price: fullRaw === "" ? null : Number(fullRaw),
      starts_on: draft.starts_on === "" ? null : draft.starts_on,
      ends_on: draft.ends_on === "" ? null : draft.ends_on,
      note: draft.note.trim() === "" ? null : draft.note.trim(),
      active: draft.active,
      // updated_at ไม่ต้องส่ง — DB trigger ตั้งให้เอง (migration 0071)
    };

    let packageId = editing?.id ?? null;
    if (editing) {
      const { error: e } = await supabase
        .from("promo_packages")
        .update(payload)
        .eq("id", editing.id);
      if (e) {
        setSaving(false);
        setError(`บันทึกไม่สำเร็จ: ${e.message}`);
        return;
      }
    } else {
      // โปรที่ทีมสร้างเองไม่มีรหัสจากระบบ POS — ออกรหัส MANUAL- ให้ไม่ชนกับของนำเข้า
      const { data, error: e } = await supabase
        .from("promo_packages")
        .insert({
          ...payload,
          sku: `MANUAL-${Date.now()}`,
          sort: Math.max(0, ...packages.map((p) => p.sort)) + 1,
        })
        .select("id")
        .single();
      if (e || !data) {
        setSaving(false);
        setError(`บันทึกไม่สำเร็จ: ${e?.message ?? "ไม่ทราบสาเหตุ"}`);
        return;
      }
      packageId = data.id;
    }

    // รายการ "ได้อะไรบ้าง" — เขียนทับทั้งชุด (ง่ายและลำดับไม่เพี้ยน)
    if (packageId) {
      const rows = draft.items
        .filter((i) => i.item_name.trim() !== "")
        .map((i, idx) => ({
          package_id: packageId,
          item_name: i.item_name.trim(),
          qty: Number(i.qty.replace(/[^0-9.]/g, "")) || 1,
          unit: i.unit.trim() === "" ? null : i.unit.trim(),
          unit_price:
            i.unit_price.replace(/[^0-9.]/g, "") === ""
              ? null
              : Number(i.unit_price.replace(/[^0-9.]/g, "")),
          position: idx,
        }));
      const { error: delErr } = await supabase
        .from("promo_package_items")
        .delete()
        .eq("package_id", packageId);
      if (!delErr && rows.length > 0) {
        await supabase.from("promo_package_items").insert(rows);
      }
    }

    setSaving(false);
    setModalOpen(false);
    router.refresh();
  };

  const doDelete = async () => {
    if (!deleting) return;
    // ลูกใน promo_package_items ถูกลบตาม (FK on delete cascade)
    const { error: e } = await supabase
      .from("promo_packages")
      .delete()
      .eq("id", deleting.id);
    if (e) setError(`ลบไม่สำเร็จ: ${e.message}`);
    router.refresh();
  };

  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <Sparkles size={16} className="text-brand-600" />
          โปรที่ขึ้นหน้า Price List
          <span className="text-xs font-normal text-stone-400">
            {packages.length} รายการ
          </span>
        </h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            href="/price-list"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <ExternalLink size={14} />
            เปิดหน้า Price List
          </a>
          <Button onClick={openAdd}>
            <Plus size={15} />
            เพิ่มโปร
          </Button>
        </div>
      </div>

      {expiredCount > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            มี {expiredCount} โปรที่เลยวันหมดเขตแล้วและยังแสดงบนหน้าเว็บ —
            กดตัวกรอง &quot;หมดเขตแล้ว&quot; เพื่อไล่ปิด
          </span>
        </div>
      )}

      {loadError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError} — รายการที่แสดงอาจไม่ครบ
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {error}
        </div>
      )}

      {/* ตัวกรอง */}
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา"
            className="!pl-9"
          />
        </div>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="!w-auto"
        >
          <option value="all">ทุกหมวด</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="!w-auto"
        >
          <option value="all">ทุกสถานะ</option>
          <option value="shown">แสดงบนเว็บ</option>
          <option value="hidden">ซ่อนอยู่</option>
          <option value="ending">ใกล้หมดเขต ({PROMO_ENDING_SOON_DAYS} วัน)</option>
          <option value="expired">หมดเขตแล้ว</option>
        </Select>
      </div>

      <p className="mb-2 text-xs text-stone-400">
        แสดง {filtered.length} จาก {packages.length} รายการ
      </p>

      {/* ลิสต์ */}
      <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
        {filtered.map((p) => {
          const pct = pctOff(p.sale_price, p.full_price);
          const expired = p.ends_on !== null && p.ends_on < today;
          const ending =
            !expired &&
            p.ends_on !== null &&
            daysTo(p.ends_on, today) <= PROMO_ENDING_SOON_DAYS;
          return (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 ${
                p.active ? "bg-white" : "bg-stone-50"
              }`}
            >
              <div className="min-w-52 flex-1">
                <p
                  className={`text-[13px] font-medium leading-5 ${
                    p.active ? "text-stone-800" : "text-stone-400"
                  }`}
                >
                  {p.name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-400">
                  <span>{p.category}</span>
                  <span>·</span>
                  <span className="font-mono">{p.sku}</span>
                  {p.items.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Package size={10} />
                        {p.items.length} หัตถการ
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {sortPriceGroups(p.groups).map((g) => (
                  <span
                    key={g}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRICE_GROUPS[g].chip}`}
                  >
                    {PRICE_GROUPS[g].label}
                  </span>
                ))}
                {p.kind === "promo" && (
                  <Badge className="bg-brand-100 text-brand-800">โปรช่วงเวลา</Badge>
                )}
              </div>

              <div className="flex min-w-40 items-baseline justify-end gap-2">
                {p.full_price !== null && pct !== null && (
                  <span className="text-xs text-stone-400 line-through">
                    {formatNumber(p.full_price)}
                  </span>
                )}
                <span className="tabular-nums text-sm font-bold text-brand-600">
                  {formatNumber(p.sale_price)}.-
                </span>
                {pct !== null && (
                  <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                    -{pct}%
                  </span>
                )}
              </div>

              <div className="min-w-32 text-right text-[11px]">
                {expired ? (
                  <span className="font-semibold text-rose-600">
                    หมดเขต {p.ends_on}
                  </span>
                ) : ending ? (
                  <span className="font-semibold text-amber-600">
                    ถึง {p.ends_on}
                  </span>
                ) : (
                  <span className="text-stone-400">
                    {p.ends_on ? `ถึง ${p.ends_on}` : "ไม่ระบุวันหมดเขต"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleActive(p)}
                  disabled={busyId === p.id}
                  title={p.active ? "ซ่อนจากหน้าเว็บ" : "แสดงบนหน้าเว็บ"}
                  aria-label={p.active ? "ซ่อนจากหน้าเว็บ" : "แสดงบนหน้าเว็บ"}
                  className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
                    p.active
                      ? "text-emerald-600 hover:bg-emerald-50"
                      : "text-stone-400 hover:bg-stone-100"
                  }`}
                >
                  {p.active ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  title="แก้ไข"
                  aria-label="แก้ไข"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(p)}
                  title="ลบ"
                  aria-label="ลบ"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-stone-400">
            ไม่พบโปรที่ตรงกับตัวกรอง
          </p>
        )}
      </div>

      {/* โมดัลแก้ไข */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "แก้ไขโปร" : "เพิ่มโปร"}
        wide
      >
        <div className="space-y-3">
          <div>
            <Label>ชื่อโปร *</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>หมวด * (ใช้จัดกลุ่มบนหน้าเว็บ)</Label>
              <Input
                list="promo-categories"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
              <datalist id="promo-categories">
                {[...new Set([...PROMO_CATEGORY_ORDER, ...categories])].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>ชนิด</Label>
              <Select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as PromoPackageKind })
                }
              >
                <option value="promo">โปรช่วงเวลา (มีวันหมดเขตจริง)</option>
                <option value="package">แพ็กเกจประจำ (คอร์ส/ขายตลอดปี)</option>
              </Select>
            </div>
          </div>

          <GroupPicker
            value={draft.groups}
            onChange={(groups) => setDraft({ ...draft, groups })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>ราคาโปร * (บาท)</Label>
              <Input
                value={draft.sale_price}
                onChange={(e) => setDraft({ ...draft, sale_price: e.target.value })}
              />
            </div>
            <div>
              <Label>ราคาเต็ม (บาท) — ใช้คิด % ส่วนลด</Label>
              <Input
                value={draft.full_price}
                onChange={(e) => setDraft({ ...draft, full_price: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>เริ่มขาย</Label>
              <Input
                type="date"
                value={draft.starts_on}
                onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
              />
            </div>
            <div>
              <Label>วันหมดเขต (เว้นว่าง = ขายต่อเนื่อง)</Label>
              <Input
                type="date"
                value={draft.ends_on}
                onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
              />
            </div>
          </div>

          <ContentEditor
            list={draft.items}
            onChange={(items) => setDraft({ ...draft, items })}
          />

          <div>
            <Label>หมายเหตุ (ใช้ในหลังบ้าน ไม่แสดงบนหน้าเว็บ)</Label>
            <Textarea
              rows={2}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-brand-600"
            />
            แสดงบนหน้า Price List สาธารณะ
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="ลบโปรนี้?"
        message={`"${deleting?.name ?? ""}" จะถูกลบออกจากระบบถาวร พร้อมรายการหัตถการในโปร — ถ้าแค่อยากเอาออกจากหน้าเว็บชั่วคราว ให้กดปุ่มรูปตาเพื่อซ่อนแทน`}
        confirmLabel="ลบถาวร"
        onConfirm={doDelete}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
