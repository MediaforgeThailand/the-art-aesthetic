"use client";

/**
 * โมดัล "โปรไฟล์ Influencer" (ตัวบุคคล — influ_profiles, migration 0080)
 *
 * ขั้นแรกของ flow ใหม่: ต้องมีโปรไฟล์ก่อนถึงจะ "สร้างนัด" (เคส) ได้ —
 * โปรไฟล์ = ตกลงร่วมงานกันแล้ว แต่ยังไม่ confirm หัตถการ/วันนัด
 * เก็บข้อมูลตัวบุคคล + ช่องทางติดต่อทุกช่องทาง (influ_profile_channels)
 *
 * ใช้ทั้งโหมดสร้างใหม่ (profile=null) และแก้ไข (ส่ง profile+channels มา) —
 * โหมดแก้ไข: ช่องทางติดต่อเขียนทับทั้งชุด (ลบหมดแล้ว insert ใหม่ แบบเดียวกับ
 * รายการ "ได้อะไรบ้าง" ใน promo-packages-admin) และ sync ข้อมูลตัวบุคคล
 * กลับไปที่เคสทุกรอบของคนนี้ (person_id) ให้บอร์ด/การ์ดแสดงตรงกัน
 */

import { Link2, Plus, Trash2, UsersRound } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import {
  INFLU_CHANNEL_PLATFORMS,
  tierFromFollowers,
} from "@/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type { InfluProfileChannelRow, InfluProfileRow } from "@/lib/types";

