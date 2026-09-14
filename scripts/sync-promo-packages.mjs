/**
 * ซิงก์โปร/แพ็กเกจจาก "ไฟล์ทะเบียนไอเทมดิบของ POS" → promo_packages (หน้า /price-list)
 *
 * ใช้:
 *   npm i xlsx            # ถูกถอดออกจาก package.json แล้ว ติดตั้งเฉพาะตอนจะซิงก์
 *   node scripts/sync-promo-packages.mjs "<ตัวอย่าง ไอเทมขาย Package.xlsx>" --dry
 *   node scripts/sync-promo-packages.mjs "<ไฟล์.xlsx>" --sql out.sql          # เขียนเป็น SQL ไว้รีวิว/รันเอง
 *   IMPORT_EMAIL=... IMPORT_PASSWORD=... node scripts/sync-promo-packages.mjs "<ไฟล์.xlsx>"
 *
 * ── ต่างกับ import-promo-packages.mjs ยังไง (อ่านก่อนใช้) ─────────────────────────
 * `import-promo-packages.mjs` กินไฟล์ **ที่ผ่านการวิเคราะห์แล้ว** (ชีท "โปรโมชั่น Aesthetics" /
 * "โปร-หัตถการ (SKU)" / "หัตถการ Aesthetics") แล้ว **ล้าง PK% ทิ้งทั้งชุดก่อนใส่ใหม่**
 *
 * ไฟล์นี้กิน **ไฟล์ดิบจาก POS** (ชีท "Package(ต้นฉบับ)" + "Item Master") ซึ่งทีมส่งมาให้ตรง ๆ
 * ไฟล์ดิบ **ไม่มีชีทองค์ประกอบของโปรที่ยังขายอยู่** (มีแต่ "Inactive Simulation" ของโปรที่ปิดไปแล้ว)
 * ⇒ สร้าง promo_package_items / ราคาเต็ม ของโปรใหม่จากไฟล์นี้ไม่ได้ จึงต้องเป็น "ซิงก์เพิ่มทีละส่วน"
 * ไม่ใช่ล้างแล้วใส่ใหม่ ไม่งั้นองค์ประกอบ + ราคาเต็มของ 491 ใบที่มีอยู่จะหายทั้งหมด
 *
 *   แถวที่มีอยู่แล้ว → อัพเดทเฉพาะ ชื่อ/ราคาขาย/วันเริ่ม/วันหมดเขต/เลขอนุมัติ
 *                      (ห้ามแตะ full_price, base_*, items — ของพวกนี้ไม่มีในไฟล์ดิบ)
 *   แถวใหม่          → เพิ่มใหม่ พร้อมหมวด/กลุ่ม/ประเภทที่แยกจากชื่อ
 *                      องค์ประกอบใส่ให้เฉพาะใบที่อยู่ใน NEW_COMPOSITION ข้างล่าง
 *
 * ⚠️ ชีท "Cost" ในไฟล์ดิบ **ห้ามนำเข้า** — promo_packages เปิดให้ anon อ่านผ่านหน้าสาธารณะ
 *
 * promo_packages/promo_package_items mirror ลง sa_promos/sa_promo_items เองด้วย trigger
 * (migration 0119) — ของที่ซิงก์ที่นี่ถึง iPad ของทีมขายเองภายใน 15 นาที ไม่ต้องทำอะไรเพิ่ม
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

const ARGV = process.argv.slice(2);
const FILE = ARGV.find((a) => !a.startsWith("--"));
const DRY = ARGV.includes("--dry");
const SQL_OUT = ARGV[ARGV.indexOf("--sql") + 1];
const WANT_SQL = ARGV.includes("--sql");

if (!FILE) {
  console.error('ใช้: node scripts/sync-promo-packages.mjs "<ไฟล์.xlsx>" [--dry|--sql out.sql]');
  process.exit(1);
}
if (!DRY && !WANT_SQL && (!EMAIL || !PASSWORD)) {
  console.error("ต้องมี IMPORT_EMAIL/IMPORT_PASSWORD ถ้าจะเขียนฐานข้อมูลจริง (หรือใส่ --dry / --sql)");
  process.exit(1);
}

let XLSX;
try {
  XLSX = (await import("xlsx")).default;
} catch {
  console.error("ต้องติดตั้งไลบรารีก่อน: npm i xlsx");
  process.exit(1);
}

/* ---------- normalise ----------
   ข้อมูลจาก POS พิมพ์ไทยผิดรูป 2 แบบที่ตาเห็นเหมือนกันเป๊ะแต่คนละอักขระ
   (ดู data cleanup 2026-09-10 ใน AGENTS.md) — ต้องล้างก่อนเก็บ ไม่งั้นค้นไม่เจอ
   และแถวเดิมในฐานที่ล้างแล้วจะถูกเขียนทับกลับเป็นตัวผิด */
