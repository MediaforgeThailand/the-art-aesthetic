/**
 * เติม sa_items.includes = "ของที่ได้ในโปรแกรม" จากไฟล์ Excel ราคา (migration 0076)
 *
 * ใช้:
 *   npm i xlsx            # ถูกถอดออกจาก package.json แล้ว ติดตั้งเฉพาะตอนจะ import
 *   IMPORT_EMAIL=... IMPORT_PASSWORD=... node scripts/import-item-includes.mjs "<Aesthetic Price List 2026.xlsx>"
 *   # ใส่ --dry เพื่อดูผลจับคู่เฉย ๆ ไม่เขียนฐานข้อมูล
 *
 * ทำไมต้องมีสคริปต์นี้:
 * ช่อง Item Name (คอลัมน์ B) ของไฟล์ราคาใส่มาทีเดียวหลายบรรทัด บรรทัดแรกคือชื่อหัตถการ
 * บรรทัดที่เหลือคือหัตถการที่ได้รับข้างใน เช่น
 *     โปรแกรมผิวดารา
 *     - Pico Smooth
 *     - Celebrit Glow
 *     - Princess White
 * การนำเข้ารอบก่อนใช้ clean() ที่ยุบช่องว่างทั้งหมดรวมถึง \n จึงเหลือแต่บรรทัดแรก
 * ของข้างในหายหมด แอปขายเลยบอกลูกค้าไม่ได้ว่าโปรแกรมประกอบด้วยอะไร
 *
 * สคริปต์นี้ตั้งใจ "รายงานทุกแถวที่จับคู่ไม่ได้" ไม่เงียบ — ของที่ตกหล่นต้องเห็น
 */
import fs from "node:fs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "https://zcoqzasbtgfccuibteji.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "sb_publishable_1COg-C4NN28DNHcOUzj9Jg_YvlwMiJm";
const EMAIL = process.env.IMPORT_EMAIL;
const PASSWORD = process.env.IMPORT_PASSWORD;
const DRY = process.argv.includes("--dry");
const FILE = process.argv.slice(2).find((a) => !a.startsWith("--"));
const SHEET = "Aesthetic Price List 2026";

if (!FILE || (!DRY && (!EMAIL || !PASSWORD))) {
  console.error(
    'ใช้: IMPORT_EMAIL=... IMPORT_PASSWORD=... node scripts/import-item-includes.mjs "<ไฟล์.xlsx>" [--dry]'
  );
  process.exit(1);
}

let XLSX;
try {
  XLSX = (await import("xlsx")).default;
} catch {
  console.error("ต้องติดตั้งไลบรารีก่อน: npm i xlsx");
  process.exit(1);
}

