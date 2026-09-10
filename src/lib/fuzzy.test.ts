import { describe, expect, it } from "vitest";
import { fuzzyFilter, matchesSearch, searchTerms } from "./fuzzy";

/** ชื่อจริงในฐานที่พิมพ์ด้วยสระเอ 2 ตัว (เ+เ) แทน "แ" — ต้นเหตุบั๊ก 2026-09-10 */
const DOUBLE_SARA_E = "รัตนเดช กฤตกิตินันท์ (เเทนไท)";

const hit = (query: string, ...fields: (string | null)[]) =>
  matchesSearch(searchTerms(query), ...fields);

describe("matchesSearch", () => {
  it("พิมพ์ แ ต้องเจอชื่อที่พิมพ์ด้วย เเ (และกลับกัน)", () => {
    expect(hit("แทน", DOUBLE_SARA_E)).toBe(true);
    expect(hit("เเทน", DOUBLE_SARA_E)).toBe(true);
    expect(hit("แทนไท", DOUBLE_SARA_E)).toBe(true);
    expect(hit("เเทน", "รัตนทัต กฤตกิตินันท์ (แทนไท)")).toBe(true);
  });

  it("ค้นหลายคำ = ต้องเจอครบทุกคำ (อยู่คนละช่องก็ได้ ลำดับไหนก็ได้)", () => {
    expect(hit("แทน กฤต", DOUBLE_SARA_E)).toBe(true);
    expect(hit("กฤต แทน", DOUBLE_SARA_E)).toBe(true);
    expect(hit("แทน ไท", DOUBLE_SARA_E)).toBe(true);
    expect(hit("สมชาย", "ทีมกราฟิก", "สมชาย ใจดี")).toBe(true);
    expect(hit("สมชาย กราฟิก", "ทีมกราฟิก", "สมชาย ใจดี")).toBe(true);
    expect(hit("แทน สมชาย", DOUBLE_SARA_E)).toBe(false);
  });

  it("ไม่ใส่วรรณยุกต์ก็เจอ", () => {
    expect(hit("กอปแกบ", "กฤติกา กันไชยา (ก๊อปเเก๊บ)")).toBe(true);
    expect(hit("ก๊อปแก๊บ", "กฤติกา กันไชยา (ก๊อปเเก๊บ)")).toBe(true);
  });

  it("เบอร์/รหัส มีขีดหรือไม่มีก็เจอ", () => {
    expect(hit("0812345678", "สมชาย 081-234-5678")).toBe(true);
    expect(hit("081-234", "สมชาย 0812345678")).toBe(true);
    expect(hit("INF-00160", "งานของ INF-00160")).toBe(true);
    expect(hit("00160", "งานของ INF-00160")).toBe(true);
  });

  it("คำค้นว่าง = ผ่านทุกแถว · ไม่ตรงจริงๆ = ไม่ผ่าน", () => {
    expect(hit("", DOUBLE_SARA_E)).toBe(true);
    expect(hit("   ", DOUBLE_SARA_E)).toBe(true);
    expect(hit("สมหญิง", DOUBLE_SARA_E)).toBe(false);
  });

  it("ข้ามช่องที่ว่าง/null ได้ และไม่พังเมื่อไม่มีข้อมูลเลย", () => {
    expect(hit("แทน", null, "", DOUBLE_SARA_E)).toBe(true);
    expect(hit("แทน", null, "")).toBe(false);
  });

  it("ตัวพิมพ์ใหญ่-เล็กของอังกฤษไม่มีผล", () => {
    expect(hit("BOTOX korea", "Botox Korea 100 U")).toBe(true);
  });
});

describe("searchTerms", () => {
  it("ตัดคำด้วยช่องว่างและ normalize ให้แล้ว", () => {
    expect(searchTerms("  แทน   กฤต ")).toEqual(["แทน", "กฤต"]);
    expect(searchTerms("เเทน")).toEqual(["แทน"]);
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("fuzzyFilter (ของเดิม — ต้องไม่เปลี่ยนพฤติกรรม)", () => {
  it("ยังเรียงของที่ตรงกว่ามาก่อน และคำค้นว่างคืนลำดับเดิม", () => {
    const items = ["แพร", "เเพรวา", "สมชาย"];
    expect(fuzzyFilter(items, "", (s) => [s])).toEqual(items);
    expect(fuzzyFilter(items, "แพร", (s) => [s])[0]).toBe("แพร");
  });
});
