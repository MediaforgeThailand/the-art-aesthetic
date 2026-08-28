"use client";

import {
  CalendarClock,
  ChevronRight,
  Phone,
  Plus,
  Search,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import type {
  WellnessAppointmentRow,
  WellnessCustomerRow,
} from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import {
  apptRangeLabel,
  WELLNESS_STATUS,
  WELLNESS_STATUS_ORDER,
  wellnessCustomerName,
  wellnessStatusOf,
  type WellnessStatusKey,
} from "@/lib/wellness-constants";

export type ScheduledApptLite = Pick<
  WellnessAppointmentRow,
  "customer_id" | "appt_date" | "start_time" | "duration_hours"
>;

/**
 * บอร์ดการ์ดลูกค้า Wellness — ลิสต์จัดกลุ่มตามสถานะของ flow
 * (รอผลแลบ → ผลพร้อม·รอนัด → นัดแล้ว → ปิดเคส) แพตเทิร์นเดียวกับบอร์ด Hunting
 *
 * สถานะคำนวณจากข้อมูลจริง (wellnessStatusOf) ไม่มีให้เลือกเอง —
 * งานของแต่ละทีมคือทำ step ของตัวเองแล้วการ์ดเลื่อนกลุ่มเอง
 */
export function WellnessBoardClient({
  customers,
  scheduledAppts,
  uid,
  canCreate,
  canAdmin,
}: {
  customers: WellnessCustomerRow[];
  scheduledAppts: ScheduledApptLite[];
  uid: string | null;
  /** BC หรือ Admin — สร้างการ์ดลูกค้าใหม่ได้ */
  canCreate: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // นัดถัดไปของแต่ละคน — server เรียง วัน+เวลา มาแล้ว ตัวแรกที่เจอคือคิวใกล้สุด
  const nextApptByCustomer = useMemo(() => {
    const map = new Map<string, ScheduledApptLite>();
    for (const a of scheduledAppts) {
      if (!map.has(a.customer_id)) map.set(a.customer_id, a);
    }
    return map;
  }, [scheduledAppts]);

  const statusOf = (c: WellnessCustomerRow): WellnessStatusKey =>
    wellnessStatusOf(c, nextApptByCustomer.has(c.id));

  const q = search.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.phone} ${c.procedure_text} ${c.note}`
          .toLowerCase()
          .includes(q)
      )
    : customers;

  const groups = WELLNESS_STATUS_ORDER.map((key) => ({
    key,
    meta: WELLNESS_STATUS[key],
    items: filtered.filter((c) => statusOf(c) === key),
  }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-3 py-4 sm:px-6 sm:py-6">
        {/* แถบเครื่องมือแถวเดียว: ค้นหา + ปุ่มเพิ่มชิดขวา (ไม่มี PageHeader — กติกากลุ่มระบบแยก) */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา ชื่อ / เบอร์ / หัตถการ"
              className="glass w-full rounded-full border border-white/60 py-2 pl-9 pr-4 text-base text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-300 sm:text-sm"
            />
          </div>
          {canCreate && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="sm:ml-auto max-sm:min-h-11"
            >
              <Plus size={16} /> เพิ่มการ์ดลูกค้า
            </Button>
          )}
        </div>

        {/* ค้นหาแล้วไม่เจอ — ข้อมูลยังอยู่ครบ อย่าปล่อยหน้าโล่งให้เข้าใจผิด */}
        {q && filtered.length === 0 && customers.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
            ไม่พบการ์ดที่ตรงกับ “{search}” — การ์ดทั้งหมด {customers.length}{" "}
            ใบยังอยู่ครบ
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-11"
            >
              <X size={12} /> ล้างคำค้น
            </button>
          </div>
        )}

        <div className="space-y-4">
          {groups.map(({ key, meta, items }) => (
            <section key={key} className="glass overflow-hidden rounded-xl">
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-white/60 px-4 py-3">
                <span
                  className={`h-2.5 w-2.5 shrink-0 self-center rounded-full ${meta.dot}`}
                  aria-hidden
                />
                <h2 className="text-sm font-semibold text-stone-800">
                  {meta.label}
                </h2>
                <span className="text-xs text-stone-400">{items.length} ใบ</span>
                <span className="basis-full text-xs text-stone-400 sm:basis-auto sm:before:mx-1 sm:before:content-['·']">
                  {meta.hint}
                </span>
              </header>

              {items.length === 0 ? (
                <p className="px-4 py-4 text-xs text-stone-400">
                  ยังไม่มีการ์ดในสถานะนี้
                </p>
              ) : (
                <ul className="divide-y divide-white/60">
                  {items.map((c) => {
                    const appt = nextApptByCustomer.get(c.id);
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/wellness/${c.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/60 active:scale-[0.995]"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-semibold text-brand-800">
                            {(c.first_name || "?").charAt(0)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-medium text-stone-800">
                                {wellnessCustomerName(c)}
                              </span>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
                              >
                                {meta.label}
                              </span>
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                              {c.phone && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone size={11} className="text-stone-400" />
                                  {c.phone}
                                </span>
                              )}
                              {c.procedure_text && (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <Stethoscope
                                    size={11}
                                    className="shrink-0 text-stone-400"
                                  />
                                  <span className="truncate">
                                    {c.procedure_text}
                                  </span>
                                </span>
                              )}
                              {appt && (
                                <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                                  <CalendarClock size={11} />
                                  {formatDate(appt.appt_date)} ·{" "}
                                  {apptRangeLabel(
                                    appt.start_time,
                                    appt.duration_hours
                                  )}
                                </span>
                              )}
                              <span className="text-stone-400">
                                สร้าง {formatDate(c.created_at)}
                              </span>
                            </span>
                          </span>
                          <ChevronRight
                            size={16}
                            className="shrink-0 text-stone-300"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>

        {customers.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl px-4 py-8 text-center">
            <UserRound size={36} className="text-stone-300" />
            <p className="text-sm font-medium text-stone-600">
              ยังไม่มีการ์ดลูกค้าในระบบ
            </p>
            <p className="text-xs text-stone-400">
              {canCreate
                ? "กด “เพิ่มการ์ดลูกค้า” เพื่อสร้างการ์ดใบแรก (ทีม BC กรอกหลังลูกค้าตรวจเลือด)"
                : "ทีม BC เป็นผู้สร้างการ์ดหลังลูกค้าตรวจเลือด"}
            </p>
          </div>
        )}
      </div>

      {canCreate && (
        <CreateCustomerModal
          open={createOpen}
          uid={uid}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {/* canAdmin ยังไม่ใช้บนบอร์ด (การลบ/ปิดเคสอยู่หน้า detail) — รับไว้เผื่ออนาคต */}
      {void canAdmin}
    </div>
  );
}

/** ฟอร์มสร้างการ์ดลูกค้า (ทีม BC) — บังคับแค่ชื่อ ที่เหลือเติมทีหลังได้ในหน้าการ์ด */
function CreateCustomerModal({
  open,
  uid,
  onClose,
}: {
  open: boolean;
  uid: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [procedure, setProcedure] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setProcedure("");
    setNote("");
    setError(null);
  }

  async function submit() {
    const first = firstName.trim();
    if (!first) {
      setError("กรุณากรอกชื่อลูกค้า");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insErr } = await supabase
      .from("wellness_customers")
      .insert({
        first_name: first,
        last_name: lastName.trim(),
        phone: phone.trim(),
        procedure_text: procedure.trim(),
        note: note.trim(),
        created_by: uid,
      })
      .select("id")
      .single();
    setSaving(false);
    if (insErr || !data) {
      setError(insErr?.message ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }
    reset();
    onClose();
    // พาไปหน้าการ์ดใหม่เลย — BC เช็คข้อมูลต่อ / แปะโน้ตเพิ่มได้ทันที
    router.push(`/wellness/${data.id}`);
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="เพิ่มการ์ดลูกค้า Wellness">
      <div className="space-y-3">
        <p className="text-xs text-stone-500">
          กรอกหลังลูกค้าศัลยกรรมตรวจเลือดแล้ว — การ์ดจะเข้าคิว “รอผลแลบ”
          ให้ทีม Lab อัพผลต่อ
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="wc-first">ชื่อ *</Label>
            <Input
              id="wc-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="ชื่อจริงลูกค้า"
              autoFocus={
                typeof window !== "undefined" &&
                window.matchMedia("(pointer: fine)").matches
              }
            />
          </div>
          <div>
            <Label htmlFor="wc-last">นามสกุล</Label>
            <Input
              id="wc-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="นามสกุล"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="wc-phone">เบอร์โทร</Label>
          <Input
            id="wc-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
          />
        </div>
        <div>
          <Label htmlFor="wc-proc">หัตถการที่ทำ</Label>
          <Input
            id="wc-proc"
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            placeholder="เช่น เสริมหน้าอก / ดูดไขมัน"
          />
        </div>
        <div>
          <Label htmlFor="wc-note">โน้ต</Label>
          <Textarea
            id="wc-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ข้อมูลเพิ่มเติม (ถ้ามี)"
          />
        </div>
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} loading={saving}>
            สร้างการ์ด
          </Button>
        </div>
      </div>
    </Modal>
  );
}
