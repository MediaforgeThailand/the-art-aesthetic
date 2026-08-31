"use client";

/**
 * ตัวกรองมาตรฐานของ **ทุกหน้าในระบบ Influencer** — ปุ่มเดียว กดแล้วแผงลอยขึ้นมา
 *
 * ผู้ใช้ 2026-08-29: "ในทุกๆหน้าที่มี filter ผมอยากให้ filter เป็นปุ่มเดียวก่อน
 * ที่กดแล้วแสดงตัว setting ลอยขึ้นมา ทั้งหมดเลย ทุกหน้าเพื่อความ clean" และ
 * "ตั้งค่าให้ filter ทุกหน้าเป็นงานของฉันเป็น default แต่ในหมวด Filter ทำให้มีปุ่ม
 * เลือกให้ save การตั้งค่าที่ set อยู่เป็น default"
 *
 * โครงนี้ถอดแบบมาจาก `HuntFilterButton` (บอร์ด Hunting, 2026-08-20) ซึ่งพิสูจน์แล้วว่าใช้ได้
 * แล้วยกขึ้นมาเป็นของกลาง + เพิ่ม "บันทึกเป็นค่าเริ่มต้น" ให้ทุกหน้าได้เหมือนกันหมด
 *
 * **กติกาที่ต้องรักษา (อย่าแก้ให้หลุด):**
 * 1. เมนูลอยผ่าน `useAnchoredMenu` + portal `z-[60]` เสมอ — ห้ามเขียน listener เอง
 *    (คีย์บอร์ดมือถือยิง resize แล้วเมนูจะหุบก่อนกดเลือกได้ — บทเรียน DoctorSelect)
 * 2. **ชิปสรุปตัวกรองที่เปิดอยู่ต้องเห็นข้างปุ่มเสมอ และปลดทีละอันได้**
 *    (บทเรียน my-tasks: ตัวกรองที่ซ่อนอยู่ในเมนูทำให้คนคิดว่าข้อมูลหาย)
 * 3. ค่าที่บันทึกไว้อ่านผ่าน **`useSyncExternalStore`** (snapshot ฝั่ง server = null)
 *    ห้ามอ่าน localStorage ใน initializer ของ useState หรือระหว่าง render — HTML ฝั่ง
 *    server กับ client จะไม่ตรงกันตอน hydrate
 * 4. เป้านิ้ว ≥44px บนจอเล็ก (`max-sm:min-h-11`) ทุกปุ่มในแผง
 */

import { Check, RotateCcw, SlidersHorizontal, Star, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  menuBox,
  useAnchoredMenu,
  type MenuBox,
} from "@/components/anchored-menu";

/* ---------- ค่าเริ่มต้นที่ผู้ใช้บันทึกเอง ---------- */

const PREFIX = "influ-filters";

function storageKeyOf(page: string, userId: string | null): string {
  return `${PREFIX}:${page}:${userId ?? "anon"}`;
}

/**
 * localStorage คือ "external store" ของ React — อ่านผ่าน `useSyncExternalStore`
 * ทำให้รอบ hydrate ได้ค่าเดียวกับที่ server render (snapshot ฝั่ง server = null)
 * แล้วค่อยสลับเป็นค่าที่ผู้ใช้บันทึกไว้ โดย **ไม่ต้อง setState ใน effect**
 * (ซึ่งทั้งผิดกฎ react-hooks/set-state-in-effect และทำให้ทุกหน้า render ซ้ำอีกรอบ)
 */
const savedListeners = new Set<() => void>();

function subscribeSaved(cb: () => void): () => void {
  savedListeners.add(cb);
  return () => {
    savedListeners.delete(cb);
  };
}

/** บอกทุก hook ว่าค่าที่บันทึกไว้เพิ่งเปลี่ยน (กดบันทึก/ล้างค่าเริ่มต้น) */
function emitSaved() {
  for (const cb of savedListeners) cb();
}

function readSaved(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // localStorage ใช้ไม่ได้ (โหมดส่วนตัว/ถูกบล็อค) — ถือว่าไม่เคยบันทึก
    return null;
  }
}

