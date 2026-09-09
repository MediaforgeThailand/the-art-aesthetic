"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import { updateCase } from "@/lib/queue/actions";
import { FIELD_LABEL, type ParsedField } from "@/lib/queue/parser";

/** ปุ่มแก้ข้อมูลเคสของแอดมิน — ส่งเฉพาะช่องที่เปลี่ยนจริง */

type FieldSpec = { field: ParsedField; type?: "date" | "time" | "number" | "area" };

const FIELDS: FieldSpec[] = [
  { field: "customer_name" },
  { field: "customer_age", type: "number" },
  { field: "phone" },
  { field: "line_id" },
  { field: "appointment_date", type: "date" },
  { field: "appointment_time", type: "time" },
  { field: "treatment_main" },
  { field: "treatment_detail", type: "area" },
  { field: "doctor" },
  { field: "branch" },
  { field: "channel" },
  { field: "seller_name" },
  { field: "owner_bc_name" },
  { field: "discussion_start_date", type: "date" },
  { field: "closed_date", type: "date" },
  { field: "note", type: "area" },
];

export default function CaseAdminActions({
  caseId,
  values,
}: {
  caseId: string;
  values: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const patch: Record<string, string | number | null> = {};
    for (const { field } of FIELDS) {
      const next = (draft[field] ?? "").trim();
      if (next === (values[field] ?? "").trim()) continue;
      patch[field] =
        next === "" ? null : field === "customer_age" ? Number(next) || null : next;
    }
    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await updateCase(caseId, patch, reason.trim() || undefined);
      if (!result.ok) setError(result.error);
      else {
        setOpen(false);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        onClick={() => {
          setDraft(values);
          setOpen(true);
        }}
      >
        <Pencil size={16} /> แก้ข้อมูล
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="แก้ข้อมูลเคส" wide>
        <div className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {FIELDS.map(({ field, type }) => (
              <div
                key={field}
                className={type === "area" ? "sm:col-span-2" : undefined}
              >
                <Label htmlFor={`edit-${field}`} className="mb-1 text-xs">
                  {FIELD_LABEL[field]}
                </Label>
                {type === "area" ? (
                  <Textarea
                    id={`edit-${field}`}
                    rows={2}
                    value={draft[field] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={`edit-${field}`}
                    type={type ?? "text"}
                    value={draft[field] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="edit-reason">เหตุผลที่แก้ (ไม่บังคับ)</Label>
            <Input
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เหตุผล"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button loading={pending} onClick={save}>
              บันทึก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
