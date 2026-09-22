/**
 * บีบรูปที่อยู่ใน Supabase Storage (bucket `documents`) ทับที่เดิม — งานเก็บกวาดโควตา
 *
 * ใช้:
 *   node scripts/compress-storage-images.mjs --dry                 # ดูว่าจะแตะกี่ไฟล์ กี่ MB
 *   IMPORT_EMAIL=... IMPORT_PASSWORD=... node scripts/compress-storage-images.mjs --limit 3
 *   IMPORT_EMAIL=... IMPORT_PASSWORD=... node scripts/compress-storage-images.mjs
 *
 *   --min-kb N   แตะเฉพาะไฟล์ที่ใหญ่กว่านี้ (ปริยาย 600) — ต่ำกว่านั้นไม่คุ้ม egress ที่ต้องโหลดมาบีบ
 *   --out DIR    ที่เก็บไฟล์ต้นฉบับก่อนถูกทับ (ปริยาย ./storage-originals) — **อย่าวางไว้ใน repo**
 *
 * ทำไมต้องมี: แอปย่อรูปให้ตั้งแต่ตอนอัพอยู่แล้ว (`@/lib/upload-prepare`) แต่ไฟล์ที่อัพไว้
 * "ก่อน" กติกาย่อรูปจะเข้มขึ้น ยังใหญ่ค้างอยู่บน storage — สคริปต์นี้คือตัวไล่เก็บย้อนหลัง
 * (รอบแรกใช้ 2026-09-22 ตอนกลับไปแพลน Free ซึ่งมีโควตารวมแค่ 1GB ทั้งโปรเจกต์)
 *
 * เกณฑ์ต้องตรงกับที่แอปใช้เสมอ — `IMAGE_MAX_DIMENSION` / `IMAGE_JPEG_QUALITY` ใน
 * `src/lib/constants.ts` (แก้ที่นั่นแล้วมาแก้ค่าคงที่ข้างล่างให้ตรงด้วย)
 *
 * กติกาที่ต้องรักษา:
 *  - **สำรองต้นฉบับลงเครื่องก่อนทับทุกไฟล์** (คงโครงสร้าง path ไว้ กู้กลับได้ตรงที่)
 *  - **รูปที่มีพื้นโปร่ง (alpha) คง PNG ไว้** ไม่แปลงเป็น JPEG ไม่งั้นพื้นใสกลายเป็นดำ
 *  - **บีบแล้วไม่เล็กลง = ไม่แตะไฟล์เดิม** (ไฟล์ที่ผ่านตัวย่อของแอปมาแล้วมักเข้าเคสนี้)
 *  - **เปลี่ยนนามสกุล (png→jpg) ต้องอัพ path ใหม่ → แก้แถวใน DB → แล้วค่อยลบไฟล์เก่า**
 *    ตามลำดับนี้เท่านั้น เพราะ `isImagePath()` ของแอปอ่านชนิดไฟล์จากนามสกุล
 *    และถ้าลบก่อนแก้แถว การ์ดจะโชว์รูปเสียระหว่างทาง
 *  - รันซ้ำได้ (จำไฟล์ที่ทำแล้วใน `_done.json` ของโฟลเดอร์สำรอง)
 *
 * ขอบเขต: เฉพาะรูปที่ผูกกับตาราง `task_files` (โฟลเดอร์ `tasks/` ซึ่งเป็นก้อนใหญ่สุด)
 * — รูป influencer/avatar/PDF ผลแลบ ไม่ถูกแตะ
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "https://zcoqzasbtgfccuibteji.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "sb_publishable_1COg-C4NN28DNHcOUzj9Jg_YvlwMiJm";
const EMAIL = process.env.IMPORT_EMAIL;
const PASSWORD = process.env.IMPORT_PASSWORD;

const ARGV = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = ARGV.indexOf(name);
  return i === -1 ? fallback : ARGV[i + 1];
};
const DRY = ARGV.includes("--dry");
const LIMIT = Number(flag("--limit", Infinity));
const MIN_BYTES = Number(flag("--min-kb", 600)) * 1024;
const ORIGINALS = path.resolve(flag("--out", "storage-originals"));

/** ต้องตรงกับ IMAGE_MAX_DIMENSION / IMAGE_JPEG_QUALITY ใน src/lib/constants.ts */
const MAX_DIM = 1920;
const QUALITY = 78;
/** ทำทีละ 5 ไฟล์ — มากกว่านี้ชนเพดาน rate limit ของ storage ตอนอัพทับ */
const POOL = 5;

