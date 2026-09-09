import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { formatMonthKey } from "@/lib/format";
import {
  bangkokPeriodKey,
  getMembersWithStats,
  getRankingHistory,
} from "@/lib/queue/data";
import { requireAdmin } from "@/lib/queue/session";
import RankingClient from "./ranking-client";

export const metadata: Metadata = { title: "อันดับ Drag" };

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireAdmin();
  const { period } = await searchParams;
  const periodKey =
    period && PERIOD_PATTERN.test(period) ? period : bangkokPeriodKey();

  const [members, history] = await Promise.all([
    getMembersWithStats(),
    getRankingHistory(periodKey),
  ]);

  return (
    <>
      <PageHeader
        title="อันดับ Drag"
        description={formatMonthKey(periodKey)}
      />
      <RankingClient
        members={members
          .filter((m) => m.is_active)
          .map((m) => ({ id: m.id, display_name: m.display_name }))}
        periodKey={periodKey}
        history={history}
      />
    </>
  );
}
