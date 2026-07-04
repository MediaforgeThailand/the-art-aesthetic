import type { FileLinkType } from "@/lib/constants";

/** เดาประเภทแหล่งไฟล์จาก URL อัตโนมัติ */
export function detectSourceType(rawUrl: string): FileLinkType {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return "website";
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (host === "docs.google.com") {
    if (path.startsWith("/spreadsheets")) return "google_sheet";
    if (path.startsWith("/document")) return "google_doc";
    if (path.startsWith("/presentation")) return "google_slide";
    if (path.startsWith("/forms")) return "google_form";
    return "google_drive";
  }
  if (host === "sheets.google.com") return "google_sheet";
  if (host === "forms.gle" || host === "forms.google.com") {
    return "google_form";
  }
  if (host === "drive.google.com" || host === "drive.usercontent.google.com") {
    return "google_drive";
  }
  if (host === "lookerstudio.google.com" || host === "datastudio.google.com") {
    return "looker_studio";
  }

  if (/\.(pdf|docx?|xlsx?|pptx?|csv|zip|rar)$/i.test(path)) {
    return "document";
  }

  return "website";
}

/** ตัด protocol/query ให้ URL อ่านง่ายขึ้นในตาราง */
export function displayUrl(rawUrl: string): string {
  return rawUrl.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}