export type InfluFilterApi<T> = {
  filters: T;
  setFilters: (next: T | ((cur: T) => T)) => void;
  /** แก้บางฟิลด์ — น้ำตาลกว่าการเขียน `setFilters({ ...filters, ... })` ทุกที่ */
  patch: (part: Partial<T>) => void;
  /** ค่าเริ่มต้นที่ใช้อยู่จริง (ที่ผู้ใช้บันทึกไว้ ถ้าไม่มีก็ค่าโรงงาน) */
  defaults: T;
  /** true = ผู้ใช้เคยกด "บันทึกเป็นค่าเริ่มต้น" ของหน้านี้ */
  hasSaved: boolean;
  /** ตัวกรองตอนนี้ต่างจากค่าเริ่มต้นไหม */
  dirty: boolean;
  /** บันทึกค่าที่ตั้งอยู่ตอนนี้เป็นค่าเริ่มต้นของหน้านี้ (เฉพาะเครื่อง+บัญชีนี้) */
  saveAsDefault: () => void;
  /** ลืมค่าที่บันทึกไว้ แล้วกลับไปใช้ค่าโรงงาน */
  clearSaved: () => void;
  /** กลับไปที่ค่าเริ่มต้น (ที่บันทึกไว้ ถ้าไม่มีก็ค่าโรงงาน) */
  reset: () => void;
};

/**
 * ตัวกรองของหน้าหนึ่ง + ค่าเริ่มต้นที่ผู้ใช้บันทึกเอง (เก็บในเครื่อง แยกตามบัญชี)
 *
 * `factory` = ค่าโรงงานของหน้านั้น — **ทุกหน้าที่มีตัวกรอง "ผู้รับผิดชอบ" ต้องตั้งเป็น
 * "งานของฉัน" ตรงนี้** (คำสั่งผู้ใช้ 2026-08-29) แล้วใครอยากเห็นทั้งทีมค่อยกดบันทึกเอง
 */
export function useInfluFilters<T extends object>({
  page,
  userId,
  factory,
}: {
  page: string;
  userId: string | null;
  /** **ต้องเป็นค่าคงที่ระดับโมดูล** (เช่น DEFAULT_BOARD_FILTERS) — hook ใช้ identity ของมัน
      เป็น dependency ถ้าสร้าง object ใหม่ทุก render ค่าที่บันทึกไว้จะถูกอ่านทับซ้ำๆ */
  factory: T;
}): InfluFilterApi<T> {
  const key = storageKeyOf(page, userId);

  const rawSaved = useSyncExternalStore(
    subscribeSaved,
    () => readSaved(key),
    () => null // ฝั่ง server ไม่มี localStorage — render ด้วยค่าโรงงานเสมอ
  );

  const saved = useMemo<T | null>(() => {
    if (!rawSaved) return null;
    try {
      // เติมค่าโรงงานก่อน — ตัวกรองที่เพิ่มทีหลังจะได้ไม่เป็น undefined ในค่าที่บันทึกไว้เดิม
      return { ...factory, ...JSON.parse(rawSaved) } as T;
    } catch {
      return null;
    }
  }, [rawSaved, factory]);

  /** null = ยังไม่แตะตัวกรองรอบนี้ (ใช้ค่าเริ่มต้นอยู่) */
  const [override, setOverride] = useState<T | null>(null);

  const defaults = saved ?? factory;
  const filters = override ?? defaults;

  const setFilters = useCallback(
    (next: T | ((cur: T) => T)) =>
      setOverride((cur) =>
        typeof next === "function"
          ? (next as (cur: T) => T)(cur ?? defaults)
          : next
      ),
    [defaults]
  );

  const patch = useCallback(
    (part: Partial<T>) => setFilters((cur) => ({ ...cur, ...part })),
    [setFilters]
  );

  const saveAsDefault = useCallback(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(filters));
    } catch {
      // จำค่าไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — ตัวกรองรอบนี้ยังใช้ต่อได้ตามปกติ
      return;
    }
    setOverride(null); // ค่าที่ตั้งอยู่กลายเป็นค่าเริ่มต้นแล้ว
    emitSaved();
  }, [filters, key]);

  const clearSaved = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // เพิกเฉย
    }
    setOverride(null);
    emitSaved();
  }, [key]);

  const reset = useCallback(() => setOverride(null), []);

  return {
    filters,
    setFilters,
    patch,
    defaults,
    hasSaved: saved !== null,
    dirty: JSON.stringify(filters) !== JSON.stringify(defaults),
    saveAsDefault,
    clearSaved,
    reset,
  };
}

