"use client";

import {
  BellRing,
  CheckCircle2,
  FileSignature,
  Phone,
  Plus,
  Search,
  Sparkles,
  Timer,
  UsersRound,
  X,
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
} from "@/components/ui";
import { formatDate, formatNumber, todayISO } from "@/lib/format";
import {
  contractEndDate,
  INFLU_STAGES,
  INFLU_TIERS,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluencerRow, InfluTaskRow } from "@/lib/types";

export function influName(i: InfluencerRow): string {
  const full = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return i.nickname ? `${full} (${i.nickname})` : full;
}

type TaskLite = Pick<
  InfluTaskRow,
  "influencer_id" | "due_date" | "done" | "done_at"
>;

/** สถิติ follow up ต่อ influ: งานเกินกำหนด, กำหนดถัดไป, follow ล่าสุด */
type InfluStats = {
  overdue: number;
  nextDue: string | null;
  lastDone: string | null;
  pending: number;
};

/** ชิป countdown แจ้งเตือน follow up — 2 สัปดาห์ / 1 สัปดาห์ / 3,2,1 วัน / เกินกำหนด */
function FollowupCountdownChip({
  daysUntil,
  overdueCount,
}: {
  daysUntil: number;
  overdueCount: number;
}) {
  if (daysUntil < 0) {
    return (
      <Badge className="border border-rose-300 bg-rose-100 font-semibold text-rose-700 animate-fade-in">
        <BellRing size={11} /> เกินกำหนด {Math.abs(daysUntil)} วัน
        {overdueCount > 1 && ` (${overdueCount} งาน)`}
      </Badge>
    );
  }
  if (daysUntil === 0) {
    return (
      <Badge className="border border-rose-300 bg-rose-50 font-semibold text-rose-600">
        <BellRing size={11} /> Follow up วันนี้
      </Badge>
    );
  }
  if (daysUntil <= 3) {
    return (
      <Badge className="border border-amber-300 bg-amber-100 font-semibold text-amber-800">
        <BellRing size={11} /> Follow up อีก {daysUntil} วัน
      </Badge>
    );
  }
  if (daysUntil <= 7) {
    return (
      <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
        <Timer size={11} /> อีก {daysUntil} วัน
      </Badge>
    );
  }
  if (daysUntil <= 14) {
    return (
      <Badge className="border border-sky-200 bg-sky-50 text-sky-700">
        <Timer size={11} /> อีก {daysUntil} วัน
      </Badge>
    );
  }
  return null;
}

/** ชิปอายุสัญญาบนแถว — เขียวปกติ / เหลือง ≤30 วัน / แดงหมดแล้ว */
function ContractChip({
  contractStart,
  months,
  today,
}: {
  contractStart: string;
  months: number;
  today: string;
}) {
  const end = contractEndDate(contractStart, months);
  const daysLeft = Math.round(
    (new Date(end).getTime() - new Date(today).getTime()) / 86400000
  );
  if (daysLeft < 0) {
    return (
      <Badge className="border border-rose-200 bg-rose-50 text-rose-600">
        <FileSignature size={11} /> สัญญาหมดแล้ว
      </Badge>
    );
  }
  return (
    <span title={`สัญญาถึง ${formatDate(end)}`}>
      <Badge
        className={
          daysLeft <= 30
            ? "border border-amber-200 bg-amber-50 text-amber-700"
            : "border border-emerald-200 bg-emerald-50 text-emerald-700"
        }
      >
        <FileSignature size={11} /> สัญญาเหลือ {formatNumber(daysLeft)} วัน
      </Badge>
    </span>
  );
}

