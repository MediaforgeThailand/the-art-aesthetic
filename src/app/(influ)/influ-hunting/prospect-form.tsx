"use client";

/**
 * ฟอร์มเพิ่ม/แก้รายชื่อบนบอร์ด Hunting (influ_prospects — migration 0081)
 *
 * จดได้ตั้งแต่ยังรู้แค่ชื่อช่อง: ชื่อ + ช่องทางโซเชียล + ดาวความน่าสนใจ +
 * หัตถการที่น่าจะเสนอ + นัดตามครั้งถัดไป — ทุกอย่างนอกจากชื่อไม่บังคับ
 * (ตอนตอบรับค่อยเก็บข้อมูลจริงจังผ่านการแปลงเป็นโปรไฟล์)
 *
 * ช่อง "เจอมาจากไหน" ถูกถอดออกจากฟอร์ม 2026-08-19 (ผู้ใช้: ไม่จำเป็นต้องมี) —
 * คอลัมน์ influ_prospects.source ยังอยู่ในตารางและไม่ถูกเขียนทับตอนแก้ข้อมูล
 *
 * seed ค่าด้วย key-remount (กติกาเดียวกับ ProfileFormModal — ห้าม sync ด้วย effect)
 */

import { Link2, Plus, Star, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import { INFLU_CHANNEL_PLATFORMS } from "@/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type { InfluProspectChannel, InfluProspectRow } from "@/lib/types";

type ChannelDraft = { platform: string; value: string; followers: string };

function parseFollowers(s: string): number | null {
  const n = Number(s.replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const EMPTY_CHANNEL: ChannelDraft = {
  platform: "Instagram",
  value: "",
  followers: "",
};

/** แถวดาว 1-5 — กดดาวเดิมซ้ำ = ล้างเป็น 0 (ยังไม่ให้คะแนน) */
export function RatingStars({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  /** ไม่ส่ง = อ่านอย่างเดียว */
  onChange?: (next: number) => void;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Star
            size={size}
            className={
              filled ? "fill-amber-400 text-amber-400" : "text-stone-300"
            }
          />
        );
        if (!onChange) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            aria-label={`ให้ ${n} ดาว`}
            onClick={() => onChange(n === value ? 0 : n)}
            className="flex h-11 w-8 cursor-pointer items-center justify-center transition-transform active:scale-90 sm:h-7 sm:w-6"
          >
            {star}
          </button>
        );
      })}
    </span>
  );
}

type ProspectFormProps = {
  open: boolean;
  onClose: () => void;
  /** null = เพิ่มรายชื่อใหม่ */
  prospect?: InfluProspectRow | null;
  actor: InfluLogActor;
  onSaved?: (prospect: InfluProspectRow) => void;
};

export function ProspectFormModal(props: ProspectFormProps) {
  return (
    <ProspectFormInner
      key={`${props.open ? "open" : "closed"}:${props.prospect?.id ?? "new"}`}
      {...props}
    />
  );
}

