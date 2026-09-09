import type { CaseType } from "./types";

/**
 * Parser แบบ Rule-based ล้วน — ไม่เรียก AI API และไม่ส่งข้อความออกนอกเครื่อง
 * (ข้อกำหนดข้อ 3: ห้ามส่งเลขบัตร/ประวัติแพ้ยา/โรคประจำตัวเข้า AI API)
 *
 * เลขบัตรประชาชนและข้อมูลสุขภาพถูก "อ่านทิ้ง" โดยตั้งใจ — รู้ว่ามีบรรทัดนั้นอยู่
 * เพื่อบอกแอดมินว่าไม่ได้เก็บ แต่ไม่เคยใส่ค่าลงผลลัพธ์ และถ้าค่าถูกพิมพ์ไว้บรรทัดถัดไป
 * ก็ทิ้งต่อจนกว่าจะเจอหัวข้อถัดไปหรือบรรทัดว่าง — ยอมเสียหัตถการดีกว่าปล่อยข้อมูลสุขภาพหลุด
 */

export type ParsedCase = {
  customer_name: string | null;
  customer_age: number | null;
  phone: string | null;
  line_id: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  treatment_main: string | null;
  treatment_detail: string | null;
  doctor: string | null;
  branch: string | null;
  channel: string | null;
  seller_name: string | null;
  owner_bc_name: string | null;
  discussion_start_date: string | null;
  closed_date: string | null;
  note: string | null;
};

export type ParsedField = keyof ParsedCase;

export type FieldConflict = {
  field: "appointment_date" | "appointment_time";
  candidates: { label: string; value: string }[];
};

export type ParseIssue = {
  field: ParsedField | "_document";
  code:
    | "missing_required"
    | "invalid_date"
    | "invalid_time"
    | "conflict"
    | "unrecognized";
  message: string;
};

export type ParseStatus = "valid" | "missing_required" | "conflict" | "unrecognized";

export type ParseResult = {
  fields: ParsedCase;
  conflicts: FieldConflict[];
  issues: ParseIssue[];
  status: ParseStatus;
  matchedLabelCount: number;
  unknownLines: string[];
  ignoredSensitiveLabels: string[];
  suggestedCaseType: CaseType | null;
};

const EMPTY: ParsedCase = {
  customer_name: null,
  customer_age: null,
  phone: null,
  line_id: null,
  appointment_date: null,
  appointment_time: null,
  treatment_main: null,
  treatment_detail: null,
  doctor: null,
  branch: null,
  channel: null,
  seller_name: null,
  owner_bc_name: null,
  discussion_start_date: null,
  closed_date: null,
  note: null,
};

/** ฟิลด์ที่ต้องมีก่อนยืนยันเคส Online (ข้อ 8.3) */
export const REQUIRED_FOR_ONLINE: ParsedField[] = [
  "customer_name",
  "appointment_date",
  "appointment_time",
  "treatment_main",
  "doctor",
  "branch",
];

export const FIELD_LABEL: Record<ParsedField, string> = {
  customer_name: "ชื่อ-นามสกุล",
  customer_age: "อายุ",
  phone: "เบอร์ติดต่อ",
  line_id: "ID LINE",
  appointment_date: "วันที่นัด",
  appointment_time: "เวลานัด",
  treatment_main: "หัตถการ",
  treatment_detail: "รายละเอียด/ราคา",
  doctor: "แพทย์",
  branch: "สาขา",
  channel: "ช่องทาง",
  seller_name: "ผู้ขาย",
  owner_bc_name: "ผู้ดูแลเคส BC",
  discussion_start_date: "วันที่เริ่มคุย",
  closed_date: "วันที่ปิดขาย",
  note: "หมายเหตุ",
};

const FULL_WIDTH_COLON = String.fromCharCode(0xff1a);
const MODIFIER_COLON = String.fromCharCode(0x02d0);
const NBSP = String.fromCharCode(0x00a0);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/**
 * รวมรูปเขียนให้เป็นแบบเดียวก่อนเทียบ label
 * - สระ เ ซ้ำสองตัวที่พิมพ์แทน แ (เเพทย์ → แพทย์)
 * - โคลอนเต็มความกว้างและโคลอนแบบ IPA → :
 * - ตัดอักขระควบคุมที่มองไม่เห็นทิ้ง กันข้อความแปลกปลอมหลุดไปแสดงผล
 */
