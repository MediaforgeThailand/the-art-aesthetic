import { Lock } from "lucide-react";
import { EmptyState, PageContainer } from "@/components/ui";

/** หน้าจอ "ไม่มีสิทธิ์" — ใช้เมื่อ guard ของเพจตรวจแล้วไม่ผ่าน (server component) */
export function AccessNotice({
  title = "ยังไม่มีสิทธิ์เข้าถึงส่วนนี้",
  description = "บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าถึงหน้านี้ — ติดต่อผู้ดูแลระบบเพื่อขอเปิดสิทธิ์การใช้งาน",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <PageContainer>
      <EmptyState
        icon={<Lock size={40} />}
        title={title}
        description={description}
      />
    </PageContainer>
  );
}
