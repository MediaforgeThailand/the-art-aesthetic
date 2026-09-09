import { normalizeText } from "./parser";
import { weightForRank } from "./engine";

/**
 * นำเข้าอันดับ Drag รายเดือนจาก Google Sheet โดยการวางตาราง (TSV) หรือไฟล์ CSV
 * ไม่ต่อ Google OAuth เพิ่ม เพราะทำเดือนละครั้งและความเสี่ยงไม่คุ้ม (ข้อ 7.1)
 */

export type RankingSourceRow = {
  sourceRow: number;
  name: string;
  paidBills: number | null;
  netSales: number | null;
  cancelCount: number | null;
};

export type RankedRow = RankingSourceRow & {
  rank: number;
  weight: number;
  /** เหตุผลที่ตัดสินอันดับเมื่อค่าหลักเท่ากัน — ต้องอธิบายได้ ห้ามสุ่ม */
  tiebreak: string | null;
};

export type RankingPreviewRow = RankedRow & {
  memberId: string | null;
  issue: "unmatched" | "ambiguous" | "duplicate" | "missing_bills" | null;
};

export type RankingPreview = {
  rows: RankingPreviewRow[];
  hasCancelColumn: boolean;
  skippedLines: string[];
  errors: string[];
};

export type MemberOption = { id: string; display_name: string };

const NAME_HEADERS = ["ชื่อ", "sales", "bc", "พนักงาน", "name", "consult"];
const BILL_HEADERS = ["บิล", "bill", "paid", "จำนวน"];
const SALES_HEADERS = ["ยอด", "sales", "net", "amount", "รายได้"];
const CANCEL_HEADERS = ["ยกเลิก", "cancel", "refund", "คืน"];

function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(",")) return splitCsvLine(line);
  return line.split(/\s{2,}/);
}

/** CSV แบบง่ายที่รองรับ "1,234" ในเครื่องหมายคำพูด */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function headerIndex(cells: string[], keywords: string[]): number {
  return cells.findIndex((c) => {
    const value = c.trim().toLowerCase();
    return value !== "" && keywords.some((k) => value.includes(k));
  });
}

function looksLikeHeader(cells: string[]): boolean {
  return (
    headerIndex(cells, NAME_HEADERS) >= 0 &&
    (headerIndex(cells, BILL_HEADERS) >= 0 || headerIndex(cells, SALES_HEADERS) >= 0)
  );
}

export function parseRankingTable(input: string): {
  rows: RankingSourceRow[];
  hasCancelColumn: boolean;
  skippedLines: string[];
} {
  const lines = normalizeText(input ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

  let nameAt = 0;
  let billAt = 1;
  let salesAt = 2;
  let cancelAt = -1;
  let start = 0;

  if (lines.length > 0) {
    const first = splitCells(lines[0]).map((c) => c.trim());
    if (looksLikeHeader(first)) {
      nameAt = headerIndex(first, NAME_HEADERS);
      billAt = headerIndex(first, BILL_HEADERS);
      salesAt = headerIndex(first, SALES_HEADERS);
      cancelAt = headerIndex(first, CANCEL_HEADERS);
      // หัวตารางบางแบบใช้คำว่า "ยอดขาย" ทั้งคอลัมน์บิลและคอลัมน์ยอด
      if (salesAt === billAt) salesAt = billAt + 1;
      start = 1;
    }
  }

  const rows: RankingSourceRow[] = [];
  const skippedLines: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const cells = splitCells(lines[i]).map((c) => c.trim());
    const name = (cells[nameAt] ?? "").replace(/^\d+[.)]\s*/, "").trim();
    if (!name || /^[0-9.,\-\s]+$/.test(name)) {
      skippedLines.push(lines[i]);
      continue;
    }
    rows.push({
      sourceRow: i + 1,
      name,
      paidBills: toNumber(cells[billAt]),
      netSales: toNumber(cells[salesAt]),
      cancelCount: cancelAt >= 0 ? toNumber(cells[cancelAt]) : null,
    });
  }

  return { rows, hasCancelColumn: cancelAt >= 0, skippedLines };
}

/**
 * เรียงตามเกณฑ์ข้อ 7.3: บิล Paid มาก → ยอดสุทธิมาก → ยกเลิกน้อย → ชื่อ ก-ฮ
 * ข้อสุดท้ายเป็น Tie-break ที่ตรวจสอบย้อนได้ และจะถูกแสดงให้แอดมินเห็นเสมอ
 */
