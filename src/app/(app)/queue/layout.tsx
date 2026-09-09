import { UserRoundX } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccessNotice } from "@/components/access-notice";
import { EmptyState, PageContainer } from "@/components/ui";
import { getAccess } from "@/lib/access";
import { hasPermission } from "@/lib/permissions";
import { getQueueSession } from "@/lib/queue/session";
import { MEMBER_ROLE_LABEL } from "@/lib/queue/types";
import QueueNav from "./queue-nav";

/**
 * Sales Queue (ระบบคิวลูกค้าออนไลน์ของทีม Beauty Consult) — รวมเข้าแอปหลักเมื่อ 2026-09-09
 * (ผู้ใช้: "sales queue ก็รวมกับระบบทีมเลย เพราะยังไม่ได้ใช้จริงแล้วเป็นของแผนกเดียวกัน")
 * เดิมเป็นแอป Next แยกที่ `the-art-sales-assistant/queue` + Vercel project `the-art-sales-queue`
 *
 * ประตูของทุกหน้าในระบบคิว — อยู่ใต้ shell ของแอปหลัก (sidebar/แถบล่างเป็นของแอปหลัก)
 * จึงเหลือแค่แถบแท็บของระบบนี้ + guard สองชั้น:
 *   1. สิทธิ์เมนู `sales_queue` (แบบ Discord เหมือนเมนูอื่น — 0117 ให้ admin + สมาชิกทีมคิวเดิมไว้แล้ว)
 *      หรือเป็นสมาชิกทีมคิว/แอดมินตาม `sq_my_access` อยู่แล้ว (RLS/RPC ของ sq_* บังคับซ้ำที่ DB)
 *   2. ล็อกอินแล้วแต่ไม่ได้อยู่ในทีมคิว = บอกให้แอดมินเพิ่มที่หน้า "ทีม" (ไม่ใช่หน้าเปล่า)
 */
export default async function QueueLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [access, session] = await Promise.all([getAccess(), getQueueSession()]);
  if (!session) redirect("/login");

  // canViewAll ครอบแอดมินไว้แล้ว (แอดมินระบบหลักเข้าได้ตั้งแต่ครั้งแรก)
  const inTeam = Boolean(session.member?.is_active) || session.canViewAll;
  if (!hasPermission(access, "sales_queue") && !inTeam) return <AccessNotice />;

  return (
    <PageContainer>
      <QueueNav
        isAdmin={session.isAdmin}
        displayName={session.displayName}
        roleLabel={
          session.isAdmin
            ? "แอดมิน"
            : session.member
              ? MEMBER_ROLE_LABEL[session.member.role]
              : null
        }
      />
      {inTeam ? (
        children
      ) : (
        <EmptyState
          icon={<UserRoundX size={40} />}
          title="ยังไม่ได้อยู่ในทีมคิว"
          description="ให้แอดมินเพิ่มบัญชีนี้ที่หน้า “ทีม” ก่อนถึงจะเห็นคิวของตัวเอง"
        />
      )}
    </PageContainer>
  );
}
