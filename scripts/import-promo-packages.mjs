/**
 * นำเข้าโปร/แพ็กเกจจากไฟล์ Excel ของระบบ POS → ตาราง promo_packages + promo_package_items
 * (แหล่งข้อมูลของหน้าสาธารณะ /price-list — migration 0071)
 *
 * ใช้:
 *   npm i xlsx            # ถูกถอดออกจาก package.json แล้ว ติดตั้งเฉพาะตอนจะ import
 *   IMPORT_EMAIL=... IMPORT_PASSWORD=... node scripts/import-promo-packages.mjs "<ไฟล์.xlsx>"
 *
 * บัญชีที่ใช้ต้องเป็นบัญชีในระบบ (RLS ให้เขียนได้เฉพาะ authenticated) — ห้าม hardcode รหัสผ่านในไฟล์นี้
 *
 * ไฟล์ต้นทางต้องมี 3 ชีท:
 *   "โปรโมชั่น Aesthetics"  = 1 แถว 1 แพ็กเกจ (รหัส, ชื่อ, ประเภท, ราคาขาย, เริ่ม/หมดเขต, เอกสารอนุมัติ)
 *   "โปร-หัตถการ (SKU)"     = แพ็กเกจนั้นประกอบด้วยหัตถการอะไรบ้าง (จำนวน, หน่วย, ราคาเต็มต่อหน่วย)
 *   "หัตถการ Aesthetics"    = Item Master (ใช้เติมชื่อ/ราคา/หน่วย เวลาบรรทัดในชีทที่ 2 ขาด)
 *
 * ⚠️ ชีทต้นทุน (Cost list) **ห้ามนำเข้า** — ตารางปลายทาง anon อ่านได้ผ่านหน้าสาธารณะ
 *
 * ตั้งแต่ migration 0085 สองตารางนี้ mirror ลง sa_promos/sa_promo_items ให้เองด้วย trigger
 * (= ตารางที่แอปขายบน iPad อ่าน) จึงไม่ต้องทำอะไรเพิ่มหลัง import — iPad ดึงใหม่เองทุก 15 นาที
 * ถ้าสงสัยว่าไม่ตรง สั่งซ่อมมือได้ที่ SQL editor:  select promo_mirror_sync();
 *
 * สคริปต์นี้ "ล้างแล้วใส่ใหม่ทั้งชุด": แพ็กเกจที่ทีมแก้เอง/เพิ่มเองในหน้า /pricing (รหัส MANUAL-*)
 * จะถูกเก็บไว้ ส่วนแถวที่มาจากไฟล์จะถูกเขียนทับด้วยข้อมูลใหม่ (จับคู่ด้วยรหัสแพ็กเกจ)
 *
 * ไฟล์ POS บางแถวชื่อโปรกับรายการหัตถการไม่ตรงกัน (ของหลักหาย/จำนวนผิด/ผูกคนละไอเทม)
 * การแก้เก็บไว้ที่ promo-corrections.mjs และใส่กลับทุกครั้งที่นำเข้า — ดูเหตุผลรายข้อในไฟล์นั้น
 */
import fs from "node:fs";
import {
  applyLineFixes,
  composeText,
  fixUnit,
  LINE_FIX,
  NEEDS_TEAM,
  PACK_NORMAL,
  scalePackNormal,
} from "./promo-corrections.mjs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "https://zcoqzasbtgfccuibteji.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "sb_publishable_1COg-C4NN28DNHcOUzj9Jg_YvlwMiJm";
const EMAIL = process.env.IMPORT_EMAIL;
const PASSWORD = process.env.IMPORT_PASSWORD;
const FILE = process.argv[2];

if (!FILE || !EMAIL || !PASSWORD) {
  console.error(
    'ใช้: IMPORT_EMAIL=... IMPORT_PASSWORD=... node scripts/import-promo-packages.mjs "<ไฟล์.xlsx>"'
  );
  process.exit(1);
}

let XLSX;
try {
  XLSX = (await import("xlsx")).default;
} catch {
  console.error('ต้องติดตั้งไลบรารีก่อน: npm i xlsx');
  process.exit(1);
}