function ProspectFormInner({
  open,
  onClose,
  prospect = null,
  actor,
  onSaved,
}: ProspectFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const datalistId = useId();
  const [name, setName] = useState(prospect?.name ?? "");
  const [nickname, setNickname] = useState(prospect?.nickname ?? "");
  const [phone, setPhone] = useState(prospect?.phone ?? "");
  const [occupation, setOccupation] = useState(prospect?.occupation ?? "");
  const [followers, setFollowers] = useState(
    prospect?.followers != null ? String(prospect.followers) : ""
  );
  const [rating, setRating] = useState(prospect?.rating ?? 0);
  const [interested, setInterested] = useState(
    prospect?.interested_services ?? ""
  );
  const [note, setNote] = useState(prospect?.note ?? "");
  const [nextOn, setNextOn] = useState(prospect?.next_followup_on ?? "");
  const [rows, setRows] = useState<ChannelDraft[]>(() =>
    prospect && prospect.channels.length > 0
      ? prospect.channels.map((c) => ({
          platform: c.platform,
          value: c.value,
          followers: c.followers != null ? String(c.followers) : "",
        }))
      : [EMPTY_CHANNEL]
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setRow = (idx: number, patch: Partial<ChannelDraft>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setErr(null);
    const channels: InfluProspectChannel[] = rows
      .map((r) => ({
        platform: r.platform.trim() || "อื่นๆ",
        value: r.value.trim(),
        followers: parseFollowers(r.followers),
      }))
      .filter((c) => c.value !== "");
    const fields = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      phone: phone.trim() || null,
      occupation: occupation.trim() || null,
      followers: parseFollowers(followers),
      rating,
      interested_services: interested.trim() || null,
      note: note.trim() || null,
      next_followup_on: nextOn || null,
      channels,
    };

    const query = prospect
      ? supabase
          .from("influ_prospects")
          .update(fields)
          .eq("id", prospect.id)
          .select("*")
          .single()
      : supabase
          .from("influ_prospects")
          .insert({ ...fields, owner_id: actor.id, created_by: actor.id })
          .select("*")
          .single();
    const { data, error } = await query;
    if (error || !data) {
      setSaving(false);
      setErr(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }

    logInflu(supabase, actor, {
      action: prospect ? "update" : "create",
      entity: "prospect",
      entityId: data.id,
      influencerName: fields.name,
      summary: `${prospect ? "แก้ข้อมูล" : "เพิ่มรายชื่อ"} Hunting: ${fields.name}`,
      meta: { prospect_id: data.id },
    });

    setSaving(false);
    onSaved?.(data as InfluProspectRow);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={prospect ? "แก้ข้อมูลรายชื่อ" : "เพิ่มรายชื่อเข้าบอร์ด Hunting"}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pr-name">ชื่อ / ชื่อช่อง *</Label>
            <Input
              id="pr-name"
              required
              disabled={saving}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น มีมี่รีวิวสวย"
            />
          </div>
          <div>
            <Label htmlFor="pr-nick">ชื่อเล่น</Label>
            <Input
              id="pr-nick"
              disabled={saving}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="เช่น มีมี่"
            />
          </div>
          <div>
            <Label htmlFor="pr-phone">เบอร์โทร (ถ้ามี)</Label>
            <Input
              id="pr-phone"
              disabled={saving}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </div>
          <div>
            <Label htmlFor="pr-occ">อาชีพ / แนวคอนเทนต์</Label>
            <Input
              id="pr-occ"
              disabled={saving}
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="เช่น สายบิวตี้ / รีวิวศัลยกรรม"
            />
          </div>
          <div>
            <Label htmlFor="pr-followers">ยอดผู้ติดตามรวม</Label>
            <Input
              id="pr-followers"
              disabled={saving}
              inputMode="numeric"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="เช่น 150000"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <Label>ความน่าสนใจ</Label>
            <RatingStars value={rating} onChange={saving ? undefined : setRating} />
          </div>
          <div>
            <Label htmlFor="pr-next">นัดตามครั้งถัดไป</Label>
            <Input
              id="pr-next"
              type="date"
              disabled={saving}
              value={nextOn}
              onChange={(e) => setNextOn(e.target.value)}
            />
          </div>
        </div>

        {/* ช่องทางโซเชียล — จดลิงก์/handle ไว้เปิดดูผลงานตอนประเมิน */}
        <div>
          <Label>ช่องทางโซเชียล</Label>
          <datalist id={datalistId}>
            {INFLU_CHANNEL_PLATFORMS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white/70 p-2"
              >
                <Link2 size={14} className="shrink-0 text-stone-300" />
                <input
                  type="text"
                  list={datalistId}
                  disabled={saving}
                  value={r.platform}
                  onChange={(e) => setRow(idx, { platform: e.target.value })}
                  placeholder="แพลตฟอร์ม"
                  className="w-28 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:w-32 sm:text-sm"
                />
                <input
                  type="text"
                  disabled={saving}
                  value={r.value}
                  onChange={(e) => setRow(idx, { value: e.target.value })}
                  placeholder="ลิงก์ / @handle"
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-base text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={saving}
                  value={r.followers}
                  onChange={(e) => setRow(idx, { followers: e.target.value })}
                  placeholder="ผู้ติดตาม"
                  className="w-24 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-base tabular-nums text-stone-800 focus:border-brand-400 focus:outline-none sm:text-sm"
                />
                <button
                  type="button"
                  disabled={saving}
                  aria-label="ลบช่องทางนี้"
                  onClick={() =>
                    setRows((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90 sm:h-8 sm:w-8"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => setRows((prev) => [...prev, { ...EMPTY_CHANNEL }])}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 active:scale-[0.97] max-sm:min-h-11"
          >
            <Plus size={14} />
            เพิ่มช่องทาง
          </button>
        </div>

        <div>
          <Label htmlFor="pr-interested">หัตถการที่น่าจะเสนอ / เขาสนใจ</Label>
          <Textarea
            id="pr-interested"
            rows={2}
            disabled={saving}
            value={interested}
            onChange={(e) => setInterested(e.target.value)}
            placeholder="เช่น Botox / Filler ปาก — ยัง confirm ไม่ได้จนกว่าจะตอบรับ"
          />
        </div>
        <div>
          <Label htmlFor="pr-note">โน้ต</Label>
          <Textarea
            id="pr-note"
            rows={2}
            disabled={saving}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เงื่อนไขที่คุยไว้ / ข้อสังเกต..."
          />
        </div>

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
            onClick={onClose}
          >
            ยกเลิก
          </Button>
          <Button type="submit" loading={saving} disabled={!name.trim()}>
            {prospect ? "บันทึก" : "เพิ่มเข้าบอร์ด"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
