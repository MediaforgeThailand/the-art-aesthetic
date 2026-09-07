"use client";

/**
 * ตัวกรองของบอร์ดเคส — ปุ่มเดียว กดแล้วแผงลอยขึ้นมาทั้งชุด (ผู้ใช้ 2026-08-29)
 *
 * ของเดิมบนแถบเครื่องมือมี 5 ชิ้นเรียงกัน (เส้น stage · รอลงคิวหมอ · เคสของฉัน ·
 * ยกเว้น · ล้างตัวกรอง) กินความกว้างจนบอร์ดเหลือที่น้อย — ยุบเข้าแผงเดียว
 * เหลือบนแถบ [ค้นหา] [ตัวกรอง] [สร้างนัดใหม่] + เส้น stage แถวถัดไป
 *
 * **ยกเว้นเส้น stage — อยู่นอกแผงบนแถบเครื่องมือ ห้ามย้ายกลับเข้าไปในแผง**
 * (ผู้ใช้ 2026-09-01: "ส่วนของ stage ที่ควรอยู่ข้างนอกให้กดง่ายๆ") เป็นตัวกรองที่ใช้บ่อยที่สุด
 * ของหน้านี้ ต้องกดได้ในคลิกเดียว — component อยู่ในไฟล์นี้ (`StageTrackerPicker`)
 * แล้ว influencers-client เอาไป render บนแถบเอง
 *
 * ตัวกรอง "กลุ่มขนาดผู้ติดตาม" (เล็ก/กลาง/ใหญ่) ถูกถอดถาวร — บอร์ดแบ่ง 3 คอลัมน์
 * (จอ ≥md) และเป็นหน้าปัดซ้าย-ขวา (จอเล็ก) ตามกลุ่มนี้อยู่แล้ว ตัวกรองจึงซ้ำซ้อน
 *
 * **ค่าโรงงาน `owner: "mine"`** = เปิดหน้ามาเห็นงานของตัวเองก่อนเสมอ (คำสั่งผู้ใช้)
 * ใครอยากเห็นทั้งทีมทุกครั้ง กด "บันทึกเป็นค่าเริ่มต้น" ในแผงได้
 */

import { Check } from "lucide-react";
import {
  FilterChip,
  FilterSection,
  type FilterSummaryChip,
} from "@/influ/components/influ-filter-panel";
import { Select } from "@/components/ui";
import {
  INFLU_ROLE_ORDER,
  INFLU_ROLES,
  INFLU_STAGE,
  INFLU_STAGES,
  normalizeRoles,
} from "@/influ/lib/influ-constants";
import type { InfluCampaignDefRow, InfluScope } from "@/lib/types";
import type { CaseAssignee } from "./assignees";
import {
  INFLU_STATUS_META,
  type InfluencerListRow,
  influStatusOf,
  type InfluStatusKey,
} from "./influ-board";

/* ---------- ชนิดข้อมูล ---------- */

/** ขั้นที่กำลังเจาะดู — number = เลข stage, "all" = ทุกขั้น,
    "memowait" = คิว "Case รอส่ง memo" (ขั้นย่อย 1.0 — ปุ่มบนแถบเครื่องมือ, 0104),
    "needbooking" = รอลงคิวหมอทุกขั้น · "needbooking_approved" = ผ่านขั้น 1.2 (เอกสารผ่าน)
    แล้วแต่ยังไม่ลงคิว (ผู้ใช้ 2026-09-02 — ปลายทางของปุ่มแจ้งเตือนบนปฏิทิน) */
type BoardStageFilter =
  | number
  | "all"
  | "done"
  | "declined"
  | "needbooking"
  | "needbooking_approved"
  | "memowait";

/** ค่า `?filter=` ที่ deep link เข้าบอร์ดได้ (ปุ่มแจ้งเตือนบนปฏิทิน / กระดิ่ง) */
const BOARD_DEEP_LINK_FILTERS = [
  "needbooking",
  "needbooking_approved",
  "memowait",
  "declined",
  "done",
] as const;

/**
 * แปลง `?filter=` ของ deep link เป็นตัวกรองตั้งต้นของ "รอบนี้" (ส่งเข้า useInfluFilters เป็น seed)
 * — ตั้ง owner เป็น "ทุกคน" ด้วย เพราะตัวเลขบนปุ่มที่พามานับทั้งทีม ถ้าปล่อยค่าเริ่มต้น
 * "เคสของฉัน" ไว้ กดมาแล้วจะเห็นไม่ครบเท่าตัวเลขบนปุ่ม (ค่าที่บันทึกไว้ไม่ถูกแตะ)
 * ค่าที่ไม่รู้จัก = ไม่ seed (เปิดบอร์ดตามค่าเริ่มต้นปกติ)
 */
