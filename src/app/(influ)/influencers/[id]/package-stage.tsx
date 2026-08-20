"use client";

import {
  BellRing,
  Check,
  NotebookPen,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, Input, Textarea } from "@/components/ui";
import { formatDate, formatDateTime, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { InfluencerRow, InfluTaskRow } from "@/lib/types";

/* ============ ขั้นตามงาน โหมด "แพ็คเกจเฉพาะ" ============
   เคสดารา/คนที่เราจ่ายค่าตัว — เงื่อนไขไม่เหมือนเคสมาตรฐาน
   ขอบเขตงานเขียนเป็น note ก้อนใหญ่ (influencers.package_note)
   แล้วแตกเป็น checklist ที่ทีมพิมพ์เอง (influ_tasks ที่ is_custom = true) */

export function PackageStage({
  influencer,
  tasks,
  nextStep,
  readOnly,
}: {
  influencer: InfluencerRow;
  /** เฉพาะข้อของโหมดนี้ (is_custom = true) — FollowupStage กรองมาให้แล้ว */
  tasks: InfluTaskRow[];
  /** เลข step ถัดไปที่ว่าง — ต้องไม่ชนกับข้อของโหมดมาตรฐาน (unique influencer_id+step) */
  nextStep: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();

  const [note, setNote] = useState(influencer.package_note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<InfluTaskRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const noteDirty = note.trim() !== (influencer.package_note ?? "").trim();
  const rows = useMemo(
    () => [...tasks].sort((a, b) => a.step - b.step),
    [tasks]
  );

  /** จำนวนวันจากวันนี้ถึงกำหนด — ติดลบ = เลยกำหนดแล้ว */
  const daysLeft = (due: string) =>
    Math.round(
      (new Date(due.slice(0, 10)).getTime() - new Date(today).getTime()) /
        86400000
    );

  const saveNote = async () => {
    if (readOnly || savingNote) return;
    setSavingNote(true);
    setErr(null);
    const { error } = await supabase
      .from("influencers")
      .update({ package_note: note.trim() || null })
      .eq("id", influencer.id);
    setSavingNote(false);
    if (error) {
      setErr(`บันทึก note ไม่สำเร็จ: ${error.message}`);
      return;
    }
    setNoteSaved(true);
    window.setTimeout(() => setNoteSaved(false), 2000);
    router.refresh();
  };

  const addItem = async () => {
    if (readOnly || adding) return;
    const title = newTitle.trim();
    if (!title) {
      setErr("พิมพ์ชื่อเงื่อนไขก่อนกดเพิ่ม");
      return;
    }
    setAdding(true);
    setErr(null);
    const { error } = await supabase.from("influ_tasks").insert({
      influencer_id: influencer.id,
      step: nextStep,
      title,
      due_date: newDue || null,
      is_custom: true,
      section: null,
    });
    setAdding(false);
    if (error) {
      // 23505 = ชน unique (influencer_id, step) เพราะมีคนเพิ่มพร้อมกัน — กดใหม่ได้เลย step จะขยับเอง
      setErr(
        error.code === "23505"
          ? "เพิ่มไม่สำเร็จ: มีคนเพิ่มข้อพร้อมกันพอดี กดเพิ่มอีกครั้งได้เลย"
          : `เพิ่มไม่สำเร็จ: ${error.message}`
      );
      return;
    }
    setNewTitle("");
    setNewDue("");
    router.refresh();
  };

  const toggleDone = async (t: InfluTaskRow) => {
    if (readOnly) return;
    setErr(null);
    const { error } = await supabase
      .from("influ_tasks")
      .update({
        done: !t.done,
        done_at: !t.done ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  const saveTitle = async (t: InfluTaskRow) => {
    if (readOnly) return;
    const value = titleDraft.trim();
    if (!value) {
      setErr("ชื่อเงื่อนไขห้ามเว้นว่าง");
      return;
    }
    if (value === t.title) {
      setEditingId(null);
      return;
    }
    setErr(null);
    const { error } = await supabase
      .from("influ_tasks")
      .update({ title: value })
      .eq("id", t.id);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setEditingId(null);
    router.refresh();
  };

  const saveDue = async (t: InfluTaskRow, value: string) => {
    if (readOnly) return;
    if ((t.due_date ?? "") === value) return;
    setErr(null);
    const { error } = await supabase
      .from("influ_tasks")
      .update({ due_date: value || null })
      .eq("id", t.id);
    if (error) {
      setErr(`บันทึกกำหนดวันไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  const saveDescription = async (t: InfluTaskRow, value: string) => {
    if (readOnly) return;
    if ((t.description ?? "") === value.trim()) return;
    setErr(null);
    const { error } = await supabase
      .from("influ_tasks")
      .update({ description: value.trim() || null })
      .eq("id", t.id);
    if (error) {
      setErr(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  const removeItem = async (t: InfluTaskRow) => {
    setErr(null);
    const { error } = await supabase.from("influ_tasks").delete().eq("id", t.id);
    if (error) {
      setErr(`ลบไม่สำเร็จ: ${error.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {err && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {err}
        </p>
      )}

      {/* ขอบเขตงานตามแพ็คเกจ — note ก้อนใหญ่ */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-400 px-4 py-2.5">
          <NotebookPen size={15} className="text-cream" />
          <h3 className="text-sm font-semibold text-cream">
            แพ็คเกจนี้เขาต้องทำอะไรบ้าง (ขอบเขตงานที่ตกลงกัน)
          </h3>
        </div>
        <div className="p-4">
          <Textarea
            rows={7}
            value={note}
            disabled={readOnly}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              "เขียนสรุปดีลไว้ตรงนี้ เช่น\n• ค่าตัว 150,000 บาท (จ่าย 50% มัดจำ / 50% หลังคลิปขึ้น)\n• คลิปรีวิวหลัก 1 คลิป ลง TikTok + IG Reels\n• IG Story 3 สตอรี่ วันเข้ารับบริการ\n• ห้ามรับงานคู่แข่ง 3 เดือน\n• เปิดสิทธิ์ยิงแอดผ่านบัญชี TikTok 60 วัน"
            }
          />
          {!readOnly && (
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="secondary"
                loading={savingNote}
                disabled={!noteDirty}
                onClick={() => void saveNote()}
              >
                บันทึก note
              </Button>
              {noteSaved && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 animate-fade-in">
                  <Check size={13} /> บันทึกแล้ว
                </span>
              )}
              {noteDirty && !noteSaved && (
                <span className="text-xs text-amber-600">
                  ยังไม่ได้บันทึกการแก้ไข
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* checklist เงื่อนไขที่กรอกเอง */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-400 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-cream">
            checklist เงื่อนไขของเคสนี้
          </h3>
          <span className="ml-auto text-xs text-cream/80">
            {rows.length > 0 ? `${rows.filter((t) => t.done).length}/${rows.length} ข้อ` : "ยังไม่มีข้อ"}
          </span>
        </div>

        {/* ช่องเพิ่มข้อใหม่ — อยู่บนสุดให้ข้อที่เพิ่งเพิ่มโผล่ใต้ช่องทันที */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 bg-white/60 px-4 py-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="เงื่อนไขที่ต้องติดตาม เช่น ลงคลิปรีวิวหลัก TikTok"
              className="min-w-[14rem] flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addItem();
                }
              }}
            />
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              title="กำหนดวัน (ไม่ใส่ก็ได้ — ข้อที่ไม่มีกำหนดจะไม่ถูกเตือน)"
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-base text-stone-700 sm:text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <Button loading={adding} onClick={() => void addItem()}>
              <Plus size={15} />
              เพิ่มข้อ
            </Button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-400">
            ยังไม่มีเงื่อนไขในเคสนี้
            {/* readOnly มาได้ทั้งจาก "ปิดงานแล้ว" และ "สิทธิ์ team ที่ดูอย่างเดียว"
                จึงห้ามสรุปว่าปิดงาน — บอกกลางๆ ว่าแก้ไม่ได้จากตรงนี้ */}
            {readOnly
              ? ""
              : " — พิมพ์ข้อแรกในช่องด้านบนได้เลย (ใส่กำหนดวันไว้ ระบบจะเตือนเมื่อใกล้ถึงกำหนด)"}
          </p>
        ) : (
          <div className="divide-y divide-stone-100/80">
            {rows.map((t, idx) => {
              const dl = t.due_date ? daysLeft(t.due_date) : null;
              return (
                <div
                  key={t.id}
                  className={`px-4 py-3 ${t.done ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => void toggleDone(t)}
                      title={t.done ? "ยกเลิกติ๊ก" : "ติ๊กว่าทำแล้ว"}
                      className="mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center active:scale-90 disabled:cursor-default max-sm:-mx-2.5 max-sm:-mb-2.5 max-sm:-mt-2 max-sm:h-11 max-sm:w-11"
                >
                  {/* วงที่มองเห็นคงขนาดเดิม — ตัวปุ่มขยายเป็นเป้านิ้ว 44px บนจอเล็ก */}
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                      t.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-stone-300 bg-white text-transparent hover:border-emerald-400"
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {editingId === t.id ? (
                          <span className="flex items-center gap-1">
                            <span className="text-sm font-medium text-stone-400">
                              {idx + 1}.
                            </span>
                            <input
                              autoFocus
                              value={titleDraft}
                              onChange={(e) => setTitleDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveTitle(t);
                                } else if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                              className="min-w-[12rem] rounded-md border border-brand-300 bg-white px-2 py-1 text-base font-medium sm:text-sm text-stone-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                            />
                            <button
                              type="button"
                              onClick={() => void saveTitle(t)}
                              title="บันทึกชื่อ"
                              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-emerald-600 transition-all hover:bg-emerald-50 active:scale-90 sm:h-7 sm:w-7"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              title="ยกเลิก"
                              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-400 transition-all hover:bg-stone-100 active:scale-90 sm:h-7 sm:w-7"
                            >
                              <X size={14} />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => {
                              setEditingId(t.id);
                              setTitleDraft(t.title);
                            }}
                            title={readOnly ? undefined : "แก้ไขชื่อเงื่อนไข"}
                            className={`rounded-md px-1 py-0.5 text-left text-sm font-medium transition-colors max-sm:min-h-11 ${
                              t.done
                                ? "text-stone-400 line-through"
                                : "text-stone-900"
                            } ${
                              readOnly
                                ? "cursor-default"
                                : "cursor-pointer hover:bg-brand-50"
                            }`}
                          >
                            {idx + 1}. {t.title}
                          </button>
                        )}

                        {/* เตือนเฉพาะข้อที่ตั้งกำหนดวันไว้ */}
                        {t.due_date &&
                          dl !== null &&
                          !t.done &&
                          (dl < 0 ? (
                            <Badge className="border border-rose-200 bg-rose-50 text-rose-700">
                              <BellRing size={11} /> เลยกำหนด {Math.abs(dl)} วัน
                            </Badge>
                          ) : dl === 0 ? (
                            <Badge className="border border-amber-300 bg-amber-50 text-amber-700">
                              <BellRing size={11} /> ครบกำหนดวันนี้
                            </Badge>
                          ) : dl <= 7 ? (
                            <Badge className="border border-amber-300 bg-amber-50 text-amber-700">
                              <BellRing size={11} /> อีก {dl} วัน
                            </Badge>
                          ) : null)}
                        {t.done && t.due_date && (
                          <Badge className="bg-stone-100 text-stone-400">
                            กำหนด {formatDate(t.due_date)}
                          </Badge>
                        )}
                      </div>

                      <input
                        defaultValue={t.description ?? ""}
                        disabled={readOnly}
                        placeholder="+ เพิ่มหมายเหตุ เช่น จ่ายมัดจำแล้ว รอคลิป..."
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                        }
                        onBlur={() =>
                          void saveDescription(
                            t,
                            drafts[t.id] ?? t.description ?? ""
                          )
                        }
                        className="mt-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-base sm:text-xs text-stone-700 placeholder:text-stone-300 transition-colors hover:border-stone-200 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                      />
                      {t.done && t.done_at && (
                        <p className="mt-1 text-[11px] text-emerald-600">
                          ✓ ทำแล้วเมื่อ {formatDateTime(t.done_at)}
                        </p>
                      )}
                    </div>

                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          type="date"
                          value={t.due_date ?? ""}
                          onChange={(e) => void saveDue(t, e.target.value)}
                          title="กำหนดวันของข้อนี้ (ล้างค่า = ไม่มีกำหนด ไม่ถูกเตือน)"
                          className="rounded-md border border-stone-200 bg-white/70 px-2 py-1 text-base text-stone-600 sm:text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(t)}
                          title="ลบข้อนี้"
                          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-300 transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-90 sm:h-7 sm:w-7"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="ลบเงื่อนไขข้อนี้"
        message={
          <>
            ลบ &quot;{confirmDelete?.title}&quot; ออกจาก checklist ของเคสนี้?
            หมายเหตุและสถานะที่ติ๊กไว้จะหายไปด้วย
          </>
        }
        onConfirm={() => {
          if (confirmDelete) void removeItem(confirmDelete);
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
