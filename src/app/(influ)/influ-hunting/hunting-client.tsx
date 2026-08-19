"use client";

/**
 * บอร์ด Influ Hunting — pipeline ตามล่า influencer ก่อนตอบรับ (migration 0081)
 *
 * แยกออกมาจากขั้น "ติดต่อ/รายละเอียด" ของบอร์ดเคสเดิม (ผู้ใช้ 2026-08-19):
 * มีโปรไฟล์ = ตอบรับแล้ว ดังนั้นงานล่า/ทัก/เจรจา อยู่ที่นี่ทั้งหมด —
 * ตอบรับเมื่อไหร่ค่อยสร้างโปรไฟล์ (influ_profiles) แล้วไปสร้างนัดต่อ
 *
 * คอลัมน์ = สถานะ (INFLU_PROSPECT_COLUMNS) ไม่มีลากวาง — เปลี่ยนสถานะจาก pill ในโมดัล
 * รายละเอียด (งานนี้ทำจากมือถือบ่อย ลากวางบนจอสัมผัสพลาดง่ายกว่ากดปุ่ม)
 */

import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Crosshair,
  Link2,
  Search,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INFLU_PROSPECT_ACTIVE,
  INFLU_PROSPECT_COLUMNS,
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
import { profileName } from "../influencers/profile-form";
import {
  followupOverdue,
  type NewContactInput,
  ProspectDetailModal,
} from "./prospect-detail";
import { ProspectFormModal, RatingStars } from "./prospect-form";

