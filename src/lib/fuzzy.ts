/**
 * ค้นหาแบบ "ใกล้เคียง" — ใช้กับช่องค้นหาที่คนพิมพ์ชื่อคนไทย/อังกฤษปนกัน
 *
 * ทำไมต้องมี: ช่องค้นหาเดิมใช้ `includes()` ล้วน พิมพ์ผิดตัวเดียวก็ไม่เจออะไรเลย
 * ซึ่งเจ็บมากกับข้อมูลจริงของระบบนี้ที่มีทั้ง
 *   - สระเอซ้อน (`เเพร` แทน `แพร`) — พิมพ์ผิดที่เจอบ่อยสุดในฐานข้อมูล
 *   - วรรณยุกต์/สระซ้ำ (`ปลื้้ม` แทน `ปลื้ม`)
 *   - อักขระล่องหน (U+200B) ติดมาจากการก๊อปวาง
 *   - ลืมสลับภาษาแป้นพิมพ์ (พิมพ์ `ลิลลี่` ได้ `pbppu jj`)
 *
 * ให้คะแนน 0..1 (0 = ไม่ตรงเลย) เรียงจากตรงเป๊ะ → ขึ้นต้นด้วย → มีอยู่ข้างใน →
 * ตรงหลังตัดวรรณยุกต์ → ตัวอักษรเรียงตามลำดับ → ต่างกันไม่กี่ตัว (Levenshtein)
 */

/** อักขระล่องหน + zero-width ที่ติดมากับข้อมูลที่ก๊อปวางมา */
const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD]/g;

/** วรรณยุกต์/สระบน-ล่างของไทย — ตัดทิ้งตอนเทียบแบบผ่อนปรน */
const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;

/** ตัวคั่นที่ไม่ควรมีผลกับการค้นหา (เว้นวรรค จุด ขีด วงเล็บ ฯลฯ) */
const SEPARATORS = /[^\p{L}\p{N}]+/gu;

/**
 * ปรับข้อความให้เทียบกันได้ — ตัวพิมพ์เล็ก, รวมรูป Unicode, ซ่อม `เเ` → `แ`,
 * ตัดอักขระล่องหนและตัวคั่นทิ้ง (ยังเก็บวรรณยุกต์ไว้ = การเทียบชั้นแรก)
 */
function normalizeSearch(raw: string): string {
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(INVISIBLE, "")
    .replace(/\u0E40\u0E40/g, "\u0E41")
    .replace(SEPARATORS, "");
}

/** ผ่อนปรนอีกชั้น — ตัดวรรณยุกต์/สระบน-ล่างออก ให้ `ปลื้้ม` เท่ากับ `ปลม` */
function foldSearch(raw: string): string {
  return normalizeSearch(raw).replace(THAI_MARKS, "");
}

/** แป้น Kedmanee: ปุ่มภาษาอังกฤษ → ตัวอักษรไทยที่ปุ่มเดียวกัน */
const EN_TO_TH: Record<string, string> = {
  q: "ๆ", w: "ไ", e: "ำ", r: "พ", t: "ะ", y: "ั", u: "ี", i: "ร", o: "น", p: "ย",
  "[": "บ", "]": "ล",
  a: "ฟ", s: "ห", d: "ก", f: "ด", g: "เ", h: "้", j: "่", k: "า", l: "ส",
  ";": "ว", "'": "ง",
  z: "ผ", x: "ป", c: "แ", v: "อ", b: "ิ", n: "ื", m: "ท",
  ",": "ม", ".": "ใ", "/": "ฝ",
  "1": "ๅ", "4": "ภ", "5": "ถ", "6": "ุ", "7": "ึ", "8": "ค", "9": "ต", "0": "จ",
  "-": "ข", "=": "ช",
};

const TH_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_TH).map(([en, th]) => [th, en])
);

