"use client";

/**
 * จัดการโปรไฟล์ (ตัวบุคคล) — ผู้ดูแลระบบ Influ เท่านั้น
 *
 * **กติกาที่ต้องรักษา: ห้ามรวมโปรไฟล์อัตโนมัติจากชื่อ** — หน้านี้เสนอ "คู่ที่น่าจะซ้ำ"
 * (ชื่อเล่นตรงกัน หรือ ชื่อ+นามสกุลตรงกัน) ไว้ให้ดูเฉยๆ คนกดยืนยันเป็นคนตัดสินทีละคู่
 * เพราะชื่อซ้ำ ≠ คนเดียวกัน (ชื่อเล่นอย่าง "มายด์"/"บีม" ซ้ำกันเป็นเรื่องปกติ)
 *
 * รหัสที่รอดหลังรวม = **รหัสเก่ากว่า (เลขน้อยกว่า)** ตามคำสั่งผู้ใช้ 2026-09-03 —
 * RPC `influ_merge_profiles` เป็นคนเลือกให้ ฝั่งนี้แค่แสดงให้เห็นก่อนกดยืนยัน
 */

import { Merge, Search, Trash2, UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
} from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { InfluLogActor } from "@/influ/lib/influ-log";
import type { InfluProfileRow } from "@/lib/types";

/** เคส (ย่อ) — ใช้แค่นับรอบต่อโปรไฟล์และบอกว่าเป็นข้อมูลเก่าหรือเปล่า */
export type ProfileCaseLite = {
  id: string;
  person_id: string;
  round_no: number;
  influ_code: string | null;
  archived: boolean;
  completed: boolean;
  declined_at: string | null;
};

function profileLabel(p: InfluProfileRow): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return p.nickname ? `${p.nickname}${full ? ` (${full})` : ""}` : full || "ไม่ระบุชื่อ";
}

/** เลขในรหัส INF-xxxxx — ใช้บอกว่ารหัสไหน "เก่ากว่า" (รหัสผิดรูป = ใหม่สุด) */
function codeNum(code: string | null): number {
  const digits = (code ?? "").replace(/\D/g, "");
  return digits === "" ? Number.MAX_SAFE_INTEGER : Number(digits);
}

/** คีย์สำหรับจับ "คู่ที่น่าจะซ้ำ" — แยกความแรงของสัญญาณ เพราะข้อมูลจริงพิสูจน์แล้วว่า
    **ชื่อเล่นซ้ำกันเป็นเรื่องปกติมาก** (เจอ "ต่างชาติ" 2 คน / "โบว์" 2 คน ที่เป็นคนละคนชัดเจน)
    ⇒ ชื่อ-นามสกุลตรงกัน = สัญญาณแรง · ชื่อเล่นตรงกันอย่างเดียว = อ่อน ต้องตรวจหนักกว่า */
function dupeKeys(p: InfluProfileRow): { key: string; strong: boolean }[] {
  const norm = (s: string | null) =>
    (s ?? "").toLowerCase().replace(/\s+/g, "").trim();
  const out: { key: string; strong: boolean }[] = [];
  const nick = norm(p.nickname);
  const full = norm([p.first_name, p.last_name].filter(Boolean).join(""));
  if (full.length >= 3) out.push({ key: `f:${full}`, strong: true });
  if (nick.length >= 2) out.push({ key: `n:${nick}`, strong: false });
  return out;
}