export function boardSeedFromParam(
  param: string | null
): Partial<BoardFilters> | null {
  if (!param) return null;
  if (!(BOARD_DEEP_LINK_FILTERS as readonly string[]).includes(param))
    return null;
  return { stage: param as BoardStageFilter, owner: "all" };
}

export type BoardFilters = {
  /** "all" | "mine" | "none" (ยังไม่มีผู้รับผิดชอบ) | uid */
  owner: string;
  /** บทบาทที่สนใจ — ใช้คู่กับ owner (ว่าง = ทุกบทบาท); ค่าเก่าก่อน 0104
      (contract/followup) ที่ค้างใน localStorage ถูกแปลงผ่าน normalizeRoles ตอนใช้ */
  scopes: InfluScope[];
  /** ขั้นที่เจาะดู — เลือกจากเส้น tracker บนแถบเครื่องมือ (ไม่ได้อยู่ในแผง) */
  stage: BoardStageFilter;
  /** สถานะที่ซ่อนจากบอร์ด */
  excluded: InfluStatusKey[];
  /** "all" | "none" (ไม่อยู่ในแคมเปญ) | campaign id */
  campaign: string;
};

const INFLU_STATUS_ORDER: InfluStatusKey[] = ["accepted", "done", "declined"];

/** ค่าโรงงาน — "งานของฉัน" เป็นค่าเริ่มต้นตามคำสั่งผู้ใช้ + ซ่อนคนที่ปฏิเสธเหมือนเดิม */
export const DEFAULT_BOARD_FILTERS: BoardFilters = {
  owner: "mine",
  scopes: [],
  stage: "all",
  excluded: ["declined"],
  campaign: "all",
};

/* ---------- logic ---------- */

/**
 * จำนวนตัวกรองที่เปิดอยู่ **เฉพาะที่อยู่ในแผง** — ขั้นที่เลือกจากเส้น tracker ไม่นับ
 * (เห็นอยู่แล้วบนแถบ) และ "memowait" ก็ไม่นับด้วยเหตุเดียวกัน (ปุ่ม "Case รอส่ง memo"
 * บนแถบโชว์สถานะ active ของตัวเอง) นับเฉพาะ "รอลงคิวหมอ" ซึ่งเป็นชิปในแผงจริงๆ
 * ไม่งั้นป้ายตัวเลขบนปุ่มจะบอกว่ามีตัวกรองเปิดอยู่ แต่เปิดแผงมาแล้วไม่เจอว่าคืออันไหน
 */
export function boardFilterCount(f: BoardFilters): number {
  const d = DEFAULT_BOARD_FILTERS;
  // เทียบกับ **ค่าโรงงาน** ไม่ใช่ "ค่าว่าง" — ไม่งั้นเปิดหน้ามาเฉยๆ ป้ายก็ขึ้น 2 ตลอด
  // (owner: "mine" + ซ่อน "ปฏิเสธ" เป็นค่าตั้งต้นอยู่แล้ว) แล้วเลขนั้นก็ไม่มีความหมาย
  const sameExcluded =
    f.excluded.length === d.excluded.length &&
    f.excluded.every((s) => d.excluded.includes(s));
  return (
    (f.owner !== d.owner ? 1 : 0) +
    (f.scopes.length ? 1 : 0) +
    (f.stage === "needbooking" || f.stage === "needbooking_approved" ? 1 : 0) +
    (sameExcluded ? 0 : 1) +
    (f.campaign !== d.campaign ? 1 : 0)
  );
}

/**
 * เคสนี้ผ่านตัวกรองไหม
 *
 * กติกาที่ต้องรักษา (บั๊กเดิมของหน้า /tasks และหน้านี้):
 * - **สถานะที่กำลังเจาะดูอยู่ต้องชนะรายการยกเว้นเสมอ** ไม่งั้นคนที่ยกเว้น "จบงาน" ไว้
 *   แล้วกดจุด "จบงาน" จะได้บอร์ดว่างทั้งที่มีเคสอยู่
 * - ชิป "ปฏิเสธ" / "รอลงคิวหมอ" ข้ามตัวกรองยกเว้นทั้งหมด (ไม่งั้นเลือกแล้วว่างเปล่า)
 */
