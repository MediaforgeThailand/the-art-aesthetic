"use client";

import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Gift,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { formatDate, formatDateBangkok, todayISO } from "@/lib/format";
import { MEMO_COMPANY } from "@/lib/influ-constants";
import type { PriceItemRow, PriceOffer } from "@/lib/types";

/* สถานะข้อเสนอ ณ วันนี้ — ใช้กติกาเดียวกับหลังบ้าน (ใกล้หมดเขต = เหลือ ≤ 14 วัน) */
type OfferState = "upcoming" | "active" | "ending" | "expired";

function offerState(o: PriceOffer, today: string): OfferState {
  if (o.start && today < o.start) return "upcoming";
  if (!o.end) return "active"; // ไม่ระบุวันหมดเขต = เปิดตลอด ไม่ใช่หมดเขต
  if (today > o.end) return "expired";
  const daysLeft = Math.round(
    (new Date(o.end).getTime() - new Date(today).getTime()) / 86400000
  );
  return daysLeft <= 14 ? "ending" : "active";
}

/** โปร "ที่ใช้ได้ตอนนี้" = state active/ending และไม่ใช่โปรแถม (1 แถม 1)
 *  — กติกาเดียวกันทั้งราคาที่โชว์ในแถวลิสต์ (PriceRow) และแถวที่เน้นเด่นในตาราง popup */
function isCurrentPromo(o: {
  label: string;
  state: OfferState | null;
}): boolean {
  return (
    (o.state === "active" || o.state === "ending") && !o.label.includes("แถม")
  );
}

/** วันที่แบบสั้นสำหรับป้ายโปร เช่น "31 มี.ค. 69" */
function shortThaiDate(iso: string): string {
  return formatDate(iso).replace(/ (\d{4})$/, (_, y) => ` ${y.slice(2)}`);
}

/** แสดงราคา: เติม ".-" เฉพาะส่วนที่เป็นตัวเลขล้วน — คงข้อความ/หน่วยไว้ตามไฟล์
 *  เช่น "3,745 / เส้น" → "3,745.- / เส้น", "3,900 / 6,900 / 6,900" → "3,900.- / 6,900.- / 6,900.-" */
function fmtPrice(price: string): string {
  return price
    .split("/")
    .map((seg) => {
      const t = seg.trim();
      return /^[\d,]+$/.test(t) ? `${t}.-` : t;
    })
    .join(" / ");
}

