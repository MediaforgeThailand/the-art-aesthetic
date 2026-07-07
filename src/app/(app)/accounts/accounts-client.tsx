"use client";

import {
  Dices,
  KeyRound,
  ShieldCheck,
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
  Select,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type AccountProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
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

/** สุ่มรหัสผ่าน 10 ตัว (ตัดตัวอักษรที่อ่านสับสน 0/O, 1/l/I ออก) */
function generatePassword(): string {
  const charset =
    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => charset[b % charset.length]).join("");
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: true });
    if (data) setProfiles(data);
    router.refresh();
  }, [router]);

  // โหลดเวลาเข้าระบบล่าสุดจากฝั่ง auth (ผ่าน edge function)
  const loadAuthInfo = useCallback(async () => {
    try {
      const res = await callAdminUsers({ action: "list" });
      const users = (res.users ?? []) as Array<{
        id: string;
        last_sign_in_at: string | null;
      }>;
      setAuthInfo(
        new Map(users.map((u) => [u.id, { last_sign_in_at: u.last_sign_in_at }]))
      );
    } catch {
      // ไม่ critical — ตารางยังแสดงได้โดยไม่มีคอลัมน์นี้
    }
  }, []);

  useEffect(() => {
    void loadAuthInfo();
  }, [loadAuthInfo]);

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
      });
      setCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("member");
      await Promise.all([reload(), loadAuthInfo()]);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleSetRole(target: AccountProfile, role: string) {
    setError(null);
    setBusyId(target.id);
    const prev = profiles;
    setProfiles((ps) =>
      ps.map((p) => (p.id === target.id ? { ...p, role } : p))
    );
    try {
      await callAdminUsers({ action: "set_role", user_id: target.id, role });
      await reload();
    } catch (err) {
      setProfiles(prev);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
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

  const admins = profiles.filter((p) => p.role === "admin").length;

  return (
    <>
      <PageHeader
        title="จัดการบัญชีผู้ใช้"
        description="เพิ่ม/ลบบัญชีที่เข้าสู่ระบบได้ และกำหนดสิทธิ์ผู้ดูแล — การสมัครเองจากหน้า login ถูกปิดแล้ว"
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100/70 text-left text-xs text-stone-500">
                <th className="px-5 py-3 font-medium">ผู้ใช้</th>
                <th className="px-3 py-3 font-medium">สิทธิ์</th>
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
                      {isMe ? (
                        <Badge className="border border-brand-200 bg-brand-50 text-brand-700">
                          <ShieldCheck size={12} />
                          {p.role === "admin" ? "ผู้ดูแลระบบ" : "สมาชิก"}
                        </Badge>
                      ) : (
                        <Select
                          value={p.role}
                          disabled={busyId === p.id}
                          onChange={(e) => handleSetRole(p, e.target.value)}
                          className="w-36"
                        >
                          <option value="member">สมาชิก</option>
                          <option value="admin">ผู้ดูแลระบบ</option>
                        </Select>
                      )}
                    </td>
                    <td className="px-3 py-3 text-stone-500">
                      {lastSignIn ? formatDateTime(lastSignIn) : "-"}
                    </td>
                    <td className="px-3 py-3 text-stone-500">
                      {formatDateTime(p.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
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
        )}
      </Card>

      <p className="mt-3 text-xs text-stone-400">
        ผู้ดูแลระบบ {admins} คน · บัญชีทั้งหมด {profiles.length} บัญชี ·
        บัญชีที่ถูกลบจะเข้าสู่ระบบไม่ได้ทันที ส่วนงาน/ข้อมูลที่เคยบันทึกยังอยู่ครบ
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
              placeholder="เช่น สมหญิง ใจดี"
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
              placeholder="somying@example.com"
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
          <div>
            <Label htmlFor="acc-role">สิทธิ์</Label>
            <Select
              id="acc-role"
              value={newRole}
              onChange={(e) =>
                setNewRole(e.target.value === "admin" ? "admin" : "member")
              }
            >
              <option value="member">สมาชิก — ใช้งานระบบได้ทุกหน้า</option>
              <option value="admin">
                ผู้ดูแลระบบ — เพิ่ม/ลบบัญชีและกำหนดสิทธิ์ได้
              </option>
            </Select>
          </div>
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
