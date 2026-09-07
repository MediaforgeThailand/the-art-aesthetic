"use client";

import {
  BadgeCheck,
  Camera,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  Modal,
  Select,
} from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import {
  DEFAULT_PRODUCT_TEAM,
  doctorDisplayName,
  DOCTOR_TITLES,
  INFLU_PRODUCT_TEAMS,
  INFLU_PRODUCT_TEAM_ORDER,
} from "@/influ/lib/influ-constants";
import { type InfluLogActor, logInflu } from "@/influ/lib/influ-log";
import { createClient } from "@/lib/supabase/client";
import type { DoctorRow, InfluProductTeam } from "@/lib/types";
import { DoctorAvatar } from "./doctor-select";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** ทีมของหมอเรียงตามลำดับกลาง (คัดลอกก่อน sort — ห้ามแก้ array ที่มาจาก props) */
function sortedTeams(teams: InfluProductTeam[] | null | undefined) {
  return [...(teams ?? [])].sort(
    (a, b) =>
      INFLU_PRODUCT_TEAM_ORDER.indexOf(a) - INFLU_PRODUCT_TEAM_ORDER.indexOf(b)
  );
}

/** ชิปทีม product ของหมอ 1 ท่าน */
function TeamChips({ teams }: { teams: InfluProductTeam[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sortedTeams(teams).map((t) => (
        <span
          key={t}
          className={`rounded-full px-1.5 py-0.5 text-[11px] leading-4 ${INFLU_PRODUCT_TEAMS[t].chip}`}
        >
          {INFLU_PRODUCT_TEAMS[t].label}
        </span>
      ))}
    </span>
  );
}

/* ---------- ฟอร์มเพิ่ม/แก้หมอ ----------
   ตั้งแต่ 0093 ทะเบียนเก็บชื่อแบบแยกช่อง (คำนำหน้า/ชื่อจริง/นามสกุล/ชื่อเล่น) + เลขใบ ปว.
   ส่วน doctors.name ยังเป็น "ชื่อที่แสดง" ที่ประกอบจากช่องเหล่านั้น เพราะเป็นกุญแจจับคู่
   กับ influencers.doctor_name / influ_calendar_events.doctor_name (คอลัมน์ text ไม่มี FK) */

