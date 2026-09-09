import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getMembersWithStats, getProfileOptions } from "@/lib/queue/data";
import { getQueueSession } from "@/lib/queue/session";
import TeamClient from "./team-client";

export const metadata: Metadata = { title: "ทีม" };

export default async function TeamPage() {
  const session = await getQueueSession();
  if (!session) return null;

  const [members, profiles] = await Promise.all([
    getMembersWithStats(),
    // รายชื่อบัญชีทั้งหมดใช้เฉพาะตอนแอดมินเพิ่มสมาชิก — BC ไม่ต้องดึงมา
    session.isAdmin ? getProfileOptions() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="ทีม"
        description="น้ำหนักคิวมาจากอันดับ Drag ของเดือนนี้ (อันดับ 1–3 = x4, 4–5 = x2, ที่เหลือ = x1)"
      />
      <TeamClient
        members={members}
        profiles={profiles}
        isAdmin={session.isAdmin}
        myMemberId={session.member?.id ?? null}
      />
    </>
  );
}
