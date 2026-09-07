import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { WELLNESS_ICONS } from "@/components/wellness/icons";
import { canViewWellness, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  wellnessHomeHref,
  wellnessRoleFlags,
  wellnessWorkspacesFor,
  todayBangkokISO,
  type WellnessWorkspace,
} from "@/lib/wellness-constants";

export const metadata: Metadata = { title: "ระบบ Wellness" };

/**
 * หน้าแรกของระบบ Wellness = **ตัวส่งคนไปหน้างานของบทบาทตัวเอง**
 *
 * กติกาผู้ใช้ 2026-08-28: ทุก feature ต้องแยกเป็นหน้าของตัวเอง และคนหนึ่งคนเห็นเฉพาะ
 * งานของบทบาทตัวเอง — คนที่มีบทบาทเดียว (BC / Lab / แพทย์) จึงถูกส่งเข้าหน้างานตรงๆ
 * ไม่ต้องเลือกอะไรเลย ส่วน Admin (และคนที่มีหลายบทบาท) เห็นหน้านี้เป็นแผนที่ของ flow
 * พร้อมตัวเลขงานค้างแต่ละขั้น
 */
export default async function WellnessHomePage() {
  const access = await getAccess();
  if (!canViewWellness(access)) return <AccessNotice />;

  const flags = wellnessRoleFlags(access.permissions);
  const direct = wellnessHomeHref(flags);
  if (direct) redirect(direct);

  const supabase = await createClient();
  const [customersRes, apptsRes] = await Promise.all([
    supabase
      .from("wellness_customers")
      .select("id, lab_confirmed_at, completed_at"),
    supabase
      .from("wellness_appointments")
      .select("customer_id, appt_date, status"),
  ]);

  const customers = customersRes.data ?? [];
  const appts = apptsRes.data ?? [];
  const today = todayBangkokISO();

  const scheduledCustomerIds = new Set(
    appts.filter((a) => a.status === "scheduled").map((a) => a.customer_id)
  );
  const active = customers.filter((c) => !c.completed_at);
  const counts: Record<string, { value: number; unit: string }> = {
    register: { value: active.length, unit: "เคสที่ยังไม่ปิด" },
    lab: {
      value: active.filter((c) => !c.lab_confirmed_at).length,
      unit: "รอผลแลบ",
    },
    booking: {
      value: active.filter(
        (c) => c.lab_confirmed_at && !scheduledCustomerIds.has(c.id)
      ).length,
      unit: "รอโทรนัด",
    },
    clinic: {
      value: appts.filter(
        (a) => a.status === "scheduled" && a.appt_date === today
      ).length,
      unit: "คิววันนี้",
    },
    calendar: {
      value: appts.filter(
        (a) => a.status === "scheduled" && a.appt_date >= today
      ).length,
      unit: "คิวที่ยังไม่ถึง",
    },
    cases: { value: customers.length, unit: "การ์ดทั้งหมด" },
  };

  const workspaces = wellnessWorkspacesFor(flags);
  const stages = workspaces.filter((w) => w.step !== null);
  const tools = workspaces.filter((w) => w.step === null);

  return (
    <PageContainer>
      <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
        <div>
          <h1 className="text-lg font-semibold text-stone-800">
            เลือกงานที่จะทำ
          </h1>
        </div>

        {stages.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              ขั้นตอนของเคส
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {stages.map((w) => (
                <WorkspaceTile
                  key={w.id}
                  workspace={w}
                  count={counts[w.id]?.value ?? 0}
                  unit={counts[w.id]?.unit ?? ""}
                />
              ))}
            </div>
          </section>
        )}

        {tools.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              เครื่องมือประกอบ
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tools.map((w) => (
                <WorkspaceTile
                  key={w.id}
                  workspace={w}
                  count={counts[w.id]?.value ?? 0}
                  unit={counts[w.id]?.unit ?? ""}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </PageContainer>
  );
}

function WorkspaceTile({
  workspace,
  count,
  unit,
}: {
  workspace: WellnessWorkspace;
  count: number;
  unit: string;
}) {
  const Icon = WELLNESS_ICONS[workspace.icon];
  return (
    <Link
      href={workspace.href}
      className="glass group flex items-start gap-3 rounded-xl px-4 py-4 transition-all duration-200 hover:shadow-md active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {workspace.step !== null && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-white">
              {workspace.step}
            </span>
          )}
          <span className="text-sm font-semibold text-stone-800">
            {workspace.label}
          </span>
          <span className="rounded-full border border-stone-200 bg-white/70 px-2 py-0.5 text-[11px] text-stone-600">
            {count} {unit}
          </span>
        </span>
        <span className="mt-1 block text-xs text-stone-500">
          {workspace.detail}
        </span>
      </span>
      <ArrowRight
        size={16}
        className="mt-1 shrink-0 text-stone-300 transition-colors group-hover:text-brand-500"
      />
    </Link>
  );
}
