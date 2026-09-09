import { describe, expect, it } from "vitest";
import { parseCaseText, parseThaiDate, parseThaiTime } from "./parser";

/**
 * ข้อมูลในเทสต์ทั้งหมดเป็นข้อมูลสมมติ — ห้ามใส่ PII จริงลง Repository (ข้อ 18.4)
 * ปี refYear ถูกตรึงไว้เพื่อให้ผลลัพธ์ไม่เปลี่ยนตามวันที่รันเทสต์
 */
const REF_YEAR = 2026;
const NL = String.fromCharCode(10);

const FIXTURE = [
  "ชื่อ-นามสกุล:ลูกค้า ทดสอบ",
  "อายุ:40",
  "เบอร์ติดต่อ:0800000000",
  "เลขบัตรประชาชน:0000000000000",
  "โรคประจำตัว:ไม่มี",
  "ประวัติเเพ้ยา:ไม่มี",
  "วันเวลานัด:21/08/69 14.00",
  "ID LINE:test.customer",
  "",
  "Oligio x300shots + ultraformer100shots 16,900",
  "มัดจำ 1,000 BL.15,900",
  "ของแถม Pico smooth",
  "",
  "วันที่นัดทำ:21/08/69",
  "เวลาที่นัด:14.00",
  "แพทย์ผู้ทำ:หมอทดสอบ",
  "สาขา:โรงพยาบาลดอนเมือง",
  "",
  "ผู้ขาย(Admin/BC):Admin ทดสอบ",
  "ผู้ดูเเลเคสBC:",
  "ช่องทาง:L10",
  "วันที่เริ่มคุย:19/08/69",
  "วันที่ปิดขาย:19/08/69",
  "หมายเหตุเพิ่มเติม:ลูกค้าสาขาโรงพยาบาลดอนเมือง",
].join("\n");

function parse(text: string, onlineChannels: string[] = ["L10"]) {
  return parseCaseText(text, { refYear: REF_YEAR, onlineChannels });
}

describe("parseThaiDate", () => {
  it("แปลงปี พ.ศ. ย่อ 2 หลักเป็น ค.ศ.", () => {
    expect(parseThaiDate("21/08/69", REF_YEAR)).toBe("2026-08-21");
  });

  it("แปลงปี พ.ศ. เต็ม 4 หลัก", () => {
    expect(parseThaiDate("21/08/2569", REF_YEAR)).toBe("2026-08-21");
  });

  it("รับปี ค.ศ. เต็มตามเดิม", () => {
    expect(parseThaiDate("21/08/2026", REF_YEAR)).toBe("2026-08-21");
  });

  it("รับปี ค.ศ. ย่อเมื่อ พ.ศ. ย่อไม่สมเหตุผล", () => {
    expect(parseThaiDate("21/08/26", REF_YEAR)).toBe("2026-08-21");
  });

  it("ปฏิเสธปีที่ห่างจากปัจจุบันเกินไป", () => {
    expect(parseThaiDate("21/08/1999", REF_YEAR)).toBeNull();
    expect(parseThaiDate("21/08/3099", REF_YEAR)).toBeNull();
  });

  it("ปฏิเสธวันที่ไม่มีจริง", () => {
    expect(parseThaiDate("31/02/69", REF_YEAR)).toBeNull();
    expect(parseThaiDate("32/08/69", REF_YEAR)).toBeNull();
  });

  it("รับตัวคั่นแบบ - และ .", () => {
    expect(parseThaiDate("21-08-69", REF_YEAR)).toBe("2026-08-21");
    expect(parseThaiDate("21.08.69", REF_YEAR)).toBe("2026-08-21");
  });
});

describe("parseThaiTime", () => {
  it("normalize 14.00 และ 14:00 ให้เป็นรูปเดียว", () => {
    expect(parseThaiTime("14.00")).toBe("14:00");
    expect(parseThaiTime("14:00")).toBe("14:00");
  });

  it("เติมศูนย์หน้าและตัดคำว่า น.", () => {
    expect(parseThaiTime("9.30")).toBe("09:30");
    expect(parseThaiTime("14.00 น.")).toBe("14:00");
    expect(parseThaiTime("14")).toBe("14:00");
  });

  it("ปฏิเสธเวลาที่เกินจริง", () => {
    expect(parseThaiTime("25.00")).toBeNull();
    expect(parseThaiTime("14.75")).toBeNull();
    expect(parseThaiTime("บ่ายสอง")).toBeNull();
  });
});

