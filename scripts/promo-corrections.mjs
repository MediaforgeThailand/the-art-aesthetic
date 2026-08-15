/**
 * ตารางแก้ข้อมูลโปรที่ผิดมาจากไฟล์ POS ต้นทาง
 *
 * ทำไมต้องมีไฟล์นี้:
 * ไฟล์ export จากระบบ POS ("โปรโมชั่น Aesthetics" / "โปร-หัตถการ (SKU)") มีบางแถวที่
 * ชื่อโปรกับรายการหัตถการไม่ตรงกัน — ของหลักหายไปบ้าง จำนวนผิดบ้าง ผูกคนละไอเทมบ้าง
 * สคริปต์นำเข้า "ล้างแล้วใส่ใหม่ทั้งชุด" ทุกครั้ง ถ้าไปแก้ที่ฐานข้อมูลตรง ๆ จะถูกล้างทิ้ง
 * รอบถัดไป จึงต้องเก็บการแก้ไว้ตรงนี้แล้วให้ทั้งการนำเข้าและสคริปต์แก้ย้อนหลังใช้ร่วมกัน
 *
 * ⚠️ นี่คือ "ผ้าพันแผล" ไม่ใช่การรักษา — ต้นเหตุอยู่ที่ทะเบียนโปรในระบบ POS
 * เมื่อทีมแก้ต้นทางแล้ว ให้ลบรายการนั้นออกจากไฟล์นี้ (สคริปต์จะเตือนเองถ้าแก้ไปแล้วไม่มีผล)
 *
 * ที่มาของการแก้แต่ละข้อ: audit โปร 476 ใบ วันที่ 15 ส.ค. 2569
 * ทุกข้อยืนยันด้วยยอดเงิน (ราคาเต็ม = Σ จำนวน × ราคาต่อหน่วย) และเทียบกับโปรฝาแฝด
 * ที่ใช้เอกสารอนุมัติ (memo) เดียวกันและราคาขายเท่ากัน
 */

/** หน่วยที่ลงผิดใน Item Master — ใช้กับทั้ง item และทุกบรรทัดโปรที่อ้างถึงไอเทมนั้น */
export const ITEM_UNIT_FIX = {
  // Ulthera ขายเป็น Lines (ชื่อไอเทมเองก็บอก "1Lines") แต่ POS ลงหน่วยเป็น "ครั้ง"
  // ทำให้หน้าจอขึ้น "900 ครั้ง" ทั้งที่หมายถึง 900 Lines
  "AES-6811103": "Lines",
  // Doublo หัว SD ขายเป็นช็อต (ชื่อไอเทมบอก "1 shot") บรรทัดโปรใช้หลักพัน (3,000–10,000)
  "AES-6907001": "ช็อต",
};

/**
 * การแก้รายบรรทัดของโปร
 *   kind: "add"     เพิ่มบรรทัดที่หายไป   → ต้องมี item_sku, qty
 *   kind: "qty"     แก้จำนวน              → ต้องมี item_sku, qty
 *   kind: "relink"  เปลี่ยนไปอีกไอเทม     → ต้องมี from, to (จำนวนคงเดิม)
 *   kind: "dedup"   ยุบบรรทัดซ้ำให้เหลือใบเดียว → ต้องมี item_sku
 *   kind: "drop"    ตัดบรรทัดที่ไม่ควรอยู่ในโปรนี้ → ต้องมี item_sku
 * ชื่อ/ราคา/หน่วยของไอเทมดึงจาก Item Master เสมอ ไม่ต้องเขียนซ้ำที่นี่
 */
