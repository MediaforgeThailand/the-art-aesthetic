import { existsSync } from "node:fs";
import path from "node:path";
import {
  BarChart3,
  HeartPulse,
  Megaphone,
  Tags,
  TabletSmartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import {
  INFLU_APP_URL,
  SALES_ASSISTANT_URL,

} from "@/lib/constants";

export const metadata: Metadata = {
  title: "The ART Aesthetic — รวมช่องทางระบบ",
  description:
    "ประตูทางเข้าระบบของแผนก Aesthetic — ทีมงาน, Influencer, เครื่องมือทีมขาย และ Price List",
};

/**
 * หน้าประตูรวมช่องทาง (root `/`) — สาธารณะ ไม่ต้องล็อกอิน (proxy ปล่อยผ่านเหมือน /price-list)
 * ทุกคนที่เปิดโดเมนหลักจะเจอหน้านี้ก่อน แล้วเลือกเข้าระบบที่ต้องการเอง
 * ระบบภายในแต่ละตัวยังบังคับล็อกอิน/สิทธิ์ของตัวเองตามเดิม — หน้านี้โชว์แค่ชื่อระบบ
 * ไม่มีข้อมูลภายในใดๆ. logic เลือกหน้าแรกตามสิทธิ์ (ของ root เดิม) ย้ายไป /start แล้ว
 *
 * ดีไซน์ตามที่ผู้ใช้สั่ง (2026-08-19): **รูป 4:3 ลอยอยู่บนพื้นหลังเลย ไม่มีกล่อง/กรอบครอบ**
 * (เลิกใช้ .glass กับ tile — กล่องซ้อนรูปแล้วดูไม่สวย) ชื่ออยู่ใต้รูป ไม่มีคำอธิบาย ไม่มีเส้นขอบ
 */

type Channel = {
  /** ชื่อระบบ (ละติน — ใช้ font-display ตาม CI) */
  name: string;
  /** null = ยังไม่เปิดใช้งาน → tile จาง กดไม่ได้ + คำว่า "เร็วๆ นี้" */
  href: string | null;
  /** ลิงก์ออกนอกแอป (คนละโดเมน) — ใช้ <a> ธรรมดาแทน next/link */
  external?: boolean;
  /**
   * ชื่อไฟล์รูป (ไม่ต้องมีนามสกุล) — **วางไฟล์ที่ `public/tools/<ชื่อนี้>.png` แล้วรูปขึ้นเอง
   * ไม่ต้องแก้โค้ด** ไฟล์ยังไม่มี = ตกไปใช้ไอคอนแบรนด์แทน (ดู `resolveImage` ข้างล่าง)
   * สัดส่วนที่สวยที่สุดคือ 4:3 — ภาพอัตราส่วนอื่นถูก crop กลางภาพด้วย object-cover
   */
  image: string;
  /** ไอคอนสำรองตอนยังไม่มีไฟล์รูป */
  icon: LucideIcon;
};

const CHANNELS: Channel[] = [
  {
    name: "Aesthetics Team",
    href: "/start", // เด้งเข้าหน้าแรกตามสิทธิ์ของแต่ละคน
    image: "aesthetics-team",
    icon: Users,
  },
  {
    name: "Influencers System",
    // แอปแยก (repo the-art-influencer ใช้ Supabase เดียวกัน) — ย้ายโดเมนแก้ที่ constants.ts จุดเดียว
    href: INFLU_APP_URL,
    external: true,
    image: "influencers-system",
    icon: Megaphone,
  },
  {
    name: "Wellness System",
    href: "/wellness",
    image: "wellness-system",
    icon: HeartPulse,
  },
  {
    name: "Sales Tool",
    href: SALES_ASSISTANT_URL,
    external: true,
    image: "sales-tool",
    icon: TabletSmartphone,
  },
  {
    name: "Price List",
    href: "/price-list",
    image: "price-list",
    icon: Tags,
  },
  {
    name: "Sales Operation",
    // ระบบจัดคิวลูกค้าของทีม Beauty Consult — รวมเข้าแอปนี้แล้ว 2026-09-09 (เดิมแอปแยกที่
    // queue.theartbb.com) จึงเป็นลิงก์ภายในเหมือน Aesthetics Team; guard ของหน้า /queue
    // เป็นคนเช็คสิทธิ์ (sales_queue หรือสมาชิกทีมคิว)
    href: "/queue",
    image: "sales-operation",
    icon: BarChart3,
  },
];

/**
 * นามสกุลที่รองรับ เรียงตามลำดับความสำคัญ — **`.png` มาก่อนโดยตั้งใจ**
 * ทีมวางไฟล์ .png ทับทีหลังแล้วต้องชนะ .webp ที่ optimize ไว้เสมอ ไม่งั้นเปลี่ยนรูปแล้วงง
 * ว่าทำไมยังเป็นรูปเก่า (รูปที่ optimize แล้วจะถูกแทนที่ทันทีโดยไม่ต้องไปตามลบ)
 */
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"] as const;

/**
 * หาไฟล์รูปของเครื่องมือใน `public/tools/` (อ่านดิสก์ตอน build — หน้านี้เป็น static prerender)
 * ทำแบบนี้เพื่อให้ขั้นตอนของทีมเหลือแค่ "วางไฟล์ลงโฟลเดอร์" โดยไม่ต้องแก้โค้ด
 * และไม่มีทางเกิดไอคอนภาพแตกถ้ายังไม่ได้ใส่รูป — ตกไปใช้ไอคอนแบรนด์แทนอย่างสวยงาม
 */
function resolveImage(name: string): string | null {
  for (const ext of IMAGE_EXTS) {
    const rel = `/tools/${name}${ext}`;
    try {
      if (existsSync(path.join(process.cwd(), "public", rel))) return rel;
    } catch {
      return null;
    }
  }
  return null;
}

export default function HomePage() {
  return (
    // min-h-dvh (ไม่ใช่ screen) + safe-area: หน้านี้ถูกเปิดจากมือถือ/แชร์ลิงก์เป็นหลัก
    <main className="flex min-h-dvh flex-col items-center px-safe">
      <div className="w-full max-w-5xl px-5 pt-safe">
        <div className="flex flex-col py-10 sm:py-14">
          {/* หัวหน้า — แบรนด์ The ART ตาม CI */}
          <header className="flex flex-col items-center text-center animate-fade-in-up">
            <LogoMark className="h-16 w-16 sm:h-20 sm:w-20" />
            <h1 className="font-display mt-4 text-3xl font-bold text-brand-900 sm:text-4xl">
              The ART
            </h1>
            <p className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.32em] text-brand-500">
              Plastic Surgery Hospital
            </p>
          </header>

          {/* tile ช่องทาง — flex-wrap ไม่ใช่ grid เพราะ 5 ช่องลงไม่พอดีแถว
              แถวสุดท้ายที่เหลือ 1-2 ใบจะได้อยู่กึ่งกลางแทนที่จะค้างชิดซ้าย */}
          <section className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-8 sm:mt-14 sm:gap-x-8 sm:gap-y-10">
            {CHANNELS.map((channel, i) => (
              <ChannelTile
                key={channel.name}
                channel={channel}
                // ไล่โผล่ทีละใบต่อจากหัวหน้า
                delayMs={120 + i * 70}
              />
            ))}
          </section>

          <footer className="pb-safe-4 mt-14 text-center text-xs leading-5 text-stone-400">
            The ART — Plastic Surgery Hospital
          </footer>
        </div>
      </div>
    </main>
  );
}

