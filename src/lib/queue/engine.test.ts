import { describe, expect, it } from "vitest";
import {
  isEligible,
  makeCandidate,
  pickNext,
  simulate,
  startNewDay,
  weightForRank,
} from "./engine";

/** ทีม 8 คนตามอันดับ 1-8 → weight 4,4,4,2,2,1,1,1 (รวม 19) */
const team = () => [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => makeCandidate(`bc${rank}`, rank));
const counts = (result: { counts: Record<string, number> }) => Object.values(result.counts);

describe("weightForRank", () => {
  it("อันดับ 1-3 ได้ weight 4, อันดับ 4-5 ได้ 2, ที่เหลือได้ 1", () => {
    expect([1, 2, 3].map(weightForRank)).toEqual([4, 4, 4]);
    expect([4, 5].map(weightForRank)).toEqual([2, 2]);
    expect([6, 7, 8, 9, 20].map(weightForRank)).toEqual([1, 1, 1, 1, 1]);
  });

  it("คนใหม่ที่ยังไม่มี ranking ได้ weight 1", () => {
    expect(weightForRank(null)).toBe(1);
    expect(makeCandidate("new", null).weight).toBe(1);
  });
});

describe("การกระจายคิวรายวัน", () => {
  it("19 เคสได้ 4,4,4,2,2,1,1,1 ตามเกณฑ์ธุรกิจ", () => {
    expect(counts(simulate(team(), 19))).toEqual([4, 4, 4, 2, 2, 1, 1, 1]);
  });

  it("20-22 เคสส่วนเกินตกที่ weight สูงตามสัดส่วน", () => {
    expect(counts(simulate(team(), 20))).toEqual([5, 4, 4, 2, 2, 1, 1, 1]);
    expect(counts(simulate(team(), 21))).toEqual([5, 5, 4, 2, 2, 1, 1, 1]);
    expect(counts(simulate(team(), 22))).toEqual([5, 5, 5, 2, 2, 1, 1, 1]);
  });

  it("18 เคสขาดไป 1 และคนที่ขาดได้คิวแรกของวันถัดไป", () => {
    const day1 = simulate(team(), 18);
    expect(counts(day1)).toEqual([4, 4, 3, 2, 2, 1, 1, 1]);

    const day2 = simulate(startNewDay(day1.members), 20);
    expect(day2.order[0]).toBe("bc3");
    // ยอดสะสมทั้งเดือนกลับมาเท่ากันเมื่อมีเคสให้ชดเชย
    expect(day2.members.map((m) => m.monthCount)).toEqual([8, 8, 8, 4, 4, 2, 2, 2]);
  });

  it("เคสแรกของวันตกที่คนที่ weight สูงสุดเสมอ", () => {
    expect(simulate(team(), 1).order[0]).toBe("bc1");
  });
});

describe("สถานะของสมาชิกระหว่างวัน", () => {
  it("คนที่พักคิวกลางวันหยุดรับคิวทันที ที่เหลือรับต่อจนครบ", () => {
    const result = simulate(team(), 19, [
      { beforeCase: 6, apply: (ms) => void (ms[0].availability = "paused") },
    ]);
    expect(counts(result)).toEqual([1, 5, 5, 3, 2, 1, 1, 1]);
    expect(result.unassigned).toBe(0);
  });

  it("คนที่ถูก deactivate กลางวันไม่ถูกเลือกอีก แต่คิวเดิมยังนับ", () => {
    const result = simulate(team(), 19, [
      { beforeCase: 6, apply: (ms) => void (ms[1].isActive = false) },
    ]);
    expect(result.counts.bc2).toBe(1);
    expect(counts(result).reduce((a, b) => a + b, 0)).toBe(19);
  });

  it("queue_enabled=false ไม่เข้าเกณฑ์ แม้จะ active และ available", () => {
    const [first, ...rest] = team();
    first.queueEnabled = false;
    expect(isEligible(first)).toBe(false);
    expect(pickNext([first, ...rest])?.id).toBe("bc2");
  });

  it("ไม่มีใคร available ต้องคืน null เพื่อให้ระบบตั้งเป็นรอจ่ายคิวเอง", () => {
    const members = team().map((m) => ({ ...m, availability: "busy" as const }));
    expect(pickNext(members)).toBeNull();
    expect(simulate(members, 3).unassigned).toBe(3);
  });

  it("คนใหม่ weight 1 แทรกเข้าทีมได้โดยไม่กระทบสัดส่วนเดิม", () => {
    const result = simulate([...team(), makeCandidate("bc9", null)], 20);
    expect(counts(result)).toEqual([4, 4, 4, 2, 2, 1, 1, 1, 1]);
  });
});

describe("การเลือกคิวรายครั้ง", () => {
  it("exclude ใช้ตอนย้ายคิว — ไม่เลือกคนเดิมซ้ำ", () => {
    expect(pickNext(team(), ["bc1"])?.id).toBe("bc2");
    expect(pickNext(team(), ["bc1", "bc2", "bc3"])?.id).toBe("bc4");
  });

  it("เสมอกันทุกทางให้เรียงตาม id เพื่อให้ผลตรวจสอบย้อนได้", () => {
    const a = makeCandidate("bbb", 1);
    const b = makeCandidate("aaa", 1);
    expect(pickNext([a, b])?.id).toBe("aaa");
  });

  it("คนที่ยังไม่เคยได้คิวมาก่อนอยู่หน้าคนที่เพิ่งได้", () => {
    const veteran = makeCandidate("v", 1, { lastAssignedAt: 1000 });
    const rookie = makeCandidate("r", 1, { lastAssignedAt: null });
    expect(pickNext([veteran, rookie])?.id).toBe("r");
  });

  it("ใช้ weight ที่ snapshot ไว้ ไม่คำนวณใหม่จาก rank", () => {
    // อันดับ 8 แต่แอดมิน override weight เป็น 4 → ต้องได้คิวเท่าอันดับต้น
    const overridden = makeCandidate("bc8", 8, { weight: 4 });
    const others = [1, 2].map((r) => makeCandidate(`bc${r}`, r));
    const result = simulate([...others, overridden], 6);
    expect(result.counts.bc8).toBe(2);
  });

  it("ranking เดือนใหม่ไม่ย้อนแก้ผลของวันที่แจกไปแล้ว", () => {
    const before = simulate(team(), 19);
    const snapshot = [...before.order];
    // จำลองการประกาศ ranking รอบใหม่: สลับ weight ของทุกคน
    before.members.forEach((m, i) => {
      m.weight = weightForRank(before.members.length - i);
    });
    expect(before.order).toEqual(snapshot);
    expect(counts(before)).toEqual([4, 4, 4, 2, 2, 1, 1, 1]);
  });
});
