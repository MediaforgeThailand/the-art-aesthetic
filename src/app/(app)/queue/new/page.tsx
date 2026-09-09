import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getOnlineChannels } from "@/lib/queue/data";
import { requireAdmin } from "@/lib/queue/session";
import NewCaseClient from "./new-client";

export const metadata: Metadata = { title: "วางข้อมูลลูกค้า" };

export default async function NewCasePage() {
  await requireAdmin();
  const onlineChannels = await getOnlineChannels();

  return (
    <>
      <PageHeader title="วางข้อมูลลูกค้า" />
      <NewCaseClient onlineChannels={onlineChannels} />
    </>
  );
}
