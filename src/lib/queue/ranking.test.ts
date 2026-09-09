import { describe, expect, it } from "vitest";
import {
  buildRankingPreview,
  isPreviewPublishable,
  normalizeName,
  parseRankingTable,
  rankRows,
} from "./ranking";

/** ชื่อสมมติทั้งหมด — ห้ามใส่ชื่อพนักงานจริงลง Repository */
const MEMBERS = [
  { id: "m1", display_name: "บีซี หนึ่ง" },
  { id: "m2", display_name: "บีซี สอง" },
  { id: "m3", display_name: "บีซี สาม" },
  { id: "m4", display_name: "บีซี สี่" },
];

const PASTED = [
  "ชื่อ BC\tจำนวนบิล Drag\tยอดขาย Drag\tยกเลิก",
  "บีซี สอง\t12\t1,200,000\t0",
  "บีซี หนึ่ง\t15\t980,000\t1",
  "บีซี สี่\t12\t1,200,000\t2",
  "บีซี สาม\t3\t150,000\t0",
].join("\n");

describe("parseRankingTable", () => {
  it("อ่านตาราง TSV ที่วางจาก Google Sheet พร้อมหัวตาราง", () => {
    const { rows, hasCancelColumn } = parseRankingTable(PASTED);
    expect(hasCancelColumn).toBe(true);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      name: "บีซี สอง",
      paidBills: 12,
      netSales: 1200000,
      cancelCount: 0,
    });
  });

  it("อ่าน CSV ที่มีเครื่องหมายคำพูดครอบตัวเลขคั่นหลักพัน", () => {
    const csv = ['ชื่อ,บิล,ยอดขาย', 'บีซี หนึ่ง,15,"980,000"'].join("\n");
    const { rows } = parseRankingTable(csv);
    expect(rows[0]).toMatchObject({ name: "บีซี หนึ่ง", paidBills: 15, netSales: 980000 });
  });

  it("ไม่มีหัวตารางก็อ่านได้ โดยถือว่าเรียง ชื่อ/บิล/ยอด", () => {
    const { rows } = parseRankingTable("บีซี หนึ่ง\t15\t980000");
    expect(rows[0]).toMatchObject({ name: "บีซี หนึ่ง", paidBills: 15, netSales: 980000 });
  });

  it("ข้ามบรรทัดสรุปที่ไม่มีชื่อ", () => {
    const { rows, skippedLines } = parseRankingTable(`${PASTED}\n\t42\t3,530,000\t3`);
    expect(rows).toHaveLength(4);
    expect(skippedLines).toHaveLength(1);
  });

  it("ตัดเลขลำดับหน้าชื่อออก", () => {
    const { rows } = parseRankingTable("1. บีซี หนึ่ง\t15\t980000");
    expect(rows[0].name).toBe("บีซี หนึ่ง");
  });
});

describe("rankRows — เกณฑ์ข้อ 7.3", () => {
  it("เรียงตามจำนวนบิลก่อน", () => {
    const { rows, hasCancelColumn } = parseRankingTable(PASTED);
    const ranked = rankRows(rows, hasCancelColumn);
    expect(ranked.map((r) => r.name)).toEqual([
      "บีซี หนึ่ง",
      "บีซี สอง",
      "บีซี สี่",
      "บีซี สาม",
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("บิลเท่ากันและยอดเท่ากันตัดสินด้วยจำนวนยกเลิกที่น้อยกว่า พร้อมบอกเหตุผล", () => {
    const { rows, hasCancelColumn } = parseRankingTable(PASTED);
    const ranked = rankRows(rows, hasCancelColumn);
    const second = ranked[1];
    const third = ranked[2];
    expect(second.name).toBe("บีซี สอง");
    expect(third.name).toBe("บีซี สี่");
    expect(third.tiebreak).toBe("บิลและยอดเท่ากัน ตัดสินด้วยจำนวนยกเลิกที่น้อยกว่า");
  });

  it("เท่ากันทุกอย่างเรียงตามชื่อและอธิบายได้", () => {
    const ranked = rankRows(
      [
        { sourceRow: 2, name: "บีซี สอง", paidBills: 5, netSales: 100, cancelCount: null },
        { sourceRow: 3, name: "บีซี หนึ่ง", paidBills: 5, netSales: 100, cancelCount: null },
      ],
      false
    );
    expect(ranked[0].name).toBe("บีซี สอง");
    expect(ranked[1].tiebreak).toBe("ค่าทุกอย่างเท่ากัน เรียงตามชื่อ ก-ฮ");
  });

  it("ให้ weight ตามอันดับ 4/4/4/2/2/1", () => {
    const ranked = rankRows(
      Array.from({ length: 8 }, (_, i) => ({
        sourceRow: i + 2,
        name: `bc${i}`,
        paidBills: 100 - i,
        netSales: 0,
        cancelCount: null,
      })),
      false
    );
    expect(ranked.map((r) => r.weight)).toEqual([4, 4, 4, 2, 2, 1, 1, 1]);
  });
});

describe("normalizeName", () => {
  it("ตัดคำนำหน้าและช่องว่าง", () => {
    expect(normalizeName("คุณ บีซี หนึ่ง")).toBe(normalizeName("บีซีหนึ่ง"));
    expect(normalizeName("Ms. Test User")).toBe("testuser");
  });
});

describe("buildRankingPreview", () => {
  it("จับคู่ชื่อกับผู้ใช้ในระบบและพร้อมประกาศ", () => {
    const preview = buildRankingPreview(PASTED, MEMBERS);
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((r) => r.memberId)).toEqual(["m1", "m2", "m4", "m3"]);
    expect(isPreviewPublishable(preview)).toBe(true);
  });

  it("จับคู่ได้แม้มีคำนำหน้าและช่องว่างต่างกัน", () => {
    const preview = buildRankingPreview("คุณบีซี  หนึ่ง\t15\t980000", MEMBERS);
    expect(preview.rows[0].memberId).toBe("m1");
  });

  it("ชื่อที่ไม่มีในระบบต้องขึ้น unmatched และห้ามประกาศ", () => {
    const preview = buildRankingPreview("บีซี ห้า\t15\t980000", MEMBERS);
    expect(preview.rows[0].issue).toBe("unmatched");
    expect(preview.errors[0]).toContain("จับคู่กับผู้ใช้ในระบบไม่ได้");
    expect(isPreviewPublishable(preview)).toBe(false);
  });

  it("ชื่อซ้ำในไฟล์ต้องถูกจับได้", () => {
    const preview = buildRankingPreview(
      "บีซี หนึ่ง\t15\t980000\nบีซี หนึ่ง\t10\t500000",
      MEMBERS
    );
    expect(preview.rows[1].issue).toBe("duplicate");
    expect(isPreviewPublishable(preview)).toBe(false);
  });

  it("ตารางว่างต้องแจ้ง error ไม่ใช่ประกาศอันดับว่าง", () => {
    const preview = buildRankingPreview("", MEMBERS);
    expect(preview.rows).toHaveLength(0);
    expect(isPreviewPublishable(preview)).toBe(false);
  });
});
