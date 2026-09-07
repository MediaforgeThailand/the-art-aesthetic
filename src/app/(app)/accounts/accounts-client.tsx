"use client";

import {
  Clock,
  Dices,
  KeyRound,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
} from "@/components/ui";
import type { AppPermission } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import {
  INFLU_LEVELS,
  PERMISSION_META,
  type InfluLevel,
} from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";

/** 3 สิทธิ์ของระบบ Influencer เป็น "ระดับ" เลือกได้อันเดียว ไม่ใช่สวิตช์อิสระ
    (ผู้ใช้ 2026-08-14: ทีมอื่นเข้ามาใช้ด้วย ติ๊กรวมกันแล้วงงว่าใครทำอะไรได้บ้าง) */
const INFLU_LEVEL_ORDER: InfluLevel[] = ["none", "view", "hunter", "manager"];

/** ระดับ Influencer ปัจจุบันของชุดสิทธิ์ (สูงสุดชนะ — ข้อมูลเก่าอาจติ๊กไว้หลายอัน) */
function influLevelOf(set: Set<AppPermission>): InfluLevel {
  if (set.has("influ")) return "manager";
  if (set.has("influ_hunter")) return "hunter";
  if (set.has("influ_view")) return "view";
  return "none";
}

/** ตั้งระดับ Influencer — ล้างคีย์ของอีก 2 ระดับออกเสมอ เหลืออันเดียว */
function withInfluLevel(
  set: Set<AppPermission>,
  level: InfluLevel
): Set<AppPermission> {
  const next = new Set(set);
  next.delete("influ");
  next.delete("influ_hunter");
  next.delete("influ_view");
  if (level !== "none") next.add(INFLU_LEVELS[level].key);
  return next;
}

type AccountProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  permissions: AppPermission[] | null;
  created_at: string;
};

/** ข้อมูลฝั่ง auth (last sign-in) — โหลดเพิ่มจาก edge function */
type AuthInfo = { last_sign_in_at: string | null };

/** แปลรหัส error ของ edge function เป็นข้อความไทย */
function adminErrorMessage(raw: string): string {
  const map: Record<string, string> = {
    unauthorized: "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่",
    forbidden: "บัญชีของคุณไม่มีสิทธิ์ผู้ดูแลระบบ",
    invalid_email: "รูปแบบอีเมลไม่ถูกต้อง",
    password_too_short: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร",
    cannot_delete_self: "ลบบัญชีของตัวเองไม่ได้",
    last_admin: "ต้องเหลือผู้ดูแลระบบอย่างน้อย 1 คน",
    user_not_found: "ไม่พบบัญชีนี้",
    missing_user_id: "ไม่พบบัญชีนี้",
  };
  if (map[raw]) return map[raw];
  if (/already been registered|already exists/i.test(raw))
    return "อีเมลนี้มีบัญชีอยู่แล้ว";
  return `เกิดข้อผิดพลาด: ${raw}`;
}

/** เรียก edge function admin-users — โยน Error พร้อมข้อความไทยเมื่อไม่สำเร็จ */
async function callAdminUsers(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
  });
  if (error) {
    let raw = error.message;
    // FunctionsHttpError เก็บ Response ไว้ใน context — อ่าน error code จริงจาก body
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as { error?: string };
        if (parsed?.error) raw = parsed.error;
      } catch {
        // body ไม่ใช่ JSON — ใช้ message เดิม
      }
    }
    throw new Error(adminErrorMessage(raw));
  }
  const payload = (data ?? {}) as { ok?: boolean; error?: string };
  if (!payload.ok) {
    throw new Error(adminErrorMessage(payload.error ?? "unknown"));
  }
  return payload as Record<string, unknown>;
}

/** เวลาเข้าระบบล่าสุดของทุกบัญชี — ไม่ critical: ล้มแล้วคืน null (ตารางยังแสดงได้โดยไม่มีคอลัมน์นี้) */
async function fetchAuthInfo(): Promise<Map<string, AuthInfo> | null> {
  try {
    const res = await callAdminUsers({ action: "list" });
    const users = (res.users ?? []) as Array<{
      id: string;
      last_sign_in_at: string | null;
    }>;
    return new Map(
      users.map((u) => [u.id, { last_sign_in_at: u.last_sign_in_at }])
    );
  } catch {
    return null;
  }
}