/** ชื่อเต็มของโปรไฟล์ (ไว้ใช้ในลิสต์เลือก/บันทึก log) */
export function profileName(p: {
  first_name: string;
  last_name: string | null;
  nickname: string | null;
}): string {
  const name = [p.first_name, p.last_name ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return p.nickname?.trim() ? `${name} (${p.nickname.trim()})` : name;
}

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

type ProfileFormProps = {
  open: boolean;
  onClose: () => void;
  /** null = สร้างโปรไฟล์ใหม่ */
  profile?: InfluProfileRow | null;
  channels?: InfluProfileChannelRow[];
  actor: InfluLogActor;
  /** เรียกหลังบันทึกสำเร็จ — parent เอาไปอัปเดตลิสต์/เลือกต่อใน NewCaseModal */
  onSaved?: (
    profile: InfluProfileRow,
    channels: InfluProfileChannelRow[]
  ) => void;
};

export function ProfileFormModal(props: ProfileFormProps) {
  // seed ฟอร์มด้วย remount ทุกครั้งที่เปิด/เปลี่ยนโปรไฟล์ (กติกา key-remount เดียวกับ
  // แผงข้างปฏิทิน — ไม่ sync ด้วย effect เพราะชนกฎ react-hooks/set-state-in-effect)
  return (
    <ProfileFormInner
      key={`${props.open ? "open" : "closed"}:${props.profile?.id ?? "new"}`}
      {...props}
    />
  );
}

function ProfileFormInner({
  open,
  onClose,
  profile = null,
  channels = [],
  actor,
  onSaved,
}: ProfileFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const datalistId = useId();
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [occupation, setOccupation] = useState(profile?.occupation ?? "");
  const [followers, setFollowers] = useState(
    profile?.followers != null ? String(profile.followers) : ""
  );
  const [note, setNote] = useState(profile?.note ?? "");
  const [rows, setRows] = useState<ChannelDraft[]>(() =>
    channels.length > 0
      ? channels.map((c) => ({
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
    if (saving || !firstName.trim()) return;
    setSaving(true);
    setErr(null);
    const followerCount = parseFollowers(followers);
    const fields = {
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      nickname: nickname.trim() || null,
      phone: phone.trim() || null,
      occupation: occupation.trim() || null,
      followers: followerCount,
      // Tier auto จากยอดผู้ติดตาม — กติกาเดียวกับเคส (ยังไม่กรอก = ยังไม่จัด tier)
      tier: followerCount != null ? tierFromFollowers(followerCount) : null,
      note: note.trim() || null,
    };

    let saved: InfluProfileRow | null = null;
    if (profile) {
      const { data, error } = await supabase
        .from("influ_profiles")
        .update(fields)
        .eq("id", profile.id)
        .select("*")
        .single();
      if (error || !data) {
        setSaving(false);
        setErr(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
        return;
      }
      saved = data;
      // ข้อมูลตัวบุคคลบนเคสทุกรอบต้องตามโปรไฟล์ (กติกาเดียวกับ NameEditModal ที่แก้ตาม person_id)
      await supabase
        .from("influencers")
        .update({
          first_name: fields.first_name,
          last_name: fields.last_name,
          nickname: fields.nickname,
          phone: fields.phone,
          occupation: fields.occupation,
          followers: fields.followers,
          tier: fields.tier,
        })
        .eq("person_id", profile.id);
    } else {
      const { data, error } = await supabase
        .from("influ_profiles")
        .insert({ ...fields, created_by: actor.id })
        .select("*")
        .single();
      if (error || !data) {
        setSaving(false);
        setErr(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
        return;
      }
      saved = data;
    }

    // ช่องทางติดต่อ — เขียนทับทั้งชุด (แถวไม่กี่แถว ง่ายกว่า diff และผลลัพธ์ตรงกับที่เห็นในฟอร์มเสมอ)
    const cleanRows = rows
      .map((r) => ({
        platform: r.platform.trim() || "อื่นๆ",
        value: r.value.trim(),
        followers: parseFollowers(r.followers),
      }))
      .filter((r) => r.value !== "");
    let savedChannels: InfluProfileChannelRow[] = [];
    const { error: delError } = await supabase
      .from("influ_profile_channels")
      .delete()
      .eq("profile_id", saved.id);
    if (!delError && cleanRows.length > 0) {
      const { data: inserted } = await supabase
        .from("influ_profile_channels")
        .insert(
          cleanRows.map((r, idx) => ({
            profile_id: saved.id,
            platform: r.platform,
            value: r.value,
            followers: r.followers,
            position: idx + 1,
          }))
        )
        .select("*");
      savedChannels = inserted ?? [];
    }

    logInflu(supabase, actor, {
      action: profile ? "update" : "create",
      entity: "profile",
      entityId: saved.id,
      influencerName: profileName(saved),
      summary: `${profile ? "แก้ไข" : "สร้าง"}โปรไฟล์ ${profileName(saved)}${
        cleanRows.length > 0
          ? ` — ช่องทางติดต่อ ${cleanRows.length} ช่องทาง`
          : ""
      }`,
      meta: { profile_id: saved.id, channels: cleanRows.length },
    });

    setSaving(false);
    onSaved?.(saved, savedChannels);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={profile ? "แก้ไขโปรไฟล์ Influencer" : "เพิ่มโปรไฟล์ Influencer"}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs leading-5 text-brand-700">
          <UsersRound size={14} className="mt-0.5 shrink-0" />
          <span>
            โปรไฟล์ = ตกลงร่วมงานกันแล้ว แต่ยังไม่ยืนยันหัตถการ/วันนัด —
            พอจะนัดจริงค่อยกด{" "}
            <span className="font-semibold">สร้างนัดใหม่</span>{" "}
            บนบอร์ดแล้วเลือกโปรไฟล์คนนี้
          </span>
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pf-first">ชื่อ *</Label>
            <Input
              id="pf-first"
              required
              disabled={saving}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="เช่น ภานุเดช"
            />
          </div>
          <div>
            <Label htmlFor="pf-last">นามสกุล</Label>
            <Input
              id="pf-last"
              disabled={saving}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="เช่น อินทร์ศรี"
            />
          </div>
          <div>
            <Label htmlFor="pf-nick">ชื่อเล่น / ชื่อช่อง</Label>
            <Input
              id="pf-nick"
              disabled={saving}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="เช่น มีมี่"
            />
          </div>
          <div>
            <Label htmlFor="pf-phone">เบอร์โทรติดต่อ</Label>
            <Input
              id="pf-phone"
              disabled={saving}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </div>
          <div>
            <Label htmlFor="pf-occ">อาชีพ</Label>
            <Input
              id="pf-occ"
              disabled={saving}
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="เช่น นักแสดง / เจ้าของเพจ"
            />
          </div>
          <div>
            <Label htmlFor="pf-followers">ยอดผู้ติดตามรวม</Label>
            <Input
              id="pf-followers"
              disabled={saving}
              inputMode="numeric"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="เช่น 150000"
            />
            <p className="mt-1 text-xs text-stone-400">
              Tier จัดให้อัตโนมัติจากยอดผู้ติดตาม
            </p>
          </div>
        </div>

        {/* ช่องทางติดต่อทั้งหมด — หลายช่องต่อคน (IG/TikTok/Line/เบอร์สำรอง ...) */}
        <div>
          <Label>ช่องทางการติดต่อ</Label>
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
                  placeholder="ลิงก์ / @handle / ไอดี"
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
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 active:scale-[0.97]"
          >
            <Plus size={14} />
            เพิ่มช่องทาง
          </button>
        </div>

        <div>
          <Label htmlFor="pf-note">โน้ต</Label>
          <Textarea
            id="pf-note"
            rows={2}
            disabled={saving}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ข้อตกลง/เงื่อนไขคร่าวๆ ที่คุยกันไว้..."
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
          <Button type="submit" loading={saving} disabled={!firstName.trim()}>
            {profile ? "บันทึกโปรไฟล์" : "สร้างโปรไฟล์"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
