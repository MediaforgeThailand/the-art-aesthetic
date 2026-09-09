import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SqMember } from "./types";

/**
 * สิทธิ์ถูกบังคับจริงสองชั้น: RLS/RPC ที่ฐานข้อมูล และตัวช่วยชุดนี้ที่ฝั่ง server
 * การซ่อนปุ่มใน UI ไม่นับเป็นการบังคับสิทธิ์ (ข้อ 5.3)
 */

export type QueueSession = {
  userId: string;
  email: string | null;
  member: SqMember | null;
  /** แก้ไขข้อมูลได้ทั้งระบบ */
  isAdmin: boolean;
  /** เห็นคิวของทั้งทีมได้ — แอดมิน หรือบทบาท "ผู้ดูอย่างเดียว" */
  canViewAll: boolean;
  displayName: string;
};

type AccessRow = {
  user_id: string | null;
  is_admin: boolean | null;
  can_view_all: boolean | null;
  profile_role: string | null;
  display_name: string | null;
  member: SqMember | null;
};

export async function getQueueSession(): Promise<QueueSession | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  // อ่านสิทธิ์ครั้งเดียวจาก RPC และห้ามกลืน error
  // เคสจริง: PostgREST ตอบ 401 (PGRST303) ชั่วคราวระหว่างอ่าน profiles
  // โค้ดเดิมอ่าน error เป็น "ไม่มีสิทธิ์" เงียบๆ แอดมินตัวจริงเลยเจอหน้า "ยังไม่ได้อยู่ในทีมคิว"
  let access: AccessRow | null = null;
  let lastError: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: row, error } = await supabase.rpc("sq_my_access");
    if (!error) {
      // RPC คืน jsonb (type Json) — shape จริงคือ AccessRow ที่ sq_my_access ประกอบให้
      access = row as unknown as AccessRow | null;
      lastError = null;
      break;
    }
    lastError = error;
  }
  if (lastError || !access) {
    // ไม่ใส่ข้อมูลผู้ใช้ลง error (ข้อ 5.2) — ให้เห็นแค่สาเหตุจากฝั่งฐานข้อมูล
    throw new Error(
      `อ่านสิทธิ์ผู้ใช้ไม่สำเร็จ${lastError?.code ? ` (${lastError.code})` : ""}: ${
        lastError?.message ?? "ไม่มีข้อมูลตอบกลับ"
      }`,
    );
  }

  const claimEmail = (claims.email as string | undefined) ?? null;

  return {
    userId: claims.sub,
    email: claimEmail,
    member: access.member ?? null,
    // แอดมินระบบหลักเข้าได้ตั้งแต่ครั้งแรกโดยไม่ต้องมีใครเพิ่มให้ก่อน (bootstrap)
    isAdmin: access.is_admin === true,
    canViewAll: access.can_view_all === true,
    displayName: access.display_name ?? claimEmail ?? "ผู้ใช้",
  };
}

export async function requireQueueSession(): Promise<QueueSession> {
  const session = await getQueueSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<QueueSession> {
  const session = await requireQueueSession();
  if (!session.isAdmin) redirect("/queue");
  return session;
}
