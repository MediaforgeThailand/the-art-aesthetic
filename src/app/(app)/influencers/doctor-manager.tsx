"use client";

import { Camera, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button, ConfirmDialog, Input, Modal } from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { DoctorRow } from "@/lib/types";
import { DoctorAvatar } from "./doctor-select";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/**
 * โมดัล "จัดการหมอ" — ทะเบียนแพทย์สำหรับตัวเลือก "แพทย์ที่รับเคส"
 * เพิ่ม/เปลี่ยนชื่อ/ใส่รูป/ซ่อนจากตัวเลือก/ลบ — ข้อมูลจริงมาจาก server props (doctors)
 * ทุก mutation จบด้วย router.refresh() ให้ทุกจุดที่ใช้ทะเบียนอัพเดทตาม
 *
 * เปลี่ยนชื่อ = ระบบตามแก้ doctor_name ในเคส (influencers) และคิว (influ_calendar_events)
 * ที่สะกดตรงกับชื่อเดิมให้ทั้งหมด; เปลี่ยนเป็นชื่อที่มีอยู่แล้วในทะเบียน = รวมเป็นคนเดียวกัน
 * (ย้ายเคสทั้งหมดไปชื่อนั้นแล้วลบชื่อเดิมทิ้ง — ไว้เก็บกวาดชื่อสะกดเพี้ยนจากข้อมูลเก่า)
 */
