"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSignedUrl } from "@/lib/use-signed-url";
import { Button, Input, Label, Modal, Select } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

/** ตำแหน่งงานที่เลือกได้ในโปรไฟล์ */
const JOB_TITLES = ["Graphic/Editor", "Content", "Marketer"] as const;

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * ตั้งค่าโปรไฟล์ของฉัน — เปลี่ยนชื่อที่แสดง + อัพ/ลบรูปโปรไฟล์
 * รูปเก็บใน bucket documents path avatars/{uid}/ แล้ววงกลม avatar ทุกจุดแสดงรูปนี้
 */
export function ProfileSettingsModal({
  open,
  onClose,
  userId,
  email,
  initialName,
  initialAvatarPath,
  initialJobTitle,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  email: string;
  initialName: string;
  initialAvatarPath: string | null;
  initialJobTitle: string | null;
  /** แจ้งค่าที่บันทึกแล้วกลับให้ผู้เรียก (อัพเดต state ฝั่ง sidebar ทันที) */
  onSaved: (
    name: string,
    avatarPath: string | null,
    jobTitle: string | null
  ) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState(initialName);
  const [jobTitle, setJobTitle] = useState(initialJobTitle ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // เปิด modal ใหม่ทุกครั้ง — รีเซ็ต draft จากค่าจริงปัจจุบัน
  // ปรับ state ระหว่าง render แทน effect (กฎ react-hooks/set-state-in-effect) และผูกกับ
  // "จังหวะที่เปิด" อย่างเดียว — ค่า prop ที่เปลี่ยนระหว่างเปิดอยู่ต้องไม่ทับสิ่งที่กำลังพิมพ์
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setName(initialName);
      setJobTitle(initialJobTitle ?? "");
      setAvatarFile(null);
      setRemoveAvatar(false);
      setError(null);
    }
  }

  // preview: ไฟล์ที่เพิ่งเลือก (object URL) > รูปเดิมใน storage (signed URL)
  const localPreview = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile]
  );
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);
  const { url: currentUrl } = useSignedUrl(
    removeAvatar ? null : initialAvatarPath
  );
  const previewUrl = localPreview ?? currentUrl;

  const pickFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("เลือกได้เฉพาะไฟล์รูปภาพ");
      return;
    }
    if (f.size > MAX_AVATAR_BYTES) {
      setError("รูปต้องมีขนาดไม่เกิน 5MB");
      return;
    }
    setError(null);
    setRemoveAvatar(false);
    setAvatarFile(f);
  };

  const save = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("กรอกชื่อที่ต้องการแสดง");
      return;
    }
    setSaving(true);
    setError(null);

    // 1) อัพรูปใหม่ (ถ้าเลือกไว้) — path ใหม่ต่อครั้ง (timestamp) กัน cache ค้าง
    let nextAvatarPath: string | null = removeAvatar ? null : initialAvatarPath;
    if (avatarFile) {
      const path = `avatars/${userId}/${Date.now()}_${sanitizeFileName(avatarFile.name)}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .upload(path, avatarFile);
      if (upErr) {
        setSaving(false);
        setError(`อัพโหลดรูปไม่สำเร็จ: ${upErr.message}`);
        return;
      }
      nextAvatarPath = path;
    }

    // 2) บันทึกลง profiles (RLS: แก้แถวตัวเองได้)
    const nextJobTitle = jobTitle.trim() === "" ? null : jobTitle.trim();
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({
        full_name: trimmed,
        avatar_path: nextAvatarPath,
        job_title: nextJobTitle,
      })
      .eq("id", userId);
    if (dbErr) {
      // เก็บกวาดรูปที่เพิ่งอัพ (best effort) — แถว DB ยังชี้รูปเดิม
      if (avatarFile && nextAvatarPath) {
        try {
          await supabase.storage
            .from(STORAGE_BUCKET_DOCUMENTS)
            .remove([nextAvatarPath]);
        } catch {
          // เพิกเฉย
        }
      }
      setSaving(false);
      setError(`บันทึกไม่สำเร็จ: ${dbErr.message}`);
      return;
    }

    // 3) sync ชื่อเข้า auth metadata — layout อ่านชื่อจาก JWT claims (best effort)
    try {
      await supabase.auth.updateUser({ data: { full_name: trimmed } });
    } catch {
      // เพิกเฉย — ชื่อใน profiles ถูกต้องแล้ว claims จะตามทีหลัง
    }

    // 4) ลบรูปเก่าที่ไม่ใช้แล้ว (best effort)
    const replacedOld =
      initialAvatarPath && initialAvatarPath !== nextAvatarPath;
    if (replacedOld) {
      try {
        await supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([initialAvatarPath]);
      } catch {
        // เพิกเฉย
      }
    }

    setSaving(false);
    onSaved(trimmed, nextAvatarPath, nextJobTitle);
    onClose();
    router.refresh(); // ให้หน้า server (เช่น /tasks) ส่ง avatar ใหม่ลงมา
  };

  return (
    <Modal open={open} onClose={onClose} title="ตั้งค่าโปรไฟล์">
      <div className="space-y-5">
        {/* รูปโปรไฟล์ — คลิกที่รูปเพื่อเปลี่ยน */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="เปลี่ยนรูปโปรไฟล์"
            aria-label="เปลี่ยนรูปโปรไฟล์"
            className="group relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full shadow-sm transition-transform active:scale-95"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="รูปโปรไฟล์"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-b from-brand-400 to-brand-600 text-2xl font-semibold text-cream">
                {(name.trim() || email || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 reveal-on-hover opacity-0 transition-opacity group-hover:opacity-100">
              <Camera size={20} className="text-white" />
            </span>
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="!px-3 !py-1.5 !text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={14} />
                เลือกรูป
              </Button>
              {(previewUrl || avatarFile) && (
                <Button
                  type="button"
                  variant="danger"
                  className="!px-3 !py-1.5 !text-xs"
                  onClick={() => {
                    setAvatarFile(null);
                    setRemoveAvatar(true);
                  }}
                >
                  <Trash2 size={14} />
                  ลบรูป
                </Button>
              )}
            </div>
            <p className="text-xs text-stone-400">รูปไม่เกิน 5MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = "";
            }}
          />
        </div>

        <div>
          <Label htmlFor="profile-name">ชื่อที่แสดง</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
          <p className="mt-1 text-xs text-stone-400">{email}</p>
        </div>

        <div>
          <Label htmlFor="profile-job">ตำแหน่ง</Label>
          <Select
            id="profile-job"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          >
            <option value="">ไม่ระบุ</option>
            {JOB_TITLES.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </Select>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 animate-fade-in">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            บันทึก
          </Button>
        </div>
      </div>
    </Modal>
  );
}