export function normalizeText(input: string): string {
  const unified = (input ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/เเ/g, "แ");

  let out = "";
  for (const ch of unified) {
    // ขึ้นบรรทัดใหม่และ tab ต้องรอด — ตาราง ranking ที่วางจาก Sheet คั่นด้วย tab
    if (ch === "\n" || ch === "\t") {
      out += ch;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    if (ch === FULL_WIDTH_COLON || ch === MODIFIER_COLON) {
      out += ":";
      continue;
    }
    if (ch === NBSP) {
      out += " ";
      continue;
    }
    if (ch === ZERO_WIDTH_SPACE) continue;
    out += ch;
  }
  return out;
}

function labelKey(raw: string): string {
  return normalizeText(raw)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\s/g, "")
    .replace(/[.ๆ]+$/g, "");
}

const SPECIAL_DATETIME = "__appointment_datetime";

const LABEL_ALIASES: Record<string, ParsedField | typeof SPECIAL_DATETIME> = {
  "ชื่อ-นามสกุล": "customer_name",
  "ชื่อ-สกุล": "customer_name",
  "ชื่อนามสกุล": "customer_name",
  "ชื่อลูกค้า": "customer_name",
  "ชื่อ": "customer_name",
  "อายุ": "customer_age",
  "เบอร์ติดต่อ": "phone",
  "เบอร์โทร": "phone",
  "เบอร์โทรศัพท์": "phone",
  "เบอร์": "phone",
  "โทร": "phone",
  idline: "line_id",
  lineid: "line_id",
  line: "line_id",
  "ไลน์": "line_id",
  "idไลน์": "line_id",
  "วันเวลานัด": SPECIAL_DATETIME,
  "วัน-เวลานัด": SPECIAL_DATETIME,
  "วันเวลาที่นัด": SPECIAL_DATETIME,
  "วันที่นัดทำ": "appointment_date",
  "วันที่นัด": "appointment_date",
  "วันนัด": "appointment_date",
  "เวลาที่นัด": "appointment_time",
  "เวลานัด": "appointment_time",
  "เวลา": "appointment_time",
  "แพทย์ผู้ทำ": "doctor",
  "แพทย์ที่ทำ": "doctor",
  "แพทย์": "doctor",
  "หมอ": "doctor",
  "สาขา": "branch",
  "ผู้ขาย": "seller_name",
  "ผู้ดูแลเคสbc": "owner_bc_name",
  "ผู้ดูแลเคส": "owner_bc_name",
  "ผู้ดูแล": "owner_bc_name",
  "ช่องทาง": "channel",
  "วันที่เริ่มคุย": "discussion_start_date",
  "วันเริ่มคุย": "discussion_start_date",
  "วันที่ปิดขาย": "closed_date",
  "วันปิดขาย": "closed_date",
  "หมายเหตุเพิ่มเติม": "note",
  "หมายเหตุ": "note",
};

/** อ่านเจอแล้วทิ้งทันที — ห้ามเก็บลงฐานข้อมูลคิว */
const SENSITIVE_LABELS: Record<string, string> = {
  "เลขบัตรประชาชน": "เลขบัตรประชาชน",
  "เลขประจำตัวประชาชน": "เลขบัตรประชาชน",
  "บัตรประชาชน": "เลขบัตรประชาชน",
  "โรคประจำตัว": "โรคประจำตัว",
  "ประวัติแพ้ยา": "ประวัติแพ้ยา",
  "ประวัติการแพ้ยา": "ประวัติแพ้ยา",
  "แพ้ยา": "ประวัติแพ้ยา",
};

/** เรียงจากยาวไปสั้น เพื่อให้ "ประวัติแพ้ยา" ชนะ "แพ้ยา" ตอนเทียบหัวบรรทัด */
const SENSITIVE_KEYS = Object.keys(SENSITIVE_LABELS).sort((a, b) => b.length - a.length);

/**
 * จับ label อ่อนไหวแม้เขียนติดกับค่าหรือไม่มีโคลอนคั่น เช่น "แพ้ยา ยาปฏิชีวนะ"
 * rest ที่คืนมาใช้ดูว่าค่าอยู่บรรทัดเดียวกันหรือไปอยู่บรรทัดถัดไป
 */
function matchSensitive(key: string): { label: string; rest: string } | null {
  for (const k of SENSITIVE_KEYS) {
    if (key.startsWith(k)) {
      return { label: SENSITIVE_LABELS[k], rest: key.slice(k.length) };
    }
  }
  return null;
}

/**
 * แปลงปีให้เป็น ค.ศ. — รองรับ 69 (พ.ศ. ย่อ), 2569 (พ.ศ.) และ 2026 (ค.ศ.)
 * เกณฑ์: ปีที่ได้ต้องอยู่ในช่วง ±5 ปีจากปีอ้างอิง ไม่งั้นถือว่าไม่สมเหตุผล
 */
