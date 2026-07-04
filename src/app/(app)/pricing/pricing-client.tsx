"use client";

import {
  BadgePercent,
  CalendarClock,
  CalendarRange,
  PiggyBank,
  Search,
  Tags,
  UserCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DemoBadge, DemoBanner } from "@/components/demo-badge";
import {
  Badge,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
} from "@/components/ui";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import type { PricePromotionRow } from "@/lib/types";

type StatusKey = "upcoming" | "active" | "expiring" | "expired";

const STATUS_INFO: Record<
  StatusKey,
  { label: string; chip: string; dot: string }
> = {
  upcoming: {
    label: "ยังไม่เริ่ม",
    chip: "bg-sky-50 text-sky-700 border border-sky-200",
    dot: "bg-sky-500",
  },
  active: {
    label: "ใช้ได้",
    chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
  },
  expiring: {
    label: "ใกล้หมดเขต",
    chip: "bg-amber-50 text-amber-700 border border-amber-200",
    dot: "bg-amber-500",
  },
  expired: {
    label: "หมดเขตแล้ว",
    chip: "bg-rose-50 text-rose-600 border border-rose-200",
    dot: "bg-rose-500",
  },
};

/** สถานะโปร ณ วันนี้ — ยังไม่เริ่ม / ใช้ได้ / ใกล้หมดเขต (เหลือ ≤ 14 วัน) / หมดเขตแล้ว */
function promoStatus(
  startsOn: string | null,
  expiresOn: string | null,
  today: string
): { key: StatusKey; daysLeft: number | null } {
  if (startsOn && startsOn > today) return { key: "upcoming", daysLeft: null };
  if (!expiresOn) return { key: "active", daysLeft: null };
  if (expiresOn < today) return { key: "expired", daysLeft: null };
  const days = Math.round(
    (new Date(expiresOn).getTime() - new Date(today).getTime()) / 86400000
  );
  return { key: days <= 14 ? "expiring" : "active", daysLeft: days };
}

function StatusChip({
  status,
  daysLeft,
}: {
  status: StatusKey;
  daysLeft: number | null;
}) {
  const info = STATUS_INFO[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${info.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
      {info.label}
      {status === "expiring" && daysLeft !== null && (
        <span className="font-normal">· อีก {daysLeft} วัน</span>
      )}
    </span>
  );
}

type PromoWithStatus = PricePromotionRow & {
  status: { key: StatusKey; daysLeft: number | null };
  discount: number;
};

/** ภาพโปรโมชันแบรนด์ที่ระบบ generate — ใช้เมื่อโปรยังไม่มีรูปจริง (image_url) */
function PromoVisual({ promo }: { promo: PromoWithStatus }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-pink-400 via-pink-500 to-rose-500 p-6 text-white">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-14 -left-10 h-48 w-48 rounded-full bg-rose-700/30 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm font-bold tracking-[0.3em]">
              THE ART
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-white/75">
              Aesthetic Promotion · {promo.category}
            </p>
          </div>
          {promo.discount >= 0.5 && (
            <div className="flex h-16 w-16 shrink-0 rotate-6 flex-col items-center justify-center rounded-full bg-white text-pink-600 shadow-lg">
              <span className="text-lg font-extrabold leading-none">
                -{promo.discount.toFixed(0)}%
              </span>
              <span className="text-[9px] font-bold tracking-wide">OFF</span>
            </div>
          )}
        </div>
        <p className="mt-5 font-display text-2xl font-bold leading-snug drop-shadow-sm">
          {promo.item_name}
        </p>
        {promo.detail && (
          <p className="mt-1 text-xs leading-5 text-white/85">{promo.detail}</p>
        )}
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-sm text-white/70 line-through">
            {formatCurrency(promo.normal_price)}
          </span>
          <span className="text-3xl font-extrabold tabular-nums drop-shadow">
            {formatCurrency(promo.promo_price)}
          </span>
        </div>
        <p className="mt-3 text-[11px] text-white/85">
          {promo.expires_on
            ? `ใช้ได้ถึง ${formatDate(promo.expires_on)}`
            : "ไม่มีกำหนดหมดเขต"}
        </p>
      </div>
    </div>
  );
}

