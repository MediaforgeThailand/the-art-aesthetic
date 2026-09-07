"use client";

import {
  CalendarClock,
  Eye,
  FileClock,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSyncedState } from "@/lib/use-synced-state";
import {
  FilterSummary,
  InfluFilterButton,
  useInfluFilters,
} from "@/influ/components/influ-filter-panel";
import { Button, Card, ConfirmDialog, EmptyState } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { todayISO } from "@/lib/format";
import { logInflu } from "@/influ/lib/influ-log";
import { notifyInflu } from "@/influ/lib/influ-notify";
import {
  type CaseHashtag,
  caseHashtags,
  INFLU_STAGE,
  INFLU_STAGE_LAST,
  isLaterSection,
  memoApprovedNeedsBooking,
  normalizeRoles,
  sizeGroupFromFollowers,
} from "@/influ/lib/influ-constants";
import type { InfluLevel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import type {
  DoctorRow,
  InfluCampaignDefRow,
  InfluProductTeam,
  InfluProfileRow,
  InfluServiceRow,
  InfluSizeGroup,
} from "@/lib/types";
import type { CaseAssignee, InfluPerson } from "./assignees";
import {
  BoardFilterSections,
  boardFilterChips,
  boardFilterCount,
  type BoardFilters,
  boardSeedFromParam,
  DEFAULT_BOARD_FILTERS,
  matchBoardFilters,
  StageTrackerPicker,
} from "./board-filters";
import type { InfluLinkLite } from "./influ-links";
import { NewCaseModal } from "./new-case-modal";
import type {
  PriceCatalogEntry,
  PromoCatalogEntry,
} from "./procedure-items-editor";
import {
  boardPos,
  InfluBoard,
  influName,
  type InfluencerListRow,
  type InfluStats,
  influStatusOf,
  type InfluTaskLite,
  needsDoctorBooking,
} from "./influ-board";

// ที่อยู่ใหม่ของ type/helper อยู่ใน influ-board.tsx — re-export ให้หน้าอื่น (influ-gallery) import ได้เหมือนเดิม
export { influName } from "./influ-board";
export type { InfluencerListRow } from "./influ-board";

/** หัตถการของเคส (ย่อ) — ใช้สร้างแฮชแท็ก #หัตถการ/#โปรโมชัน บนการ์ด (0093) */
export type CaseProcedureLite = {
  influencer_id: string;
  product_team: InfluProductTeam;
  /** โปรที่ผูกไว้ (0090) — null = หัตถการเดี่ยว ไม่ได้มาจากโปร */
  promo: { sku: string } | null;
};

/** ผู้รับผิดชอบของเคส (แถวดิบจาก influ_assignees) — page.tsx ส่งมาทั้งระบบครั้งเดียว */
export type CaseAssigneeRow = {
  influencer_id: string;
  user_id: string;
  scopes: string[];
};

/** ผู้ใช้ปัจจุบัน + ระดับสิทธิ์ในระบบ Influencer (คำนวณฝั่ง server ส่งลงมา) */
type InfluMe = {
  id: string | null;
  name: string;
  level: InfluLevel;
  /** hunter ขึ้นไป — เพิ่ม/แก้ข้อมูลได้ */
  canEdit: boolean;
  /** ผู้ดูแลระบบ Influ — ทะเบียนหมอ, ลบเคสของคนอื่น, log, ถังขยะ */
  canManage: boolean;
};

export function InfluencersClient({
  influencers,
  tasks,
  doctors,
  campaigns,
  procedureItems,
  sourceLinks,
  bookedInfluIds,
  priceCatalog,
  promoCatalog,
  profiles,
  services,
  people,
  assignees,
  initialFilter,
  me,
  loadError,
}: {
  influencers: InfluencerListRow[];
  tasks: InfluTaskLite[];
  doctors: DoctorRow[];
  /** แคมเปญทั้งหมด (0093) — ส่งต่อให้ฟอร์มสร้างนัดเลือก + แปลงเป็นแฮชแท็กบนการ์ด */
  campaigns: InfluCampaignDefRow[];
  /** หัตถการของทุกเคส — ที่มาของแฮชแท็ก #หัตถการ (ทีมสินค้า) และ #โปรโมชัน (0093) */
  procedureItems: CaseProcedureLite[];
  /** ลิงก์ไฟล์ source (Google Drive) ทั้งหมด — ปุ่มเปิดเร็วบนการ์ด */
  sourceLinks: InfluLinkLite[];
  /** influencer ที่มีคิว "เข้ารับบริการ" ในปฏิทินแล้ว = นัดหมอเรียบร้อย */
  bookedInfluIds: string[];
  /** ตัวเลือกหัตถการจาก Price List — เมนูหลักของทีม aesthetics */
  priceCatalog: PriceCatalogEntry[];
  /** โปรที่ขึ้นหน้า /price-list (promo_packages — 0090) — ต้องค้นเจอในช่องหัตถการด้วย */
  promoCatalog: PromoCatalogEntry[];
  /** โปรไฟล์ตัวบุคคลทั้งหมด (influ_profiles) — ตัวเลือกตอน "สร้างนัดใหม่" */
  profiles: InfluProfileRow[];
  /** เมนูหัตถการที่ทีมเพิ่มเอง แยก product team (influ_services) */
  services: InfluServiceRow[];
  /** บัญชีทั้งหมด — รูป/ชื่อของผู้รับผิดชอบบนการ์ด + ตัวเลือกตอนมอบหมายงาน */
  people: InfluPerson[];
  /** ผู้รับผิดชอบของทุกเคส (0095) — สิ่งที่การ์ดแสดงแทน owner_id เดิม */
  assignees: CaseAssigneeRow[];
  /** `?filter=` จาก URL (deep link ของปุ่มแจ้งเตือนบนปฏิทิน/กระดิ่ง) — ตั้งตัวกรองให้อัตโนมัติ
      เฉพาะรอบนี้ ไม่ทับค่าเริ่มต้นที่บันทึกไว้ (ดู boardSeedFromParam) */
  initialFilter: string | null;
  me: InfluMe;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const actor = useMemo(
    () => ({ id: me.id, name: me.name || null }),
    [me.id, me.name]
  );

  /** บัญชีตาม uid — ที่มาของรูป/ชื่อบนกองรูปผู้รับผิดชอบ */
  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people]
  );

  /** ผู้รับผิดชอบต่อเคส — การ์ดแสดงกองรูปจากตรงนี้ (owner_id เหลือเป็นข้อมูล "ผู้สร้าง") */
  const assigneesByInflu = useMemo(() => {
    const m = new Map<string, CaseAssignee[]>();
    for (const a of assignees) {
      const row: CaseAssignee = {
        userId: a.user_id,
        scopes: (a.scopes ?? []) as CaseAssignee["scopes"],
      };
      const cur = m.get(a.influencer_id);
      if (cur) cur.push(row);
      else m.set(a.influencer_id, [row]);
    }
    return m;
  }, [assignees]);
  const assigneesOf = useMemo(
    () => (id: string) => assigneesByInflu.get(id) ?? [],
    [assigneesByInflu]
  );

  /** ลบได้ไหม — ผู้ดูแลระบบลบได้ทุกเคส, Hunter ลบได้เมื่อเป็น **ผู้สร้าง** หรือถือบทบาท
      **ผู้ดูแล (owner)** ในเคสนั้น (กติกาเดียวกับ canDeleteInflu + RPC ใน 0106 —
      เดิมดูแค่ owner_id ทำให้คนที่ถูกมอบให้ดูแลเคสต่อลบไม่ได้ แถม error บอกผิดเหตุ) */
  const mayDelete = (i: InfluencerListRow) =>
    me.canManage ||
    (me.level === "hunter" &&
      ((i.owner_id !== null && i.owner_id === me.id) ||
        assigneesOf(i.id).some(
          (a) => a.userId === me.id && normalizeRoles(a.scopes).includes("owner")
        )));

  // สำเนา state ฝั่งจอ — ลบ/ลากแล้วเห็นผลทันที (optimistic) แล้วค่อย sync กับ server
  const [items, setItems] = useSyncedState<InfluencerListRow[]>(influencers);

  /** ทิ้ง cache ของหน้านี้หลังเขียน DB (Next cache 30 วิ · หน้านี้ไม่มี realtime)
      รวบด้วย timeout สั้นๆ — ลากการ์ดรัวๆ จะยิง refresh ทุกครั้งไม่ได้ เพราะ payload ที่
      กลับมาจะ re-seed items ทับตำแหน่งที่เพิ่งลากไปแต่ยังบันทึกไม่เสร็จ (การ์ดเด้งกลับ)
      ออกจากหน้าก่อนครบเวลา = flush ทิ้งท้ายให้ ไม่งั้น cache ค้างเป็นของเก่า */
  const refreshTimer = useRef<number | null>(null);
  const markServerStale = () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 600);
  };
  useEffect(
    () => () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
        router.refresh();
      }
    },
    [router]
  );

  /* แฮชแท็กบังคับต่อเคส (0093) — คำนวณครั้งเดียวที่นี่แล้วส่งเป็น Map ให้การ์ด
     ประกอบจาก 4 แหล่ง: รหัสเคส · เลขใบ ปว. ของหมอ (จับคู่ด้วยชื่อ) · แท็กแคมเปญ ·
     product team + โปรของหัตถการในเคส */
  const licenseByDoctor = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of doctors) {
      if (d.license_no) m.set(d.name, d.license_no);
    }
    return m;
  }, [doctors]);

  const campaignById = useMemo(() => {
    const m = new Map<string, InfluCampaignDefRow>();
    for (const c of campaigns) m.set(c.id, c);
    return m;
  }, [campaigns]);

  const proceduresByInflu = useMemo(() => {
    const m = new Map<string, { teams: InfluProductTeam[]; skus: string[] }>();
    for (const it of procedureItems) {
      const cur = m.get(it.influencer_id) ?? { teams: [], skus: [] };
      cur.teams.push(it.product_team);
      if (it.promo?.sku) cur.skus.push(it.promo.sku);
      m.set(it.influencer_id, cur);
    }
    return m;
  }, [procedureItems]);

  const hashtagsByInflu = useMemo(() => {
    const m = new Map<string, CaseHashtag[]>();
    for (const i of items) {
      const campaign = i.campaign_id ? campaignById.get(i.campaign_id) : null;
      const procs = proceduresByInflu.get(i.id);
      m.set(
        i.id,
        caseHashtags({
          influCode: i.influ_code,
          doctorName: i.doctor_name,
          doctorLicense: i.doctor_name
            ? (licenseByDoctor.get(i.doctor_name) ?? null)
            : null,
          campaignTag: campaign?.tag ?? null,
          campaignName: campaign?.name ?? null,
          teams: procs?.teams ?? [],
          promoSkus: procs?.skus ?? [],
        })
      );
    }
    return m;
  }, [items, campaignById, proceduresByInflu, licenseByDoctor]);

  // ลิงก์ไฟล์ source จัดกลุ่มตาม influencer — ปุ่มเปิดเร็วบนการ์ด
  const linksByInflu = useMemo(() => {
    const m = new Map<string, InfluLinkLite[]>();
    for (const l of sourceLinks) {
      const arr = m.get(l.influencer_id);
      if (arr) arr.push(l);
      else m.set(l.influencer_id, [l]);
    }
    return m;
  }, [sourceLinks]);

  /* เคสที่ถึง Memo แล้วแต่ยังไม่มีคิวหมอในปฏิทิน — ป้ายเรืองแสงบนการ์ด + ตัวกรองด้านบน */
  const bookedIds = useMemo(() => new Set(bookedInfluIds), [bookedInfluIds]);
  const bookingAlertIds = useMemo(
    () =>
      new Set(
        items.filter((i) => needsDoctorBooking(i, bookedIds)).map((i) => i.id)
      ),
    [items, bookedIds]
  );
  /* subset: ผ่านขั้น 1.2 (เอกสารผ่าน) แล้วแต่ยังไม่ลงคิว — ตัวเลขบนชิปตัวกรอง
     "เอกสารผ่านแล้ว ยังไม่ลงคิว" (ตรงกับปุ่มแจ้งเตือนท้ายแผงขวาของปฏิทิน) */
  const approvedBookingCount = useMemo(
    () => items.filter((i) => memoApprovedNeedsBooking(i, bookedIds)).length,
    [items, bookedIds]
  );

  /* ---- ชั้น "โปรไฟล์" ของบอร์ด (0073 + audit 2026-09-03) ----
     บอร์ดเป็นการ์ดต่อ "รอบ" อยู่แล้ว แต่ไม่เคยบอกว่ารอบอื่นของคนเดียวกันอยู่ไหน
     Map นี้คำนวณจาก items ที่โหลดมาแล้ว (ไม่ต้อง query เพิ่ม) */
  const roundsByPerson = useMemo(() => {
    const m = new Map<string, InfluencerListRow[]>();
    for (const i of items) {
      const arr = m.get(i.person_id);
      if (arr) arr.push(i);
      else m.set(i.person_id, [i]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.round_no - b.round_no);
    return m;
  }, [items]);

  /** รอบที่ยังเดินอยู่ต่อคน — โมดัลสร้างนัดเตือนก่อนเปิดรอบซ้อน (ไม่บล็อค) */
  const openRoundsByPerson = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const i of items) {
      if (i.completed || i.declined_at !== null) continue;
      const arr = m.get(i.person_id);
      if (arr) arr.push(i.round_no);
      else m.set(i.person_id, [i.round_no]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a - b);
    return m;
  }, [items]);

  /** คนที่ฉันรับผิดชอบอยู่สักรอบ — ตัวกรอง "เคสของฉัน" ต้องโชว์รอบอื่นของคนเดียวกันด้วย */
  const myPersonIds = useMemo(() => {
    const out = new Set<string>();
    if (!me.id) return out;
    for (const i of items) {
      if (assigneesOf(i.id).some((a) => a.userId === me.id)) out.add(i.person_id);
    }
    return out;
  }, [items, assigneesOf, me.id]);

  const [search, setSearch] = useState("");

  /* ตัวกรองทั้งหมดอยู่ในปุ่มเดียว (ผู้ใช้ 2026-08-29) — ค่าโรงงานเริ่มที่ "เคสของฉัน"
     และผู้ใช้กด "บันทึกเป็นค่าเริ่มต้น" ในแผงเพื่อเปลี่ยนค่าตั้งต้นของตัวเองได้
     `?filter=` จาก deep link = seed ของรอบนี้ (ปุ่มแจ้งเตือนบนปฏิทิน/กระดิ่งพามา) */
  const filterApi = useInfluFilters<BoardFilters>({
    page: "board",
    userId: me.id,
    factory: DEFAULT_BOARD_FILTERS,
    seed: boardSeedFromParam(initialFilter),
    seedKey: initialFilter,
  });
  const { filters } = filterApi;

  // ลบ influencer
  const [deleteTarget, setDeleteTarget] = useState<InfluencerListRow | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** ลบไฟล์ใน storage ของ influencer (best-effort) — รูป/memo/สัญญา */
  const cleanupStorage = async (influId: string) => {
    const store = supabase.storage.from(STORAGE_BUCKET_DOCUMENTS);
    for (const prefix of [
      `influencers/${influId}`,
      `influencers/${influId}/memo`,
      `influencers/${influId}/contract`,
    ]) {
      try {
        const { data } = await store.list(prefix, { limit: 1000 });
        const paths = (data ?? [])
          .filter((o) => o.id) // เฉพาะไฟล์จริง ไม่ใช่ชื่อโฟลเดอร์ย่อย
          .map((o) => `${prefix}/${o.name}`);
        if (paths.length > 0) await store.remove(paths);
      } catch {
        // เพิกเฉย — ลบ record สำเร็จแล้ว ไฟล์ค้างไม่กระทบการใช้งาน
      }
    }
  };

  /** ลบเคส — ผ่าน RPC ที่ **สำรองข้อมูลลงถังขยะ 30 วันก่อนเสมอ** แล้วเขียน log ให้ในตัว
      (ลูกทุกตาราง cascade ตามไป แต่ payload ถูกเก็บครบก่อนลบ — กู้คืนได้ที่หน้าถังขยะ) */
  const handleDelete = async (target: InfluencerListRow) => {
    if (!mayDelete(target)) {
      setActionError(
        "ลบได้เฉพาะเคสที่ตัวเองสร้างหรือเป็นผู้ดูแล — เคสอื่นให้ผู้ดูแลระบบเป็นคนลบ"
      );
      return;
    }
    setDeletingId(target.id);
    setActionError(null);
    // เก็บผู้รับผิดชอบไว้ก่อนลบ — หลังลบแล้วแถวใน influ_assignees หายตาม (cascade)
    const targets = assigneesOf(target.id);
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== target.id)); // optimistic
    const { error } = await supabase.rpc("influ_delete_with_backup", {
      p_id: target.id,
    });
    if (error) {
      setItems(prev); // คืนค่าถ้าลบไม่สำเร็จ
      setActionError(`ลบไม่สำเร็จ: ${error.message}`);
      setDeletingId(null);
      return;
    }
    void cleanupStorage(target.id); // fire-and-forget หลังลบ record สำเร็จ
    // ลบเคสของคนอื่น = เรื่องใหญ่ ผู้รับผิดชอบทุกคนต้องรู้ (ไม่มี href — เคสไม่มีแล้ว)
    // ใช้ forceAction กับ "คนที่ถือบทบาท" แทน baseLevel เหมารวม — ผู้เกี่ยวข้อง
    // (scopes ว่าง) ต้องได้แบบเงียบเสมอตามนิยามของบทบาทนั้น
    notifyInflu(supabase, actor, {
      influencerId: null,
      influencerName: influName(target),
      assignees: targets,
      forceAction: targets
        .filter((t) => normalizeRoles(t.scopes).length > 0)
        .map((t) => t.userId),
      type: "case_deleted",
      title: `เคส ${influName(target)} ถูกลบ`,
      body: "ข้อมูลถูกสำรองไว้ในถังขยะ 30 วัน — ให้ผู้ดูแลระบบกู้คืนได้",
      href: null,
      meta: { influencer_id: target.id },
    });
    setDeletingId(null);
    router.refresh();
  };

  /** ลากการ์ดวางเสร็จ — บันทึกกลุ่มขนาด (override เมื่อไม่ตรง auto) + ลำดับในคอลัมน์ */
  const moveInflu = async (
    id: string,
    group: InfluSizeGroup,
    prevId: string | null,
    nextId: string | null
  ) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    const prevPos = prevId
      ? (() => {
          const p = items.find((i) => i.id === prevId);
          return p ? boardPos(p) : null;
        })()
      : null;
    const nextPos = nextId
      ? (() => {
          const n = items.find((i) => i.id === nextId);
          return n ? boardPos(n) : null;
        })()
      : null;
    let position: number;
    if (prevPos !== null && nextPos !== null) position = (prevPos + nextPos) / 2;
    else if (prevPos !== null) position = prevPos + 1;
    else if (nextPos !== null) position = nextPos - 1;
    else position = 0;
    // วางในกลุ่มเดียวกับที่ followers จัดให้อยู่แล้ว = กลับเป็นอัตโนมัติ (ไม่เก็บ override)
    const sizeGroup: InfluSizeGroup | null =
      group === sizeGroupFromFollowers(target.followers) ? null : group;

    const prevItems = items;
    setItems((cur) =>
      cur.map((i) =>
        i.id === id
          ? { ...i, size_group: sizeGroup, board_position: position }
          : i
      )
    );
    const { error } = await supabase
      .from("influencers")
      .update({ size_group: sizeGroup, board_position: position })
      .eq("id", id);
    if (error) {
      setItems(prevItems);
      setActionError(`ย้ายการ์ดไม่สำเร็จ: ${error.message}`);
      return;
    }
    markServerStale();
  };

  /** mark/ยกเลิกสถานะ "ปฏิเสธ" — การ์ดจะหายจากบอร์ดถ้าตัวกรองยกเว้นปฏิเสธอยู่ (ค่าเริ่มต้น)
      ดูรายชื่อที่ปฏิเสธได้จากชิป "ปฏิเสธ" และกดปุ่มเดิมซ้ำเพื่อเอากลับมาติดต่อใหม่ */
  const toggleDeclined = async (target: InfluencerListRow) => {
    const next = target.declined_at ? null : new Date().toISOString();
    const prevItems = items;
    setActionError(null);
    setItems((cur) =>
      cur.map((i) => (i.id === target.id ? { ...i, declined_at: next } : i))
    );
    const { error } = await supabase
      .from("influencers")
      .update({ declined_at: next })
      .eq("id", target.id);
    if (error) {
      setItems(prevItems);
      setActionError(`บันทึกสถานะปฏิเสธไม่สำเร็จ: ${error.message}`);
      return;
    }
    logInflu(supabase, actor, {
      action: "status",
      entityId: target.id,
      influencerId: target.id,
      influencerName: influName(target),
      summary: next
        ? `ทำเครื่องหมายว่า ${influName(target)} ปฏิเสธ (ไม่ร่วมงาน)`
        : `ยกเลิกสถานะปฏิเสธของ ${influName(target)}`,
    });
    notifyInflu(supabase, actor, {
      influencerId: target.id,
      influencerName: influName(target),
      assignees: assigneesOf(target.id),
      // ปฏิเสธ = ทุกคนที่ถือบทบาทต้องรู้แบบเด่น (ผู้เกี่ยวข้องยังเงียบตามนิยาม)
      forceAction: next
        ? assigneesOf(target.id)
            .filter((t) => normalizeRoles(t.scopes).length > 0)
            .map((t) => t.userId)
        : [],
      type: next ? "case_declined" : "case_declined_undo",
      title: next
        ? `${influName(target)} ถูกทำเครื่องหมายว่าปฏิเสธ`
        : `${influName(target)} กลับมาดำเนินการต่อ`,
      body: next ? "เคสหายจากบอร์ดตามค่าเริ่มต้นของตัวกรอง" : null,
    });
    markServerStale();
  };

  /* ข้อ checklist ของโหมดที่แต่ละเคสไม่ได้ใช้ถูกซ่อนไว้ใน DB — ต้องตัดออกก่อนนับ
     ไม่งั้นชิปเตือนบนการ์ดจะนับข้อของโหมดที่มองไม่เห็นด้วย

     + ตัด "งานรอง" (หมวด 4 รูปติดตามผล 7 งวด) ออกจากตัวเตือนบนการ์ดด้วย —
     ผู้ใช้ 2026-08-29: "priority ตอนนี้คือการตามให้ตัว influ โพสคลิป ส่วนที่ไม่ต้องโฟกัสมาก
     อย่างเช่นตามให้ส่งภาพผลลัพ" ⇒ 7 งวด × ทุกเคสเคยทำให้การ์ดขึ้น "เลยกำหนด" กันหมด
     จนกลบสัญญาณของงานที่ต้องตามจริง (ข้อพวกนั้นยังอยู่ครบและติ๊กได้ที่หน้า Follow Up) */
  const activeTasks = useMemo(() => {
    const modeById = new Map(items.map((i) => [i.id, i.followup_mode]));
    return tasks.filter(
      (t) =>
        t.is_custom === (modeById.get(t.influencer_id) === "custom") &&
        (t.is_custom || !isLaterSection(t.section))
    );
  }, [tasks, items]);

  /* สถิติ follow up ต่อคน: เกินกำหนดกี่งาน, งานถัดไปครบกำหนดเมื่อไหร่, follow ล่าสุดเมื่อไหร่ */
  const statsByInflu = useMemo(() => {
    const map = new Map<string, InfluStats>();
    for (const t of activeTasks) {
      const s =
        map.get(t.influencer_id) ??
        ({ overdue: 0, nextDue: null, lastDone: null, pending: 0 } as InfluStats);
      if (!t.done) {
        s.pending += 1;
        if (t.due_date) {
          if (t.due_date < today) s.overdue += 1;
          if (!s.nextDue || t.due_date < s.nextDue) s.nextDue = t.due_date;
        }
      } else if (t.done_at && (!s.lastDone || t.done_at > s.lastDone)) {
        s.lastDone = t.done_at;
      }
      map.set(t.influencer_id, s);
    }
    return map;
  }, [activeTasks, today]);

  /* กรองค้นหา + ตัวกรองในแผง — ตรรกะทั้งหมดอยู่ที่ matchBoardFilters (board-filters.tsx)
     เพื่อให้กฎ "สถานะที่เจาะดูอยู่ชนะรายการยกเว้น" อยู่ที่เดียว ไม่กระจายในหน้า */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (
        !matchBoardFilters(i, filters, {
          meId: me.id,
          assigneesOf,
          bookingAlertIds,
          myPersonIds,
        })
      )
        return false;
      if (q === "") return true;
      return (
        influName(i).toLowerCase().includes(q) ||
        (i.influ_code ?? "").toLowerCase().includes(q) ||
        (i.phone ?? "").includes(q) ||
        (i.procedure_text ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, filters, bookingAlertIds, assigneesOf, myPersonIds, me.id]);

  /* ---- modal "สร้างนัดใหม่" — เปิดเคสจากโปรไฟล์ที่มีอยู่ (flow 0080) ---- */
  const [caseOpen, setCaseOpen] = useState(false);
  // หัตถการที่เพิ่งถูกลงทะเบียนเข้าเมนูทีมระหว่างเปิดหน้า — โผล่ในโมดัลทันทีไม่ต้องรอ refresh
  const [extraServices, setExtraServices] = useState<InfluServiceRow[]>([]);
  const allServices = useMemo(
    () => [...services, ...extraServices],
    [services, extraServices]
  );

  /* ตัวเลขในแผงตัวกรอง — นับจาก items ทั้งหมด (ไม่ผูกตัวกรองที่เลือกอยู่)
     ให้เทียบยอดข้ามตัวเลือกได้เสมอ เหมือนการ์ดสรุปของหน้า /influ-cost */
  const countFor = (key: number | "done" | "declined") =>
    key === "declined"
      ? items.filter((i) => influStatusOf(i) === "declined").length
      : key === "done"
        ? items.filter((i) => influStatusOf(i) === "done").length
        : items.filter(
            (i) =>
              influStatusOf(i) !== "declined" && !i.completed && i.stage === key
          ).length;

  const filterChips = useMemo(
    () => boardFilterChips(filters, peopleById, campaigns),
    [filters, peopleById, campaigns]
  );
  const bookingAlertActive =
    filters.stage === "needbooking" ||
    filters.stage === "needbooking_approved";
  const memoWaitActive = filters.stage === "memowait";
  // คิว "รอส่งเรื่อง Memo" (ขั้นย่อย 1.0) — นับจากทุกเคสข้ามตัวกรองเสมอ (สัญญาณเตือนต้องเห็นครบ)
  const memoWaitCount = useMemo(
    () =>
      items.filter(
        (i) =>
          i.stage === INFLU_STAGE.memo &&
          i.docs_sent_at === null &&
          !i.completed &&
          influStatusOf(i) !== "declined"
      ).length,
    [items]
  );
  const unassignedCount = useMemo(
    () => items.filter((i) => assigneesOf(i.id).length === 0).length,
    [items, assigneesOf]
  );
  const hiddenCount = items.length - filtered.length;
  /** ปลดทุกอย่างจริงๆ — ห้าม reset เป็นค่าโรงงาน เพราะค่าโรงงานเองก็ยังกรอง
      (บทเรียนเดียวกับปุ่ม "แสดงทั้งหมด" ของ my-tasks) */
  const showEverything = () => {
    setSearch("");
    filterApi.setFilters({
      owner: "all",
      scopes: [],
      stage: "all",
      excluded: [],
      campaign: "all",
    });
  };

  return (
    <>
      {/* ระดับ "ดูเฉยๆ" — บอกให้ชัดตั้งแต่ต้นว่าทำไมไม่มีปุ่มแก้ */}
      {!me.canEdit && (
        <div className="mb-4 flex shrink-0 items-center gap-2 rounded-lg border border-stone-200 bg-white/70 px-4 py-2.5 text-sm text-stone-600 animate-fade-in">
          <Eye size={16} className="shrink-0 text-stone-400" />
          บัญชีนี้เป็นระดับ <span className="font-semibold">Viewer</span> —
          เปิดดูเคสได้ทั้งหมด แต่เพิ่ม/แก้/ลบไม่ได้
        </div>
      )}

      {loadError && (
        <div className="mb-4 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}

      {/* แบนเนอร์ "มีงาน follow up ถึงกำหนด" ถูกถอดออกแล้ว (ผู้ใช้ 2026-08-29) —
          ย้ายไปอยู่ในกระดิ่งแจ้งเตือนของระบบ ส่วน "ค้างอยู่" ซึ่งนับเฉพาะเคสของฉัน
          ห้ามเอาแบนเนอร์เตือนกลับมาแปะบนหน้าอีก */}

      {/* แถบเครื่องมือแถวเดียว: ค้นหา · เส้นขั้นงาน · Case รอส่ง memo · ตัวกรอง · สร้างนัดใหม่ */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2 animate-fade-in-up">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            placeholder="ค้นหา ชื่อ / รหัส / เบอร์ / หัตถการ"
            aria-label="ค้นหาเคส"
            className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* เส้นขั้นงาน — อยู่แถวเดียวกับช่องค้นหา (ผู้ใช้ 2026-09-01: UI เดิมตกไปเป็นแถวของตัวเองดูเป็นบัค)
            และ**อยู่นอกแผงตัวกรองโดยตั้งใจ** เป็นตัวกรองที่ใช้บ่อยที่สุดของหน้านี้
            ต้องกดเลือกขั้นได้ในคลิกเดียว ห้ามย้ายกลับเข้าไปอยู่ในแผงอีก
            (จอแคบ = flex-wrap พาตกบรรทัดเป็นแถวของตัวเอง เลื่อนแนวนอนในกล่องได้) */}
        <div className="min-w-[19rem] flex-[2] overflow-x-auto pb-0.5">
          <StageTrackerPicker
            className="min-w-[min(26rem,100%)]"
            value={filters.stage}
            countFor={countFor}
            onChange={(stage) => filterApi.patch({ stage })}
          />
        </div>
        {/* คิวขั้นย่อย 1.0 — เคสที่ยังไม่ได้กดยืนยันส่งเรื่อง Memo (ข้ามตัวกรอง "ยกเว้น" แบบเดียวกับรอลงคิวหมอ) */}
        <button
          type="button"
          aria-pressed={memoWaitActive}
          onClick={() =>
            filterApi.patch({
              stage: memoWaitActive ? "all" : "memowait",
            })
          }
          className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition active:scale-[0.97] max-sm:min-h-11 ${
            memoWaitActive
              ? "border-brand-500 bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
              : "border-stone-200 bg-white/80 text-stone-600 hover:border-brand-300 hover:text-brand-700"
          }`}
        >
          <FileClock size={15} className="shrink-0" />
          Case รอส่ง memo
          {memoWaitCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                memoWaitActive
                  ? "bg-white/20 text-white"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {memoWaitCount}
            </span>
          )}
        </button>
        <InfluFilterButton
          api={filterApi}
          count={boardFilterCount(filters)}
          factory={DEFAULT_BOARD_FILTERS}
          width={392}
          resultCount={filtered.length}
          resultNoun="เคส"
        >
          <BoardFilterSections
            filters={filters}
            onChange={filterApi.setFilters}
            people={people}
            meId={me.id}
            campaigns={campaigns}
            statusCount={(st) =>
              items.filter((i) => influStatusOf(i) === st).length
            }
            bookingCount={bookingAlertIds.size}
            approvedBookingCount={approvedBookingCount}
            unassignedCount={unassignedCount}
          />
        </InfluFilterButton>
        {me.canEdit && (
          <div className="sm:ml-auto">
            <Button onClick={() => setCaseOpen(true)}>
              <Plus size={16} />
              สร้างนัดใหม่
            </Button>
          </div>
        )}
      </div>

      {/* ชิปสรุป — ตัวกรองที่ซ่อนอยู่ในแผงต้องเห็นได้เสมอว่ากำลังกรองอะไร */}
      <FilterSummary
        chips={filterChips}
        onChange={filterApi.setFilters}
        onClear={() => filterApi.setFilters(DEFAULT_BOARD_FILTERS)}
      />

      {/* จำนวนที่ถูกซ่อน — ค่าโรงงานคือ "เคสของฉัน" + ซ่อนคนที่ปฏิเสธ ⇒ ถ้าไม่บอกตรงนี้
          คนอ่านจะนึกว่าเคสหายจากระบบ (บั๊กจริง: แทนไทมี 2 รอบแต่เห็นการ์ดเดียว)
          "แสดงทั้งหมด" ต้องล้างเป็นค่าที่ไม่กรองอะไรเลย ไม่ใช่กลับไปค่าโรงงานซึ่งก็ยังกรอง */}
      {hiddenCount > 0 && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2 text-xs text-stone-500 animate-fade-in">
          <span>
            แสดง <span className="font-semibold text-stone-700">{filtered.length}</span> จาก{" "}
            {items.length} เคส · ตัวกรองซ่อนอยู่{" "}
            <span className="font-semibold text-amber-700">{hiddenCount}</span>
          </span>
          <button
            type="button"
            onClick={showEverything}
            className="cursor-pointer rounded-full border border-stone-200 bg-white/80 px-2.5 py-1 font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 max-sm:min-h-11 max-sm:px-3"
          >
            แสดงทั้งหมด
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-4 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {actionError}
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={40} strokeWidth={1.5} />}
            title="ยังไม่มี Influencer ในระบบ"
            description="เพิ่มโปรไฟล์คนที่ตกลงร่วมงานที่บอร์ด Hunting ก่อน แล้วกด 'สร้างนัดใหม่' ที่นี่เพื่อเปิดเคสเดินงานทีละ stage"
            action={
              me.canEdit ? (
                <Button onClick={() => setCaseOpen(true)}>
                  <Plus size={16} />
                  สร้างนัดแรก
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          {memoWaitActive && search === "" ? (
            <EmptyState
              icon={<FileClock size={40} strokeWidth={1.5} />}
              title="ไม่มีเคสค้างรอส่งเรื่อง Memo"
              description="ทุกเคสในขั้น Memo กดยืนยันส่งเรื่องแล้ว — เคสใหม่จะโผล่ที่นี่จนกว่าผู้ดูแลจะกด 'ยืนยันส่งเรื่อง Memo' ในขั้น 1.0"
            />
          ) : bookingAlertActive && search === "" ? (
            <EmptyState
              icon={<CalendarClock size={40} strokeWidth={1.5} />}
              title={
                filters.stage === "needbooking_approved"
                  ? "ทุกเคสที่เอกสารผ่านแล้วมีคิวหมอในปฏิทินแล้ว"
                  : "ทุกเคสที่ Memo อนุมัติแล้วมีคิวหมอในปฏิทิน"
              }
              description={
                filters.stage === "needbooking_approved"
                  ? "ไม่มีเคสไหนค้างรอลงคิว — เคสจะโผล่ที่นี่เมื่ออัพไฟล์ Memo ที่อนุมัติ (ผ่านขั้น 1.2) แล้วยังไม่มีคิว 'เข้ารับบริการ' ในปฏิทิน"
                  : "ไม่มีเคสไหนค้างรอลงคิว — เคสจะโผล่ที่นี่เมื่อ Memo อนุมัติแล้ว (ขั้นสัญญา) แต่ยังไม่มีคิว 'เข้ารับบริการ' ในปฏิทิน"
              }
            />
          ) : (
            <EmptyState
              icon={<Search size={40} strokeWidth={1.5} />}
              title="ตัวกรองซ่อนเคสไว้ทั้งหมด — ข้อมูลยังอยู่ครบ"
              description={`มีเคสในระบบ ${items.length} เคส แต่ตัวกรองที่เปิดอยู่ (ค่าเริ่มต้นคือ “เคสของฉัน” และซ่อนเคสที่ปฏิเสธ) ซ่อนไว้หมด`}
              action={
                <Button variant="secondary" onClick={showEverything}>
                  แสดงทั้งหมด
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <InfluBoard
          items={filtered}
          statsByInflu={statsByInflu}
          linksByInflu={linksByInflu}
          hashtagsByInflu={hashtagsByInflu}
          bookingAlertIds={bookingAlertIds}
          assigneesByInflu={assigneesByInflu}
          peopleById={peopleById}
          roundsByPerson={roundsByPerson}
          today={today}
          deletingId={deletingId}
          canEdit={me.canEdit}
          canDelete={mayDelete}
          onOpen={(i) => {
            // กรอง stage อยู่ = เปิดหน้าเดินงานที่ขั้นนั้นเลย ไม่ต้องผ่านภาพรวม
            // (กรอง "จบงาน" = เปิดที่ขั้นตามงาน — ขั้นสุดท้ายที่มีผลงาน/checklist ให้ดู)
            // ฝั่ง detail จะ clamp ให้เองถ้าเคสยังเดินไม่ถึงขั้นที่ขอ
            const stageView =
              typeof filters.stage === "number"
                ? filters.stage
                : filters.stage === "done"
                  ? INFLU_STAGE_LAST
                  : null;
            router.push(
              stageView !== null
                ? `/influencers/${i.id}?view=${stageView}`
                : `/influencers/${i.id}`
            );
          }}
          onDelete={(i) => {
            setActionError(null);
            setDeleteTarget(i);
          }}
          onToggleDeclined={(i) => void toggleDeclined(i)}
          onMove={(id, group, prevId, nextId) =>
            void moveInflu(id, group, prevId, nextId)
          }
        />
      )}

      {/* flow ใหม่ (0080): เพิ่มโปรไฟล์ (ตัวบุคคล) ทำที่บอร์ด Hunting → มาสร้างนัดที่นี่
          (โมดัลสร้างโปรไฟล์ยังเปิดจากในฟอร์มสร้างนัดได้ ถ้าเจอว่ายังไม่มีโปรไฟล์) */}
      <NewCaseModal
        open={caseOpen}
        onClose={() => setCaseOpen(false)}
        profiles={profiles}
        services={allServices}
        priceCatalog={priceCatalog}
        promoCatalog={promoCatalog}
        doctors={doctors}
        campaigns={campaigns}
        people={people}
        me={{ id: me.id, name: me.name }}
        actor={actor}
        openRoundsByPerson={openRoundsByPerson}
        onServiceCreated={(sv) => setExtraServices((prev) => [...prev, sv])}
      />

      {/* ยืนยันลบ influencer — ลบแล้วเข้าถังขยะ 30 วัน (ผู้ดูแลกู้คืนได้) */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบ Influencer"
        message={
          <>
            ลบ{" "}
            <span className="font-medium text-stone-800">
              {deleteTarget ? influName(deleteTarget) : ""}
            </span>{" "}
            ออกจากบอร์ด? ข้อมูลทุก stage (follow-up, ลายเซน, ต้นทุน, ลิงก์,
            คิวในปฏิทิน) จะถูก
            <span className="font-medium"> สำรองไว้ในถังขยะ 30 วัน </span>
            ให้ผู้ดูแลระบบกู้คืนได้ · ส่วน
            <span className="font-medium"> ไฟล์ที่อัปโหลด </span>
            (รูป/Memo/สัญญา) จะถูกลบถาวรทันที และงานคอนเทนต์ที่เคยผูกไว้จะยังอยู่
            แต่ไม่ผูกกับ influencer คนนี้แล้ว
          </>
        }
        confirmLabel="ลบและเก็บลงถังขยะ"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />

    </>
  );
}