export const LINE_FIX = [
  /* ---- ของหลักหายจากรายการ: โปร TPC Premium รุ่น Liftera ตกบรรทัด Ulthera ทั้งชุด ----
     รุ่น Doublo ที่เป็นฝาแฝด (ราคาขายเท่ากัน memo MM-MKT015/2569 เหมือนกัน) มีครบทุกใบ */
  { pkg: "PKAES-6812030", kind: "add", item_sku: "AES-6811103", qty: 300,
    why: 'ชื่อโปรบอก "Ulthera - 300 Lines" แต่ไม่มีบรรทัด · ฝาแฝด PKAES-6812029 มีครบ' },
  { pkg: "PKAES-6812032", kind: "add", item_sku: "AES-6811103", qty: 500,
    why: 'ชื่อโปรบอก "Ulthera 500 Lines" แต่ไม่มีบรรทัด · ฝาแฝด PKAES-6812031 มีครบ' },
  { pkg: "PKAES-6812034", kind: "add", item_sku: "AES-6811103", qty: 700,
    why: 'ชื่อโปรบอก "Ulthera 700 Lines" แต่ไม่มีบรรทัด · ฝาแฝด PKAES-6812033 มีครบ' },
  { pkg: "PKAES-6812036", kind: "add", item_sku: "AES-6811103", qty: 900,
    why: 'ชื่อโปรบอก "Ulthera 900 Lines" แต่ไม่มีบรรทัด · ฝาแฝด PKAES-6812035 มีครบ' },

  /* ---- จำนวนโบท็อกซ์ผิด: ลงเป็นจำนวน "ขวด" แทนจำนวนยูนิต ----
     ไอเทม AES-6811061 คือ "Botox Korea 1 unit" ราคา 150/ยูนิต จำนวนต้องเป็นจำนวนยูนิต
     โปรชุด MM-MKT015/2569 (6812029–6812036) ลง 20/50 ยูนิตถูกต้องอยู่แล้ว */
  { pkg: "PKAES-6811093", kind: "qty", item_sku: "AES-6811061", qty: 50,
    why: 'ชื่อโปรบอก "Botox Korea Hutox 50 units" แต่ลงไว้ 1 ยูนิต' },
  { pkg: "PKAES-6811094", kind: "qty", item_sku: "AES-6811061", qty: 50,
    why: 'ชื่อโปรบอก "Botox Korea Hutox 50 units" แต่ลงไว้ 1 ยูนิต' },
  { pkg: "PKAES-6811095", kind: "qty", item_sku: "AES-6811061", qty: 100,
    why: 'ชื่อโปรบอก "Botox Korea Hutox 100 units" แต่ลงไว้ 2 ยูนิต' },
  { pkg: "PKAES-6811096", kind: "qty", item_sku: "AES-6811061", qty: 100,
    why: 'ชื่อโปรบอก "Botox Korea Hutox 100 units" แต่ลงไว้ 2 ยูนิต' },

  /* ---- จำนวนครั้งในคอร์สไม่ตรงชื่อ ---- */
  { pkg: "PKAES-6812249", kind: "qty", item_sku: "AES-6812019", qty: 12,
    why: 'ชื่อโปรคือ "/12ครั้ง" แต่ลงไว้ 10 ครั้ง · ใบ "/8ครั้ง" (PKAES-6812248) ลง 8 ถูกต้อง' },

  /* ---- ผูกคนละไอเทมกับชื่อโปร ----
     ทำให้หน้าจอบอกลูกค้าผิดว่าได้อะไร และราคาเต็มที่ใช้คิด % ส่วนลดผิดตามไปด้วย */
  { pkg: "PKAES-6811007", kind: "relink", from: "AES-6811026", to: "AES-6811029",
    why: 'ชื่อโปรคือ "6 Steps - Clear ACNE" ต้องเป็นโปรแกรม 6 STEP (1,399) ไม่ใช่ Skin-Acne Clear (3,000) ซึ่งเป็นหัตถการเดี่ยว' },
  { pkg: "PKAES-6812278", kind: "relink", from: "AAL-6812012", to: "AES-6811081",
    why: 'ชื่อโปรคือ "จี้ไฝ จี้กระ /1จุด (เริ่มต้น)" ราคา 500 แต่ผูกกับ "เหมาหน้า 10 จุดขึ้นไป" (12,000) ทำให้โชว์ลด 96%' },
  { pkg: "PKAES-6812279", kind: "relink", from: "AAL-6812013", to: "AAL-6812012",
    why: 'ชื่อโปรคือ "เหมาหน้า 10 จุดขึ้นไป" ไม่มีคำว่าคอ แต่ผูกกับ "เหมาหน้า+คอ"' },
  { pkg: "PKAES-6812266", kind: "relink", from: "AAL-6812009", to: "AAL-6812010",
    why: 'ชื่อโปรคือ "(เหมา)" แต่ผูกกับ "(ต่อจุด)" · ราคาขาย 3,900 สูงกว่าราคาเต็ม 3,000 ซึ่งเป็นไปไม่ได้' },

  /* ---- ชั้น 1,200 Lines: บรรทัดซ้ำและปนข้ามใบ ----
     สองใบนี้เป็นคู่แฝดของกัน (Doublo / Liftera) แต่ในไฟล์ POS มี Fat กับ Botox
     ใบละ 2 บรรทัด และใบที่ชื่อ Doublo ยังมีบรรทัด Liftera ของอีกใบติดมาด้วย
     ยุบซ้ำแล้วตัดตัวปนออก จะได้รูปเดียวกับชั้น 300/500/700/900 ของตระกูลนี้พอดี */
  { pkg: "PKAES-6812037", kind: "dedup", item_sku: "AES-6811048",
    why: "Fat Burn (Laura) ซ้ำ 2 บรรทัด" },
  { pkg: "PKAES-6812037", kind: "dedup", item_sku: "AES-6811061",
    why: "Botox Korea ซ้ำ 2 บรรทัด (100 ยูนิต × 2)" },
  { pkg: "PKAES-6812037", kind: "drop", item_sku: "AES-6811108",
    why: 'ใบนี้ชื่อ "แถม Doublo" แต่มีบรรทัด Liftera 8,000 ช็อตของใบคู่แฝด (PKAES-6812038) ปนมา' },
  { pkg: "PKAES-6812038", kind: "dedup", item_sku: "AES-6811048",
    why: "Fat Burn (Laura) ซ้ำ 2 บรรทัด" },
  { pkg: "PKAES-6812038", kind: "dedup", item_sku: "AES-6811061",
    why: "Botox Korea ซ้ำ 2 บรรทัด (100 ยูนิต × 2)" },
  { pkg: "PKAES-6812038", kind: "dedup", item_sku: "AES-6811108",
    why: "Liftera Pen ซ้ำ 2 บรรทัด (8,000 ช็อต × 2)" },
];

