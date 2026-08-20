"use client";

/**
 * บอร์ด Influ Hunting — pipeline ตามล่า influencer ก่อนตอบรับ (migration 0081)
 *
 * แยกออกมาจากขั้น "ติดต่อ/รายละเอียด" ของบอร์ดเคสเดิม (ผู้ใช้ 2026-08-19):
 * มีโปรไฟล์ = ตอบรับแล้ว ดังนั้นงานล่า/ทัก/เจรจา อยู่ที่นี่ทั้งหมด —
 * ตอบรับเมื่อไหร่ค่อยสร้างโปรไฟล์ (influ_profiles) แล้วไปสร้างนัดต่อ
 *
 * เลย์เอาต์เป็น "ลิสต์แบบตาราง" จัดกลุ่มตามสถานะ (ผู้ใช้ 2026-08-20:
 * บอร์ด 4 คอลัมน์เดิมดูยาก — ขอแบบเดียวกับหน้า "งานของฉัน"): กลุ่มละแถบสีซ้าย
 * + ตารางคอลัมน์ ชื่อ/สถานะ/ช่องทาง/ผู้ติดตาม/หัตถการ/ติดต่อล่าสุด/นัดตาม/ผู้รับผิดชอบ
 * — เปลี่ยนสถานะได้จาก pill บนแถวเลย (StatusPicker เมนูลอยผ่าน useAnchoredMenu;
 * "ตอบรับแล้ว" ยังเข้าได้ทางปุ่ม/เมนู "ตอบรับ → เข้าระบบ" เท่านั้น ผ่าน ConfirmDialog)
 * จอเล็กเป็นแถวย่อ ชื่อ+ชิป กดเปิดโมดัลรายละเอียด (เปลี่ยนสถานะที่นั่น)
 */

import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Crosshair,
  IdCard,
  Link2,
  MessageCircle,
  Phone,
  Search,
  UserRoundCheck,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { menuBox, useAnchoredMenu, type MenuBox } from "@/components/anchored-menu";
import { Button, ConfirmDialog, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INFLU_CONTACT_QUICK,
  INFLU_PROSPECT_ACTIVE,
  INFLU_PROSPECT_COLUMNS,
  INFLU_PROSPECT_STATUS_ORDER,
  INFLU_PROSPECT_STATUSES,
  tierFromFollowers,
} from "@/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type {
  DoctorRow,
  InfluProfileRow,
  InfluProspectContactRow,
  InfluProspectRow,
  InfluProspectStatus,
  InfluServiceRow,
} from "@/lib/types";
import { NewCaseModal } from "../influencers/new-case-modal";
import type { PriceCatalogEntry } from "../influencers/procedure-items-editor";
import { ProfileFormModal, profileName } from "../influencers/profile-form";
import {
  type ContactPatch,
  followupOverdue,
  ProspectDetailModal,
  todayBangkok,
} from "./prospect-detail";
import { ProspectFormModal, RatingStars } from "./prospect-form";

type Me = {
  id: string | null;
  name: string;
  canEdit: boolean;
  canManage: boolean;
};

/* คอลัมน์ตารางใช้ grid ชุดเดียวกันทั้งหัวตารางและแถว (แพตเทิร์นเดียวกับ my-tasks
   — เพิ่ม/ลดคอลัมน์ต้องแก้ GRID_COLS + HeadCell + เซลล์ในแถวให้ครบพร้อมกัน) */
const GRID_COLS =
  "minmax(220px,1.4fr) 168px minmax(120px,0.9fr) 96px minmax(130px,1fr) 150px 112px 110px";