const clean = (s) =>
  String(s ?? "")
    .replace(/เเ/g, "แ") // สระเอ 2 ตัว → สระแอ
    .replace(/ํา/g, "ำ") // นิคหิต+สระอา → สระอำ
    .replace(/[​-‏﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const num = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
/** เลขเอกสารอนุมัติ — POS พิมพ์ขีดมาหลายแบบ ("MM-MKT759/2568", "MM – MKT793/2568",
    "MM - MDF019/2026") ทั้งที่เป็นรูปแบบเดียวกัน · ยุบให้เหลือแบบเดียวจะได้เทียบ/ค้นเจอ */
const memoOf = (s) => clean(s).replace(/\s*[–—-]\s*/g, "-") || null;
const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
/** "1-Feb-2026" → "2026-02-01" · ว่าง → null · รูปแบบแปลก → โยน error (ห้ามเดา) */
const isoDate = (s, where) => {
  const v = clean(s);
  if (!v) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  throw new Error(`อ่านวันที่ไม่ออก "${v}" ที่ ${where}`);
};

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

/* ---------- อ่านไฟล์ ---------- */
const wb = XLSX.read(fs.readFileSync(FILE), { cellDates: false });
const grid = (n) => {
  if (!wb.Sheets[n]) {
    console.error(`ไม่พบชีท "${n}" — ไฟล์นี้มีชีท: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[n], { raw: false, defval: "", header: 1 });
};

// ชีทแพ็กเกจ: แถว 0 = หัวตาราง, แถว 1 = คำอธิบายของหัวตาราง, แถว 2+ = ข้อมูล
// คอลัมน์แรก (รหัสแพ็กเกจ) ไม่มีชื่อหัวในไฟล์ จึงอ้างด้วยตำแหน่ง 0
const pkGrid = grid("Package(ต้นฉบับ)");
const PH = pkGrid[0].map((h) => clean(h));
const pcol = (name) => {
  const i = PH.indexOf(name);
  if (i < 0) {
    console.error(`ชีทแพ็กเกจไม่มีคอลัมน์ "${name}" — หัวตารางที่เจอ: ${PH.join(" | ")}`);
    process.exit(1);
  }
  return i;
};
const P = {
  name: pcol("PackageName"),
  price: pcol("ราคา Pricelist"),
  group: pcol("Product Group Name"),
  itemGroup: pcol("Item Group"),
  uom: pcol("UoM Group"),
  start: pcol("Package : Start Date"),
  end: pcol("Package : End Date"),
  memo: pcol("Memo"),
};
const filePkgs = pkGrid
  .slice(2)
  .filter((r) => clean(r[0]))
  .map((r) => ({
    sku: clean(r[0]),
    name: clean(r[P.name]),
    price: num(r[P.price]),
    group: clean(r[P.group]),
    itemGroup: clean(r[P.itemGroup]),
    unit: clean(r[P.uom]) || null,
    starts_on: isoDate(r[P.start], `${clean(r[0])} (เริ่มขาย)`),
    ends_on: isoDate(r[P.end], `${clean(r[0])} (หมดเขต)`),
    memo: memoOf(r[P.memo]),
  }));

// Item Master — ใช้เติมราคาเต็ม/หน่วยของบรรทัดใน NEW_COMPOSITION
const imGrid = grid("Item Master");
const IH = imGrid[0].map((h) => clean(h));
const icol = (n) => IH.indexOf(n);
const fileItems = new Map(
  imGrid
    .slice(2)
    .filter((r) => clean(r[0]))
    .map((r) => [
      clean(r[0]),
      {
        sku: clean(r[0]),
        name: clean(r[icol("ItemName")]),
        price: num(r[icol("ราคา Pricelist")]),
        unit: clean(r[icol("UoM Group")]) || null,
        type: clean(r[icol("Type")]),
      },
    ])
);

/* ---------- ขอบเขต ----------
   เอาเฉพาะแพ็กเกจที่ลงบัญชีเป็นการขายฝั่ง Aesthetics — หน้า /price-list เป็นเมนูของแผนกนี้
   ศัลยกรรม (Sales Sur._*) / อาหารเสริม (Sales Goods_*) ไม่ขึ้นหน้านี้
   ใช้ Item Group แทน Product Group Name เพราะ Product Group แตกเป็นชื่อเครื่อง/หัตถการ
   (Aesthetics, Filler, Botox, Aesthetics Laser, Ultraformer lll, …) ซึ่งงอกใหม่ได้เรื่อย ๆ */
const AES_ITEM_GROUP = "Sales Aes._เสริมความงาม";
const scoped = filePkgs.filter((p) => p.itemGroup === AES_ITEM_GROUP);
const live = scoped.filter((p) => !p.ends_on || p.ends_on >= today);

/** รหัสรุ่นในเลขแพ็กเกจ — PKAES-**6909**001 = ปี 69 เดือน 09 */
const genOf = (sku) => Number((sku.split("-")[1] ?? "").slice(0, 4)) || 0;
/** ประเภท: รหัสรุ่น ≥ 6901 = โปรที่อนุมัติระหว่างปี · ต่ำกว่านั้น = แพ็กเกจยืนพื้น
    (ตรวจกับ 491 แถวที่นำเข้าไว้แล้ว ตรงกันทุกแถว) */
const kindOf = (sku) => (genOf(sku) >= 6901 ? "promo" : "package");
/** ลำดับที่จะขึ้นหน้าเว็บ: รุ่นใหม่สุดก่อน แล้วเรียงตามเลขในรุ่น
    (ของเดิมในฐานก็เรียงแบบนี้ — โปรรอบล่าสุดอยู่บนสุดของหมวด) */
const newestFirst = (a, b) => genOf(b.sku) - genOf(a.sku) || (a.sku < b.sku ? -1 : 1);

/* ---------- หมวด/กลุ่มบนหน้าเว็บ (ชุดเดียวกับ import-promo-packages.mjs) ---------- */
const CATEGORY_RULES = [
  // profhilo/karisma/reverse/integration = สารกระตุ้นคอลลาเจนแบบฉีดรุ่นใหม่ (ขึ้นระบบ ก.ย. 69)
  [/harmonyca|filler|ฟิลเลอร์|juvelook|rejuran|radiesse|neuramis|elasty|sculptra|therafill|dewy|skinvive|yvoire|profhilo|karisma|integration|reverse|สลายฟิลเลอร์/i, "Filler & Skin Booster"],
  [/botox|โบท็อก|dysport|hutox|allergan|xeomin/i, "Botox"],
  [/iv ?drip|ดริป/i, "IV Drip"],
  [/กำจัดขน/i, "กำจัดขนถาวร"],
  [/ultraformer|ulthera|oligio|doublo|liftera|hifu|thermage|therma|venus|onda|q-?jet|เทอร์มา/i, "เครื่องยกกระชับ"],
  [/pico|q-?switch|qswitch|fraxel|inskin|ipl|จี้ไฝ|จี้กระ|เลเซอร์|laser|ลบรอยสัก/i, "เลเซอร์ผิวหน้า"],
  [/เมโส|meso|tranxamin|transamin|hayyan|princess white|celebity|celebrity glow|glow|whitening|white label|บูสเตอร์|booster|aura|miracle white/i, "เมโส & ผิวขาว"],
  [/prp|fresh zell|made collagen|enduremax|skin lab test|diamond baby face|stem|nk cell|เกล็ดเลือด/i, "ฟื้นฟูผิวเฉพาะทาง"],
  [/pro fresh|pro bright|pro firm|pro clear|pro calm|6 ?step|program celebrity|hydro radiance|ผิวดารา|gold facial|duo face bright|subsition|โปรแกรม/i, "โปรแกรมดูแลผิวหน้า"],
  [/ร้อยไหม|thread|silhouette/i, "ร้อยไหม"],
  [/fat|ไขมัน|slim|สัดส่วน|coolsculpt/i, "ลดสัดส่วน"],
  [/นวด|massage|spa/i, "นวด & ผ่อนคลาย"],
  [/hbot|ออกซิเจน|vitamin|วิตามิน/i, "ฟื้นฟูสุขภาพ"],
  [/สิว|acne|หน้าใส|มาส์ก|mask|ฉายแสง|opera|กดสิว|carboxy|glass skin|คีลอยด์|แผลเป็น|ผลักวิตามิน|treatment/i, "ดูแลผิวหน้า & สิว"],
];
const GROUP_RULES = [
  [/botox|dysport|hutox|allergan|filler|ฟิลเลอร์|juvelook|rejuran|radiesse|neuramis|elasty|sculptra|therafill|dewy|harmonyca|skinvive|yvoire|profhilo|karisma|integration|reverse|เมโส|meso|tranxamin|transamin|hayyan|drip|ดริป|prp|fresh zell|made collagen|ฉีด|booster|บูสเตอร์|vitamin|วิตามิน|ร้อยไหม|thread/i, "injection"],
  [/ultraformer|ulthera|oligio|doublo|liftera|hifu|thermage|therma|venus|onda|q-?jet|pico|q-?switch|qswitch|diode|ipl|laser|เลเซอร์|fraxel|inskin|จี้ไฝ|จี้กระ|ฉายแสง|opera|enduremax|เครื่อง/i, "device"],
];

/**
 * องค์ประกอบของโปรใหม่ที่ "อ่านออกจากชื่อได้ตรง ๆ และตรวจยอดแล้ว"
 *
 * ไฟล์ดิบไม่มีชีทองค์ประกอบ จึงเติมให้เฉพาะใบที่ชื่อโปรระบุจำนวน+ชื่อไอเทมตรงกับ
 * Item Master แบบไม่ต้องตีความ (เช่น "โปรโมชัน Profhilo 2 กล่อง" = Profhilo × 2)
 * ทุกข้อตรวจแล้วว่า จำนวน × ราคา Pricelist ของไอเทม > ราคาขาย และส่วนลดอยู่ในช่วงที่สมเหตุสมผล
 *
 * ⚠️ ห้ามเดาใบที่ชื่อไม่ได้บอกของข้างใน (เช่น "Year End Power Lift", "Superstar Skin Year End")
 * ใบพวกนั้นปล่อยให้ราคาเต็มเป็นว่างไว้ (หน้าเว็บจะไม่โชว์ป้าย % ลด) แล้วให้ทีมกรอก
 * "ได้อะไรบ้าง" เองที่ /pricing ซึ่งเป็นเจ้าของข้อมูลตัวจริง
 */
export const NEW_COMPOSITION = {
  // ── ซื้อหลายชิ้นของไอเทมเดียว · ราคาเต็ม = จำนวน × ราคา Pricelist ──────────────
  "PKAES-6909014": { lines: [["AES-6909003", 2]] }, // Integration 2 กล่อง   17,800 / เต็ม 19,800
  "PKAES-6909015": { lines: [["AES-6909003", 3]] }, // Integration 3 กล่อง   23,700 / เต็ม 29,700
  "PKAES-6909016": { lines: [["AES-6909005", 2]] }, // Profhilo 2 กล่อง      44,000 / เต็ม 49,800
  "PKAES-6909017": { lines: [["AES-6909005", 3]] }, // Profhilo 3 กล่อง      60,000 / เต็ม 74,700
  "PKAES-6909018": { lines: [["AES-6909007", 2]] }, // Reverse 2 ขวด          8,000 / เต็ม  9,800
  "PKAES-6909019": { lines: [["AES-6909007", 3]] }, // Reverse 3 ขวด         10,500 / เต็ม 14,700
  "PKAES-6909020": { lines: [["AES-6909009", 2]] }, // Karisma Collagen 2 กล่อง 44,000 / เต็ม 49,800
  "PKAES-6909021": { lines: [["AES-6909009", 3]] }, // Karisma Collagen 3 กล่อง 60,000 / เต็ม 74,700
  // Yvoire มีไอเทมราคาขั้นบันไดใน Item Master (ซื้อ 5cc ขึ้นไป 7,000 · 10cc ขึ้นไป 6,000)
  // ซึ่งคูณแล้วได้ราคาขายพอดีเป๊ะ — "ราคาเต็ม" จึงต้องอิงตัวตั้งต้น 8,900/cc ไม่ใช่ราคาขั้นบันได
  "PKAES-6909022": { lines: [["AES-6909011", 5]] }, // Yvoire เหมา 5 cc      35,000 / เต็ม 44,500
  "PKAES-6909023": { lines: [["AES-6909011", 10]] }, // Yvoire เหมา 10 cc    60,000 / เต็ม 89,000
  "PKAES-6909024": { lines: [["AES-6909014", 2]] }, // Duo Collagen 2 ครั้ง  46,000 / เต็ม 51,800
  "PKAES-6909025": { lines: [["AES-6909014", 3]] }, // Duo Collagen 3 ครั้ง  63,000 / เต็ม 77,700

  // ── เซ็ตราคาเดียว · ของข้างในมาจากตาราง price_items ที่ทีมดูแลเอง (แถว 237/238
  //    "Set สุดคุ้ม1 / Set สุดคุ้ม 2" ราคา 9,900 เท่ากันเป๊ะ ระบุของข้างในไว้ครบ)
  //    full: null เพราะราคาปกติของเซ็ตคือ 9,900 อยู่แล้ว — ถ้าบวกราคาต่อชิ้น (17,300)
  //    หน้าเว็บจะโชว์ "ลด 43%" ที่คลินิกไม่เคยตั้งไว้ (กับดักเดียวกับ PACK_NORMAL) ───
  "PKAES-6908001": {
    // Filler Neuramis 1 CC + Botox เกาหลี 50 ยูนิต + Fat Laura 10 CC
    lines: [["AES-6811067", 1], ["AES-6811061", 50], ["AES-6905015", 10]],
    full: null,
  },
  "PKAES-6908002": {
    // Filler Elasty (ทุกรุ่น) 1 CC + Botox เกาหลี 50 ยูนิต
    lines: [["AES-6812007", 1], ["AES-6811061", 50]],
    full: null,
  },
};

/**
 * หมวดที่กฎคีย์เวิร์ดจับผิด หรือไฟล์ไม่ได้บอกว่าข้างในมีอะไร
 * (กฎ CATEGORY_RULES ใช้ชุดเดียวกับ import-promo-packages.mjs ห้ามสลับลำดับกฎที่นั่น
 *  เพราะแถวเดิม 491 ใบถูกจัดหมวดด้วยลำดับนั้นไปแล้ว — แก้เป็นรายใบตรงนี้แทน)
 */
export const NEW_CATEGORY = {
  // ชื่อมีคำว่า "โปรแกรม" กฎหมวด "โปรแกรมดูแลผิวหน้า" เลยชนะ /นวด/ ทั้งที่เป็นบริการนวด
  "PKSLS-6812029": "นวด & ผ่อนคลาย",
  // 4 ใบนี้เป็นแคมเปญสิ้นปี (memo MM-APM027/2026 ชุดเดียวกับ Set สุดคุ้ม) ที่ชื่อไม่ได้บอก
  // ว่าข้างในมีหัตถการอะไร — เข้าหมวดแพ็กเกจรวมไว้ก่อน ให้ทีมยืนยันอีกทีที่ /pricing
  "PKAES-6908004": "แพ็กเกจรวมหลายหัตถการ", // Superstar Skin Year End
  "PKAES-6908005": "แพ็กเกจรวมหลายหัตถการ", // Bye Bye in Countdown
  "PKAES-6908008": "แพ็กเกจรวมหลายหัตถการ", // Year End Power Lift
  "PKAES-6908012": "แพ็กเกจรวมหลายหัตถการ", // Countdown หน้าเรียว
};

/* ---------- ดึงของเดิมจากฐาน ---------- */
async function fetchAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...j);
    if (j.length < 1000) break;
  }
  return out;
}
const dbPkgs = await fetchAll("promo_packages?select=sku,name,sale_price,starts_on,ends_on,memo,active,sort,kind,category");
const dbBySku = new Map(dbPkgs.map((d) => [d.sku, d]));

/* ---------- คิดว่าต้องเปลี่ยนอะไรบ้าง ---------- */
const inserts = [];
const updates = [];
for (const p of live) {
  const d = dbBySku.get(p.sku);
  if (!d) {
    const comp = NEW_COMPOSITION[p.sku];
    const lines = (comp?.lines ?? []).map(([sku, qty]) => {
      const it = fileItems.get(sku);
      if (!it) throw new Error(`NEW_COMPOSITION ของ ${p.sku} อ้างไอเทม ${sku} ที่ไม่มีใน Item Master`);
      return { item_sku: sku, item_name: it.name, qty, unit: it.unit, unit_price: it.price || null };
    });
    // หลายหัตถการในใบเดียว = แพ็กเกจรวม (กฎเดียวกับ import-promo-packages.mjs)
    const cat =
      NEW_CATEGORY[p.sku] ??
      (lines.length > 1
        ? "แพ็กเกจรวมหลายหัตถการ"
        : (CATEGORY_RULES.find(([re]) => re.test(p.name))?.[1] ?? "อื่นๆ"));
    const groups = new Set();
    for (const n of [p.name, ...lines.map((l) => l.item_name)])
      for (const [re, key] of GROUP_RULES) if (re.test(n)) groups.add(key);
    if (groups.size === 0) groups.add("treatment");

    const sum = lines.reduce((s, l) => s + l.qty * (l.unit_price ?? 0), 0);
    const full = comp && "full" in comp ? comp.full : sum > 0 ? sum : null;
    const single = lines.length === 1 ? lines[0] : null;

    inserts.push({
      sku: p.sku,
      name: p.name,
      category: cat,
      groups: [...groups],
      kind: kindOf(p.sku),
      sale_price: p.price,
      full_price: full,
      starts_on: p.starts_on,
      ends_on: p.ends_on,
      base_item_sku: single?.item_sku ?? null,
      base_item_name: single?.item_name ?? null,
      base_qty: single?.qty ?? null,
      base_unit: single?.unit ?? null,
      base_unit_price: single?.unit_price ?? null,
      memo: p.memo,
      // ราคา 0 = ของแถม/เงื่อนไขลูกค้าเก่า ไม่ใช่ของขาย — เก็บไว้แต่ไม่ขึ้นหน้าเว็บ
      // (ฝั่ง iPad ยังเห็น เพราะ mirror ปล่อยผ่านราคา 0 ไว้โดยตั้งใจ — ดู 0119)
      active: p.price > 0,
      lines,
    });
    continue;
  }
  const set = {};
  if (clean(d.name) !== p.name) set.name = p.name;
  if (Number(d.sale_price) !== p.price) set.sale_price = p.price;
  if ((d.starts_on ?? null) !== p.starts_on) set.starts_on = p.starts_on;
  if ((d.ends_on ?? null) !== p.ends_on) set.ends_on = p.ends_on;
  if (memoOf(d.memo) !== (p.memo ?? null)) set.memo = p.memo;
  if (Object.keys(set).length) updates.push({ sku: p.sku, name: d.name, set });
}

// แถวในฐานที่ไฟล์ล่าสุดไม่มีแล้ว / ไฟล์บอกว่าหมดเขตแล้ว — รายงานเฉย ๆ ไม่แตะเอง
const fileBySku = new Map(filePkgs.map((p) => [p.sku, p]));
const orphans = dbPkgs.filter((d) => !d.sku.startsWith("MANUAL") && !fileBySku.has(d.sku));
const expiredNow = dbPkgs.filter((d) => {
  const f = fileBySku.get(d.sku);
  return f && f.ends_on && f.ends_on < today;
});

/* ---------- รายงาน ---------- */
console.log(`ไฟล์: ${FILE}`);
console.log(`วันนี้ (เวลาไทย) ${today} · แพ็กเกจในไฟล์ ${filePkgs.length} · ขอบเขต Aesthetics ${scoped.length} · ยังขายอยู่ ${live.length}`);
console.log(`ฐานข้อมูลตอนนี้ ${dbPkgs.length} แถว\n`);

console.log(`=== เพิ่มใหม่ ${inserts.length} ใบ (เรียงตามที่จะขึ้นหน้าเว็บ) ===`);
for (const r of [...inserts].sort(newestFirst)) {
  console.log(
    `  + ${r.sku.padEnd(14)} ${String(r.sale_price).padStart(7)} ${r.active ? "  " : "ปิด"} ${r.category.padEnd(22)} ${r.full_price ? `เต็ม ${r.full_price}` : "ไม่มีราคาเต็ม"}  ${r.name}`
  );
  for (const l of r.lines)
    console.log(`        └ ${l.qty}× ${l.item_name} (${l.item_sku} · ${l.unit_price ?? "-"}/${l.unit ?? "-"})`);
}
console.log(`\n=== แก้ของเดิม ${updates.length} ใบ ===`);
for (const u of updates)
  console.log(`  ~ ${u.sku} ${u.name}\n      ${Object.entries(u.set).map(([k, v]) => `${k} → ${JSON.stringify(v)}`).join(" · ")}`);
if (orphans.length) {
  console.log(`\n⚠ มีในฐานแต่ไม่มีในไฟล์ล่าสุด ${orphans.length} ใบ (ไม่แตะให้ ถ้าต้องเอาออกให้กดซ่อนที่ /pricing)`);
  for (const d of orphans) console.log(`    ${d.sku} ${d.name}`);
}
if (expiredNow.length) {
  console.log(`\n⚠ ไฟล์บอกว่าหมดเขตแล้ว ${expiredNow.length} ใบ (หน้าเว็บขึ้นป้ายแดงให้เองตามวันที่ ไม่ต้องลบ)`);
  for (const d of expiredNow) console.log(`    ${d.sku} ${d.name}`);
}
const noComp = inserts.filter((r) => r.lines.length === 0 && r.active);
if (noComp.length)
  console.log(
    `\n📋 ต้องให้ทีมกรอก "ได้อะไรบ้าง" เองที่ /pricing ${noComp.length} ใบ (ไฟล์ดิบไม่มีข้อมูลนี้ หน้าเว็บจะไม่โชว์ราคาเต็ม/ป้าย % ลด):\n` +
      noComp.map((r) => `    ${r.sku} ${r.name}`).join("\n")
  );

/* ---------- ออกเป็น SQL ---------- */
const q = (v) =>
  v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) => `array[${a.map(q).join(",")}]::text[]`;

if (WANT_SQL) {
  const out = [];
  out.push(`-- ซิงก์ promo_packages จากไฟล์ POS · สร้างโดย scripts/sync-promo-packages.mjs · ${today}`);
  out.push("begin;");
  for (const u of updates)
    out.push(
      `update promo_packages set ${Object.entries(u.set).map(([k, v]) => `${k} = ${q(v)}`).join(", ")} where sku = ${q(u.sku)};`
    );
  if (inserts.length) {
    // โปรใหม่ควรอยู่ต้นลิสต์ (เหมือนที่โปรรอบก่อน ๆ อยู่บนสุดของหมวด) — ให้ sort ติดลบ
    // แทนการไล่บวกเลขของเดิมทั้งตาราง จะได้ไม่ไปกวน 493 แถวที่ไม่ได้เปลี่ยนอะไร
    // (และไม่ปลุก trigger mirror ให้ re-sync ทั้งแคตตาล็อกโดยไม่จำเป็น)
    const ordered = [...inserts].sort(newestFirst);
    ordered.forEach((r, i) => {
      out.push(
        `insert into promo_packages (sku,name,category,groups,kind,sale_price,full_price,starts_on,ends_on,base_item_sku,base_item_name,base_qty,base_unit,base_unit_price,memo,active,sort) values (${[
          q(r.sku), q(r.name), q(r.category), arr(r.groups), q(r.kind), q(r.sale_price), q(r.full_price),
          q(r.starts_on), q(r.ends_on), q(r.base_item_sku), q(r.base_item_name), q(r.base_qty), q(r.base_unit),
          q(r.base_unit_price), q(r.memo), q(r.active), String(i - ordered.length),
        ].join(",")}) on conflict (sku) do nothing;`
      );
      for (const [pos, l] of r.lines.entries())
        out.push(
          `insert into promo_package_items (package_id,item_sku,item_name,qty,unit,unit_price,position) select id, ${q(l.item_sku)}, ${q(l.item_name)}, ${q(l.qty)}, ${q(l.unit)}, ${q(l.unit_price)}, ${pos} from promo_packages where sku = ${q(r.sku)};`
        );
    });
  }
  out.push("commit;");
  const sql = out.join("\n") + "\n";
  if (SQL_OUT && !SQL_OUT.startsWith("--")) {
    fs.writeFileSync(SQL_OUT, sql);
    console.log(`\nเขียน SQL ${out.length - 2} คำสั่ง → ${SQL_OUT}`);
  } else console.log("\n" + sql);
}

if (DRY || WANT_SQL) {
  console.log("\n(โหมดดูอย่างเดียว — ยังไม่ได้เขียนฐานข้อมูล)");
  process.exit(0);
}

/* ---------- เขียนจริงผ่าน REST ---------- */
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
const Hh = { apikey: SUPABASE_KEY, authorization: `Bearer ${access_token}`, "content-type": "application/json" };
const call = async (path, opts) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r;
};

for (const u of updates)
  await call(`promo_packages?sku=eq.${encodeURIComponent(u.sku)}`, {
    method: "PATCH",
    headers: { ...Hh, prefer: "return=minimal" },
    body: JSON.stringify(u.set),
  });
console.log(`แก้ของเดิมแล้ว ${updates.length} ใบ`);

if (inserts.length) {
  // sort ติดลบ = ขึ้นก่อนของเดิมโดยไม่ต้องไปแก้เลขของ 493 แถวที่ไม่ได้เปลี่ยนอะไร
  const ordered = [...inserts].sort(newestFirst);
  await call("promo_packages", {
    method: "POST",
    headers: { ...Hh, prefer: "return=minimal" },
    body: JSON.stringify(
      ordered.map((r, i) => {
        // ตัด lines ออก (ลงตารางลูกคนละรอบ) แล้วต่อ sort ให้ขึ้นก่อนของเดิม
        const row = { ...r, sort: i - ordered.length };
        delete row.lines;
        return row;
      })
    ),
  });
  const idRes = await call("promo_packages?select=id,sku&limit=5000", { headers: Hh });
  const idBySku = new Map((await idRes.json()).map((r) => [r.sku, r.id]));
  const itemRows = ordered.flatMap((r) =>
    r.lines.map((l, k) => ({ ...l, package_id: idBySku.get(r.sku), position: k }))
  );
  if (itemRows.length)
    await call("promo_package_items", {
      method: "POST",
      headers: { ...Hh, prefer: "return=minimal" },
      body: JSON.stringify(itemRows),
    });
  console.log(`เพิ่มใหม่แล้ว ${inserts.length} ใบ · บรรทัด "ได้อะไรบ้าง" ${itemRows.length} บรรทัด`);
}
console.log("เสร็จ");