export function InfluencersClient({
  influencers,
  tasks,
  loadError,
}: {
  influencers: InfluencerRow[];
  tasks: TaskLite[];
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<number | "all" | "done">(
    "all"
  );

  const dayDiff = (dateISO: string) =>
    Math.round(
      (new Date(dateISO).getTime() - new Date(today).getTime()) / 86400000
    );

  /* สถิติ follow up ต่อคน: เกินกำหนดกี่งาน, งานถัดไปครบกำหนดเมื่อไหร่, follow ล่าสุดเมื่อไหร่ */
  const statsByInflu = useMemo(() => {
    const map = new Map<string, InfluStats>();
    for (const t of tasks) {
      const s =
        map.get(t.influencer_id) ??
        ({ overdue: 0, nextDue: null, lastDone: null, pending: 0 } as InfluStats);
      if (!t.done) {
        s.pending += 1;
        if (t.due_date) {
          if (t.due_date < today) s.overdue += 1;
          if (!s.nextDue || t.due_date < s.nextDue) s.nextDue = t.due_date;
        }
      } else if (t.done_at && (!s.lastDone || t.done_at > s.lastDone)) {
        s.lastDone = t.done_at;
      }
      map.set(t.influencer_id, s);
    }
    return map;
  }, [tasks, today]);

  const totalDue = useMemo(() => {
    let n = 0;
    for (const t of tasks) {
      if (!t.done && t.due_date && t.due_date <= today) n += 1;
    }
    return n;
  }, [tasks, today]);

  /* เรียงตามความเร่งด่วน:
     1) เกินกำหนด/ครบวันนี้ (เกินมากสุดขึ้นก่อน)  2) ใกล้ครบกำหนด (≤14 วัน, ใกล้ก่อน)
     3) กำลังดีล (stage 1-5, ใหม่ก่อน)            4) follow แล้ว/รอรอบถัดไป (follow ล่าสุดก่อน)
     5) จบงานแล้ว */
  const orderKey = (i: InfluencerRow): [number, number] => {
    if (i.completed) return [4, 0];
    if (i.stage === 6) {
      const s = statsByInflu.get(i.id);
      const du = s?.nextDue ? dayDiff(s.nextDue) : null;
      if (du !== null && du <= 0) return [0, du];
      if (du !== null && du <= 14) return [1, du];
      return [3, s?.lastDone ? -Date.parse(s.lastDone) : 0];
    }
    return [2, -Date.parse(i.created_at)];
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return influencers
      .filter((i) => {
        if (stageFilter === "done" && !i.completed) return false;
        if (typeof stageFilter === "number") {
          if (i.completed || i.stage !== stageFilter) return false;
        }
        if (q === "") return true;
        return (
          influName(i).toLowerCase().includes(q) ||
          (i.phone ?? "").includes(q) ||
          (i.procedure_text ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const [ga, va] = orderKey(a);
        const [gb, vb] = orderKey(b);
        return ga !== gb ? ga - gb : va - vb;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [influencers, search, stageFilter, statsByInflu, today]);

  /* ---- modal เพิ่ม influ (stage 1: ชื่อ นามสกุล เบอร์) ---- */
  const [addOpen, setAddOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    const { data, error } = await supabase
      .from("influencers")
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setFormError(`บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    setAddOpen(false);
    router.push(`/influencers/${data.id}`);
    router.refresh();
  };

  const stageChips: { key: number | "all" | "done"; label: string }[] = [
    { key: "all", label: "ทั้งหมด" },
    ...INFLU_STAGES.map((s) => ({ key: s.step, label: `${s.step}. ${s.short}` })),
    { key: "done", label: "จบงานแล้ว" },
  ];

  const countFor = (key: number | "all" | "done") =>
    key === "all"
      ? influencers.length
      : key === "done"
        ? influencers.filter((i) => i.completed).length
        : influencers.filter((i) => !i.completed && i.stage === key).length;

  return (
    <>
      <PageHeader
        title="Influ Management"
        description="จัดการ Influencer ตั้งแต่ติดต่อ → Memo อนุมัติ → เซนสัญญา → Follow up งาน"
        action={
          <div className="flex gap-2">
            <Link
              href="/influencers/contracts"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white/70 px-4 py-2 text-sm font-medium text-brand-700 transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97]"
            >
              <FileSignature size={16} />
              อายุสัญญา & Campaign
            </Link>
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} />
              เพิ่ม Influencer
            </Button>
          </div>
        }
      />

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}

      {totalDue > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 animate-fade-in">
          <BellRing size={16} className="shrink-0" />
          มีงาน follow up ถึงกำหนดแล้ว {formatNumber(totalDue)} รายการ —
          รายชื่อที่ต้องตามมีป้ายเตือนสีเหลืองด้านล่าง
        </div>
      )}

      {/* ค้นหา + กรอง stage */}
      <div className="mb-4 flex flex-wrap items-center gap-3 animate-fade-in-up">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            type="search"
            placeholder="ค้นหาชื่อ เบอร์ หรือหัตถการ..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stageChips.map((chip) => {
            const active = stageFilter === chip.key;
            const count = countFor(chip.key);
            return (
              <button
                key={String(chip.key)}
                type="button"
                onClick={() => setStageFilter(chip.key)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.95] ${
                  active
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                    : "border border-brand-200 bg-white/70 text-stone-600 hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                {chip.label}
                <span className={active ? "opacity-80" : "text-stone-400"}>
                  {" "}
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
        {(search !== "" || stageFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStageFilter("all");
            }}
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-stone-400 transition-colors hover:text-brand-700"
          >
            <X size={14} />
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {influencers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={40} strokeWidth={1.5} />}
            title="ยังไม่มี Influencer ในระบบ"
            description="เริ่มจากเพิ่มรายชื่อที่กำลังติดต่อ แล้วเดินงานทีละ stage จนจบสัญญา"
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={16} />
                เพิ่ม Influencer คนแรก
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={40} strokeWidth={1.5} />}
            title="ไม่พบรายชื่อที่ตรงกับตัวกรอง"
            description="ลองเปลี่ยนคำค้นหาหรือ stage"
          />
        </Card>
      ) : (
        <div className="grid gap-3 animate-fade-in-up">
          {filtered.map((i) => {
            const stats = statsByInflu.get(i.id);
            const nextDueDays =
              i.stage === 6 && stats?.nextDue ? dayDiff(stats.nextDue) : null;
            const daysSinceDone =
              stats?.lastDone != null
                ? Math.max(0, -dayDiff(stats.lastDone.slice(0, 10)))
                : null;
            const stageInfo = INFLU_STAGES.find((s) => s.step === i.stage);
            // ขอบสีแยกกลุ่ม: stage 6 (มาใช้บริการแล้ว) = ขอบ brand, จบงาน = ขอบเขียว, กำลังดีล = ปกติ
            const borderClass = i.completed
              ? "!border-emerald-300/70"
              : i.stage === 6
                ? "!border-brand-400/70"
                : "";
            return (
              <Link key={i.id} href={`/influencers/${i.id}`}>
                <Card
                  className={`p-4 transition-transform hover:-translate-y-0.5 ${borderClass}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-sm font-semibold text-cream">
                      {i.first_name.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-stone-900">
                          {influName(i)}
                        </p>
                        {i.tier && (
                          <Badge className={INFLU_TIERS[i.tier].badge}>
                            {INFLU_TIERS[i.tier].label}
                          </Badge>
                        )}
                        {/* countdown แจ้งเตือน follow up (เฉพาะ stage 6 ที่ยังไม่ปิดงาน) */}
                        {!i.completed && nextDueDays !== null && (
                          <FollowupCountdownChip
                            daysUntil={nextDueDays}
                            overdueCount={stats?.overdue ?? 0}
                          />
                        )}
                        {/* follow แล้ว — โชว์เมื่อไม่มีงานจ่อ (เกิน 14 วัน หรือครบหมดแล้ว) */}
                        {!i.completed &&
                          i.stage === 6 &&
                          (nextDueDays === null || nextDueDays > 14) &&
                          daysSinceDone !== null && (
                            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                              <CheckCircle2 size={11} /> follow แล้ว ·{" "}
                              {daysSinceDone === 0
                                ? "วันนี้"
                                : `${daysSinceDone} วันก่อน`}
                            </Badge>
                          )}
                        {/* อายุสัญญาโชว์บนแถวเลย */}
                        {i.contract_start && (
                          <ContractChip
                            contractStart={i.contract_start}
                            months={i.contract_months}
                            today={today}
                          />
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                        {i.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone size={11} /> {i.phone}
                          </span>
                        )}
                        {i.procedure_text && (
                          <span className="max-w-72 truncate">
                            {i.procedure_text}
                          </span>
                        )}
                        {i.service_date && (
                          <span>รับบริการ {formatDate(i.service_date)}</span>
                        )}
                      </p>
                    </div>

                    {/* mini stepper */}
                    <div className="hidden shrink-0 items-center gap-1 sm:flex">
                      {INFLU_STAGES.map((s) => (
                        <span
                          key={s.step}
                          title={s.title}
                          className={`h-2 w-6 rounded-full ${
                            i.completed || i.stage > s.step
                              ? "bg-emerald-400"
                              : i.stage === s.step
                                ? "bg-gradient-to-r from-brand-400 to-brand-600"
                                : "bg-stone-200"
                          }`}
                        />
                      ))}
                    </div>
                    <Badge
                      className={
                        i.completed
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-brand-50 text-brand-700"
                      }
                    >
                      {i.completed
                        ? "จบงานแล้ว"
                        : `${i.stage}. ${stageInfo?.short ?? ""}`}
                    </Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* modal เพิ่ม influ — stage 1 เก็บแค่ ชื่อ นามสกุล เบอร์ */}
      <Modal
        open={addOpen}
        onClose={() => !saving && setAddOpen(false)}
        title="เพิ่ม Influencer (เริ่มติดต่อ)"
      >
        <form onSubmit={(e) => void handleAdd(e)} className="space-y-4">
          <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
            <UsersRound size={14} className="shrink-0" />
            Stage 1: กรอกแค่ชื่อกับเบอร์ติดต่อพอ — รายละเอียดเคสไปกรอกใน stage
            ถัดไปหลังยืนยันร่วมงาน
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inf-first">ชื่อ *</Label>
              <Input
                id="inf-first"
                required
                disabled={saving}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="เช่น ภานุเดช"
              />
            </div>
            <div>
              <Label htmlFor="inf-last">นามสกุล</Label>
              <Input
                id="inf-last"
                disabled={saving}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="เช่น อินทร์ศรี"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="inf-phone">เบอร์โทรติดต่อ</Label>
            <Input
              id="inf-phone"
              disabled={saving}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </div>
          {formError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setAddOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit" loading={saving} disabled={!firstName.trim()}>
              เพิ่มและเปิดหน้าเดินงาน
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
