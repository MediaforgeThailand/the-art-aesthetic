"use client";

import { AlertCircle, CheckCircle2, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { publishRanking } from "@/lib/queue/actions";
import type { RankingPeriodRow } from "@/lib/queue/data";
import {
  buildRankingPreview,
  isPreviewPublishable,
  type MemberOption,
} from "@/lib/queue/ranking";

/**
 * วางตาราง Drag จาก Sheet → เรียงอันดับตามกติกา → ประกาศ
 * การเรียงทำในเครื่อง อธิบายได้ทุกแถว (คอลัมน์ "เหตุผล") ไม่มีการสุ่มหรือเดา
 */

const ISSUE_TEXT: Record<string, string> = {
  unmatched: "ไม่พบชื่อนี้ในทีม",
  ambiguous: "ชื่อซ้ำกันหลายคน",
  duplicate: "ชื่อนี้ถูกใช้ไปแล้วในตาราง",
  missing_bills: "ไม่มีจำนวนบิล",
};

export default function RankingClient({
  members,
  periodKey,
  history,
}: {
  members: MemberOption[];
  periodKey: string;
  history: RankingPeriodRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [period, setPeriod] = useState(periodKey);
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<number | null>(null);

  const preview = useMemo(
    () => (raw.trim() ? buildRankingPreview(raw, members) : null),
    [raw, members]
  );

  // แถวที่จับชื่อไม่ได้ ให้แอดมินเลือกคนเองแทนการเดา
  const rows = useMemo(
    () =>
      preview?.rows.map((row) => {
        const override = overrides[row.sourceRow];
        return override
          ? { ...row, memberId: override, issue: null as null }
          : row;
      }) ?? [],
    [preview, overrides]
  );

  const usedTwice = new Set(
    rows
      .map((r) => r.memberId)
      .filter((id, index, all) => id && all.indexOf(id) !== index) as string[]
  );

  const publishable =
    preview !== null &&
    rows.length > 0 &&
    rows.every((r) => r.memberId !== null) &&
    usedTwice.size === 0 &&
    isPreviewPublishable({ ...preview, rows });

  function publish() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await publishRanking(
        period,
        rows.map((row) => ({
          member_id: row.memberId as string,
          rank: row.rank,
          drag_paid_bills: row.paidBills ?? 0,
          drag_net_sales: row.netSales ?? 0,
          cancel_count: preview.hasCancelColumn ? row.cancelCount : null,
          source_name: row.name,
          source_row: row.sourceRow,
        })),
        note.trim() || undefined
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPublished(result.version ?? null);
      setRaw("");
      setOverrides({});
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <Label htmlFor="period">เดือน</Label>
          <Input
            id="period"
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              // ดึงประวัติของเดือนที่เลือกมาแสดงด้วย — ไม่งั้นตารางล่างค้างอยู่เดือนเดิม
              if (e.target.value) {
                router.replace(`/queue/ranking?period=${e.target.value}`);
              }
            }}
          />
        </div>
        <div>
          <Label htmlFor="note">ที่มาของตาราง (ไม่บังคับ)</Label>
          <Input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ที่มาของตาราง"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="table">วางตารางจาก Sheet (คัดลอกทั้งบล็อกมาวางได้เลย)</Label>
        <Textarea
          id="table"
          rows={8}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOverrides({});
            setPublished(null);
          }}
          placeholder="ตาราง Drag"
          className="font-mono text-[13px]"
        />
      </div>

      {published !== null && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> ประกาศอันดับเรียบร้อย (เวอร์ชัน {published}) —
          คิวรอบถัดไปจะใช้น้ำหนักชุดใหม่
        </p>
      )}

      {preview && preview.errors.length > 0 && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {preview.errors.map((message) => (
            <p key={message} className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {message}
            </p>
          ))}
        </div>
      )}

      {preview && rows.length > 0 && (
        <div className="glass overflow-x-auto rounded-xl">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs text-stone-500">
                <th className="px-3 py-2 font-medium">อันดับ</th>
                <th className="px-3 py-2 font-medium">ชื่อในตาราง</th>
                <th className="px-3 py-2 font-medium">จับคู่กับ</th>
                <th className="px-3 py-2 text-right font-medium">บิล</th>
                <th className="px-3 py-2 text-right font-medium">ยอดสุทธิ</th>
                {preview.hasCancelColumn && (
                  <th className="px-3 py-2 text-right font-medium">ยกเลิก</th>
                )}
                <th className="px-3 py-2 font-medium">น้ำหนัก</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const duplicated = row.memberId && usedTwice.has(row.memberId);
                return (
                  <tr
                    key={row.sourceRow}
                    className="border-b border-brand-50 last:border-0"
                  >
                    <td className="px-3 py-2 font-semibold tabular-nums text-stone-800">
                      {row.rank}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-stone-800">{row.name}</span>
                      {row.tiebreak && (
                        <span className="block text-xs text-stone-400">{row.tiebreak}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.memberId && !duplicated ? (
                        <span className="text-stone-700">
                          {members.find((m) => m.id === row.memberId)?.display_name ?? "—"}
                        </span>
                      ) : (
                        <Select
                          aria-label={`จับคู่ ${row.name}`}
                          value={row.memberId ?? ""}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [row.sourceRow]: e.target.value,
                            }))
                          }
                          className="w-auto min-w-40 py-1 text-xs"
                        >
                          <option value="">
                            {ISSUE_TEXT[row.issue ?? "unmatched"] ?? "เลือกคน"}
                          </option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.display_name}
                            </option>
                          ))}
                        </Select>
                      )}
                      {duplicated && (
                        <span className="ml-2 text-xs text-rose-600">ซ้ำ</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-stone-700">
                      {row.paidBills ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-stone-700">
                      {row.netSales == null ? "—" : formatNumber(row.netSales)}
                    </td>
                    {preview.hasCancelColumn && (
                      <td className="px-3 py-2 text-right tabular-nums text-stone-700">
                        {row.cancelCount ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Badge className="bg-brand-50 text-brand-700">x{row.weight}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview && preview.skippedLines.length > 0 && (
        <p className="text-xs text-stone-500">
          ข้ามบรรทัดที่อ่านไม่ออก {preview.skippedLines.length} บรรทัด
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {preview && (
        <div className="flex justify-end">
          <Button loading={pending} disabled={!publishable} onClick={publish}>
            <Trophy size={16} /> ประกาศอันดับเดือนนี้
          </Button>
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-2">
          <h2 className="mb-2 text-sm font-semibold text-stone-800">
            ที่ประกาศไปแล้ว
          </h2>
          <div className="space-y-2">
            {history.map((version) => (
              <div key={version.id} className="glass-soft rounded-xl px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <Badge className="bg-brand-50 text-brand-700">
                    เวอร์ชัน {version.version}
                  </Badge>
                  {version.published_at && (
                    <span>
                      {new Date(version.published_at).toLocaleString("th-TH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Bangkok",
                      })}
                    </span>
                  )}
                  {version.source_note && <span>· {version.source_note}</span>}
                </div>
                <ol className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700">
                  {version.entries.map((entry) => (
                    <li key={entry.member_id} className="tabular-nums">
                      <span className="text-stone-400">{entry.rank}.</span>{" "}
                      {entry.member_name}{" "}
                      <span className="text-xs text-brand-600">x{entry.weight}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
