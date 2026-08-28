import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/access-notice";
import {
  canViewWellness,
  canWellnessAdmin,
  canWellnessBc,
  canWellnessLab,
  getAccess,
  hasPermission,
} from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  WELLNESS_WORKSPACES,
  wellnessHomeHref,
  wellnessRoleFlags,
} from "@/lib/wellness-constants";
import { WellnessDetailClient } from "./detail-client";

export const metadata: Metadata = { title: "การ์ดลูกค้า Wellness" };

export default async function WellnessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [access, customerRes, filesRes, apptsRes] = await Promise.all([
    getAccess(),
    supabase.from("wellness_customers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("wellness_lab_files")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("wellness_appointments")
      .select("*")
      .eq("customer_id", id)
      .order("appt_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (!canViewWellness(access)) return <AccessNotice />;
  if (!customerRes.data) notFound();

  // ปุ่มกลับ = หน้างานของบทบาทคนนั้น (admin กลับหน้าภาพรวม) — ไม่พาไปหน้าที่เขาไม่ได้ใช้
  const flags = wellnessRoleFlags(access.permissions);
  const back = flags.admin
    ? { href: "/wellness-cases", label: "ภาพรวมเคส" }
    : (() => {
        const href = wellnessHomeHref(flags);
        const ws = WELLNESS_WORKSPACES.find((w) => w.href === href);
        return { href: href ?? "/wellness", label: ws?.label ?? "หน้าแรก" };
      })();

  return (
    <WellnessDetailClient
      customer={customerRes.data}
      labFiles={filesRes.data ?? []}
      appointments={apptsRes.data ?? []}
      uid={access.uid}
      canBc={canWellnessBc(access)}
      canLab={canWellnessLab(access)}
      canAdmin={canWellnessAdmin(access)}
      canDoctor={hasPermission(access, "wellness_doctor")}
      backHref={back.href}
      backLabel={back.label}
    />
  );
}
