"use client";

import { CheckCircle2, FileSignature, Images, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SignaturePad, SignatureSlot } from "@/components/signature-pad";
import { Button, Card, Input, Modal } from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import {
  INFLU_TIER_ORDER,
  INFLU_TIERS,
  MEMO_COMPANY,
  MEMO_SIGNERS,
  type MemoRole,
} from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/client";
import type { InfluencerRow, InfluSignatureRow } from "@/lib/types";
import { useSignedUrl } from "../use-signed-url";

/* ---------- ปุ่มดูรูปที่อัพโหลดไว้ (รูป influ + รูปช่องทาง) ---------- */

export function PhotosModal({
  influencer,
  open,
  onClose,
}: {
  influencer: InfluencerRow;
  open: boolean;
  onClose: () => void;
}) {
  const photoUrl = useSignedUrl(open ? influencer.photo_path : null);
  const channelUrl = useSignedUrl(open ? influencer.channel_photo_path : null);

  return (
    <Modal open={open} onClose={onClose} title="รูปภาพของ Influencer" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "รูป Influencer", url: photoUrl, path: influencer.photo_path },
          {
            label: "รูปช่องทาง (Channel)",
            url: channelUrl,
            path: influencer.channel_photo_path,
          },
        ].map((p) => (
          <div key={p.label}>
            <p className="mb-2 text-xs font-medium text-stone-500">{p.label}</p>
            {p.path ? (
              p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt={p.label}
                  className="w-full rounded-xl border border-stone-200 object-contain"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-stone-100 text-xs text-stone-400">
                  กำลังโหลด...
                </div>
              )
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-stone-200 text-xs text-stone-400">
                ยังไม่ได้อัพโหลด (กลับไปอัพโหลดใน Stage 2)
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- Stage 3: Memo ขออนุมัติ (จำลองแบบฟอร์มจริง) ---------- */

export function MemoStage({
  influencer,
  signatures,
  userName,
  readOnly,
}: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  userName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [signingRole, setSigningRole] = useState<MemoRole | null>(null);
  const [makerName, setMakerName] = useState(
    influencer.maker_name || userName
  );
  const [photosOpen, setPhotosOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoUrl = useSignedUrl(influencer.photo_path);
  const channelUrl = useSignedUrl(influencer.channel_photo_path);

  const memoSigs = useMemo(() => {
    const map = new Map<string, InfluSignatureRow>();
    for (const s of signatures) {
      if (s.doc === "memo") map.set(s.role, s);
    }
    return map;
  }, [signatures]);

  const allSigned = MEMO_SIGNERS.every((s) => memoSigs.has(s.role));

  const saveSignature = async (dataUrl: string) => {
    if (!signingRole) return;
    const preset = MEMO_SIGNERS.find((s) => s.role === signingRole);
    const signerName =
      signingRole === "maker" ? makerName.trim() || userName : preset?.name;
    setSigningRole(null);
    setError(null);
    // ผู้จัดทำ: บันทึกชื่อลง influencer ด้วย (โชว์ในเอกสารถาวร)
    if (signingRole === "maker" && makerName.trim() !== influencer.maker_name) {
      await supabase
        .from("influencers")
        .update({ maker_name: makerName.trim() || userName })
        .eq("id", influencer.id);
    }
    const { error: e } = await supabase.from("influ_signatures").insert({
      influencer_id: influencer.id,
      doc: "memo",
      role: signingRole,
      signer_name: signerName ?? null,
      signature_data: dataUrl,
    });
    if (e) setError(`บันทึกลายเซนไม่สำเร็จ: ${e.message}`);
    router.refresh();
  };

  const goNext = async () => {
    if (!allSigned) return;
    await supabase
      .from("influencers")
      .update({ stage: 4 })
      .eq("id", influencer.id);
    router.refresh();
  };

  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");
  // วันที่บนหัวเอกสาร: ตรึงเป็นวันที่เซนครั้งแรกเมื่อเริ่มมีลายเซน — เปิดดูย้อนหลังต้องไม่เปลี่ยนทุกวัน
  const memoDate = useMemo(() => {
    let earliest: string | null = null;
    for (const s of memoSigs.values()) {
      if (!earliest || s.signed_at < earliest) earliest = s.signed_at;
    }
    return earliest ? new Date(earliest) : new Date();
  }, [memoSigs]);
  const memoDateText = memoDate.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const Line = ({ children }: { children: React.ReactNode }) => (
    <span className="border-b border-dotted border-stone-400 px-1">
      {children}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setPhotosOpen(true)}>
          <Images size={15} />
          ดูรูปที่อัพโหลดไว้
        </Button>
        {!readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-stone-500">ชื่อผู้จัดทำ:</span>
            <Input
              value={makerName}
              onChange={(e) => setMakerName(e.target.value)}
              placeholder="ชื่อผู้จัดทำ memo"
              className="w-56"
              disabled={memoSigs.has("maker")}
            />
          </div>
        )}
      </div>

      {/* ตัวเอกสาร memo — กระดาษขาวสไตล์แบบฟอร์มจริง */}
      <Card className="!bg-white/95 p-0">
        <div className="mx-auto max-w-3xl px-8 py-8 text-[13px] leading-6 text-stone-800">
          {/* หัวบริษัท */}
          <div className="flex items-start gap-4 border-b-4 border-double border-amber-400/70 pb-4">
            <div className="font-display text-2xl font-bold leading-none text-brand-500">
              THE
              <br />
              ART
            </div>
            <div className="text-xs leading-5 text-stone-600">
              <p className="font-medium text-stone-800">{MEMO_COMPANY.name}</p>
              <p>{MEMO_COMPANY.address}</p>
              <p>{MEMO_COMPANY.phone}</p>
            </div>
          </div>

          <h2 className="mt-5 text-center text-base font-bold text-stone-900">
            {MEMO_COMPANY.formTitle}
          </h2>
          <p className="mt-2 text-right">วันที่ {memoDateText}</p>

          <div className="mt-3 space-y-1.5">
            <p>
              <span className="font-semibold">เรื่อง</span>{" "}
              ขออนุมัติเคสทางการตลาด คุณ{fullName}
              {influencer.nickname && ` (ชื่อเล่น : ${influencer.nickname})`}
            </p>
            <p>
              <span className="font-semibold">เรียน</span> {MEMO_COMPANY.to}
            </p>
            <p>
              <span className="font-semibold">เอกสารแนบ</span>{" "}
              {MEMO_COMPANY.attachments}
            </p>
          </div>

          <p className="mt-4 indent-10">{MEMO_COMPANY.purpose}</p>

          {/* รูป influ + channel ในเอกสาร */}
          {(photoUrl || channelUrl) && (
            <div className="mt-4 flex items-center justify-center gap-6">
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt="รูป Influencer"
                  className="h-32 w-32 rounded-full border border-stone-200 object-cover"
                />
              )}
              {channelUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={channelUrl}
                  alt="รูปช่องทาง"
                  className="h-32 max-w-56 rounded-lg border border-stone-200 object-contain"
                />
              )}
            </div>
          )}

          {/* รายละเอียด */}
          <div className="mt-5 space-y-2.5">
            <p>
              ชื่อ-นามสกุล : <Line>คุณ{fullName}</Line>
              {influencer.nickname && (
                <Line>(ชื่อเล่น : {influencer.nickname})</Line>
              )}
            </p>
            <p>
              อาชีพ : <Line>{influencer.occupation || "-"}</Line>
            </p>
            <p>
              หัตถการที่รับบริการ :{" "}
              <Line>{influencer.procedure_text || "-"}</Line>
            </p>
            <p>
              มูลค่า :{" "}
              <Line>
                {influencer.case_value != null
                  ? formatCurrency(influencer.case_value)
                  : "-"}
              </Line>
            </p>
            <p>
              วันที่ทำหัตถการ :{" "}
              <Line>
                {influencer.service_date
                  ? formatDate(influencer.service_date)
                  : "-"}
              </Line>
            </p>
            <p>
              ยอดผู้ติดตาม :{" "}
              <Line>
                {influencer.follower_note ||
                  (influencer.followers != null
                    ? formatNumber(influencer.followers)
                    : "-")}
              </Line>
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <span className="font-semibold">Tier :</span>
              {INFLU_TIER_ORDER.map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center border ${
                      influencer.tier === t
                        ? "border-blue-700 text-blue-700"
                        : "border-stone-400 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  {INFLU_TIERS[t].label} {INFLU_TIERS[t].range}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-5">จึงเรียนมาเพื่อพิจารณาอนุมัติ</p>

          {/* ช่องเซน 5 ช่อง: ผู้จัดทำ / ผู้ตรวจสอบ ×2 / ผู้อนุมัติ ×2 */}
          <div className="mt-5 grid grid-cols-3">
            {MEMO_SIGNERS.slice(0, 3).map((s) => {
              const sig = memoSigs.get(s.role);
              return (
                <SignatureSlot
                  key={s.role}
                  heading={s.heading}
                  name={
                    s.role === "maker"
                      ? (sig?.signer_name ?? makerName ?? null)
                      : s.name
                  }
                  position={
                    s.role === "maker"
                      ? "Assistant Aesthetic Product Manager"
                      : s.position
                  }
                  signature={sig?.signature_data ?? null}
                  signedAt={sig?.signed_at ?? null}
                  onSign={
                    !readOnly && !sig ? () => setSigningRole(s.role) : undefined
                  }
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 border-t-0">
            {MEMO_SIGNERS.slice(3).map((s) => {
              const sig = memoSigs.get(s.role);
              return (
                <SignatureSlot
                  key={s.role}
                  heading={s.heading}
                  name={s.name}
                  position={s.position}
                  signature={sig?.signature_data ?? null}
                  signedAt={sig?.signed_at ?? null}
                  onSign={
                    !readOnly && !sig ? () => setSigningRole(s.role) : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">
            เซนแล้ว {[...memoSigs.keys()].length}/{MEMO_SIGNERS.length} ช่อง —
            ต้องเซนครบทุกช่องจึงจะไป stage ถัดไปได้
          </p>
          <Button onClick={() => void goNext()} disabled={!allSigned}>
            <CheckCircle2 size={16} />
            Memo อนุมัติครบ — ไป Stage 4 (สัญญา)
          </Button>
        </div>
      )}

      {signingRole && (
        <SignaturePad
          title={`เซนช่อง${MEMO_SIGNERS.find((s) => s.role === signingRole)?.heading} — Memo ขออนุมัติเคส`}
          signerName={
            signingRole === "maker"
              ? makerName || userName
              : MEMO_SIGNERS.find((s) => s.role === signingRole)?.name
          }
          onSave={(d) => void saveSignature(d)}
          onClose={() => setSigningRole(null)}
        />
      )}

      <PhotosModal
        influencer={influencer}
        open={photosOpen}
        onClose={() => setPhotosOpen(false)}
      />
    </div>
  );
}

/* ---------- Stage 4: สัญญา 2 ฉบับ (mockup — แบบฟอร์มจริงจะแทนที่ภายหลัง) ---------- */

const CONTRACTS: { doc: string; title: string; body: string[] }[] = [
  {
    doc: "contract1",
    title: "สัญญาโฆษณาประชาสัมพันธ์ Influencer (ฉบับที่ 1)",
    body: [
      "สัญญาฉบับนี้ทำขึ้นระหว่าง บริษัท อาทออฟเซอร์เจอร์รี่ จำกัด (ต่อไปเรียกว่า \"ผู้ว่าจ้าง\") ฝ่ายหนึ่ง กับผู้รับจ้างซึ่งมีรายชื่อท้ายสัญญานี้ (ต่อไปเรียกว่า \"Influencer\") อีกฝ่ายหนึ่ง",
      "ข้อ 1. Influencer ตกลงรับโปรโมทหัตถการตามที่ระบุในแบบฟอร์มขออนุมัติเคสทางการตลาด และยินยอมให้ผู้ว่าจ้างใช้ภาพนิ่ง/ภาพเคลื่อนไหวที่เกี่ยวข้องเพื่อการประชาสัมพันธ์ เป็นระยะเวลา 6 เดือน นับแต่วันลงนาม",
      "ข้อ 2. Influencer จะเผยแพร่คอนเทนต์ตามจำนวนและช่องทางที่ตกลงกัน พร้อมติดแท็กและข้อความตามที่ผู้ว่าจ้างกำหนด",
      "ข้อ 3. รายละเอียดอื่นเป็นไปตามเอกสารแนบท้ายสัญญา (mockup — แบบฟอร์มจริงจะนำมาแทนที่ภายหลัง)",
    ],
  },
  {
    doc: "contract2",
    title: "เอกสารแนบท้ายสัญญา (ฉบับที่ 2)",
    body: [
      "เอกสารแนบท้ายนี้เป็นส่วนหนึ่งของสัญญาโฆษณาประชาสัมพันธ์ Influencer ระบุรายละเอียดหัตถการที่รับบริการ มูลค่า และเงื่อนไขการเผยแพร่คอนเทนต์",
      "Influencer รับทราบว่าผลลัพธ์ของหัตถการขึ้นอยู่กับสภาพร่างกายของแต่ละบุคคล และยินยอมปฏิบัติตามคำแนะนำของแพทย์อย่างเคร่งครัด",
      "ทั้งสองฝ่ายได้อ่านและเข้าใจข้อความโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน (mockup — แบบฟอร์มจริงจะนำมาแทนที่ภายหลัง)",
    ],
  },
];

export function ContractStage({
  influencer,
  signatures,
  readOnly,
}: {
  influencer: InfluencerRow;
  signatures: InfluSignatureRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [signingDoc, setSigningDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fullName = [influencer.first_name, influencer.last_name]
    .filter(Boolean)
    .join(" ");

  const sigFor = (doc: string) =>
    signatures.find((s) => s.doc === doc && s.role === "influencer") ?? null;

  const allSigned = CONTRACTS.every((c) => sigFor(c.doc));

  const saveSignature = async (dataUrl: string) => {
    if (!signingDoc) return;
    const doc = signingDoc;
    setSigningDoc(null);
    setError(null);
    const { error: e } = await supabase.from("influ_signatures").insert({
      influencer_id: influencer.id,
      doc,
      role: "influencer",
      signer_name: `คุณ${fullName}`,
      signature_data: dataUrl,
    });
    if (e) setError(`บันทึกลายเซนไม่สำเร็จ: ${e.message}`);
    router.refresh();
  };

  const goNext = async () => {
    if (!allSigned) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = new Date();
    await supabase
      .from("influencers")
      .update({
        stage: 5,
        // วันเริ่มสัญญา 6 เดือน = วันที่เซนสัญญาครบ
        contract_start: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      })
      .eq("id", influencer.id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700">
        <FileSignature size={14} className="shrink-0" />
        วันที่ Influencer เข้ามารับบริการ ให้เปิดสัญญา 2
        ฉบับนี้ให้อ่านและกดช่องลงชื่อเพื่อเซนบนหน้าจอ — เซนครบทั้ง 2
        ฉบับจึงไปต่อได้ (เริ่มนับสัญญา 6 เดือนทันทีที่เซนครบ)
      </p>

      {CONTRACTS.map((c) => {
        const sig = sigFor(c.doc);
        return (
          <Card key={c.doc} className="!bg-white/95 p-0">
            <div className="mx-auto max-w-3xl px-8 py-7 text-[13px] leading-6 text-stone-800">
              <div className="flex items-start justify-between border-b-4 border-double border-amber-400/70 pb-3">
                <div className="font-display text-xl font-bold leading-none text-brand-500">
                  THE
                  <br />
                  ART
                </div>
                {sig && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={13} /> เซนแล้ว
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-center text-sm font-bold text-stone-900">
                {c.title}
              </h3>
              {c.body.map((p, i) => (
                <p key={i} className="mt-3 indent-8 text-stone-700">
                  {p}
                </p>
              ))}

              <div className="mx-auto mt-6 max-w-xs">
                <SignatureSlot
                  heading="ลงชื่อผู้รับจ้าง (Influencer)"
                  name={`คุณ${fullName}`}
                  signature={sig?.signature_data ?? null}
                  signedAt={sig?.signed_at ?? null}
                  onSign={
                    !readOnly && !sig ? () => setSigningDoc(c.doc) : undefined
                  }
                />
              </div>
            </div>
          </Card>
        );
      })}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 animate-fade-in">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">
            เซนแล้ว {CONTRACTS.filter((c) => sigFor(c.doc)).length}/
            {CONTRACTS.length} ฉบับ
          </p>
          <Button onClick={() => void goNext()} disabled={!allSigned}>
            <PenLine size={16} />
            เซนครบแล้ว — เริ่มสัญญา 6 เดือน + ไป Stage 5
          </Button>
        </div>
      )}

      {signingDoc && (
        <SignaturePad
          title={`เซนสัญญา — ${CONTRACTS.find((c) => c.doc === signingDoc)?.title}`}
          signerName={`คุณ${fullName}`}
          onSave={(d) => void saveSignature(d)}
          onClose={() => setSigningDoc(null)}
        />
      )}
    </div>
  );
}
