import type { AppPermission } from "@/lib/database.types";
import type { Access } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

// re-export ของฝั่ง client-safe เพื่อให้หน้าเพจ import จากที่เดียว
export {
  PERMISSION_META,
  ALL_PERMISSIONS,
  hasPermission,
  influLevel,
  canViewInflu,
  canEditInflu,
  canManageInflu,
  canDeleteInflu,
  INFLU_LEVELS,
  type Access,
  type InfluLevel,
} from "@/lib/permissions";

/** อ่าน role + permissions ของผู้ใช้ปัจจุบันฝั่ง server (ใช้ guard หน้าเพจ) */
export async function getAccess(): Promise<Access> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!uid) return { uid: null, name: null, isAdmin: false, permissions: [] };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions, full_name, email")
    .eq("id", uid)
    .single();

  return {
    uid,
    name: profile?.full_name ?? profile?.email ?? null,
    isAdmin: profile?.role === "admin",
    permissions: (profile?.permissions ?? []) as AppPermission[],
  };
}