export function ProfilesClient({
  profiles,
  cases,
  actor,
  loadError,
}: {
  profiles: InfluProfileRow[];
  cases: ProfileCaseLite[];
  actor: InfluLogActor;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** โปรไฟล์ที่เลือกเป็น "ต้นทาง" ของการรวม (จะถูกลบหลังย้ายของออกหมด) */
  const [mergeFrom, setMergeFrom] = useState<InfluProfileRow | null>(null);
  const [mergeInto, setMergeInto] = useState<InfluProfileRow | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InfluProfileRow | null>(null);

  const casesByPerson = useMemo(() => {
    const m = new Map<string, ProfileCaseLite[]>();
    for (const c of cases) {
      const arr = m.get(c.person_id);
      if (arr) arr.push(c);
      else m.set(c.person_id, [c]);
    }
    return m;
  }, [cases]);

  /** คู่ที่น่าจะซ้ำ — เสนอให้ดูเท่านั้น ไม่รวมให้เอง (กลุ่มสัญญาณแรงขึ้นก่อน) */
  const dupeGroups = useMemo(() => {
    const byKey = new Map<string, { rows: InfluProfileRow[]; strong: boolean }>();
    for (const p of profiles) {
      for (const { key, strong } of dupeKeys(p)) {
        const cur = byKey.get(key);
        if (cur) cur.rows.push(p);
        else byKey.set(key, { rows: [p], strong });
      }
    }
    // ยุบกลุ่มที่ซ้ำกันเอง (คนคู่เดียวกันแต่ match ทั้งชื่อเล่นและชื่อจริง — เก็บอันที่แรงกว่า)
    const bySig = new Map<string, { rows: InfluProfileRow[]; strong: boolean }>();
    for (const g of byKey.values()) {
      if (g.rows.length < 2) continue;
      const sig = g.rows
        .map((p) => p.id)
        .sort()
        .join("|");
      const prev = bySig.get(sig);
      if (!prev || (g.strong && !prev.strong)) {
        bySig.set(sig, {
          rows: [...g.rows].sort(
            (a, b) => codeNum(a.influ_code) - codeNum(b.influ_code)
          ),
          strong: g.strong,
        });
      }
    }
    return [...bySig.values()].sort(
      (a, b) => Number(b.strong) - Number(a.strong)
    );
  }, [profiles]);

  const orphans = useMemo(
    () => profiles.filter((p) => (casesByPerson.get(p.id)?.length ?? 0) === 0),
    [profiles, casesByPerson]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return profiles;
    return profiles.filter((p) =>
      [p.first_name, p.last_name, p.nickname, p.phone, p.influ_code]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q))
    );
  }, [profiles, search]);

  /** รหัสที่จะรอดหลังรวม — เลขเก่ากว่าชนะ (กติกาเดียวกับใน RPC) */
  const keptCode =
    mergeFrom && mergeInto
      ? codeNum(mergeFrom.influ_code) < codeNum(mergeInto.influ_code)
        ? mergeFrom.influ_code
        : mergeInto.influ_code
      : null;

  const runMerge = async () => {
    if (!mergeFrom || !mergeInto || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.rpc("influ_merge_profiles", {
      p_from: mergeFrom.id,
      p_into: mergeInto.id,
    });
    setBusy(false);
    setConfirmMerge(false);
    if (err) {
      setError(`รวมโปรไฟล์ไม่สำเร็จ: ${err.message}`);
      return;
    }
    setNotice(
      `รวม "${profileLabel(mergeFrom)}" เข้ากับ "${profileLabel(mergeInto)}" แล้ว — ใช้รหัส ${keptCode ?? "เดิม"} ต่อทุกรอบ`
    );
    setMergeFrom(null);
    setMergeInto(null);
    router.refresh();
  };

  const runDelete = async () => {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.rpc("influ_delete_profile", {
      p_id: deleteTarget.id,
    });
    setBusy(false);
    const label = profileLabel(deleteTarget);
    setDeleteTarget(null);
    if (err) {
      setError(`ลบโปรไฟล์ไม่สำเร็จ: ${err.message}`);
      return;
    }
    setNotice(`ลบโปรไฟล์ "${label}" แล้ว`);
    router.refresh();
  };

  const ProfileRow = ({ p }: { p: InfluProfileRow }) => {
    const rounds = casesByPerson.get(p.id) ?? [];
    const isFrom = mergeFrom?.id === p.id;
    const isInto = mergeInto?.id === p.id;
    return (
      <div
        className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
          isFrom
            ? "border-rose-300 bg-rose-50/60"
            : isInto
              ? "border-emerald-300 bg-emerald-50/60"
              : "border-stone-200 bg-white/80"
        }`}
      >
        <UserRound size={16} className="shrink-0 text-stone-300" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-stone-800">
            {profileLabel(p)}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
            <span className="font-mono text-stone-500">{p.influ_code}</span>
            {rounds.length > 0 ? (
              <span>
                {rounds.length} รอบ
                {rounds.some((r) => r.archived) ? " · มีข้อมูลเก่า" : ""}
              </span>
            ) : (
              <span className="text-amber-700">ยังไม่มีเคส</span>
            )}
            {p.followers != null && (
              <span>{formatNumber(p.followers)} followers</span>
            )}
            {p.phone && <span>{p.phone}</span>}
          </span>
        </span>
        {isFrom && <Badge className="border border-rose-200 bg-rose-50 text-rose-700">ต้นทาง</Badge>}
        {isInto && (
          <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
            ปลายทาง
          </Badge>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMergeFrom(isFrom ? null : p)}
            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-rose-300 hover:text-rose-700 max-sm:min-h-11"
          >
            {isFrom ? "ยกเลิกต้นทาง" : "เลือกเป็นต้นทาง"}
          </button>
          <button
            type="button"
            onClick={() => setMergeInto(isInto ? null : p)}
            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 max-sm:min-h-11"
          >
            {isInto ? "ยกเลิกปลายทาง" : "เลือกเป็นปลายทาง"}
          </button>
          {rounds.length === 0 && (
            <button
              type="button"
              onClick={() => setDeleteTarget(p)}
              aria-label={`ลบโปรไฟล์ ${profileLabel(p)}`}
              title="ลบโปรไฟล์ที่ยังไม่มีเคส"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 animate-fade-in">
          {notice}
        </div>
      )}

      {/* แถบรวมโปรไฟล์ — โผล่เมื่อเลือกครบทั้งต้นทาง/ปลายทาง */}
      {(mergeFrom || mergeInto) && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Merge size={18} className="shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-stone-700">
                รวม{" "}
                <span className="font-semibold text-rose-700">
                  {mergeFrom ? profileLabel(mergeFrom) : "— เลือกต้นทาง —"}
                </span>{" "}
                เข้ากับ{" "}
                <span className="font-semibold text-emerald-700">
                  {mergeInto ? profileLabel(mergeInto) : "— เลือกปลายทาง —"}
                </span>
              </p>
              {mergeFrom && mergeInto && (
                <p className="mt-0.5 text-xs text-stone-500">
                  เคสทุกรอบย้ายไปปลายทางแล้วเรียงเลขรอบใหม่ตามวันที่สร้าง · ใช้รหัส{" "}
                  <span className="font-mono font-semibold text-stone-700">
                    {keptCode}
                  </span>{" "}
                  (รหัสเก่ากว่า) ต่อทุกรอบ · โปรไฟล์ต้นทางถูกลบ
                </p>
              )}
            </div>
            <Button
              disabled={!mergeFrom || !mergeInto || busy}
              onClick={() => setConfirmMerge(true)}
            >
              <Merge size={15} />
              รวมโปรไฟล์
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setMergeFrom(null);
                setMergeInto(null);
              }}
            >
              ล้าง
            </Button>
          </div>
        </Card>
      )}

      {/* คู่ที่น่าจะซ้ำ — เสนอให้ตรวจ ไม่รวมให้เอง */}
      {dupeGroups.length > 0 && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-900">
            <UsersRound size={16} className="text-amber-600" />
            คู่ที่น่าจะเป็นคนเดียวกัน ({dupeGroups.length} กลุ่ม)
          </h2>
          <p className="mb-3 text-xs font-medium text-stone-600">
            ชื่อซ้ำไม่ได้แปลว่าเป็นคนเดียวกัน — ตรวจให้ชัดก่อนกดรวม
          </p>
          <div className="space-y-3">
            {dupeGroups.map((g) => (
              <div
                key={g.rows.map((p) => p.id).join("|")}
                className={`space-y-1.5 rounded-xl border p-2.5 ${
                  g.strong
                    ? "border-amber-300 bg-amber-50/60"
                    : "border-stone-200 bg-stone-50/60"
                }`}
              >
                <p className="px-0.5 text-[11px] font-medium">
                  {g.strong ? (
                    <span className="text-amber-700">
                      ชื่อ-นามสกุลตรงกัน — น่าจะเป็นคนเดียวกันจริง
                    </span>
                  ) : (
                    <span className="text-stone-500">
                      ชื่อเล่นตรงกันเท่านั้น — ส่วนใหญ่เป็นคนละคน ตรวจให้ชัดก่อน
                    </span>
                  )}
                </p>
                {g.rows.map((p) => (
                  <ProfileRow key={p.id} p={p} />
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* โปรไฟล์ที่ยังไม่มีเคส */}
      {orphans.length > 0 && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 text-sm font-semibold text-stone-900">
            โปรไฟล์ที่ยังไม่มีเคส ({orphans.length})
          </h2>
          <div className="space-y-1.5">
            {orphans.map((p) => (
              <ProfileRow key={p.id} p={p} />
            ))}
          </div>
        </Card>
      )}

      {/* โปรไฟล์ทั้งหมด */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-900">
            โปรไฟล์ทั้งหมด ({profiles.length})
          </h2>
          <div className="relative ml-auto min-w-56 flex-1 sm:max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา"
              aria-label="ค้นหาโปรไฟล์"
              className="w-full rounded-full border border-stone-200 bg-white/80 py-2 pl-9 pr-4 text-base text-stone-800 placeholder:text-stone-500 focus:border-brand-400 focus:outline-none sm:text-sm"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={36} strokeWidth={1.5} />}
            title="ไม่พบโปรไฟล์ที่ตรงกับคำค้น"
          />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((p) => (
              <ProfileRow key={p.id} p={p} />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-stone-400">
          ผู้ทำ: {actor.name ?? "ไม่ทราบชื่อ"} · ทุกการรวม/ลบถูกบันทึกใน{" "}
          <Link
            href="/influencer-management/logs"
            className="text-brand-600 hover:underline"
          >
            ประวัติการใช้งาน
          </Link>
        </p>
      </Card>

      <ConfirmDialog
        open={confirmMerge}
        title="รวมโปรไฟล์เป็นคนเดียวกัน?"
        message={
          <>
            เคสทุกรอบของ{" "}
            <span className="font-medium text-stone-800">
              {mergeFrom ? profileLabel(mergeFrom) : ""}
            </span>{" "}
            (
            {mergeFrom
              ? (casesByPerson.get(mergeFrom.id)?.length ?? 0)
              : 0}{" "}
            รอบ) จะถูกย้ายไปอยู่ใต้{" "}
            <span className="font-medium text-stone-800">
              {mergeInto ? profileLabel(mergeInto) : ""}
            </span>{" "}
            แล้วเรียงเลขรอบใหม่ตามวันที่สร้าง
            <br />
            <span className="font-medium">
              ทุกรอบจะใช้รหัส {keptCode} (รหัสเก่ากว่า)
            </span>{" "}
            — แฮชแท็ก #INF ของคนนี้จะกลับมาเป็นอันเดียว
            <br />
            ช่องทางติดต่อ/รูป/แคมเปญของต้นทางถูกย้ายมาด้วย แล้ว
            <span className="font-medium"> โปรไฟล์ต้นทางจะถูกลบถาวร </span>
            (ย้อนกลับไม่ได้ — ตรวจให้แน่ใจว่าเป็นคนเดียวกันจริง)
          </>
        }
        confirmLabel="รวมโปรไฟล์"
        onConfirm={() => void runMerge()}
        onClose={() => setConfirmMerge(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบโปรไฟล์นี้?"
        message={
          <>
            ลบ{" "}
            <span className="font-medium text-stone-800">
              {deleteTarget ? profileLabel(deleteTarget) : ""}
            </span>{" "}
            ออกจากระบบถาวร — โปรไฟล์นี้ยังไม่มีเคสผูกอยู่ จึงไม่มีข้อมูลงานหายไป
            (ช่องทางติดต่อ/รูปของโปรไฟล์จะถูกลบตาม)
          </>
        }
        confirmLabel="ลบโปรไฟล์"
        onConfirm={() => void runDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