/** สุ่มรหัสผ่าน 10 ตัว (ตัดตัวอักษรที่อ่านสับสน 0/O, 1/l/I ออก) */
function generatePassword(): string {
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => charset[b % charset.length]).join("");
}

function permsOf(p: AccountProfile): AppPermission[] {
  return p.permissions ?? [];
}

/** ชิปสรุปสิทธิ์ในตาราง — แต่ละสิทธิ์เป็นชิปอิสระ (แนวคิดแบบ Discord ไม่ใช่ยศ) */
function PermissionSummary({ profile }: { profile: AccountProfile }) {
  const perms = permsOf(profile);
  const isAdmin = profile.role === "admin";
  if (!isAdmin && perms.length === 0) {
    // บัญชีที่เพิ่งสมัครเองด้วยเมลบริษัท (Google SSO — migration 0094) จะมาโผล่ตรงนี้
    // ทำให้เด่นหน่อย เพราะเป็นคิวงานของผู้ดูแล ไม่ใช่แค่สถานะเฉยๆ
    return (
      <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
        <Clock size={12} /> รออนุมัติสิทธิ์
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {isAdmin && (
        <Badge className="border border-brand-200 bg-brand-50 text-brand-700">
          <ShieldCheck size={12} /> ผู้ดูแลระบบ
        </Badge>
      )}
      {PERMISSION_META.filter(
        (m) => m.group !== "influ" && perms.includes(m.key)
      ).map((m) => (
        <Badge
          key={m.key}
          className="border border-stone-200 bg-stone-50 text-stone-600"
        >
          {m.label}
        </Badge>
      ))}
      {/* ระดับ Influencer เป็นชิปเดียว (สูงสุดที่ติ๊กไว้) ไม่ใช่ชิปแยกทุกอัน */}
      {influLevelOf(new Set(perms)) !== "none" &&
        (() => {
          const lv = influLevelOf(new Set(perms)) as Exclude<
            InfluLevel,
            "none"
          >;
          return (
            <Badge className={INFLU_LEVELS[lv].badge}>
              Influ · {INFLU_LEVELS[lv].short}
            </Badge>
          );
        })()}
    </div>
  );
}

export function AccountsClient({
  myId,
  initialProfiles,
}: {
  myId: string;
  initialProfiles: AccountProfile[];
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<AccountProfile[]>(initialProfiles);
  const [authInfo, setAuthInfo] = useState<Map<string, AuthInfo>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // สร้างบัญชี
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin">("member");
  const [newPerms, setNewPerms] = useState<Set<AppPermission>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // จัดการสิทธิ์รายคน
  const [permTarget, setPermTarget] = useState<AccountProfile | null>(null);
  const [permRole, setPermRole] = useState<"member" | "admin">("member");
  const [permSet, setPermSet] = useState<Set<AppPermission>>(new Set());
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  // เปลี่ยนรหัสผ่าน
  const [resetTarget, setResetTarget] = useState<AccountProfile | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  // ลบบัญชี
  const [deleteTarget, setDeleteTarget] = useState<AccountProfile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, permissions, created_at")
      .order("created_at", { ascending: true });
    if (data) setProfiles(data as AccountProfile[]);
    router.refresh();
  }, [router]);

  const loadAuthInfo = useCallback(async () => {
    const map = await fetchAuthInfo();
    if (map) setAuthInfo(map);
  }, []);

  // โหลดครั้งแรกตอนเปิดหน้า — เขียน state ใน callback ของ promise (ไม่ใช่ตอนรัน effect
  // ตรงๆ ตามกฎ react-hooks/set-state-in-effect) พร้อม guard กันเขียนหลัง unmount
  useEffect(() => {
    let alive = true;
    void fetchAuthInfo().then((map) => {
      if (alive && map) setAuthInfo(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await callAdminUsers({
        action: "create",
        email: newEmail,
        password: newPassword,
        full_name: newName,
        role: newRole,
        permissions: [...newPerms],
      });
      setCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("member");
      setNewPerms(new Set());
      await Promise.all([reload(), loadAuthInfo()]);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  function openPermissions(p: AccountProfile) {
    setPermTarget(p);
    setPermRole(p.role === "admin" ? "admin" : "member");
    setPermSet(new Set(permsOf(p)));
    setPermError(null);
  }

  async function handleSavePermissions() {
    if (!permTarget) return;
    setPermError(null);
    setPermSaving(true);
    try {
      const roleChanged =
        permRole !== (permTarget.role === "admin" ? "admin" : "member");
      // ตั้ง role ก่อน (มีการเช็ค last_admin ฝั่ง server)
      if (roleChanged) {
        await callAdminUsers({
          action: "set_role",
          user_id: permTarget.id,
          role: permRole,
        });
      }
      // เก็บ permissions เสมอ (admin เห็นทุกอย่างอยู่แล้ว แต่เก็บค่าไว้ให้ตอนถอด admin)
      await callAdminUsers({
        action: "set_permissions",
        user_id: permTarget.id,
        permissions: [...permSet],
      });
      setPermTarget(null);
      await reload();
    } catch (err) {
      setPermError(err instanceof Error ? err.message : String(err));
    } finally {
      setPermSaving(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    setResetting(true);
    try {
      await callAdminUsers({
        action: "reset_password",
        user_id: resetTarget.id,
        password: resetPassword,
      });
      setResetDone(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  }

  async function handleDelete(target: AccountProfile) {
    setError(null);
    setBusyId(target.id);
    try {
      await callAdminUsers({ action: "delete", user_id: target.id });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function openReset(p: AccountProfile) {
    setResetTarget(p);
    setResetPassword(generatePassword());
    setResetError(null);
    setResetDone(false);
  }

  function setNewInfluLevel(level: InfluLevel) {
    setNewPerms((s) => withInfluLevel(s, level));
  }

  function setPermInfluLevel(level: InfluLevel) {
    setPermSet((s) => withInfluLevel(s, level));
  }

  function toggleNewPerm(key: AppPermission) {
    setNewPerms((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function togglePermSet(key: AppPermission) {
    setPermSet((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const admins = profiles.filter((p) => p.role === "admin").length;

  return (
    <>
      <PageHeader
        title="จัดการบัญชีและสิทธิ์ผู้ใช้"
        action={
          <Button
            onClick={() => {
              setCreateOpen(true);
              setCreateError(null);
              setNewPassword(generatePassword());
            }}
          >
            <UserPlus size={16} /> เพิ่มบัญชี
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      <Card className="overflow-hidden">
        {profiles.length === 0 ? (
          <EmptyState icon={<Users size={40} />} title="ยังไม่มีบัญชีผู้ใช้" />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-brand-100/70 text-left text-xs text-stone-500">
                <th className="px-5 py-3 font-medium">ผู้ใช้</th>
                <th className="px-3 py-3 font-medium">สิทธิ์การเข้าถึง</th>
                <th className="px-3 py-3 font-medium">เข้าระบบล่าสุด</th>
                <th className="px-3 py-3 font-medium">สร้างเมื่อ</th>
                <th className="px-5 py-3 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const name = p.full_name || p.email || "-";
                const lastSignIn = authInfo.get(p.id)?.last_sign_in_at;
                const isMe = p.id === myId;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-brand-100/40 last:border-0 transition-colors hover:bg-white/50"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-xs font-semibold text-cream">
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-stone-800">
                            {name}
                            {isMe && (
                              <span className="ml-2 text-xs font-normal text-brand-500">
                                (ฉัน)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-stone-400">
                            {p.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <PermissionSummary profile={p} />
                    </td>
                    <td className="px-3 py-3 text-stone-500">
                      {lastSignIn ? formatDateTime(lastSignIn) : "-"}
                    </td>
                    <td className="px-3 py-3 text-stone-500">
                      {formatDateTime(p.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!isMe && (
                          <button
                            type="button"
                            title="จัดการสิทธิ์"
                            onClick={() => openPermissions(p)}
                            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 cursor-pointer active:scale-90"
                          >
                            <SlidersHorizontal size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          title="ตั้งรหัสผ่านใหม่"
                          onClick={() => openReset(p)}
                          className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700 cursor-pointer active:scale-90"
                        >
                          <KeyRound size={16} />
                        </button>
                        {!isMe && (
                          <button
                            type="button"
                            title="ลบบัญชี"
                            disabled={busyId === p.id}
                            onClick={() => setDeleteTarget(p)}
                            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer active:scale-90 disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-stone-400">
        ผู้ดูแลระบบ {admins} คน · บัญชีทั้งหมด {profiles.length} บัญชี ·
        พนักงาน @artsurgery.co.th ตั้งรหัสผ่านเองครั้งแรกได้ (เริ่มต้นยังไม่มีสิทธิ์
        รอเปิดให้) · บัญชีที่ถูกลบจะเข้าสู่ระบบไม่ได้ทันที ข้อมูลที่บันทึกไว้ยังอยู่ครบ
      </p>

      {/* เพิ่มบัญชี */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="เพิ่มบัญชีผู้ใช้"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="acc-name">ชื่อ-นามสกุล</Label>
            <Input
              id="acc-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="acc-email">อีเมล</Label>
            <Input
              id="acc-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="acc-password">รหัสผ่าน</Label>
            <div className="flex gap-2">
              <Input
                id="acc-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
                className="font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                title="สุ่มรหัสผ่านใหม่"
                onClick={() => setNewPassword(generatePassword())}
              >
                <Dices size={16} />
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-stone-400">
              จดรหัสผ่านนี้ส่งให้เจ้าของบัญชี — ระบบจะไม่แสดงอีกครั้ง
            </p>
          </div>

          <PermissionEditor
            role={newRole}
            onRoleChange={setNewRole}
            permSet={newPerms}
            onToggle={toggleNewPerm}
            onInfluLevelChange={setNewInfluLevel}
          />

          {createError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {createError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit" loading={creating}>
              เพิ่มบัญชี
            </Button>
          </div>
        </form>
      </Modal>

      {/* จัดการสิทธิ์รายคน */}
      <Modal
        open={permTarget !== null}
        onClose={() => setPermTarget(null)}
        title={`จัดการสิทธิ์ — ${permTarget?.full_name || permTarget?.email || ""}`}
      >
        <div className="space-y-4">
          <PermissionEditor
            role={permRole}
            onRoleChange={setPermRole}
            permSet={permSet}
            onToggle={togglePermSet}
            onInfluLevelChange={setPermInfluLevel}
          />
          {permError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {permError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPermTarget(null)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              loading={permSaving}
              onClick={handleSavePermissions}
            >
              บันทึกสิทธิ์
            </Button>
          </div>
        </div>
      </Modal>

      {/* ตั้งรหัสผ่านใหม่ */}
      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={`ตั้งรหัสผ่านใหม่ — ${resetTarget?.full_name || resetTarget?.email || ""}`}
      >
        {resetDone ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
              ตั้งรหัสผ่านใหม่เรียบร้อย — ส่งรหัสด้านล่างให้เจ้าของบัญชี
            </p>
            <p className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-center font-mono text-base text-stone-800 select-all">
              {resetPassword}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setResetTarget(null)}>ปิด</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <Label htmlFor="reset-password">รหัสผ่านใหม่</Label>
              <div className="flex gap-2">
                <Input
                  id="reset-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  minLength={6}
                  required
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="secondary"
                  title="สุ่มรหัสผ่านใหม่"
                  onClick={() => setResetPassword(generatePassword())}
                >
                  <Dices size={16} />
                </Button>
              </div>
            </div>
            {resetError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
                {resetError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setResetTarget(null)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" loading={resetting}>
                ตั้งรหัสผ่าน
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ยืนยันลบบัญชี */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบบัญชีผู้ใช้"
        message={
          <>
            ลบบัญชี{" "}
            <span className="font-medium text-stone-800">
              {deleteTarget?.full_name || deleteTarget?.email}
            </span>{" "}
            ({deleteTarget?.email}) ถาวร?
            เจ้าของบัญชีจะเข้าสู่ระบบไม่ได้ทันที
            ส่วนงานและข้อมูลที่เคยบันทึกไว้ยังอยู่ครบ (ผู้รับผิดชอบจะแสดงเป็นว่าง)
          </>
        }
        confirmLabel="ลบบัญชี"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

/** ตัวเลือกสิทธิ์แบบ Discord — แต่ละสิทธิ์เปิด/ปิดแยกกันได้อิสระต่อบัญชี (ไม่มีแนวคิดยศ)
    "ผู้ดูแลระบบ" เป็นสิทธิ์หนึ่ง (จัดการบัญชี/ผู้ตรวจ) map ไปที่ role; ที่เหลือ map ไป permissions[] */
function PermissionEditor({
  role,
  onRoleChange,
  permSet,
  onToggle,
  onInfluLevelChange,
}: {
  role: "member" | "admin";
  onRoleChange: (role: "member" | "admin") => void;
  permSet: Set<AppPermission>;
  onToggle: (key: AppPermission) => void;
  /** ระบบ Influencer เลือกได้ระดับเดียว — ไม่ผ่าน onToggle เหมือนสิทธิ์อื่น */
  onInfluLevelChange: (level: InfluLevel) => void;
}) {
  const level = influLevelOf(permSet);
  const detailOf = (key: AppPermission) =>
    PERMISSION_META.find((m) => m.key === key)?.detail ?? "";
  return (
    <div className="space-y-2">
      <div>
        <Label>สิทธิ์การเข้าถึง</Label>
      </div>

      {/* ผู้ดูแลระบบ = สิทธิ์จัดการบัญชี/ผู้ตรวจ (แยกอิสระเหมือนสิทธิ์อื่น) */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-stone-200 bg-white/60 px-3 py-2.5 transition-colors hover:bg-brand-50/40">
        <input
          type="checkbox"
          checked={role === "admin"}
          onChange={(e) => onRoleChange(e.target.checked ? "admin" : "member")}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
            <ShieldCheck size={14} className="text-brand-600" /> ผู้ดูแลระบบ
          </span>
          <span className="mt-0.5 block text-xs text-stone-400">
            เข้าหน้าจัดการบัญชี/สิทธิ์ และจัดการผู้ตรวจงานในหน้างาน
          </span>
        </span>
      </label>

      {/* สิทธิ์รายส่วน — เปิด/ปิดแยกกันได้อิสระ (ยกเว้นกลุ่ม influ ที่เป็นระดับ) */}
      {PERMISSION_META.filter((m) => m.group !== "influ").map((m) => (
        <label
          key={m.key}
          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-stone-200 bg-white/60 px-3 py-2.5 transition-colors hover:bg-brand-50/40"
        >
          <input
            type="checkbox"
            checked={permSet.has(m.key)}
            onChange={() => onToggle(m.key)}
            className="mt-0.5 h-4 w-4 accent-brand-600"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-stone-800">
              {m.label}
            </span>
            <span className="mt-0.5 block text-xs text-stone-400">
              {m.detail}
            </span>
          </span>
        </label>
      ))}

      {/* ระบบ Influencer — เลือกได้ระดับเดียว (ไม่มีสิทธิ์ / ดูเฉยๆ / Hunter / ผู้ดูแล) */}
      <div className="rounded-lg border border-brand-100 bg-brand-50/30 px-3 py-2.5">
        <p className="text-sm font-medium text-stone-800">
          ระบบ Influencer (Influencer System)
        </p>
        <div className="space-y-1.5">
          {INFLU_LEVEL_ORDER.map((lv) => (
            <label
              key={lv}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                level === lv
                  ? "border-brand-300 bg-white"
                  : "border-stone-200 bg-white/60 hover:bg-white"
              }`}
            >
              <input
                type="radio"
                name="influ-level"
                checked={level === lv}
                onChange={() => onInfluLevelChange(lv)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-stone-800">
                  {lv === "none" ? "ไม่มีสิทธิ์" : INFLU_LEVELS[lv].label}
                </span>
                <span className="mt-0.5 block text-xs text-stone-400">
                  {lv === "none"
                    ? "ไม่เห็นเมนู Influencer System เลย"
                    : detailOf(INFLU_LEVELS[lv].key)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