/* ---------- ชิ้นส่วนของแผง ---------- */

/** หัวข้อย่อยในแผงตัวกรอง */
export function FilterSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-stone-100 px-3 py-2.5 first:border-t-0">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {title}
      </p>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-stone-400">{hint}</p>}
    </div>
  );
}

/** ชิปติ๊กเลือกในแผง — ใช้ได้ทั้งแบบเลือกเดียวและหลายค่า */
export function FilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors active:scale-[0.97] max-sm:min-h-11 max-sm:px-3 max-sm:text-sm ${
        active
          ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
      }`}
    >
      {children}
    </button>
  );
}

/** ดาว 1-5 (ใช้ในตัวกรอง Hunting) — วางไว้ที่นี่เพื่อไม่ให้แต่ละหน้าเขียนซ้ำ */
export function StarChips({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterChip active={value === 0} onClick={() => onChange(0)}>
        ทั้งหมด
      </FilterChip>
      {[1, 2, 3, 4, 5].map((n) => (
        <FilterChip key={n} active={value === n} onClick={() => onChange(n)}>
          <Star size={11} className="fill-amber-400 text-amber-400" />
          {n} ขึ้นไป
        </FilterChip>
      ))}
    </div>
  );
}

/** ช่วงวันที่แบบ 2 ช่อง — ใช้ซ้ำในหลายหน้า (ฟอนต์ ≥16px บนจอเล็กตามกติกา iOS) */
export function DateRangeInputs({
  from,
  to,
  onFrom,
  onTo,
  labelFrom = "ตั้งแต่วันที่",
  labelTo = "ถึงวันที่",
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  labelFrom?: string;
  labelTo?: string;
}) {
  const cls =
    "min-w-0 flex-1 rounded-lg border border-stone-300/80 bg-white px-2 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm";
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        aria-label={labelFrom}
        className={cls}
      />
      <span className="shrink-0 text-xs text-stone-400">ถึง</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onTo(e.target.value)}
        aria-label={labelTo}
        className={cls}
      />
    </div>
  );
}

/* ---------- ชิปสรุป ---------- */

export type FilterSummaryChip<T> = {
  key: string;
  label: string;
  /** ค่าตัวกรองหลังกดกากบาทปิดชิปนี้ */
  next: T;
};

/**
 * แถวชิป "กรองอยู่: …" — ต้องอยู่ใต้แถบเครื่องมือของทุกหน้า
 * (ตัวกรองที่ซ่อนอยู่ในเมนูทำให้คนคิดว่าข้อมูลหาย — กติกาข้อ 2 ด้านบน)
 */
export function FilterSummary<T>({
  chips,
  onChange,
  onClear,
}: {
  chips: FilterSummaryChip<T>[];
  onChange: (next: T) => void;
  onClear: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-stone-400">กรองอยู่:</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.next)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 active:scale-[0.97] max-sm:min-h-11 max-sm:px-3 max-sm:text-sm"
        >
          {c.label}
          <X size={12} />
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer text-xs text-stone-500 underline-offset-2 hover:text-brand-700 hover:underline max-sm:min-h-11 max-sm:text-sm"
      >
        ล้างทั้งหมด
      </button>
    </div>
  );
}

/* ---------- ปุ่ม + แผง ---------- */

/* จอเล็ก = แผ่นเลื่อนขึ้นจากขอบล่าง (คำสั่งผู้ใช้ 2026-08-30: "ตัว filter ทำให้เป็นปุ่มเดียว
   แล้วกด ก็เลื่อน tab setting มาจากด้านล่างขึ้นมาซัก 2/3 ของจอ") — จอ ≥sm เป็นแผงลอย
   เกาะปุ่มเหมือนเดิม. อ่านขนาดจอผ่าน useSyncExternalStore ตามกติกาข้อ 3 (ห้าม setState
   ใน effect) — snapshot ฝั่ง server = false และแผงจะ render ก็ต่อเมื่อกดปุ่มแล้ว
   จึงไม่มีทาง hydrate ไม่ตรง */
const SMALL_MQ = "(max-width: 639px)";

function subscribeSmall(cb: () => void): () => void {
  const mq = window.matchMedia(SMALL_MQ);
  mq.addEventListener("change", cb);
  // เหตุการณ์ change ของ media query ไม่ยิงทุกเบราว์เซอร์ตอน emulate ขนาดจอ — ฟัง resize คู่ไว้
  window.addEventListener("resize", cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener("resize", cb);
  };
}

function useIsSmallScreen(): boolean {
  return useSyncExternalStore(
    subscribeSmall,
    () => window.matchMedia(SMALL_MQ).matches,
    () => false
  );
}

/**
 * ปุ่ม "ตัวกรอง" ปุ่มเดียวของหน้า — กดแล้วแผงตัวกรองทั้งหมดขึ้นมา
 * (จอ ≥sm = แผงลอยเกาะปุ่ม · จอเล็ก = แผ่นสูง 2/3 จอเลื่อนขึ้นจากขอบล่าง)
 * เนื้อในส่งเข้ามาเป็น children (ห่อด้วย `FilterSection` ทีละกลุ่ม)
 */
export function InfluFilterButton<T>({
  api,
  count,
  factory,
  label = "ตัวกรอง",
  width = 344,
  resultCount,
  resultNoun = "รายการ",
  children,
}: {
  api: InfluFilterApi<T>;
  /** จำนวนกลุ่มตัวกรองที่เปิดอยู่ — โชว์เป็นเลขบนปุ่ม */
  count: number;
  /** ค่าโรงงานของหน้านี้ — ปุ่ม "ล้างทั้งหมด" กลับไปที่ค่านี้ (ไม่ใช่ค่าที่บันทึกไว้) */
  factory: T;
  label?: string;
  width?: number;
  /** จำนวนผลลัพธ์หลังกรอง — โชว์บนปุ่มปิดของแผ่นมือถือ ให้เห็นผลก่อนกดกลับไปดู */
  resultCount?: number;
  resultNoun?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const small = useIsSmallScreen();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const place = (a: HTMLElement) => setBox(menuBox(a, { width, maxHeight: 560 }));
  useAnchoredMenu({
    // แผ่นของจอเล็กเป็นโมดัล (ปิดด้วยฉากหลัง/Esc เอง) — ห้ามให้ useAnchoredMenu คุม
    // ไม่งั้นแตะในแผ่นแล้วหุบ / เลื่อนเนื้อในแล้วหุบ
    open: open && !small,
    anchorRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: place,
  });

  // ข้อความ "บันทึกแล้ว" หายเองหลัง 2 วิ — ไม่ต้องมีปุ่มปิด
  useEffect(() => {
    if (!justSaved) return;
    const t = window.setTimeout(() => setJustSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [justSaved]);

  // Esc ปิดแผ่น + ล็อค scroll พื้นหลัง (แพตเทิร์นเดียวกับ Modal ของระบบ)
  useEffect(() => {
    if (!open || !small) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, small]);

  const clearBtn =
    count > 0 ? (
      <button
        type="button"
        onClick={() => api.setFilters(factory)}
        className="cursor-pointer rounded-lg px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-50 hover:text-brand-700 max-sm:min-h-11 max-sm:text-sm"
      >
        ล้างทั้งหมด
      </button>
    ) : null;

  const closeBtn = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label="ปิดตัวกรอง"
      className="flex cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600 max-sm:h-11 max-sm:w-11 sm:h-7 sm:w-7"
    >
      <X size={16} />
    </button>
  );

  const head = (
    <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-3 py-2">
      <p className="text-sm font-semibold text-stone-700 max-sm:text-base">{label}</p>
      <div className="flex items-center gap-1">
        {clearBtn}
        {closeBtn}
      </div>
    </div>
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );

  /* ค่าเริ่มต้นของฉัน — บันทึกเก็บในเครื่องนี้ แยกตามบัญชี (ผู้ใช้ 2026-08-29) */
  const footer = (
    <div className="shrink-0 border-t border-stone-100 bg-stone-50/70 px-3 py-2 max-sm:pb-safe-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            api.saveAsDefault();
            setJustSaved(true);
          }}
          disabled={!api.dirty && api.hasSaved}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-default disabled:border-stone-200 disabled:text-stone-400 disabled:hover:bg-white max-sm:min-h-11 max-sm:text-sm"
        >
          {justSaved ? <Check size={13} /> : <Star size={13} />}
          {justSaved ? "บันทึกแล้ว" : "บันทึกเป็นค่าเริ่มต้น"}
        </button>
        {api.dirty && (
          <button
            type="button"
            onClick={api.reset}
            title="กลับไปที่ค่าเริ่มต้นที่ใช้อยู่"
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-500 transition-colors hover:text-brand-700 max-sm:min-h-11 max-sm:text-sm"
          >
            <RotateCcw size={12} />
            คืนค่าเริ่มต้น
          </button>
        )}
        {api.hasSaved && !api.dirty && (
          <button
            type="button"
            onClick={api.clearSaved}
            title="ลืมค่าเริ่มต้นที่บันทึกไว้ กลับไปใช้ค่ามาตรฐานของระบบ"
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-500 transition-colors hover:text-rose-600 max-sm:min-h-11 max-sm:text-sm"
          >
            <X size={12} />
            ลบค่าเริ่มต้น
          </button>
        )}
        {small && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-4 text-sm font-semibold text-cream shadow-sm transition-all active:scale-[0.97]"
          >
            {resultCount === undefined
              ? "ดูผลลัพธ์"
              : `ดูผลลัพธ์ ${resultCount} ${resultNoun}`}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-tight text-stone-400">
        {api.hasSaved
          ? "เปิดหน้านี้ครั้งหน้าจะใช้ค่าที่บันทึกไว้"
          : "ค่าเริ่มต้นตอนนี้คือค่ามาตรฐานของระบบ (เริ่มที่ “ของฉัน”)"}
      </p>
    </div>
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => {
          const a = anchorRef.current;
          if (a) place(a);
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        // ชื่อคงที่ — ถ้าปล่อยให้อ่านจากข้อความในปุ่ม เลขจำนวนตัวกรองจะกลายเป็นส่วนหนึ่ง
        // ของชื่อ (e2e จับปุ่มด้วยชื่อนี้ และ screen reader ก็อ่านซ้ำกับ badge)
        aria-label={label}
        className={`relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors active:scale-[0.97] max-sm:min-h-11 ${
          count > 0
            ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
            : "border-stone-200 bg-white/70 text-stone-600 hover:border-stone-300"
        }`}
      >
        <SlidersHorizontal size={15} />
        {label}
        {count > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-semibold tabular-nums text-white">
            {count}
          </span>
        )}
      </button>

      {open &&
        (small || box) &&
        createPortal(
          small ? (
            /* z-[80] เท่า Modal ของระบบ — dropdown แบบ portal ที่ถูกใช้ "ข้างใน" แผ่นนี้
               ต้องเป็น z-[90] ตามกติกาเดียวกับโมดัล */
            <div className="fixed inset-0 z-[80]">
              <button
                type="button"
                aria-label="ปิดตัวกรอง"
                onClick={() => setOpen(false)}
                className="absolute inset-0 cursor-default bg-brand-900/30 backdrop-blur-sm animate-fade-in"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={label}
                // 2/3 จอตามคำสั่งผู้ใช้ — ตัวกรองสั้นก็ยังสูงเท่านี้ (นิ้วโป้งเอื้อมถึงทั้งแผ่น)
                className="absolute inset-x-0 bottom-0 flex h-[68dvh] max-h-[92dvh] flex-col rounded-t-3xl border border-white/70 bg-white shadow-2xl animate-slide-in-up"
              >
                {/* แถบจับ — บอกว่าแผ่นนี้เลื่อนขึ้นมาและปิดได้ */}
                <span
                  aria-hidden
                  className="mx-auto mb-1.5 mt-2.5 block h-1 w-10 shrink-0 rounded-full bg-stone-300"
                />
                {head}
                {body}
                {footer}
              </div>
            </div>
          ) : (
            <div
              ref={menuRef}
              role="dialog"
              aria-label={label}
              style={{
                position: "fixed",
                left: box?.x,
                top: box?.y,
                width: box?.width,
                maxHeight: box?.height,
              }}
              className="z-[60] flex flex-col rounded-xl border border-stone-200 bg-white shadow-xl animate-scale-in"
            >
              {head}
              {body}
              {footer}
            </div>
          ),
          document.body
        )}
    </>
  );
}

/** ช่องค้นหาหน้าตามาตรฐานของระบบ — คู่กับปุ่มตัวกรอง (rounded-full เหมือนกัน) */
export function FilterSearchInput({
  value,
  onChange,
  placeholder = "ค้นหา",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
    />
  );
}