const IMG_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif", "avif", "jfif"];
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const mb = (n) => (n / 1048576).toFixed(1);

if (!DRY && (!EMAIL || !PASSWORD)) {
  console.error("ต้องมี IMPORT_EMAIL / IMPORT_PASSWORD (บัญชีในระบบที่แก้ไฟล์ได้)");
  process.exit(1);
}

const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!login.ok) throw new Error(`เข้าสู่ระบบไม่สำเร็จ ${login.status}`);
const { access_token: token } = await login.json();
const H = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` };

/* ---------- 1) รายชื่อรูปทั้งหมดในตาราง task_files ----------
   PostgREST ตอบได้สูงสุด 1000 แถวต่อครั้ง (max-rows ของ Supabase) — ต้องไล่ทีละหน้า
   ไม่งั้นรูปที่เกิน 1000 แถวแรกจะไม่ถูกบีบโดยไม่มีอะไรฟ้อง */
const or = IMG_EXT.map((e) => `file_path.ilike.*.${e}`).join(",");
const rows = [];
for (let page = 0; ; page++) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/task_files?select=id,file_path,file_name&or=(${or})` +
      `&order=id&limit=1000&offset=${page * 1000}`,
    { headers: H }
  );
  if (!res.ok) throw new Error(`ดึงรายชื่อไม่สำเร็จ ${res.status} ${await res.text()}`);
  const chunk = await res.json();
  rows.push(...chunk);
  if (chunk.length < 1000) break;
}

await mkdir(ORIGINALS, { recursive: true });
const STATE = path.join(ORIGINALS, "_done.json");
const done = existsSync(STATE)
  ? new Set(JSON.parse(await readFile(STATE, "utf8")))
  : new Set();

