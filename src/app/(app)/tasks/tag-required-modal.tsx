"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Search, Sparkles, Stethoscope, X } from "lucide-react";
import { DoctorAvatar } from "@/app/(influ)/influencers/doctor-select";
import { Button, Modal } from "@/components/ui";
import { fuzzyFilter } from "@/lib/fuzzy";
import {
  INFLU_PRODUCT_TEAMS,
  influLabel,
  influTagHashtags,
  missingHashtagCount,
} from "@/lib/influ-constants";
import type { DoctorLite, InfluTagOption } from "@/lib/types";

/* กล่องบังคับติดแท็กก่อนส่งตรวจ (0100)
   - หมอ + influencer เป็นคนละหมวด ต้องตอบทั้งคู่ถึงจะส่งตรวจได้
   - "ไม่มีในชิ้นงานนี้" คือคำตอบที่ถูกต้องข้อหนึ่ง ไม่ใช่การข้าม — เก็บเป็น null
   - ค้นหาแบบใกล้เคียง (fuzzy) พิมพ์ผิด/สลับภาษาแป้นพิมพ์ก็ยังเจอ */

/** null = ตอบแล้วว่า "ไม่มี" · undefined = ยังไม่ตอบ */
type Answer = string | null | undefined;

const ROW =
  "flex w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors max-sm:min-h-11 sm:py-2";

function SectionHead({
  icon,
  title,
  answered,
}: {
  icon: ReactNode;
  title: string;
  answered: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-brand-500">{icon}</span>
      <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
      {answered ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
          <Check size={11} /> เลือกแล้ว
        </span>
      ) : (
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
          ต้องเลือก
        </span>
      )}
    </div>
  );
}