/* ---------- อ่านไฟล์ ---------- */
const wb = XLSX.read(fs.readFileSync(FILE), { cellDates: false });
const sheet = (n) => {
  if (!wb.Sheets[n]) {
    console.error(`ไม่พบชีท "${n}" ในไฟล์ — มีชีท: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[n], { raw: false, defval: "" });
};
const packs = sheet("โปรโมชั่น Aesthetics");
const lines = sheet("โปร-หัตถการ (SKU)");
const items = sheet("หัตถการ Aesthetics");

const num = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
const clean = (s) =>
  String(s ?? "")
    // ข้อมูลจากระบบมีสระเอสองตัว (เเ) กับอักขระล่องหนปนมา — ล้างก่อนเก็บ
    .replace(/เเ/g, "แ")
    .replace(/[​-‏﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const itemInfo = new Map(
  items.map((i) => {
    const code = clean(i["Item Code (SKU)"]);
    return [
      code,
      {
        name: clean(i["ชื่อหัตถการ"]),
        price: num(i["ราคา Pricelist (บาท)"]),
        // หน่วยบางตัวลงผิดมาจาก POS (Ulthera/Doublo เป็น "ครั้ง") — ดู promo-corrections.mjs
        unit: fixUnit(code, clean(i["หน่วย"])),
      },
    ];
  })
);
const byPack = new Map();
for (const l of lines) {
  const k = clean(l["Package Code"]);
  if (!byPack.has(k)) byPack.set(k, []);
  byPack.get(k).push(l);
}

/* ---------- หมวดที่ใช้แสดงบนหน้าเว็บ ----------
   กลุ่มในไฟล์กว้างเกินใช้งาน (511/529 เป็น "Aesthetics") จึงแยกหมวดเองจากชื่อโปร+ชื่อหัตถการ
   ทีมแก้หมวดรายตัวได้ที่ /pricing ภายหลัง — การ import ซ้ำจะเขียนทับหมวดที่แก้ไว้ */
const CATEGORY_RULES = [
  [/harmonyca|filler|ฟิลเลอร์|juvelook|rejuran|radiesse|neuramis|elasty|sculptra|therafill|dewy|สลายฟิลเลอร์/i, "Filler & Skin Booster"],
  [/botox|โบท็อก|dysport|hutox|allergan|xeomin/i, "Botox"],
  [/iv ?drip|ดริป/i, "IV Drip"],
  [/กำจัดขน/i, "กำจัดขนถาวร"],
  [/ultraformer|ulthera|oligio|doublo|liftera|hifu|thermage|therma|venus|onda|q-?jet|เทอร์มา/i, "เครื่องยกกระชับ"],
  [/pico|q-?switch|qswitch|fraxel|inskin|ipl|จี้ไฝ|จี้กระ|เลเซอร์|laser|ลบรอยสัก/i, "เลเซอร์ผิวหน้า"],
  [/เมโส|meso|tranxamin|transamin|hayyan|princess white|celebity|celebrity glow|glow|whitening|white label|บูสเตอร์|booster|aura|miracle white/i, "เมโส & ผิวขาว"],
  [/prp|fresh zell|made collagen|enduremax|skin lab test|diamond baby face|stem|เกล็ดเลือด/i, "ฟื้นฟูผิวเฉพาะทาง"],
  [/pro fresh|pro bright|pro firm|pro clear|pro calm|6 ?step|program celebrity|hydro radiance|ผิวดารา|gold facial|duo face bright|subsition|โปรแกรม/i, "โปรแกรมดูแลผิวหน้า"],
  [/ร้อยไหม|thread|silhouette/i, "ร้อยไหม"],
  [/fat|ไขมัน|slim|สัดส่วน|coolsculpt/i, "ลดสัดส่วน"],
  [/นวด|massage|spa/i, "นวด & ผ่อนคลาย"],
  [/hbot|ออกซิเจน|vitamin|วิตามิน/i, "ฟื้นฟูสุขภาพ"],
  [/สิว|acne|หน้าใส|มาส์ก|mask|ฉายแสง|opera|กดสิว|carboxy|glass skin|คีลอยด์|แผลเป็น|ผลักวิตามิน|treatment/i, "ดูแลผิวหน้า & สิว"],
];
/** แท็บ ฉีด/ทรีตเม้น/เครื่อง — ดูจากหัตถการในโปร (แพ็กเกจรวมติดได้หลายกลุ่ม) */
const GROUP_RULES = [
  [/botox|dysport|hutox|allergan|filler|ฟิลเลอร์|juvelook|rejuran|radiesse|neuramis|elasty|sculptra|therafill|dewy|harmonyca|เมโส|meso|tranxamin|transamin|hayyan|drip|ดริป|prp|fresh zell|made collagen|ฉีด|booster|บูสเตอร์|vitamin|วิตามิน|ร้อยไหม|thread/i, "injection"],
  [/ultraformer|ulthera|oligio|doublo|liftera|hifu|thermage|therma|venus|onda|q-?jet|pico|q-?switch|qswitch|diode|ipl|laser|เลเซอร์|fraxel|inskin|จี้ไฝ|จี้กระ|ฉายแสง|opera|enduremax|เครื่อง/i, "device"],
];

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
}).format(new Date());

const rows = [];
const fixedPacks = [];
for (const p of packs) {
  const sku = clean(p["Package Code (SKU)"]);
  const end = clean(p["หมดเขต"]);
  if (end !== "" && end < today) continue; // หมดเขตไปแล้ว — ไม่ต้องขึ้นหน้าเว็บ

  const raw = (byPack.get(sku) ?? []).map((l) => {
    const isku = clean(l["Item Code (SKU)"]);
    const info = itemInfo.get(isku);
    return {
      item_sku: isku || null,
      item_name: clean(l["ชื่อหัตถการ-ไอเทม"]) || info?.name || "",
      qty: num(l["จำนวน"]),
      unit: fixUnit(isku, clean(l["หน่วย"]) || info?.unit || null),
      unit_price: num(l["ราคาเต็ม-หน่วย (Price list)"]) || info?.price || null,
    };
  });
  // ใส่การแก้ที่ต้นทางยังไม่ได้แก้ (ของหลักหาย/จำนวนผิด/ผูกคนละไอเทม)
  const { lines: fixed, applied } = applyLineFixes(sku, raw, itemInfo);
  // แพ็กเกจแบบซื้อจำนวน: ราคาปกติต้องเป็นราคาของแพ็กเกจตามไฟล์ราคา ไม่ใช่ (จำนวน × ราคาต่อหน่วย)
  const { lines: ls, applied: scaled } = scalePackNormal(sku, fixed);
  if (scaled) applied.push(scaled);
  if (applied.length) fixedPacks.push({ sku, name: clean(p["ชื่อโปรโมชั่น"]), applied });
  const full = ls.reduce((s, l) => s + l.qty * (l.unit_price ?? 0), 0);
  const single = ls.length === 1 ? ls[0] : null;
  const catText = `${clean(p["ชื่อโปรโมชั่น"])} ${ls.map((l) => l.item_name).join(" ")}`;
  const groups = new Set();
  for (const n of [clean(p["ชื่อโปรโมชั่น"]), ...ls.map((l) => l.item_name)])
    for (const [re, key] of GROUP_RULES) if (re.test(n)) groups.add(key);
  if (groups.size === 0) groups.add("treatment");

  const sale = num(p["ราคาขาย (บาท)"]);
  rows.push({
    sku,
    name: clean(p["ชื่อโปรโมชั่น"]),
    category:
      ls.length > 1
        ? "แพ็กเกจรวมหลายหัตถการ"
        : (CATEGORY_RULES.find(([re]) => re.test(catText))?.[1] ?? "อื่นๆ"),
    groups: [...groups],
    kind: p["ประเภทรายการ"] === "โปรโมชั่นปี 2569" ? "promo" : "package",
    sale_price: sale,
    full_price: full > 0 ? full : null,
    starts_on: clean(p["เริ่มขาย"]) || null,
    ends_on: end || null,
    base_item_sku: single?.item_sku ?? null,
    base_item_name: single
      ? (itemInfo.get(single.item_sku)?.name ?? single.item_name)
      : null,
    base_qty: single?.qty ?? null,
    base_unit: single?.unit ?? null,
    base_unit_price: single?.unit_price ?? null,
    memo: clean(p["เอกสารอนุมัติ (Memo)"]) || null,
    // ราคา 0 = ของแถม/เงื่อนไขลูกค้าเก่า ไม่ใช่ของขาย — นำเข้าไว้แต่ปิดไม่ให้ขึ้นหน้าเว็บ
    active: sale > 0,
    items: ls,
  });
}
console.log(`อ่านไฟล์ได้ ${rows.length} แพ็กเกจ (ตัดที่หมดเขตก่อน ${today} ออกแล้ว)`);

/* ---------- รายงานการแก้ที่ใส่กลับเข้าไป ----------
   ต้องเห็นทุกครั้งที่นำเข้า ไม่ใช่แก้เงียบ ๆ — จะได้รู้ว่าเมื่อไรต้นทางแก้เองแล้ว */
if (fixedPacks.length) {
  console.log(`\n=== แก้ข้อมูลที่ผิดมาจากไฟล์ POS ${fixedPacks.length} แพ็กเกจ (promo-corrections.mjs) ===`);
  for (const f of fixedPacks)
    for (const a of f.applied) console.log(`  [${f.sku}] ${f.name}\n      ${a.kind}: ${a.why}`);
}
const untouched = [
  ...LINE_FIX.map((f) => f.pkg),
  ...Object.keys(PACK_NORMAL),
]
  .filter((pkg, i, a) => a.indexOf(pkg) === i)
  .filter((pkg) => !fixedPacks.some((p) => p.sku === pkg))
  .map((pkg) => ({ pkg }));
if (untouched.length)
  console.log(
    `\n⚠ มี ${untouched.length} ข้อใน promo-corrections.mjs ที่ไม่ได้ใช้ ` +
      `(${[...new Set(untouched.map((f) => f.pkg))].join(", ")}) — โปรอาจหมดเขตหรือต้นทางแก้แล้ว ควรตรวจแล้วลบออก`
  );
if (NEEDS_TEAM.length) {
  console.log(`\n=== ยังแก้ไม่ได้ ต้องให้ทีมชี้ขาด (${NEEDS_TEAM.length}) ===`);
  for (const n of NEEDS_TEAM) console.log(`  [${n.pkg}] ${n.why}`);
}
console.log("");

/* ---------- เขียนลง DB ---------- */
const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!auth.ok) {
  console.error(`ล็อกอินไม่สำเร็จ ${auth.status}: ${await auth.text()}`);
  process.exit(1);
}
const { access_token } = await auth.json();
const H = {
  apikey: SUPABASE_KEY,
  authorization: `Bearer ${access_token}`,
  "content-type": "application/json",
};
const call = async (path, opts) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r;
};

// ลบเฉพาะแถวที่มาจากไฟล์ (รหัสขึ้นต้น PK) — ของที่ทีมสร้างเอง (MANUAL-*) ไม่ถูกแตะ
await call("promo_packages?sku=like.PK*", { method: "DELETE", headers: H });

for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100).map((o, j) => {
    const { items: _items, ...rest } = o;
    return { ...rest, sort: i + j };
  });
  await call("promo_packages?on_conflict=sku", {
    method: "POST",
    headers: { ...H, prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(chunk),
  });
}
console.log(`บันทึกแพ็กเกจ ${rows.length} รายการ`);

const idRes = await call("promo_packages?select=id,sku&limit=5000", { headers: H });
const idBySku = new Map((await idRes.json()).map((r) => [r.sku, r.id]));
const itemRows = rows.flatMap((o) =>
  o.items.map((it, k) => ({ ...it, package_id: idBySku.get(o.sku), position: k }))
);
const orphan = itemRows.filter((r) => !r.package_id);
if (orphan.length) {
  console.error(`หา package_id ไม่เจอ ${orphan.length} บรรทัด — หยุดก่อน`);
  process.exit(1);
}
for (let i = 0; i < itemRows.length; i += 200) {
  await call("promo_package_items", {
    method: "POST",
    headers: { ...H, prefer: "return=minimal" },
    body: JSON.stringify(itemRows.slice(i, i + 200)),
  });
}
console.log(`บันทึกรายการหัตถการในแพ็กเกจ ${itemRows.length} บรรทัด — เสร็จ`);
