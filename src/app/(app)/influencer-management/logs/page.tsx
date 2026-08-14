import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canManageInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluActivityLogRow } from "@/lib/types";
import { LogsClient } from "./logs-client";

export const metadata: Metadata = {
  title: "ประวัติการใช้งาน Influencer",
};

/** จำนวน log ที่ดึงมาแสดง — ตารางนี้โตเรื่อยๆ จึงจำกัดไว้แล้วกรองฝั่ง client
    (ย้อนดูเก่ากว่านี้ให้เพิ่มปุ่มโหลดเพิ่ม/ตัวกรองช่วงวันที่ฝั่ง server ทีหลัง) */
const LOG_LIMIT = 500;

export default async function InfluLogsPage() {
  const supabase = await createClient();

  const [access, { data: logs, error }] = await Promise.all([
    getAccess(),
    supabase
      .from("influ_activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LOG_LIMIT),
  ]);

  // ประวัติการใช้งานเป็นเรื่องของผู้ดูแลระบบ Influ (Hunter/ดูเฉยๆ ไม่เห็น)
  if (!canManageInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <LogsClient
        logs={(logs ?? []) as InfluActivityLogRow[]}
        limit={LOG_LIMIT}
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