/** แปลงคำที่พิมพ์ผิดภาษาแป้นพิมพ์กลับไปอีกฝั่ง (คืน null ถ้าแปลงไม่ได้เลย) */
function swapLayout(text: string): string | null {
  let out = "";
  let changed = false;
  for (const ch of text) {
    const mapped = EN_TO_TH[ch] ?? TH_TO_EN[ch];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    out += mapped;
    changed = true;
  }
  return changed ? out : null;
}

/** ระยะแก้ไข (Levenshtein) แบบมีเพดาน — เกินเพดานคืนค่าเพดาน+1 ทันที */
function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
}

/** ตัวอักษรของคำค้นเรียงตามลำดับอยู่ในข้อความไหม (คืนสัดส่วนที่เจอ 0..1) */
function subsequenceRatio(text: string, query: string): number {
  let hit = 0;
  let at = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, at);
    if (found === -1) continue;
    at = found + 1;
    hit += 1;
  }
  return query.length === 0 ? 0 : hit / query.length;
}

/** เพดานจำนวนตัวที่ยอมให้ต่างกัน — คำยิ่งยาวยิ่งยอมมากขึ้น แต่ไม่เกิน 3 */
function distanceBudget(len: number): number {
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

function scoreOne(norm: string, folded: string, q: string, qFolded: string): number {
  if (q === "") return 1;
  if (norm === q) return 1;
  if (norm.startsWith(q)) return 0.94;
  if (norm.includes(q)) return 0.86;

  if (qFolded !== "" && folded !== "") {
    if (folded === qFolded) return 0.78;
    if (folded.startsWith(qFolded)) return 0.72;
    if (folded.includes(qFolded)) return 0.66;
  }

  const budget = distanceBudget(qFolded.length);
  if (budget > 0 && qFolded !== "") {
    const dist = editDistance(folded, qFolded, budget);
    if (dist <= budget) return 0.6 - (dist / (budget + 1)) * 0.15;
    // คำค้นสั้นกว่าชื่อมาก — ลองเทียบเฉพาะช่วงต้นของชื่อ (พิมพ์ผิดกลางคำแรก)
    if (folded.length > qFolded.length) {
      const head = folded.slice(0, qFolded.length + budget);
      const headDist = editDistance(head, qFolded, budget);
      if (headDist <= budget) return 0.52 - (headDist / (budget + 1)) * 0.12;
    }
  }

  const ratio = subsequenceRatio(folded, qFolded);
  if (ratio >= 0.85) return 0.3 + (ratio - 0.85) * 0.6;

  return 0;
}

/* ---------- ค้นหาแบบ "ต้องเจอครบทุกคำ" (ผู้ใช้ 2026-09-10) ----------
   คนละงานกับ fuzzyFilter ที่เดาคำใกล้เคียงให้: ชุดนี้คือช่องค้นหาของลิสต์/บอร์ด
   ที่ต้องคาดเดาได้ — พิมพ์เพิ่มอีกคำ = ผลแคบลงเสมอ ไม่ใช่ได้ของใกล้เคียงเพิ่มมา
   แต่ยังกินกติกา normalize ตัวเดียวกับ fuzzy (เเ→แ · ตัดอักขระล่องหน · ตัดตัวคั่น
   · ผ่อนวรรณยุกต์เป็นชั้นสำรอง) ⇒ พิมพ์ "แทน" เจอชื่อที่พิมพ์ว่า "เเทนไท",
   "081-234" เจอ "0812345678" และ "แทน กฤต" เจอ "กฤตกิตินันท์ (เเทนไท)" */

/** คำค้นที่ตัดเป็นคำๆ + normalize แล้ว — ลิสต์ว่าง = ไม่ได้ค้นอะไร (ผ่านทุกแถว) */
export function searchTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => normalizeSearch(t))
    .filter((t) => t !== "");
}

export type SearchField = string | number | null | undefined;

