"use client";

import {
  Download,
  File,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import { DOC_CATEGORIES, STORAGE_BUCKET_DOCUMENTS } from "@/lib/constants";
import { formatDate, formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { DocumentRow } from "@/lib/types";

const CATEGORY_BADGE: Record<string, string> = {
  "ทั่วไป": "bg-stone-100 text-stone-600",
  "ใบเสนอราคา": "bg-sky-100 text-sky-700",
  "สัญญา": "bg-violet-100 text-violet-700",
  "การเงิน": "bg-emerald-100 text-emerald-700",
  "การตลาด": "bg-rose-100 text-rose-700",
  "บุคลากร": "bg-amber-100 text-amber-700",
  "คู่มือ/SOP": "bg-teal-100 text-teal-700",
  "อื่นๆ": "bg-stone-100 text-stone-500",
};

function categoryBadgeClass(category: string): string {
  return CATEGORY_BADGE[category] ?? "bg-stone-100 text-stone-600";
}

/** ไอคอนตามประเภทไฟล์ (ดูจาก mime type) */
function FileTypeIcon({ mimeType }: { mimeType: string | null }) {
  const mt = (mimeType ?? "").toLowerCase();
  if (mt.startsWith("image/")) {
    return <ImageIcon size={18} className="text-violet-500" />;
  }
  if (mt.includes("spreadsheet") || mt.includes("excel") || mt.includes("csv")) {
    return <FileSpreadsheet size={18} className="text-emerald-600" />;
  }
  if (
    mt.includes("pdf") ||
    mt.includes("word") ||
    mt.includes("document") ||
    mt.startsWith("text/")
  ) {
    return <FileText size={18} className="text-sky-600" />;
  }
  return <File size={18} className="text-stone-400" />;
}

/** แทนอักขระที่ไม่ใช่ a-z A-Z 0-9 . - _ ด้วย "_" กันชื่อไฟล์ภาษาไทยพังใน storage */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** ตัดนามสกุลไฟล์ออกจากชื่อ */
function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export function DocumentsClient({
  documents,
  userId,
}: {
  documents: DocumentRow[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // filter / ค้นหา
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // modal อัปโหลด
  const [modalOpen, setModalOpen] = useState(false);
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // สถานะรายแถว (ดาวน์โหลด/ลบ)
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (categoryFilter !== "all" && d.category !== categoryFilter) {
        return false;
      }
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, categoryFilter, search]);

  const resetForm = () => {
    setFile(null);
    setName("");
    setCategory(DOC_CATEGORIES[0]);
    setDescription("");
    setFormError(null);
  };

  const closeModal = () => {
    if (uploading) return;
    setModalOpen(false);
    resetForm();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected) {
      setName(stripExtension(selected.name));
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setUploading(true);
    setFormError(null);

    // สร้าง storage path ปลอดภัย: เวลาปัจจุบัน millis + "_" + ชื่อไฟล์ที่ sanitize แล้ว
    const path = `${Date.now()}_${sanitizeFileName(file.name)}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .upload(path, file);

      if (uploadError) {
        setFormError(`อัปโหลดไฟล์ไม่สำเร็จ: ${uploadError.message}`);
        return;
      }

      const { error: insertError } = await supabase.from("documents").insert({
        name: name.trim(),
        description: description.trim() || null,
        category,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: userId || null,
      });

      if (insertError) {
        // ลบไฟล์ที่อัปไปแล้วแบบ best effort
        try {
          await supabase.storage.from(STORAGE_BUCKET_DOCUMENTS).remove([path]);
        } catch {
          // เพิกเฉย — ลบไม่ได้ก็ไม่เป็นไร
        }
        setFormError(`บันทึกข้อมูลเอกสารไม่สำเร็จ: ${insertError.message}`);
        return;
      }

      setModalOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentRow) => {
    setBusyId(doc.id);
    setListError(null);
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET_DOCUMENTS)
        .createSignedUrl(doc.file_path, 3600);

      if (error || !data?.signedUrl) {
        setListError(
          `สร้างลิงก์ดาวน์โหลดไม่สำเร็จ${error ? `: ${error.message}` : ""}`
        );
        return;
      }
      // ใช้ anchor click แทน window.open — window.open หลัง await
      // หลุดจาก user gesture แล้วโดน popup blocker บล็อกเงียบๆ
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = doc.name;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: DocumentRow) => {
    if (!window.confirm(`ต้องการลบเอกสาร "${doc.name}" หรือไม่?`)) return;

    setBusyId(doc.id);
    setListError(null);
    try {
      // ลบแถวข้อมูลใน DB ก่อน — ถ้าลบไฟล์ก่อนแล้ว DB ล้มเหลว
      // จะเหลือ record ที่ดาวน์โหลดไม่ได้ตลอดไป
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);

      if (error) {
        setListError(`ลบเอกสารไม่สำเร็จ: ${error.message}`);
        return;
      }

      // ลบไฟล์ใน storage แบบ best effort — ล้มเหลวก็เหลือแค่ไฟล์กำพร้า
      try {
        await supabase.storage
          .from(STORAGE_BUCKET_DOCUMENTS)
          .remove([doc.file_path]);
      } catch {
        // เพิกเฉย — แถวข้อมูลถูกลบไปแล้ว
      }

      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="คลังเอกสาร"
        description="จัดเก็บและจัดการเอกสารของแผนก Aesthetic"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Upload size={16} />
            อัปโหลดเอกสาร
          </Button>
        }
      />

      {/* filter หมวดหมู่ + ค้นหา */}
      <div className="mb-4 flex flex-wrap items-center gap-2 animate-fade-in-up">
        {[
          { value: "all", label: "ทั้งหมด" },
          ...DOC_CATEGORIES.map((c) => ({ value: c, label: c })),
        ].map((chip) => {
          const active = categoryFilter === chip.value;
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
            </button>
          );
        })}
        <div className="relative ml-auto w-full sm:w-64">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            type="search"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearch(e.target.value)
            }
            placeholder="ค้นหาชื่อเอกสาร..."
            className="pl-9"
          />
        </div>
      </div>

      {listError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {listError}
        </div>
      )}

      <Card className="overflow-hidden animate-fade-in-up">
        {documents.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={40} />}
            title="ยังไม่มีเอกสารในคลัง"
            description="เริ่มต้นด้วยการอัปโหลดเอกสารแรกของแผนก"
            action={
              <Button onClick={() => setModalOpen(true)}>
                <Upload size={16} />
                อัปโหลดเอกสาร
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={40} />}
            title="ไม่พบเอกสารที่ตรงกับเงื่อนไข"
            description="ลองเปลี่ยนหมวดหมู่หรือคำค้นหา"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium text-stone-500">
                  <th className="px-4 py-3">เอกสาร</th>
                  <th className="px-4 py-3">หมวดหมู่</th>
                  <th className="px-4 py-3">ขนาด</th>
                  <th className="px-4 py-3">อัปโหลดเมื่อ</th>
                  <th className="px-4 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((doc) => (
                  <tr
                    key={doc.id}
                    className="transition-colors hover:bg-brand-50/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          <FileTypeIcon mimeType={doc.mime_type} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900">
                            {doc.name}
                          </p>
                          {doc.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">
                              {doc.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={categoryBadgeClass(doc.category)}>
                        {doc.category}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleDownload(doc)}
                          disabled={busyId === doc.id}
                          title="ดาวน์โหลด"
                          aria-label={`ดาวน์โหลด ${doc.name}`}
                          className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          disabled={busyId === doc.id}
                          title="ลบ"
                          aria-label={`ลบ ${doc.name}`}
                          className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* modal อัปโหลดเอกสาร */}
      <Modal open={modalOpen} onClose={closeModal} title="อัปโหลดเอกสาร">
        <form onSubmit={handleUpload} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <div>
            <Label htmlFor="doc-file">ไฟล์เอกสาร *</Label>
            <input
              id="doc-file"
              type="file"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full cursor-pointer rounded-lg border border-stone-300 text-sm text-stone-600 transition-colors file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {file && (
              <p className="mt-1.5 text-xs text-stone-500">
                {file.name} · {formatFileSize(file.size)}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="doc-name">ชื่อเอกสาร *</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              placeholder="เช่น ใบเสนอราคาโปรแกรม Botox"
              disabled={uploading}
              required
            />
          </div>

          <div>
            <Label htmlFor="doc-category">หมวดหมู่</Label>
            <Select
              id="doc-category"
              value={category}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setCategory(e.target.value)
              }
              disabled={uploading}
            >
              {DOC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="doc-description">คำอธิบาย</Label>
            <Textarea
              id="doc-description"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              rows={3}
              placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
              disabled={uploading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
              disabled={uploading}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              loading={uploading}
              disabled={!file || !name.trim()}
            >
              อัปโหลด
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
