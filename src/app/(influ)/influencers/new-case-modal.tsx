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
  CalendarPlus,
  Hash,
  Search,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Input, Label, Modal, Select } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { INFLU_STAGE, procedureSummaryText } from "@/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type {
  DoctorRow,
  InfluCampaignDefRow,
  InfluProfileRow,
  InfluScope,
  InfluServiceRow,
} from "@/lib/types";
import {
  type AssigneeChange,
  AssigneeRolePicker,
  type CaseAssignee,
  type InfluPerson,
} from "./assignees";
import { DoctorSelect } from "./doctor-select";
import type {
  PriceCatalogEntry,
  PromoCatalogEntry,
} from "./procedure-items-editor";
import { ProcedurePicker, type PickedProcedure } from "./procedure-picker";
import { ProfileFormModal, profileName } from "./profile-form";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
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
  /** รอปรึกษา = ยังไม่รู้ว่าจะทำอะไร ต้องให้แพทย์ดูก่อน — ทางออกเดียวที่เปิดเคสได้โดยไม่มีหัตถการ */
  const [consultOnly, setConsultOnly] = useState(false);
  /** ค่าตัว (บาท) — เคสที่ influ คิดเงิน ต้องขึ้นเป็นบรรทัดหนึ่งใน Memo ให้ผู้อนุมัติเห็น */
  const [talentFee, setTalentFee] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [doctorName, setDoctorName] = useState("");
  /** ช่องทางคุยงานของรอบนี้ (ส่วนใหญ่คือชื่อกลุ่มไลน์) — ต่อเคส ไม่ใช่ช่องทางของตัวบุคคล */
  const [contactChannel, setContactChannel] = useState("");
  /** ผู้ออก Memo (ขั้น 1.1/1.2) เลือกได้ตั้งแต่ตอนสร้างเคส — draft ในฟอร์ม insert จริงหลังสร้างสำเร็จ */
  const [memoMakers, setMemoMakers] = useState<CaseAssignee[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setSelected(null);
    setProfileQuery("");
    setCampaignId("");
    setProcedures([]);
    setConsultOnly(false);
    setTalentFee("");
    setServiceDate("");
    setDoctorName("");
    setContactChannel("");
    setMemoMakers([]);
    setErr(null);
  };

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people]
  );
  /** AssigneeRolePicker คุยเป็น AssigneeChange — ตรงนี้ยังไม่มีเคสจึง apply กับ draft ในฟอร์มแทน DB */
  const applyMemoDraft = (change: AssigneeChange) => {
    setMemoMakers((prev) => {
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
    if (procedures.length === 0 && !consultOnly) {
      setErr(
        "เลือกหัตถการที่จะเข้ารับอย่างน้อย 1 รายการ — ถ้ายังไม่รู้ว่าจะทำอะไร ให้ติ๊ก 'รอปรึกษา'"
      );
      return;
    }
    const feeNum = talentFee.trim() === "" ? null : Number(talentFee);
    if (feeNum !== null && (!Number.isFinite(feeNum) || feeNum < 0)) {
      setErr("ค่าตัวต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    // มูลค่าเคสคำนวณให้เอง = Σ ราคาหัตถการที่เลือก + ค่าตัว (กติกาผู้ใช้ 2026-08-27)
    // ยังไม่มีอะไรตีมูลค่าได้ (รอปรึกษา/ราคา 0 ทั้งหมด) = null ไม่ใช่ 0
    const caseValue =
      procedures.reduce((s, p) => s + (Number(p.price) || 0), 0) + (feeNum ?? 0);
    setSaving(true);
    setErr(null);

    // เลขรอบอ่านสดจาก DB — กันหน้าค้าง/สอง session สร้างพร้อมกันแล้วได้เลขซ้ำ (กติกา 0073)
    const { data: latest, error: latestErr } = await supabase
      .from("influencers")
      .select("round_no")
      .eq("person_id", selected.id)
      .order("round_no", { ascending: false })
      .limit(1);
    if (latestErr) {
      setSaving(false);
      setErr(`สร้างนัดไม่สำเร็จ: ${latestErr.message}`);
      return;
    }
    const roundNo = (latest?.[0]?.round_no ?? 0) + 1;

    // รหัส Influ ID ไม่ต้องออกที่นี่แล้ว (0107) — เป็นของ "ตัวบุคคล" ติดมากับโปรไฟล์
    // และ trigger influencers_sync_code เติมให้ตอน insert ทุกรอบของคนนี้จึงรหัสเดียวกัน
    const { data: created, error } = await supabase
      .from("influencers")
      .insert({
        person_id: selected.id,
        round_no: roundNo,
        // ข้อมูลตัวบุคคลคัดลอกจากโปรไฟล์ (การ์ด/บอร์ด/Memo อ่านจากแถวเคสโดยตรง)
        first_name: selected.first_name,
        last_name: selected.last_name,
        nickname: selected.nickname,
        phone: selected.phone,
        occupation: selected.occupation,
        followers: selected.followers,
        follower_note: selected.follower_note,
        tier: selected.tier,
        // ขั้นติดต่อ+รายละเอียดจบตอนทำโปรไฟล์/ฟอร์มนี้แล้ว — เริ่มที่ Memo เลย
        stage: INFLU_STAGE.memo,
        campaign_id: campaignId || null,
        // รอปรึกษา = ทำ Memo ได้ทั้งที่ยังไม่มีหัตถการ (เอาติ๊กออกได้ที่แท็บรายละเอียดเคสเมื่อเคาะแล้ว)
        // ติ๊กไว้แต่ดันเลือกหัตถการมาด้วย = ไม่ใช่เคสรอปรึกษาแล้ว ธงต้องไม่ค้าง
        consult_only: consultOnly && procedures.length === 0,
        talent_fee: feeNum,
        case_value: caseValue > 0 ? caseValue : null,
        // สร้างจากฟอร์มนี้ = ข้อมูลครบพร้อมทำ Memo ทันที (ไม่มีคิว "รอทำ Memo" ให้ติ๊กเองแล้ว)
        memo_ready_at: new Date().toISOString(),
        service_date: serviceDate || null,
        doctor_name: doctorName.trim() || null,
        contact_channel: contactChannel.trim() || null,
        owner_id: me.id,
        created_by: me.id,
        // sync ข้อความสรุปตั้งแต่แรก — Memo/ปฏิทิน/ช่องค้นหาใช้ค่านี้
        procedure_text: procedureSummaryText(procedures) || null,
      })
      .select("id")
      .single();
    if (error || !created) {
      setSaving(false);
      // 23505 บน unique (person_id, round_no) = มีคนเปิดรอบนี้พร้อมกันจากอีกหน้าต่าง (0106)
      setErr(
        error?.code === "23505"
          ? "มีคนเปิดรอบนี้ให้โปรไฟล์เดียวกันพร้อมกันอยู่ — กดสร้างอีกครั้งเพื่อรับเลขรอบถัดไป"
          : `สร้างนัดไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`
      );
      return;
    }

    // หัตถการที่เลือก → influ_procedure_items (ราคาอ้างอิง = ต้นทุนตั้งต้น, แยก product team)
    // เคส "รอปรึกษา" ยังไม่มีรายการ — ข้ามไปเลย (ไม่ยิง insert ด้วยลิสต์ว่าง)
    const { error: itemsError } =
      procedures.length > 0
        ? await supabase.from("influ_procedure_items").insert(
            procedures.map((p, idx) => ({
              influencer_id: created.id,
              name: p.name,
              price: p.price,
              price_item_id: p.priceItemId,
              promo_package_id: p.promoPackageId,
              product_team: p.team,
              position: idx + 1,
            }))
          )
        : { error: null };

    // รูปโปรไฟล์ copy เข้าโฟลเดอร์เคสใหม่ (best effort) — ห้ามชี้ path ข้ามเคส
    // เพราะลบเคส = ลบโฟลเดอร์ influencers/{id}/ ของเคสนั้น (กติกา 0073)
    if (selected.photo_path) {
      const base = sanitizeFileName(
        selected.photo_path.split("/").pop() ?? "photo.jpg"
      );
      const dest = `influencers/${created.id}/${Date.now()}-${base}`;
      const { error: cpErr } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .copy(selected.photo_path, dest);
      if (!cpErr) {
        await supabase
          .from("influencers")
          .update({ photo_path: dest })
          .eq("id", created.id);
      }
    }

    // บทบาทตั้งต้น: ผู้สร้าง = "ผู้ดูแล" (owner) + ผู้ออก Memo ที่เลือกในฟอร์ม = "memo"
    // (เลือกผู้สร้างเป็นผู้ออก Memo เอง = รวมเป็นแถวเดียว 2 บทบาท — unique (influencer_id, user_id))
    // ทำหลังสร้างเคสสำเร็จเสมอ ไม่งั้นการ์ดใหม่จะไม่มีเจ้าภาพและไม่มีใครได้แจ้งเตือน
    {
      const rows = new Map<string, InfluScope[]>();
      if (me.id) rows.set(me.id, ["owner"]);
      for (const a of memoMakers) {
        const prev = rows.get(a.userId);
        rows.set(a.userId, prev ? [...prev, "memo"] : ["memo"]);
      }
      if (rows.size > 0) {
        const { error: asErr } = await supabase.from("influ_assignees").insert(
          [...rows.entries()].map(([userId, scopes]) => ({
            influencer_id: created.id,
            user_id: userId,
            scopes,
            created_by: me.id,
          }))
        );
        if (asErr) {
          // ไม่บล็อคการสร้างเคส — บอกให้ไปกำหนดเองที่หน้าเคสแทน
          console.warn("ตั้งผู้รับผิดชอบตั้งต้นไม่สำเร็จ:", asErr.message);
        }
      }
    }

    const name = profileName(selected);
    logInflu(supabase, actor, {
      action: "create",
      entityId: created.id,
      influencerId: created.id,
      influencerName: name,
      summary: `สร้างนัดใหม่ (รอบ ${roundNo}) ของ ${name} (รหัส ${selected.influ_code}) — ${
        procedures.length > 0
          ? `หัตถการ: ${procedureSummaryText(procedures)}`
          : "รอปรึกษา (ยังไม่ระบุหัตถการ)"
      }${feeNum !== null ? ` · ค่าตัว ${formatNumber(feeNum)} บาท` : ""}`,
      meta: {
        person_id: selected.id,
        round_no: roundNo,
        procedures: procedures.length,
        consult_only: consultOnly,
        talent_fee: feeNum,
        influ_code: selected.influ_code,
        campaign: selectedCampaign?.tag ?? null,
        contact_channel: contactChannel.trim() || null,
      },
    });

    setSaving(false);
    if (itemsError) {
      setErr(
        `สร้างเคสแล้ว แต่บันทึกหัตถการไม่สำเร็จ (${itemsError.message}) — เพิ่มรายการอีกครั้งได้ที่แท็บรายละเอียดเคส`
      );
    }
    onClose();
    reset();
    router.push(`/influencers/${created.id}`);
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
      >
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs leading-5 text-brand-700">
            <CalendarPlus size={14} className="mt-0.5 shrink-0" />
            <span>
              เลือกโปรไฟล์ที่ตกลงร่วมงานแล้ว + หัตถการที่จะเข้ารับ —
              เคสจะเริ่มที่ขั้น <span className="font-semibold">Memo ขออนุมัติ</span>{" "}
              ทันที · ผู้รับผิดชอบเคสคือ{" "}
              <span className="font-semibold">{me.name || "บัญชีของคุณ"}</span>
            </span>
          </p>

          {/* ---- ขั้น 1: เลือกโปรไฟล์ ---- */}
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
                    placeholder="ค้นหาจากชื่อ / ชื่อเล่น / เบอร์..."
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

          {/* ---- ขั้น 2: ข้อมูลเคส ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>รหัส Influ ID</Label>
              {/* 0107: รหัสเป็นของ "ตัวบุคคล" — ทุกรอบของคนนี้ใช้รหัสเดียวกัน
                  (แฮชแท็กที่ใช้ track ยอดจาก Meta จึงชี้กลับมาที่คนเดียวเสมอ) */}
              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5">
                <Hash size={15} className="shrink-0 text-brand-500" />
                <span className="font-mono text-sm font-semibold text-stone-700">
                  {selected?.influ_code ?? "INF-XXXXX"}
                </span>
                <span className="ml-auto text-xs text-stone-500">
                  {selected ? "รหัสประจำตัว" : "ตามโปรไฟล์ที่เลือก"}
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="nc-contact">ช่องทางการติดต่อ</Label>
              <Input
                id="nc-contact"
                disabled={saving}
                value={contactChannel}
                onChange={(e) => setContactChannel(e.target.value)}
                placeholder="เช่น กลุ่มไลน์ ART x คุณเอ"
              />
            </div>
          </div>

          {/* แคมเปญ (ไม่บังคับ) — เลือกแล้วเคสนี้จะมีแฮชแท็กของแคมเปญเพิ่มเข้าไปในชุดที่ influ ต้องติด */}
          <div>
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
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="!mb-0">
                หัตถการที่รับ {consultOnly ? "" : "*"}
              </Label>
              {/* ทางออกเดียวที่เปิดเคสได้โดยไม่มีหัตถการ — ติ๊กแล้วเขียน Memo ไปปรึกษาก่อน */}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                <input
                  type="checkbox"
                  checked={consultOnly}
                  disabled={saving}
                  onChange={(e) => setConsultOnly(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[#a96a58]"
                />
                รอปรึกษา (ยังไม่ระบุหัตถการ)
              </label>
            </div>
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
          <div>
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
              placeholder="เว้นว่าง = ไม่มีค่าตัว (แลกหัตถการ)"
            />
            {(() => {
              // มูลค่าเคสโชว์สดให้เห็นก่อนกดสร้าง — สูตรเดียวกับตอน insert
              const fee = talentFee.trim() === "" ? 0 : Number(talentFee) || 0;
              const total =
                procedures.reduce((s, p) => s + (Number(p.price) || 0), 0) + fee;
              return total > 0 ? (
                <p className="mt-1.5 text-xs font-medium text-brand-700">
                  มูลค่าเคสรวม {formatCurrency(total)} (หัตถการที่เลือก + ค่าตัว)
                </p>
              ) : null;
            })()}
          </div>
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

          {/* ผู้ออก Memo — assign ตั้งแต่ตอนสร้างเคส (ขั้น 1.1/1.2 เป็นของคนนี้)
              ไม่บังคับ: ยังไม่เลือก = ไปเลือกได้ที่การ์ดขั้น 1.0 ของหน้าเคส */}
          <AssigneeRolePicker
            role="memo"
            assignees={memoMakers}
            people={people}
            peopleById={peopleById}
            canEdit={!saving}
            onChange={applyMemoDraft}
          />

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
              disabled={!selected || (procedures.length === 0 && !consultOnly)}
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