describe("parseCaseText — format มาตรฐาน", () => {
  const result = parse(FIXTURE);

  it("อ่านครบและไม่มี issue", () => {
    expect(result.status).toBe("valid");
    expect(result.issues).toEqual([]);
  });

  it("แยกฟิลด์หลักได้ถูกต้อง", () => {
    expect(result.fields).toMatchObject({
      customer_name: "ลูกค้า ทดสอบ",
      customer_age: 40,
      phone: "0800000000",
      line_id: "test.customer",
      appointment_date: "2026-08-21",
      appointment_time: "14:00",
      doctor: "หมอทดสอบ",
      branch: "โรงพยาบาลดอนเมือง",
      channel: "L10",
      seller_name: "Admin ทดสอบ",
      discussion_start_date: "2026-08-19",
      closed_date: "2026-08-19",
      note: "ลูกค้าสาขาโรงพยาบาลดอนเมือง",
    });
  });

  it("แยก Treatment block หลายบรรทัด บรรทัดแรกเป็นหัตถการหลัก", () => {
    expect(result.fields.treatment_main).toBe(
      "Oligio x300shots + ultraformer100shots 16,900"
    );
    expect(result.fields.treatment_detail).toBe(
      "มัดจำ 1,000 BL.15,900\nของแถม Pico smooth"
    );
  });

  it("ไม่เก็บเลขบัตรประชาชนและข้อมูลสุขภาพ", () => {
    const dumped = JSON.stringify(result.fields);
    expect(dumped).not.toContain("0000000000000");
    expect(result.ignoredSensitiveLabels).toContain("เลขบัตรประชาชน");
    expect(result.ignoredSensitiveLabels).toContain("โรคประจำตัว");
    expect(result.ignoredSensitiveLabels).toContain("ประวัติแพ้ยา");
  });

  it("แนะนำประเภท Online จากช่องทางที่ตั้งค่าไว้ แต่ไม่ตัดสินเอง", () => {
    expect(result.suggestedCaseType).toBe("online");
    expect(parse(FIXTURE, ["L20"]).suggestedCaseType).toBeNull();
  });

  it("ผู้ดูแลเคส BC ที่เว้นว่างไว้ต้องเป็น null ไม่ใช่ค่าถัดไป", () => {
    expect(result.fields.owner_bc_name).toBeNull();
  });
});

describe("parseCaseText — ความยืดหยุ่นของรูปแบบ", () => {
  it("มีหรือไม่มีช่องว่างหลัง : ก็ได้", () => {
    const spaced = FIXTURE.replace(/:/g, " : ");
    const result = parse(spaced);
    expect(result.fields.customer_name).toBe("ลูกค้า ทดสอบ");
    expect(result.fields.doctor).toBe("หมอทดสอบ");
  });

  it("รองรับโคลอนเต็มความกว้างแบบไทย/ญี่ปุ่น", () => {
    const fullWidth = FIXTURE.split(":").join(String.fromCharCode(0xff1a));
    const result = parse(fullWidth);
    expect(result.status).toBe("valid");
    expect(result.fields.branch).toBe("โรงพยาบาลดอนเมือง");
  });

  it("รองรับ line ending แบบ CRLF และ CR", () => {
    expect(parse(FIXTURE.replace(/\n/g, "\r\n")).fields.doctor).toBe("หมอทดสอบ");
    expect(parse(FIXTURE.replace(/\n/g, "\r")).fields.doctor).toBe("หมอทดสอบ");
  });

  it("รองรับทั้ง แพทย์ และ เเพทย์", () => {
    const doubled = FIXTURE.replace("แพทย์ผู้ทำ", "เเพทย์ผู้ทำ");
    expect(parse(doubled).fields.doctor).toBe("หมอทดสอบ");
  });

  it("รองรับทั้ง ผู้ดูแล และ ผู้ดูเเล", () => {
    const withOwner = FIXTURE.replace("ผู้ดูเเลเคสBC:", "ผู้ดูแลเคสBC:BC ทดสอบ");
    expect(parse(withOwner).fields.owner_bc_name).toBe("BC ทดสอบ");
  });

  it("รองรับเวลาแบบ 14:00 ในบรรทัดเวลาที่นัด", () => {
    const colonTime = FIXTURE.replace("เวลาที่นัด:14.00", "เวลาที่นัด:14:00");
    const result = parse(colonTime);
    expect(result.fields.appointment_time).toBe("14:00");
    expect(result.conflicts).toEqual([]);
  });

  it("รองรับปีแบบ 2569 และ 2026 ปนกัน", () => {
    const mixed = FIXTURE.replace("วันที่นัดทำ:21/08/69", "วันที่นัดทำ:21/08/2026").replace(
      "วันเวลานัด:21/08/69",
      "วันเวลานัด:21/08/2569"
    );
    const result = parse(mixed);
    expect(result.fields.appointment_date).toBe("2026-08-21");
    expect(result.conflicts).toEqual([]);
  });
});