type Me = {
  id: string | null;
  name: string;
  canEdit: boolean;
  canManage: boolean;
};

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
  const [editTarget, setEditTarget] = useState<InfluProspectRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [caseProfile, setCaseProfile] = useState<InfluProfileRow | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people]
  );
  const contactsByProspect = useMemo(() => {
    const m = new Map<string, InfluProspectContactRow[]>();
    for (const c of contactItems) {
      const list = m.get(c.prospect_id);
      if (list) list.push(c);
      else m.set(c.prospect_id, [c]);
    }
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
        p.source ?? "",
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

  const addContact = async (p: InfluProspectRow, input: NewContactInput) => {
    setSavingContact(true);
    const { data, error } = await supabase
      .from("influ_prospect_contacts")
      .insert({
        prospect_id: p.id,
        contacted_on: input.contactedOn,
        channel: input.channel || null,
        note: input.note || null,
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
    const patch: Partial<InfluProspectRow> = {};
    if (input.nextFollowupOn) patch.next_followup_on = input.nextFollowupOn;
    if (p.status === "new") patch.status = "contacted";
    if (Object.keys(patch).length > 0) void patchProspect(p.id, patch);
    else router.refresh();
    logInflu(supabase, actor, {
      action: "update",
      entity: "prospect",
      entityId: p.id,
      influencerName: p.name,
      summary: `Hunting: จดการติดต่อ ${p.name} (${input.contactedOn}${input.channel ? ` · ${input.channel}` : ""})`,
      meta: { prospect_id: p.id, contact_id: data.id },
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

  return (
    <div>
      <PageHeader
        title="Influ Hunting"
        description="ตามล่า influencer — จดชื่อที่เจอ ติดตามการทัก จนตอบรับเข้าระบบ (ตอบรับแล้ว = มีโปรไฟล์ พร้อมสร้างนัด)"
        action={
          me.canEdit ? (
            <Button onClick={() => setFormOpen(true)}>
              <UserRoundPlus size={16} />
              เพิ่มรายชื่อ
            </Button>
          ) : undefined
        }
      />

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

      {/* แถบค้นหา + ชิปกรอง */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
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
      </div>

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
      ) : showDeclined ? (
        /* มุมมองรายชื่อที่ปฏิเสธ — ลิสต์แถว ไม่ใช่คอลัมน์ */
        <div className="space-y-1.5">
          {filtered.filter((p) => p.status === "declined").length === 0 && (
            <p className="py-8 text-center text-sm text-stone-400">
              ไม่มีรายชื่อที่ปฏิเสธ{query ? "ตรงกับคำค้น" : ""}
            </p>
          )}
          {filtered
            .filter((p) => p.status === "declined")
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetailId(p.id)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white/50 px-4 py-2.5 text-left transition-colors hover:border-rose-300"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-stone-700">
                    {p.name}
                  </span>
                  {p.nickname && (
                    <span className="ml-1.5 text-sm text-stone-400">
                      ({p.nickname})
                    </span>
                  )}
                  {p.note && (
                    <span className="ml-2 hidden truncate text-xs text-stone-400 sm:inline">
                      {p.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-stone-400">
                  {p.declined_at ? formatDate(p.declined_at) : ""}
                </span>
              </button>
            ))}
        </div>
      ) : (
        /* บอร์ด 4 คอลัมน์ตามสถานะ */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {INFLU_PROSPECT_COLUMNS.map((col) => {
            const meta = INFLU_PROSPECT_STATUSES[col];
            const colItems = filtered.filter((p) => p.status === col);
            return (
              <section key={col} className="glass-soft rounded-2xl p-3">
                <header className="mb-2 px-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                    <span className="font-normal text-stone-400">
                      {colItems.length}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">{meta.desc}</p>
                </header>
                <div className="space-y-2">
                  {colItems.length === 0 && (
                    <p className="rounded-xl border border-dashed border-stone-200 px-3 py-6 text-center text-xs text-stone-300">
                      ไม่มีรายชื่อ
                    </p>
                  )}
                  {colItems.map((p) => (
                    <ProspectCard
                      key={p.id}
                      prospect={p}
                      lastContact={contactsByProspect.get(p.id)?.[0] ?? null}
                      ownerName={
                        p.owner_id ? (peopleById.get(p.owner_id) ?? null) : null
                      }
                      onOpen={() => setDetailId(p.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* โมดัลทั้งหมด */}
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
          ownerName={
            detail.owner_id ? (peopleById.get(detail.owner_id) ?? null) : null
          }
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
          onAddContact={(input) => void addContact(detail, input)}
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

/* ---------- การ์ดรายชื่อในคอลัมน์ ---------- */

function ProspectCard({
  prospect: p,
  lastContact,
  ownerName,
  onOpen,
}: {
  prospect: InfluProspectRow;
  lastContact: InfluProspectContactRow | null;
  ownerName: string | null;
  onOpen: () => void;
}) {
  const overdue =
    followupOverdue(p.next_followup_on) &&
    INFLU_PROSPECT_ACTIVE.includes(p.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`block w-full cursor-pointer rounded-xl border bg-white/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] ${
        overdue ? "border-rose-200" : "border-stone-200/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-5 text-stone-800">
          {p.name}
          {p.nickname && (
            <span className="ml-1 font-normal text-stone-400">
              ({p.nickname})
            </span>
          )}
        </p>
        {p.rating > 0 && <RatingStars value={p.rating} size={11} />}
      </div>

      {(p.channels.length > 0 || p.followers != null) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-500">
          {p.channels.slice(0, 3).map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 rounded-full bg-stone-100 px-1.5 py-0.5"
            >
              <Link2 size={9} />
              {c.platform}
            </span>
          ))}
          {p.channels.length > 3 && (
            <span className="text-stone-400">+{p.channels.length - 3}</span>
          )}
          {p.followers != null && (
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <Users size={10} />
              {p.followers.toLocaleString("en-US")}
            </span>
          )}
        </div>
      )}

      {p.interested_services && (
        <p className="mt-1.5 truncate text-xs text-stone-500">
          {p.interested_services}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400">
        <span>
          {lastContact
            ? `ติดต่อล่าสุด ${formatDate(lastContact.contacted_on)}`
            : "ยังไม่เคยติดต่อ"}
        </span>
        {p.next_followup_on && p.status !== "accepted" && (
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
        {ownerName && <span className="ml-auto">{ownerName}</span>}
      </div>
    </button>
  );
}