export function PriceListClient({
  items,
  loadError,
}: {
  items: PriceItemRow[];
  loadError: string | null;
}) {
  const today = todayISO();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PriceItemRow | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // popup เปิดอยู่: Esc ปิด + ล็อค scroll พื้นหลัง
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  const updatedAt = useMemo(() => {
    let max = "";
    for (const i of items) if (i.updated_at > max) max = i.updated_at;
    // updated_at เป็น timestamptz — ต้องตรึงโซนไทย ไม่งั้น SSR/CSR แสดงคนละวัน (hydration mismatch)
    return max ? formatDateBangkok(max) : "-";
  }, [items]);

  // รายการโปรล้วน (ไม่มีราคาปกติ) ที่โปร/คอร์สหมดเขตครบทุกอัน — ซ่อนทั้งแถว
  // ไม่งั้นจะค้างเป็นราคา "-" บนหน้าสาธารณะหลังโปรจบ
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          i.price_normal != null ||
          i.promos.some((o) => offerState(o, today) !== "expired") ||
          i.courses.some((o) => offerState(o, today) !== "expired")
      ),
    [items, today]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return visible;
    return visible.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.benefits ?? "").toLowerCase().includes(q)
    );
  }, [visible, search]);

  const categories = useMemo(() => {
    const seen = new Map<string, PriceItemRow[]>();
    for (const i of filtered) {
      if (!seen.has(i.category)) seen.set(i.category, []);
      seen.get(i.category)!.push(i);
    }
    return [...seen.entries()];
  }, [filtered]);

  const scrollTo = (cat: string) =>
    sectionRefs.current[cat]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

  return (
    <div className="min-h-screen pb-16">
      {/* หัวแบรนด์ */}
      <header className="bg-gradient-to-b from-brand-600 via-brand-500 to-brand-400 px-4 pb-14 pt-8 text-center text-cream">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
          <LogoMark className="h-14 w-14 shadow-lg" />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide sm:text-4xl">
              PRICE LIST
            </h1>
            <p className="mt-0.5 text-sm font-medium uppercase tracking-[0.28em] opacity-90">
              & Promotion
            </p>
          </div>
          <p className="text-xs opacity-90">
            The ART Aesthetic — Plastic Surgery Hospital
          </p>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] backdrop-blur">
            <Clock3 size={12} />
            อัปเดตล่าสุด {updatedAt}
          </p>
        </div>
      </header>

      {/* แถบค้นหา + หมวด (sticky) */}
      <div className="sticky top-0 z-20 -mt-7 px-3 sm:px-6">
        <div className="glass mx-auto max-w-5xl rounded-2xl px-3 py-3 shadow-lg">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาหัตถการ เช่น Botox, Filler, Pico..."
              className="w-full rounded-xl border border-stone-200/80 bg-white/90 py-2.5 pl-9 pr-9 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {search !== "" && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map(([cat, list]) => (
              <button
                key={cat}
                type="button"
                onClick={() => scrollTo(cat)}
                className="shrink-0 cursor-pointer rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
              >
                {cat.split(":")[0].trim()}
                <span className="ml-1 text-[10px] text-stone-400">
                  {list.length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError && (
        <p className="mx-auto mt-6 max-w-5xl px-4 text-center text-sm text-rose-600">
          โหลดข้อมูลไม่สำเร็จ: {loadError} — ลองรีเฟรชหน้าอีกครั้ง
        </p>
      )}

      {!loadError && filtered.length === 0 && (
        <p className="mx-auto mt-10 max-w-5xl px-4 text-center text-sm text-stone-500">
          ไม่พบรายการที่ค้นหา — ลองคำอื่น เช่น ชื่อหัตถการหรือหมวดหมู่
        </p>
      )}

      {/* รายการตามหมวด */}
      <main className="mx-auto mt-6 max-w-5xl space-y-6 px-3 sm:px-6">
        {categories.map(([cat, list]) => {
          const [catTitle, catSub] = cat.split(/:(.+)/);
          return (
            <section
              key={cat}
              ref={(el) => {
                sectionRefs.current[cat] = el;
              }}
              className="scroll-mt-32"
            >
              <div className="mb-2 flex items-baseline gap-2 border-b-2 border-brand-200 px-1 pb-1.5">
                <h2 className="font-display text-lg font-bold text-brand-800">
                  {catTitle.trim()}
                </h2>
                {catSub && (
                  <p className="min-w-0 truncate text-xs text-stone-500">
                    {catSub.trim()}
                  </p>
                )}
              </div>

              <div className="glass overflow-hidden rounded-xl">
                {list.map((item, idx) => (
                  <PriceRow
                    key={item.id}
                    item={item}
                    today={today}
                    striped={idx % 2 === 1}
                    onOpen={() => setSelected(item)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-center text-[11px] leading-5 text-stone-500">
        <p>*เงื่อนไขเป็นไปตามที่คลินิกกำหนด ราคาอาจเปลี่ยนแปลงตามช่วงโปรโมชัน</p>
        <p className="mt-1">
          {MEMO_COMPANY.name} · {MEMO_COMPANY.address} · {MEMO_COMPANY.phone}
        </p>
      </footer>

      {selected && (
        <ItemDetailModal
          item={selected}
          today={today}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ---------- popup รายละเอียดสินค้า ---------- */

/** แถวราคาในตาราง popup — เฉพาะข้อเสนอที่ยังไม่หมดเขต (โปรหมดเขตถูกซ่อน ไม่แสดงเลย) */
type OfferRow = {
  label: string;
  start: string | null;
  end: string | null;
  price: string;
  state: OfferState | null; // null = ราคาปกติ (ไม่มีสถานะ)
  isB1g1: boolean;
};

function StateChip({ state }: { state: OfferState }) {
  const style =
    state === "active"
      ? "bg-emerald-100 text-emerald-700"
      : state === "ending"
        ? "bg-amber-100 text-amber-700"
        : state === "upcoming"
          ? "bg-sky-100 text-sky-700"
          : "bg-stone-200 text-stone-500";
  const label =
    state === "active"
      ? "ใช้ได้ตอนนี้"
      : state === "ending"
        ? "ใกล้หมดเขต"
        : state === "upcoming"
          ? "ยังไม่เริ่ม"
          : "หมดเขตแล้ว";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {label}
    </span>
  );
}

function ItemDetailModal({
  item,
  today,
  onClose,
}: {
  item: PriceItemRow;
  today: string;
  onClose: () => void;
}) {
  // ตารางราคา: ราคาปกติ → โปรโมชัน → 1แถม1 → คอร์ส — เฉพาะช่วงที่ยังไม่หมดเขต
  // (โปรหมดเขตไม่แสดง — ราคากลับไปเป็นราคาปกติเอง เหมือนกติกาในลิสต์หน้าแรก)
  const rows: OfferRow[] = [];
  if (item.price_normal != null) {
    rows.push({
      label: "ราคาปกติ (Price List)",
      start: "2026-01-01",
      end: "2026-12-31",
      price: item.price_normal,
      state: null,
      isB1g1: false,
    });
  }
  const promoRows: OfferRow[] = [];
  for (const o of item.promos) {
    const state = offerState(o, today);
    if (state === "expired") continue;
    const row: OfferRow = {
      label: o.label,
      start: o.start,
      end: o.end,
      price: o.price,
      state,
      isB1g1: o.label.includes("แถม"),
    };
    rows.push(row);
    promoRows.push(row);
  }
  for (const c of item.courses) {
    const state = offerState(c, today);
    if (state === "expired") continue;
    rows.push({
      label: c.label,
      start: c.start,
      end: c.end,
      price: c.price,
      state,
      isB1g1: false,
    });
  }

  // แถวที่เน้นเด่น = โปรที่ใช้ได้ ณ วันนี้แถวแรก — ใช้ isCurrentPromo กติกาเดียวกับ
  // ราคาที่โชว์ในแถวลิสต์ (PriceRow) เพื่อให้ popup ไฮไลต์ราคาเดียวกับที่ลิสต์แสดง
  // ถ้าไม่มีโปรที่ใช้ได้เลย ค่อยไฮไลต์แถวราคาปกติ
  const currentPromoRow = promoRows.find(isCurrentPromo) ?? null;
  const isCurrentRow = (r: OfferRow) =>
    currentPromoRow !== null ? r === currentPromoRow : r.state === null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-brand-900/40 backdrop-blur-sm animate-fade-in sm:items-start sm:p-6 sm:pt-14"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-fade-in-up sm:rounded-2xl sm:animate-scale-in"
      >
        {/* หัว popup: ปุ่มย้อนกลับ */}
        <div className="flex items-center gap-2 border-b border-stone-100 bg-gradient-to-r from-brand-50 to-cream-soft px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-white/80 active:scale-95"
          >
            <ArrowLeft size={16} />
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={onClose}
            title="ปิด"
            aria-label="ปิด"
            className="ml-auto cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-white/80 hover:text-stone-700 active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* ชื่อ + หมวด */}
          <p className="text-xs font-medium text-brand-600">
            {item.category.split(":")[0].trim()}
          </p>
          <h2 className="mt-0.5 whitespace-pre-line font-display text-xl font-bold leading-snug text-stone-900">
            {item.name}
          </h2>

          {/* ตารางราคา — โครงเดียวกับไฟล์ Price List (เฉพาะช่วงที่ยังไม่หมดเขต, แถวโปรที่ใช้ได้ถูกเน้นเด่น) */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-300">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-brand-500 to-brand-400 text-cream">
                  <th className="border-b border-r border-brand-300/50 px-3 py-2.5 text-left text-[13px] font-semibold">
                    รายการราคา
                  </th>
                  <th className="border-b border-r border-brand-300/50 px-3 py-2.5 text-left text-[13px] font-semibold">
                    ช่วงเวลา
                  </th>
                  <th className="border-b border-brand-300/50 px-3 py-2.5 text-right text-[13px] font-semibold">
                    ราคา
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const current = isCurrentRow(r);
                  return (
                    <tr
                      key={i}
                      className={
                        current
                          ? "bg-gradient-to-r from-brand-100/90 via-brand-50 to-amber-50/70"
                          : i % 2 === 1
                            ? "bg-cream-soft/40"
                            : "bg-white"
                      }
                    >
                      <td
                        className={`border-b border-r border-stone-200 px-3 py-2.5 ${
                          current
                            ? "font-bold text-brand-800"
                            : "font-medium text-stone-800"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {current && r.state !== null && (
                            <Sparkles
                              size={14}
                              className="shrink-0 text-brand-500"
                            />
                          )}
                          {r.isB1g1 && (
                            <Gift size={14} className="shrink-0 text-pink-600" />
                          )}
                          {r.label}
                        </span>
                      </td>
                      <td className="border-b border-r border-stone-200 px-3 py-2.5 text-stone-600">
                        <span className="mr-2 whitespace-nowrap">
                          {r.start && r.end
                            ? `${shortThaiDate(r.start)} – ${shortThaiDate(r.end)}`
                            : "-"}
                        </span>
                        {r.state !== null &&
                          (current ? (
                            <span
                              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
                                r.state === "ending"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-gradient-to-r from-brand-800 to-brand-700 text-cream"
                              }`}
                            >
                              <Sparkles size={11} />
                              {r.state === "ending"
                                ? "โปรตอนนี้ · ใกล้หมดเขต"
                                : "โปรตอนนี้"}
                            </span>
                          ) : (
                            <StateChip state={r.state} />
                          ))}
                        {current && r.state === null && (
                          <StateChip state="active" />
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap border-b border-stone-200 px-3 py-2.5 text-right tabular-nums ${
                          current
                            ? "text-lg font-extrabold text-brand-600"
                            : "text-base font-bold text-stone-900"
                        }`}
                      >
                        {fmtPrice(r.price)}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-4 text-center text-stone-400"
                    >
                      ไม่มีข้อมูลราคา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* รายละเอียด */}
          {item.benefits && (
            <div className="mt-5">
              <p className="mb-1.5 border-l-4 border-brand-400 pl-2 text-sm font-bold text-brand-700">
                ประโยชน์
              </p>
              <p className="whitespace-pre-line text-[14px] leading-7 text-stone-700">
                {item.benefits}
              </p>
            </div>
          )}
          {item.process && (
            <div className="mt-5">
              <p className="mb-1.5 border-l-4 border-brand-400 pl-2 text-sm font-bold text-brand-700">
                ขั้นตอนการทำ
              </p>
              <p className="whitespace-pre-line text-[14px] leading-7 text-stone-700">
                {item.process}
              </p>
            </div>
          )}

          <p className="mt-5 text-[11px] text-stone-400">
            *เงื่อนไขเป็นไปตามที่คลินิกกำหนด สอบถามเพิ่มเติม {MEMO_COMPANY.phone}
          </p>
        </div>

        {/* ปุ่มย้อนกลับล่าง — กดสะดวกบนมือถือ */}
        <div className="border-t border-stone-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 py-2.5 text-sm font-medium text-cream shadow-sm transition-all hover:from-brand-600 hover:to-brand-700 active:scale-[0.98]"
          >
            <ArrowLeft size={16} />
            ย้อนกลับไปหน้า Price List
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- แถวรายการ ---------- */

function PriceRow({
  item,
  today,
  striped,
  onOpen,
}: {
  item: PriceItemRow;
  today: string;
  striped: boolean;
  onOpen: () => void;
}) {
  // ข้อเสนอที่ยังไม่หมดเขต (ซ่อนอันที่หมดแล้ว — ราคากลับไปเป็นราคาปกติเอง)
  const promos = item.promos
    .map((o) => ({ ...o, state: offerState(o, today) }))
    .filter((o) => o.state !== "expired");
  const courses = item.courses
    .map((o) => ({ ...o, state: offerState(o, today) }))
    .filter((o) => o.state !== "expired");

  // โปรที่ใช้ได้ตอนนี้ — กติกาเดียวกับแถวไฮไลต์ใน popup (isCurrentPromo)
  const activePromo = promos.find((o) => isCurrentPromo(o));
  const b1g1 = promos.find(
    (o) => (o.state === "active" || o.state === "ending") && o.label.includes("แถม")
  );
  const showNormalStruck =
    item.price_normal != null &&
    activePromo != null &&
    activePromo.price !== item.price_normal;

  return (
    <div
      className={`${striped ? "bg-white/45" : "bg-white/70"} border-b border-stone-100/80 last:border-b-0`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`ดูรายละเอียด ${item.name}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 transition-colors hover:bg-brand-50/40 sm:px-4"
      >
        {/* ชื่อ (แพ็กเกจหลายบรรทัด → ย่อเป็นบรรทัดเดียวในลิสต์, กดดูเต็มใน popup) */}
        <div className="flex min-w-0 flex-1 basis-52 items-center gap-1.5">
          <p className="line-clamp-2 min-w-0 text-[13px] font-medium leading-5 text-stone-800">
            {item.name.replace(/\n/g, " ")}
          </p>
          <ChevronRight size={13} className="shrink-0 text-stone-300" />
        </div>

        {/* ราคา */}
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          {showNormalStruck && (
            <span className="text-xs text-stone-400 line-through">
              {fmtPrice(item.price_normal!)}
            </span>
          )}
          <span
            className={`text-[15px] font-bold tabular-nums ${
              activePromo ? "text-brand-600" : "text-stone-800"
            }`}
          >
            {activePromo
              ? fmtPrice(activePromo.price)
              : item.price_normal != null
                ? fmtPrice(item.price_normal)
                : "-"}
          </span>
        </div>

        {/* ป้ายสถานะ + คอร์ส */}
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          {activePromo && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activePromo.state === "ending"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              <Sparkles size={10} />
              {activePromo.state === "ending" ? "ใกล้หมดเขต" : "โปรโมชัน"} ถึง{" "}
              {shortThaiDate(activePromo.end)}
            </span>
          )}
          {b1g1 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold text-pink-700">
              <Gift size={10} />1 แถม 1 {fmtPrice(b1g1.price)} ถึง{" "}
              {shortThaiDate(b1g1.end)}
            </span>
          )}
          {courses.map((c, i) => (
            <span
              key={i}
              title={`${c.label} ${fmtPrice(c.price)} (${shortThaiDate(c.start)} - ${shortThaiDate(c.end)})`}
              className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700"
            >
              {c.label} {fmtPrice(c.price)}
              {c.state === "ending" && (
                <span className="ml-1 text-amber-600">ใกล้หมดเขต</span>
              )}
              {c.state === "upcoming" && (
                <span className="ml-1 text-stone-400">
                  เริ่ม {shortThaiDate(c.start)}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

    </div>
  );
}