/** ขนาดไฟล์จริงบน storage — HEAD ไม่ดึงตัวไฟล์ จึงไม่กิน egress */
async function sizeOf(p) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${enc(p)}`, {
    method: "HEAD",
    headers: H,
  });
  return r.ok ? Number(r.headers.get("content-length") || 0) : 0;
}

console.log(`รูปในตาราง task_files: ${rows.length} ไฟล์ — กำลังเช็คขนาด...`);
const sized = [];
for (let i = 0; i < rows.length; i += 20) {
  const batch = rows.slice(i, i + 20);
  const sizes = await Promise.all(batch.map((r) => sizeOf(r.file_path)));
  batch.forEach((r, j) => sized.push({ ...r, bytes: sizes[j] }));
  process.stdout.write(`\r  เช็คแล้ว ${sized.length}/${rows.length}`);
}
console.log("");

const targets = sized
  .filter((r) => r.bytes >= MIN_BYTES && !done.has(r.file_path))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, LIMIT);

console.log(
  `จะบีบ ${targets.length} ไฟล์ รวม ${mb(targets.reduce((s, r) => s + r.bytes, 0))} MB` +
    (done.size ? ` (ทำไปแล้วก่อนหน้า ${done.size} ไฟล์)` : "")
);
if (DRY) process.exit(0);

/* ---------- 2) บีบทีละไฟล์ ---------- */
let saved = 0;
let touched = 0;
let skipped = 0;
const errors = [];

async function processOne(row, label) {
  const src = row.file_path;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${enc(src)}`, {
      headers: H,
    });
    if (!r.ok) throw new Error(`โหลดไม่สำเร็จ ${r.status}`);
    const original = Buffer.from(await r.arrayBuffer());

    const backup = path.join(ORIGINALS, src);
    await mkdir(path.dirname(backup), { recursive: true });
    await writeFile(backup, original);

    const img = sharp(original, { failOn: "none" });
    const meta = await img.metadata();
    const keepPng = Boolean(meta.hasAlpha) && meta.format === "png";

    const pipeline = img
      // .rotate() ก่อน resize เสมอ — ใช้ค่า EXIF orientation แล้วค่อยทิ้ง metadata นั้นไป
      // (ไม่งั้นรูปจากมือถือที่ถ่ายแนวตั้งจะกลายเป็นแนวนอนหลังบีบ)
      .rotate()
      .resize({
        width: MAX_DIM,
        height: MAX_DIM,
        fit: "inside",
        withoutEnlargement: true,
      });
    const out = keepPng
      ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await pipeline
          .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: "4:2:0" })
          .toBuffer();

    if (out.length >= original.length) {
      skipped++;
      done.add(src);
      console.log(`[${label}] ข้าม (บีบแล้วไม่เล็กลง) ${path.basename(src)}`);
      return;
    }

    const ext = path.extname(src).toLowerCase();
    const needRename = !keepPng && ext !== ".jpg" && ext !== ".jpeg";
    const dest = needRename ? src.replace(/\.[^.]+$/, ".jpg") : src;

    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${enc(dest)}`, {
      method: "POST",
      headers: {
        ...H,
        "content-type": keepPng ? "image/png" : "image/jpeg",
        "cache-control": "3600",
        "x-upsert": "true",
      },
      body: out,
    });
    if (!up.ok) throw new Error(`อัพทับไม่สำเร็จ ${up.status} ${await up.text()}`);

    if (needRename) {
      const patch = await fetch(`${SUPABASE_URL}/rest/v1/task_files?id=eq.${row.id}`, {
        method: "PATCH",
        headers: { ...H, "content-type": "application/json" },
        body: JSON.stringify({
          file_path: dest,
          file_name: row.file_name.replace(/\.[^.]+$/, ".jpg"),
        }),
      });
      if (!patch.ok) throw new Error(`แก้แถวไม่สำเร็จ ${patch.status}`);
      await fetch(`${SUPABASE_URL}/storage/v1/object/documents`, {
        method: "DELETE",
        headers: { ...H, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [src] }),
      });
    }

    saved += original.length - out.length;
    touched++;
    done.add(src);
    console.log(
      `[${label}] ${path.basename(dest)} ${mb(original.length)} → ${mb(out.length)} MB`
    );
  } catch (e) {
    errors.push({ path: src, error: String(e?.message ?? e) });
    console.error(`[${label}] ล้ม ${src}: ${e?.message ?? e}`);
  }
}

let cursor = 0;
async function worker() {
  while (cursor < targets.length) {
    const i = cursor++;
    await processOne(targets[i], `${i + 1}/${targets.length}`);
    if (i % 25 === 0) await writeFile(STATE, JSON.stringify([...done]), "utf8");
  }
}
await Promise.all(Array.from({ length: POOL }, worker));
await writeFile(STATE, JSON.stringify([...done]), "utf8");

console.log(
  `\nเสร็จ: บีบ ${touched} ไฟล์ · ข้าม ${skipped} · ล้ม ${errors.length} · ประหยัดได้ ${mb(saved)} MB`
);
console.log(`ต้นฉบับเก็บไว้ที่ ${ORIGINALS} (ลบได้เมื่อมั่นใจว่ารูปบนเว็บใช้ได้ปกติ)`);
if (errors.length) {
  await writeFile(
    path.join(ORIGINALS, "_errors.json"),
    JSON.stringify(errors, null, 2),
    "utf8"
  );
  process.exit(1);
}