function DoctorFormModal({
  doctor,
  doctors,
  requiredTeam,
  actor,
  onClose,
  onSaved,
}: {
  /** null = เพิ่มหมอใหม่ */
  doctor: DoctorRow | null;
  doctors: DoctorRow[];
  /** ทีมของหน้าที่เปิดฟอร์มนี้ (ระบบทีมคอนเทนต์ส่ง "aesthetics") — ติ๊กไว้ให้ตั้งแต่แรก
      และเตือนเมื่อเอาออก เพราะหมอจะหายจากลิสต์ของหน้านั้นทันที */
  requiredTeam?: InfluProductTeam;
  /** ผู้ทำ — ทะเบียนหมอเปิดจาก 2 หน้าที่ไม่มี InfluLogProvider (influ-doctors/tag-management)
      จึงต้องรับ actor เป็น prop แล้วเรียก logInflu ตรงๆ (แนวเดียวกับ hunting-client) */
  actor: InfluLogActor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(doctor?.title ?? "นพ.");
  const [firstName, setFirstName] = useState(doctor?.first_name ?? "");
  const [lastName, setLastName] = useState(doctor?.last_name ?? "");
  const [nickname, setNickname] = useState(doctor?.nickname ?? "");
  const [licenseNo, setLicenseNo] = useState(doctor?.license_no ?? "");
  const [teams, setTeams] = useState<InfluProductTeam[]>(() => {
    const current = doctor?.teams ?? [];
    if (current.length > 0) return current;
    return [requiredTeam ?? DEFAULT_PRODUCT_TEAM];
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = doctorDisplayName({
    title,
    first_name: firstName,
    last_name: lastName,
    nickname,
  });

  const toggleTeam = (team: InfluProductTeam) =>
    setTeams((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );

  const friendly = (message: string) => {
    if (message.includes("doctors_license_no_key")) {
      return "เลขใบ ปว. นี้ถูกใช้กับหมอท่านอื่นแล้ว";
    }
    if (message.includes("doctors_name_key")) {
      return "มีชื่อนี้ในทะเบียนอยู่แล้ว";
    }
    return message;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (firstName.trim() === "") {
      setErr("กรอกชื่อจริงก่อน");
      return;
    }
    if (preview === "") {
      setErr("ชื่อที่แสดงว่างไม่ได้");
      return;
    }
    // DB บังคับอย่างน้อย 1 ทีม (constraint doctors_teams_valid) — เช็คก่อนยิงให้ได้ข้อความไทย
    if (teams.length === 0) {
      setErr("เลือกทีม product อย่างน้อย 1 ทีม");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = {
      name: preview,
      title: title.trim() || null,
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      nickname: nickname.trim() || null,
      license_no: licenseNo.trim() || null,
      teams,
    };

    if (!doctor) {
      const { data: created, error } = await supabase
        .from("doctors")
        .insert(payload)
        .select("id")
        .single();
      setBusy(false);
      if (error) {
        setErr(`เพิ่มไม่สำเร็จ: ${friendly(error.message)}`);
        return;
      }
      logInflu(supabase, actor, {
        action: "create",
        entity: "doctor",
        entityId: created?.id ?? null,
        summary: `เพิ่มหมอในทะเบียน: ${preview}`,
        meta: { teams },
      });
      onSaved();
      return;
    }

    // ชื่อที่แสดงเปลี่ยน = ต้องตามแก้เคส/คิวที่อ้างชื่อเดิมก่อน (ถ้าพลาดกลางทาง
    // ทะเบียนยังชี้ชื่อเดิมอยู่ กดบันทึกซ้ำได้) — กติกาเดียวกับตอนเป็นช่องเปลี่ยนชื่อเดิม
    if (preview !== doctor.name) {
      const merged = doctors.find((d) => d.name === preview && d.id !== doctor.id);
      const { error: e1 } = await supabase
        .from("influencers")
        .update({ doctor_name: preview })
        .eq("doctor_name", doctor.name);
      if (e1) {
        setBusy(false);
        setErr(`แก้ชื่อในเคสไม่สำเร็จ: ${e1.message}`);
        return;
      }
      const { error: e2 } = await supabase
        .from("influ_calendar_events")
        .update({ doctor_name: preview })
        .eq("doctor_name", doctor.name);
      if (e2) {
        setBusy(false);
        setErr(`แก้ชื่อในคิวไม่สำเร็จ: ${e2.message}`);
        return;
      }
      if (merged) {
        // เปลี่ยนไปชนชื่อที่มีอยู่แล้ว = รวมเป็นคนเดียวกัน (เคสย้ายไปแล้ว ลบแถวเดิมทิ้ง)
        const { error: e3 } = await supabase
          .from("doctors")
          .delete()
          .eq("id", doctor.id);
        setBusy(false);
        if (e3) {
          setErr(`รวมชื่อไม่สำเร็จ: ${e3.message}`);
          return;
        }
        if (doctor.photo_path) {
          void supabase.storage
            .from(STORAGE_BUCKET_DOCUMENTS)
            .remove([doctor.photo_path])
            .then(
              () => undefined,
              () => undefined
            );
        }
        logInflu(supabase, actor, {
          action: "delete",
          entity: "doctor",
          entityId: doctor.id,
          summary: `รวมชื่อหมอ "${doctor.name}" เข้ากับ "${preview}" (ย้ายเคส/คิวไปแล้ว)`,
        });
        onSaved();
        return;
      }
      logInflu(supabase, actor, {
        action: "update",
        entity: "doctor",
        entityId: doctor.id,
        summary: `เปลี่ยนชื่อหมอ "${doctor.name}" → "${preview}" (แก้ตามในเคส/คิวให้แล้ว)`,
      });
    }

    const { error } = await supabase
      .from("doctors")
      .update(payload)
      .eq("id", doctor.id);
    setBusy(false);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${friendly(error.message)}`);
      return;
    }
    if (preview === doctor.name) {
      logInflu(supabase, actor, {
        action: "update",
        entity: "doctor",
        entityId: doctor.id,
        summary: `แก้ข้อมูลหมอ: ${preview}`,
        meta: { teams },
      });
    }
    onSaved();
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={doctor ? "แก้ข้อมูลแพทย์" : "เพิ่มแพทย์"}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr]">
          <div>
            <Label htmlFor="dr-title">คำนำหน้า</Label>
            <Select
              id="dr-title"
              disabled={busy}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            >
              {DOCTOR_TITLES.map((t) => (
                <option key={t || "none"} value={t}>
                  {t || "— ไม่ระบุ —"}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dr-first">ชื่อจริง *</Label>
            <Input
              id="dr-first"
              disabled={busy}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="เช่น กันตา"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="dr-last">นามสกุล</Label>
            <Input
              id="dr-last"
              disabled={busy}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="เช่น ตันติชูศักดิ์"
            />
          </div>
          <div>
            <Label htmlFor="dr-nick">ชื่อเล่น</Label>
            <Input
              id="dr-nick"
              disabled={busy}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="เช่น หมอแจน"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="dr-license">เลขใบประกอบวิชาชีพ (ว.)</Label>
          <Input
            id="dr-license"
            disabled={busy}
            value={licenseNo}
            onChange={(e) => setLicenseNo(e.target.value)}
            placeholder="เช่น 12345"
            className="font-mono"
          />
          {licenseNo.trim() !== "" && (
            <p className="mt-1 font-mono text-xs font-semibold text-brand-600">
              #DR{licenseNo.trim()}
            </p>
          )}
        </div>

        <div>
          <Label>ทีม product ที่รับเคส *</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {INFLU_PRODUCT_TEAM_ORDER.map((t) => {
              const on = teams.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  onClick={() => toggleTeam(t)}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97] max-sm:min-h-11 ${
                    on
                      ? INFLU_PRODUCT_TEAMS[t].chip
                      : "border border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  }`}
                >
                  {INFLU_PRODUCT_TEAMS[t].label}
                </button>
              );
            })}
          </div>
          {requiredTeam && !teams.includes(requiredTeam) && (
            <p className="mt-1.5 text-xs leading-5 text-amber-700">
              ไม่ได้ติดทีม {INFLU_PRODUCT_TEAMS[requiredTeam].label} —
              บันทึกแล้วหมอท่านนี้จะหายจากลิสต์ของหน้านี้
            </p>
          )}
        </div>

        <div className="rounded-lg bg-stone-50 px-3 py-2.5">
          <p className="text-xs text-stone-400">ชื่อที่จะแสดงในระบบ</p>
          <p className="mt-0.5 text-sm font-semibold text-stone-800">
            {preview || "—"}
          </p>
          {doctor && preview !== doctor.name && (
            <p className="mt-1 text-xs leading-5 text-amber-700">
              ชื่อเปลี่ยนจาก &quot;{doctor.name}&quot; — ระบบจะตามแก้ชื่อในเคส/คิวเดิมให้ทั้งหมด
            </p>
          )}
        </div>

        {err && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" loading={busy}>
            {doctor ? "บันทึก" : "เพิ่มแพทย์"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * หน้า "จัดการหมอ" — ทะเบียนแพทย์สำหรับตัวเลือก "แพทย์ที่รับเคส"
 * (เดิมเป็นโมดัลบนหัวบอร์ดเคส — ย้ายมาเป็นหน้าของตัวเองที่ /influ-doctors เมื่อ 2026-08-19)
 *
 * ตั้งแต่ 0093 การเพิ่ม/แก้ทำในโมดัลที่มีช่องแยก (คำนำหน้า/ชื่อจริง/นามสกุล/ชื่อเล่น +
 * เลขใบ ปว.) — เลขใบ ปว. เป็นกุญแจของแฮชแท็ก #DR<เลข> ที่ influ ต้องติดในโพส
 *
 * เปลี่ยนชื่อ = ระบบตามแก้ doctor_name ในเคส (influencers) และคิว (influ_calendar_events)
 * ที่สะกดตรงกับชื่อเดิมให้ทั้งหมด; เปลี่ยนเป็นชื่อที่มีอยู่แล้วในทะเบียน = รวมเป็นคนเดียวกัน
 */
export function DoctorManagerPanel({
  doctors,
  canEdit = true,
  teamFilter,
  actor = { id: null, name: null },
}: {
  doctors: DoctorRow[];
  /** false = ดูอย่างเดียว (ไม่มีสิทธิ์ canManageDoctors) — ซ่อนปุ่มเพิ่ม/แก้/ซ่อน/ลบ/เปลี่ยนรูปทั้งหมด */
  canEdit?: boolean;
  /** แสดงเฉพาะหมอที่อยู่ทีมนี้ (ระบบทีมคอนเทนต์ส่ง "aesthetics") — ไม่ส่ง = ทุกทีม */
  teamFilter?: InfluProductTeam;
  /** ผู้ทำ — ไม่ส่ง = บันทึก log เป็นระบบไม่ระบุตัวตน (ทั้งสองหน้าที่ใช้ component นี้
      ควรส่งมาเสมอ; ค่าปริยายกันพังกรณีมีที่เรียกใหม่ที่ลืมส่ง) */
  actor?: InfluLogActor;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  /** null = ปิด · { doctor: null } = เพิ่มใหม่ */
  const [formFor, setFormFor] = useState<{ doctor: DoctorRow | null } | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState<DoctorRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<DoctorRow | null>(null);

  const visible = teamFilter
    ? doctors.filter((d) => (d.teams ?? []).includes(teamFilter))
    : doctors;
  // ทีมอื่นถูกกรองออก ไม่ได้หายจากทะเบียน — บอกจำนวนไว้กันเข้าใจผิดว่าข้อมูลหาย
  const hiddenByTeam = doctors.length - visible.length;
  const sorted = [...visible].sort((a, b) => a.name.localeCompare(b.name, "th"));
  const missingLicense = sorted.filter(
    (d) => d.active && !d.license_no
  ).length;

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

  const toggleActive = (doctor: DoctorRow) =>
    run(async () => {
      const { error: e } = await supabase
        .from("doctors")
        .update({ active: !doctor.active })
        .eq("id", doctor.id);
      if (e) return `บันทึกไม่สำเร็จ: ${e.message}`;
      logInflu(supabase, actor, {
        action: "status",
        entity: "doctor",
        entityId: doctor.id,
        summary: `${doctor.active ? "ซ่อน" : "เปิด"}หมอ "${doctor.name}" ${doctor.active ? "จากตัวเลือก" : "กลับมาในตัวเลือก"}`,
      });
      return null;
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
          .then(
            () => undefined,
            () => undefined
          );
      }
      logInflu(supabase, actor, {
        action: "delete",
        entity: "doctor",
        entityId: doctor.id,
        summary: `ลบหมอออกจากทะเบียน: ${doctor.name}`,
      });
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
      if (!linkErr) {
        logInflu(supabase, actor, {
          action: "upload",
          entity: "doctor",
          entityId: doctor.id,
          summary: `เปลี่ยนรูปหมอ: ${doctor.name}`,
        });
      }
      if (linkErr) {
        // ผูกกับ DB ไม่สำเร็จ — เก็บกวาดไฟล์ที่เพิ่งอัพ (best effort)
        void supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([path])
          .then(
            () => undefined,
            () => undefined
          );
        return `บันทึกรูปไม่สำเร็จ: ${linkErr.message}`;
      }
      // ลบรูปเก่าที่ถูกแทนที่ (best effort — กันไฟล์กำพร้าสะสมใน storage)
      if (doctor.photo_path) {
        void supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([doctor.photo_path])
          .then(
            () => undefined,
            () => undefined
          );
      }
      return null;
    });

  return (
    // จอเล็กบีบขอบการ์ดลง — แถวหมอมีทั้งรูป ชื่อ และปุ่ม 44px 3 ปุ่มในบรรทัดเดียว
    <Card className="p-3 sm:p-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button onClick={() => setFormFor({ doctor: null })}>
              <Plus size={15} /> เพิ่มแพทย์
            </Button>
          ) : (
            <span className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-medium text-stone-500">
              ดูอย่างเดียว — ไม่มีสิทธิ์แก้ทะเบียนหมอ
            </span>
          )}
          {teamFilter && hiddenByTeam > 0 && (
            <span className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-medium text-stone-500">
              แสดงเฉพาะหมอทีม {INFLU_PRODUCT_TEAMS[teamFilter].label} ·
              ทีมอื่นซ่อนอยู่ {hiddenByTeam} ท่าน
            </span>
          )}
          {missingLicense > 0 && (
            <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              ยังไม่มีเลขใบ ปว. {missingLicense} ท่าน — เคสของหมอท่านนั้นจะติดแท็กไม่ครบ
            </span>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 animate-fade-in">
            {error}
          </p>
        )}

        {/* รายชื่อในทะเบียน */}
        <div className="space-y-1">
          {sorted.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">
              {canEdit
                ? 'ยังไม่มีหมอในทะเบียน — กด "เพิ่มแพทย์" ด้านบน'
                : "ยังไม่มีหมอในทะเบียน"}
            </p>
          )}
          {sorted.map((d) => (
            <div
              key={d.id}
              // flex-wrap: จอแคบปุ่ม 44px 3 ปุ่มตกลงมาบรรทัดล่างแทนที่จะบีบชื่อจนอ่านไม่ออก
              className={`flex flex-wrap items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/70 max-sm:gap-y-2 ${
                d.active ? "" : "opacity-55"
              }`}
            >
              {/* กดรูปเพื่อเปลี่ยนรูปโปรไฟล์ (เฉพาะคนที่ canEdit) */}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => pickPhoto(d)}
                  title="เปลี่ยนรูปโปรไฟล์"
                  aria-label={`เปลี่ยนรูปโปรไฟล์ของ ${d.name}`}
                  className="group relative shrink-0 cursor-pointer rounded-full active:scale-95"
                >
                  <DoctorAvatar doctor={d} size="lg" />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white bg-brand-500 text-white shadow-sm transition-transform group-hover:scale-110">
                    <Camera size={10} />
                  </span>
                </button>
              ) : (
                <span className="shrink-0">
                  <DoctorAvatar doctor={d} size="lg" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-stone-800">
                  {d.name}
                  {!d.active && (
                    <span className="ml-1.5 text-xs text-stone-400">
                      (ซ่อนจากตัวเลือก)
                    </span>
                  )}
                </p>
                {d.license_no ? (
                  <p
                    className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-stone-400"
                    title={`เลขใบประกอบวิชาชีพ ${d.license_no} — แฮชแท็ก #DR${d.license_no}`}
                  >
                    <BadgeCheck size={11} className="shrink-0 text-emerald-500" />
                    {/* เลขใบ ปว. + แฮชแท็กยาวกว่าช่องบนจอแคบ — ตัดท้ายแทนดันแถวจนล้น */}
                    <span className="truncate">ว. {d.license_no}</span>
                    <span className="truncate font-mono text-stone-400">
                      · #DR{d.license_no}
                    </span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-700">
                    ยังไม่มีเลขใบ ปว. — เคสของหมอท่านนี้จะติดแท็กไม่ครบ
                  </p>
                )}
                <div className="mt-1">
                  <TeamChips teams={d.teams ?? []} />
                </div>
              </div>

              {/* กลุ่มปุ่มจัดการ — จอแคบตกลงมาทั้งกลุ่มในบรรทัดล่าง: ต้องมี w-full
                  ถึงจะดัน flex-wrap ให้ทำงาน (ช่องชื่อเป็น flex-1 ยุบได้เรื่อยๆ
                  ปุ่ม 44px 3 ปุ่มจึงบีบชื่อจนอ่านไม่ออกแทนที่จะขึ้นบรรทัดใหม่) */}
              <div
                className={`flex items-center gap-2.5 max-sm:w-full max-sm:justify-end ${
                  canEdit ? "" : "hidden"
                }`}
              >
                <button
                  type="button"
                  title="แก้ข้อมูล (ตามแก้ชื่อในเคส/คิวเดิมให้)"
                  aria-label={`แก้ข้อมูล ${d.name}`}
                  onClick={() => {
                    setFormFor({ doctor: d });
                    setError(null);
                  }}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90 max-sm:h-11 max-sm:w-11"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  title={
                    d.active
                      ? "ซ่อนจากตัวเลือก (หมอที่ไม่ได้รับเคสแล้ว)"
                      : "แสดงในตัวเลือก"
                  }
                  aria-label={
                    d.active
                      ? `ซ่อน ${d.name} จากตัวเลือก`
                      : `แสดง ${d.name} ในตัวเลือก`
                  }
                  onClick={() => void toggleActive(d)}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-all hover:bg-brand-50 hover:text-brand-600 active:scale-90 max-sm:h-11 max-sm:w-11"
                >
                  {d.active ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  title="ลบออกจากทะเบียน"
                  aria-label={`ลบ ${d.name} ออกจากทะเบียน`}
                  onClick={() => setConfirmDelete(d)}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-90 max-sm:h-11 max-sm:w-11"
                >
                  <Trash2 size={14} />
                </button>
              </div>
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

      {formFor && (
        <DoctorFormModal
          // remount ทุกครั้งที่เปลี่ยนเป้าหมาย — ค่าในฟอร์มเริ่มจากหมอคนนั้น
          key={formFor.doctor?.id ?? "new"}
          doctor={formFor.doctor}
          doctors={doctors}
          requiredTeam={teamFilter}
          actor={actor}
          onClose={() => setFormFor(null)}
          onSaved={() => {
            setFormFor(null);
            router.refresh();
          }}
        />
      )}

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
    </Card>
  );
}