export function matchBoardFilters(
  i: InfluencerListRow,
  f: BoardFilters,
  ctx: {
    meId: string | null;
    assigneesOf: (id: string) => CaseAssignee[];
    bookingAlertIds: Set<string>;
    /** person_id ของคนที่ "ฉัน" รับผิดชอบอยู่สักรอบ — รอบอื่นของคนเดียวกันต้องเห็นด้วย */
    myPersonIds?: ReadonlySet<string>;
  }
): boolean {
  const status = influStatusOf(i);

  /* คิวเตือน 3 อัน ("รอลงคิวหมอ" / "เอกสารผ่านแล้ว ยังไม่ลงคิว" / "Case รอส่ง memo")
     **ข้ามตัวกรองอื่นทั้งหมด** — ยกเว้น, ผู้รับผิดชอบ, บทบาท, แคมเปญ — แล้ว return
     ทันที เพราะป้ายจำนวนบนปุ่ม/กระดิ่ง/ปฏิทินนับจากทุกเคสในทีม (ดู memoWaitCount /
     bookingAlertIds ใน influencers-client) ⚠️ ก่อนแก้ 2026-09-03 ตัวกรอง owner ยัง
     ทำงานต่อ ค่าโรงงานคือ "เคสของฉัน" ⇒ กดปุ่มที่ขึ้นเลข 17 แล้วได้บอร์ดว่าง พร้อม
     ข้อความว่า "ทุกเคสกดยืนยันแล้ว" ซึ่งไม่จริง — สัญญาณเตือนต้องเห็นครบเสมอ
     ห้ามให้ตัวกรองอื่นมาตัดทิ้ง (ครอบ needbooking_approved ด้วยเหตุผลเดียวกัน) */
  if (f.stage === "needbooking") {
    return ctx.bookingAlertIds.has(i.id);
  }
  if (f.stage === "needbooking_approved") {
    // "เอกสารผ่านแล้ว ยังไม่ลงคิว" = รอลงคิว + ผ่านขั้น 1.2 มาแล้ว (memoApprovedNeedsBooking)
    return (
      ctx.bookingAlertIds.has(i.id) && i.stage >= INFLU_STAGE.contractService
    );
  }
  if (f.stage === "memowait") {
    // "Case รอส่ง memo" = ขั้นย่อย 1.0 — ยังไม่กดยืนยันส่งเรื่อง Memo (0104)
    return (
      i.stage === INFLU_STAGE.memo &&
      i.docs_sent_at === null &&
      !i.completed &&
      status !== "declined"
    );
  }
  if (f.stage === "declined") {
    if (status !== "declined") return false;
  } else {
    const picked: InfluStatusKey | null =
      f.stage === "done"
        ? "done"
        : typeof f.stage === "number"
          ? "accepted"
          : null;
    if (status !== picked && f.excluded.includes(status)) return false;
    if (f.stage === "done" && status !== "done") return false;
    if (typeof f.stage === "number") {
      if (status === "declined" || i.completed || i.stage !== f.stage)
        return false;
    }
  }

  const list = ctx.assigneesOf(i.id);
  if (f.owner === "none") {
    if (list.length > 0) return false;
  } else if (f.owner !== "all") {
    const want = f.owner === "mine" ? ctx.meId : f.owner;
    if (!want) return false;
    const row = list.find((a) => a.userId === want);
    if (!row) {
      // "เคสของฉัน" (ค่าโรงงาน) ต้องไม่ทำให้ของหาย 2 กรณี:
      //  1) เคสที่ยังไม่มีผู้รับผิดชอบเลย — งานไม่มีเจ้าภาพต้องเห็นเพื่อไปรับ
      //     (การ์ดมีชิปเส้นประ "ยังไม่มีผู้รับผิดชอบ" บอกอยู่แล้ว)
      //  2) รอบอื่นของคนที่ฉันดูแลอยู่ — ไม่งั้นเห็นรอบเดียวแล้วนึกว่าคนนี้มีการ์ดใบเดียว
      if (f.owner !== "mine" || f.scopes.length > 0) return false;
      if (list.length > 0 && !ctx.myPersonIds?.has(i.person_id)) return false;
      return campaignOk(i, f);
    }
    // เลือกบทบาทด้วย = ดูเฉพาะเคสที่คนนั้นถือบทบาทนั้นจริง
    // (เทียบผ่าน normalizeRoles ทั้งสองฝั่ง — ข้อมูล/ค่าที่บันทึกไว้ก่อน 0104 ยังใช้ได้)
    if (f.scopes.length) {
      const wantRoles = normalizeRoles(f.scopes);
      if (!normalizeRoles(row.scopes).some((r) => wantRoles.includes(r)))
        return false;
    }
  } else if (f.scopes.length) {
    // ไม่เจาะคน แต่เจาะบทบาท = เคสที่มีใครสักคนถือบทบาทนั้น
    const wantRoles = normalizeRoles(f.scopes);
    if (
      !list.some((a) =>
        normalizeRoles(a.scopes).some((r) => wantRoles.includes(r))
      )
    )
      return false;
  }

  return campaignOk(i, f);
}

