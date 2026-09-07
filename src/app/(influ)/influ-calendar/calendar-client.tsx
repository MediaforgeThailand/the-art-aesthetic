"use client";

// ปฏิทินคิว Influ — redesign 2026-08-29 ตามภาพอ้างอิงที่ผู้ใช้ส่ง (หน้าตาชุดเดียวกับปฏิทิน Wellness)
//   1) ทั้งบล็อกปฏิทินเป็น "แผ่นไล่เฉดแบรนด์" — ตัวเลขวันเป็นพระเอก อ่านง่ายทั้งมือถือ/คอม
//      วันที่เลือก = ช่องขาวตัวหนังสือสีแบรนด์ · วันที่มีคิว = ป้ายตัวเลขจำนวนคิวเกาะมุมเลขวัน
//   2) ใต้ปฏิทิน (จอเล็ก) / คอลัมน์ขวา (จอ ≥lg) = การ์ดคิวรายวัน — แถบวันที่ไล่เฉดซ้ายมือ
//      + รายการคิวของวันนั้นเรียงตามเวลาอยู่ขวามือ กดแถว = โมดัลรายละเอียด
//   3) โหมดสัปดาห์ = แผ่นปฏิทินเหลือแถวเดียว (การ์ดข้างล่างยังเป็นของ "วันที่เลือก" วันเดียว)
//   4) จอ ≥lg เพิ่มชิปคิวในช่องวัน (ตามความสูงช่องจริง) — กวาดตาเห็นทั้งเดือนโดยไม่ต้องกดทีละวัน
// **state ของหน้ามีตัวเดียวคือ "วันที่เลือก"** — เดือน/สัปดาห์ที่โชว์คำนวณจากมัน จึงไม่มีทางเกิด
// สภาพ "เลื่อนเดือนแล้วรายการข้างล่างเป็นของอีกเดือน"
// แผงข้างลอยทับจอ (DaySidebar เดิม) ถูกถอดออก — รายละเอียด/ฟอร์มใช้ Modal ของระบบแทน
//
// ปรับตามผู้ใช้ 2026-08-29:
//   · คอลัมน์ขวา/ใต้ปฏิทิน = **การ์ดของวันที่เลือกใบเดียว** (ถอด "คิวถัดไป" และลิสต์ 7 วัน
//     ของโหมดสัปดาห์ออก — อยากดูวันไหนกดวันนั้นบนปฏิทิน)
//   · แสดงเฉพาะ "คิวที่ลงในปฏิทินจริง" — การซ้อน influencers.service_date แบบอ่านอย่างเดียว
//     (ชิป/แถว "จากเคส") ถูกถอดออกทั้งหมด
//   · แถวคิวโชว์แค่ เวลา · ชื่อคนที่มา · แพทย์ (ชื่อหัตถการไปดูในโมดัลรายละเอียด)
//   · เตือนเคสที่ "มาทำแล้วแต่เอกสารยังไม่เซน" — ดู unsignedContract (เหลือเฉพาะในโมดัล)
//
// ปรับตามผู้ใช้ 2026-09-02 ("ระบบเราใช้กันหลายทีม"):
//   · ตัวกรองมี "หัตถการ / ทีม product" — จากหัตถการของเคสที่ผูกกับคิว แต่ละทีมดูเฉพาะคิวของตัวเอง
//     (ตัวกรอง "วันรับบริการจากเคส" ที่ค้างอยู่ทั้งที่ไม่มีผลแล้วตั้งแต่ 2026-08-29 ถูกถอดออก)
//   · แบนเนอร์ "ถึงวันแล้วแต่ยังไม่มีไฟล์สัญญา" ถูกถอดออกจากหน้านี้ (ย้ายไปกระดิ่ง) — แทนที่ด้วย
//     ปุ่มแจ้งเตือน "เอกสารผ่านแล้วแต่ยังไม่ลงคิว" ท้ายแผงขวา กดแล้วพาไปบอร์ดเคสพร้อมตั้งตัวกรองให้

import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FilterChip,
  FilterSection,
  FilterSummary,
  type FilterSummaryChip,
  InfluFilterButton,
  useInfluFilters,
} from "@/influ/components/influ-filter-panel";
import {
  Badge,
  Button,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { formatDate, todayISO } from "@/lib/format";
import {
  calendarTimeLabel,
  INFLU_CALENDAR_KIND_ORDER,
  INFLU_CALENDAR_KINDS,
  INFLU_PRODUCT_TEAM_ORDER,
  INFLU_PRODUCT_TEAMS,
  memoApprovedNeedsBooking,
  shortTime,
} from "@/influ/lib/influ-constants";
import { logInflu } from "@/influ/lib/influ-log";
import { notifyInfluByCase } from "@/influ/lib/influ-notify";
import { createClient } from "@/lib/supabase/client";
import type {
  DoctorRow,
  InfluCalendarEventRow,
  InfluCalendarKind,
  InfluencerRow,
  InfluProductTeam,
} from "@/lib/types";
import { DoctorNameChip, DoctorSelect } from "../influencers/doctor-select";
import { CALENDAR_EVENT_SELECT } from "./calendar-query";

/* ---------- types ที่หน้า server ส่งลงมา ---------- */

/** คิวบนปฏิทิน + ข้อมูลเคสที่ join มา (คิวเก่าอาจผูกกับคนที่ถูก archive แล้ว)
    `contract_file_path` = เตือนเคสที่มาทำแล้วแต่ยังไม่เซนสัญญา (unsignedContract ในโมดัล)
    `procedures` = หัตถการของเคส (ชื่อ + ทีม product) สำหรับตัวกรอง "หัตถการ / ทีม" + ช่องค้นหา */
export type CalendarEvent = InfluCalendarEventRow & {
  influencer:
    | (Pick<
        InfluencerRow,
        "id" | "first_name" | "last_name" | "nickname" | "contract_file_path"
      > & {
        procedures: { name: string; product_team: InfluProductTeam }[];
      })
    | null;
};

/** influencer สำหรับตัวเลือกในฟอร์มเพิ่ม/แก้คิว (doctor_name ใช้เติมแพทย์ให้อัตโนมัติ)
    stage/completed/declined_at ใช้นับ "เอกสารผ่านแล้วแต่ยังไม่ลงคิว" (memoApprovedNeedsBooking) */
export type CalendarInflu = Pick<
  InfluencerRow,
  | "id"
  | "first_name"
  | "last_name"
  | "nickname"
  | "round_no"
  | "doctor_name"
  | "stage"
  | "completed"
  | "declined_at"
>;

/* ---------- helper ระดับโมดูล ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** สร้าง YYYY-MM-DD จากปี/เดือน(0-based)/วัน — ไม่แปลง timezone จึงไม่มีวันเพี้ยน */
const isoOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/* ชื่อเดือน/วันแบบตายตัว — ไม่ใช้ toLocaleDateString กับหัวข้อ กัน SSR/CSR ได้คนละคำ */
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
];

const THAI_WEEKDAYS_FULL = [
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
  "อาทิตย์",
];

/* สัปดาห์เริ่มวันจันทร์ — อาทิตย์อยู่คอลัมน์ท้ายและเป็นโทนแดง */
const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

/** Date จาก YYYY-MM-DD แบบ local — ห้าม new Date(iso) ตรงๆ (parse เป็น UTC วันเพี้ยนได้) */
const dateOf = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** ดัชนีคอลัมน์แบบจันทร์ = 0 … อาทิตย์ = 6 */
const mondayIndex = (iso: string) => (dateOf(iso).getDay() + 6) % 7;

/** join ข้อมูลเคสมาด้วยทุกครั้งที่ insert/update — state ฝั่งจอต้องมีชื่อ/หัตถการไว้แสดง+กรอง
    (string อยู่ที่ calendar-query.ts เพราะ page.tsx ฝั่ง server ใช้ตัวเดียวกัน) */
const EVENT_SELECT = CALENDAR_EVENT_SELECT;

/** คีย์ตัวกรอง "หัตถการ / ทีม" — ทีม product ของหัตถการในเคส หรือ "none" = คิวทั่วไป/เคสยังไม่ระบุหัตถการ */
type CalendarTeamKey = InfluProductTeam | "none";

