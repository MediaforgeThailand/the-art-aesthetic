"use client";

import {
  ArrowLeft,
  CalendarRange,
  FileSignature,
  Megaphone,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import { contractEndDate, INFLU_TIERS } from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluCampaignRow, InfluencerRow } from "@/lib/types";

export function ContractsClient({
  influencers,
  campaigns,
  canEdit,
}: {
  influencers: InfluencerRow[];
  campaigns: InfluCampaignRow[];
  /** ระดับ "ดูเฉยๆ" = เพิ่ม Sub Campaign ไม่ได้ (ดูอายุสัญญาได้ตามปกติ) */
  canEdit: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  const rows = useMemo(
    () =>
      influencers.map((i) => {
        const end = contractEndDate(i.contract_start!, i.contract_months);
        const total =
          new Date(end).getTime() - new Date(i.contract_start!).getTime();
        const used = new Date(today).getTime() - new Date(i.contract_start!).getTime();
        const daysLeft = Math.ceil(
          (new Date(end).getTime() - new Date(today).getTime()) / 86400000
        );
        return {
          influ: i,
          end,
          daysLeft,
          expired: daysLeft < 0,
          usedPct: total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 100,
          campaigns: campaigns.filter((c) => c.influencer_id === i.id),
        };
      }),
    [influencers, campaigns, today]
  );

  /* ---- modal add sub campaign ---- */
  const [target, setTarget] = useState<InfluencerRow | null>(null);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = (i: InfluencerRow) => {
    setTarget(i);
    setName("");
    setDetail("");
    setDate("");
    setError(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || saving) return;
    setSaving(true);
    const { error: err } = await supabase.from("influ_campaigns").insert({
      influencer_id: target.id,
      name: name.trim(),
      detail: detail.trim() || null,
      campaign_date: date === "" ? null : date,
    });
    setSaving(false);
    if (err) {
      setError(`บันทึกไม่สำเร็จ: ${err.message}`);
      return;
    }
    setTarget(null);
    router.refresh();
  };

  return (
    <>
      <PageHeader
        title="อายุสัญญา Influencer & Sub Campaign"
        description="สัญญาใช้คอนเทนต์ 6 เดือนนับจากวันเซนครบ — เรียกร่วม campaign ได้เฉพาะคนที่สัญญายังไม่หมด"
        action={
          <Link
            href="/influencers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-4 py-2 text-sm font-medium text-brand-700 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            กลับหน้ารายชื่อ
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileSignature size={40} strokeWidth={1.5} />}
            title="ยังไม่มี Influencer ที่เซนสัญญา"
            description="เมื่ออัพโหลดไฟล์สัญญาที่เซนแล้วในขั้น 'เซนสัญญา + วันรับบริการ' ระบบจะเริ่มนับสัญญา 6 เดือนและแสดงที่นี่"
          />
        </Card>
      ) : (
        <div className="grid gap-3 animate-fade-in-up">
          {rows.map(({ influ: i, end, daysLeft, expired, usedPct, campaigns: camps }) => (
            <Card key={i.id} className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-sm font-semibold text-cream">
                  {i.first_name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/influencers/${i.id}`}
                    className="font-medium text-stone-900 hover:text-brand-700 hover:underline"
                  >
                    คุณ{i.first_name} {i.last_name}
                    {i.nickname && ` (${i.nickname})`}
                  </Link>
                  <p className="text-xs text-stone-500">
                    <CalendarRange size={11} className="mr-1 inline" />
                    สัญญา {formatDate(i.contract_start)} – {formatDate(end)}
                  </p>
                </div>
                {i.tier && (
                  <Badge className={INFLU_TIERS[i.tier].badge}>
                    {INFLU_TIERS[i.tier].label}
                  </Badge>
                )}
                <Badge
                  className={
                    expired
                      ? "border border-rose-200 bg-rose-50 text-rose-600"
                      : daysLeft <= 30
                        ? "border border-amber-200 bg-amber-50 text-amber-700"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }
                >
                  {expired
                    ? "สัญญาหมดแล้ว"
                    : `เหลืออีก ${formatNumber(daysLeft)} วัน`}
                </Badge>
                <div className="ml-auto">
                  <Button
                    variant="secondary"
                    disabled={expired || !canEdit}
                    onClick={() => openAdd(i)}
                    title={
                      expired
                        ? "สัญญาหมดอายุแล้ว — เรียกร่วม campaign ไม่ได้"
                        : canEdit
                          ? "เพิ่ม Sub Campaign"
                          : "บัญชีนี้เป็นระดับ 'ดูเฉยๆ' — เพิ่ม campaign ไม่ได้"
                    }
                  >
                    <Plus size={15} />
                    Add Sub Campaign
                  </Button>
                </div>
              </div>

              {/* แถบเวลาใช้สัญญา */}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200/70">
                <div
                  className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${
                    expired
                      ? "from-rose-400 to-rose-500"
                      : daysLeft <= 30
                        ? "from-amber-400 to-amber-500"
                        : "from-emerald-400 to-emerald-500"
                  }`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>

              {camps.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {camps.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm"
                    >
                      <Megaphone size={14} className="shrink-0 text-brand-500" />
                      <span className="font-medium text-stone-800">
                        {c.name}
                      </span>
                      {c.campaign_date && (
                        <span className="text-xs text-stone-400">
                          {formatDate(c.campaign_date)}
                        </span>
                      )}
                      {c.detail && (
                        <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                          {c.detail}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={target !== null}
        onClose={() => !saving && setTarget(null)}
        title={`Add Sub Campaign — คุณ${target?.first_name ?? ""}${target?.nickname ? ` (${target.nickname})` : ""}`}
      >
        <form onSubmit={(e) => void handleAdd(e)} className="space-y-4">
          <div>
            <Label htmlFor="c-name">ชื่อ Campaign *</Label>
            <Input
              id="c-name"
              required
              disabled={saving}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น แคมเปญเปิดตัวสาขาสยาม"
            />
          </div>
          <div>
            <Label htmlFor="c-date">วันจัด Campaign</Label>
            <Input
              id="c-date"
              type="date"
              disabled={saving}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="c-detail">รายละเอียด</Label>
            <Textarea
              id="c-detail"
              rows={2}
              disabled={saving}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="งานที่อยากให้ร่วม เช่น ถ่ายคลิปรีวิวในงาน..."
            />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setTarget(null)}
            >
              ยกเลิก
            </Button>
            <Button type="submit" loading={saving} disabled={!name.trim()}>
              <Megaphone size={15} />
              เพิ่ม Campaign
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
