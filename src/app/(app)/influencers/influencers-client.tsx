"use client";

import {
  BellRing,
  FileSignature,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
} from "@/components/ui";
import { STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { formatNumber, todayISO } from "@/lib/format";
import { INFLU_STAGES, sizeGroupFromFollowers } from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluSizeGroup } from "@/lib/types";
import {
  boardPos,
  InfluBoard,
  influName,
  type InfluencerListRow,
  type InfluStats,
  type InfluTaskLite,
} from "./influ-board";

// ที่อยู่ใหม่ของ type/helper อยู่ใน influ-board.tsx — re-export ให้หน้าอื่น (influ-gallery) import ได้เหมือนเดิม
export { influName } from "./influ-board";
export type { InfluencerListRow } from "./influ-board";

export function InfluencersClient({
  influencers,
  tasks,
  loadError,
}: {
  influencers: InfluencerListRow[];
  tasks: InfluTaskLite[];
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  // สำเนา state ฝั่งจอ — ลบ/ลากแล้วเห็นผลทันที (optimistic) แล้วค่อย sync กับ server
  const [items, setItems] = useState<InfluencerListRow[]>(influencers);
  useEffect(() => setItems(influencers), [influencers]);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<number | "all" | "done">(
    "all"
  );

  // ลบ influencer
  const [deleteTarget, setDeleteTarget] = useState<InfluencerListRow | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** ลบไฟล์ใน storage ของ influencer (best-effort) — รูป/memo/สัญญา */
  const cleanupStorage = async (influId: string) => {
    const store = supabase.storage.from(STORAGE_BUCKET_DOCUMENTS);
    for (const prefix of [
      `influencers/${influId}`,
      `influencers/${influId}/memo`,
      `influencers/${influId}/contract`,
    ]) {
      try {
        const { data } = await store.list(prefix, { limit: 1000 });
        const paths = (data ?? [])
          .filter((o) => o.id) // เฉพาะไฟล์จริง ไม่ใช่ชื่อโฟลเดอร์ย่อย
          .map((o) => `${prefix}/${o.name}`);
        if (paths.length > 0) await store.remove(paths);
      } catch {
        // เพิกเฉย — ลบ record สำเร็จแล้ว ไฟล์ค้างไม่กระทบการใช้งาน
      }
    }
  };

  const handleDelete = async (target: InfluencerListRow) => {
    setDeletingId(target.id);
    setActionError(null);
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== target.id)); // optimistic
    const { error } = await supabase
      .from("influencers")
      .delete()
      .eq("id", target.id);
    if (error) {
      setItems(prev); // คืนค่าถ้าลบไม่สำเร็จ
      setActionError(`ลบไม่สำเร็จ: ${error.message}`);
      setDeletingId(null);
      return;
    }
    void cleanupStorage(target.id); // fire-and-forget หลังลบ record สำเร็จ
    setDeletingId(null);
    router.refresh();
  };

  /** ลากการ์ดวางเสร็จ — บันทึกกลุ่มขนาด (override เมื่อไม่ตรง auto) + ลำดับในคอลัมน์ */
  const moveInflu = async (
    id: string,
    group: InfluSizeGroup,
    prevId: string | null,
    nextId: string | null
  ) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    const prevPos = prevId
      ? (() => {
          const p = items.find((i) => i.id === prevId);
          return p ? boardPos(p) : null;
        })()
      : null;
    const nextPos = nextId
      ? (() => {
          const n = items.find((i) => i.id === nextId);
          return n ? boardPos(n) : null;
        })()
      : null;
    let position: number;
    if (prevPos !== null && nextPos !== null) position = (prevPos + nextPos) / 2;
    else if (prevPos !== null) position = prevPos + 1;
    else if (nextPos !== null) position = nextPos - 1;
    else position = 0;
    // วางในกลุ่มเดียวกับที่ followers จัดให้อยู่แล้ว = กลับเป็นอัตโนมัติ (ไม่เก็บ override)
    const sizeGroup: InfluSizeGroup | null =
      group === sizeGroupFromFollowers(target.followers) ? null : group;

    const prevItems = items;
    setItems((cur) =>
      cur.map((i) =>
        i.id === id
          ? { ...i, size_group: sizeGroup, board_position: position }
          : i
      )
    );
    const { error } = await supabase
      .from("influencers")
      .update({ size_group: sizeGroup, board_position: position })
      .eq("id", id);
    if (error) {
      setItems(prevItems);
      setActionError(`ย้ายการ์ดไม่สำเร็จ: ${error.message}`);
    }
  };

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

  /* กรองค้นหา + stage — ลำดับในคอลัมน์บอร์ดจัดตาม board_position (ลากเรียงเอง) */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
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
    });
  }, [items, search, stageFilter]);

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
      ? items.length
      : key === "done"
        ? items.filter((i) => i.completed).length
        : items.filter((i) => !i.completed && i.stage === key).length;

  return (
    <>
      <PageHeader
        title="Influ Management"
        description="บอร์ด Influencer แบ่งตามขนาดผู้ติดตาม — ลากการ์ดย้ายกลุ่ม/เรียงลำดับได้ คลิกการ์ดเพื่อเดินงานทีละ stage"
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
          การ์ดที่ต้องตามมีป้ายเตือนสีเหลือง/แดงบนบอร์ด
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

      {actionError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {actionError}
        </div>
      )}

      {items.length === 0 ? (
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
        <InfluBoard
          items={filtered}
          statsByInflu={statsByInflu}
          today={today}
          deletingId={deletingId}
          onOpen={(i) => router.push(`/influencers/${i.id}`)}
          onDelete={(i) => {
            setActionError(null);
            setDeleteTarget(i);
          }}
          onMove={(id, group, prevId, nextId) =>
            void moveInflu(id, group, prevId, nextId)
          }
        />
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

      {/* ยืนยันลบ influencer */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบ Influencer"
        message={
          <>
            ลบ{" "}
            <span className="font-medium text-stone-800">
              {deleteTarget ? influName(deleteTarget) : ""}
            </span>{" "}
            ออกจากระบบถาวร? ข้อมูลทุก stage — follow-up, ลายเซน, สัญญา,
            แคมเปญ และไฟล์ที่อัปโหลด — จะถูกลบทั้งหมด (กู้คืนไม่ได้)
            ส่วนงานคอนเทนต์ที่เคยผูกไว้จะยังอยู่ แต่ไม่ผูกกับ influencer คนนี้แล้ว
          </>
        }
        confirmLabel="ลบถาวร"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