/** ทีม product ทั้งหมดที่คิวนี้เกี่ยวข้อง (เคสหนึ่งมีหลายหัตถการต่างทีมได้ — โผล่ทุกทีมที่ติด) */
const teamsOf = (e: CalendarEvent): CalendarTeamKey[] => {
  const procs = e.influencer?.procedures ?? [];
  if (procs.length === 0) return ["none"];
  return [...new Set(procs.map((p) => p.product_team))];
};

/** ชื่อหัตถการของเคสที่ผูกกับคิว — ใส่ใน haystack ของช่องค้นหา (พิมพ์ "จมูก" แล้วเจอคิวของเคสนั้น) */
const procedureNamesOf = (e: CalendarEvent): string =>
  (e.influencer?.procedures ?? []).map((p) => p.name).join(" ");

const nameOf = (
  i: Pick<InfluencerRow, "first_name" | "last_name" | "nickname"> | null
): string => {
  if (!i) return "";
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
};

/** ชื่อสั้นสำหรับชิปในช่องวัน — ใช้ชื่อเล่นก่อน (ช่องแคบ ชื่อเต็มอ่านไม่ทัน) */
const nickOf = (
  i: Pick<InfluencerRow, "first_name" | "last_name" | "nickname"> | null
): string => {
  if (!i) return "";
  return i.nickname?.trim() || i.first_name?.trim() || "";
};

/** เรียงคิวในหนึ่งวัน — เริ่มก่อนอยู่บนสุด เริ่มทีหลังไล่ลงล่าง
    คิวที่ยังไม่เคาะเวลา (ทั้งวัน) ไปอยู่ล่างสุด เพราะยังไม่รู้ว่าแทรกช่วงไหน */
const sortEvents = (a: CalendarEvent, b: CalendarEvent) => {
  if (a.start_time && !b.start_time) return -1;
  if (!a.start_time && b.start_time) return 1;
  if (a.start_time && b.start_time && a.start_time !== b.start_time)
    return a.start_time.localeCompare(b.start_time);
  return a.title.localeCompare(b.title, "th");
};

/** คิว "มาทำแล้วแต่เอกสารยังไม่เซน" — เกิดนานๆ ครั้ง แต่ทีมต้องรู้ให้ทัน (ผู้ใช้ 2026-08-29)
    เกณฑ์: คิว "รับบริการ" ที่ถึงวันแล้ว (วันนี้/เลยมาแล้ว) แต่เคสยังไม่มีไฟล์สัญญาที่เซน
    — คิวในอนาคตยังไม่ผิดปกติ (มักเซนกันวันเข้ารับบริการ) จึงไม่นับ
    เกณฑ์ "เซนแล้ว" = influencers.contract_file_path มีค่า (ตัวเดียวกับที่ทำให้เคส
    เริ่มนับสัญญา — ดูขั้น "สัญญา + วันรับบริการ" ใน /influencers/[id]) */
const unsignedContract = (e: CalendarEvent, today: string) =>
  e.kind === "service" &&
  e.influencer !== null &&
  !e.influencer.contract_file_path &&
  e.event_date <= today;

/** ช่องวันทั้งหมดของเดือนที่ครอบวัน anchor (เติมช่องว่างหน้า/หลังให้ครบสัปดาห์ เริ่มวันจันทร์)
    — null = ช่องว่างนอกเดือน */
