import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { getAccess, hasPermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type {
  DoctorRow,
  InfluencerRow,
  InfluFollowupRow,
  InfluProcedureItemRow,
  InfluSignatureRow,
  InfluTaskRow,
  TaskWithAssignee,
} from "@/lib/types";
import type { PriceCatalogEntry } from "../procedure-items-editor";
import { InfluDetailClient } from "./detail-client";

export const metadata: Metadata = {
  title: "รายละเอียด Influencer",
};

export default async function InfluencerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  // getClaims อ่าน JWT ในเครื่อง ไม่ยิง network — ใช้ uid ประกอบ query ได้เลย
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    access,
    { data: influencer },
    { data: followups },
    { data: signatures },
    { data: tasks },
    { data: contentTasks },
    { data: procedureItems },
    { data: priceCatalog },
    { data: profile },
    { data: doctors },
  ] = await Promise.all([
    getAccess(),
    supabase.from("influencers").select("*").eq("id", id).single(),
    supabase
      .from("influ_followups")
      .select("*")
      .eq("influencer_id", id)
      .order("round", { ascending: true }),
    supabase.from("influ_signatures").select("*").eq("influencer_id", id),
    supabase
      .from("influ_tasks")
      .select("*")
      .eq("influencer_id", id)
      .order("step", { ascending: true }),
    // งานคอนเทนต์ (จากหน้า "งาน") ที่ผูกกับ influencer คนนี้ (ไม่นับงานในถังขยะ)
    supabase
      .from("tasks")
      .select(
        "*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email), files:task_files(id, task_id, file_path, file_name, created_at)"
      )
      .eq("influencer_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // รายการโปรแกรม + ต้นทุน (Influencer Cost) ของเคสนี้
    supabase
      .from("influ_procedure_items")
      .select("*")
      .eq("influencer_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    // ตัวเลือกโปรแกรมจาก Price List กลาง (dropdown ใน Stage 2)
    supabase
      .from("price_items")
      .select("id, name")
      .eq("active", true)
      .order("name", { ascending: true }),
    userId
      ? supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .single()
      : Promise.resolve({ data: null }),
    // ทะเบียนแพทย์ — ตัวเลือก "แพทย์ที่รับเคส" ใน stage 2 / โมดัลแก้วัน-แพทย์
    supabase.from("doctors").select("*").order("name", { ascending: true }),
  ]);

  // โปรไฟล์รายคนเปิดจากแกลเลอรีได้ด้วย → เห็นได้ทั้งทีมและ influ manager
  // (บอร์ด/สัญญาใน Influ Management ยังจำกัดเฉพาะ influ)
  if (!hasPermission(access, "team") && !hasPermission(access, "influ"))
    return <AccessNotice />;

  if (!influencer) notFound();

  return (
    <PageContainer>
      <InfluDetailClient
        influencer={influencer as InfluencerRow}
        followups={(followups ?? []) as InfluFollowupRow[]}
        signatures={(signatures ?? []) as InfluSignatureRow[]}
        tasks={(tasks ?? []) as InfluTaskRow[]}
        contentTasks={(contentTasks ?? []) as unknown as TaskWithAssignee[]}
        procedureItems={(procedureItems ?? []) as InfluProcedureItemRow[]}
        priceCatalog={(priceCatalog ?? []) as PriceCatalogEntry[]}
        userName={profile?.full_name || profile?.email || ""}
        doctors={(doctors ?? []) as DoctorRow[]}
      />
    </PageContainer>
  );
}
