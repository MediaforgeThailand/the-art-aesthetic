import type { Metadata } from "next";
import { AccessNotice } from "@/components/access-notice";
import { PageContainer } from "@/components/ui";
import { canManageInflu, getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { InfluDeletedBackupRow } from "@/lib/types";
import { TrashClient, type TrashBackup } from "./trash-client";

export const metadata: Metadata = {
  title: "ถังขยะ Influencer",
};

export default async function InfluTrashPage() {
  const supabase = await createClient();

  const [access, { data: backups, error }] = await Promise.all([
    getAccess(),
    // ไม่ดึง payload (jsonb ก้อนใหญ่ — มีลายเซน base64 ของทั้งเคส) มาที่หน้า list
    // จำนวนข้อมูลลูกอ่านจาก payload ตอนกู้คืนฝั่ง DB อยู่แล้ว
    supabase
      .from("influ_deleted_backups")
      .select(
        "id, entity, entity_id, label, deleted_by, deleted_by_name, deleted_at, purge_after, restored_at"
      )
      .order("deleted_at", { ascending: false }),
  ]);

  // ถังขยะ = งานผู้ดูแลระบบ Influ (Hunter ลบได้แต่กู้คืนต้องผ่านผู้ดูแล)
  if (!canManageInflu(access)) return <AccessNotice />;

  return (
    <PageContainer>
      <TrashClient
        backups={
          (backups ?? []) as Omit<InfluDeletedBackupRow, "payload" | "restored_by">[] as TrashBackup[]
        }
        loadError={error?.message ?? null}
      />
    </PageContainer>
  );
}