/* ---------- normalise ---------- */
// เหมือน clean() ของ import-promo-packages.mjs แต่ "ห้าม" ยุบ \n ทิ้ง — นั่นคือต้นเหตุ
const norm = (s) =>
  String(s ?? "")
    .replace(/เเ/g, "แ")
    .replace(/[​-‏﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

/** คีย์เทียบชื่อ — ตัดตัวพิมพ์ ช่องว่าง และหางที่ไม่ใช่สาระ ("1 ครั้ง", "(Pico)") ออก */
const key = (s) =>
  norm(s)
    .toLowerCase()
    .replace(/\(\s*(pico|q\s*switch|q-switch)\s*\)/g, "") // รุ่นย่อยของตัวเดียวกัน
    .replace(/\(?\s*(คอร์ส\s*)?\d+\s*ครั้ง\s*\)?/g, "")
    .replace(/[()[\]]/g, "")
    .replace(/[\s\-–—•.,/]/g, "")
    .trim();

/**
 * ชื่อในไฟล์กับชื่อใน sa_items เขียนคนละแบบจนเทียบอัตโนมัติไม่ได้ — ผูกด้วยรหัสตรง ๆ
 * ตั้งใจให้เป็นตารางที่คนรีวิวได้ ดีกว่า fuzzy match ที่จับผิดตัวแล้วไม่มีใครรู้
 */
const ALIAS = {
  "• Doublo S": "AES-6811032",
  "• Doublo M": "AES-6811033",
  "• Double L": "AES-6811034",
  "• Double XL": "AES-6811035",
  "Set สุดคุ้ม1": "AES-6811015",
  "Set สุดคุ้ม 2": "AES-6812015",
  "โปรหน้า V Glow Up ประกอบด้วย": "AES-6811014",
};

/** รหัสซ้ำของโปรแกรมเดียวกัน (ชื่อเก่า/ชื่อใหม่) — ต้องบอกของข้างในเหมือนกัน */
const SAME_AS = {
  "AES-6811027": "AES-6811030", // เสริมความงาม 6 Steps - Vita Plus  = โปรแกรม Vita Plus 6 STEP
  "AES-6811028": "AES-6811031", // เสริมความงาม 6 Steps - Firming    = โปรแกรม Firming Skin 6 STEP
};

/* ---------- 1. อ่านไฟล์ ---------- */
const wb = XLSX.read(fs.readFileSync(FILE), { cellDates: false });
if (!wb.Sheets[SHEET]) {
  console.error(`ไม่พบชีท "${SHEET}" — มีชีท: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], {
  raw: false,
  defval: "",
  header: 1,
});

const groups = new Map(); // key -> { head, variants: string[][] }
let multi = 0;
for (const r of rows) {
  const parts = String(r[1] ?? "")
    .split(/\r?\n/)
    .map(norm)
    .filter(Boolean);
  if (parts.length < 2) continue;
  multi++;
  // ตัดสัญลักษณ์นำหน้า (- • *) ทิ้ง · เลขข้อ/STEP เก็บไว้ตามไฟล์
  const sub = parts
    .slice(1)
    .map((l) => norm(l.replace(/^[-–—•*]+\s*/, "")))
    .filter(Boolean);
  if (!sub.length) continue;
  const k = key(parts[0]);
  if (!k) continue;
  const g = groups.get(k);
  if (g) g.variants.push(sub);
  else groups.set(k, { head: parts[0], variants: [sub] });
}

/** รวมรุ่นย่อยที่ใช้ชื่อเดียวกัน — ตำแหน่งที่ต่างกันกลายเป็น "A หรือ B" */
const merge = (variants) => {
  if (variants.length === 1) return variants[0];
  const n = Math.max(...variants.map((v) => v.length));
  const out = [];
  for (let i = 0; i < n; i++) {
    const alts = [...new Set(variants.map((v) => v[i]).filter(Boolean))];
    if (alts.length) out.push(alts.join(" หรือ "));
  }
  return out;
};

/* ---------- 2. ดึง sa_items ---------- */
const rest = async (path, init) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${TOKEN ?? SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

let TOKEN = null;
const items = await rest("sa_items?select=code,name,sku_id");

/* ---------- 3. จับคู่ ---------- */
const byCode = new Map(items.map((i) => [i.code, i]));
const matched = [];
const used = new Set();
for (const it of items) {
  const g = groups.get(key(it.name));
  if (!g || used.has(key(it.name))) continue;
  used.add(key(it.name));
  matched.push({ code: it.code, name: it.name, includes: merge(g.variants) });
}
for (const [head, code] of Object.entries(ALIAS)) {
  const k = key(head);
  const g = groups.get(k);
  const it = byCode.get(code);
  if (!g) { console.warn(`⚠ ALIAS: ไม่พบหัวข้อ "${head}" ในไฟล์แล้ว`); continue; }
  if (!it) { console.warn(`⚠ ALIAS: ไม่พบรหัส ${code} ใน sa_items`); continue; }
  if (used.has(k)) continue;
  used.add(k);
  matched.push({ code: it.code, name: it.name, includes: merge(g.variants) });
}
const byMatched = new Map(matched.map((m) => [m.code, m.includes]));
for (const [dst, src] of Object.entries(SAME_AS)) {
  const inc = byMatched.get(src);
  const it = byCode.get(dst);
  if (!inc || !it || byMatched.has(dst)) continue;
  matched.push({ code: it.code, name: it.name, includes: inc });
}

const leftover = [...groups.entries()]
  .filter(([k]) => !used.has(k))
  .map(([, g]) => ({ head: g.head, includes: merge(g.variants) }));

/* ---------- 4. รายงาน ---------- */
console.log(`ไฟล์: Item Name หลายบรรทัด ${multi} แถว → ${groups.size} ชื่อ`);
console.log(`sa_items: ${items.length} แถว · จับคู่ได้ ${matched.length} แถว\n`);
for (const m of matched) console.log(`  ✓ [${m.code}] ${m.name}\n      ${m.includes.join(" · ")}`);
console.log(`\nยังไม่มีที่ลง (${leftover.length}) — ไม่มีแถวใน sa_items ที่ชื่อตรง:`);
for (const l of leftover) console.log(`  – ${l.head}\n      ${l.includes.join(" · ")}`);

if (DRY) { console.log("\n--dry: ไม่เขียนฐานข้อมูล"); process.exit(0); }

/* ---------- 5. เขียนกลับ ---------- */
const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!auth.ok) { console.error("ล็อกอินไม่สำเร็จ:", await auth.text()); process.exit(1); }
TOKEN = (await auth.json()).access_token;

let n = 0;
for (const m of matched) {
  await rest(`sa_items?code=eq.${encodeURIComponent(m.code)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ includes: m.includes }),
  });
  n++;
}
console.log(`\nอัปเดต sa_items.includes แล้ว ${n} แถว`);
