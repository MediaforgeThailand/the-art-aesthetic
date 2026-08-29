"use client";

import { ChevronLeft, ChevronRight, ListPlus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui";
import type { TaskSectionRow, TaskWithAssignee } from "@/lib/types";
import type { QuickAddPlacement } from "./board";
import { PosterCard } from "./mobile-card";

/* ============================================================================
   บอร์ดเวอร์ชันมือถือ (<lg) — "ปาดข้างแบบการ์ด Tinder"
   ----------------------------------------------------------------------------
   คอลัมน์แบบเดสก์ท็อป (กว้าง 520px เลื่อนแนวนอนอิสระ) ใช้บนจอ 375px ไม่ได้ —
   ทีมต้องเลื่อนหาคอลัมน์เองแล้วการ์ดก็ถูกบีบจนอ่านไม่ออก. เวอร์ชันนี้จึงเป็น
   "หนึ่งเซคชัน = หนึ่งหน้าเต็มจอ" แล้วปาดซ้าย/ขวาเพื่อสลับเซคชัน โดยใช้
   CSS scroll-snap แบบ mandatory = **บังคับมุมกล้อง** (ปล่อยนิ้วแล้วต้องลงล็อก
   ที่เซคชันใดเซคชันหนึ่งเสมอ ไม่มีค้างครึ่งๆ กลางๆ)

   กติกาที่ต้องรักษาไว้:
   1) ไม่มีลากวาง (dnd) บนมือถือโดยตั้งใจ — ท่าลากการ์ดทับกับท่าปาดเปลี่ยนหน้าเสมอ
      ถ้าต้องเรียง/ย้ายคอลัมน์ให้ทำบนจอใหญ่ (KanbanBoard เดิมยังอยู่ครบ)
   2) การ์ด = รูปเต็มใบ (object-cover) + avatar เจ้าของมุมซ้ายบน + แถบ fade/blur
      ท้ายการ์ดสำหรับชื่องาน — ห้ามยัดชิปข้อมูลกลับเข้ามาเป็นแถวๆ แบบการ์ดเดสก์ท็อป
      (รายละเอียดทั้งหมดดูได้ในแผงตั้งค่าที่เลื่อนขึ้นมาตอนกดการ์ด)
   3) `data-task-id` ต้องอยู่บนการ์ด — deep link จากกระดิ่ง (`/tasks?task=`)
      ใช้ querySelector + scrollIntoView({inline:"center"}) ซึ่งเลื่อน pager ให้เอง
   ========================================================================== */

/* ---------- ช่องเพิ่มงานของเซคชันที่เปิดอยู่ ---------- */

function MobileComposer({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const commit = () => {
    const title = text.trim();
    if (title === "") return;
    onSubmit(title);
    setText(""); // ค้างช่องไว้ให้พิมพ์งานถัดไปต่อเนื่อง
  };

  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-300 bg-white p-2 shadow-sm animate-scale-in">
      {/* input ดิบ (ไม่ใช่ InlineInput) เพราะต้องผูก ref เพื่อโฟกัสเอง —
          text-base บังคับไว้เองตามกติกา: ช่องกรอก < 16px ทำให้ iOS ซูมเข้าแล้วไม่ซูมกลับ */}
      <input
        ref={ref}
        value={text}
        placeholder="ชื่องานใหม่ แล้วกด Enter"
        aria-label="ชื่องานใหม่"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") onClose();
        }}
        className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={commit}
        disabled={text.trim() === ""}
        className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-3 text-sm font-medium text-cream transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300"
      >
        <Plus size={16} />
        เพิ่ม
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิดช่องเพิ่มงาน"
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors active:bg-stone-100"
      >
        <X size={18} />
      </button>
    </div>
  );
}

/* ---------- pager ---------- */

