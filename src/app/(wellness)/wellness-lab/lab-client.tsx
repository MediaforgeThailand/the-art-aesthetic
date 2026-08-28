"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { LabFilesPanel } from "@/components/wellness/lab-files";
import type {
  WellnessCustomerRow,
  WellnessLabFileRow,
} from "@/lib/database.types";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { wellnessCustomerName } from "@/lib/wellness-constants";

export type LabQueueCustomer = WellnessCustomerRow & {
  lab_files: WellnessLabFileRow[];
};

/**
 * หน้าทำงานของทีม Lab — **อัพผลแลบ** (Stage 2 ของ flow)
 *
 * มีแค่ 2 กอง: "รอผลแลบ" (งานที่ต้องทำ) และ "ยืนยันแล้ว" (ไว้กลับมาแก้ถ้าอัพผิด)
 * ไม่มีข้อมูล/ปุ่มของบทบาทอื่น (เบอร์โทร คิวนัด ปิดเคส) ในหน้านี้โดยตั้งใจ
 */
export function LabQueueClient({
  customers: customersProp,
  uid,
}: {
  customers: LabQueueCustomer[];
  uid: string | null;
}) {
  const router = useRouter();

  const [state, setState] = useState({
    base: customersProp,
    customers: customersProp,
  });
  if (state.base !== customersProp) {
    setState({ base: customersProp, customers: customersProp });
  }
  const customers = state.customers;

  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openConfirmed, setOpenConfirmed] = useState<string | null>(null);
  const [showConfirmed, setShowConfirmed] = useState(false);

  const q = search.trim().toLowerCase();
  const matched = q
    ? customers.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.procedure_text}`
          .toLowerCase()
          .includes(q)
      )
    : customers;

  const waiting = matched.filter((c) => !c.lab_confirmed_at);
  const confirmed = matched.filter((c) => c.lab_confirmed_at);

  function patchLocal(id: string, patch: Partial<LabQueueCustomer>) {
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  async function setConfirmed(customer: LabQueueCustomer, next: boolean) {
    if (busyId) return;
    setBusyId(customer.id);
    setError(null);
    const patch = next
      ? { lab_confirmed_at: new Date().toISOString(), lab_confirmed_by: uid }
      : { lab_confirmed_at: null, lab_confirmed_by: null };
    const prev = {
      lab_confirmed_at: customer.lab_confirmed_at,
      lab_confirmed_by: customer.lab_confirmed_by,
    };
    patchLocal(customer.id, patch);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("wellness_customers")
      .update(patch)
      .eq("id", customer.id);
    setBusyId(null);
    if (err) {
      patchLocal(customer.id, prev);
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs sm:flex-1">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อลูกค้า"
              className="w-full rounded-full border border-stone-200/80 bg-white/90 py-2.5 pl-10 pr-4 text-base text-stone-700 shadow-sm placeholder:text-stone-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 sm:ml-auto">
            รอผลแลบ {waiting.length} ราย
          </span>
        </div>

        {error && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-[15px] text-rose-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 cursor-pointer text-xs underline"
            >
              ปิด
            </button>
          </div>
        )}

        {q && matched.length === 0 && customers.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[15px] text-amber-800">
            ไม่พบชื่อที่ตรงกับ “{search}” — คิวทั้งหมด {customers.length}{" "}
            รายยังอยู่ครบ
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 max-sm:min-h-11"
            >
              <X size={12} /> ล้างคำค้น
            </button>
          </div>
        )}

        {/* ---------- กองงานหลัก: รอผลแลบ ---------- */}
        <div className="space-y-3">
          {waiting.length === 0 ? (
            <div className="glass flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center">
              <CheckCircle2 size={34} className="text-emerald-400" />
              <p className="text-sm font-medium text-stone-700">
                ไม่มีคิวรอผลแลบแล้ว
              </p>
              <p className="text-[13px] text-stone-400">
                การ์ดใหม่จะโผล่ที่นี่เองเมื่อทีม BC เพิ่มลูกค้าเข้าระบบ
              </p>
            </div>
          ) : (
            waiting.map((c) => (
              <section key={c.id} className="glass overflow-hidden rounded-xl">
                <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/60 px-4 py-3">
                  <h2 className="text-base font-semibold text-stone-800">
                    {wellnessCustomerName(c)}
                  </h2>
                  {c.procedure_text && (
                    <span className="inline-flex min-w-0 items-center gap-1 text-[13px] text-stone-500">
                      <Stethoscope size={13} className="shrink-0 text-stone-400" />
                      <span className="truncate">{c.procedure_text}</span>
                    </span>
                  )}
                  <span className="text-[13px] text-stone-400 sm:ml-auto">
                    เข้าคิว {formatDate(c.created_at)}
                  </span>
                </header>

                <LabFilesPanel
                  customerId={c.id}
                  files={c.lab_files}
                  canEdit
                  uid={uid}
                  onAdded={(rows) =>
                    patchLocal(c.id, { lab_files: [...c.lab_files, ...rows] })
                  }
                  onRemoved={(fileId) =>
                    patchLocal(c.id, {
                      lab_files: c.lab_files.filter((f) => f.id !== fileId),
                    })
                  }
                  emptyText="ยังไม่มีไฟล์ผลตรวจของรายนี้ — กด “อัพโหลดไฟล์ผลตรวจ”"
                />

                <div className="flex flex-wrap items-center gap-2 border-t border-white/60 px-4 py-3">
                  <p className="min-w-0 flex-1 text-[13px] text-stone-500">
                    {c.lab_files.length === 0
                      ? "อัพไฟล์อย่างน้อย 1 ไฟล์ก่อน จึงจะกดยืนยันได้"
                      : `แนบแล้ว ${c.lab_files.length} ไฟล์ — ตรวจครบแล้วกดยืนยันเพื่อส่งต่อให้ Admin โทรนัด`}
                  </p>
                  <Button
                    onClick={() => void setConfirmed(c, true)}
                    disabled={c.lab_files.length === 0}
                    loading={busyId === c.id}
                  >
                    <CheckCircle2 size={15} /> ยืนยันผลครบ
                  </Button>
                </div>
              </section>
            ))
          )}
        </div>

        {/* ---------- กองอ้างอิง: ยืนยันแล้ว (ไว้กลับมาแก้ถ้าอัพผิด) ---------- */}
        {confirmed.length > 0 && (
          <section className="glass mt-4 overflow-hidden rounded-xl">
            <button
              type="button"
              onClick={() => setShowConfirmed((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-white/50 max-sm:min-h-11"
            >
              {showConfirmed ? (
                <ChevronDown size={15} className="shrink-0 text-stone-400" />
              ) : (
                <ChevronRight size={15} className="shrink-0 text-stone-400" />
              )}
              <span className="text-base font-semibold text-stone-800">
                ยืนยันแล้ว · รอ Admin นัด
              </span>
              <span className="text-[13px] text-stone-400">
                {confirmed.length} ราย
              </span>
              <span className="ml-auto text-xs text-stone-400">
                กดเพื่อ{showConfirmed ? "ซ่อน" : "เปิดดู"} — อัพผิดยังแก้ได้
              </span>
            </button>

            {showConfirmed && (
              <ul className="divide-y divide-white/60 border-t border-white/60">
                {confirmed.map((c) => {
                  const open = openConfirmed === c.id;
                  return (
                    <li key={c.id}>
                      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-stone-800">
                            {wellnessCustomerName(c)}
                          </span>
                          <span className="block text-xs text-stone-400">
                            ยืนยันเมื่อ {formatDateTime(c.lab_confirmed_at)} ·{" "}
                            {c.lab_files.length} ไฟล์
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setOpenConfirmed(open ? null : c.id)}
                          className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-brand-300 hover:text-brand-700 max-sm:min-h-11"
                        >
                          {open ? "ปิด" : "แก้ไขไฟล์"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void setConfirmed(c, false)}
                          disabled={busyId === c.id}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] text-stone-500 transition-colors hover:bg-white/70 hover:text-stone-700 disabled:opacity-50 max-sm:min-h-11"
                        >
                          <RotateCcw size={12} /> ยกเลิกการยืนยัน
                        </button>
                      </div>
                      {open && (
                        <div className="border-t border-white/60 bg-white/30 pb-2">
                          <LabFilesPanel
                            customerId={c.id}
                            files={c.lab_files}
                            canEdit
                            uid={uid}
                            onAdded={(rows) =>
                              patchLocal(c.id, {
                                lab_files: [...c.lab_files, ...rows],
                              })
                            }
                            onRemoved={(fileId) =>
                              patchLocal(c.id, {
                                lab_files: c.lab_files.filter(
                                  (f) => f.id !== fileId
                                ),
                              })
                            }
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