/** รายการที่รู้ว่าผิดแต่ยัง "แก้เองไม่ได้" — ต้องให้ทีมชี้ขาดก่อน สคริปต์จะพิมพ์เตือนทุกครั้ง */
export const NEEDS_TEAM = [
  { pkg: "PKAES-6812201",
    why: 'ชื่อโปร "นวดมือ+Therma Tite (โปรแกรมเอวS)" แต่มีแค่บรรทัดนวดมือ · ไม่มีเอกสารไหนบอกว่าเป็น Therma Tite จุดไหนและกี่ครั้ง เดาเองไม่ได้' },
  { pkg: "PKAES-6812012",
    why: 'ชื่อโปร "Pico Laser 1 แถม 1 (ได้ทุกโหมด ทั่วหน้า)" แต่ผูกกับ "Pico เฉพาะจุด" · ใบฝาแฝดคนละช่องทาง PKAES-6811018 ราคาเท่ากันใช้ "Pico Smooth" (12,000) — ถ้าแก้ตามนั้น ส่วนลดที่โชว์จะกระโดดจาก 2% เป็น 75% จึงต้องให้ทีมยืนยันก่อน' },
];

/** ใช้กับรายการหัตถการ (item master) — คืนหน่วยที่ถูก ถ้าไม่มีในตารางแก้ก็คืนของเดิม */
export const fixUnit = (code, unit) => ITEM_UNIT_FIX[code] ?? unit;