export function DoctorManagerModal({
  open,
  onClose,
  doctors,
}: {
  open: boolean;
  onClose: () => void;
  doctors: DoctorRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DoctorRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<DoctorRow | null>(null);

  const sorted = [...doctors].sort((a, b) => a.name.localeCompare(b.name, "th"));

  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.refresh();
  };

  const friendly = (message: string) =>
    message.includes("doctors_name_key")
      ? "มีชื่อนี้ในทะเบียนอยู่แล้ว"
      : message;

  const addDoctor = () =>
    run(async () => {
      const name = newName.trim();
      if (name === "") return "กรอกชื่อหมอก่อน";
      const { error: e } = await supabase.from("doctors").insert({ name });
      if (e) return `เพิ่มไม่สำเร็จ: ${friendly(e.message)}`;
      setNewName("");
      return null;
    });

  /** เปลี่ยนชื่อ + ตามแก้เคส/คิวที่ชื่อตรงกัน; ชนกับชื่อที่มีอยู่ = merge เข้าชื่อนั้น */
  const renameDoctor = (doctor: DoctorRow) =>
    run(async () => {
      const name = editName.trim();
      if (name === "") return "ชื่อว่างไม่ได้";
      if (name === doctor.name) {
        setEditingId(null);
        return null;
      }
      const target = doctors.find((d) => d.name === name && d.id !== doctor.id);
      // ตามแก้ข้อมูลที่อ้างชื่อเดิมก่อน — ถ้าพลาดกลางทางทะเบียนยังชี้ชื่อเดิมอยู่ กดซ้ำได้
      const { error: e1 } = await supabase
        .from("influencers")
        .update({ doctor_name: name })
        .eq("doctor_name", doctor.name);
      if (e1) return `แก้ชื่อในเคสไม่สำเร็จ: ${e1.message}`;
      const { error: e2 } = await supabase
        .from("influ_calendar_events")
        .update({ doctor_name: name })
        .eq("doctor_name", doctor.name);
      if (e2) return `แก้ชื่อในคิวไม่สำเร็จ: ${e2.message}`;
      if (target) {
        // merge: เคสย้ายไปชื่อปลายทางแล้ว — ลบชื่อเดิม (รูปของชื่อเดิมลบทิ้ง best effort)
        const { error: e3 } = await supabase
          .from("doctors")
          .delete()
          .eq("id", doctor.id);
        if (e3) return `รวมชื่อไม่สำเร็จ: ${e3.message}`;
        if (doctor.photo_path) {
          void supabase.storage
            .from(STORAGE_BUCKET_DOCUMENTS)
            .remove([doctor.photo_path])
            .then(() => undefined, () => undefined);
        }
      } else {
        const { error: e3 } = await supabase
          .from("doctors")
          .update({ name })
          .eq("id", doctor.id);
        if (e3) return `เปลี่ยนชื่อไม่สำเร็จ: ${friendly(e3.message)}`;
      }
      setEditingId(null);
      return null;
    });

  const toggleActive = (doctor: DoctorRow) =>
    run(async () => {
      const { error: e } = await supabase
        .from("doctors")
        .update({ active: !doctor.active })
        .eq("id", doctor.id);
      return e ? `บันทึกไม่สำเร็จ: ${e.message}` : null;
    });

  const deleteDoctor = (doctor: DoctorRow) =>
    run(async () => {
      const { error: e } = await supabase
        .from("doctors")
        .delete()
        .eq("id", doctor.id);
      if (e) return `ลบไม่สำเร็จ: ${e.message}`;
      if (doctor.photo_path) {
        void supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([doctor.photo_path])
          .then(() => undefined, () => undefined);
      }
      return null;
    });

  const pickPhoto = (doctor: DoctorRow) => {
    photoTargetRef.current = doctor;
    photoInputRef.current?.click();
  };

  const uploadPhoto = (file: File) =>
    run(async () => {
      const doctor = photoTargetRef.current;
      if (!doctor) return null;
      const path = `doctors/${doctor.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .upload(path, file);
      if (upErr) return `อัพโหลดรูปไม่สำเร็จ: ${upErr.message}`;
      const { error: linkErr } = await supabase
        .from("doctors")
        .update({ photo_path: path })
        .eq("id", doctor.id);
      if (linkErr) {
        // ผูกกับ DB ไม่สำเร็จ — เก็บกวาดไฟล์ที่เพิ่งอัพ (best effort)
        void supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([path])
          .then(() => undefined, () => undefined);
        return `บันทึกรูปไม่สำเร็จ: ${linkErr.message}`;
      }
      // ลบรูปเก่าที่ถูกแทนที่ (best effort — กันไฟล์กำพร้าสะสมใน storage)
      if (doctor.photo_path) {
        void supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([doctor.photo_path])
          .then(() => undefined, () => undefined);
      }
      return null;
    });

  return (
    <Modal open={open} onClose={onClose} title="จัดการหมอ">
      <div className="space-y-4">
        {/* เพิ่มหมอใหม่ */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addDoctor();
          }}
          className="flex gap-2"
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อหมอ เช่น พญ. กันตา ตันติชูศักดิ์ (หมอแจน)"
          />
          <Button type="submit" loading={busy} className="shrink-0">
            <Plus size={15} /> เพิ่ม
          </Button>
        </form>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
            {error}
          </p>
        )}

        {/* รายชื่อในทะเบียน */}
        <div className="max-h-[55dvh] space-y-1 overflow-y-auto pr-1">
          {sorted.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">
              ยังไม่มีหมอในทะเบียน — เพิ่มชื่อแรกด้านบน
            </p>
          )}
          {sorted.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/70 ${
                d.active ? "" : "opacity-55"
              }`}
            >
              {/* กดรูปเพื่อเปลี่ยนรูปโปรไฟล์ */}
              <button
                type="button"
                onClick={() => pickPhoto(d)}
                title="เปลี่ยนรูปโปรไฟล์"
                className="group relative shrink-0 cursor-pointer rounded-full active:scale-95"
              >
                <DoctorAvatar doctor={d} size="lg" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white bg-brand-500 text-white shadow-sm transition-transform group-hover:scale-110">
                  <Camera size={10} />
                </span>
              </button>

              {editingId === d.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void renameDoctor(d);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5"
                >
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Button type="submit" loading={busy} className="shrink-0 px-2.5 py-1.5 text-xs">
                    บันทึก
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                    {d.name}
                    {!d.active && (
                      <span className="ml-1.5 text-xs text-stone-400">
                        (ซ่อนจากตัวเลือก)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    title="เปลี่ยนชื่อ (ตามแก้ชื่อในเคส/คิวเดิมให้)"
                    onClick={() => {
                      setEditingId(d.id);
                      setEditName(d.name);
                      setError(null);
                    }}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-stone-400 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title={d.active ? "ซ่อนจากตัวเลือก (หมอที่ไม่ได้รับเคสแล้ว)" : "แสดงในตัวเลือก"}
                    onClick={() => void toggleActive(d)}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-stone-400 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90"
                  >
                    {d.active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    type="button"
                    title="ลบออกจากทะเบียน"
                    onClick={() => setConfirmDelete(d)}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-stone-400 transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-90"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs leading-5 text-stone-400">
          เปลี่ยนชื่อ = ระบบตามแก้ชื่อในเคส/คิวเดิมที่สะกดตรงกันให้ทั้งหมด ·
          เปลี่ยนเป็นชื่อที่มีอยู่แล้ว = รวมเป็นคนเดียวกัน (ไว้เก็บกวาดชื่อสะกดเพี้ยน) ·
          ลบ = เอาออกจากตัวเลือกเท่านั้น ชื่อในเคสเก่ายังแสดงตามเดิม
        </p>
      </div>

      {/* input รูปตัวเดียวใช้ร่วมทุกแถว — จำหมอเป้าหมายไว้ใน ref ตอนกด */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void uploadPhoto(f);
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="ลบหมอออกจากทะเบียน"
        message={
          confirmDelete
            ? `ลบ "${confirmDelete.name}" ออกจากตัวเลือกแพทย์? ชื่อที่บันทึกไว้ในเคส/คิวเดิมจะยังแสดงตามเดิม`
            : ""
        }
        onConfirm={() => {
          if (confirmDelete) void deleteDoctor(confirmDelete);
          setConfirmDelete(null);
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </Modal>
  );
}
