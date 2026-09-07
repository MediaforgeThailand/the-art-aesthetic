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

import { Hash, ImagePlus, Link2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import {
  hashtagSafe,
  INFLU_CHANNEL_PLATFORMS,
  tierFromFollowers,
} from "@/influ/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/influ/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import { tooLargeSummary } from "@/lib/upload";
import { prepareUploadFiles } from "@/lib/upload-prepare";
import { useSignedUrl } from "@/lib/use-signed-url";
import type {
  InfluProfileChannelRow,
  InfluProfilePhotoRow,
  InfluProfileRow,
} from "@/lib/types";

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

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** รูปที่อัพจากฟอร์มนี้อยู่โฟลเดอร์ของโปรไฟล์เอง — แถว backfill (0082) ชี้ไฟล์ใน
    โฟลเดอร์เคสเดิม (influencers/{caseId}/) ห้ามลบไฟล์ตามตอนลบแถว เพราะไฟล์เป็น
    ของเคสนั้น — เช็คด้วย prefix นี้ก่อน storage.remove เสมอ */
const ownedPhotoPrefix = (profileId: string) => `influ-profiles/${profileId}/`;

/** ไฟล์รูปใหม่ที่เลือกค้างไว้ในฟอร์ม — อัพโหลดจริงตอนกดบันทึก */
type PendingPhoto = { file: File; preview: string };

/* path ปลายทางของไฟล์รูป — timestamp กันชื่อชน; อยู่ระดับโมดูลเพราะกฎ
   react-hooks/purity ไม่ให้เรียก Date.now() ตรงๆ ในตัว component */
function newProfilePhotoPath(profileId: string, idx: number, name: string) {
  return `${ownedPhotoPrefix(profileId)}${Date.now()}_${idx}_${sanitizeFileName(name)}`;
}
function newCasePhotoPath(caseId: string, coverPath: string) {
  const base = sanitizeFileName(coverPath.split("/").pop() ?? "photo.jpg");
  return `influencers/${caseId}/${Date.now()}_${base}`;
}

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
  /* รหัส Influ / แฮชแท็กบังคับ — ผู้สร้างพิมพ์เองได้แล้ว (ผู้ใช้ 2026-09-07 ตามทิศทาง
     "#ต้าเฟ็ดเฟ่" 2026-09-03) เว้นว่าง = trigger 0108 ออก INF-xxxxx ให้เหมือนเดิม
     ยังบังคับไม่ซ้ำทั้งฐาน (unique 0108) เพราะรหัสนี้คือกุญแจ track ยอดจาก Meta */
  const [influCode, setInfluCode] = useState(profile?.influ_code ?? "");
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

  // รูปภาพ (0082): แถวที่มีอยู่ (โหมดแก้ไข — โหลดหลัง mount) + ไฟล์ใหม่ที่เลือกค้างไว้
  // ทุกการเปลี่ยนแปลง (ลบ/เพิ่ม) มีผลจริงตอนกดบันทึก — แนวเดียวกับช่องทางติดต่อ
  const [photos, setPhotos] = useState<InfluProfilePhotoRow[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    void supabase
      .from("influ_profile_photos")
      .select("*")
      .eq("profile_id", profile.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (alive && data) setPhotos(data as InfluProfilePhotoRow[]);
      });
    return () => {
      alive = false;
    };
  }, [profile, supabase]);

  const visiblePhotos = photos.filter((p) => !removedPhotoIds.has(p.id));

  const addPhotoFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setPendingPhotos((prev) => [
      ...prev,
      ...files.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
  };

  const setRow = (idx: number, patch: Partial<ChannelDraft>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !firstName.trim()) return;
    setSaving(true);
    setErr(null);
    // เตรียมรูปใหม่ก่อนแตะ DB — ย่อรูปก่อนแล้วค่อยเช็คเพดานไฟล์ (ลำดับตามกติกา upload-prepare)
    let uploadFiles: File[] = [];
    if (pendingPhotos.length > 0) {
      uploadFiles = await prepareUploadFiles(pendingPhotos.map((p) => p.file));
      const tooBig = tooLargeSummary(uploadFiles);
      if (tooBig) {
        setSaving(false);
        setErr(tooBig);
        return;
      }
    }
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
    // ว่าง = ส่ง "" ให้ trigger 0108 ออก INF-xxxxx ให้ (คอลัมน์ NOT NULL ส่ง null ไม่ได้)
    // — ตอนแก้โปรไฟล์ เคลียร์ช่อง = คงรหัสเดิมไว้ ไม่ออกใหม่
    const codeField = influCode.trim()
      ? { influ_code: influCode.trim() }
      : profile
        ? {}
        : { influ_code: "" };
    /** 23505 บน influ_profiles_code_key = รหัส/แฮชแท็กชนกับโปรไฟล์อื่น */
    const codeError = (msg: string | undefined, code: string | undefined) =>
      code === "23505"
        ? "รหัส Influ นี้ถูกใช้กับโปรไฟล์อื่นแล้ว — เปลี่ยนหรือเติมคำต่อท้ายให้ไม่ซ้ำ"
        : `บันทึกไม่สำเร็จ: ${msg ?? "ไม่ทราบสาเหตุ"}`;

    let saved: InfluProfileRow | null = null;
    if (profile) {
      const { data, error } = await supabase
        .from("influ_profiles")
        .update({ ...fields, ...codeField })
        .eq("id", profile.id)
        .select("*")
        .single();
      if (error || !data) {
        setSaving(false);
        setErr(codeError(error?.message, error?.code));
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
        .insert({ ...fields, ...codeField, created_by: actor.id })
        .select("*")
        .single();
      if (error || !data) {
        setSaving(false);
        setErr(codeError(error?.message, error?.code));
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

    // ---- รูปภาพ (0082): ลบที่ติ๊กไว้ → อัพไฟล์ใหม่ → sync รูปหน้าปก ----
    const removedRows = photos.filter((p) => removedPhotoIds.has(p.id));
    if (removedRows.length > 0) {
      await supabase
        .from("influ_profile_photos")
        .delete()
        .in(
          "id",
          removedRows.map((r) => r.id)
        );
      // ลบไฟล์เฉพาะที่อยู่โฟลเดอร์ของโปรไฟล์เอง — แถว backfill ชี้ไฟล์ของเคส ห้ามลบตาม
      const owned = removedRows
        .map((r) => r.file_path)
        .filter((path) => path.startsWith(ownedPhotoPrefix(saved.id)));
      if (owned.length > 0) {
        try {
          await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove(owned);
        } catch {
          // best effort — ไฟล์ค้างดีกว่าฟอร์มพัง
        }
      }
    }
    const maxPos = Math.max(0, ...visiblePhotos.map((p) => p.position));
    const uploadedPaths: { path: string; name: string }[] = [];
    for (const f of uploadFiles) {
      const path = newProfilePhotoPath(saved.id, uploadedPaths.length, f.name);
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .upload(path, f);
      if (!upErr) uploadedPaths.push({ path, name: f.name });
    }
    if (uploadedPaths.length > 0) {
      await supabase.from("influ_profile_photos").insert(
        uploadedPaths.map((u, i) => ({
          profile_id: saved.id,
          file_path: u.path,
          file_name: u.name,
          position: maxPos + i + 1,
          created_by: actor.id,
        }))
      );
    }
    // รูปแรก = รูปหน้าปก — sync ลง photo_path เสมอ (consumer เดิมอ่านช่องนี้ทั้งหมด:
    // การ์ดบอร์ด + copy รูปเข้าโฟลเดอร์เคสใหม่ตอน "สร้างนัด")
    const coverPath =
      visiblePhotos[0]?.file_path ?? uploadedPaths[0]?.path ?? null;
    if (coverPath !== saved.photo_path) {
      await supabase
        .from("influ_profiles")
        .update({ photo_path: coverPath })
        .eq("id", saved.id);
    }
    // ก้อนที่ส่งกลับ parent ต้องมี photo_path ล่าสุด (NewCaseModal ใช้ copy รูปเข้าเคสใหม่)
    // — reassign ตัว `saved` ตรงๆ ไม่ได้ เพราะ TS จะเลิก narrow null ใน closure ข้างบน
    const savedResult: InfluProfileRow = { ...saved, photo_path: coverPath };
    // เคสของคนนี้ที่ยังไม่มีรูป → copy รูปหน้าปกเข้าโฟลเดอร์เคส (best effort)
    // การ์ดบอร์ดโชว์รูปของเคส และห้ามชี้ path ข้ามเคส (กติกา 0073 — ลบเคส = ลบโฟลเดอร์)
    // เคสที่มีรูปของตัวเองแล้วไม่ถูกแตะ
    if (coverPath) {
      const { data: bareCases } = await supabase
        .from("influencers")
        .select("id")
        .eq("person_id", saved.id)
        .is("photo_path", null);
      for (const c of bareCases ?? []) {
        const dest = newCasePhotoPath(c.id, coverPath);
        const { error: cpErr } = await supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .copy(coverPath, dest);
        if (!cpErr) {
          await supabase
            .from("influencers")
            .update({ photo_path: dest })
            .eq("id", c.id);
        }
      }
    }

    logInflu(supabase, actor, {
      action: profile ? "update" : "create",
      entity: "profile",
      entityId: savedResult.id,
      influencerName: profileName(savedResult),
      summary: `${profile ? "แก้ไข" : "สร้าง"}โปรไฟล์ ${profileName(savedResult)}${
        cleanRows.length > 0
          ? ` — ช่องทางติดต่อ ${cleanRows.length} ช่องทาง`
          : ""
      }${uploadedPaths.length > 0 ? ` — รูปใหม่ ${uploadedPaths.length} รูป` : ""}`,
      meta: {
        profile_id: savedResult.id,
        channels: cleanRows.length,
        photos_added: uploadedPaths.length,
        photos_removed: removedRows.length,
      },
    });

    setSaving(false);
    onSaved?.(savedResult, savedChannels);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={profile ? "แก้ไขโปรไฟล์ Influencer" : "เพิ่มโปรไฟล์ Influencer"}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        {/* รหัส Influ = แฮชแท็กบังคับที่ track ยอดจาก Meta — ผู้สร้างพิมพ์เองได้
            (2026-09-07) เปลี่ยนที่นี่ = เคสทุกรอบเปลี่ยนตาม (trigger fanout 0108) */}
        <div>
          <Label htmlFor="pf-code">รหัส Influ / แฮชแท็ก</Label>
          <div className="flex items-center gap-2">
            <Hash size={15} className="shrink-0 text-brand-500" />
            <Input
              id="pf-code"
              value={influCode}
              onChange={(e) => setInfluCode(e.target.value)}
              placeholder="เว้นว่าง = ระบบออกรหัส INF-xxxxx ให้"
              className="font-mono"
            />
          </div>
          {influCode.trim() !== "" && (
            <p className="mt-1 font-mono text-xs font-semibold text-brand-600">
              #{hashtagSafe(influCode)}
            </p>
          )}
        </div>
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
          </div>
        </div>

        {/* รูปภาพ — หลายรูปต่อคน (0082) รูปแรก = รูปหน้าปกที่ใช้โชว์ทุกที่ */}
        <div>
          <Label>
            รูปภาพ{" "}
            <span className="font-normal text-stone-400">
              (รูปแรก = รูปหน้าปกบนการ์ด)
            </span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {visiblePhotos.map((p, idx) => (
              <ExistingPhotoTile
                key={p.id}
                photo={p}
                cover={idx === 0}
                disabled={saving}
                onRemove={() =>
                  setRemovedPhotoIds((prev) => new Set(prev).add(p.id))
                }
              />
            ))}
            {pendingPhotos.map((p, idx) => (
              <PhotoTile
                key={p.preview}
                src={p.preview}
                cover={visiblePhotos.length === 0 && idx === 0}
                pending
                disabled={saving}
                onRemove={() => {
                  URL.revokeObjectURL(p.preview);
                  setPendingPhotos((prev) =>
                    prev.filter((x) => x.preview !== p.preview)
                  );
                }}
              />
            ))}
            <label
              className={`flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-300 text-brand-600 transition-colors ${
                saving
                  ? "opacity-50"
                  : "cursor-pointer hover:bg-brand-50 active:scale-[0.97]"
              }`}
            >
              <ImagePlus size={20} />
              <span className="text-xs font-medium">เพิ่มรูป</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={saving}
                className="hidden"
                onChange={(e) => {
                  addPhotoFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {pendingPhotos.length > 0 && (
            <p className="mt-1.5 text-xs text-stone-400">
              รูปใหม่ {pendingPhotos.length} รูป จะถูกอัพโหลดตอนกดบันทึก
            </p>
          )}
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
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 active:scale-[0.97] max-sm:min-h-11"
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

/* ---------- ชิ้นรูปในแกลเลอรีของฟอร์ม ---------- */

/** รูปที่บันทึกแล้ว — แปลง path → signed URL (มี cache ใน useSignedUrl) */
function ExistingPhotoTile({
  photo,
  cover,
  disabled,
  onRemove,
}: {
  photo: InfluProfilePhotoRow;
  cover: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { url } = useSignedUrl(photo.file_path);
  return (
    <PhotoTile src={url} cover={cover} disabled={disabled} onRemove={onRemove} />
  );
}

function PhotoTile({
  src,
  cover,
  pending = false,
  disabled,
  onRemove,
}: {
  src: string | null;
  cover: boolean;
  /** ไฟล์ใหม่ที่ยังไม่อัพโหลด — ติดขอบประให้รู้ว่ายังไม่ถูกบันทึก */
  pending?: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="relative">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL ชั่วคราว ใช้ next/image ไม่ได้
        <img
          src={src}
          alt=""
          className={`h-24 w-24 rounded-xl object-cover ring-1 ${
            pending ? "ring-2 ring-dashed ring-brand-300" : "ring-stone-200"
          }`}
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-stone-100 text-stone-300">
          <ImagePlus size={20} />
        </div>
      )}
      {cover && (
        <span className="absolute bottom-1 left-1 rounded-full bg-brand-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
          หน้าปก
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label="ลบรูปนี้"
        onClick={onRemove}
        className="absolute -right-2 -top-2 flex h-11 w-11 cursor-pointer items-center justify-center sm:h-auto sm:w-auto"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-stone-500 shadow ring-1 ring-stone-200 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:h-6 sm:w-6">
          <X size={13} />
        </span>
      </button>
    </div>
  );
}
