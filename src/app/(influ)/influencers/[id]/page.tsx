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
  InfluCalendarEventRow,
  InfluencerRow,
  InfluRoundLite,
  InfluLinkRow,
  InfluPostLinkRow,
  InfluProcedureItemRow,
  InfluProfileChannelRow,
  InfluProfileRow,
  InfluServiceRow,
  InfluSignatureRow,
  InfluTaskRow,
  ProfileRow,
  TaskWithAssignee,
} from "@/lib/types";
import type {
  PriceCatalogEntry,
  PromoCatalogEntry,
} from "../procedure-items-editor";
import { InfluDetailClient } from "./detail-client";

export const metadata: Metadata = {
  title: "รายละเอียด Influencer",
};

export default async function InfluencerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);

  // ?view=<เลขขั้น> มาจากบอร์ดตอนกรอง stage อยู่ — เปิดหน้ามาที่ขั้นนั้นเลย
  // (client เป็นคน clamp กับ stage จริงของเคส เพราะรู้ maxStage หลังโหลดข้อมูล)
  const viewNum = Number.parseInt(view ?? "", 10);
  const initialStage = Number.isInteger(viewNum) ? viewNum : null;

  const supabase = await createClient();

  // getClaims อ่าน JWT ในเครื่อง ไม่ยิง network — ใช้ uid ประกอบ query ได้เลย
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  // วันนี้ตามเวลาไทย — ใช้กรองโปรที่หมดเขตแล้วออกจากตัวเลือกหัตถการ
  const todayBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  // getAccess ยิงขนานกับ query หลัก (RLS กันข้อมูลอยู่แล้ว — ทิ้งผลถ้าไม่มีสิทธิ์)
  const [
    access,
    { data: influencerRaw },
    { data: signatures },
    { data: tasks },
    { data: contentTasks },
    { data: procedureItems },
    { data: priceCatalog },
    { data: promoCatalog },
    { data: serviceBookings },
    { data: sourceLinks },
    { data: postLinks },
    { data: profile },
    { data: doctors },
    { data: services },
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
    // ตัวเลือกโปรแกรมจาก Price List กลาง (dropdown ในแท็บรายละเอียดเคส — ส่งราคาไปโชว์/ใส่อัตโนมัติด้วย)
    supabase
      .from("price_items")
      .select("id, name, price_normal, promos, search_aliases")
      .eq("active", true)
      .order("name", { ascending: true }),
    // โปรที่ขึ้นหน้า /price-list (promo_packages — 0090): ราคาโปรจริงที่ขายอยู่
    // หลายตัวไม่มีคู่ใน price_items (เช่น Botox Hutox โปร 9,900 vs ปกติ 11,900)
    supabase
      .from("promo_packages")
      .select("id, name, sale_price, full_price")
      .eq("active", true)
      .or(`ends_on.is.null,ends_on.gte.${todayBkk}`)
      .order("name", { ascending: true }),
    // คิว "เข้ารับบริการ" ของเคสนี้ในปฏิทิน (kind=service) — ขั้นสัญญาบังคับให้ลงคิวก่อน
    // ถึงจะไปขั้นตามงานได้ (เกณฑ์เดียวกับป้าย "รอลงคิวหมอ" บนบอร์ด: needsDoctorBooking)
    supabase
      .from("influ_calendar_events")
      .select("*")
      .eq("influencer_id", id)
      .eq("kind", "service")
      .order("event_date", { ascending: true }),
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
    // ทะเบียนแพทย์ — ตัวเลือก "แพทย์ที่รับเคส" ในแท็บรายละเอียดเคส / โมดัลแก้วัน-แพทย์
    supabase.from("doctors").select("*").order("name", { ascending: true }),
    // เมนูหัตถการที่ทีมเพิ่มเอง แยก product team (0080) — ใช้ใน editor ของแท็บรายละเอียดเคส
    supabase
      .from("influ_services")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
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
  const [
    { data: personRounds },
    { data: personProfile },
    { data: profileChannels },
  ] = await Promise.all([
    supabase
      .from("influencers")
      .select(
        "id, round_no, stage, completed, declined_at, archived, service_date, created_at"
      )
      .eq("person_id", influencer.person_id)
      .order("round_no", { ascending: true })
      .order("created_at", { ascending: true }),
    // โปรไฟล์ตัวบุคคล (0080) — id เดียวกับ person_id (เคสเก่าก่อนแยกโปรไฟล์อาจไม่มีแถว)
    supabase
      .from("influ_profiles")
      .select("*")
      .eq("id", influencer.person_id)
      .maybeSingle(),
    supabase
      .from("influ_profile_channels")
      .select("*")
      .eq("profile_id", influencer.person_id)
      .order("position", { ascending: true }),
  ]);

  return (
    <PageContainer>
      <InfluDetailClient
        influencer={influencer}
        ownerName={
          influencer.owner?.full_name || influencer.owner?.email || null
        }
        personRounds={(personRounds ?? []) as InfluRoundLite[]}
        signatures={(signatures ?? []) as InfluSignatureRow[]}
        tasks={(tasks ?? []) as InfluTaskRow[]}
        contentTasks={(contentTasks ?? []) as unknown as TaskWithAssignee[]}
        procedureItems={(procedureItems ?? []) as InfluProcedureItemRow[]}
        priceCatalog={(priceCatalog ?? []) as PriceCatalogEntry[]}
        promoCatalog={(promoCatalog ?? []) as PromoCatalogEntry[]}
        serviceBookings={(serviceBookings ?? []) as InfluCalendarEventRow[]}
        services={(services ?? []) as InfluServiceRow[]}
        personProfile={(personProfile as InfluProfileRow | null) ?? null}
        profileChannels={(profileChannels ?? []) as InfluProfileChannelRow[]}
        sourceLinks={(sourceLinks ?? []) as InfluLinkRow[]}
        postLinks={(postLinks ?? []) as InfluPostLinkRow[]}
        userId={userId}
        userName={profile?.full_name || profile?.email || ""}
        doctors={(doctors ?? []) as DoctorRow[]}
        canManage={canEditInflu(access)}
        initialStage={initialStage}
      />
    </PageContainer>
  );
}
