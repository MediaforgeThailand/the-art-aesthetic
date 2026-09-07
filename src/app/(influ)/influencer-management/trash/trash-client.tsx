"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
} from "@/components/ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import { type InfluLogActor } from "@/influ/lib/influ-log";
import { notifyInfluByCase } from "@/influ/lib/influ-notify";
import { createClient } from "@/lib/supabase/client";

export type TrashBackup = {
  id: string;
  entity: string;
  entity_id: string;
  label: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  purge_after: string;
  restored_at: string | null;
};

/** เหลืออีกกี่วันก่อนถูกล้างถาวร — Date.now() ต้องอยู่นอก component (กฎ react-hooks/purity) */
function daysLeft(purgeAfter: string): number {
  return Math.ceil((new Date(purgeAfter).getTime() - Date.now()) / 86_400_000);
}

function isExpired(purgeAfter: string): boolean {
  return new Date(purgeAfter).getTime() <= Date.now();
}

/**
 * ถังขยะของระบบ Influencer — เคสที่ถูกลบถูกสำรองไว้ 30 วัน (influ_deleted_backups)
 * กู้คืนได้ทั้งเคสพร้อมข้อมูลลูกทุกตาราง ผ่าน RPC influ_restore_backup
 *
 * หมายเหตุ: ไฟล์ใน storage (รูป/Memo/สัญญา) ถูกลบตอนลบเคส — กู้คืนแล้วต้องอัปโหลดใหม่
 */
export function TrashClient({
  backups,
  loadError,
  actor,
}: {
  backups: TrashBackup[];
  loadError: string | null;
  /** ผู้ทำ — กู้คืนแล้วผู้รับผิดชอบเดิมของเคสต้องรู้ (เคสกลับมาอยู่บนโต๊ะพวกเขา) */
  actor: InfluLogActor;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [target, setTarget] = useState<TrashBackup | null>(null);

  // ล้างสำเนาที่เกิน 30 วันตอนเปิดหน้า (แนวเดียวกับถังขยะของ /tasks)
  const purged = useRef(false);
  useEffect(() => {
    if (purged.current) return;
    purged.current = true;
    void supabase.rpc("influ_purge_expired_backups").then(({ data }) => {
      if (typeof data === "number" && data > 0) router.refresh();
    });
  }, [supabase, router]);

  const handleRestore = async (b: TrashBackup) => {
    setRestoring(b.id);
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabase.rpc("influ_restore_backup", {
      p_backup_id: b.id,
    });
    setRestoring(null);
    if (err) {
      setError(`กู้คืนไม่สำเร็จ: ${err.message}`);
      return;
    }
    setNotice(
      `กู้คืน "${b.label}" กลับเข้าระบบแล้ว — ไฟล์ที่อัปโหลดไว้เดิมไม่ได้กลับมาด้วย ต้องอัปโหลดใหม่`
    );
    if (typeof data === "string") {
      router.prefetch(`/influencers/${data}`);
      // ผู้รับผิดชอบเดิมของเคส (ถ้ายังกู้ขึ้น — 0106) ต้องรู้ว่าเคสกลับมาอยู่บนโต๊ะแล้ว
      notifyInfluByCase(supabase, actor, {
        influencerId: data,
        influencerName: b.label,
        type: "case_reopened",
        baseLevel: "action",
        title: `เคส "${b.label}" ถูกกู้คืนจากถังขยะ`,
        body: "ไฟล์ที่อัปโหลดไว้เดิมไม่ได้กลับมาด้วย ต้องอัปโหลดใหม่",
        href: `/influencers/${data}`,
      });
    }
    router.refresh();
  };

  const live = backups.filter((b) => b.restored_at === null && !isExpired(b.purge_after));

  return (
    <>
      {/* เคสที่ลบถูกสำรองไว้ 30 วันก่อนล้างถาวร — คำอธิบายอยู่บนกล่องยืนยันตอนกู้/ล้าง */}
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดถังขยะไม่สำเร็จ: {loadError}
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

      <p className="mb-3 text-sm text-stone-500">
        กู้คืนได้ตอนนี้ {formatNumber(live.length)} รายการ
      </p>

      {backups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trash2 size={40} strokeWidth={1.5} />}
            title="ถังขยะว่าง"
            description="ยังไม่มีเคสไหนถูกลบ — เมื่อมีการลบ ข้อมูลจะถูกสำรองไว้ที่นี่ 30 วัน"
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-stone-100">
            {backups.map((b) => {
              const expired = isExpired(b.purge_after);
              const left = daysLeft(b.purge_after);
              const restored = b.restored_at !== null;
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-800">
                      {/* ห่อ span ให้ตัดคำได้ — ข้อความเปล่าใน flex เป็น item ที่ min-width:auto
                          ชื่อยาวๆ (ชื่อ+นามสกุล+ชื่อเล่น) จึงดันแถวล้นขอบจอ 375px */}
                      <span className="min-w-0 break-words">{b.label}</span>
                      {restored && (
                        <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                          กู้คืนแล้ว
                        </Badge>
                      )}
                      {!restored && expired && (
                        <Badge className="border border-stone-200 bg-stone-50 text-stone-500">
                          หมดอายุ — รอล้าง
                        </Badge>
                      )}
                      {!restored && !expired && (
                        <Badge
                          className={
                            left <= 7
                              ? "border border-amber-200 bg-amber-50 text-amber-700"
                              : "border border-stone-200 bg-stone-50 text-stone-500"
                          }
                        >
                          เหลือ {formatNumber(Math.max(left, 0))} วัน
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      ลบโดย {b.deleted_by_name || "ไม่ทราบ"} ·{" "}
                      {formatDateTime(b.deleted_at)}
                    </p>
                  </div>
                  {!restored && !expired && (
                    <Button
                      variant="secondary"
                      loading={restoring === b.id}
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setTarget(b);
                      }}
                    >
                      <RotateCcw size={15} />
                      กู้คืน
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={target !== null}
        title="กู้คืนเคสนี้"
        confirmLabel="กู้คืน"
        confirmVariant="primary"
        message={
          <>
            กู้คืน{" "}
            <span className="font-medium text-stone-800">{target?.label}</span>{" "}
            กลับเข้าระบบ? ข้อมูลทุกตาราง (follow-up, ลายเซน, ต้นทุน, ลิงก์,
            คิวในปฏิทิน) จะกลับมาพร้อมกัน — ยกเว้น
            <span className="font-medium"> ไฟล์ที่อัปโหลดไว้ </span>
            (รูป/Memo/สัญญา) ที่ถูกลบไปตอนลบเคส ต้องอัปโหลดใหม่
          </>
        }
        onConfirm={() => {
          if (target) void handleRestore(target);
        }}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