describe("parseCaseText — ข้อผิดพลาดที่ต้องจับได้", () => {
  it("วันนัดสองตำแหน่งไม่ตรงกันต้องเป็น conflict", () => {
    const conflicting = FIXTURE.replace("วันที่นัดทำ:21/08/69", "วันที่นัดทำ:22/08/69");
    const result = parse(conflicting);
    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].field).toBe("appointment_date");
    expect(result.conflicts[0].candidates.map((c) => c.value)).toEqual([
      "2026-08-21",
      "2026-08-22",
    ]);
  });

  it("เวลานัดสองตำแหน่งไม่ตรงกันต้องเป็น conflict", () => {
    const conflicting = FIXTURE.replace("เวลาที่นัด:14.00", "เวลาที่นัด:15.00");
    const result = parse(conflicting);
    expect(result.status).toBe("conflict");
    expect(result.conflicts[0].field).toBe("appointment_time");
  });

  it("ปีที่ไม่สมเหตุผลต้องแจ้ง invalid_date", () => {
    const bad = FIXTURE.replace("วันที่นัดทำ:21/08/69", "วันที่นัดทำ:21/08/1899");
    const result = parse(bad);
    expect(result.issues.some((i) => i.code === "invalid_date")).toBe(true);
  });

  it("ขาดแพทย์ สาขา หรือหัตถการ ต้องบอกเป็นราย field", () => {
    const missing = FIXTURE.split("\n")
      .filter((l) => !l.startsWith("แพทย์ผู้ทำ") && !l.startsWith("สาขา"))
      .join("\n");
    const result = parse(missing);
    expect(result.status).toBe("missing_required");
    const fields = result.issues.filter((i) => i.code === "missing_required").map((i) => i.field);
    expect(fields).toContain("doctor");
    expect(fields).toContain("branch");
  });

  it("ต้องมีเบอร์หรือ LINE อย่างน้อยหนึ่งอย่าง", () => {
    const noContact = FIXTURE.split("\n")
      .filter((l) => !l.startsWith("เบอร์ติดต่อ") && !l.startsWith("ID LINE"))
      .join("\n");
    const result = parse(noContact);
    expect(result.status).toBe("missing_required");
    expect(result.issues.some((i) => i.field === "phone")).toBe(true);
  });

  it("ข้อความมั่วต้องเป็น unrecognized ไม่ใช่ crash", () => {
    const result = parse("อยากทำหน้าใสค่ะ ราคาเท่าไหร่");
    expect(result.status).toBe("unrecognized");
    expect(result.matchedLabelCount).toBe(0);
  });

  it("ข้อความว่างต้องเป็น unrecognized", () => {
    expect(parse("   \n  \n").status).toBe("unrecognized");
  });
});

