"use client";

import {
  Check,
  ExternalLink,
  ListPlus,
  Pencil,
  Plus,
  Search,
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
  Textarea,
} from "@/components/ui";
import {
  PRICE_GROUP_ORDER,
  PRICE_GROUPS,
  sortPriceGroups,
} from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { PriceGroup, PriceItemRow, PriceOffer } from "@/lib/types";

type OfferDraft = { label: string; price: string; start: string; end: string };

type ItemDraft = {
  category: string;
  name: string;
  item_no: string;
  benefits: string;
  process: string;
  /** คำค้นเพิ่มเติม/ชื่อเรียกปากเปล่า — ใช้ค้นหา ไม่แสดงบนเมนู (migration 0059) */
  search_aliases: string;
  price_normal: string;
  promos: OfferDraft[];
  courses: OfferDraft[];
  /** กลุ่มหัตถการ — ต้องมีอย่างน้อย 1 (DB บังคับด้วย constraint เช่นกัน) */
  groups: PriceGroup[];
  /** แสดงบนหน้าสาธารณะหรือไม่ — false = ซ่อนจาก /price-list แต่ยังอยู่ในหลังบ้าน */
  active: boolean;
};

const emptyDraft: ItemDraft = {
  category: "",
  name: "",
  item_no: "",
  benefits: "",
  process: "",
  search_aliases: "",
  price_normal: "",
  promos: [],
  courses: [],
  groups: [],
  active: true,
};

function toDraft(item: PriceItemRow): ItemDraft {
  return {
    category: item.category,
    name: item.name,
    item_no: item.item_no != null ? String(item.item_no) : "",
    benefits: item.benefits ?? "",
    process: item.process ?? "",
    search_aliases: item.search_aliases ?? "",
    price_normal: item.price_normal ?? "",
    promos: item.promos.map((o) => ({ ...o })),
    courses: item.courses.map((o) => ({ ...o })),
    groups: sortPriceGroups(item.groups),
    active: item.active,
  };
}

