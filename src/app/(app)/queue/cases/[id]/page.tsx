import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { getAssignmentByCase, getCaseDetail } from "@/lib/queue/data";
import { getQueueSession } from "@/lib/queue/session";
import { maskLineId, maskPhone } from "@/lib/queue/mask";
import { CASE_TYPE_LABEL, type CaseType } from "@/lib/queue/types";
import { Field, StatusBadge } from "../../_components/pieces";
import CaseAdminActions from "./case-edit";

export const metadata: Metadata = { title: "รายละเอียดเคส" };

/**
 * หน้ารายละเอียด — เห็นข้อมูลติดต่อเต็มได้เฉพาะแอดมินกับ BC ที่ถือเคสนี้
 * ซึ่งบังคับด้วย RLS ที่ฐานข้อมูล (คนอื่นดึงมาไม่ได้เลย ไม่ใช่แค่ซ่อนหน้าจอ)
 */
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getQueueSession();
  if (!session) return null;

  const [detail, assignments] = await Promise.all([
    getCaseDetail(id),
    getAssignmentByCase(id),
  ]);
  if (!detail) notFound();

  const value = (key: string) => (detail[key] as string | number | null) ?? null;
  const text = (key: string) => {
    const raw = value(key);
    return raw == null ? "" : String(raw);
  };
  const time = text("appointment_time").slice(0, 5);
  // ผู้ที่ไม่ใช่แอดมินแต่เห็นเคสได้ทั้งหมด = สิทธิ์ "ผู้ดูอย่างเดียว" → ปิดบังข้อมูลติดต่อ
  // (BC เห็นเต็มได้เฉพาะเคสของตัวเอง ซึ่ง RLS ยอมให้ดึงมาแค่เคสนั้นอยู่แล้ว)
  const canSeeContact = session.isAdmin || !session.canViewAll;
  const caseType = value("case_type") as CaseType;

  return (
    <>
      <Link
        href="/queue"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-brand-700"
      >
        <ArrowLeft size={16} /> กลับหน้าคิว
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-stone-900">
            {text("customer_name") || "—"}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <span>เคส #{value("case_no")}</span>
            <Badge className="bg-brand-50 text-brand-700">
              {CASE_TYPE_LABEL[caseType] ?? caseType}
            </Badge>
            {value("status") === "cancelled" && (
              <Badge className="bg-stone-100 text-stone-500">ยกเลิกแล้ว</Badge>
            )}
          </div>
        </div>
        {session.isAdmin && (
          <CaseAdminActions
            caseId={id}
            values={{
              customer_name: text("customer_name"),
              customer_age: text("customer_age"),
              phone: text("phone"),
              line_id: text("line_id"),
              appointment_date: text("appointment_date"),
              appointment_time: time,
              treatment_main: text("treatment_main"),
              treatment_detail: text("treatment_detail"),
              doctor: text("doctor"),
              branch: text("branch"),
              channel: text("channel"),
              seller_name: text("seller_name"),
              owner_bc_name: text("owner_bc_name"),
              discussion_start_date: text("discussion_start_date"),
              closed_date: text("closed_date"),
              note: text("note"),
            }}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="glass min-w-0 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Field label="อายุ" value={text("customer_age")} />
            <Field
              label="เบอร์ติดต่อ"
              value={
                !text("phone") ? null : canSeeContact ? (
                  <a href={`tel:${text("phone")}`} className="text-brand-700 hover:underline">
                    {text("phone")}
                  </a>
                ) : (
                  maskPhone(text("phone"))
                )
              }
            />
            <Field
              label="ID LINE"
              value={canSeeContact ? text("line_id") : maskLineId(text("line_id"))}
            />
            <Field label="วันที่นัด" value={formatDate(text("appointment_date"))} />
            <Field label="เวลานัด" value={time ? `${time} น.` : null} />
            <Field label="ช่องทาง" value={text("channel")} />
            <Field label="แพทย์" value={text("doctor")} />
            <Field label="สาขา" value={text("branch")} />
            <Field label="ผู้ขาย" value={text("seller_name")} />
            <Field label="ผู้ดูแลเคส BC" value={text("owner_bc_name")} />
            <Field label="วันที่เริ่มคุย" value={formatDate(text("discussion_start_date"))} />
            <Field label="วันที่ปิดขาย" value={formatDate(text("closed_date"))} />
          </div>

          <div className="mt-4 border-t border-brand-100 pt-3">
            <Field label="หัตถการ" value={text("treatment_main")} />
            {text("treatment_detail") && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
                {text("treatment_detail")}
              </p>
            )}
            {text("note") && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-brand-50/60 px-3 py-2 text-sm text-stone-700">
                {text("note")}
              </p>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="glass rounded-xl p-3">
            <h2 className="mb-2 text-sm font-semibold text-stone-800">ประวัติการจ่ายคิว</h2>
            <ol className="space-y-2">
              {assignments.map((assignment) => (
                <li key={assignment.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-800">
                      {assignment.member_name ?? "ยังไม่มีผู้รับ"}
                    </span>
                    <StatusBadge status={assignment.status} />
                  </div>
                  <p className="text-xs text-stone-400">
                    {formatDateTime(assignment.assigned_at)}
                    {assignment.rank_snapshot
                      ? ` · อันดับ ${assignment.rank_snapshot} · x${assignment.weight_snapshot}`
                      : ""}
                  </p>
                  {assignment.reason && (
                    <p className="text-xs text-stone-500">{assignment.reason}</p>
                  )}
                </li>
              ))}
              {assignments.length === 0 && (
                <li className="text-sm text-stone-400">ยังไม่มีการจ่ายคิว</li>
              )}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}
