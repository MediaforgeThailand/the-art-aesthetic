/**
 * ปิดบังข้อมูลติดต่อสำหรับ "รายการรวม" — คนที่ไม่ได้ถือเคสต้องไม่เห็นเบอร์เต็ม
 * (ข้อกำหนดความปลอดภัยข้อ 14: Contact data ถูก Mask ตาม Role)
 */

export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${digits.slice(0, 3)}-•••-${digits.slice(-2)}`;
}

export function maskLineId(lineId: string | null | undefined): string {
  const id = (lineId ?? "").trim();
  if (!id) return "—";
  if (id.length <= 2) return "••";
  return `${id.slice(0, 2)}${"•".repeat(Math.min(6, id.length - 2))}`;
}

/** ชื่อลูกค้าในรายการรวม — ชื่อต้น + อักษรแรกของนามสกุล */
export function maskName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].slice(0, 1)}.`;
}