export function HuntingClient({
  prospects,
  contacts,
  profiles,
  services,
  priceCatalog,
  doctors,
  people,
  me,
  loadError,
}: {
  prospects: InfluProspectRow[];
  contacts: InfluProspectContactRow[];
  profiles: InfluProfileRow[];
  services: InfluServiceRow[];
  priceCatalog: PriceCatalogEntry[];
  doctors: DoctorRow[];
  people: { id: string; name: string }[];
  me: Me;
  loadError: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const actor: InfluLogActor = { id: me.id, name: me.name };

  // optimistic list — adjust state during render (ไม่ใช้ effect sync ตามกฎ
  // react-hooks/set-state-in-effect): props ใหม่จาก router.refresh() ชนะเสมอ
  const [pState, setPState] = useState({ base: prospects, items: prospects });
  if (pState.base !== prospects) {
    setPState({ base: prospects, items: prospects });
  }
  const items = pState.items;
  const setItems = (fn: (prev: InfluProspectRow[]) => InfluProspectRow[]) =>
    setPState((s) => ({ ...s, items: fn(s.items) }));

  const [cState, setCState] = useState({ base: contacts, items: contacts });
  if (cState.base !== contacts) {
    setCState({ base: contacts, items: contacts });
  }
  const contactItems = cState.items;
  const setContacts = (
    fn: (prev: InfluProspectContactRow[]) => InfluProspectContactRow[]
  ) => setCState((s) => ({ ...s, items: fn(s.items) }));

  // โปรไฟล์/หัตถการที่เพิ่งเกิดใน session นี้ (จากปุ่มตอบรับ) — merge กับ props
  const [extraProfiles, setExtraProfiles] = useState<InfluProfileRow[]>([]);
  const allProfiles = useMemo(() => {
    const seen = new Set(extraProfiles.map((p) => p.id));
    return [...extraProfiles, ...profiles.filter((p) => !seen.has(p.id))];
  }, [extraProfiles, profiles]);
  const [extraServices, setExtraServices] = useState<InfluServiceRow[]>([]);
  const allServices = useMemo(
    () => [...services, ...extraServices],
    [services, extraServices]
  );

  // UI state
  const [query, setQuery] = useState("");
  const [showDeclined, setShowDeclined] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  /** โมดัลเพิ่มโปรไฟล์ (influ_profiles) — คนที่ตกลงร่วมงานแล้วแต่ยังไม่เปิดเคส */
  const [profileOpen, setProfileOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InfluProspectRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [caseProfile, setCaseProfile] = useState<InfluProfileRow | null>(null);
  /** ตอบรับจากเมนูสถานะบนแถว — ยืนยันก่อนเสมอ (ทางเดียวกับปุ่มในโมดัลรายละเอียด) */
  const [acceptTarget, setAcceptTarget] = useState<InfluProspectRow | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people]
  );
  /** ผู้รับผิดชอบ = เจ้าของรายชื่อ ไม่มีก็ตกไปที่คนสร้าง (ผู้ใช้ 2026-08-19:
      "ผู้รับผิดชอบให้คนสร้างแสดงอัตโนมัติ" — ไม่มีช่องให้เลือกเอง) */
  const ownerNameOf = (p: InfluProspectRow) =>
    (p.owner_id ? peopleById.get(p.owner_id) : null) ??
    (p.created_by ? peopleById.get(p.created_by) : null) ??
    null;
  const contactsByProspect = useMemo(() => {
    const m = new Map<string, InfluProspectContactRow[]>();
    for (const c of contactItems) {
      const list = m.get(c.prospect_id);
      if (list) list.push(c);
      else m.set(c.prospect_id, [c]);
    }
    // เรียงใหม่ล่าสุดอยู่บน — แก้วันที่แบบ optimistic แล้วลำดับต้องขยับทันที
    for (const list of m.values())
      list.sort((a, b) =>
        a.contacted_on === b.contacted_on
          ? b.created_at.localeCompare(a.created_at)
          : b.contacted_on.localeCompare(a.contacted_on)
      );
    return m;
  }, [contactItems]);

  const overdueList = useMemo(
    () =>
      items.filter(
        (p) =>
          INFLU_PROSPECT_ACTIVE.includes(p.status) &&
          followupOverdue(p.next_followup_on)
      ),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (mineOnly && p.owner_id !== me.id) return false;
      if (
        dueOnly &&
        !(
          INFLU_PROSPECT_ACTIVE.includes(p.status) &&
          followupOverdue(p.next_followup_on)
        )
      )
        return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.nickname ?? "",
        p.phone ?? "",
        p.occupation ?? "",
        p.interested_services ?? "",
        ...p.channels.map((c) => `${c.platform} ${c.value}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, mineOnly, dueOnly, me.id]);

  const declinedCount = items.filter((p) => p.status === "declined").length;
  const detail = detailId ? (items.find((p) => p.id === detailId) ?? null) : null;

  /* ---------- mutations (optimistic + log + router.refresh) ---------- */

  const patchProspect = async (
    id: string,
    patch: Partial<InfluProspectRow>
  ) => {
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
    const { error } = await supabase
      .from("influ_prospects")
      .update(patch)
      .eq("id", id);
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`);
    router.refresh();
  };

  const setStatus = (p: InfluProspectRow, status: InfluProspectStatus) => {
    if (status === "accepted") return; // เข้าได้ทางปุ่ม "ตอบรับ" เท่านั้น
    void patchProspect(p.id, {
      status,
      declined_at: status === "declined" ? new Date().toISOString() : null,
    });
    logInflu(supabase, actor, {
      action: "status",
      entity: "prospect",
      entityId: p.id,
      influencerName: p.name,
      summary: `Hunting: เปลี่ยนสถานะ ${p.name} เป็น "${INFLU_PROSPECT_STATUSES[status].label}"`,
      meta: { prospect_id: p.id, from: p.status, to: status },
    });
  };

  /** ปุ่มลัด "โทร/ทัก" — บันทึกการติดต่อของวันนี้ทันที (ผู้ใช้ 2026-08-19:
      ไม่มีฟอร์มให้กรอกก่อนแล้ว; วัน/โน้ตแก้ทีหลังบนแถวได้) */
  const addContact = async (p: InfluProspectRow, channel: string) => {
    setSavingContact(true);
    const contactedOn = todayBangkok();
    const { data, error } = await supabase
      .from("influ_prospect_contacts")
      .insert({
        prospect_id: p.id,
        contacted_on: contactedOn,
        channel,
        created_by: me.id,
      })
      .select("*")
      .single();
    setSavingContact(false);
    if (error || !data) {
      alert(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setContacts((prev) => [data as InfluProspectContactRow, ...prev]);
    // จดว่าติดต่อแล้ว + สถานะยัง "ยังไม่ติดต่อ" = เลื่อนเป็น "ทักแล้ว รอตอบ" ให้เอง
    if (p.status === "new") void patchProspect(p.id, { status: "contacted" });
    else router.refresh();
    logInflu(supabase, actor, {
      action: "update",
      entity: "prospect",
      entityId: p.id,
      influencerName: p.name,
      summary: `Hunting: บันทึกการติดต่อ ${p.name} (${channel} · ${contactedOn})`,
      meta: { prospect_id: p.id, contact_id: data.id },
    });
  };

  /** แก้วันที่/โน้ตของบันทึกการติดต่อที่จดไว้แล้ว (แก้ inline บนแถว) */
  const updateContact = async (
    p: InfluProspectRow,
    contactId: string,
    patch: ContactPatch
  ) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, ...patch } : c))
    );
    const { error } = await supabase
      .from("influ_prospect_contacts")
      .update(patch)
      .eq("id", contactId);
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`);
    else
      logInflu(supabase, actor, {
        action: "update",
        entity: "prospect_contact",
        entityId: contactId,
        influencerName: p.name,
        summary: `Hunting: แก้บันทึกการติดต่อของ ${p.name}${patch.contacted_on ? ` (วันที่ ${patch.contacted_on})` : ""}`,
        meta: { prospect_id: p.id, contact_id: contactId, patch },
      });
    router.refresh();
  };

  /** โน้ตรวม — พิมพ์ในโมดัลรายละเอียดได้เลย (บันทึกตอนคลิกออกจากกล่อง) */
  const setNote = (p: InfluProspectRow, note: string) => {
    void patchProspect(p.id, { note: note || null });
    logInflu(supabase, actor, {
      action: "update",
      entity: "prospect",
      entityId: p.id,
      influencerName: p.name,
      summary: `Hunting: แก้โน้ตของ ${p.name}`,
      meta: { prospect_id: p.id },
    });
  };

  const deleteContact = async (p: InfluProspectRow, contactId: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
    const { error } = await supabase
      .from("influ_prospect_contacts")
      .delete()
      .eq("id", contactId);
    if (error) alert(`ลบไม่สำเร็จ: ${error.message}`);
    else
      logInflu(supabase, actor, {
        action: "delete",
        entity: "prospect_contact",
        entityId: contactId,
        influencerName: p.name,
        summary: `Hunting: ลบบันทึกการติดต่อของ ${p.name}`,
        meta: { prospect_id: p.id, contact_id: contactId },
      });
    router.refresh();
  };

  const deleteProspect = async (p: InfluProspectRow) => {
    setDetailId(null);
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    const { error } = await supabase
      .from("influ_prospects")
      .delete()
      .eq("id", p.id);
    if (error) alert(`ลบไม่สำเร็จ: ${error.message}`);
    else
      logInflu(supabase, actor, {
        action: "delete",
        entity: "prospect",
        entityId: p.id,
        influencerName: p.name,
        summary: `Hunting: ลบรายชื่อ ${p.name} (สถานะ ${INFLU_PROSPECT_STATUSES[p.status].label})`,
        meta: { prospect_id: p.id },
      });
    router.refresh();
  };

  /** ตอบรับ → สร้างโปรไฟล์เข้าระบบ (หรือใช้โปรไฟล์เดิมถ้ามีอยู่แล้ว) แล้วเปิดสร้างนัดต่อ */
  const acceptProspect = async (p: InfluProspectRow) => {
    let profile =
      (p.profile_id && allProfiles.find((x) => x.id === p.profile_id)) || null;
    if (!profile) {
      const { data, error } = await supabase
        .from("influ_profiles")
        .insert({
          first_name: p.name,
          nickname: p.nickname,
          phone: p.phone,
          occupation: p.occupation,
          followers: p.followers,
          tier: p.followers != null ? tierFromFollowers(p.followers) : null,
          photo_path: p.photo_path,
          note: p.note,
          created_by: me.id,
        })
        .select("*")
        .single();
      if (error || !data) {
        alert(`สร้างโปรไฟล์ไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
        return;
      }
      const created = data as InfluProfileRow;
      if (p.channels.length > 0) {
        await supabase.from("influ_profile_channels").insert(
          p.channels.map((c, idx) => ({
            profile_id: created.id,
            platform: c.platform,
            value: c.value,
            followers: c.followers,
            position: idx + 1,
          }))
        );
      }
      setExtraProfiles((prev) => [created, ...prev]);
      profile = created;
    }

    await patchProspect(p.id, {
      status: "accepted",
      accepted_at: new Date().toISOString(),
      declined_at: null,
      profile_id: profile.id,
    });
    logInflu(supabase, actor, {
      action: "create",
      entity: "profile",
      entityId: profile.id,
      influencerName: profileName(profile),
      summary: `Hunting: ${p.name} ตอบรับ — สร้างโปรไฟล์เข้าระบบแล้ว`,
      meta: { prospect_id: p.id, profile_id: profile.id },
    });
    // ปิด detail แล้วชวนสร้างนัดต่อทันที (NewCaseModal remount ด้วย key)
    setDetailId(null);
    setCaseProfile(profile);
  };

  /* ---------- render ---------- */

  const chipCls = (active: boolean) =>
    `inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors active:scale-[0.97] sm:min-h-0 sm:text-xs ${
      active
        ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
        : "border-stone-200 bg-white/70 text-stone-500 hover:border-stone-300"
    }`;

  // กลุ่ม = สถานะ (แบบหมวดหมู่ของ my-tasks) — ชิป "ปฏิเสธ" สลับไปดูกลุ่ม declined แทน
  const groupStatuses: InfluProspectStatus[] = showDeclined
    ? ["declined"]
    : INFLU_PROSPECT_COLUMNS;

  return (
    <div>
      {/* แถวเครื่องมือแถวเดียว: ค้นหา + ชิปกรอง + ปุ่มเพิ่ม (ผู้ใช้ 2026-08-20:
          ถอดหัวข้อ/คำอธิบายหน้าออก แล้วเอาปุ่มลงมารวมแถวเดียวกับตัวกรอง) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / ช่องทาง / หัตถการ..."
            className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none sm:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          className={chipCls(mineOnly)}
        >
          รายชื่อของฉัน
        </button>
        <button
          type="button"
          onClick={() => setDueOnly((v) => !v)}
          className={chipCls(dueOnly)}
        >
          ถึงกำหนดตาม ({overdueList.length})
        </button>
        <button
          type="button"
          onClick={() => setShowDeclined((v) => !v)}
          className={chipCls(showDeclined)}
        >
          ปฏิเสธ ({declinedCount})
        </button>
        {/* "เพิ่มโปรไฟล์" ย้ายมาจากบอร์ดเคส (ผู้ใช้ 2026-08-19) — ตกลงร่วมงานแล้ว
            ขึ้นโปรไฟล์ที่นี่ก่อน แล้วค่อยไปสร้างนัดที่บอร์ดเคส */}
        {me.canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-3.5 py-2 text-sm font-medium text-brand-700 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97] max-sm:min-h-11"
            >
              <IdCard size={16} />
              เพิ่มโปรไฟล์
            </button>
            <Button onClick={() => setFormOpen(true)}>
              <UserRoundPlus size={16} />
              เพิ่มรายชื่อ
            </Button>
          </div>
        )}
      </div>

      {loadError && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </p>
      )}

      {overdueList.length > 0 && !dueOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 animate-fade-in">
          <CalendarClock size={15} className="text-amber-600" />
          <p className="text-sm text-amber-800">
            ถึงกำหนดตามแล้ว {overdueList.length} รายชื่อ
          </p>
          <button
            type="button"
            onClick={() => setDueOnly(true)}
            className="inline-flex cursor-pointer items-center text-sm font-medium text-amber-700 underline-offset-2 hover:underline max-sm:min-h-11"
          >
            ดูเฉพาะที่ถึงกำหนด
          </button>
        </div>
      )}

      {items.length === 0 && !loadError ? (
        <EmptyState
          icon={<Crosshair size={32} />}
          title="ยังไม่มีรายชื่อบนบอร์ด Hunting"
          description="เจอ influencer ที่น่าสนใจจากไหนก็ตาม จดชื่อไว้ที่นี่ก่อน แล้วค่อยๆ ตามจนเขาตอบรับ"
          action={
            me.canEdit ? (
              <Button onClick={() => setFormOpen(true)}>
                <UserRoundPlus size={16} />
                เพิ่มรายชื่อแรก
              </Button>
            ) : undefined
          }
        />
      ) : (
        /* ลิสต์จัดกลุ่มตามสถานะ — กลุ่มโชว์เสมอแม้ว่าง (เห็น pipeline ครบเหมือนบอร์ดเดิม) */
        <div className="space-y-4">
          {groupStatuses.map((st) => {
            const meta = INFLU_PROSPECT_STATUSES[st];
            const rows = filtered.filter((p) => p.status === st);
            return (
              <section key={st} className="flex animate-fade-in">
                <div className={`w-1.5 shrink-0 rounded-l-lg ${meta.dot}`} />
                <div
                  style={{ borderLeftWidth: 0 }}
                  className="glass min-w-0 flex-1 overflow-x-auto rounded-l-none rounded-r-lg"
                >
                  {/* min-width เฉพาะ ≥sm — จอเล็กใช้แถวย่อ ไม่บังคับเลื่อนแนวนอน */}
                  <div className="sm:min-w-[1110px]">
                    <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 pb-1.5 pt-2.5 sm:px-4">
                      <h2 className="text-sm font-semibold text-stone-700">
                        {meta.label}
                      </h2>
                      <span className="text-xs tabular-nums text-stone-400">
                        {rows.length} รายชื่อ
                      </span>
                      <span className="hidden text-xs text-stone-400 md:inline">
                        · {meta.desc}
                      </span>
                    </header>

                    <div
                      className="hidden border-b border-t border-brand-100/70 text-xs text-stone-500 sm:grid"
                      style={{ gridTemplateColumns: GRID_COLS }}
                    >
                      <HeadCell first>ชื่อ</HeadCell>
                      <HeadCell>สถานะ</HeadCell>
                      <HeadCell>ช่องทาง</HeadCell>
                      <HeadCell center>ผู้ติดตาม</HeadCell>
                      <HeadCell>หัตถการที่สนใจ</HeadCell>
                      <HeadCell>ติดต่อล่าสุด</HeadCell>
                      <HeadCell center>นัดตาม</HeadCell>
                      <HeadCell>ผู้รับผิดชอบ</HeadCell>
                    </div>

                    {rows.length === 0 ? (
                      <p className="px-4 py-4 text-xs text-stone-300">
                        ไม่มีรายชื่อในสถานะนี้{query ? " (ตามคำค้น/ตัวกรอง)" : ""}
                      </p>
                    ) : (
                      rows.map((p) => (
                        <ProspectRow
                          key={p.id}
                          prospect={p}
                          lastContact={contactsByProspect.get(p.id)?.[0] ?? null}
                          ownerName={ownerNameOf(p)}
                          canEdit={me.canEdit}
                          savingContact={savingContact}
                          onOpen={() => setDetailId(p.id)}
                          onSetStatus={(s) => setStatus(p, s)}
                          onAccept={() => setAcceptTarget(p)}
                          onQuickContact={(ch) => void addContact(p, ch)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* โมดัลทั้งหมด */}
      {/* เพิ่มโปรไฟล์ (ตัวบุคคล) — โปรไฟล์ที่สร้างจากที่นี่โผล่ในตัวเลือกของ "สร้างนัดใหม่" ทันที */}
      <ProfileFormModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        actor={actor}
        onSaved={(p) => {
          setExtraProfiles((prev) => [p, ...prev]);
          router.refresh();
        }}
      />
      <ProspectFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
        }}
        prospect={editTarget}
        actor={actor}
        onSaved={(saved) =>
          setItems((prev) =>
            prev.some((x) => x.id === saved.id)
              ? prev.map((x) => (x.id === saved.id ? saved : x))
              : [saved, ...prev]
          )
        }
      />

      {detail && (
        <ProspectDetailModal
          prospect={detail}
          contacts={contactsByProspect.get(detail.id) ?? []}
          ownerName={ownerNameOf(detail)}
          canEdit={me.canEdit}
          canDelete={me.canManage || (me.id !== null && detail.owner_id === me.id)}
          savingContact={savingContact}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditTarget(detail);
            setFormOpen(true);
          }}
          onSetStatus={(s) => setStatus(detail, s)}
          onSetNextFollowup={(d) =>
            void patchProspect(detail.id, { next_followup_on: d })
          }
          onAccept={() => void acceptProspect(detail)}
          onDelete={() => void deleteProspect(detail)}
          onSetNote={(note) => setNote(detail, note)}
          onAddContact={(channel) => void addContact(detail, channel)}
          onUpdateContact={(cid, patch) =>
            void updateContact(detail, cid, patch)
          }
          onDeleteContact={(cid) => void deleteContact(detail, cid)}
          onCreateCase={() => {
            const profile = detail.profile_id
              ? (allProfiles.find((x) => x.id === detail.profile_id) ?? null)
              : null;
            if (!profile) {
              alert(
                "ไม่พบโปรไฟล์ของคนนี้แล้ว (อาจถูกลบ) — เปิดจากบอร์ดเคสแทน"
              );
              return;
            }
            setDetailId(null);
            setCaseProfile(profile);
          }}
        />
      )}

      {/* ยืนยันตอบรับจากเมนูสถานะบนแถว — ข้อความเดียวกับปุ่มในโมดัลรายละเอียด */}
      {acceptTarget && (
        <ConfirmDialog
          open
          onClose={() => setAcceptTarget(null)}
          title="ตอบรับเข้าระบบ"
          confirmLabel="ตอบรับ — สร้างโปรไฟล์"
          confirmVariant="primary"
          message={
            <>
              ยืนยันว่า <strong>{acceptTarget.name}</strong> ตอบรับร่วมงานแล้ว?
              ระบบจะสร้างโปรไฟล์ในระบบ Influencer ให้ทันที
              (ชื่อ/เบอร์/ผู้ติดตาม/ช่องทาง ติดไปด้วย) แล้วไปสร้างนัดต่อได้เลย
            </>
          }
          onConfirm={() => {
            const target = acceptTarget;
            setAcceptTarget(null);
            void acceptProspect(target);
          }}
        />
      )}

      {/* สร้างนัดต่อจากคนที่เพิ่งตอบรับ — remount ด้วย key ให้ initialProfile ถูกอ่านใหม่ */}
      {caseProfile && (
        <NewCaseModal
          key={caseProfile.id}
          open
          onClose={() => setCaseProfile(null)}
          profiles={allProfiles}
          services={allServices}
          priceCatalog={priceCatalog}
          doctors={doctors}
          me={{ id: me.id, name: me.name }}
          actor={actor}
          onServiceCreated={(svc) => setExtraServices((prev) => [...prev, svc])}
          initialProfile={caseProfile}
        />
      )}
    </div>
  );
}

/* ---------- หัวคอลัมน์ของตาราง ---------- */

function HeadCell({
  children,
  center,
  first,
}: {
  children: ReactNode;
  center?: boolean;
  first?: boolean;
}) {
  return (
    <div
      className={`flex h-9 items-center px-3 ${
        first ? "" : "border-l border-brand-100/70"
      } ${center ? "justify-center" : ""}`}
    >
      {children}
    </div>
  );
}

/* ---------- แถวรายชื่อในตาราง (≥sm) + แถวย่อ (<sm) ---------- */

const QUICK_ICONS = { phone: Phone, message: MessageCircle } as const;

function ProspectRow({
  prospect: p,
  lastContact,
  ownerName,
  canEdit,
  savingContact,
  onOpen,
  onSetStatus,
  onAccept,
  onQuickContact,
}: {
  prospect: InfluProspectRow;
  lastContact: InfluProspectContactRow | null;
  ownerName: string | null;
  canEdit: boolean;
  savingContact: boolean;
  onOpen: () => void;
  onSetStatus: (s: InfluProspectStatus) => void;
  onAccept: () => void;
  onQuickContact: (channel: string) => void;
}) {
  const meta = INFLU_PROSPECT_STATUSES[p.status];
  const active = INFLU_PROSPECT_ACTIVE.includes(p.status);
  const overdue = active && followupOverdue(p.next_followup_on);

  return (
    <div className="group border-b border-brand-100/50 last:border-b-0 hover:bg-white/70">
      {/* ---- จอ ≥sm: แถวตารางเต็ม ---- */}
      <div
        className="hidden items-stretch sm:grid"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        {/* ชื่อ (+ชื่อเล่น +ดาวความน่าสนใจ) — กดเปิดรายละเอียด */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`เปิดรายละเอียด: ${p.name}`}
          className="flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2 text-left"
        >
          <span className="min-w-0 truncate text-sm font-medium text-stone-800">
            {p.name}
            {p.nickname && (
              <span className="ml-1 font-normal text-stone-400">
                ({p.nickname})
              </span>
            )}
          </span>
          {p.rating > 0 && (
            <span className="shrink-0">
              <RatingStars value={p.rating} size={11} />
            </span>
          )}
        </button>

        {/* สถานะ — เปลี่ยนได้จากแถวเลย (accepted ล็อก เข้าได้ทางปุ่มตอบรับเท่านั้น) */}
        <div className="flex items-center border-l border-brand-100/70 px-2">
          <StatusPicker
            prospect={p}
            canEdit={canEdit}
            onPick={onSetStatus}
            onAccept={onAccept}
          />
        </div>

        {/* ช่องทาง */}
        <div className="flex min-w-0 items-center gap-1 overflow-hidden border-l border-brand-100/70 px-2 text-[11px] text-stone-500">
          {p.channels.length === 0 && (
            <span className="text-stone-300">—</span>
          )}
          {p.channels.slice(0, 2).map((c, i) => (
            <span
              key={i}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-stone-100 px-1.5 py-0.5"
            >
              <Link2 size={9} />
              {c.platform}
            </span>
          ))}
          {p.channels.length > 2 && (
            <span className="shrink-0 text-stone-400">
              +{p.channels.length - 2}
            </span>
          )}
        </div>

        {/* ผู้ติดตาม */}
        <div className="flex items-center justify-center border-l border-brand-100/70 px-2 text-xs tabular-nums text-stone-600">
          {p.followers != null ? (
            p.followers.toLocaleString("en-US")
          ) : (
            <span className="text-stone-300">—</span>
          )}
        </div>

        {/* หัตถการที่สนใจ — กดเปิดรายละเอียด (พื้นที่กว้าง กดง่าย) */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`เปิดรายละเอียด: ${p.name}`}
          className="flex min-w-0 cursor-pointer items-center border-l border-brand-100/70 px-3 text-left"
        >
          <span className="min-w-0 truncate text-xs text-stone-500">
            {p.interested_services ?? ""}
          </span>
        </button>

        {/* ติดต่อล่าสุด + ปุ่มลัดโทร/ทัก (จดการติดต่อวันนี้ทันที) */}
        <div className="flex items-center gap-0.5 border-l border-brand-100/70 px-2">
          <span
            className={`min-w-0 flex-1 truncate text-xs ${
              lastContact ? "text-stone-600" : "text-stone-300"
            }`}
          >
            {lastContact
              ? `${lastContact.channel} · ${formatDate(lastContact.contacted_on)}`
              : "ยังไม่เคยติดต่อ"}
          </span>
          {canEdit &&
            active &&
            INFLU_CONTACT_QUICK.map((q) => {
              const Icon = QUICK_ICONS[q.icon];
              return (
                <button
                  key={q.channel}
                  type="button"
                  disabled={savingContact}
                  onClick={() => onQuickContact(q.channel)}
                  title={`บันทึกว่า "${q.label}" วันนี้`}
                  aria-label={`บันทึกการติดต่อ: ${q.label} ${p.name} วันนี้`}
                  className="reveal-on-hover flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-stone-300 opacity-0 transition-all hover:bg-brand-50 hover:text-brand-600 disabled:cursor-default disabled:opacity-40 group-hover:opacity-100"
                >
                  <Icon size={13} />
                </button>
              );
            })}
        </div>

        {/* นัดตาม — เลยกำหนด = แดง */}
        <div className="flex items-center justify-center border-l border-brand-100/70 px-2">
          {p.next_followup_on && active ? (
            <span
              className={`truncate text-xs ${
                overdue ? "font-medium text-rose-600" : "text-amber-700"
              }`}
            >
              {formatDate(p.next_followup_on)}
            </span>
          ) : (
            <span className="text-xs text-stone-300">—</span>
          )}
        </div>

        {/* ผู้รับผิดชอบ */}
        <div className="flex min-w-0 items-center border-l border-brand-100/70 px-3">
          <span className="min-w-0 truncate text-xs text-stone-500">
            {ownerName ?? ""}
          </span>
        </div>
      </div>

      {/* ---- จอเล็ก: แถวย่อ ชื่อ + ชิป — เปลี่ยนสถานะในโมดัลรายละเอียด (ทางเดิม) ---- */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`เปิดรายละเอียด: ${p.name}`}
        className="block w-full cursor-pointer px-3 py-2.5 text-left sm:hidden"
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">
            {p.name}
            {p.nickname && (
              <span className="font-normal text-stone-400"> ({p.nickname})</span>
            )}
          </span>
          {p.rating > 0 && (
            <span className="shrink-0">
              <RatingStars value={p.rating} size={10} />
            </span>
          )}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${meta.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {p.followers != null && (
            <span className="inline-flex items-center gap-0.5 tabular-nums text-stone-500">
              <Users size={10} />
              {p.followers.toLocaleString("en-US")}
            </span>
          )}
          <span className="text-stone-400">
            {lastContact
              ? `ติดต่อล่าสุด ${formatDate(lastContact.contacted_on)}`
              : "ยังไม่เคยติดต่อ"}
          </span>
          {p.next_followup_on && active && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
                overdue
                  ? "bg-rose-50 font-medium text-rose-600"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              <CalendarClock size={10} />
              นัดตาม {formatDate(p.next_followup_on)}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

/* ---------- pill สถานะบนแถว + เมนูลอยเปลี่ยนสถานะ ---------- */

/**
 * เมนูลอยผ่าน portal + useAnchoredMenu (กติกากลาง — ห้ามเขียน listener เอง):
 * "ตอบรับแล้ว" ไม่อยู่ในตัวเลือกตรง — มีแถว "ตอบรับ → เข้าระบบ" แยกท้ายเมนูที่วิ่งเข้า
 * ConfirmDialog เดียวกับปุ่มในโมดัล (สร้างโปรไฟล์จริง ไม่ใช่แค่ patch สถานะ);
 * แถวที่ accepted แล้ว = pill ล็อก (สถานะจบของ pipeline นี้)
 */
function StatusPicker({
  prospect: p,
  canEdit,
  onPick,
  onAccept,
}: {
  prospect: InfluProspectRow;
  canEdit: boolean;
  onPick: (s: InfluProspectStatus) => void;
  onAccept: () => void;
}) {
  const meta = INFLU_PROSPECT_STATUSES[p.status];
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const place = (a: HTMLElement) =>
    setBox(menuBox(a, { width: 264, maxHeight: 360 }));
  useAnchoredMenu({
    open,
    anchorRef,
    menuRef,
    onClose: () => setOpen(false),
    onReposition: place,
  });

  const locked = !canEdit || p.status === "accepted";
  const pill = (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.chip}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      <span className="truncate">{meta.label}</span>
      {!locked && <ChevronDown size={12} className="shrink-0 text-stone-400" />}
    </span>
  );
  if (locked) return pill;

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
        aria-label={`เปลี่ยนสถานะของ ${p.name} (ปัจจุบัน: ${meta.label})`}
        className="min-w-0 cursor-pointer"
      >
        {pill}
      </button>
      {open &&
        box &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: box.x,
              top: box.y,
              width: box.width,
              maxHeight: box.height,
            }}
            className="z-[60] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl animate-scale-in"
          >
            {INFLU_PROSPECT_STATUS_ORDER.filter((s) => s !== "accepted").map(
              (s) => {
                const m = INFLU_PROSPECT_STATUSES[s];
                const current = s === p.status;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!current) onPick(s);
                    }}
                    className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-stone-50 max-sm:min-h-11 ${
                      current ? "bg-stone-50" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.dot}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${
                          current
                            ? "font-medium text-stone-800"
                            : "text-stone-700"
                        }`}
                      >
                        {m.label}
                      </span>
                      <span className="block text-[11px] leading-4 text-stone-400">
                        {m.desc}
                      </span>
                    </span>
                    {current && (
                      <Check size={14} className="mt-1 shrink-0 text-brand-500" />
                    )}
                  </button>
                );
              }
            )}
            <div className="my-1 border-t border-stone-100" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAccept();
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 max-sm:min-h-11"
            >
              <UserRoundCheck size={14} className="shrink-0" />
              ตอบรับ → เข้าระบบ
            </button>
            <p className="px-2.5 pb-1 pt-0.5 text-[11px] leading-4 text-stone-400">
              ตอบรับ = สร้างโปรไฟล์เข้าระบบ แล้วเปิดสร้างนัดต่อได้เลย
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