/* ---------- ช่องเลือกกลุ่มหัตถการ (ติ๊กได้หลายกลุ่ม) ---------- */

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
              className={`cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
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
              <span className="mt-0.5 block text-[11px] leading-4 text-stone-400">
                {PRICE_GROUPS[g].hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- แถวแก้ไขข้อเสนอ (โปร/คอร์ส) ---------- */

/** ช่วงวันตั้งต้นของข้อเสนอใหม่ = วันนี้ ถึงสิ้นปีปัจจุบัน (เวลาไทย)
    ห้าม hardcode ปี — ของเดิมฝัง 2026 ไว้ พอขึ้นปีใหม่โปรที่เพิ่งสร้างจะหมดเขตทันที
    แล้วหายจากหน้า /price-list ที่ซ่อนโปรหมดอายุ โดยไม่มีอะไรบอกผู้ใช้ */
function defaultOfferRange(): { start: string; end: string } {
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  // สิ้นปีปัจจุบัน — แต่ถ้าเหลือน้อยกว่า ~2 เดือน ให้ยืดไปสิ้นปีหน้าแทน
  // ไม่งั้นโปรที่สร้างช่วงปลายปีจะได้ช่วงเวลาสั้นจู๋ (เช่น 20–31 ธ.ค.) โดยไม่ตั้งใจ
  const endOfYear = `${year}-12-31`;
  const daysLeft =
    (new Date(`${endOfYear}T00:00:00`).getTime() -
      new Date(`${today}T00:00:00`).getTime()) /
    86400000;
  return { start: today, end: daysLeft < 60 ? `${year + 1}-12-31` : endOfYear };
}

function OfferEditor({
  title,
  hint,
  list,
  onChange,
}: {
  title: string;
  hint: string;
  list: OfferDraft[];
  onChange: (next: OfferDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<OfferDraft>) =>
    onChange(list.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="!mb-0">{title}</Label>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...list,
              {
                label: hint,
                price: "",
                ...defaultOfferRange(),
              },
            ])
          }
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <Plus size={12} />
          เพิ่ม
        </button>
      </div>
      <div className="space-y-1.5">
        {list.map((o, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <Input
              value={o.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder="ชื่อ"
              className="!w-36 !px-2 !py-1.5 !text-xs"
            />
            <Input
              value={o.price}
              onChange={(e) => set(i, { price: e.target.value })}
              placeholder="ราคา"
              className="!w-28 !px-2 !py-1.5 !text-xs"
            />
            <Input
              type="date"
              value={o.start}
              onChange={(e) => set(i, { start: e.target.value })}
              className="!w-36 !px-2 !py-1.5 !text-xs"
            />
            <span className="text-xs text-stone-400">ถึง</span>
            <Input
              type="date"
              value={o.end}
              onChange={(e) => set(i, { end: e.target.value })}
              className="!w-36 !px-2 !py-1.5 !text-xs"
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

/* ---------- ส่วนจัดการ Price List (หลังบ้าน) ---------- */

export function PriceItemsAdmin({
  items,
  loadError,
}: {
  items: PriceItemRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PriceItemRow | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PriceItemRow | null>(null);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category))],
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.search_aliases ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const openAdd = () => {
    setEditing(null);
    setDraft({
      ...emptyDraft,
      promos: [],
      courses: [],
    });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (item: PriceItemRow) => {
    setEditing(item);
    setDraft(toDraft(item));
    setError(null);
    setModalOpen(true);
  };

  const cleanOffers = (list: OfferDraft[]): PriceOffer[] =>
    list
      .filter((o) => o.price.trim() !== "" && o.label.trim() !== "")
      .map((o) => ({
        label: o.label.trim(),
        price: o.price.trim(),
        start: o.start,
        end: o.end,
      }));

  const save = async () => {
    if (draft.category.trim() === "" || draft.name.trim() === "") {
      setError("ต้องกรอกหมวดหมู่และชื่อรายการ");
      return;
    }
    if (draft.groups.length === 0) {
      setError(
        "ต้องเลือกกลุ่มหัตถการอย่างน้อย 1 กลุ่ม — หน้า Price List แบ่งแท็บตามกลุ่มนี้ ถ้าไม่เลือกรายการจะไม่โผล่ที่ไหนเลย"
      );
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      category: draft.category.trim(),
      name: draft.name.trim(),
      item_no: draft.item_no.trim() === "" ? null : Number(draft.item_no),
      benefits: draft.benefits.trim() === "" ? null : draft.benefits.trim(),
      process: draft.process.trim() === "" ? null : draft.process.trim(),
      search_aliases:
        draft.search_aliases.trim() === "" ? null : draft.search_aliases.trim(),
      price_normal:
        draft.price_normal.trim() === "" ? null : draft.price_normal.trim(),
      promos: cleanOffers(draft.promos),
      courses: cleanOffers(draft.courses),
      groups: draft.groups,
      active: draft.active,
      // updated_at ไม่ต้องส่ง — DB trigger ตั้งให้เอง (migration 0023)
    };
    // sort ถัดไปของหมวด: ต่อท้ายหมวดนั้น (ถ้ามี) หรือท้ายสุดของทั้งลิสต์
    const nextSort = (category: string) =>
      Math.max(
        0,
        ...items.filter((i) => i.category === category).map((i) => i.sort),
        ...(items.some((i) => i.category === category)
          ? []
          : items.map((i) => i.sort))
      ) + 1;
    const q = editing
      ? supabase
          .from("price_items")
          .update({
            ...payload,
            // ย้ายหมวด → คำนวณ sort ใหม่ให้ต่อท้ายหมวดปลายทาง
            // (หน้าเว็บจัดกลุ่มหมวดตามลำดับ sort — ถ้าคง sort เดิมไว้ รายการจะไปแทรกกลางหมวดอื่นแล้วลำดับหมวดทั้งหน้าเพี้ยน)
            ...(payload.category !== editing.category
              ? { sort: nextSort(payload.category) }
              : {}),
          })
          .eq("id", editing.id)
      : supabase.from("price_items").insert({
          ...payload,
          // รายการใหม่ต่อท้ายหมวดเดิม (ถ้ามี) หรือท้ายสุด
          sort: nextSort(payload.category),
        });
    const { error: e } = await q;
    setSaving(false);
    if (e) {
      setError(`บันทึกไม่สำเร็จ: ${e.message}`);
      return;
    }
    setModalOpen(false);
    router.refresh();
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error: e } = await supabase
      .from("price_items")
      .delete()
      .eq("id", deleting.id);
    if (e) setError(`ลบไม่สำเร็จ: ${e.message}`);
    router.refresh();
  };

  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <ListPlus size={16} className="text-brand-600" />
          รายการราคา (Price List สาธารณะ)
          <span className="text-xs font-normal text-stone-400">
            {items.length} รายการ
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
            เพิ่มรายการ
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError} — รายการที่แสดงอาจไม่ครบ
          ลองรีเฟรชหน้าอีกครั้ง
        </div>
      )}

      <div className="relative mb-3 max-w-sm">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
        <Input
          type="search"
          placeholder="ค้นหา"
          className="!pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      <div className="max-h-96 overflow-auto rounded-lg border border-stone-200/70">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="sticky top-0 bg-cream-soft/95 backdrop-blur">
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="px-3 py-2 font-medium">หมวด</th>
              <th className="px-3 py-2 font-medium">รายการ</th>
              <th className="px-3 py-2 font-medium">กลุ่ม</th>
              <th className="px-3 py-2 text-right font-medium">ราคาปกติ</th>
              <th className="px-3 py-2 font-medium">โปร/คอร์ส</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white/60">
            {filtered.map((item) => (
              <tr
                key={item.id}
                className={`hover:bg-brand-50/40 ${item.active ? "" : "opacity-50"}`}
              >
                <td className="max-w-36 truncate px-3 py-2 text-xs text-stone-500">
                  {item.category.split(":")[0].trim()}
                </td>
                <td className="max-w-72 px-3 py-2">
                  <p className="truncate font-medium text-stone-800">
                    {item.name}
                  </p>
                  {!item.active && (
                    <Badge className="mt-0.5 bg-stone-200 text-stone-600">
                      ซ่อนจากหน้าเว็บ
                    </Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="flex gap-1">
                    {sortPriceGroups(item.groups).map((g) => (
                      <span
                        key={g}
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRICE_GROUPS[g].chip}`}
                      >
                        {PRICE_GROUPS[g].label}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-stone-700">
                  {item.price_normal ?? "-"}
                </td>
                <td className="px-3 py-2 text-xs text-stone-500">
                  {item.promos.length > 0 && `โปร ${item.promos.length}`}
                  {item.promos.length > 0 && item.courses.length > 0 && " · "}
                  {item.courses.length > 0 && `คอร์ส ${item.courses.length}`}
                  {item.promos.length === 0 &&
                    item.courses.length === 0 &&
                    "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    title="แก้ไข"
                    aria-label="แก้ไข"
                    className="cursor-pointer rounded p-1.5 text-stone-400 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(item)}
                    title="ลบ"
                    aria-label="ลบ"
                    className="cursor-pointer rounded p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-stone-400">
                  ไม่พบรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* modal เพิ่ม/แก้ไข */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "แก้ไขรายการราคา" : "เพิ่มรายการราคา"}
        wide
      >
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pi-category">หมวดหมู่ *</Label>
              <Input
                id="pi-category"
                list="pi-categories"
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              />
              <datalist id="pi-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="pi-no">ลำดับที่ (No.)</Label>
              <Input
                id="pi-no"
                type="number"
                value={draft.item_no}
                onChange={(e) => setDraft({ ...draft, item_no: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="pi-name">ชื่อรายการ *</Label>
            <Textarea
              id="pi-name"
              rows={2}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <GroupPicker
            value={draft.groups}
            onChange={(groups) => setDraft({ ...draft, groups })}
          />

          <div>
            <Label htmlFor="pi-normal">ราคาปกติ</Label>
            <Input
              id="pi-normal"
              value={draft.price_normal}
              onChange={(e) =>
                setDraft({ ...draft, price_normal: e.target.value })
              }
            />
          </div>

          <OfferEditor
            title="โปรโมชัน"
            hint="โปรโมชัน"
            list={draft.promos}
            onChange={(promos) => setDraft({ ...draft, promos })}
          />
          <OfferEditor
            title="ราคาคอร์ส"
            hint="คอร์ส 5 ครั้ง"
            list={draft.courses}
            onChange={(courses) => setDraft({ ...draft, courses })}
          />

          <div>
            <Label htmlFor="pi-benefits">ประโยชน์ (Benefits)</Label>
            <Textarea
              id="pi-benefits"
              rows={3}
              value={draft.benefits}
              onChange={(e) => setDraft({ ...draft, benefits: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="pi-process">ขั้นตอน (Process)</Label>
            <Textarea
              id="pi-process"
              rows={3}
              value={draft.process}
              onChange={(e) => setDraft({ ...draft, process: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="pi-aliases">
              คำค้นเพิ่มเติม (ชื่อเรียกอื่น — ช่วยให้ค้นหาเจอ)
            </Label>
            <Input
              id="pi-aliases"
              value={draft.search_aliases}
              onChange={(e) =>
                setDraft({ ...draft, search_aliases: e.target.value })
              }
            />
          </div>

          {/* ซ่อน/แสดงจากหน้าสาธารณะ (คอลัมน์ active) */}
          <div>
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
                className="h-4 w-4 accent-brand-600"
              />
              แสดงบนหน้า Price List สาธารณะ
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-stone-100 pt-3">
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => setModalOpen(false)}
          >
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {editing ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="ลบรายการราคา"
        message={`ลบ "${deleting?.name ?? ""}" ออกจาก Price List ใช่หรือไม่? รายการจะหายจากหน้าสาธารณะทันที`}
        onConfirm={() => void doDelete()}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