function resolveYear(rawYear: string, refYear: number): number | null {
  const n = Number(rawYear);
  if (!Number.isFinite(n)) return null;
  const inRange = (y: number) => y >= refYear - 5 && y <= refYear + 5;

  if (rawYear.length >= 4) {
    if (n >= 2400) return inRange(n - 543) ? n - 543 : null;
    return inRange(n) ? n : null;
  }
  const buddhistShort = 2500 + n - 543;
  if (inRange(buddhistShort)) return buddhistShort;
  const christianShort = 2000 + n;
  if (inRange(christianShort)) return christianShort;
  return null;
}

export function parseThaiDate(
  raw: string,
  refYear = new Date().getUTCFullYear()
): string | null {
  const m = normalizeText(raw)
    .trim()
    .match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = resolveYear(m[3], refYear);
  if (year === null || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseThaiTime(raw: string): string | null {
  const cleaned = normalizeText(raw).trim().replace(/\s*น\.?$/, "").trim();
  const m =
    cleaned.match(/^(\d{1,2})\s*[.:]\s*(\d{2})$/) ?? cleaned.match(/^(\d{1,2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

type LineMatch = {
  index: number;
  field: ParsedField | typeof SPECIAL_DATETIME | null;
  label: string;
  value: string;
};

export function parseCaseText(
  input: string,
  options: { onlineChannels?: string[]; refYear?: number } = {}
): ParseResult {
  const refYear = options.refYear ?? new Date().getUTCFullYear();
  const text = normalizeText(input ?? "");
  const lines = text.split("\n");

  const matches: LineMatch[] = [];
  const unknownLines: { index: number; text: string }[] = [];
  const ignoredSensitive = new Set<string>();
  // ค่าของ label อ่อนไหวมักถูกพิมพ์ไว้บรรทัดถัดไป ต้องทิ้งด้วย ไม่งั้นหลุดไปเป็นหัตถการ
  let inSensitiveBlock = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // บรรทัดว่างคือเส้นแบ่งย่อหน้าในข้อความที่ก๊อปมา — ถือว่าจบบล็อกข้อมูลอ่อนไหว
    if (!trimmed) {
      inSensitiveBlock = false;
      return;
    }
    const colon = trimmed.indexOf(":");
    const key = labelKey(colon > 0 ? trimmed.slice(0, colon) : trimmed);

    const sensitive = matchSensitive(key);
    if (sensitive) {
      ignoredSensitive.add(sensitive.label);
      matches.push({ index, field: null, label: key, value: "" });
      const valueOnSameLine =
        colon > 0 ? trimmed.slice(colon + 1).trim() !== "" : sensitive.rest !== "";
      inSensitiveBlock = !valueOnSameLine;
      return;
    }

    if (colon > 0) {
      const field = LABEL_ALIASES[key];
      if (field) {
        inSensitiveBlock = false;
        matches.push({
          index,
          field,
          label: trimmed.slice(0, colon).trim(),
          value: trimmed.slice(colon + 1).trim(),
        });
        return;
      }
    }

    // บรรทัดต่อเนื่องของข้อมูลอ่อนไหว — ไม่เก็บ ไม่ส่งต่อ ไม่แสดงที่ไหนเลย
    if (inSensitiveBlock) return;
    unknownLines.push({ index, text: trimmed });
  });

  const fields: ParsedCase = { ...EMPTY };
  const conflicts: FieldConflict[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Map<string, { label: string; value: string }>();

  const dateFields: ParsedField[] = [
    "appointment_date",
    "discussion_start_date",
    "closed_date",
  ];

  for (const m of matches) {
    if (!m.field || !m.value) continue;

    if (m.field === SPECIAL_DATETIME) {
      const parts = m.value.split(/\s+/).filter(Boolean);
      const isoDate = parts[0] ? parseThaiDate(parts[0], refYear) : null;
      const time = parts[1] ? parseThaiTime(parts.slice(1).join(" ")) : null;
      if (parts[0] && !isoDate) {
        issues.push({
          field: "appointment_date",
          code: "invalid_date",
          message: `วันที่ "${parts[0]}" ในบรรทัด "${m.label}" อ่านไม่ออก หรือปีไม่สมเหตุผล`,
        });
      }
      if (isoDate) {
        seen.set(`appointment_date|${m.label}`, { label: m.label, value: isoDate });
      }
      if (time) seen.set(`appointment_time|${m.label}`, { label: m.label, value: time });
      continue;
    }

    if (m.field === "customer_age") {
      const age = Number(m.value.replace(/[^0-9]/g, ""));
      if (Number.isFinite(age) && age > 0 && age < 130) fields.customer_age = age;
      continue;
    }

    if (m.field === "appointment_time") {
      const time = parseThaiTime(m.value);
      if (!time) {
        issues.push({
          field: "appointment_time",
          code: "invalid_time",
          message: `เวลา "${m.value}" ในบรรทัด "${m.label}" อ่านไม่ออก`,
        });
        continue;
      }
      seen.set(`appointment_time|${m.label}`, { label: m.label, value: time });
      continue;
    }

    if (dateFields.includes(m.field)) {
      const iso = parseThaiDate(m.value, refYear);
      if (!iso) {
        issues.push({
          field: m.field,
          code: "invalid_date",
          message: `วันที่ "${m.value}" ในบรรทัด "${m.label}" อ่านไม่ออก หรือปีไม่สมเหตุผล`,
        });
        continue;
      }
      if (m.field === "appointment_date") {
        seen.set(`appointment_date|${m.label}`, { label: m.label, value: iso });
      } else {
        fields[m.field] = iso;
      }
      continue;
    }

    // ฟิลด์ข้อความล้วน — ค่าแรกที่เจอชนะ ไม่ให้บรรทัดซ้ำท้ายไฟล์มาทับ
    if (fields[m.field] === null) {
      (fields[m.field] as string | null) = m.value;
    }
  }

  for (const field of ["appointment_date", "appointment_time"] as const) {
    const found = [...seen.entries()]
      .filter(([k]) => k.startsWith(`${field}|`))
      .map(([, v]) => v);
    if (found.length === 0) continue;
    const distinct = [...new Set(found.map((f) => f.value))];
    fields[field] = found[0].value;
    if (distinct.length > 1) {
      conflicts.push({ field, candidates: found });
      issues.push({
        field,
        code: "conflict",
        message: `${FIELD_LABEL[field]} ไม่ตรงกันระหว่าง ${found
          .map((f) => `${f.label} = ${f.value}`)
          .join(" กับ ")} — เลือกค่าที่ถูกต้องก่อนยืนยัน`,
      });
    }
  }

  // Treatment block = บรรทัดที่ไม่ใช่ label ระหว่าง "ID LINE" กับ "วันที่นัดทำ"
  const lineIdAt = matches.find((m) => m.field === "line_id")?.index ?? -1;
  const dateAt = matches.find((m) => m.field === "appointment_date")?.index ?? -1;
  const inBlock =
    lineIdAt >= 0 && dateAt > lineIdAt
      ? unknownLines.filter((l) => l.index > lineIdAt && l.index < dateAt)
      : unknownLines;
  const treatmentLines = (inBlock.length > 0 ? inBlock : unknownLines).map((l) => l.text);
  if (treatmentLines.length > 0) {
    fields.treatment_main = treatmentLines[0];
    fields.treatment_detail =
      treatmentLines.length > 1 ? treatmentLines.slice(1).join("\n") : null;
  }

  const matchedLabelCount = matches.filter((m) => m.field).length;

  for (const field of REQUIRED_FOR_ONLINE) {
    if (fields[field] === null || fields[field] === "") {
      issues.push({
        field,
        code: "missing_required",
        message: `ไม่พบ ${FIELD_LABEL[field]}`,
      });
    }
  }
  if (!fields.phone && !fields.line_id) {
    issues.push({
      field: "phone",
      code: "missing_required",
      message: "ต้องมีเบอร์ติดต่อหรือ ID LINE อย่างน้อยหนึ่งอย่าง",
    });
  }

  let status: ParseStatus = "valid";
  if (matchedLabelCount === 0) {
    status = "unrecognized";
    issues.unshift({
      field: "_document",
      code: "unrecognized",
      message: "อ่าน Format ไม่ออก — ตรวจว่าวางข้อความครบและมีหัวข้อแบบ ชื่อ-นามสกุล: ...",
    });
  } else if (conflicts.length > 0) {
    status = "conflict";
  } else if (issues.some((i) => i.code !== "conflict")) {
    status = "missing_required";
  }

  const onlineChannels = (options.onlineChannels ?? []).map((c) =>
    c.trim().toLowerCase()
  );
  const channel = fields.channel?.trim().toLowerCase() ?? "";
  const suggestedCaseType: CaseType | null =
    channel && onlineChannels.includes(channel) ? "online" : null;

  return {
    fields,
    conflicts,
    issues,
    status,
    matchedLabelCount,
    unknownLines: unknownLines.map((l) => l.text),
    ignoredSensitiveLabels: [...ignoredSensitive],
    suggestedCaseType,
  };
}
