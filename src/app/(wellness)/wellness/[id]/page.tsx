import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/access-notice";
import {
  canViewWellness,
  canWellnessAdmin,
  canWellnessBc,
  canWellnessLab,
  getAccess,
} from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <WellnessDetailClient
      customer={customerRes.data}
      labFiles={filesRes.data ?? []}
      appointments={apptsRes.data ?? []}
      uid={access.uid}
      canBc={canWellnessBc(access)}
      canLab={canWellnessLab(access)}
      canAdmin={canWellnessAdmin(access)}
    />
  );
}