/* ช่องค้นหาในกล่อง — ไม่ autofocus เพราะบนมือถือคีย์บอร์ดจะเด้งมาบังลิสต์ */
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-2">
      <Search size={14} className="shrink-0 text-stone-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-base text-stone-800 placeholder:text-stone-500 focus:outline-none sm:text-sm"
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="ล้างคำค้น"
          className="shrink-0 rounded p-0.5 text-stone-400 hover:text-stone-600"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function NoneRow({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ROW} ${
        on
          ? "bg-stone-100 font-medium text-stone-700 ring-1 ring-stone-300"
          : "text-stone-500 hover:bg-stone-50"
      }`}
    >
      <span className="h-7 w-7 shrink-0 rounded-full border border-dashed border-stone-300" />
      {label}
    </button>
  );
}

export function TagRequiredModal({
  open,
  taskTitle,
  doctors,
  influOptions,
  initialDoctorId,
  initialInfluencerId,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  taskTitle: string;
  doctors: DoctorLite[];
  influOptions: InfluTagOption[];
  initialDoctorId: string | null;
  initialInfluencerId: string | null;
  onCancel: () => void;
  onConfirm: (v: { doctorId: string | null; influencerId: string | null }) => void;
}) {
  const [doctorId, setDoctorId] = useState<Answer>(initialDoctorId ?? undefined);
  const [influId, setInfluId] = useState<Answer>(
    initialInfluencerId ?? undefined
  );
  const [doctorQuery, setDoctorQuery] = useState("");
  const [influQuery, setInfluQuery] = useState("");

  const doctorList = useMemo(
    () =>
      fuzzyFilter(
        doctors,
        doctorQuery,
        (d) => [d.name, d.nickname, d.license_no],
        { limit: 8 }
      ),
    [doctors, doctorQuery]
  );

  const influList = useMemo(
    () =>
      fuzzyFilter(
        influOptions,
        influQuery,
        (o) => [
          influLabel(o),
          o.first_name,
          o.last_name,
          o.nickname,
          o.influ_code,
          o.doctor_name,
          o.campaign_tag,
          o.campaign_name,
        ],
        { limit: 8 }
      ),
    [influOptions, influQuery]
  );

  const ready = doctorId !== undefined && influId !== undefined;
  const picked = influOptions.find((o) => o.id === influId) ?? null;
  const missing = picked ? missingHashtagCount(influTagHashtags(picked)) : 0;

  return (
    <Modal open={open} onClose={onCancel} title="ติดแท็กก่อนส่งตรวจ" wide>
      <div className="space-y-5">
        <p className="text-sm leading-6 text-stone-500">
          งาน <span className="font-medium text-stone-700">{taskTitle}</span>{" "}
          ยังไม่ได้ติดแท็ก — เลือกหมอและ influencer ของชิ้นงานนี้
          ถ้าไม่เกี่ยวข้องกดปุ่มไม่มีได้เลย
        </p>

        {/* ---------- หมอ ---------- */}
        <div className="space-y-2">
          <SectionHead
            icon={<Stethoscope size={15} />}
            title="หมอในชิ้นงาน"
            answered={doctorId !== undefined}
          />
          <SearchBox
            value={doctorQuery}
            onChange={setDoctorQuery}
            placeholder="ค้นหาชื่อหมอ · ชื่อเล่น · เลข ปว."
          />
          <div className="space-y-0.5">
            {doctorList.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDoctorId(d.id)}
                className={`${ROW} ${
                  doctorId === d.id
                    ? "bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-200"
                    : "text-stone-700 hover:bg-stone-50"
                }`}
              >
                <DoctorAvatar doctor={d} size="md" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                {d.license_no ? (
                  <span className="shrink-0 font-mono text-[11px] text-stone-400">
                    ปว. {d.license_no}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-amber-700">
                    ยังไม่มีเลข ปว.
                  </span>
                )}
              </button>
            ))}
            {doctorList.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-stone-400">
                ไม่พบชื่อที่ใกล้เคียง — เพิ่มหมอได้ที่หน้าจัดการแท็ก
              </p>
            )}
            <NoneRow
              label="ไม่มีหมอในชิ้นงานนี้"
              on={doctorId === null}
              onClick={() => setDoctorId(null)}
            />
          </div>
        </div>

        {/* ---------- influencer ---------- */}
        <div className="space-y-2">
          <SectionHead
            icon={<Sparkles size={15} />}
            title="Influencer ในชิ้นงาน"
            answered={influId !== undefined}
          />
          <SearchBox
            value={influQuery}
            onChange={setInfluQuery}
            placeholder="ค้นหาชื่อ · ชื่อเล่น · รหัส Influ"
          />
          <div className="space-y-0.5">
            {influList.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setInfluId(o.id)}
                className={`${ROW} ${
                  influId === o.id
                    ? "bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-200"
                    : "text-stone-700 hover:bg-stone-50"
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-[10px] font-semibold text-cream">
                  {(o.nickname || o.first_name || "?").slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate">{influLabel(o)}</span>
                {o.teams.map((t) => (
                  <span
                    key={t}
                    className={`hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11px] sm:inline ${INFLU_PRODUCT_TEAMS[t].chip}`}
                  >
                    {INFLU_PRODUCT_TEAMS[t].label}
                  </span>
                ))}
                {o.influ_code && (
                  <span className="shrink-0 font-mono text-[11px] text-stone-400">
                    {o.influ_code}
                  </span>
                )}
              </button>
            ))}
            {influList.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-stone-400">
                ไม่พบชื่อที่ใกล้เคียง — รายชื่อมีเฉพาะเคสที่ผ่านขั้น Memo แล้ว
              </p>
            )}
            <NoneRow
              label="ไม่มี influencer ในชิ้นงานนี้"
              on={influId === null}
              onClick={() => setInfluId(null)}
            />
          </div>
          {missing > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              influencer คนนี้ยังมีแฮชแท็กไม่ครบ {missing} รายการ — ส่งตรวจได้
              แต่ต้องไปเติมข้อมูลที่หน้าเคสก่อนโพส ไม่งั้นดึงยอดจาก Meta
              ไม่ตรงคน
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
          <Button variant="ghost" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button
            disabled={!ready}
            onClick={() =>
              onConfirm({
                doctorId: doctorId ?? null,
                influencerId: influId ?? null,
              })
            }
          >
            {ready ? "ติดแท็กแล้วส่งตรวจ" : "เลือกให้ครบทั้ง 2 หมวด"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