function ChannelTile({
  channel,
  delayMs,
}: {
  channel: Channel;
  delayMs: number;
}) {
  const { name, href, external, image, icon: Icon } = channel;
  const src = resolveImage(image);

  const inner = (
    <>
      {/* รูปลอยบนพื้นหลัง — ไม่มีกล่องครอบ มีแค่เงานุ่มๆ ให้ดูลอยขึ้นมาจากพื้น */}
      <span
        className={`relative block aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-[0_14px_34px_rgba(94,58,49,0.16)] transition duration-300 ${
          href
            ? "group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_48px_rgba(94,58,49,0.24)]"
            : ""
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- โปรเจกต์ไม่ใช้ next/image (กติกา self-host)
          <img
            src={src}
            alt={name}
            className={`h-full w-full object-cover ${
              href ? "" : "opacity-50 grayscale"
            }`}
          />
        ) : (
          // ยังไม่ได้วางไฟล์รูป — พื้นไล่เฉดแบรนด์ + ไอคอน (ดูตั้งใจ ไม่ใช่ภาพแตก)
          <span
            className={`flex h-full w-full items-center justify-center ${
              href
                ? "bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-cream"
                : "bg-stone-200 text-stone-400"
            }`}
          >
            <Icon size={40} strokeWidth={1.5} />
          </span>
        )}
      </span>

      {/* ชื่อเครื่องมือ — ไม่มีคำอธิบาย ไม่มีเส้นขอบ */}
      <span className="mt-3.5 block text-center">
        <span
          className={`font-display block text-sm font-bold leading-snug sm:text-base ${
            href ? "text-brand-900" : "text-stone-400"
          }`}
        >
          {name}
        </span>
        {!href && (
          <span className="mt-0.5 block text-[0.7rem] text-stone-400">
            เร็วๆ นี้
          </span>
        )}
      </span>
    </>
  );

  // ความกว้างคงที่ต่อ tile (flex item) — จอเล็ก 2 ใบต่อแถว, ใหญ่ขึ้นตามจอ
  const size =
    "w-[calc(50%-0.625rem)] sm:w-[15.5rem] lg:w-[17.5rem] animate-fade-in-up";
  const style = { animationDelay: `${delayMs}ms` };

  // ยังไม่มีปลายทาง — tile จางๆ กดไม่ได้
  if (!href) {
    return (
      <div className={size} style={style}>
        {inner}
      </div>
    );
  }

  const activeClass = `${size} group cursor-pointer active:scale-[0.98] transition`;

  // ลิงก์ข้ามโดเมน (แอปขาย) ใช้ <a> ตรงๆ — next/link มีประโยชน์เฉพาะเส้นทางในแอป
  if (external) {
    return (
      <a href={href} className={activeClass} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={activeClass} style={style}>
      {inner}
    </Link>
  );
}