/**
 * ใส่การแก้ลงในชุดบรรทัดของโปรหนึ่งใบ
 * @param pkg      รหัสแพ็กเกจ เช่น PKAES-6812030
 * @param lines    [{ item_sku, item_name, qty, unit, unit_price }]
 * @param itemInfo Map(code -> { name, price, unit }) จาก Item Master
 * @returns        { lines, applied: [{ kind, why }] }
 */
export function applyLineFixes(pkg, lines, itemInfo) {
  const applied = [];
  let out = lines.map((l) => ({ ...l, unit: fixUnit(l.item_sku, l.unit) }));

  for (const fix of LINE_FIX.filter((f) => f.pkg === pkg)) {
    if (fix.kind === "dedup" || fix.kind === "drop") {
      const hit = out.filter((l) => l.item_sku === fix.item_sku);
      const keep = fix.kind === "dedup" ? 1 : 0;
      if (hit.length <= keep) {
        console.warn(`✔ ${pkg}: ${fix.item_sku} ไม่ซ้ำ/ไม่มีแล้ว — ต้นทางน่าจะแก้เองแล้ว ลบข้อนี้ออกได้`);
        continue;
      }
      let seen = 0;
      out = out.filter((l) => l.item_sku !== fix.item_sku || ++seen <= keep);
      applied.push({ kind: fix.kind, why: fix.why });
      continue;
    }
    const info = itemInfo.get(fix.kind === "relink" ? fix.to : fix.item_sku);
    if (!info) {
      console.warn(`⚠ ${pkg}: ไม่พบไอเทม ${fix.to ?? fix.item_sku} ใน Item Master — ข้ามการแก้นี้`);
      continue;
    }
    if (fix.kind === "add") {
      if (out.some((l) => l.item_sku === fix.item_sku)) {
        console.warn(`✔ ${pkg}: มีบรรทัด ${fix.item_sku} แล้ว — ต้นทางแก้เองแล้ว ลบข้อนี้ออกจาก promo-corrections.mjs ได้`);
        continue;
      }
      // ของหลักควรอยู่บรรทัดแรก — เซลล์อ่านจากบนลงล่าง
      out = [{
        item_sku: fix.item_sku, item_name: info.name, qty: fix.qty,
        unit: fixUnit(fix.item_sku, info.unit), unit_price: info.price,
      }, ...out];
      applied.push({ kind: "add", why: fix.why });
    } else if (fix.kind === "qty") {
      const line = out.find((l) => l.item_sku === fix.item_sku);
      if (!line) { console.warn(`⚠ ${pkg}: ไม่มีบรรทัด ${fix.item_sku} ให้แก้จำนวน`); continue; }
      if (line.qty === fix.qty) {
        console.warn(`✔ ${pkg}: จำนวน ${fix.item_sku} ถูกอยู่แล้ว — ลบข้อนี้ออกได้`);
        continue;
      }
      line.qty = fix.qty;
      applied.push({ kind: "qty", why: fix.why });
    } else if (fix.kind === "relink") {
      const line = out.find((l) => l.item_sku === fix.from);
      if (!line) {
        console.warn(`✔ ${pkg}: ไม่มีบรรทัด ${fix.from} แล้ว — ต้นทางน่าจะแก้เองแล้ว ตรวจแล้วลบข้อนี้ออกได้`);
        continue;
      }
      line.item_sku = fix.to;
      line.item_name = info.name;
      line.unit = fixUnit(fix.to, info.unit);
      line.unit_price = info.price;
      applied.push({ kind: "relink", why: fix.why });
    }
  }
  return { lines: out, applied };
}

/** ข้อความ "ประกอบด้วย" แบบเดียวกับที่ POS สร้าง — ใช้ตอนบรรทัดถูกแก้แล้ว */
export const composeText = (lines) =>
  lines.map((l) => `${l.qty}× ${l.item_name}`).join(" + ");
