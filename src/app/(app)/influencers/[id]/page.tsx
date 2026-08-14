import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import {
  canEditInflu,
  canViewInflu,
  getAccess,
  hasPermission,
} from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type {
  DoctorRow,
  InfluencerRow,
  InfluRoundLite,
  InfluFollowupRow,
  InfluLinkRow,
  InfluPostLinkRow,
  InfluProcedureItemRow,
  InfluSignatureRow,
  InfluTaskRow,
  ProfileRow,
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
    { data: influencerRaw },
    { data: followups },
    { data: signatures },
    { data: tasks },
    { data: contentTasks },
    { data: procedureItems },
    { data: priceCatalog },
    { data: sourceLinks },
    { data: postLinks },
    { data: profile },
    { data: doctors },
  ] = await Promise.all([
    getAccess(),
    // owner = ผู้รับผิดชอบเคส (คนที่สร้างการ์ด) — join ชื่อมาโชว์บนหัวหน้า
    supabase
      .from("influencers")
      .select(
        "*, owner:profiles!influencers_owner_id_fkey(id, full_name, email)"
      )
      .eq("id", id)
      .single(),
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
    // ตัวเลือกโปรแกรมจาก Price List กลาง (dropdown ใน Stage 2 — ส่งราคาไปโชว์/ใส่อัตโนมัติด้วย)
    supabase
      .from("price_items")
      .select("id, name, price_normal, promos, search_aliases")
      .eq("active", true)
      .order("name", { ascending: true }),
    // ลิงก์ไฟล์ source (Google Drive) ของเคสนี้
    supabase
      .from("influ_links")
      .select("*")
      .eq("influencer_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    // ลิงก์โพส/คอมเมนต์ที่ influ ลงจริง (การ์ดบนสุดของขั้นตามงาน)
    supabase
      .from("influ_post_links")
      .select("*")
      .eq("influencer_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
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

  // โปรไฟล์รายคนเปิดจากแกลเลอรีได้ด้วย → เห็นได้ทั้งทีมและทุกระดับของระบบ Influencer
  // (แก้ไขได้เฉพาะ Hunter ขึ้นไป — canManage ด้านล่าง; team/ดูเฉยๆ = อ่านอย่างเดียว)
  if (!hasPermission(access, "team") && !canViewInflu(access))
    return <AccessNotice />;

  // ชนิดของ embed ต้องประกาศเอง — database.types ไม่ได้ประกาศ Relationships ไว้
  const influencer = influencerRaw as unknown as
    | (InfluencerRow & {
        owner: Pick<ProfileRow, "id" | "full_name" | "email"> | null;
      })
    | null;
  if (!influencer) notFound();

  // รอบงานทั้งหมดของคนเดียวกัน (person_id) — แถบสลับรอบบนหัวหน้า + เลขรอบถัดไปตอนเปิดรอบใหม่
  // ต้องรอ person_id จาก query หลักก่อน เลยยิงแยกอีกเที่ยว (DB อยู่ region เดียวกับ function ~1-2ms)
  const { data: personRounds } = await supabase
    .from("influencers")
    .select(
      "id, round_no, stage, completed, declined_at, archived, service_date, created_at"
    )
    .eq("person_id", influencer.person_id)
    .order("round_no", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <PageContainer>
      <InfluDetailClient
        influencer={influencer}
        ownerName={
          influencer.owner?.full_name || influencer.owner?.email || null
        }
        personRounds={(personRounds ?? []) as InfluRoundLite[]}
        followups={(followups ?? []) as InfluFollowupRow[]}
        signatures={(signatures ?? []) as InfluSignatureRow[]}
        tasks={(tasks ?? []) as InfluTaskRow[]}
        contentTasks={(contentTasks ?? []) as unknown as TaskWithAssignee[]}
        procedureItems={(procedureItems ?? []) as InfluProcedureItemRow[]}
        priceCatalog={(priceCatalog ?? []) as PriceCatalogEntry[]}
        sourceLinks={(sourceLinks ?? []) as InfluLinkRow[]}
        postLinks={(postLinks ?? []) as InfluPostLinkRow[]}
        userId={userId}
        userName={profile?.full_name || profile?.email || ""}
        doctors={(doctors ?? []) as DoctorRow[]}
        canManage={canEditInflu(access)}
      />
    </PageContainer>
  );
}