/** แถวข้อมูลในการ์ดรายละเอียด */
function DetailStat({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-pink-50/60 px-3 py-2.5 ${className}`}>
      <p className="text-[11px] text-stone-500">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-stone-900">{children}</div>
    </div>
  );
}

export function PricingClient({
  promotions,
  demo,
  loadError,
}: {
  promotions: PricePromotionRow[];
  demo: boolean;
  loadError: string | null;
}) {
  const today = todayISO();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [selected, setSelected] = useState<PromoWithStatus | null>(null);

  const withStatus = useMemo(
    () =>
      promotions.map((p) => ({
        ...p,
        status: promoStatus(p.starts_on, p.expires_on, today),
        discount:
          p.normal_price > 0
            ? ((p.normal_price - p.promo_price) / p.normal_price) * 100
            : 0,
      })),
    [promotions, today]
  );

  const counts = useMemo(() => {
    const c = { upcoming: 0, active: 0, expiring: 0, expired: 0 };
    for (const p of withStatus) c[p.status.key] += 1;
    return c;
  }, [withStatus]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withStatus.filter((p) => {
      if (statusFilter !== "all" && p.status.key !== statusFilter) return false;
      if (q === "") return true;
      return (
        p.item_name.toLowerCase().includes(q) ||
        (p.detail ?? "").toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [withStatus, search, statusFilter]);

  /* จัดกลุ่มตามหมวด — เรียงตามลำดับที่พบ (Botox ก่อน Filler ตามข้อมูล) */
  const byCategory = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const statusChips: { key: "all" | StatusKey; label: string; count: number }[] =
    [
      { key: "all", label: "ทั้งหมด", count: withStatus.length },
      { key: "active", label: "ใช้ได้", count: counts.active },
      { key: "expiring", label: "ใกล้หมดเขต", count: counts.expiring },
      { key: "expired", label: "หมดเขตแล้ว", count: counts.expired },
      // แสดงชิป "ยังไม่เริ่ม" เฉพาะเมื่อมีจริง — ปกติโปรอนุมัติมักเริ่มแล้ว
      ...(counts.upcoming > 0
        ? [{ key: "upcoming" as const, label: "ยังไม่เริ่ม", count: counts.upcoming }]
        : []),
    ];

  return (
    <>
      <PageHeader
        title="Product Pricing"
        description="ตารางราคาโปรโมชันที่อนุมัติแล้ว — ราคาปกติ เทียบราคาโปร พร้อมวันหมดเขต"
      />

      {demo && <DemoBanner onWhat="ราคาโปรโมชัน" />}

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError} — ลองรีเฟรชหน้าอีกครั้ง
        </div>
      )}

      {/* ค้นหา + สถานะ */}
      <div className="mb-4 flex flex-wrap items-center gap-3 animate-fade-in-up">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            type="search"
            placeholder="ค้นหารายการ เช่น Botox, Juvederm..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusChips.map((chip) => {
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatusFilter(chip.key)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.95] ${
                  active
                    ? "bg-gradient-to-b from-pink-500 to-pink-600 text-white shadow-sm"
                    : "border border-pink-200 bg-white/70 text-stone-600 hover:border-pink-300 hover:bg-pink-50"
                }`}
              >
                {chip.label}
                <span className={active ? "opacity-80" : "text-stone-400"}>
                  {" "}
                  ({chip.count})
                </span>
              </button>
            );
          })}
        </div>
        {(search !== "" || statusFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-pink-600"
          >
            <X size={14} />
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {byCategory.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tags size={40} strokeWidth={1.5} />}
            title="ไม่พบโปรโมชันที่ตรงกับตัวกรอง"
            description="ลองเปลี่ยนคำค้นหาหรือสถานะ"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {byCategory.map(([category, items], ci) => (
            <Card
              key={category}
              className="overflow-hidden animate-fade-in-up"
            >
              <div style={{ animationDelay: `${ci * 80}ms` }}>
                {/* หัวหมวดโทนชมพูแบบภาพ price list */}
                <div className="flex items-baseline gap-3 border-b border-pink-100 bg-gradient-to-r from-pink-50/90 to-pink-100/50 px-5 py-4">
                  <h2 className="font-display text-2xl font-bold text-pink-600">
                    {category}
                  </h2>
                  <span className="text-xs text-pink-400">
                    {items.length} รายการ
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-pink-500">
                    <BadgePercent size={13} />
                    โปรที่อนุมัติแล้ว
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-pink-100 bg-pink-50/60 text-left text-xs font-medium text-pink-700">
                        <th className="px-5 py-3">รายการ</th>
                        <th className="px-4 py-3 text-right">
                          ราคาปกติ (Price List)
                        </th>
                        <th className="px-4 py-3 text-right">ราคาโปร</th>
                        <th className="px-4 py-3 text-right">ส่วนลด</th>
                        <th className="px-4 py-3">ใช้ได้ถึง</th>
                        <th className="px-5 py-3">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pink-50">
                      {items.map((p) => {
                        const expired = p.status.key === "expired";
                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelected(p)}
                            title="คลิกเพื่อดูรายละเอียดโปรโมชัน"
                            className={`cursor-pointer transition-colors hover:bg-pink-50/40 ${
                              expired ? "opacity-55" : ""
                            }`}
                          >
                            <td className="max-w-80 px-5 py-3.5">
                              {/* ปุ่มจริงเพื่อให้เปิดรายละเอียดด้วยคีย์บอร์ดได้ (แถวคลิกได้อยู่แล้วสำหรับเมาส์) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(p);
                                }}
                                className="cursor-pointer rounded font-medium text-stone-900 text-left hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                              >
                                {p.item_name}
                              </button>
                              {p.detail && (
                                <p className="mt-0.5 text-xs text-stone-400">
                                  {p.detail}
                                </p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-stone-400 line-through">
                              {formatCurrency(p.normal_price)}
                            </td>
                            <td
                              className={`whitespace-nowrap px-4 py-3.5 text-right text-base font-bold tabular-nums ${
                                expired ? "text-stone-500" : "text-pink-600"
                              }`}
                            >
                              {formatCurrency(p.promo_price)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-right">
                              {p.discount >= 0.5 ? (
                                <Badge className="bg-pink-100 text-pink-700">
                                  -{p.discount.toFixed(0)}%
                                </Badge>
                              ) : (
                                <span className="text-xs text-stone-300">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-stone-600">
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarClock
                                  size={14}
                                  className="text-stone-300"
                                />
                                {p.expires_on
                                  ? formatDate(p.expires_on)
                                  : "ไม่มีกำหนด"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-5 py-3.5">
                              <StatusChip
                                status={p.status.key}
                                daysLeft={p.status.daysLeft}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ))}

          <p className="text-xs text-stone-400">
            * ราคาโปรโมชันที่แสดงคือรายการที่ผ่านการอนุมัติแล้ว —
            คลิกที่รายการเพื่อดูรายละเอียดและภาพโปร
          </p>
        </div>
      )}

      {/* pop-up card รายละเอียดโปร */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="รายละเอียดโปรโมชัน"
      >
        {selected && (
          <div className="space-y-4">
            {/* ภาพโปร — รูปจริงถ้ามี ไม่มีก็ใช้ภาพแบรนด์ที่ระบบ generate */}
            {selected.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.image_url}
                alt={`ภาพโปรโมชัน ${selected.item_name}`}
                className="max-h-72 w-full rounded-xl object-cover"
              />
            ) : (
              <PromoVisual promo={selected} />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-pink-100 text-pink-700">
                {selected.category}
              </Badge>
              <StatusChip
                status={selected.status.key}
                daysLeft={selected.status.daysLeft}
              />
              {selected.note === "demo" && <DemoBadge />}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <DetailStat label="ราคาปกติ (Price List)">
                <span className="tabular-nums text-stone-400 line-through">
                  {formatCurrency(selected.normal_price)}
                </span>
              </DetailStat>
              <DetailStat label="ราคาโปร">
                <span className="text-base font-bold tabular-nums text-pink-600">
                  {formatCurrency(selected.promo_price)}
                </span>
              </DetailStat>
              <DetailStat label="ส่วนลด">
                {selected.discount >= 0.5 ? (
                  <span className="tabular-nums">
                    -{selected.discount.toFixed(0)}%
                  </span>
                ) : (
                  "—"
                )}
              </DetailStat>
              <DetailStat label="ประหยัด">
                <span className="inline-flex items-center gap-1.5 tabular-nums text-emerald-600">
                  <PiggyBank size={15} />
                  {formatCurrency(selected.normal_price - selected.promo_price)}
                </span>
              </DetailStat>
            </div>

            <div className="space-y-2 rounded-lg border border-pink-100 bg-white/60 px-3 py-2.5 text-sm">
              <p className="flex items-center gap-2 text-stone-700">
                <CalendarRange size={15} className="shrink-0 text-pink-400" />
                ระยะเวลาโปรโมชัน:{" "}
                <span className="font-medium">
                  {selected.starts_on ? formatDate(selected.starts_on) : "—"} –{" "}
                  {selected.expires_on
                    ? formatDate(selected.expires_on)
                    : "ไม่มีกำหนด"}
                </span>
                {selected.status.key === "expiring" &&
                  selected.status.daysLeft !== null && (
                    <span className="text-xs font-medium text-amber-600">
                      (เหลืออีก {selected.status.daysLeft} วัน)
                    </span>
                  )}
                {selected.status.key === "expired" && (
                  <span className="text-xs font-medium text-rose-500">
                    (หมดเขตแล้ว)
                  </span>
                )}
              </p>
              {selected.approved_by && (
                <p className="flex items-center gap-2 text-stone-700">
                  <UserCheck size={15} className="shrink-0 text-pink-400" />
                  อนุมัติโดย:{" "}
                  <span className="font-medium">{selected.approved_by}</span>
                </p>
              )}
              {selected.detail && (
                <p className="flex items-start gap-2 text-stone-700">
                  <BadgePercent
                    size={15}
                    className="mt-0.5 shrink-0 text-pink-400"
                  />
                  เงื่อนไข: <span>{selected.detail}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
