"use client";

import { Images, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MediaGrid } from "@/components/media-grid";
import { Input, PageHeader, Select } from "@/components/ui";
import { formatNumber, todayISO } from "@/lib/format";
import {
  MEDIA_KIND_ORDER,
  MEDIA_KINDS,
  MEDIA_RANGES,
  type MediaItem,
  type MediaKind,
  type MediaRangeKey,
  mediaDisplayName,
  rangeStart,
  thaiDayOf,
} from "@/lib/media";
import type { ProfileRow } from "@/lib/types";

/** ชื่อที่แสดงของ profile — full_name ก่อน ตกลงมาที่ email */
function personLabel(p: ProfileRow): string {
  return p.full_name?.trim() || p.email || "ไม่ทราบชื่อ";
}

export function AllMediaClient({
  items,
  profiles,
  userId,
}: {
  items: MediaItem[];
  profiles: ProfileRow[];
  userId: string | null;
}) {
  const today = todayISO();

  const [kind, setKind] = useState<MediaKind | "all">("all");
  // ค่าเริ่มต้น "งานของฉัน" — คลังทั้งทีมใหญ่เกินกว่าจะไล่ดูทั้งหมดเป็นค่าเริ่มต้น
  const [person, setPerson] = useState<string>(userId ?? "all");
  const [range, setRange] = useState<MediaRangeKey>("1m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, personLabel(p));
    return m;
  }, [profiles]);

  const nameOf = (id: string | null) =>
    (id && nameById.get(id)) || "ไม่มีผู้รับผิดชอบ";

  const filtered = useMemo(() => {
    const start = range === "custom" ? (from || null) : rangeStart(range, today);
    const end = range === "custom" ? (to || null) : null;
    const needle = q.trim().toLowerCase();

    return items.filter((it) => {
      if (kind !== "all" && it.kind !== kind) return false;
      if (person === "none" ? it.assigneeId !== null : person !== "all" && it.assigneeId !== person) {
        return false;
      }
      if (start || end) {
        const day = thaiDayOf(it.uploadedAt);
        if (start && day < start) return false;
        if (end && day > end) return false;
      }
      if (needle) {
        const hay = `${mediaDisplayName(it)} ${it.taskTitle}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, kind, person, range, from, to, q, today]);

  const countByKind = useMemo(() => {
    const c: Record<MediaKind, number> = { image: 0, video: 0, other: 0 };
    for (const it of filtered) c[it.kind] += 1;
    return c;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="All Media"
        description="คลังไฟล์รวมของงานทั้งหมด — ไฟล์งานบนการ์ด ไฟล์งานย่อย และไฟล์แนบในแชท (ดู/ดาวน์โหลดอย่างเดียว อัพโหลดทำที่การ์ดงานเหมือนเดิม)"
      />

      {/* ตัวกรอง — จอเล็กเลื่อนแนวนอนแทนตัดบรรทัด */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อไฟล์ หรือชื่องาน..."
            className="!pl-9"
          />
        </div>
        <div className="w-40">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as MediaKind | "all")}
            aria-label="ชนิดไฟล์"
          >
            <option value="all">ทุกชนิดไฟล์</option>
            {MEDIA_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {MEDIA_KINDS[k].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            aria-label="งานของใคร"
          >
            <option value="all">งานของทุกคน</option>
            <option value="none">ไม่มีผู้รับผิดชอบ</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === userId ? `${personLabel(p)} (ฉัน)` : personLabel(p)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={range}
            onChange={(e) => setRange(e.target.value as MediaRangeKey)}
            aria-label="ช่วงวันที่อัพโหลด"
          >
            {MEDIA_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        {range === "custom" && (
          <>
            <div className="w-40">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="ตั้งแต่วันที่"
              />
            </div>
            <div className="w-40">
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="ถึงวันที่"
              />
            </div>
          </>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-stone-700">
          <Images size={14} />
          {formatNumber(filtered.length)} ไฟล์
        </span>
        <span>รูป {formatNumber(countByKind.image)}</span>
        <span>วิดีโอ {formatNumber(countByKind.video)}</span>
        <span>อื่นๆ {formatNumber(countByKind.other)}</span>
        {filtered.length !== items.length && (
          <span className="text-stone-400">
            (จากทั้งหมด {formatNumber(items.length)} ไฟล์)
          </span>
        )}
      </p>

      <MediaGrid items={filtered} nameOf={nameOf} />
    </div>
  );
}