/** ทุกคำในคำค้นต้องเจอในช่องที่ส่งมา (รวมทุกช่องเป็นก้อนเดียวก่อนเทียบ) */
export function matchesSearch(
  terms: readonly string[],
  ...fields: SearchField[]
): boolean {
  if (terms.length === 0) return true;
  const raw = fields
    .filter((f) => f !== null && f !== undefined && f !== "")
    .join(" ");
  const norm = normalizeSearch(raw);
  if (norm === "") return false;
  // ชั้นสำรองคิดเมื่อต้องใช้จริง — คำค้นส่วนใหญ่เจอตั้งแต่ชั้นแรก
  let folded: string | null = null;
  return terms.every((t) => {
    if (norm.includes(t)) return true;
    const tf = t.replace(THAI_MARKS, "");
    if (tf === "" || tf === t) return false;
    folded ??= foldSearch(raw);
    return folded.includes(tf);
  });
}

/** คะแนนความใกล้เคียงของข้อความหนึ่งกับคำค้น (0 = ไม่ตรง, 1 = ตรงเป๊ะ) */
function fuzzyScore(text: string, query: string): number {
  const q = normalizeSearch(query);
  if (q === "") return 1;

  const norm = normalizeSearch(text);
  if (norm === "") return 0;

  const direct = scoreOne(norm, foldSearch(text), q, foldSearch(query));
  if (direct > 0) return direct;

  // ลืมสลับภาษาแป้นพิมพ์ — ให้คะแนนต่ำกว่าปกติ กันไปแย่งอันดับของที่ตรงจริง
  const swapped = swapLayout(query);
  if (swapped === null) return 0;
  const qSwap = normalizeSearch(swapped);
  if (qSwap === "" || qSwap === q) return 0;
  return scoreOne(norm, foldSearch(text), qSwap, foldSearch(swapped)) * 0.75;
}

/** เจอของที่ตรงระดับนี้แล้ว ให้ตัดผลลัพธ์ที่ต่ำกว่า WEAK_MATCH ทิ้ง */
const STRONG_MATCH = 0.8;
const WEAK_MATCH = 0.6;

type FuzzyOptions = {
  /** จำนวนผลลัพธ์สูงสุด (ไม่ใส่ = ไม่จำกัด) */
  limit?: number;
  /** คะแนนขั้นต่ำที่ถือว่า "ใกล้เคียงพอ" */
  min?: number;
};

/**
 * กรอง+เรียงรายการตามความใกล้เคียงกับคำค้น
 *
 * `keys` คืนข้อความที่ให้ค้นได้ของแต่ละรายการ (ชื่อ, ชื่อเล่น, รหัส ฯลฯ) —
 * ใช้คะแนนสูงสุดในบรรดาคีย์ทั้งหมด; คำค้นว่าง = คืนลำดับเดิม
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  keys: (item: T) => readonly (string | null | undefined)[],
  options: FuzzyOptions = {}
): T[] {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const q = query.trim();
  if (q === "") return items.slice(0, limit);

  const min = options.min ?? 0.3;
  const scored: { item: T; score: number; at: number }[] = [];

  items.forEach((item, at) => {
    let best = 0;
    for (const key of keys(item)) {
      if (key === null || key === undefined || key === "") continue;
      const score = fuzzyScore(key, q);
      if (score > best) best = score;
      if (best === 1) break;
    }
    if (best >= min) scored.push({ item, score: best, at });
  });

  scored.sort((a, b) => (b.score === a.score ? a.at - b.at : b.score - a.score));

  // มีอันที่ตรงจริงแล้ว ก็ไม่ต้องพ่วงอันที่แค่ "เดาว่าน่าจะใช่" มาให้รก
  const top = scored[0]?.score ?? 0;
  const floor = top >= STRONG_MATCH ? Math.max(min, WEAK_MATCH) : min;
  return scored
    .filter((s) => s.score >= floor)
    .slice(0, limit)
    .map((s) => s.item);
}
