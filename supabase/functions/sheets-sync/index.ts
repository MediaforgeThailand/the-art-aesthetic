// sheets-sync — ดึงยอดขายรายบรรทัดจากชีทสำเนา (DATA — SALES_A แท็บ Raw) เข้า sales_records
//
// เรียกจาก pg_cron ทุกวัน 00:30 UTC (07:30 ไทย) ผ่าน net.http_post — ดู migration 0038
// auth: verify_jwt=false แต่ต้องส่ง header `x-sync-secret` ตรงกับ vault secret 'sheets_sync_secret'
// secrets ทั้งหมดอยู่ใน Vault อ่านผ่าน RPC get_app_secret (service role เท่านั้น):
//   google_sa_key / sheets_sync_secret / sheets_sync_function_url
// flow: อ่านชีทเป็นก้อน → เทลง sheet_sales_staging → apply_sales_sheet_sync (swap atomic)
// ถ้าใกล้หมดเวลา wall-clock จะเรียกตัวเองต่อด้วย start_row เดิม (run_id เดียวกัน)

import { createClient } from "jsr:@supabase/supabase-js@2";

const SHEET_ID = "1qg-AjFILzG3h_aPHNI-Ij_FRXNccwMVtuqBsLLnnhgQ"; // DATA — SALES_A (ชีทสำเนา ไม่ใช่ไฟล์ DA ตรง)
const TAB = "Raw";
const CHUNK_ROWS = 5000;
const INSERT_BATCH = 1000;
// edge function โดน worker limit (CPU) ถ้าทำงานรอบเดียวเยอะเกิน (546) —
// จำกัดแถวต่อ invocation แล้ว chain ตัวเองต่อจนจบ
const MAX_ROWS_PER_INVOCATION = 10_000;