export function MobileBoard({
  sections,
  tasksBySection,
  today,
  selectedId,
  onCardClick,
  onQuickAdd,
}: {
  sections: TaskSectionRow[];
  tasksBySection: Record<string, TaskWithAssignee[]>;
  today: string;
  selectedId: string | null;
  onCardClick: (task: TaskWithAssignee) => void;
  onQuickAdd: (
    sectionId: string,
    title: string,
    placement: QuickAddPlacement
  ) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  // ตำแหน่งหน้าปัจจุบันอ่านจาก scrollLeft จริง (ไม่ใช่ state ที่เราสั่งเอง)
  // — ปาดนิ้วเองกับกดปุ่มลูกศรจึงตรงกันเสมอ
  const syncPage = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setPage((cur) => (cur === i ? cur : i));
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    },
    []
  );

  // เซคชันถูกลบ/กรองจนหน้าปัจจุบันเกินขอบ — ดึงกลับมาหน้าสุดท้ายที่มีอยู่จริง
  const maxPage = Math.max(0, sections.length - 1);
  const current = Math.min(page, maxPage);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const target = Math.min(Math.max(i, 0), maxPage);
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
    setPage(target);
  };

  if (sections.length === 0) {
    return (
      <div className="px-4 pt-2">
        <EmptyState
          icon={<ListPlus size={36} />}
          title="ยังไม่มีเซคชัน"
          description="เซคชันถูกกำหนดจากระบบ — ติดต่อผู้ดูแลหากยังไม่มีเซคชัน"
        />
      </div>
    );
  }

  const section = sections[current];
  const count = (tasksBySection[section.id] ?? []).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* หัวเรื่องของเซคชันที่กำลังดู — ปุ่ม ‹ › ไว้เปลี่ยนหน้าโดยไม่ต้องปาด (คีย์บอร์ดก็ใช้ได้) */}
      <div className="flex shrink-0 items-center gap-1 px-3 pb-1.5">
        <button
          type="button"
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          aria-label="เซคชันก่อนหน้า"
          className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors active:bg-white/70 disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-stone-800">
            {section.name}
          </p>
          <p className="text-[11px] text-stone-400">
            {section.type === "brief" ? "Brief สั่งงาน" : "ชิ้นงาน"} · {count}{" "}
            การ์ด
          </p>
        </div>
        <button
          type="button"
          onClick={() => goTo(current + 1)}
          disabled={current === maxPage}
          aria-label="เซคชันถัดไป"
          className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors active:bg-white/70 disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
        <button
          type="button"
          onClick={() =>
            setComposerFor((cur) => (cur === section.id ? null : section.id))
          }
          aria-label={`เพิ่มงานในเซคชัน ${section.name}`}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm transition-transform active:scale-90"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* จุดบอกหน้า — กดข้ามไปเซคชันไหนก็ได้ */}
      {sections.length > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 pb-2">
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`ไปที่เซคชัน ${s.name}`}
              aria-current={i === current}
              className="flex h-6 w-6 cursor-pointer items-center justify-center"
            >
              <span
                className={`block rounded-full transition-all duration-200 ${
                  i === current
                    ? "h-1.5 w-5 bg-brand-500"
                    : "h-1.5 w-1.5 bg-stone-300"
                }`}
              />
            </button>
          ))}
        </div>
      )}

      {/* รางปาดข้าง: 1 เซคชัน = 1 หน้าเต็มจอ + snap-mandatory (บังคับลงล็อกทุกครั้ง) */}
      <div
        ref={trackRef}
        onScroll={syncPage}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((s) => {
          const tasks = tasksBySection[s.id] ?? [];
          return (
            <div
              key={s.id}
              className="h-full w-full shrink-0 snap-center snap-always overflow-y-auto overscroll-y-contain px-3 pb-4"
            >
              {composerFor === s.id && (
                <MobileComposer
                  onSubmit={(title) => onQuickAdd(s.id, title, "top")}
                  onClose={() => setComposerFor(null)}
                />
              )}
              {tasks.length === 0 ? (
                <div className="mt-2 rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center text-xs text-stone-400">
                  ยังไม่มีการ์ดในเซคชันนี้
                  <br />
                  (ตัวกรองอาจซ่อนอยู่ — เช็คที่ปุ่มตัวกรองด้านบน)
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {tasks.map((task) => (
                    <PosterCard
                      key={task.id}
                      task={task}
                      today={today}
                      selected={selectedId === task.id}
                      isBrief={s.type === "brief"}
                      onClick={() => onCardClick(task)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
