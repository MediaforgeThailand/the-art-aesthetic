"use client";

import {
  BarChart3,
  Check,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Globe,
  HardDrive,
  Link2,
  Pencil,
  Plus,
  Presentation,
  Search,
  Trash2,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import {
  FILE_LINK_CATEGORIES,
  FILE_LINK_TYPE_ORDER,
  FILE_LINK_TYPES,
  fileLinkTypeInfo,
  STORAGE_BUCKET_DOCUMENTS,
  type FileLinkType,
} from "@/lib/constants";
import { formatDate, formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { FileLinkWithCreator } from "@/lib/types";
import { detectSourceType, displayUrl } from "./link-utils";
import { matchesSearch, searchTerms } from "@/lib/fuzzy";

const TYPE_ICONS: Record<FileLinkType, { icon: LucideIcon; color: string }> = {
  google_sheet: { icon: FileSpreadsheet, color: "text-emerald-600" },
  google_doc: { icon: FileText, color: "text-sky-600" },
  google_slide: { icon: Presentation, color: "text-amber-600" },
  google_form: { icon: ClipboardList, color: "text-violet-600" },
  google_drive: { icon: HardDrive, color: "text-brand-600" },
  looker_studio: { icon: BarChart3, color: "text-blue-600" },
  document: { icon: File, color: "text-stone-500" },
  website: { icon: Globe, color: "text-stone-500" },
};

function TypeIcon({ type }: { type: string }) {
  const info = TYPE_ICONS[type as FileLinkType] ?? TYPE_ICONS.website;
  const Icon = info.icon;
  return <Icon size={18} className={`shrink-0 ${info.color}`} />;
}

/** แทนอักขระที่ไม่ใช่ a-z A-Z 0-9 . - _ ด้วย "_" กันชื่อไฟล์ภาษาไทยพังใน storage */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** วันของ timestamp ตามเวลาไทย (YYYY-MM-DD) — ให้ตัวกรองวันที่ตรงกับวันที่ที่แสดงในตาราง */
function localDay(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(timestamp)
  );
}

/* ---------- ฟอร์มในโมดัล ---------- */

interface LinkForm {
  url: string;
  title: string;
  sourceType: string;
  category: string;
  description: string;
}

const emptyForm: LinkForm = {
  url: "",
  title: "",
  sourceType: "website",
  category: FILE_LINK_CATEGORIES[0],
  description: "",
};

/* ---------- หน้า ---------- */

export function FilesClient({
  links,
  userId,
  loadError,
}: {
  links: FileLinkWithCreator[];
  userId: string | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  /* ---- filters ---- */
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const hasFilter =
    search.trim() !== "" ||
    categoryFilter !== "all" ||
    typeFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filtered = useMemo(() => {
    const terms = searchTerms(search);
    return links.filter((l) => {
      if (categoryFilter !== "all" && l.category !== categoryFilter) {
        return false;
      }
      if (typeFilter !== "all" && l.source_type !== typeFilter) return false;
      const day = localDay(l.created_at);
      if (dateFrom !== "" && day < dateFrom) return false;
      if (dateTo !== "" && day > dateTo) return false;
      return matchesSearch(terms, l.title, l.url, l.description);
    });
  }, [links, search, categoryFilter, typeFilter, dateFrom, dateTo]);

  /* ---- copy url ---- */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    []
  );

  const handleCopy = async (link: FileLinkWithCreator) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt("คัดลอกลิงก์ด้วยตนเอง:", link.url);
    }
  };

  /* ---- modal add/edit ---- */
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FileLinkWithCreator | null>(null);
  const [form, setForm] = useState<LinkForm>(emptyForm);
  const [typeTouched, setTypeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setTypeTouched(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (link: FileLinkWithCreator) => {
    setEditing(link);
    setForm({
      url: link.url,
      title: link.title,
      sourceType: link.source_type,
      category: link.category,
      description: link.description ?? "",
    });
    setTypeTouched(true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleUrlChange = (url: string) => {
    setForm((f) => ({
      ...f,
      url,
      // เดาประเภทอัตโนมัติ ตราบใดที่ผู้ใช้ยังไม่เลือกประเภทเอง
      sourceType: typeTouched ? f.sourceType : detectSourceType(url),
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    // แถวที่เป็นไฟล์อัปโหลดไม่มี URL ให้แก้ — บันทึกได้เฉพาะชื่อ/หมวดหมู่/คำอธิบาย
    const isUpload = editing?.file_path != null;
    const url = form.url.trim();
    if (!isUpload && !/^https?:\/\//i.test(url)) {
      setFormError("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
      return;
    }

    setSaving(true);
    setFormError(null);

    const common = {
      title: form.title.trim(),
      category: form.category,
      description:
        form.description.trim() === "" ? null : form.description.trim(),
    };

    const { error } = editing
      ? await supabase
          .from("file_links")
          .update(
            isUpload ? common : { ...common, url, source_type: form.sourceType }
          )
          .eq("id", editing.id)
      : await supabase.from("file_links").insert({
          ...common,
          url,
          source_type: form.sourceType,
          created_by: userId,
        });

    setSaving(false);
    if (error) {
      setFormError(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setModalOpen(false);
    router.refresh();
  };

  const handleDelete = async (link: FileLinkWithCreator) => {
    if (deletingId) return;
    if (!window.confirm(`ต้องการลบ "${link.title}" ใช่หรือไม่?`)) return;
    setDeletingId(link.id);
    setRowError(null);
    const { error } = await supabase
      .from("file_links")
      .delete()
      .eq("id", link.id);
    setDeletingId(null);
    if (error) {
      setRowError(`ลบไม่สำเร็จ: ${error.message}`);
      return;
    }
    // ลบไฟล์ใน storage แบบ best effort — ล้มเหลวก็เหลือแค่ไฟล์กำพร้า
    if (link.file_path) {
      try {
        await supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([link.file_path]);
      } catch {
        // เพิกเฉย — แถวข้อมูลถูกลบไปแล้ว
      }
    }
    router.refresh();
  };

  /* ---- อัปโหลดไฟล์เข้า storage ---- */
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<globalThis.File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState<string>(
    FILE_LINK_CATEGORIES[0]
  );
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const openUpload = () => {
    setUploadFile(null);
    setUploadTitle("");
    setUploadCategory(FILE_LINK_CATEGORIES[0]);
    setUploadDescription("");
    setUploadError(null);
    setUploadOpen(true);
  };

  const handleFilePick = (f: globalThis.File | null) => {
    setUploadFile(f);
    if (f) {
      setUploadTitle((cur) =>
        cur.trim() === "" ? f.name.replace(/\.[^.]+$/, "") : cur
      );
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadFile || uploading) return;
    setUploading(true);
    setUploadError(null);

    const path = `${Date.now()}_${sanitizeFileName(uploadFile.name)}`;
    try {
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .upload(path, uploadFile);
      if (upErr) {
        setUploadError(`อัปโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`);
        return;
      }
      const { error: insErr } = await supabase.from("file_links").insert({
        title: uploadTitle.trim() || uploadFile.name,
        url: "",
        source_type: "document",
        category: uploadCategory,
        description:
          uploadDescription.trim() === "" ? null : uploadDescription.trim(),
        file_path: path,
        file_size: uploadFile.size,
        mime_type: uploadFile.type || null,
        created_by: userId,
      });
      if (insErr) {
        // ลบไฟล์ที่อัปไปแล้วแบบ best effort
        try {
          await supabase.storage
            .from(STORAGE_BUCKET_DOCUMENTS)
            .remove([path]);
        } catch {
          // เพิกเฉย
        }
        setUploadError(`บันทึกข้อมูลไฟล์ไม่สำเร็จ: ${insErr.message}`);
        return;
      }
      setUploadOpen(false);
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  /** เปิด/ดาวน์โหลดไฟล์ที่อัปโหลดผ่าน signed URL (bucket เป็น private) */
  const handleOpenFile = async (link: FileLinkWithCreator) => {
    if (!link.file_path) return;
    setRowError(null);
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_DOCUMENTS)
      .createSignedUrl(link.file_path, 3600);
    if (error || !data?.signedUrl) {
      setRowError(`เปิดไฟล์ไม่สำเร็จ${error ? `: ${error.message}` : ""}`);
      return;
    }
    // ใช้ anchor click แทน window.open — window.open หลัง await โดน popup blocker
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ---- render ---- */

  return (
    <>
      <PageHeader
        title="คลังลิงก์ไฟล์"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openUpload}>
              <UploadCloud size={16} />
              อัปโหลดไฟล์
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} />
              เพิ่มลิงก์
            </Button>
          </div>
        }
      />

      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          โหลดข้อมูลไม่สำเร็จ: {loadError} — ลองรีเฟรชหน้าอีกครั้ง
        </div>
      )}

      {/* หมวดหมู่แบบ chip */}
      <div className="mb-3 flex flex-wrap items-center gap-2 animate-fade-in-up">
        {[
          { value: "all", label: "ทั้งหมด" },
          ...FILE_LINK_CATEGORIES.map((c) => ({ value: c, label: c })),
        ].map((chip) => {
          const active = categoryFilter === chip.value;
          const count =
            chip.value === "all"
              ? links.length
              : links.filter((l) => l.category === chip.value).length;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => setCategoryFilter(chip.value)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.95] ${
                active
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-cream shadow-sm"
                  : "border border-brand-200 bg-white text-stone-600 hover:border-brand-300 hover:bg-brand-50"
              }`}
            >
              {chip.label}
              {count > 0 && (
                <span className={active ? "opacity-80" : "text-stone-400"}>
                  {" "}
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ค้นหา + ประเภท + ช่วงวันที่ */}
      <div
        className="mb-4 flex flex-wrap items-end gap-3 animate-fade-in-up"
        style={{ animationDelay: "60ms" }}
      >
        <div className="relative min-w-52 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            type="search"
            placeholder="ค้นหา"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label="กรองตามประเภท"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">ประเภท: ทั้งหมด</option>
            {FILE_LINK_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {FILE_LINK_TYPES[t].label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date-from" className="mb-1 text-xs text-stone-500">
            เพิ่มตั้งแต่วันที่
          </Label>
          <Input
            id="date-from"
            type="date"
            className="w-40"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="date-to" className="mb-1 text-xs text-stone-500">
            ถึงวันที่
          </Label>
          <Input
            id="date-to"
            type="date"
            className="w-40"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {hasFilter && (
          <Button variant="ghost" onClick={clearFilters}>
            <X size={14} />
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {rowError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 animate-fade-in">
          {rowError}
        </div>
      )}

      <Card className="overflow-hidden animate-fade-in-up" >
        {links.length === 0 && !loadError ? (
          <EmptyState
            icon={<Link2 size={40} strokeWidth={1.5} />}
            title="ยังไม่มีไฟล์หรือลิงก์ในคลัง"
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={openUpload}>
                  <UploadCloud size={16} />
                  อัปโหลดไฟล์
                </Button>
                <Button onClick={openCreate}>
                  <Plus size={16} />
                  เพิ่มลิงก์แรก
                </Button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={40} strokeWidth={1.5} />}
            title="ไม่พบลิงก์ที่ตรงกับตัวกรอง"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium text-stone-500">
                  <th className="px-4 py-3">ไฟล์ / ลิงก์</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">หมวดหมู่</th>
                  <th className="px-4 py-3">วันที่เพิ่ม</th>
                  <th className="px-4 py-3">ผู้เพิ่ม</th>
                  <th className="px-4 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((link) => {
                  const type = fileLinkTypeInfo(link.source_type);
                  return (
                    <tr
                      key={link.id}
                      className="transition-colors hover:bg-brand-50/40"
                    >
                      <td className="max-w-96 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            <TypeIcon type={link.source_type} />
                          </div>
                          <div className="min-w-0">
                            {link.file_path ? (
                              <button
                                type="button"
                                onClick={() => void handleOpenFile(link)}
                                className="group inline-flex cursor-pointer items-center gap-1.5 font-medium text-stone-900 transition-colors hover:text-brand-700 hover:underline"
                              >
                                <span className="truncate">{link.title}</span>
                                <Download
                                  size={12}
                                  className="shrink-0 text-stone-300 transition-colors group-hover:text-brand-500"
                                />
                              </button>
                            ) : (
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center gap-1.5 font-medium text-stone-900 transition-colors hover:text-brand-700 hover:underline"
                              >
                                <span className="truncate">{link.title}</span>
                                <ExternalLink
                                  size={12}
                                  className="shrink-0 text-stone-300 transition-colors group-hover:text-brand-500"
                                />
                              </a>
                            )}
                            {link.description && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">
                                {link.description}
                              </p>
                            )}
                            {link.file_path ? (
                              <p className="mt-1 text-[11px] text-stone-400">
                                ไฟล์อัปโหลด · {formatFileSize(link.file_size)}
                              </p>
                            ) : (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="max-w-72 truncate font-mono text-[11px] text-stone-400">
                                  {displayUrl(link.url)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleCopy(link)}
                                  title="คัดลอกลิงก์"
                                  className={`cursor-pointer rounded p-1 transition-all duration-200 active:scale-90 ${
                                    copiedId === link.id
                                      ? "text-emerald-600"
                                      : "text-stone-300 hover:bg-brand-50 hover:text-brand-600"
                                  }`}
                                >
                                  {copiedId === link.id ? (
                                    <Check size={13} />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                                {copiedId === link.id && (
                                  <span className="text-[11px] text-emerald-600 animate-fade-in">
                                    คัดลอกแล้ว
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge className={type.badge}>{type.label}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge className="bg-stone-100 text-stone-600">
                          {link.category}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                        {formatDate(link.created_at)}
                      </td>
                      <td className="max-w-32 truncate whitespace-nowrap px-4 py-3 text-stone-500">
                        {link.creator?.full_name ||
                          link.creator?.email ||
                          "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(link)}
                            title="แก้ไข"
                            className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-90"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(link)}
                            disabled={deletingId === link.id}
                            title="ลบ"
                            className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 active:scale-90"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* โมดัลเพิ่ม/แก้ไขลิงก์ (และแก้ไขข้อมูลไฟล์ที่อัปโหลด) */}
      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={
          editing
            ? editing.file_path
              ? "แก้ไขข้อมูลไฟล์"
              : "แก้ไขลิงก์"
            : "เพิ่มลิงก์"
        }
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {editing?.file_path == null && (
            <div>
              <Label htmlFor="link-url">ลิงก์ (URL) *</Label>
              <Input
                id="link-url"
                type="url"
                required
                disabled={saving}
                value={form.url}
                onChange={(e) => handleUrlChange(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label htmlFor="link-title">ชื่อที่จำง่าย *</Label>
            <Input
              id="link-title"
              required
              disabled={saving}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {editing?.file_path == null && (
              <div>
                <Label htmlFor="link-type">ประเภท</Label>
                <Select
                  id="link-type"
                  disabled={saving}
                  value={form.sourceType}
                  onChange={(e) => {
                    setTypeTouched(true);
                    setForm({ ...form, sourceType: e.target.value });
                  }}
                >
                  {FILE_LINK_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {FILE_LINK_TYPES[t].label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="link-category">หมวดหมู่</Label>
              <Select
                id="link-category"
                disabled={saving}
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
              >
                {FILE_LINK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {!(FILE_LINK_CATEGORIES as readonly string[]).includes(
                  form.category
                ) && <option value={form.category}>{form.category}</option>}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="link-description">คำอธิบาย</Label>
            <Textarea
              id="link-description"
              rows={2}
              disabled={saving}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>

          {formError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "บันทึกการแก้ไข" : "เพิ่มลิงก์"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* โมดัลอัปโหลดไฟล์ */}
      <Modal
        open={uploadOpen}
        onClose={() => {
          if (!uploading) setUploadOpen(false);
        }}
        title="อัปโหลดไฟล์"
      >
        <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
          <div>
            <Label htmlFor="upload-file">เลือกไฟล์ *</Label>
            <input
              id="upload-file"
              type="file"
              disabled={uploading}
              onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-lg border border-stone-300/80 bg-white/80 text-sm text-stone-600 transition-colors file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {uploadFile && (
              <p className="mt-1.5 text-xs text-stone-500">
                {uploadFile.name} · {formatFileSize(uploadFile.size)}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="upload-title">ชื่อที่จำง่าย *</Label>
            <Input
              id="upload-title"
              required
              disabled={uploading}
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="upload-category">หมวดหมู่</Label>
            <Select
              id="upload-category"
              disabled={uploading}
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
            >
              {FILE_LINK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="upload-description">คำอธิบาย</Label>
            <Textarea
              id="upload-description"
              rows={2}
              disabled={uploading}
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
            />
          </div>

          {uploadError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
              {uploadError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={uploading}
              onClick={() => setUploadOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              loading={uploading}
              disabled={!uploadFile || uploadTitle.trim() === ""}
            >
              <UploadCloud size={16} />
              อัปโหลด
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