describe("parseCaseText — ความปลอดภัยของข้อความ", () => {
  it("เก็บ HTML/script เป็นข้อความล้วน ไม่แปลงเป็น markup", () => {
    const injected = FIXTURE.replace(
      "ชื่อ-นามสกุล:ลูกค้า ทดสอบ",
      "ชื่อ-นามสกุล:<script>alert(1)</script>"
    );
    const result = parse(injected);
    // ค่าถูกส่งกลับเป็น string ธรรมดา — React escape ตอน render และไม่มีที่ไหนใช้ innerHTML
    expect(result.fields.customer_name).toBe("<script>alert(1)</script>");
    expect(typeof result.fields.customer_name).toBe("string");
  });

  it("ตัดอักขระควบคุมที่มองไม่เห็นออกจากค่า", () => {
    const withControl = FIXTURE.replace(
      "สาขา:โรงพยาบาลดอนเมือง",
      `สาขา:โรงพยาบาล${String.fromCharCode(0x07)}ดอนเมือง`
    );
    expect(parse(withControl).fields.branch).toBe("โรงพยาบาลดอนเมือง");
  });
});

describe("parseCaseText — ข้อมูลอ่อนไหวต้องไม่หลุดลงฐานข้อมูล", () => {
  it("ค่าที่พิมพ์ไว้บรรทัดถัดจาก label ต้องถูกทิ้งทั้งบล็อก", () => {
    const multiline = parse(
      // วางบล็อกไว้ในช่วง ID LINE → วันที่นัดทำ ซึ่งเป็นช่วงที่ระบบอ่านเป็นหัตถการ
      FIXTURE.replace(
        "ID LINE:test.customer",
        [
          "ID LINE:test.customer",
          "โรคประจำตัว:",
          "เบาหวาน ความดันสูง",
          "กินยาละลายลิ่มเลือด",
        ].join(NL)
      )
    );
    const dumped = JSON.stringify(multiline.fields);
    expect(dumped).not.toContain("เบาหวาน");
    expect(dumped).not.toContain("ละลายลิ่มเลือด");
    // ต้องไม่โผล่ใน unknownLines ด้วย เพราะค่านั้นถูกส่งกลับไปให้หน้าจอ
    expect(multiline.unknownLines.join(NL)).not.toContain("เบาหวาน");
    expect(multiline.ignoredSensitiveLabels).toContain("โรคประจำตัว");
    // หัตถการจริงยังต้องอ่านได้ตามเดิม
    expect(multiline.fields.treatment_main).toBe(
      "Oligio x300shots + ultraformer100shots 16,900"
    );
  });

  it("label อ่อนไหวที่เขียนติดกับค่าโดยไม่มีโคลอนก็ต้องถูกทิ้ง", () => {
    const noColon = parse(FIXTURE.replace("ประวัติเเพ้ยา:ไม่มี", "แพ้ยา ยาปฏิชีวนะ"));
    expect(JSON.stringify(noColon.fields)).not.toContain("ปฏิชีวนะ");
    expect(noColon.unknownLines.join(NL)).not.toContain("ปฏิชีวนะ");
    expect(noColon.ignoredSensitiveLabels).toContain("ประวัติแพ้ยา");
  });

  it("label อ่อนไหวที่มีค่าในบรรทัดเดียวกัน ต้องไม่กลืนบรรทัดถัดไป", () => {
    const inline = parse(
      FIXTURE.replace("ID LINE:test.customer", `ID LINE:test.customer${NL}โรคประจำตัว:ไม่มี`)
    );
    expect(inline.fields.treatment_main).toBe(
      "Oligio x300shots + ultraformer100shots 16,900"
    );
    expect(inline.status).toBe("valid");
  });

  it("ถ้าไม่มีบรรทัดว่างคั่น ยอมทิ้งหัตถการไปด้วยแล้วแจ้งว่าไม่พบ", () => {
    // ยอมเสียหัตถการดีกว่าปล่อยข้อมูลสุขภาพหลุด — แอดมินเห็น issue แล้วพิมพ์เองได้
    const swallowed = parse(
      FIXTURE.replace(
        ["ID LINE:test.customer", "", "Oligio"].join(NL),
        ["ID LINE:test.customer", "โรคประจำตัว:", "เบาหวาน ความดันสูง", "Oligio"].join(NL)
      )
    );
    expect(JSON.stringify(swallowed.fields)).not.toContain("เบาหวาน");
    expect(swallowed.fields.treatment_main).toBeNull();
    expect(
      swallowed.issues.some(
        (i) => i.field === "treatment_main" && i.code === "missing_required"
      )
    ).toBe(true);
  });
});