function campaignOk(i: InfluencerListRow, f: BoardFilters): boolean {
  if (f.campaign === "all") return true;
  if (f.campaign === "none") return i.campaign_id === null;
  return i.campaign_id === f.campaign;
}

/** ชิปสรุปตัวกรองที่เปิดอยู่ (กดกากบาทปลดทีละอัน) */
export function boardFilterChips(
  f: BoardFilters,
  peopleById: Map<string, { name: string }>,
  campaigns: InfluCampaignDefRow[]
): FilterSummaryChip<BoardFilters>[] {
  const out: FilterSummaryChip<BoardFilters>[] = [];

  /* คิวเตือนข้ามตัวกรองอื่นทั้งหมด (ดู matchBoardFilters) ⇒ ห้ามโชว์ชิปของตัวกรอง
     ที่ตอนนี้ไม่มีผล ไม่งั้นบอร์ดโชว์เคสทั้งทีมอยู่แต่ชิปยังเขียนว่า "เคสของฉัน" */
  if (f.stage === "memowait") {
    // ปุ่ม "Case รอส่ง memo" บนแถบเครื่องมือโชว์สถานะ active ของตัวเองอยู่แล้ว
    return out;
  }
  if (f.stage === "needbooking" || f.stage === "needbooking_approved") {
    out.push({
      key: "stage",
      label:
        f.stage === "needbooking"
          ? "รอลงคิวหมอ · ทุกขั้น"
          : "เอกสารผ่านแล้ว ยังไม่ลงคิว",
      next: { ...f, stage: "all" },
    });
    return out;
  }

  if (f.owner !== "all") {
    out.push({
      key: "owner",
      label:
        f.owner === "mine"
          ? "เคสของฉัน + ยังไม่มีผู้รับผิดชอบ"
          : f.owner === "none"
            ? "ยังไม่มีผู้รับผิดชอบ"
            : `ผู้รับผิดชอบ: ${peopleById.get(f.owner)?.name ?? "ไม่ทราบชื่อ"}`,
      next: { ...f, owner: "all" },
    });
  }
  if (f.scopes.length) {
    out.push({
      key: "scopes",
      label: `บทบาท: ${normalizeRoles(f.scopes)
        .map((r) => INFLU_ROLES[r].short)
        .join(", ")}`,
      next: { ...f, scopes: [] },
    });
  }
  // ขั้นที่เลือกไม่ต้องมีชิปสรุป — เส้น tracker บนแถบบอกอยู่แล้วว่าเจาะขั้นไหนอยู่
  // (needbooking/needbooking_approved มีชิปสรุปของตัวเองแล้วที่ return out ด้านบน)
  if (f.excluded.length) {
    out.push({
      key: "excluded",
      label: `ซ่อน: ${f.excluded
        .map((s) => INFLU_STATUS_META[s].label)
        .join(", ")}`,
      next: { ...f, excluded: [] },
    });
  }
  if (f.campaign !== "all") {
    out.push({
      key: "campaign",
      label:
        f.campaign === "none"
          ? "ไม่อยู่ในแคมเปญ"
          : `แคมเปญ: ${campaigns.find((c) => c.id === f.campaign)?.name ?? "ไม่ทราบ"}`,
      next: { ...f, campaign: "all" },
    });
  }
  return out;
}

/* ---------- เนื้อในแผง ---------- */

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/**
 * เส้น stage แบบ tracker — **อยู่บนแถบเครื่องมือของหน้า ไม่ใช่ในแผงตัวกรอง**
 * (จุดร้อยเส้นหน้าตาเดียวกับ StageTracker บนการ์ด · กดจุดที่เลือกอยู่ซ้ำ = กลับมาดูทุกขั้น)
 */