// ตำแหน่งคอลัมน์ในช่วง A:AZ ของแท็บ Raw (0-based) — ถ้า DA เปลี่ยนโครงชีทต้องแก้ตรงนี้
const COL = {
  branch: 1, // B สาขา
  receipt: 2, // C เลขที่ใบเสร็จ
  date: 3, // D วันที่ใบเสร็จ (serial)
  customer: 4, // E Customer
  receiptTotal: 7, // H ยอดขายตามใบเสร็จ
  itemName: 9, // J Name
  qty: 10, // K จำนวน
  amount: 12, // M ยอดขาย (รายบรรทัด)
  sales1: 13, // N Sales 1
  sales2: 14, // O Sales 2
  hn: 15, // P รหัส HN
  leadSource: 17, // R แหล่งที่มา
  nationality: 20, // U สัญชาติ BE
  product: 27, // AB Product
  salesTeam: 30, // AE ทีม Sale1
  group: 32, // AG Group → category
  doctor: 49, // AX ชื่อหมอ
  customerType: 51, // AZ ลูกค้าเก่าใหม่
} as const;

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleToken(sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    ),
  );
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`google token ${res.status}: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

/** serial ของ Google Sheets (epoch 1899-12-30) หรือ string M/D/YYYY → YYYY-MM-DD */
function toISODate(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      let y = Number(m[3]);
      if (y > 2400) y -= 543; // เผื่อกรอกเป็น พ.ศ.
      const mo = String(Number(m[1])).padStart(2, "0");
      const d = String(Number(m[2])).padStart(2, "0");
      return `${y}-${mo}-${d}`;
    }
  }
  return null;
}

const asText = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

const asNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  let runId: string | null = null;
  try {
    const { data: expected } = await admin.rpc("get_app_secret", {
      p_name: "sheets_sync_secret",
    });
    if (!expected || req.headers.get("x-sync-secret") !== expected) {
      return json(401, { error: "unauthorized" });
    }

    const payload = await req.json().catch(() => ({}));
    let startRow: number = Number(payload.start_row) || 2;
    runId = payload.run_id ?? null;

    if (!runId) {
      const { data: run, error } = await admin
        .from("sheet_sync_runs")
        .insert({ status: "running", detail: "เริ่ม sync แท็บ Raw" })
        .select("id")
        .single();
      if (error) throw new Error("เปิด log run ไม่ได้: " + error.message);
      runId = run.id as string;
      const { error: resetErr } = await admin.rpc("reset_sales_sheet_staging");
      if (resetErr) throw new Error("ล้าง staging ไม่ได้: " + resetErr.message);
      startRow = 2;
    }

    const { data: saRaw } = await admin.rpc("get_app_secret", {
      p_name: "google_sa_key",
    });
    if (!saRaw) throw new Error("ไม่พบ google_sa_key ใน vault");
    const token = await googleToken(JSON.parse(saRaw));

    let staged = 0;
    let skipped = 0;
    let row = startRow;
    let done = false;

    while (!done && row - startRow < MAX_ROWS_PER_INVOCATION) {
      const range = encodeURIComponent(`'${TAB}'!A${row}:AZ${row + CHUNK_ROWS - 1}`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(`sheets api ${res.status}: ${body.error?.message ?? ""}`);
      }
      const values: unknown[][] = body.values ?? [];
      if (values.length === 0) {
        done = true;
        break;
      }

      const mapped = [];
      for (const r of values) {
        const record_date = toISODate(r[COL.date]);
        const receipt_no = asText(r[COL.receipt]);
        if (!record_date || !receipt_no) {
          skipped++;
          continue;
        }
        mapped.push({
          record_date,
          branch: asText(r[COL.branch]),
          category: asText(r[COL.group]),
          item_name: asText(r[COL.itemName]),
          quantity: asNum(r[COL.qty]) ?? 1,
          amount: asNum(r[COL.amount]) ?? 0,
          customer_name: asText(r[COL.customer]),
          staff_name: asText(r[COL.sales1]),
          staff_name2: asText(r[COL.sales2]),
          sales_team: asText(r[COL.salesTeam]),
          receipt_no,
          receipt_total: asNum(r[COL.receiptTotal]),
          doctor_name: asText(r[COL.doctor]),
          hn: asText(r[COL.hn]),
          lead_source: asText(r[COL.leadSource]),
          nationality: asText(r[COL.nationality]),
          customer_type: asText(r[COL.customerType]),
          product: asText(r[COL.product]),
        });
      }

      for (let i = 0; i < mapped.length; i += INSERT_BATCH) {
        const { error } = await admin
          .from("sheet_sales_staging")
          .insert(mapped.slice(i, i + INSERT_BATCH));
        if (error) throw new Error("insert staging: " + error.message);
      }
      staged += mapped.length;
      row += CHUNK_ROWS;

      // ชีทตัดแถวว่างท้ายช่วงออกเอง — ได้น้อยกว่าที่ขอ = จบข้อมูลแล้ว
      if (values.length < CHUNK_ROWS) done = true;
    }

    if (!done) {
      // ยังไม่จบ — ส่งไม้ต่อให้ตัวเองรอบใหม่ (คุมงานต่อรอบไม่ให้ชน worker limit)
      await admin
        .from("sheet_sync_runs")
        .update({ detail: `กำลัง sync… ถึงแถว ${row}` })
        .eq("id", runId);
      const { data: selfUrl } = await admin.rpc("get_app_secret", {
        p_name: "sheets_sync_function_url",
      });
      if (!selfUrl) throw new Error("ไม่พบ sheets_sync_function_url ใน vault");
      const chain = fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sync-secret": expected,
        },
        body: JSON.stringify({ run_id: runId, start_row: row }),
      });
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(chain);
      else await chain;
      return json(202, { status: "continuing", next_row: row, staged });
    }

    const { data: applied, error: applyErr } = await admin.rpc(
      "apply_sales_sheet_sync",
    );
    if (applyErr) throw new Error("apply: " + applyErr.message);
    await admin
      .from("sheet_sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_synced: applied,
        detail: `สำเร็จ — ${applied} แถว (ข้ามแถวไม่สมบูรณ์ ${skipped})`,
      })
      .eq("id", runId);
    return json(200, { status: "success", rows: applied, skipped });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (runId) {
      await admin
        .from("sheet_sync_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          detail: message,
        })
        .eq("id", runId);
    }
    return json(500, { error: message });
  }
});
