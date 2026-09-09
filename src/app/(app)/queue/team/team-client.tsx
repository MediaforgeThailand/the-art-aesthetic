"use client";

import { AlertCircle, Eye, UserPlus, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Input, Label, Modal, Select } from "@/components/ui";
import { addMember, updateMember } from "@/lib/queue/actions";
import type { MemberWithStats, ProfileOption } from "@/lib/queue/data";
import {
  AVAILABILITY_LABEL,
  type Availability,
  MEMBER_ROLE_HINT,
  MEMBER_ROLE_LABEL,
  type MemberRole,
} from "@/lib/queue/types";
import { AvailabilityDot, RankBadge } from "../_components/pieces";

const ROLES: MemberRole[] = ["bc", "admin", "viewer"];

/**
 * จัดการทีม — ปุ่มที่ซ่อนไม่ใช่การบังคับสิทธิ์: ทุกปุ่มยิงไป RPC ที่ตรวจสิทธิ์แอดมินซ้ำที่ฐานข้อมูล
 * ปิดคนที่เคยมีคิวแล้วใช้ "ปิดรับ/ปิดใช้งาน" เท่านั้น — ไม่มีปุ่มลบถาวรโดยตั้งใจ
 */
export default function TeamClient({
  members,
  profiles,
  isAdmin,
  myMemberId,
}: {
  members: MemberWithStats[];
  profiles: ProfileOption[];
  isAdmin: boolean;
  myMemberId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<MemberWithStats | null>(null);
  const [queueOff, setQueueOff] = useState<MemberWithStats | null>(null);

  const [newUserId, setNewUserId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newRole, setNewRole] = useState<MemberRole>("bc");
  const [newQueue, setNewQueue] = useState(true);
  const [reason, setReason] = useState("");

  const taken = new Set(members.map((m) => m.user_id));
  const available = profiles.filter((p) => !taken.has(p.id));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "ทำรายการไม่สำเร็จ");
      else {
        onDone?.();
        router.refresh();
      }
    });
  }

  function pickRole(role: MemberRole) {
    setNewRole(role);
    // แอดมินส่วนใหญ่ไม่ลงคิวเอง ส่วนผู้ดูอย่างเดียวไม่รับคิวอยู่แล้ว
    setNewQueue(role === "bc");
  }

  const active = members.filter((m) => m.is_active);
  const inactive = members.filter((m) => !m.is_active);

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setAdding(true)}>
            <UserPlus size={16} /> เพิ่มสมาชิก
          </Button>
        </div>
      )}

      {error && !adding && !deactivating && !queueOff && (
        <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="space-y-2">
        {active.map((member) => {
          const isViewer = member.role === "viewer";
          return (
            <div key={member.id} className="glass rounded-xl px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {isViewer ? (
                  <Eye size={14} className="shrink-0 text-stone-400" />
                ) : (
                  <AvailabilityDot availability={member.availability} />
                )}
                <span className="min-w-0 truncate text-sm font-semibold text-stone-900">
                  {member.display_name}
                </span>
                {member.id === myMemberId && (
                  <Badge className="bg-brand-50 text-brand-700">คุณ</Badge>
                )}
                {member.role !== "bc" && (
                  <Badge className="bg-stone-100 text-stone-600">
                    {MEMBER_ROLE_LABEL[member.role]}
                  </Badge>
                )}
                {!member.queue_enabled && !isViewer && (
                  <Badge className="bg-stone-100 text-stone-500">ไม่รับคิว</Badge>
                )}
                {!isViewer && (
                  <span className="ml-auto shrink-0">
                    <RankBadge rank={member.rank} weight={member.weight} />
                  </span>
                )}
              </div>

              {isViewer ? (
                <p className="mt-1.5 text-xs text-stone-500">{MEMBER_ROLE_HINT.viewer}</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                  <span>
                    วันนี้ <b className="text-stone-800">{member.today}</b>
                  </span>
                  <span>
                    เดือนนี้ <b className="text-stone-800">{member.month}</b>
                  </span>
                  {member.employee_code && <span>รหัส {member.employee_code}</span>}
                  {!isAdmin && <span>{AVAILABILITY_LABEL[member.availability]}</span>}
                </div>
              )}

              {isAdmin && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!isViewer && (
                    <Select
                      aria-label={`สถานะของ ${member.display_name}`}
                      value={member.availability}
                      disabled={pending}
                      onChange={(e) =>
                        run(() =>
                          updateMember({
                            memberId: member.id,
                            availability: e.target.value as Availability,
                          })
                        )
                      }
                      className="w-auto py-1.5 text-xs"
                    >
                      {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((value) => (
                        <option key={value} value={value}>
                          {AVAILABILITY_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  )}

                  <Select
                    aria-label={`สิทธิ์ของ ${member.display_name}`}
                    value={member.role}
                    disabled={pending}
                    onChange={(e) =>
                      run(() =>
                        updateMember({
                          memberId: member.id,
                          role: e.target.value as MemberRole,
                        })
                      )
                    }
                    className="w-auto py-1.5 text-xs"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {MEMBER_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </Select>

                  {!isViewer && (
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      disabled={pending}
                      onClick={() => {
                        if (member.queue_enabled) {
                          setError(null);
                          setReason("");
                          setQueueOff(member);
                          return;
                        }
                        run(() => updateMember({ memberId: member.id, queueEnabled: true }));
                      }}
                    >
                      {member.queue_enabled ? "ปิดรับคิว" : "เปิดรับคิว"}
                    </Button>
                  )}

                  <Button
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      setError(null);
                      setReason("");
                      setDeactivating(member);
                    }}
                  >
                    <UserRoundX size={14} /> ปิดใช้งาน
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {inactive.length > 0 && (
        <div className="pt-2">
          <h2 className="mb-1.5 text-xs font-medium text-stone-400">ปิดใช้งานแล้ว</h2>
          <div className="space-y-1.5">
            {inactive.map((member) => (
              <div
                key={member.id}
                className="glass-soft flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-500"
              >
                <span className="truncate">{member.display_name}</span>
                {member.deactivation_reason && (
                  <span className="text-xs">— {member.deactivation_reason}</span>
                )}
                {isAdmin && (
                  <Button
                    variant="secondary"
                    className="ml-auto px-3 py-1.5 text-xs"
                    disabled={pending}
                    onClick={() =>
                      run(() => updateMember({ memberId: member.id, isActive: true }))
                    }
                  >
                    เปิดใช้งานอีกครั้ง
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- เพิ่มสมาชิก ---------- */}
      <Modal open={adding} onClose={() => setAdding(false)} title="เพิ่มสมาชิกเข้าทีมคิว">
        <div className="space-y-4">
          <div>
            <Label htmlFor="user">บัญชีบริษัท</Label>
            <Select
              id="user"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
            >
              <option value="">เลือกบัญชี</option>
              {available.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name ?? profile.email ?? profile.id}
                  {profile.full_name && profile.email ? ` — ${profile.email}` : ""}
                </option>
              ))}
            </Select>
            {available.length === 0 && (
              <p className="mt-1 text-xs text-stone-500">
                ทุกบัญชีในระบบหลักถูกเพิ่มเข้าทีมแล้ว
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="code">รหัสพนักงาน (ไม่บังคับ)</Label>
              <Input id="code" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="role">สิทธิ์</Label>
              <Select
                id="role"
                value={newRole}
                onChange={(e) => pickRole(e.target.value as MemberRole)}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {MEMBER_ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
            {MEMBER_ROLE_HINT[newRole]}
          </p>

          {newRole !== "viewer" && (
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={newQueue}
                onChange={(e) => setNewQueue(e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              ให้รับคิวลูกค้าด้วย
            </label>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              ยกเลิก
            </Button>
            <Button
              loading={pending}
              disabled={!newUserId}
              onClick={() =>
                run(
                  () =>
                    addMember(
                      newUserId,
                      newCode.trim() || undefined,
                      newRole,
                      newRole === "viewer" ? false : newQueue
                    ),
                  () => {
                    setAdding(false);
                    setNewUserId("");
                    setNewCode("");
                    pickRole("bc");
                  }
                )
              }
            >
              เพิ่ม
            </Button>
          </div>
        </div>
      </Modal>

      {/* ---------- ปิดรับคิว: ต้องมีเหตุผลเพราะกระทบการแบ่งคิวของทั้งทีม ---------- */}
      <Modal open={queueOff !== null} onClose={() => setQueueOff(null)} title="ปิดรับคิว">
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            {queueOff?.display_name} จะไม่ถูกจ่ายลูกค้าใหม่ให้ แต่ยังเข้าระบบและดูเคสเดิมได้
          </p>
          <div>
            <Label htmlFor="queue-off-reason">เหตุผล</Label>
            <Input
              id="queue-off-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เหตุผล"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setQueueOff(null)}>
              ยกเลิก
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                if (!queueOff) return;
                if (!reason.trim()) return setError("ต้องระบุเหตุผล");
                run(
                  () =>
                    updateMember({
                      memberId: queueOff.id,
                      queueEnabled: false,
                      reason: reason.trim(),
                    }),
                  () => setQueueOff(null)
                );
              }}
            >
              ปิดรับคิว
            </Button>
          </div>
        </div>
      </Modal>

      {/* ---------- ปิดใช้งาน ---------- */}
      <Modal
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title="ปิดใช้งานสมาชิก"
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            {deactivating?.display_name} จะไม่ได้รับคิวใหม่ ประวัติและอันดับเดิมยังอยู่ครบ
          </p>
          <div>
            <Label htmlFor="deactivate-reason">เหตุผล</Label>
            <Input
              id="deactivate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เหตุผล"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDeactivating(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                if (!deactivating) return;
                if (!reason.trim()) return setError("ต้องระบุเหตุผล");
                run(
                  () =>
                    updateMember({
                      memberId: deactivating.id,
                      isActive: false,
                      reason: reason.trim(),
                    }),
                  () => setDeactivating(null)
                );
              }}
            >
              ปิดใช้งาน
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