export function rankRows(rows: RankingSourceRow[], hasCancelColumn: boolean): RankedRow[] {
  const sorted = [...rows].sort((a, b) => {
    const bills = (b.paidBills ?? 0) - (a.paidBills ?? 0);
    if (bills !== 0) return bills;
    const sales = (b.netSales ?? 0) - (a.netSales ?? 0);
    if (sales !== 0) return sales;
    if (hasCancelColumn) {
      const cancel = (a.cancelCount ?? 0) - (b.cancelCount ?? 0);
      if (cancel !== 0) return cancel;
    }
    return a.name.localeCompare(b.name, "th");
  });

  return sorted.map((row, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    let tiebreak: string | null = null;
    if (previous && (previous.paidBills ?? 0) === (row.paidBills ?? 0)) {
      if ((previous.netSales ?? 0) !== (row.netSales ?? 0)) {
        tiebreak = "บิลเท่ากัน ตัดสินด้วยยอดขายสุทธิ";
      } else if (hasCancelColumn && (previous.cancelCount ?? 0) !== (row.cancelCount ?? 0)) {
        tiebreak = "บิลและยอดเท่ากัน ตัดสินด้วยจำนวนยกเลิกที่น้อยกว่า";
      } else {
        tiebreak = "ค่าทุกอย่างเท่ากัน เรียงตามชื่อ ก-ฮ";
      }
    }
    return {
      ...row,
      rank: index + 1,
      weight: weightForRank(index + 1),
      tiebreak,
    };
  });
}

/** ตัดคำนำหน้าและช่องว่างออกก่อนจับคู่ชื่อ */
export function normalizeName(name: string): string {
  return normalizeText(name)
    .toLowerCase()
    .replace(/^(คุณ|นาย|นาง|นางสาว|น\.ส\.|ms\.?|mr\.?|mrs\.?)\s*/i, "")
    .replace(/\s+/g, "");
}

export function buildRankingPreview(
  input: string,
  members: MemberOption[]
): RankingPreview {
  const { rows, hasCancelColumn, skippedLines } = parseRankingTable(input);
  const ranked = rankRows(rows, hasCancelColumn);
  const errors: string[] = [];

  const byName = new Map<string, MemberOption[]>();
  for (const m of members) {
    const key = normalizeName(m.display_name);
    byName.set(key, [...(byName.get(key) ?? []), m]);
  }

  const usedMemberIds = new Set<string>();
  const seenNames = new Set<string>();

  const previewRows: RankingPreviewRow[] = ranked.map((row) => {
    const key = normalizeName(row.name);
    const exact = byName.get(key) ?? [];
    const partial =
      exact.length > 0
        ? exact
        : members.filter((m) => {
            const candidate = normalizeName(m.display_name);
            return candidate.startsWith(key) || key.startsWith(candidate);
          });

    let memberId: string | null = null;
    let issue: RankingPreviewRow["issue"] = null;

    if (partial.length === 1) {
      memberId = partial[0].id;
    } else if (partial.length > 1) {
      issue = "ambiguous";
    } else {
      issue = "unmatched";
    }

    if (seenNames.has(key)) issue = "duplicate";
    seenNames.add(key);

    if (memberId && usedMemberIds.has(memberId)) {
      issue = "duplicate";
      memberId = null;
    }
    if (memberId) usedMemberIds.add(memberId);

    if (row.paidBills === null && issue === null) issue = "missing_bills";

    return { ...row, memberId, issue };
  });

  if (previewRows.length === 0) {
    errors.push("อ่านตารางไม่ออก — วางข้อมูลจาก Google Sheet ทั้งแถวรวมหัวตาราง");
  }
  const unmatched = previewRows.filter((r) => r.issue === "unmatched").length;
  if (unmatched > 0) {
    errors.push(`มี ${unmatched} รายชื่อที่จับคู่กับผู้ใช้ในระบบไม่ได้ — เลือกเองก่อนยืนยัน`);
  }
  const duplicated = previewRows.filter((r) => r.issue === "duplicate").length;
  if (duplicated > 0) {
    errors.push(`มี ${duplicated} รายชื่อซ้ำ — ลบหรือแก้ก่อนยืนยัน`);
  }

  return { rows: previewRows, hasCancelColumn, skippedLines, errors };
}

export function isPreviewPublishable(preview: RankingPreview): boolean {
  return (
    preview.rows.length > 0 &&
    preview.rows.every((r) => r.memberId !== null && r.issue !== "duplicate")
  );
}
