// ฝั่ง server เท่านั้น — ใช้ createClient ของ server ที่ดึง next/headers (import จาก client จะพัง)
import { createClient } from "./supabase/server";
import type { InfluProductTeam, InfluTagOption } from "./types";

/** หัตถการของเคส (ย่อ) — ใช้หา product team + รหัสโปรของแต่ละเคส */
type ProcedureLite = {
  influencer_id: string;
  product_team: InfluProductTeam;
  promo: { sku: string } | null;
};

/**
 * ตัวเลือกแท็ก influencer ของทีมคอนเทนต์ — **ความจริงแหล่งเดียว** ว่า influ คนไหนแท็กได้
 *
 * เกณฑ์ (ผู้ใช้ 2026-09-01): ทุกเคสที่มีโปรไฟล์และยังเดินงานอยู่ — **ไม่กรอง stage**
 * (เกณฑ์เดิม 2026-08-31 เอาเฉพาะเคสที่ผ่าน Memo แล้ว ทำให้เคสขั้น Memo 17 เคสหายจาก
 * ตัวเลือกทั้งที่ทีมคอนเทนต์เริ่มทำงานได้ตั้งแต่ตอนนั้น — ผู้ใช้แจ้งว่า "มาไม่ครบ") ⇒
 *   - `archived = false` — ข้อมูลเก่าที่นำเข้าจาก Excel (146 เคส) ไม่ใช่ตัวเลือกผูกงาน
 *   - ไม่เอาเคสที่ปฏิเสธ (`declined_at`) — งานไม่เกิด ก็ไม่มีคอนเทนต์ให้แท็ก
 * ทุกเคสมี `person_id` (FK → influ_profiles ตั้งแต่ 0080) จึงแปลว่า "มีโปรไฟล์แล้ว" อยู่ในตัว
 *
 * คืนของที่ใช้ทำแฮชแท็กมาให้ครบในก้อนเดียว (resolve เลขใบ ปว. จากชื่อหมอ + แท็กแคมเปญ)
 * เพื่อให้ฝั่ง client เรียก `influTagHashtags()` ได้เลยโดยไม่ต้องรับทะเบียนหมอ/แคมเปญทั้งชุด
 */
export async function fetchInfluTagOptions(): Promise<InfluTagOption[]> {
  const supabase = await createClient();

  const [influRes, procRes, doctorRes, campaignRes] = await Promise.all([
    supabase
      .from("influencers")
      .select(
        "id, first_name, last_name, nickname, round_no, influ_code, doctor_name, campaign_id, photo_path"
      )
      .eq("archived", false)
      .is("declined_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("influ_procedure_items")
      .select("influencer_id, product_team, promo:promo_packages(sku)"),
    supabase.from("doctors").select("name, license_no"),
    supabase.from("influ_campaign_defs").select("id, tag, name"),
  ]);

  const rows = influRes.data ?? [];
  const procedures = (procRes.data ?? []) as unknown as ProcedureLite[];

  // เลขใบ ปว. จับคู่กับเคสด้วย "ชื่อ" (doctors.name ↔ influencers.doctor_name — คอลัมน์ text ไม่มี FK)
  const licenseByDoctor = new Map<string, string>();
  for (const d of doctorRes.data ?? []) {
    if (d.license_no) licenseByDoctor.set(d.name, d.license_no);
  }

  const campaignById = new Map<string, { tag: string; name: string }>();
  for (const c of campaignRes.data ?? []) {
    campaignById.set(c.id, { tag: c.tag, name: c.name });
  }

  const procByInflu = new Map<string, { teams: InfluProductTeam[]; skus: string[] }>();
  for (const it of procedures) {
    const cur = procByInflu.get(it.influencer_id) ?? { teams: [], skus: [] };
    cur.teams.push(it.product_team);
    if (it.promo?.sku) cur.skus.push(it.promo.sku);
    procByInflu.set(it.influencer_id, cur);
  }

  return rows.map((r) => {
    const procs = procByInflu.get(r.id);
    const campaign = r.campaign_id ? campaignById.get(r.campaign_id) : null;
    return {
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      nickname: r.nickname,
      round_no: r.round_no,
      influ_code: r.influ_code,
      doctor_name: r.doctor_name,
      campaign_id: r.campaign_id,
      photo_path: r.photo_path,
      teams: [...new Set(procs?.teams ?? [])],
      promo_skus: [...new Set(procs?.skus ?? [])],
      doctor_license: r.doctor_name
        ? (licenseByDoctor.get(r.doctor_name) ?? null)
        : null,
      campaign_tag: campaign?.tag ?? null,
      campaign_name: campaign?.name ?? null,
    } satisfies InfluTagOption;
  });
}