function monthCells(anchorISO: string): (string | null)[] {
  const [y, m] = anchorISO.split("-").map(Number);
  const lead = mondayIndex(isoOf(y, m - 1, 1));
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(isoOf(y, m - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** "2026-08-29" → "สิงหาคม 2569" */
const monthTitleOf = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
};

/** "2026-08-29" → "เสาร์ที่ 29 สิงหาคม 2569" */
const thaiDayTitle = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${THAI_WEEKDAYS_FULL[mondayIndex(iso)]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
};

/** เลื่อนวันแบบ ISO */
function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** ขยับเดือนโดยคงวันที่เดิมไว้ (เดือนปลายทางสั้นกว่า = ตกมาวันสุดท้ายของเดือนนั้น)
    — วันที่เลือกเป็น state ตัวเดียวของหน้า เดือนที่โชว์คำนวณจากมัน */
function shiftMonth(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const daysInTarget = new Date(y, m + delta, 0).getDate();
  const dt = new Date(y, m - 1 + delta, Math.min(d, daysInTarget));
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** 7 วันของสัปดาห์ (จันทร์–อาทิตย์) ที่ครอบวัน anchor */
function weekDaysOf(anchorISO: string): string[] {
  const monday = addDaysISO(anchorISO, -mondayIndex(anchorISO));
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

/** หัวช่วงสัปดาห์ เช่น "17 – 23 สิงหาคม 2569" (คร่อมเดือน = "28 ก.ค. – 3 ส.ค. 2569") */
function weekLabel(days: string[]): string {
  const [ay, am, ad] = days[0].split("-").map(Number);
  const [by, bm, bd] = days[6].split("-").map(Number);
  if (ay === by && am === bm) return `${ad} – ${bd} ${monthTitleOf(days[6])}`;
  const shortM = (m: number) => THAI_MONTHS[m - 1].slice(0, 3);
  return `${ad} ${shortM(am)} – ${bd} ${shortM(bm)} ${by + 543}`;
}

/* ---------- ฟอร์มคิว ---------- */

type FormState = {
  /** null = เพิ่มใหม่, มีค่า = แก้ไขคิวเดิม */
  id: string | null;
  kind: InfluCalendarKind;
  influencerId: string;
  title: string;
  doctor: string;
  date: string;
  start: string;
  end: string;
  location: string;
  note: string;
};

const emptyForm = (dateISO: string): FormState => ({
  id: null,
  kind: "service",
  influencerId: "",
  title: "",
  doctor: "",
  date: dateISO,
  start: "",
  end: "",
  location: "",
  note: "",
});

const formOf = (e: CalendarEvent): FormState => ({
  id: e.id,
  kind: e.kind,
  influencerId: e.influencer_id ?? "",
  title: e.title,
  doctor: e.doctor_name ?? "",
  date: e.event_date,
  start: shortTime(e.start_time) ?? "",
  end: shortTime(e.end_time) ?? "",
  location: e.location ?? "",
  note: e.note ?? "",
});

/* ---------- ชุดตัวกรอง (ชิปประเภท + แพทย์) ----------
   ใช้ร่วม 2 ที่: แถว inline ใต้ toolbar (จอ ≥sm) และ bottom sheet บนมือถือ —
   แยกเป็น component ระดับโมดูล กัน logic ตัวกรองแตกเป็นสองสำเนา */

/** ตัวกรองของปฏิทิน — เก็บเป็น array (ต้อง JSON.stringify ลง localStorage)
    ค่าที่บันทึกไว้ก่อน 2026-09-02 อาจมีคีย์ `showServiceDates` ค้างอยู่ — ไม่มีผลอะไร
    (useInfluFilters เติมค่าโรงงานให้คีย์ที่ขาด ส่วนคีย์เกินถูกเมิน) */
type CalendarFilters = {
  hiddenKinds: InfluCalendarKind[];
  /** ชื่อแพทย์ ("" = ทุกคน) */
  doctor: string;
  /** ทีม product ของหัตถการในเคสที่ผูกกับคิว (ว่าง = ทุกทีม) — ระบบใช้หลายทีม
      แต่ละทีมเลือกดูเฉพาะคิวของตัวเอง (ผู้ใช้ 2026-09-02) */
  teams: CalendarTeamKey[];
};

const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  hiddenKinds: [],
  doctor: "",
  teams: [],
};

/** ชิปสรุปตัวกรองที่เปิดอยู่ — โชว์ใต้แถบเครื่องมือเสมอ ปลดทีละอันได้ (กติกาทุกหน้าในระบบ) */
function calendarFilterChips(
  f: CalendarFilters
): FilterSummaryChip<CalendarFilters>[] {
  const out: FilterSummaryChip<CalendarFilters>[] = [];
  if (f.hiddenKinds.length) {
    out.push({
      key: "kinds",
      label: `ซ่อน: ${f.hiddenKinds
        .map((k) => INFLU_CALENDAR_KINDS[k].short)
        .join(", ")}`,
      next: { ...f, hiddenKinds: [] },
    });
  }
  if (f.teams.length) {
    out.push({
      key: "teams",
      label: `หัตถการ: ${f.teams
        .map((t) => (t === "none" ? "ไม่ระบุ" : INFLU_PRODUCT_TEAMS[t].label))
        .join(", ")}`,
      next: { ...f, teams: [] },
    });
  }
  if (f.doctor) {
    out.push({
      key: "doctor",
      label: `แพทย์: ${f.doctor}`,
      next: { ...f, doctor: "" },
    });
  }
  return out;
}

/** ตัวกรองของปฏิทิน — เนื้อในแผงลอย (shell ใช้ InfluFilterButton ของกลาง) */
function CalendarFilterSections({
  hiddenKinds,
  onToggleKind,
  teams,
  teamCounts,
  onToggleTeam,
  doctorOptions,
  doctorFilter,
  onDoctorFilter,
}: {
  hiddenKinds: Set<InfluCalendarKind>;
  onToggleKind: (kind: InfluCalendarKind) => void;
  teams: CalendarTeamKey[];
  /** จำนวนคิวต่อทีม (นับจากคิวทั้งหมด ไม่ผูกตัวกรอง — เทียบยอดข้ามทีมได้เสมอ) */
  teamCounts: Map<CalendarTeamKey, number>;
  onToggleTeam: (team: CalendarTeamKey) => void;
  doctorOptions: string[];
  doctorFilter: string;
  onDoctorFilter: (name: string) => void;
}) {
  return (
    <>
      <FilterSection title="ประเภทคิว" hint="ติ๊กออก = ซ่อนประเภทนั้นจากปฏิทิน">
        <div className="flex flex-wrap gap-1.5">
          {INFLU_CALENDAR_KIND_ORDER.map((k) => {
            const meta = INFLU_CALENDAR_KINDS[k];
            const on = !hiddenKinds.has(k);
            return (
              <FilterChip key={k} active={on} onClick={() => onToggleKind(k)}>
                <span
                  className={`h-2 w-2 rounded-full ${on ? meta.dot : "bg-stone-300"}`}
                />
                {meta.short}
              </FilterChip>
            );
          })}
        </div>
      </FilterSection>

      {/* ระบบใช้หลายทีม — ทีมที่คิวเกี่ยวข้องอ่านจากหัตถการของเคส (influ_procedure_items.product_team)
          เลือกได้หลายทีม · ไม่เลือก = ทุกทีม */}
      <FilterSection
        title="หัตถการ / ทีม product"
        hint="ดูจากหัตถการของเคสที่ผูกกับคิว — ไม่เลือก = ทุกทีม · “ไม่ระบุ” = คิวทั่วไป หรือเคสที่ยังไม่ระบุหัตถการ"
      >
        <div className="flex flex-wrap gap-1.5">
          {INFLU_PRODUCT_TEAM_ORDER.map((t) => (
            <FilterChip
              key={t}
              active={teams.includes(t)}
              onClick={() => onToggleTeam(t)}
            >
              {INFLU_PRODUCT_TEAMS[t].label}
              <span className="tabular-nums text-stone-400">
                {teamCounts.get(t) ?? 0}
              </span>
            </FilterChip>
          ))}
          <FilterChip
            active={teams.includes("none")}
            onClick={() => onToggleTeam("none")}
          >
            ไม่ระบุ / คิวทั่วไป
            <span className="tabular-nums text-stone-400">
              {teamCounts.get("none") ?? 0}
            </span>
          </FilterChip>
        </div>
      </FilterSection>

      {doctorOptions.length > 0 && (
        <FilterSection title="แพทย์">
          <Select
            aria-label="กรองตามแพทย์"
            value={doctorFilter}
            onChange={(e) => onDoctorFilter(e.target.value)}
          >
            <option value="">แพทย์: ทั้งหมด</option>
            {doctorOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </FilterSection>
      )}
    </>
  );
}

/* ---------- การ์ดคิวรายวัน (แถบวันที่ไล่เฉดซ้าย + รายการคิวขวา) ----------
   แถวคิวโชว์แค่ เวลา · ชื่อคนที่มา · แพทย์ (คำสั่งผู้ใช้ 2026-08-29) —
   ชื่อหัตถการ/สถานที่/หมายเหตุ อยู่ในโมดัลรายละเอียด */

function DayCard({
  dateISO,
  events,
  today,
  doctors,
  canEdit,
  onOpen,
  onToggleDone,
  onAdd,
}: {
  dateISO: string;
  events: CalendarEvent[];
  today: string;
  doctors: DoctorRow[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  /** ติ๊ก "เสร็จแล้ว" จากลิสต์ได้เลย ไม่ต้องเปิดโมดัล (พฤติกรรมเดิมของแผงข้าง) */
  onToggleDone: (event: CalendarEvent) => void;
  /** ปุ่มเพิ่มคิวของวันนั้น (โชว์ตอนวันนั้นยังว่าง) */
  onAdd?: () => void;
}) {
  const dayNum = Number(dateISO.slice(8));
  const isToday = dateISO === today;

  return (
    <article className="flex overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-white/70">
      <span
        className={`flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-3 text-cream sm:w-16 ${
          isToday
            ? "bg-gradient-to-b from-brand-600 to-brand-700"
            : "bg-gradient-to-b from-brand-500 to-brand-600"
        }`}
      >
        <span className="text-[11px] font-medium opacity-90">
          {WEEKDAYS[mondayIndex(dateISO)]}
        </span>
        <span className="font-display text-2xl font-semibold leading-none">
          {dayNum}
        </span>
        {isToday && <span className="text-[9px] opacity-90">วันนี้</span>}
      </span>

      <div className="min-w-0 flex-1 divide-y divide-stone-100">
        {events.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-4">
            <p className="text-sm text-stone-400">ยังไม่มีคิวในวันนี้</p>
            {canEdit && onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-11"
              >
                <Plus size={13} /> เพิ่มคิว
              </button>
            )}
          </div>
        ) : (
          events.map((ev) => {
            const label = nameOf(ev.influencer) || ev.title;
            return (
              // แถวคิว = 2 ปุ่มเรียงกัน (ห้ามซ้อน button ใน button) — ปุ่มหลักเปิดรายละเอียด
              // ปุ่มขวาติ๊กเสร็จ/ยังไม่เสร็จได้จากลิสต์เลย
              <div key={ev.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => onOpen(ev.id)}
                  aria-label={`ดูรายละเอียดคิว ${calendarTimeLabel(
                    ev.start_time,
                    ev.end_time
                  )} ${label}`}
                  className={`flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-3 pl-3.5 text-left transition-colors hover:bg-brand-50/60 max-sm:min-h-14 ${
                    ev.done ? "opacity-55" : ""
                  }`}
                >
                  <span className="flex w-[5.25rem] shrink-0 flex-col">
                    <span className="text-[13px] font-semibold text-stone-800 tabular-nums">
                      {calendarTimeLabel(ev.start_time, ev.end_time)}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {INFLU_CALENDAR_KINDS[ev.kind].short}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          INFLU_CALENDAR_KINDS[ev.kind].dot
                        }`}
                      />
                      <span
                        className={`truncate text-[15px] font-medium text-stone-800 ${
                          ev.done ? "line-through" : ""
                        }`}
                      >
                        {label}
                      </span>
                    </span>
                    {ev.doctor_name && (
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <DoctorNameChip
                          name={ev.doctor_name}
                          doctors={doctors}
                        />
                      </span>
                    )}
                  </span>
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onToggleDone(ev)}
                    title={
                      ev.done
                        ? "ทำเครื่องหมายว่ายังไม่เสร็จ"
                        : "ทำเครื่องหมายว่าเสร็จแล้ว"
                    }
                    aria-label={`${ev.done ? "ยกเลิกสถานะเสร็จ" : "ทำเครื่องหมายว่าเสร็จ"}: ${label}`}
                    className="flex w-12 shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-brand-50/60 active:scale-90"
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        ev.done
                          ? "border-emerald-400 bg-emerald-400 text-white"
                          : "border-stone-300 bg-white hover:border-brand-400"
                      }`}
                    >
                      {ev.done && <Check size={12} />}
                    </span>
                  </button>
                ) : (
                  <span className="flex w-12 shrink-0 items-center justify-center">
                    <span
                      title={ev.done ? "เสร็จแล้ว" : "ยังไม่เสร็จ"}
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        ev.done
                          ? "border-emerald-300 bg-emerald-100 text-emerald-600"
                          : "border-stone-200 bg-stone-50"
                      }`}
                    >
                      {ev.done && <Check size={12} />}
                    </span>
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}

/* ---------- โมดัลรายละเอียดคิว ---------- */

function EventDetailModal({
  event,
  today,
  doctors,
  canEdit,
  error,
  onEdit,
  onDelete,
  onToggleDone,
  onClose,
}: {
  event: CalendarEvent;
  today: string;
  doctors: DoctorRow[];
  canEdit: boolean;
  error: string | null;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onToggleDone: () => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = INFLU_CALENDAR_KINDS[event.kind];
  const unsigned = unsignedContract(event, today);

  return (
    <Modal open onClose={onClose} title={thaiDayTitle(event.event_date)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={`border ${meta.chip}`}>{meta.label}</Badge>
          {event.done && (
            <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-700">
              <Check size={11} /> เสร็จแล้ว
            </Badge>
          )}
        </div>

        <h3
          className={`text-base font-semibold text-stone-900 ${
            event.done ? "line-through opacity-60" : ""
          }`}
        >
          {event.title}
        </h3>

        <dl className="space-y-2.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-xs text-stone-400">เวลา</dt>
            <dd className="flex items-center gap-1 font-medium text-stone-700 tabular-nums">
              <Clock3 size={13} className="text-stone-400" />
              {calendarTimeLabel(event.start_time, event.end_time)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-xs text-stone-400">Influencer</dt>
            <dd className="min-w-0 flex-1">
              {event.influencer ? (
                <Link
                  href={`/influencers/${event.influencer.id}`}
                  className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800"
                >
                  {nameOf(event.influencer)}
                  <ExternalLink size={11} />
                </Link>
              ) : (
                <span className="text-stone-400">ไม่ระบุ (คิวทั่วไป)</span>
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-xs text-stone-400">แพทย์</dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1 text-stone-700">
              {event.doctor_name ? (
                <DoctorNameChip name={event.doctor_name} doctors={doctors} />
              ) : (
                <>
                  <Stethoscope size={13} className="shrink-0 text-stone-400" />
                  <span className="text-stone-400">ยังไม่ระบุ</span>
                </>
              )}
            </dd>
          </div>
          {event.location && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-xs text-stone-400">สถานที่</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-1 text-stone-700">
                <MapPin size={13} className="shrink-0 text-stone-400" />
                {event.location}
              </dd>
            </div>
          )}
          {event.note && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-xs text-stone-400">หมายเหตุ</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap text-stone-600">
                {event.note}
              </dd>
            </div>
          )}
        </dl>

        {/* เตือน "มาทำแล้วแต่เอกสารยังไม่เซน" — เกิดนานๆ ครั้ง แต่ปล่อยไว้แล้วเคสค้าง
            (อัพไฟล์สัญญา = ระบบเริ่มนับสัญญา + สร้าง checklist ให้เอง) */}
        {unsigned && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle size={14} className="shrink-0" />
              เคสนี้ยังไม่มีไฟล์สัญญาที่เซน
            </p>
            <p className="mt-1 text-xs text-amber-700">
              คิวรับบริการถึงวันแล้ว ({formatDate(event.event_date)})
              แต่ยังไม่ได้อัพไฟล์สัญญาที่เซนในหน้าเคส —
              เคสจะยังไม่เริ่มนับสัญญาและไม่ขึ้นในหน้า Follow Up
            </p>
            {event.influencer && (
              <Link
                href={`/influencers/${event.influencer.id}`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-11"
              >
                เปิดเคสไปอัพไฟล์สัญญา <ExternalLink size={12} />
              </Link>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={onToggleDone}
            >
              <Check size={14} />
              {event.done ? "ยังไม่เสร็จ" : "เสร็จแล้ว"}
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={onEdit}
            >
              <Pencil size={14} /> แก้ไข
            </Button>
            <Button
              variant="danger"
              className="px-3 py-1.5 text-xs"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} /> ลบ
            </Button>
          </div>
        )}

        {confirmDelete && (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 animate-fade-in">
            ลบคิวนี้ออกจากปฏิทิน?
            <Button
              variant="secondary"
              className="px-2.5 py-1 text-xs"
              onClick={() => setConfirmDelete(false)}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              className="px-2.5 py-1 text-xs"
              onClick={async () => {
                setConfirmDelete(false);
                await onDelete();
              }}
            >
              ยืนยันลบ
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- โมดัลเพิ่ม/แก้คิว ---------- */

function EventFormModal({
  initial,
  influencers,
  doctors,
  saving,
  error,
  onSave,
  onClose,
}: {
  initial: FormState;
  influencers: CalendarInflu[];
  doctors: DoctorRow[];
  saving: boolean;
  error: string | null;
  onSave: (form: FormState) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  /** เลือก influencer แล้วเติมแพทย์ของเคสนั้นให้อัตโนมัติ (ถ้ายังไม่ได้กรอกเอง) */
  const pickInfluencer = (id: string) => {
    const influ = influencers.find((i) => i.id === id);
    setForm((f) => ({
      ...f,
      influencerId: id,
      doctor: f.doctor.trim() === "" ? (influ?.doctor_name ?? "") : f.doctor,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.date) {
      setFormError("กรุณาเลือกวันที่");
      return;
    }
    // กรอกเฉพาะเวลาสิ้นสุดจะบันทึกได้แต่ไม่ถูกแสดงที่ไหนเลย (calendarTimeLabel คืน "ทั้งวัน"
    // เมื่อไม่มีเวลาเริ่ม) — บอกให้กรอกเวลาเริ่มก่อน ดีกว่าปล่อยให้ค่าหายเงียบๆ
    if (form.end && !form.start) {
      setFormError("กรุณากรอกเวลาเริ่มด้วย (หรือลบเวลาสิ้นสุดออกถ้าเป็นคิวทั้งวัน)");
      return;
    }
    if (form.start && form.end && form.end <= form.start) {
      setFormError("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
      return;
    }
    const ok = await onSave(form);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? "แก้ไขคิว" : "เพิ่มคิว Influ"}
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="cal-influ">Influencer</Label>
          <Select
            id="cal-influ"
            value={form.influencerId}
            onChange={(e) => pickInfluencer(e.target.value)}
          >
            <option value="">— ไม่ระบุ (คิวทั่วไป) —</option>
            {/* คนเดิมเข้ามาหลายรอบมีหลายเคส — บอกรอบกำกับ ให้คิวผูกกับเคสรอบที่ถูก
                (ป้าย "รอลงคิวหมอ" เช็คคิว service ต่อเคส ผูกผิดรอบ = ป้ายไม่ดับ) */}
            {influencers.map((i) => (
              <option key={i.id} value={i.id}>
                {nameOf(i)}
                {i.round_no > 1 ? ` · รอบ ${i.round_no}` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cal-kind">ประเภทคิว</Label>
          <Select
            id="cal-kind"
            value={form.kind}
            onChange={(e) => patch({ kind: e.target.value as InfluCalendarKind })}
          >
            {INFLU_CALENDAR_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {INFLU_CALENDAR_KINDS[k].label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cal-title">รายละเอียดคิว</Label>
          <Input
            id="cal-title"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={INFLU_CALENDAR_KINDS[form.kind].label}
          />
        </div>

        <div>
          <Label htmlFor="cal-doctor">แพทย์ที่รับเคส</Label>
          <DoctorSelect
            id="cal-doctor"
            doctors={doctors}
            value={form.doctor}
            onChange={(name) => patch({ doctor: name })}
          />
        </div>

        <div>
          <Label htmlFor="cal-date">วันที่</Label>
          <Input
            id="cal-date"
            type="date"
            value={form.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cal-start">เวลาเริ่ม</Label>
            <Input
              id="cal-start"
              type="time"
              value={form.start}
              onChange={(e) => patch({ start: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="cal-end">ถึงเวลา</Label>
            <Input
              id="cal-end"
              type="time"
              value={form.end}
              onChange={(e) => patch({ end: e.target.value })}
            />
          </div>
        </div>
        <p className="-mt-1 text-xs text-stone-400">
          ไม่กรอกเวลา = คิวทั้งวัน (ยังไม่เคาะเวลา)
        </p>

        <div>
          <Label htmlFor="cal-location">สถานที่ / ช่องทาง</Label>
          <Input
            id="cal-location"
            value={form.location}
            onChange={(e) => patch({ location: e.target.value })}
            placeholder="เช่น สตูดิโอชั้น 4, คลินิกชั้น 2"
          />
        </div>

        <div>
          <Label htmlFor="cal-note">หมายเหตุ</Label>
          <Textarea
            id="cal-note"
            rows={2}
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="รายละเอียดเพิ่มเติม เช่น ทีมที่ดูแล, สิ่งที่ต้องเตรียม"
          />
        </div>

        {(formError || error) && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {formError ?? error}
          </p>
        )}

        <div className="flex justify-end gap-2 pb-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" loading={saving}>
            {form.id ? "บันทึก" : "เพิ่มคิว"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- ปุ่มแจ้งเตือน "เอกสารผ่านแล้วแต่ยังไม่ลงคิว" (ท้ายแผงขวา) ----------
   ผู้ใช้ 2026-09-02: แบนเนอร์ "ถึงวันแล้วแต่ยังไม่มีไฟล์สัญญา" ไม่จำเป็นต้องอยู่หน้านี้ —
   ให้เป็นปุ่มแจ้งเตือนท้ายแผงขวาแทน กดแล้วพาไปบอร์ดเคสพร้อมตั้งตัวกรองให้อัตโนมัติ
   (deep link `?filter=needbooking_approved` → boardSeedFromParam ในบอร์ด)
   เกณฑ์ = memoApprovedNeedsBooking: ผ่านขั้น 1.2 (อัพไฟล์ Memo ที่อนุมัติ) แล้วแต่ยังไม่มีคิว
   "เข้ารับบริการ" ในปฏิทิน — ตัวเลขตรงกับชิปตัวกรอง "เอกสารผ่านแล้ว ยังไม่ลงคิว" บนบอร์ด */
function PendingBookingNotice({ cases }: { cases: CalendarInflu[] }) {
  const n = cases.length;
  if (n === 0) {
    return (
      <p className="mt-auto flex items-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/60 px-3.5 py-2.5 text-xs text-stone-500">
        <Check size={13} className="shrink-0 text-emerald-500" />
        เคสที่เอกสารผ่านแล้วลงคิวครบทุกเคส
      </p>
    );
  }
  const names = cases
    .slice(0, 3)
    .map((c) => nickOf(c) || nameOf(c))
    .join(" · ");
  return (
    <Link
      href="/influencers?filter=needbooking_approved"
      className="mt-auto flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-900 shadow-sm transition-colors hover:bg-amber-100 active:scale-[0.99] max-sm:min-h-14"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200/80 text-amber-800">
        <CalendarClock size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          เอกสารผ่านแล้วแต่ยังไม่ลงคิว
          <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
            {n} เคส
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-amber-800/80">
          {names}
          {n > 3 ? ` +${n - 3}` : ""}
        </span>
        <span className="mt-1 flex items-center gap-0.5 text-[11px] font-medium text-amber-700">
          ดูในเคสดำเนินงาน <ChevronRight size={12} />
        </span>
      </span>
    </Link>
  );
}

/* ---------- หน้าหลัก ---------- */

export function CalendarClient({
  events: initialEvents,
  influencers,
  doctors,
  userId,
  userName,
  canEdit,
  loadError,
}: {
  events: CalendarEvent[];
  influencers: CalendarInflu[];
  doctors: DoctorRow[];
  userId: string | null;
  userName: string | null;
  /** ระดับ "ดูเฉยๆ" = เปิดปฏิทินดูได้ แต่เพิ่ม/แก้/ลบ/ติ๊กเสร็จไม่ได้ */
  canEdit: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const actor = useMemo(
    () => ({ id: userId, name: userName }),
    [userId, userName]
  );
  const today = todayISO();

  const [events, setEvents] = useState(initialEvents);
  /** มุมมอง: รายเดือน (ค่าเริ่มต้น) / รายสัปดาห์ — แผ่นปฏิทินเหลือแถวเดียวและ agenda โชว์ครบ 7 วัน */
  const [view, setView] = useState<"month" | "week">("month");
  /** **state เดียวของหน้า** — เดือน/สัปดาห์ที่โชว์คำนวณจากวันที่เลือกนี้ */
  const [selected, setSelected] = useState(today);
  /** id ของคิวที่กำลังเปิดรายละเอียด (null = ปิด) */
  const [detail, setDetail] = useState<string | null>(null);
  /** ฟอร์มที่เปิดอยู่ (null = ปิด) — เก็บทั้งก้อนเพื่อ prefill ตอนแก้/สร้างจากเคส */
  const [formState, setFormState] = useState<FormState | null>(null);
  const [search, setSearch] = useState("");
  /* ตัวกรองอยู่ในปุ่มเดียว + บันทึกค่าเริ่มต้นของตัวเองได้ (กติกาทุกหน้าในระบบ)
     เก็บเป็น array ไม่ใช่ Set เพราะต้อง JSON.stringify ลง localStorage */
  const filterApi = useInfluFilters<CalendarFilters>({
    page: "calendar",
    userId: userId,
    factory: DEFAULT_CALENDAR_FILTERS,
  });
  const { doctor: doctorFilter, teams: teamFilter } = filterApi.filters;
  const hiddenKinds = useMemo<Set<InfluCalendarKind>>(
    () => new Set(filterApi.filters.hiddenKinds),
    [filterApi.filters.hiddenKinds]
  );
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** รายชื่อแพทย์สำหรับตัวกรองด้านบน — ทะเบียนหมอ (active) + ชื่อที่เคยใช้ในคิว/เคสเดิม */
  const doctorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of doctors) if (d.active) set.add(d.name);
    for (const e of events) if (e.doctor_name) set.add(e.doctor_name);
    for (const i of influencers) if (i.doctor_name) set.add(i.doctor_name);
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }, [doctors, events, influencers]);

  /* ---- กรองคิวตามคำค้น + ประเภท + ทีม/หัตถการ + แพทย์ ---- */
  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (hiddenKinds.has(e.kind)) return false;
      if (doctorFilter && e.doctor_name !== doctorFilter) return false;
      // เลือกทีมแล้ว = โชว์เฉพาะคิวที่เคสมีหัตถการของทีมนั้น (เคสหลายหัตถการต่างทีม = ผ่านทุกทีมที่ติด)
      if (teamFilter.length && !teamsOf(e).some((t) => teamFilter.includes(t)))
        return false;
      if (q === "") return true;
      return (
        e.title.toLowerCase().includes(q) ||
        nameOf(e.influencer).toLowerCase().includes(q) ||
        procedureNamesOf(e).toLowerCase().includes(q) ||
        (e.doctor_name ?? "").toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [events, search, hiddenKinds, doctorFilter, teamFilter]);

  /** จำนวนคิวต่อทีม — นับจากคิวทั้งหมด (ไม่ผูกตัวกรอง) ให้เทียบยอดข้ามทีมในแผงได้เสมอ */
  const teamCounts = useMemo(() => {
    const m = new Map<CalendarTeamKey, number>();
    for (const e of events)
      for (const t of teamsOf(e)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [events]);

  /** คิวของแต่ละวัน เรียงตามเวลา — ปฏิทินแสดงเฉพาะคิวที่ถูกลงในปฏิทินจริง
      (การซ้อน influencers.service_date แบบอ่านอย่างเดียวถูกถอดออก 2026-08-29) */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visibleEvents) {
      const list = map.get(e.event_date);
      if (list) list.push(e);
      else map.set(e.event_date, [e]);
    }
    for (const list of map.values()) list.sort(sortEvents);
    return map;
  }, [visibleEvents]);

  const eventsOf = (iso: string) => eventsByDate.get(iso) ?? [];

  /** เคสที่ "เอกสารผ่านแล้วแต่ยังไม่ลงคิว" — ปุ่มแจ้งเตือนท้ายแผงขวา
      คิดจากคิวทั้งหมด (state `events` — ลงคิวเพิ่มแล้วตัวเลขลดทันที) ไม่ผูกตัวกรอง/ค้นหา
      (สัญญาณเตือนต้องเห็นครบเสมอ กติกาเดียวกับป้าย "รอลงคิวหมอ" บนบอร์ดเคส) */
  const pendingBooking = useMemo(() => {
    const booked = new Set(
      events
        .filter((e) => e.kind === "service" && e.influencer_id !== null)
        .map((e) => e.influencer_id as string)
    );
    return influencers.filter((i) => memoApprovedNeedsBooking(i, booked));
  }, [events, influencers]);

  const monthMode = view === "month";
  const cells = useMemo(() => monthCells(selected), [selected]);
  /** จำนวนแถวสัปดาห์ของเดือนที่ดูอยู่ (4–6) — คุมความสูงแถวตอนกางเต็มจอ */
  const rowCount = cells.length / 7;
  /** 7 วันของสัปดาห์ที่กำลังดู (โหมดสัปดาห์) */
  const weekDays = useMemo(() => weekDaysOf(selected), [selected]);
  /** ช่องที่กริดจะวาด — โหมดสัปดาห์เหลือแถวเดียว (ประกาศเป็นตัวแปรเดียวกัน ไม่ map จาก
      union ของ array 2 ชนิด ซึ่ง TypeScript เรียก .map ไม่ได้) */
  const gridCells: (string | null)[] = view === "week" ? weekDays : cells;

  /* จอ ≥lg แผ่นปฏิทินสูงพอดีจอ (หน้าไม่มี scroll — กติกาผู้ใช้ 2026-08-20) ช่องวันจึงเตี้ยลง
     ตามจอจริง — วัดความสูงกริดแล้วคิดว่าช่องหนึ่งใส่ชิปได้กี่แถว (เกินโควตา = "+N") */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [chipCapacity, setChipCapacity] = useState(2);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const cellH = el.clientHeight / (view === "week" ? 1 : rowCount);
      // 40 = แถวเลขวัน + ช่องไฟ, 20 = ชิปหนึ่งบรรทัด (text-[11px] py-0.5 + gap)
      setChipCapacity(Math.min(4, Math.max(0, Math.floor((cellH - 40) / 20))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, rowCount]);

  /** เลื่อนก่อนหน้า/ถัดไป — โหมดเดือนขยับทีละเดือน โหมดสัปดาห์ขยับทีละ 7 วัน */
  const goStep = (delta: number) =>
    setSelected((d) => (view === "week" ? addDaysISO(d, delta * 7) : shiftMonth(d, delta)));

  const openForm = (preset: Partial<FormState> = {}) => {
    setActionError(null);
    setDetail(null);
    setFormState({ ...emptyForm(selected), ...preset });
  };

  const toggleKind = (kind: InfluCalendarKind) =>
    filterApi.patch({
      hiddenKinds: hiddenKinds.has(kind)
        ? filterApi.filters.hiddenKinds.filter((k: InfluCalendarKind) => k !== kind)
        : [...filterApi.filters.hiddenKinds, kind],
    });

  const toggleTeam = (team: CalendarTeamKey) =>
    filterApi.patch({
      teams: teamFilter.includes(team)
        ? teamFilter.filter((t) => t !== team)
        : [...teamFilter, team],
    });

  /* ---- บันทึกคิว (เพิ่ม/แก้) ---- */
  const saveEvent = async (form: FormState): Promise<boolean> => {
    if (!canEdit) return false;
    setSaving(true);
    setActionError(null);
    const payload = {
      influencer_id: form.influencerId || null,
      title: form.title.trim() || INFLU_CALENDAR_KINDS[form.kind].label,
      kind: form.kind,
      doctor_name: form.doctor.trim() || null,
      event_date: form.date,
      start_time: form.start || null,
      end_time: form.end || null,
      location: form.location.trim() || null,
      note: form.note.trim() || null,
    };

    if (form.id) {
      const { data, error } = await supabase
        .from("influ_calendar_events")
        .update(payload)
        .eq("id", form.id)
        .select(EVENT_SELECT)
        .single();
      setSaving(false);
      if (error || !data) {
        setActionError(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
        return false;
      }
      const saved = data as unknown as CalendarEvent;
      setEvents((cur) => cur.map((e) => (e.id === saved.id ? saved : e)));
      logInflu(supabase, actor, {
        action: "update",
        entity: "calendar_event",
        entityId: saved.id,
        influencerId: saved.influencer_id,
        influencerName: nameOf(saved.influencer) || null,
        summary: `แก้คิว "${saved.title}" (${INFLU_CALENDAR_KINDS[saved.kind].label}) วันที่ ${formatDate(saved.event_date)}`,
      });
      // คิวที่ผูกเคส = เรื่องของทีมเคสนั้น — คิวทั่วไปไม่มีใครต้องรู้เป็นการเฉพาะ
      if (saved.influencer_id)
        notifyInfluByCase(supabase, actor, {
          influencerId: saved.influencer_id,
          influencerName: nameOf(saved.influencer) || null,
          type: saved.kind === "service" ? "service_booked" : "calendar_changed",
          scope: saved.kind === "service" ? "contract" : null,
          title: `แก้คิว "${saved.title}" ของ ${nameOf(saved.influencer) || "เคส"}`,
          body: `${formatDate(saved.event_date)}${saved.start_time ? ` ${saved.start_time.slice(0, 5)} น.` : ""}${saved.doctor_name ? ` — ${saved.doctor_name}` : ""}`,
          href: "/influ-calendar",
        });
      router.refresh();
      // ย้ายคิวไปวันอื่น = ตามไปเลือกวันนั้นให้เห็นผลทันที
      setSelected(saved.event_date);
      return true;
    }

    const { data, error } = await supabase
      .from("influ_calendar_events")
      .insert({ ...payload, created_by: userId })
      .select(EVENT_SELECT)
      .single();
    setSaving(false);
    if (error || !data) {
      setActionError(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return false;
    }
    const saved = data as unknown as CalendarEvent;
    setEvents((cur) => [...cur, saved]);
    logInflu(supabase, actor, {
      action: "create",
      entity: "calendar_event",
      entityId: saved.id,
      influencerId: saved.influencer_id,
      influencerName: nameOf(saved.influencer) || null,
      summary: `เพิ่มคิว "${saved.title}" (${INFLU_CALENDAR_KINDS[saved.kind].label}) วันที่ ${formatDate(saved.event_date)}`,
    });
    if (saved.influencer_id)
      notifyInfluByCase(supabase, actor, {
        influencerId: saved.influencer_id,
        influencerName: nameOf(saved.influencer) || null,
        type: saved.kind === "service" ? "service_booked" : "calendar_changed",
        scope: saved.kind === "service" ? "contract" : null,
        title:
          saved.kind === "service"
            ? `ลงคิวเข้ารับบริการของ ${nameOf(saved.influencer) || "เคส"} แล้ว`
            : `เพิ่มคิว "${saved.title}" ของ ${nameOf(saved.influencer) || "เคส"}`,
        body: `${formatDate(saved.event_date)}${saved.start_time ? ` ${saved.start_time.slice(0, 5)} น.` : ""}${saved.doctor_name ? ` — ${saved.doctor_name}` : ""}`,
        href: "/influ-calendar",
      });
    router.refresh();
    setSelected(saved.event_date);
    return true;
  };

  const deleteEvent = async (id: string) => {
    if (!canEdit) return;
    const prev = events;
    const removed = events.find((e) => e.id === id) ?? null;
    setActionError(null);
    setEvents((cur) => cur.filter((e) => e.id !== id)); // optimistic
    const { error } = await supabase
      .from("influ_calendar_events")
      .delete()
      .eq("id", id);
    if (error) {
      setEvents(prev);
      setActionError(`ลบไม่สำเร็จ: ${error.message}`);
      return;
    }
    setDetail(null);
    if (removed) {
      logInflu(supabase, actor, {
        action: "delete",
        entity: "calendar_event",
        entityId: removed.id,
        influencerId: removed.influencer_id,
        influencerName: nameOf(removed.influencer) || null,
        summary: `ลบคิว "${removed.title}" วันที่ ${formatDate(removed.event_date)}`,
      });
      if (removed.influencer_id)
        notifyInfluByCase(supabase, actor, {
          influencerId: removed.influencer_id,
          influencerName: nameOf(removed.influencer) || null,
          type: "calendar_changed",
          // ลบคิว service = ป้าย "รอลงคิวหมอ" กลับมา ⇒ เป็นงานที่ต้องลงมือของขั้นสัญญา
          scope: removed.kind === "service" ? "contract" : null,
          baseLevel: removed.kind === "service" ? "action" : "update",
          title: `ลบคิว "${removed.title}" ของ ${nameOf(removed.influencer) || "เคส"}`,
          body: formatDate(removed.event_date),
          href: "/influ-calendar",
        });
    }
    router.refresh();
  };

  const toggleDone = async (target: CalendarEvent) => {
    if (!canEdit) return;
    const next = !target.done;
    const prev = events;
    setActionError(null);
    setEvents((cur) =>
      cur.map((e) => (e.id === target.id ? { ...e, done: next } : e))
    );
    const { error } = await supabase
      .from("influ_calendar_events")
      .update({ done: next })
      .eq("id", target.id);
    if (error) {
      setEvents(prev);
      setActionError(`บันทึกสถานะไม่สำเร็จ: ${error.message}`);
      return;
    }
    logInflu(supabase, actor, {
      action: "status",
      entity: "calendar_event",
      entityId: target.id,
      influencerId: target.influencer_id,
      influencerName: nameOf(target.influencer) || null,
      summary: `${next ? "ติ๊กเสร็จ" : "ยกเลิกติ๊กเสร็จ"}คิว "${target.title}" วันที่ ${formatDate(target.event_date)}`,
    });
    if (target.influencer_id) {
      notifyInfluByCase(supabase, actor, {
        influencerId: target.influencer_id,
        influencerName: nameOf(target.influencer) || null,
        type: "calendar_changed",
        baseLevel: "update",
        title: `${next ? "ติ๊กเสร็จ" : "ยกเลิกติ๊กเสร็จ"}คิว "${target.title}" ของ ${nameOf(target.influencer) || "เคส"}`,
        body: formatDate(target.event_date),
        href: "/influ-calendar",
      });
    }
    router.refresh();
  };

  /** ชิปสรุปตัวกรองที่เปิดอยู่ (ใต้แถบเครื่องมือ) — จำนวนชิป = เลขบนปุ่ม "ตัวกรอง" */
  const filterChips = useMemo(
    () => calendarFilterChips(filterApi.filters),
    [filterApi.filters]
  );
  const filterCount = filterChips.length;

  const detailEvent = detail
    ? (events.find((e) => e.id === detail) ?? null)
    : null;

  const selectedEvents = eventsOf(selected);

  return (
    <>
      {loadError && (
        <div className="mb-3 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}
      {actionError && (
        <div className="mb-3 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {actionError}
        </div>
      )}
      {/* แบนเนอร์ "มาทำแล้วแต่ยังไม่มีไฟล์สัญญา" ถูกถอดออกจากหน้านี้ (ผู้ใช้ 2026-09-02) —
          สัญญาณนั้นอยู่ในกระดิ่ง (influ-notification-bell) + กล่องในโมดัลรายละเอียดคิว
          ห้ามเพิ่มแบนเนอร์เตือนบนหน้ากลับมา (กติกาทั้งระบบตั้งแต่ 0095) */}
      {!canEdit && (
        <div className="mb-3 shrink-0 rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-600">
          บัญชีนี้เป็นระดับ &ldquo;Viewer&rdquo; — เปิดดูคิวได้ทั้งหมด แต่เพิ่ม/แก้/ลบคิวไม่ได้
        </div>
      )}

      {/* ---- แถบเครื่องมือแถวเดียว: เดือน|สัปดาห์ · ค้นหา · ตัวกรอง
           (การเลื่อนเดือน/ปุ่ม "วันนี้" ย้ายไปอยู่บนแผ่นปฏิทินตามภาพอ้างอิง) ---- */}
      <div className="mb-2.5 flex shrink-0 items-center gap-2 animate-fade-in-up lg:mb-2">
        <div className="flex shrink-0 rounded-full border border-stone-200 bg-white/70 p-0.5">
          {(
            [
              { key: "month", label: "เดือน" },
              { key: "week", label: "สัปดาห์" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`cursor-pointer rounded-full px-3.5 py-1 text-sm font-medium transition-all max-sm:min-h-10 lg:px-3 lg:py-0.5 lg:text-xs ${
                view === v.key
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                  : "text-stone-500 hover:text-brand-700"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา"
            className="py-1.5 pl-9 lg:py-1"
          />
        </div>
        <InfluFilterButton
          api={filterApi}
          count={filterCount}
          factory={DEFAULT_CALENDAR_FILTERS}
        >
          <CalendarFilterSections
            hiddenKinds={hiddenKinds}
            onToggleKind={toggleKind}
            teams={teamFilter}
            teamCounts={teamCounts}
            onToggleTeam={toggleTeam}
            doctorOptions={doctorOptions}
            doctorFilter={doctorFilter}
            onDoctorFilter={(doctor) => filterApi.patch({ doctor })}
          />
        </InfluFilterButton>
        {canEdit && (
          <Button
            onClick={() => openForm()}
            className="shrink-0 px-3 py-1.5 max-sm:min-h-11 lg:py-1"
          >
            <Plus size={16} />
            <span className="max-sm:sr-only">เพิ่มคิว</span>
          </Button>
        )}
      </div>

      {/* ชิปสรุป — ตัวกรองที่ซ่อนอยู่ในแผงต้องเห็นได้เสมอว่ากำลังกรองอะไร (ไม่งั้นคนคิดว่าคิวหาย)
          หน้าจอ ≥lg ห้ามมี scroll แนวตั้ง — แถวนี้ shrink-0 แล้วปฏิทินหดให้เอง */}
      <div className="shrink-0 [&>div]:mb-2.5">
        <FilterSummary
          chips={filterChips}
          onChange={filterApi.setFilters}
          onClear={() => filterApi.setFilters(DEFAULT_CALENDAR_FILTERS)}
        />
      </div>

      {/* ---- ปฏิทิน (ซ้าย) + การ์ดคิวรายวัน (ขวา บนจอ ≥lg / ใต้ปฏิทินบนจอเล็ก) ----
           ≥lg ทั้งสองคอลัมน์สูงเท่าจอ — คอลัมน์ขวาเลื่อนในตัวเอง หน้าไม่ scroll */}
      <div className="min-w-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ---------------- แผ่นปฏิทินไล่เฉด ---------------- */}
        {/* เฉดเข้มกว่าปฏิทิน Wellness หนึ่งขั้น (500→700) — ช่องนี้มีตัวเลขเล็กเต็มไปหมด
            เฉด 400 ที่หัวแผ่นทำให้ตัวเลข cream อ่านไม่ออก (contrast ~2:1) */}
        <section
          className={`flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-1.5 pb-2.5 pt-2 text-cream shadow-[0_12px_36px_rgba(94,58,49,0.22)] animate-fade-in-up sm:px-3 sm:pb-3 ${
            // เดือน = กางเต็มความสูงจอ (ตารางทั้งเดือนควรใช้พื้นที่ให้คุ้ม)
            // สัปดาห์ = แถวเดียว ปล่อยให้สูงเท่าเนื้อหา ไม่งั้นได้แผ่นไล่เฉดว่างครึ่งจอ
            monthMode ? "lg:min-h-0" : "lg:self-start"
          }`}
        >
          <header className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => goStep(-1)}
              aria-label={view === "week" ? "สัปดาห์ก่อนหน้า" : "เดือนก่อนหน้า"}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95 lg:h-9 lg:w-9"
            >
              <ChevronLeft size={22} />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-center text-xl font-semibold tracking-wide sm:text-2xl lg:text-xl">
              {view === "week" ? weekLabel(weekDays) : monthTitleOf(selected)}
            </h2>
            <button
              type="button"
              onClick={() => goStep(1)}
              aria-label={view === "week" ? "สัปดาห์ถัดไป" : "เดือนถัดไป"}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95 lg:h-9 lg:w-9"
            >
              <ChevronRight size={22} />
            </button>
          </header>

          <div className="mb-1 flex shrink-0 justify-center">
            <button
              type="button"
              onClick={() => setSelected(today)}
              className="cursor-pointer rounded-full bg-white/20 px-3.5 py-1 text-xs font-medium text-cream transition-colors hover:bg-white/30 max-sm:min-h-9"
            >
              วันนี้
            </button>
          </div>

          {/* หัวคอลัมน์วัน — อาทิตย์อยู่ท้ายและจางลงเล็กน้อย */}
          <div className="grid shrink-0 grid-cols-7">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className="py-1 text-center">
                <span
                  className={`text-[11px] font-semibold sm:text-xs ${
                    i === 6 ? "text-rose-100" : "text-cream"
                  }`}
                >
                  {w}
                </span>
              </div>
            ))}
          </div>

          {/* ช่องวัน — ตัวเลขเป็นพระเอก, มีคิว = ป้ายตัวเลขจำนวนคิวเกาะมุมขวาบน */}
          <div
            ref={gridRef}
            className={`grid min-w-0 grid-cols-7 gap-x-0.5 gap-y-1 sm:gap-x-1 ${
              monthMode
                ? `lg:min-h-0 lg:flex-1 ${
                    // แถวสัปดาห์แบ่งความสูงเท่ากันตอนกางเต็มจอ (ต้องเป็นคลาส literal ให้ Tailwind เจอ)
                    rowCount <= 4
                      ? "lg:grid-rows-4"
                      : rowCount === 5
                        ? "lg:grid-rows-5"
                        : "lg:grid-rows-6"
                  }`
                : ""
            }`}
          >
            {gridCells.map((iso, idx) => {
              if (iso === null)
                return (
                  <div
                    key={`blank-${idx}`}
                    className={`h-14 ${monthMode ? "lg:h-auto" : "lg:h-24"}`}
                  />
                );
              const evs = eventsOf(iso);
              const isSelected = iso === selected;
              const isToday = iso === today;
              const sunday = idx % 7 === 6;
              const shown = evs.slice(0, chipCapacity);
              const hidden = evs.length - shown.length;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  aria-label={`เปิดคิววันที่ ${formatDate(iso)}`}
                  aria-current={isSelected ? "date" : undefined}
                  title={`${thaiDayTitle(iso)} — ${evs.length} คิว`}
                  className={`flex h-14 min-w-0 cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-xl px-0.5 py-1 transition-all active:scale-95 lg:px-1 ${
                    monthMode ? "lg:h-auto lg:min-h-0" : "lg:h-24"
                  } ${
                    isSelected
                      ? "bg-white/15 ring-1 ring-inset ring-white/70"
                      : "hover:bg-white/10"
                  }`}
                >
                  <span className="relative shrink-0">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-all sm:text-[15px] lg:h-8 lg:w-8 lg:text-sm ${
                        isSelected
                          ? "bg-white text-brand-700 shadow-md"
                          : isToday
                            ? "bg-white/35 text-cream"
                            : sunday
                              ? "text-rose-100"
                              : "text-cream"
                      }`}
                    >
                      {Number(iso.slice(8))}
                    </span>
                    {evs.length > 0 && (
                      <span
                        className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none shadow-sm ${
                          isSelected
                            ? "bg-brand-700 text-white"
                            : "bg-white text-brand-700"
                        }`}
                      >
                        {evs.length}
                      </span>
                    )}
                  </span>

                  {/* ชิปคิวในช่อง — โชว์เท่าที่ความสูงช่องรับไหว (จอเล็กช่องเตี้ย = ไม่มีชิป) */}
                  {chipCapacity > 0 && (
                    <span className="hidden w-full min-w-0 flex-col gap-0.5 lg:flex">
                      {shown.map((ev) => (
                        <span
                          key={ev.id}
                          className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight text-brand-900 ${
                            ev.done
                              ? "bg-white/50 line-through opacity-70"
                              : "bg-white/90"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              INFLU_CALENDAR_KINDS[ev.kind].dot
                            }`}
                          />
                          <span className="shrink-0 font-semibold tabular-nums">
                            {shortTime(ev.start_time) ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {nickOf(ev.influencer) || ev.title}
                          </span>
                        </span>
                      ))}
                      {hidden > 0 && (
                        <span className="px-1 text-left text-[10px] font-medium leading-tight text-cream/80">
                          +{hidden} คิว
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------------- การ์ดคิวของ "วันที่เลือก" ----------------
            ผู้ใช้ 2026-08-29: ให้เหลือการ์ดของวันที่เลือกใบเดียว (เดิมมี "คิวถัดไป" อีก 4 ใบ
            และโหมดสัปดาห์กาง 7 ใบ) — อยากดูวันอื่นให้กดวันบนปฏิทิน ทั้ง 2 โหมดจึงใช้ก้อนนี้ร่วมกัน */}
        {/* flex-col ให้ปุ่มแจ้งเตือนท้ายแผง (mt-auto) ดันไปชิดล่างสุดเมื่อคอลัมน์ยังมีที่เหลือ */}
        <section className="mt-4 flex flex-col gap-2.5 lg:mt-0 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 px-1">
            <h3 className="text-sm font-semibold tracking-wide text-brand-700">
              {selected === today ? "วันนี้" : "วันที่เลือก"}
            </h3>
            <span className="text-xs text-stone-500">
              {thaiDayTitle(selected)}
            </span>
            <span className="text-xs text-stone-400">
              · {selectedEvents.length} คิว
            </span>
            {/* ทางลัดเพิ่มคิวของวันที่เลือก — ปุ่มบน toolbar อยู่สุดหน้าจอ พอเลื่อนลงมา
                อ่านการ์ดคิวบนมือถือแล้วมันหลุดจอไปแล้ว */}
            {canEdit && (
              <button
                type="button"
                onClick={() => openForm()}
                className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 max-sm:min-h-10"
              >
                <Plus size={13} /> เพิ่มคิว
              </button>
            )}
          </div>

          <DayCard
            dateISO={selected}
            events={selectedEvents}
            today={today}
            doctors={doctors}
            canEdit={canEdit}
            onOpen={setDetail}
            onToggleDone={(e) => void toggleDone(e)}
            onAdd={() => openForm()}
          />

          {/* ล่างสุดของแผงขวา — ปุ่มแจ้งเตือนเคสที่เอกสารผ่านแล้วแต่ยังไม่ลงคิว (ผู้ใช้ 2026-09-02) */}
          <PendingBookingNotice cases={pendingBooking} />
        </section>
      </div>

      {detailEvent && (
        <EventDetailModal
          key={detailEvent.id}
          event={detailEvent}
          today={today}
          doctors={doctors}
          canEdit={canEdit}
          error={actionError}
          onEdit={() => {
            setDetail(null);
            setFormState(formOf(detailEvent));
          }}
          onDelete={() => deleteEvent(detailEvent.id)}
          onToggleDone={() => void toggleDone(detailEvent)}
          onClose={() => setDetail(null)}
        />
      )}

      {formState && (
        <EventFormModal
          key={formState.id ?? `new-${formState.date}`}
          initial={formState}
          influencers={influencers}
          doctors={doctors}
          saving={saving}
          error={actionError}
          onSave={saveEvent}
          onClose={() => setFormState(null)}
        />
      )}
    </>
  );
}