export function StageTrackerPicker({
  value,
  countFor,
  onChange,
  className = "",
}: {
  value: BoardStageFilter;
  countFor: (key: number | "done" | "declined") => number;
  onChange: (key: BoardStageFilter) => void;
  className?: string;
}) {
  const nodes: { key: number | "done"; label: string }[] = [
    ...INFLU_STAGES.map((s) => ({
      key: s.step as number | "done",
      label: `${s.step}. ${s.short}`,
    })),
    { key: "done", label: "จบงาน" },
  ];
  const declinedActive = value === "declined";
  return (
    <div className={`flex items-start gap-1 ${className}`}>
      <div className="flex min-w-0 flex-1">
        {nodes.map((n, i) => {
          const active = value === n.key;
          const isDone = n.key === "done";
          return (
            <button
              key={String(n.key)}
              type="button"
              title={active ? "กดซ้ำเพื่อดูทุกขั้น" : undefined}
              onClick={() => onChange(active ? "all" : n.key)}
              className="group relative flex flex-1 cursor-pointer flex-col items-center gap-1.5 px-0.5 pb-0.5"
            >
              {i > 0 && (
                <span className="absolute left-0 right-1/2 top-[9px] h-0.5 bg-stone-200" />
              )}
              {i < nodes.length - 1 && (
                <span className="absolute left-1/2 right-0 top-[9px] h-0.5 bg-stone-200" />
              )}
              <span className="relative flex h-5 items-center justify-center">
                <span
                  className={`flex items-center justify-center rounded-full transition-all ${
                    active
                      ? `h-5 w-5 shadow-sm ring-4 ${
                          isDone
                            ? "bg-emerald-600 ring-emerald-200"
                            : "bg-gradient-to-b from-brand-600 to-brand-700 ring-brand-200"
                        }`
                      : isDone
                        ? "h-3.5 w-3.5 border-[1.5px] border-emerald-300 bg-emerald-50 text-emerald-500 group-hover:border-emerald-500"
                        : "h-3.5 w-3.5 border-[1.5px] border-stone-300 bg-white group-hover:border-brand-500"
                  }`}
                >
                  {active ? (
                    isDone ? (
                      <Check size={11} strokeWidth={3.5} className="text-white" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    )
                  ) : isDone ? (
                    <Check size={9} strokeWidth={4} />
                  ) : null}
                </span>
              </span>
              <span
                className={`whitespace-nowrap text-[10px] leading-none transition-colors ${
                  active
                    ? `rounded-full px-1.5 py-1 font-semibold text-white shadow-sm ${
                        isDone
                          ? "bg-emerald-600"
                          : "bg-gradient-to-b from-brand-600 to-brand-700"
                      }`
                    : "font-medium text-stone-500 group-hover:text-brand-700"
                }`}
              >
                {n.label}{" "}
                <span className={active ? "opacity-80" : "text-stone-400"}>
                  ({countFor(n.key)})
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {/* ปฏิเสธ = นอกเส้นงาน (ตัวกรองนี้ข้าม "ยกเว้น" เพื่อดูเคสที่ถูกซ่อนอยู่) */}
      <button
        type="button"
        title={declinedActive ? "กดซ้ำเพื่อดูทุกขั้น" : "ดูเฉพาะเคสที่ปฏิเสธ"}
        onClick={() => onChange(declinedActive ? "all" : "declined")}
        className="group flex shrink-0 cursor-pointer flex-col items-center gap-1.5 border-l border-dashed border-stone-300 pl-1.5 pb-0.5"
      >
        <span className="flex h-5 items-center justify-center">
          <span
            className={`flex items-center justify-center rounded-full transition-all ${
              declinedActive
                ? "h-5 w-5 bg-rose-500 shadow-sm ring-4 ring-rose-200"
                : "h-3.5 w-3.5 border-[1.5px] border-rose-300 bg-rose-50 group-hover:border-rose-500"
            }`}
          >
            {declinedActive && <span className="h-2 w-2 rounded-full bg-white" />}
          </span>
        </span>
        <span
          className={`whitespace-nowrap text-[10px] leading-none transition-colors ${
            declinedActive
              ? "rounded-full bg-rose-500 px-1.5 py-1 font-semibold text-white shadow-sm"
              : "font-medium text-stone-500 group-hover:text-rose-600"
          }`}
        >
          ปฏิเสธ{" "}
          <span className={declinedActive ? "opacity-80" : "text-stone-400"}>
            ({countFor("declined")})
          </span>
        </span>
      </button>
    </div>
  );
}

export function BoardFilterSections({
  filters,
  onChange,
  people,
  meId,
  campaigns,
  statusCount,
  bookingCount,
  approvedBookingCount,
  unassignedCount,
}: {
  filters: BoardFilters;
  onChange: (f: BoardFilters) => void;
  people: { id: string; name: string }[];
  meId: string | null;
  campaigns: InfluCampaignDefRow[];
  statusCount: (s: InfluStatusKey) => number;
  /** รอลงคิวหมอทุกขั้น (needsDoctorBooking) */
  bookingCount: number;
  /** ผ่านขั้น 1.2 แล้วแต่ยังไม่ลงคิว (memoApprovedNeedsBooking) — subset ของ bookingCount */
  approvedBookingCount: number;
  unassignedCount: number;
}) {
  const set = (part: Partial<BoardFilters>) =>
    onChange({ ...filters, ...part });
  // ค่าที่บันทึกไว้ก่อน 0104 (contract/followup) ถูกแปลงเป็นบทบาทใหม่ตอนแสดง —
  // กดชิปครั้งแรกก็เก็บกลับเป็นคีย์บทบาทใหม่ให้เอง
  const selectedRoles = normalizeRoles(filters.scopes);

  return (
    <>
      <FilterSection
        title="งานค้าง"
      >
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={filters.stage === "needbooking"}
            onClick={() =>
              set({
                stage: filters.stage === "needbooking" ? "all" : "needbooking",
              })
            }
          >
            รอลงคิวหมอ · ทุกขั้น
            <span className="tabular-nums text-stone-400">{bookingCount}</span>
          </FilterChip>
          <FilterChip
            active={filters.stage === "needbooking_approved"}
            onClick={() =>
              set({
                stage:
                  filters.stage === "needbooking_approved"
                    ? "all"
                    : "needbooking_approved",
              })
            }
          >
            เอกสารผ่านแล้ว ยังไม่ลงคิว
            <span className="tabular-nums text-stone-400">
              {approvedBookingCount}
            </span>
          </FilterChip>
          <FilterChip
            active={filters.owner === "none"}
            onClick={() =>
              set({ owner: filters.owner === "none" ? "all" : "none" })
            }
            title="เคสที่ยังไม่มีใครถูกตั้งเป็นผู้รับผิดชอบ — จะไม่ขึ้นเตือนในกระดิ่งของใครเลย"
          >
            ยังไม่มีผู้รับผิดชอบ
            <span
              className={`tabular-nums ${
                unassignedCount > 0 ? "text-amber-600" : "text-stone-400"
              }`}
            >
              {unassignedCount}
            </span>
          </FilterChip>
        </div>
      </FilterSection>

      <FilterSection
        title="ผู้รับผิดชอบ"
      >
        <Select
          value={filters.owner}
          onChange={(e) => set({ owner: e.target.value })}
          aria-label="กรองตามผู้รับผิดชอบ"
        >
          <option value="all">ทุกคน</option>
          {meId && <option value="mine">เคสของฉัน</option>}
          <option value="none">
            ยังไม่มีผู้รับผิดชอบ ({unassignedCount})
          </option>
          {people
            .filter((p) => p.id !== meId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {INFLU_ROLE_ORDER.map((r) => (
            <FilterChip
              key={r}
              active={selectedRoles.includes(r)}
              onClick={() => set({ scopes: toggle(selectedRoles, r) })}
              title={INFLU_ROLES[r].desc}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${INFLU_ROLES[r].dot}`}
              />
              {INFLU_ROLES[r].short}
            </FilterChip>
          ))}
        </div>
      </FilterSection>

      <FilterSection
        title="ซ่อนสถานะ"
      >
        <div className="flex flex-wrap gap-1.5">
          {INFLU_STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={filters.excluded.includes(s)}
              onClick={() => set({ excluded: toggle(filters.excluded, s) })}
            >
              {INFLU_STATUS_META[s].label}
              <span className="tabular-nums text-stone-400">
                {statusCount(s)}
              </span>
            </FilterChip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="แคมเปญ">
        <Select
          value={filters.campaign}
          onChange={(e) => set({ campaign: e.target.value })}
          aria-label="กรองตามแคมเปญ"
        >
          <option value="all">ทุกแคมเปญ</option>
          <option value="none">ไม่อยู่ในแคมเปญ</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FilterSection>
    </>
  );
}
