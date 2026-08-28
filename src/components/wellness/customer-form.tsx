"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import type { WellnessCustomerRow } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/**
 * ฟอร์มการ์ดลูกค้า (สร้าง/แก้) — **ของทีม BC เท่านั้น** ใช้ร่วมกันระหว่างหน้า
 * "ทะเบียนลูกค้า" กับหน้าเคส เพื่อให้ช่องกรอกเหมือนกันเป๊ะทั้งสองที่
 *
 * เขียน DB ในตัวเอง (insert/update + router.refresh) แล้วคืนแถวที่บันทึกให้ผู้เรียก
 * เอาไปอัพเดต state ต่อได้ทันที
 */
export function CustomerFormModal({
  customer,
  uid,
  onClose,
  onSaved,
}: {
  /** null = สร้างการ์ดใหม่ */
  customer: WellnessCustomerRow | null;
  uid: string | null;
  onClose: () => void;
  onSaved?: (row: WellnessCustomerRow) => void;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(customer?.first_name ?? "");
  const [lastName, setLastName] = useState(customer?.last_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [procedure, setProcedure] = useState(customer?.procedure_text ?? "");
  const [note, setNote] = useState(customer?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const first = firstName.trim();
    if (!first) {
      setError("กรุณากรอกชื่อลูกค้า");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const values = {
      first_name: first,
      last_name: lastName.trim(),
      phone: phone.trim(),
      procedure_text: procedure.trim(),
      note: note.trim(),
    };
    const { data, error: err } = customer
      ? await supabase
          .from("wellness_customers")
          .update(values)
          .eq("id", customer.id)
          .select("*")
          .single()
      : await supabase
          .from("wellness_customers")
          .insert({ ...values, created_by: uid })
          .select("*")
          .single();
    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }
    onSaved?.(data);
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มการ์ดลูกค้า"}
    >
      <div className="space-y-3">
        {!customer && (
          <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-800">
            กรอกหลังลูกค้าศัลยกรรมตรวจเลือดแล้ว — การ์ดจะเข้าคิว “รอผลแลบ”
            ให้ทีม Lab อัพผลต่อโดยอัตโนมัติ
          </p>
        )}
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
            inputMode="tel"
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
          <Button onClick={() => void submit()} loading={saving}>
            {customer ? "บันทึก" : "สร้างการ์ด"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
