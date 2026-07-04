"use client";

import { ChevronDown, Clock3, Gift, Search, Sparkles, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { formatDate, todayISO } from "@/lib/format";
import { MEMO_COMPANY } from "@/lib/influ-constants";
import type { PriceItemRow, PriceOffer } from "@/lib/types";

/* สถานะข้อเสนอ ณ วันนี้ — ใช้กติกาเดียวกับหลังบ้าน (ใกล้หมดเขต = เหลือ ≤ 14 วัน) */
type OfferState = "upcoming" | "active" | "ending" | "expired";

function offerState(o: PriceOffer, today: string): OfferState {
  if (today < o.start) return "upcoming";
  if (today > o.end) return "expired";
  const daysLeft = Math.round(
    (new Date(o.end).getTime() - new Date(today).getTime()) / 86400000
  );
  return daysLeft <= 14 ? "ending" : "active";
}

/** วันที่แบบสั้นสำหรับป้ายโปร เช่น "31 มี.ค. 69" */
function shortThaiDate(iso: string): string {
  return formatDate(iso).replace(/ (\d{4})$/, (_, y) => ` ${y.slice(2)}`);
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const updatedAt = useMemo(() => {
    let max = "";
    for (const i of items) if (i.updated_at > max) max = i.updated_at;
    return max ? formatDate(max) : "-";
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.benefits ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

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
                    expanded={expandedId === item.id}
                    onToggle={() =>
                      setExpandedId((cur) => (cur === item.id ? null : item.id))
                    }
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
    </div>
  );
}

/* ---------- แถวรายการ ---------- */

function PriceRow({
  item,
  today,
  striped,
  expanded,
  onToggle,
}: {
  item: PriceItemRow;
  today: string;
  striped: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  // ข้อเสนอที่ยังไม่หมดเขต (ซ่อนอันที่หมดแล้ว — ราคากลับไปเป็นราคาปกติเอง)
  const promos = item.promos
    .map((o) => ({ ...o, state: offerState(o, today) }))
    .filter((o) => o.state !== "expired");
  const courses = item.courses
    .map((o) => ({ ...o, state: offerState(o, today) }))
    .filter((o) => o.state !== "expired");

  const activePromo = promos.find(
    (o) =>
      (o.state === "active" || o.state === "ending") &&
      !o.label.includes("แถม")
  );
  const b1g1 = promos.find(
    (o) => (o.state === "active" || o.state === "ending") && o.label.includes("แถม")
  );
  const hasDetail = !!(item.benefits || item.process);
  const showNormalStruck =
    item.price_normal != null &&
    activePromo != null &&
    activePromo.price !== item.price_normal;

  return (
    <div
      className={`${striped ? "bg-white/45" : "bg-white/70"} border-b border-stone-100/80 last:border-b-0`}
    >
      <div
        role={hasDetail ? "button" : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onClick={hasDetail ? onToggle : undefined}
        onKeyDown={(e) => {
          if (hasDetail && e.key === "Enter") onToggle();
        }}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:px-4 ${
          hasDetail ? "cursor-pointer hover:bg-brand-50/40" : ""
        }`}
      >
        {/* ชื่อ */}
        <div className="flex min-w-0 flex-1 basis-52 items-center gap-1.5">
          <p className="min-w-0 whitespace-pre-line text-[13px] font-medium leading-5 text-stone-800">
            {item.name}
          </p>
          {hasDetail && (
            <ChevronDown
              size={13}
              className={`shrink-0 text-stone-300 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          )}
        </div>

        {/* ราคา */}
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          {showNormalStruck && (
            <span className="text-xs text-stone-400 line-through">
              {item.price_normal}.-
            </span>
          )}
          <span
            className={`text-[15px] font-bold tabular-nums ${
              activePromo ? "text-brand-600" : "text-stone-800"
            }`}
          >
            {(activePromo?.price ?? item.price_normal ?? "-") + ".-"}
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
              <Gift size={10} />1 แถม 1 {b1g1.price}.- ถึง {shortThaiDate(b1g1.end)}
            </span>
          )}
          {courses.map((c, i) => (
            <span
              key={i}
              title={`${c.label} ${c.price}.- (${shortThaiDate(c.start)} - ${shortThaiDate(c.end)})`}
              className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700"
            >
              {c.label} {c.price}.-
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

      {/* รายละเอียด (กดชื่อเพื่อเปิด) */}
      {expanded && hasDetail && (
        <div className="space-y-2 border-t border-dashed border-stone-200/80 bg-white/60 px-4 py-3 text-xs leading-5 text-stone-600 animate-fade-in sm:px-5">
          {item.benefits && (
            <div>
              <p className="mb-0.5 font-semibold text-brand-700">ประโยชน์</p>
              <p className="whitespace-pre-line">{item.benefits}</p>
            </div>
          )}
          {item.process && (
            <div>
              <p className="mb-0.5 font-semibold text-brand-700">ขั้นตอน</p>
              <p className="whitespace-pre-line">{item.process}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
