"use client";

/**
 * โมดัล "สร้างนัดใหม่" — เปิดเคส (รอบงาน) จากโปรไฟล์ที่มีอยู่ (flow ใหม่ 0080)
 *
 * ลำดับใหม่ของการเพิ่มงาน: ต้องมีโปรไฟล์ก่อน (ProfileFormModal) → ค่อยมาสร้างนัดที่นี่
 * เลือกโปรไฟล์ + หัตถการ (แยก product team) + วันนัด/แพทย์ (ไม่บังคับ — ยังไม่เคาะได้)
 * เคสใหม่เริ่มที่ **Stage 1 (Memo)** ซึ่งเป็นขั้นแรกของ pipeline (0086) เพราะขั้นติดต่อ/รายละเอียดจบไปแล้วตอนทำโปรไฟล์
 * (แท็บรายละเอียดเคสยังกลับไปแก้ได้เสมอตามกติกาเดิม — ข้อมูลเคสไม่ใช่สถานะงาน)
 *
 * ใช้กลไกเดียวกับ "เปิดรอบใหม่" ใน detail-client: person_id = โปรไฟล์, round_no อ่านสดจาก DB,
 * คัดลอกเฉพาะข้อมูลตัวบุคคล + copy รูปเข้าโฟลเดอร์เคสใหม่ (best effort ห้ามชี้ path ข้ามเคส)
 */

import {
  Hash,
  Search,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  caseValueOf,
  INFLU_BUDGET_CAPS,
  INFLU_STAGE,
  INFLU_TIERS,
  INFLU_VOUCHER_UNIT,
  normalizeRoles,
  overBudgetCap,
  procedureSummaryText,
  roleSummary,
  tierFromFollowers,
  voucherCreditOf,
  voucherLabelOf,
} from "@/influ/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/influ/lib/influ-log";
import { notifyInflu } from "@/influ/lib/influ-notify";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import type {
  DoctorRow,
  InfluCampaignDefRow,
  InfluProfileRow,
  InfluServiceRow,
} from "@/lib/types";
import {
  type AssigneeChange,
  AssigneeEditor,
  type CaseAssignee,
  type InfluPerson,
} from "./assignees";
import { copyPhotoIntoCase } from "./case-photo-copy";
import { DoctorSelect } from "./doctor-select";
import type {
  PriceCatalogEntry,
  PromoCatalogEntry,
} from "./procedure-items-editor";
import { ProcedurePicker, type PickedProcedure } from "./procedure-picker";
import { ProfileFormModal, profileName } from "./profile-form";
import { VoucherPicker } from "./voucher-picker";

/** หัวข้อมีเลขของฟอร์ม — ทำให้ 4 ส่วนของโมดัลอ่านเป็นลำดับ ไม่ใช่ช่องกรอกยาวติดกัน
    (ผู้ใช้ 2026-09-03: "ทำให้ setting ใหญ่กว่านี้ ดูง่ายครบครันกว่านี้") */
function FormSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white/70 p-3 sm:p-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-stone-800">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function NewCaseModal({
  open,
  onClose,
  profiles,
  services,
  priceCatalog,
  promoCatalog,
  doctors,
  campaigns,
  people,
  me,
  actor,
  onServiceCreated,
  initialProfile = null,
  copyFrom = null,
  openRoundsByPerson,
}: {
  open: boolean;
  onClose: () => void;
  /** โปรไฟล์ทั้งหมด (influ_profiles) — ตัวเลือกขั้นแรก */
  profiles: InfluProfileRow[];
  /** เมนูหัตถการที่ทีมเพิ่มเอง (ทุก product team) */
  services: InfluServiceRow[];
  priceCatalog: PriceCatalogEntry[];
  /** โปรที่ขึ้นหน้า /price-list (promo_packages) — ค้นเจอในช่องหัตถการด้วย (0090) */
  promoCatalog: PromoCatalogEntry[];
  doctors: DoctorRow[];
  /** แคมเปญที่เปิดใช้งาน — เลือกได้ตอนสร้างเคส (ไม่บังคับ) */
  campaigns: InfluCampaignDefRow[];
  /** บัญชีทีมทั้งหมด — ตัวเลือก "ผู้ออก Memo" (assign ตั้งแต่ตอนสร้างเคส) */
  people: InfluPerson[];
  me: { id: string | null; name: string };
  actor: InfluLogActor;
  /** หัตถการใหม่ที่เพิ่งลงทะเบียน — แจ้ง parent ให้ลิสต์กลางอัปเดต */
  onServiceCreated?: (service: InfluServiceRow) => void;
  /** โปรไฟล์ที่เลือกให้ล่วงหน้า (เช่นมาจากปุ่ม "ตอบรับ" บนบอร์ด Hunting)
      อ่านเฉพาะตอน mount — parent ที่เปลี่ยนค่านี้ต้อง remount ด้วย key */
  initialProfile?: InfluProfileRow | null;
  /** เคสที่กดเปิดรอบใหม่มา — รูป "ช่องทาง" เป็นของเคส ไม่ได้อยู่บนโปรไฟล์
      จึงต้องรับมาจากที่นี่ ไม่งั้นรอบใหม่ไม่มีสกรีนช็อตยอดผู้ติดตามติดไปด้วย */
  copyFrom?: { photo_path: string | null; channel_photo_path: string | null } | null;
  /** รอบที่ยังเดินอยู่ของแต่ละโปรไฟล์ (person_id → เลขรอบ) — ใช้ "เตือน" อย่างเดียว
      ไม่บล็อค: ผู้ใช้ยืนยันว่าเปิดหลายรอบพร้อมกันได้ แต่ต้องรู้ตัวก่อนกด */
  openRoundsByPerson?: Map<string, number[]>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // โปรไฟล์ที่เพิ่งสร้างจากในโมดัลนี้ — merge กับ props ตอนอ่าน (ไม่ mirror ทั้งก้อน
  // ด้วย effect เพราะชนกฎ react-hooks/set-state-in-effect) จึงโผล่ให้เลือกทันที
  const [createdProfiles, setCreatedProfiles] = useState<InfluProfileRow[]>([]);
  const allProfiles = useMemo(() => {
    const seen = new Set(createdProfiles.map((c) => c.id));
    return [...createdProfiles, ...profiles.filter((c) => !seen.has(c.id))];
  }, [createdProfiles, profiles]);

  const [selected, setSelected] = useState<InfluProfileRow | null>(
    initialProfile ?? null
  );
  const [profileQuery, setProfileQuery] = useState("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  /** แคมเปญของเคส (ไม่บังคับ) — "" = ไม่อยู่ในแคมเปญไหน */
  const [campaignId, setCampaignId] = useState("");
  const [procedures, setProcedures] = useState<PickedProcedure[]>([]);
  /** หมายเหตุประกอบเมื่อมูลค่าเคสเกินเพดานงบของ Tier (0114) — บังคับกรอกตอนเกิน */
  const [budgetNote, setBudgetNote] = useState("");
  /** ค่าตัว (บาท) — เคสที่ influ คิดเงิน ต้องขึ้นเป็นบรรทัดหนึ่งใน Memo ให้ผู้อนุมัติเห็น */
  const [talentFee, setTalentFee] = useState("");
  /** จำนวน voucher ที่เปิดวงเงินให้เคสใหม่ (0106) — 0 = ยังไม่เปิด (เติมทีหลังที่แท็บรายละเอียดเคสได้) */
  const [voucherCount, setVoucherCount] = useState(0);
  const [serviceDate, setServiceDate] = useState("");
  const [doctorName, setDoctorName] = useState("");
  /** ช่องทางคุยงานของรอบนี้ (ส่วนใหญ่คือชื่อกลุ่มไลน์) — ต่อเคส ไม่ใช่ช่องทางของตัวบุคคล */
  const [contactChannel, setContactChannel] = useState("");
  /** ผู้รับผิดชอบทั้งชุด (ผู้ดูแล/ผู้ติดตาม/ผู้ออก Memo/ผู้เกี่ยวข้อง) — draft ในฟอร์ม
      เขียนจริงพร้อมเคสใน RPC เดียว (0108) ตั้งต้น: คนที่กดสร้าง = ผู้ดูแล */
  const [draftAssignees, setDraftAssignees] = useState<CaseAssignee[]>(
    me.id ? [{ userId: me.id, scopes: ["owner"] }] : []
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setSelected(null);
    setProfileQuery("");
    setCampaignId("");
    setProcedures([]);
    setBudgetNote("");
    setVoucherCount(0);
    setTalentFee("");
    setServiceDate("");
    setDoctorName("");
    setContactChannel("");
    setDraftAssignees(me.id ? [{ userId: me.id, scopes: ["owner"] }] : []);
    setErr(null);
  };

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people]
  );
  /** AssigneeEditor คุยเป็น AssigneeChange — ตรงนี้ยังไม่มีเคส จึง apply กับ draft ในฟอร์มแทน DB */
  const applyAssigneeDraft = (change: AssigneeChange) => {
    setDraftAssignees((prev) => {
      if (change.kind === "add")
        return [...prev, { userId: change.userId, scopes: change.scopes }];
      if (change.kind === "remove")
        return prev.filter((a) => a.userId !== change.userId);
      return prev.map((a) =>
        a.userId === change.userId ? { ...a, scopes: change.scopes } : a
      );
    });
  };

  // เลือกได้เฉพาะแคมเปญที่ยังเปิดใช้งาน — ของที่ปิดไปแล้วไม่ควรผูกเคสใหม่เข้าไป
  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.active),
    [campaigns]
  );
  const selectedCampaign =
    activeCampaigns.find((c) => c.id === campaignId) ?? null;

  /** มีคนถือบทบาท "ผู้ดูแล" ไหม — ไม่มี = เตือน (ไม่บล็อค) เพราะเคสจะไม่มีเจ้าภาพขั้น Memo/สัญญา */
  const hasOwner = draftAssignees.some((a) =>
    normalizeRoles(a.scopes).includes("owner")
  );

  /** รอบที่ยังเดินอยู่ของโปรไฟล์ที่เลือก — เตือนก่อนเปิดซ้อน (ไม่บล็อค) */
  const openRounds = selected
    ? (openRoundsByPerson?.get(selected.id) ?? [])
    : [];

  const matchedProfiles = useMemo(() => {
    const q = profileQuery.trim().toLowerCase();
    const list = q
      ? allProfiles.filter((p) =>
          [p.first_name, p.last_name, p.nickname, p.phone]
            .filter(Boolean)
            .some((s) => (s as string).toLowerCase().includes(q))
        )
      : allProfiles;
    return list.slice(0, 8);
  }, [allProfiles, profileQuery]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!selected) {
      setErr("เลือกโปรไฟล์ Influencer ก่อน — ถ้ายังไม่มีให้กด 'สร้างโปรไฟล์ใหม่'");
      return;
    }
    // ของบังคับคือ "วงเงิน voucher" ไม่ใช่หัตถการ (ผู้ใช้ 2026-09-07:
    // บางเคสยังไม่ได้เลือกหัตถการมา แต่ voucher ต้องเปิดแล้ว)
    if (voucherCount < 1) {
      setErr("เปิดวงเงิน voucher อย่างน้อย 1 ใบก่อนสร้างเคส");
      return;
    }
    const feeNum = talentFee.trim() === "" ? null : Number(talentFee);
    if (feeNum !== null && (!Number.isFinite(feeNum) || feeNum < 0)) {
      setErr("ค่าตัวต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    // มูลค่าเคส = วงเงิน voucher + ค่าตัว (0106) — ราคาหัตถการที่เลือกไม่เข้าสมการแล้ว
    const caseValue = caseValueOf({
      voucher_count: voucherCount,
      voucher_unit: INFLU_VOUCHER_UNIT,
      talent_fee: feeNum,
    });
    // เกินเพดานงบของ Tier = ต้องมีหมายเหตุประกอบใน Memo (ตารางเพดานทางการ 2026-09-07)
    const selTier =
      selected.tier ??
      (selected.followers != null ? tierFromFollowers(selected.followers) : null);
    if (overBudgetCap(selTier, caseValue) && budgetNote.trim() === "") {
      setErr(
        `มูลค่าเคส ${formatCurrency(caseValue ?? 0)} เกินเพดาน Tier ${
          selTier ? INFLU_TIERS[selTier].label : ""
        } (${formatCurrency(selTier ? INFLU_BUDGET_CAPS[selTier].cap : 0)}) — กรอกหมายเหตุประกอบการขออนุมัติก่อน`
      );
      return;
    }
    setSaving(true);
    setErr(null);

    // สร้างทั้งก้อนใน RPC เดียว (0108): เลขรอบคำนวณใน DB (ล็อกแถวโปรไฟล์),
    // เคส + หัตถการ + ผู้รับผิดชอบ อยู่ใน transaction เดียวกัน — ล้มตรงไหน = ไม่มีเคสค้าง
    // (ของเดิมยิงทีละคำสั่งจาก client แล้วผู้รับผิดชอบ/หัตถการหลุดได้แบบเงียบๆ)
    const { data: newId, error } = await supabase.rpc("influ_create_case", {
      p: {
        person_id: selected.id,
        stage: INFLU_STAGE.memo,
        campaign_id: campaignId || null,
        // 0114: ธง "รอปรึกษา" ตั้งอัตโนมัติ — ไม่มีหัตถการ = ยังไม่ระบุ (ของบังคับคือ voucher)
        consult_only: procedures.length === 0,
        budget_note: budgetNote.trim() || null,
        talent_fee: feeNum,
        voucher_count: voucherCount,
        // ราคาต่อใบ ณ ตอนเปิด — snapshot ลงแถว ไม่อ่านค่าคงที่สดตอนแสดงผล
        voucher_unit: INFLU_VOUCHER_UNIT,
        case_value: caseValue,
        // สร้างจากฟอร์มนี้ = ข้อมูลครบพร้อมทำ Memo ทันที (ไม่มีคิว "รอทำ Memo" ให้ติ๊กเองแล้ว)
        memo_ready_at: new Date().toISOString(),
        service_date: serviceDate || null,
        doctor_name: doctorName.trim() || null,
        contact_channel: contactChannel.trim() || null,
        // sync ข้อความสรุปตั้งแต่แรก — Memo/ปฏิทิน/ช่องค้นหาใช้ค่านี้
        procedure_text: procedureSummaryText(procedures) || null,
        procedures: procedures.map((pr) => ({
          name: pr.name,
          price: pr.price,
          price_item_id: pr.priceItemId,
          promo_package_id: pr.promoPackageId,
          product_team: pr.team,
        })),
        assignees: draftAssignees.map((a) => ({
          user_id: a.userId,
          scopes: a.scopes,
        })),
      } as unknown as Json,
    });
    if (error || !newId) {
      setSaving(false);
      // 23505 บน unique (person_id, round_no) = มีคนเปิดรอบนี้พร้อมกันจากอีกหน้าต่าง (0106)
      setErr(
        error?.code === "23505"
          ? "มีคนเปิดรอบนี้ให้โปรไฟล์เดียวกันพร้อมกันอยู่ — กดสร้างอีกครั้งเพื่อรับเลขรอบถัดไป"
          : `สร้างนัดไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`
      );
      return;
    }
    const createdId = newId as string;

    // รูปโปรไฟล์ copy เข้าโฟลเดอร์เคสใหม่ (best effort) ผ่าน helper กลาง —
    // สร้างแถวในแกลเลอรีของเคส (influ_case_photos, 0105) ให้ด้วย ไม่ใช่แค่คอลัมน์หน้าปก
    await copyPhotoIntoCase(
      supabase,
      createdId,
      selected.photo_path ?? copyFrom?.photo_path ?? null,
      "photo"
    );
    await copyPhotoIntoCase(
      supabase,
      createdId,
      copyFrom?.channel_photo_path ?? null,
      "channel"
    );

    const name = profileName(selected);
    logInflu(supabase, actor, {
      action: "create",
      entityId: createdId,
      influencerId: createdId,
      influencerName: name,
      summary: `สร้างนัดใหม่ของ ${name} (รหัส ${selected.influ_code}) — ${
        procedures.length > 0
          ? `หัตถการ: ${procedureSummaryText(procedures)}`
          : "รอปรึกษา (ยังไม่ระบุหัตถการ)"
      }${feeNum !== null ? ` · ค่าตัว ${formatNumber(feeNum)} บาท` : ""}`,
      meta: {
        person_id: selected.id,
        procedures: procedures.length,
        consult_only: procedures.length === 0,
        talent_fee: feeNum,
        influ_code: selected.influ_code,
        campaign: selectedCampaign?.tag ?? null,
        contact_channel: contactChannel.trim() || null,
        assignees: draftAssignees.length,
      },
    });

    // แจ้งเตือน 2 ก้อน: คนที่ถูกมอบหมาย (เด่น — forceAction) และ "มีเคสใหม่" ของขั้น Memo
    // (ผู้ทำเองถูกตัดออกให้แล้วใน notifyInflu — จุดเรียกไม่ต้องกรองเอง)
    notifyInflu(supabase, actor, {
      influencerId: createdId,
      influencerName: name,
      assignees: draftAssignees,
      type: "assigned",
      title: `คุณถูกมอบหมายเคส ${name}`,
      body: draftAssignees
        .filter((a) => a.userId !== me.id)
        .map((a) => roleSummary(a.scopes))
        .join(" · "),
      href: `/influencers/${createdId}`,
      forceAction: draftAssignees
        .filter((a) => a.scopes.length > 0)
        .map((a) => a.userId),
    });
    notifyInflu(supabase, actor, {
      influencerId: createdId,
      influencerName: name,
      assignees: draftAssignees,
      scope: "memo",
      type: "case_created",
      title: `เปิดเคสใหม่: ${name}`,
      body:
        procedures.length > 0
          ? procedureSummaryText(procedures)
          : "รอปรึกษา (ยังไม่ระบุหัตถการ)",
      href: `/influencers/${createdId}`,
    });

    setSaving(false);
    onClose();
    reset();
    router.push(`/influencers/${createdId}`);
    router.refresh();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          if (saving) return;
          onClose();
          reset();
        }}
        title="สร้างนัดใหม่ (เปิดเคส)"
        wide
      >
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {/* ---- 1. โปรไฟล์ Influencer ---- */}
          <FormSection n={1} title="โปรไฟล์ Influencer">
          <div>
            <Label>โปรไฟล์ Influencer *</Label>
            {selected ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5">
                <UserRound size={18} className="shrink-0 text-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-800">
                    {profileName(selected)}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {[
                      selected.phone,
                      selected.followers != null
                        ? `${formatNumber(selected.followers)} followers`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "ยังไม่มีข้อมูลติดต่อ"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  aria-label="เปลี่ยนโปรไฟล์"
                  onClick={() => setSelected(null)}
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white hover:text-rose-500 active:scale-90 sm:h-8 sm:w-8"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    type="text"
                    disabled={saving}
                    value={profileQuery}
                    onChange={(e) => setProfileQuery(e.target.value)}
                    placeholder="ค้นหา"
                    className="w-full rounded-lg border border-stone-300/80 bg-white/80 py-2 pl-9 pr-3 text-base text-stone-900 placeholder:text-stone-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm"
                  />
                </div>
                <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-white">
                  {matchedProfiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p)}
                      className="flex w-full cursor-pointer items-center gap-2 border-b border-stone-100 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-brand-50"
                    >
                      <UserRound size={15} className="shrink-0 text-stone-300" />
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                        {profileName(p)}
                      </span>
                      {(openRoundsByPerson?.get(p.id)?.length ?? 0) > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          มีเคสเปิดอยู่
                        </span>
                      )}
                      {p.followers != null && (
                        <span className="shrink-0 text-xs tabular-nums text-stone-400">
                          {formatNumber(p.followers)}
                        </span>
                      )}
                    </button>
                  ))}
                  {matchedProfiles.length === 0 && (
                    <p className="px-3 py-2.5 text-sm text-stone-400">
                      ไม่พบโปรไฟล์ที่ตรงกับคำค้น
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setProfileModalOpen(true)}
                    className="flex w-full cursor-pointer items-center gap-1.5 border-t border-stone-100 px-3 py-2.5 text-left text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                  >
                    <UserRoundPlus size={15} />
                    สร้างโปรไฟล์ใหม่...
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* มีรอบที่ยังเดินอยู่ = เตือนให้รู้ตัว แต่เปิดซ้อนได้ (กติกาผู้ใช้ 2026-09-03) */}
          {openRounds.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-800">
              คนนี้มีเคสที่ยังเดินอยู่ (
              {openRounds.map((n) => `รอบ ${n}`).join(" · ")}) —
              เปิดรอบใหม่ซ้อนได้ แต่จะเป็นคนละการ์ด คนละ Memo และคนละสัญญา
            </p>
          )}
            <div className="mt-3">
              <div>
                <Label>รหัส Influ ID</Label>
                {/* 0107: รหัสเป็นของ "ตัวบุคคล" — ทุกรอบของคนนี้ใช้รหัสเดียวกัน
                    (แฮชแท็กที่ใช้ track ยอดจาก Meta จึงชี้กลับมาที่คนเดียวเสมอ) */}
                <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5">
                  <Hash size={15} className="shrink-0 text-brand-500" />
                  <span className="font-mono text-sm font-semibold text-stone-700">
                    {selected?.influ_code ?? "INF-XXXXX"}
                  </span>
                </div>
              </div>
            </div>
          </FormSection>

          {/* ---- 2. หัตถการที่จะเข้ารับ ---- */}
          <FormSection n={2} title="หัตถการที่จะเข้ารับ">
          <div>
            {/* 0114: หัตถการไม่บังคับแล้ว (ของบังคับคือ voucher ในส่วน 3) —
                ไม่เลือก = เคส "รอปรึกษา" อัตโนมัติ ไม่มี checkbox ให้ติ๊กอีก */}
            <Label className="!mb-0">เลือก Product Team</Label>
            <div className="mt-1.5">
              <ProcedurePicker
                picked={procedures}
                onChange={setProcedures}
                catalog={priceCatalog}
                promos={promoCatalog}
                services={services}
                onServiceCreated={onServiceCreated}
                disabled={saving}
              />
            </div>
          </div>
          </FormSection>

          {/* ---- 3. วงเงิน + ค่าตัว ----
              วงเงิน voucher เป็นตัวตั้งมูลค่าเคสตั้งแต่ 0106 (case_value = วงเงิน + ค่าตัว)
              จึงให้เป็นส่วนของตัวเอง ไม่ซ่อนไว้ใน "ตัวเลือกเพิ่มเติม" — เว้นเป็น 0
              แล้วมาเปิดทีหลังที่หน้าเคสก็ได้ */}
          <FormSection n={3} title="วงเงิน voucher และค่าตัว">
            <VoucherPicker
              count={voucherCount}
              unit={INFLU_VOUCHER_UNIT}
              onChange={setVoucherCount}
              disabled={saving}
            />
            <div className="mt-3">
              <Label htmlFor="nc-fee">ค่าตัว (บาท)</Label>
              <Input
                id="nc-fee"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                disabled={saving}
                value={talentFee}
                onChange={(e) => setTalentFee(e.target.value)}
              />
              {(() => {
                // มูลค่าเคสโชว์สดให้เห็นก่อนกดสร้าง — สูตรเดียวกับตอน insert (วงเงิน + ค่าตัว)
                const fee = talentFee.trim() === "" ? 0 : Number(talentFee) || 0;
                const credit = voucherCreditOf({
                  voucher_count: voucherCount,
                  voucher_unit: INFLU_VOUCHER_UNIT,
                });
                const total = credit + fee;
                // ผู้ใช้ 2026-09-03: เตือนถ้าวงเงินที่เปิดน้อยกว่ามูลค่าสินค้าที่เลือกไว้
                const itemsTotal = procedures.reduce(
                  (sum, p) => sum + (Number(p.price) || 0),
                  0
                );
                return total > 0 ? (
                  <p className="mt-1.5 text-xs font-medium text-brand-700">
                    มูลค่าเคสรวม {formatCurrency(total)} (
                    {voucherLabelOf({
                      voucher_count: voucherCount,
                      voucher_unit: INFLU_VOUCHER_UNIT,
                    }) ?? "ยังไม่เปิดวงเงิน voucher"}
                    {fee > 0 && ` + ค่าตัว ${formatCurrency(fee)}`})
                    {credit > 0 && itemsTotal > credit && (
                      <span className="ml-1 font-normal text-amber-700">
                        (น้อยกว่ามูลค่าสินค้าที่เลือกไว้ {formatCurrency(itemsTotal)})
                      </span>
                    )}
                  </p>
                ) : null;
              })()}
            </div>
            {(() => {
              // เพดานงบของ Tier (ตารางทางการ 2026-09-07) — เกินเมื่อไหร่บังคับหมายเหตุ
              const fee = talentFee.trim() === "" ? 0 : Number(talentFee) || 0;
              const total =
                voucherCreditOf({
                  voucher_count: voucherCount,
                  voucher_unit: INFLU_VOUCHER_UNIT,
                }) + fee;
              const t =
                selected?.tier ??
                (selected?.followers != null
                  ? tierFromFollowers(selected.followers)
                  : null);
              if (!t) return null;
              const { cap, approvers } = INFLU_BUDGET_CAPS[t];
              const over = total > cap;
              return (
                <div className="mt-3">
                  <p
                    className={`text-xs font-medium ${over ? "text-amber-700" : "text-stone-600"}`}
                  >
                    เพดานงบ Tier {INFLU_TIERS[t].label} : {formatCurrency(cap)}
                    {over &&
                      ` — เกินอยู่ ${formatCurrency(total - cap)} · ผู้อนุมัติ ${approvers}`}
                  </p>
                  {(over || budgetNote.trim() !== "") && (
                    <div className="mt-2">
                      <Label htmlFor="nc-budget-note">
                        หมายเหตุประกอบการขออนุมัติ {over ? "*" : ""}
                      </Label>
                      <Textarea
                        id="nc-budget-note"
                        rows={2}
                        disabled={saving}
                        value={budgetNote}
                        onChange={(e) => setBudgetNote(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </FormSection>

          {/* ---- 4. นัดหมาย ---- */}
          <FormSection n={4} title="นัดหมาย (ไม่บังคับ — เคาะทีหลังได้)">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="nc-date">วันเข้าทำหัตถการ</Label>
                <Input
                  id="nc-date"
                  type="date"
                  disabled={saving}
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="nc-doctor">แพทย์ที่รับเคส</Label>
                <DoctorSelect
                  id="nc-doctor"
                  doctors={doctors}
                  value={doctorName}
                  onChange={setDoctorName}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="nc-campaign">แคมเปญ</Label>
              <Select
                id="nc-campaign"
                disabled={saving}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="">— ไม่อยู่ในแคมเปญ —</option>
                {activeCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (#{c.tag})
                  </option>
                ))}
              </Select>
            </div>
          </FormSection>

          {/* ---- 5. ผู้รับผิดชอบเคส ----
              ผู้ใช้ 2026-09-03: "เลือกผู้รับผิดชอบต้องมีให้เลือกทุกส่วน
              ผู้ดูแล > ผู้ติดตาม > ผู้ออก Memo" — ใช้เช็คลิสต์ตัวเดียวกับหน้าเคส
              (เขียนจริงพร้อมเคสใน RPC เดียว ไม่ใช่ insert ตามหลังแบบเดิมที่หลุดได้เงียบๆ) */}
          <FormSection n={5} title="ผู้รับผิดชอบเคส">
            {!hasOwner && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-800">
                ยังไม่มี &ldquo;ผู้ดูแล&rdquo; ของเคสนี้ —
                สร้างได้ แต่จะไม่มีใครถือขั้น Memo/สัญญา และเคสจะไม่โผล่ในตัวกรอง
                &ldquo;เคสของฉัน&rdquo; ของใครเลย
              </p>
            )}
            <AssigneeEditor
              assignees={draftAssignees}
              people={people}
              peopleById={peopleById}
              canEdit={!saving}
              onChange={applyAssigneeDraft}
            />
          </FormSection>

          {/* ---- ตัวเลือกเพิ่มเติม (พับไว้ — ทีมกรอกไม่ถึง 1 ใน 10 เคส) ---- */}
          <details className="rounded-xl border border-stone-200 bg-white/70 p-3 sm:p-4">
            <summary className="cursor-pointer text-sm font-semibold text-stone-700 marker:text-stone-400">
              ตัวเลือกเพิ่มเติม (ช่องทางคุยงาน)
            </summary>
            <div className="mt-3">
              <Label htmlFor="nc-contact">ช่องทางการติดต่อ</Label>
              <Input
                id="nc-contact"
                disabled={saving}
                value={contactChannel}
                onChange={(e) => setContactChannel(e.target.value)}
              />
            </div>
          </details>


          {err && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {err}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                onClose();
                reset();
              }}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              loading={saving}
              disabled={!selected || voucherCount < 1}
            >
              สร้างนัดและเปิดหน้าเดินงาน
            </Button>
          </div>
        </form>
      </Modal>

      {/* สร้างโปรไฟล์ใหม่จากในนี้ได้เลย — เซฟแล้วถูกเลือกให้ทันที */}
      <ProfileFormModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        actor={actor}
        onSaved={(p) => {
          setCreatedProfiles((prev) => [p, ...prev]);
          setSelected(p);
        }}
      />
    </>
  );
}
