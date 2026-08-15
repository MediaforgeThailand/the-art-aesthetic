import {
  CalendarDays,
  FileSignature,
  Gauge,
  History,
  IdCard,
  LayoutGrid,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessNotice } from "@/components/access-notice";
import { Badge, Card, PageContainer, PageHeader } from "@/components/ui";
import {
  canManageInflu,
  canViewInflu,
  getAccess,
  INFLU_LEVELS,
  influLevel,
} from "@/lib/access";
import { formatNumber } from "@/lib/format";
import { INFLU_STAGE } from "@/lib/influ-constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Influencer System",
};

type HubInflu = {
  id: string;
  stage: number;
  completed: boolean;
  declined_at: string | null;
  owner_id: string | null;
};

/** นับข้อมูลสำรองที่ยังกู้คืนได้ — อยู่ระดับโมดูลเพราะอ่านเวลาปัจจุบัน (กฎ react-hooks/purity) */
function liveBackupCount(rows: { purge_after: string }[]): number {
  const now = Date.now();
  return rows.filter((b) => new Date(b.purge_after).getTime() > now).length;
}

/**
 * หน้ารวมของระบบ Influencer (/influencer-management)
 *
 * ทีมอื่นเข้ามาใช้ระบบนี้ด้วย — sidebar จึงเหลือปุ่มเดียว "Influencer System" ชี้มาที่นี่
 * แล้วค่อยแตกไปหน้าย่อย (หน้าเดิมทุกหน้ายัง URL เดิม ไม่ต้องแก้ลิงก์เก่า/บุ๊กมาร์กของทีม)
 * บนสุดบอกชัดว่า "บัญชีนี้อยู่ระดับไหน ทำอะไรได้บ้าง" กัน human error ตั้งแต่ก่อนกดเข้าไป
 */
export default async function InfluencerManagementHubPage() {
  const supabase = await createClient();

  const [access, { data: influencers }, { data: backups }] = await Promise.all([
    getAccess(),
    supabase
      .from("influencers")
      .select("id, stage, completed, declined_at, owner_id")
      .eq("archived", false),
    // ถังขยะ — นับเฉพาะที่ยังไม่ถูกกู้คืนและยังไม่หมดอายุ (โชว์เลขบนการ์ดให้ผู้ดูแล)
    supabase
      .from("influ_deleted_backups")
      .select("id, purge_after, restored_at")
      .is("restored_at", null),
  ]);

  if (!canViewInflu(access)) return <AccessNotice />;

  const level = influLevel(access);
  const meta = level === "none" ? null : INFLU_LEVELS[level];
  const isManager = canManageInflu(access);

  const rows = (influencers ?? []) as HubInflu[];
  const active = rows.filter((i) => !i.completed && i.declined_at === null);
  const mine = rows.filter((i) => i.owner_id === access.uid);
  const waiting = active.filter((i) => i.stage === INFLU_STAGE.contact).length;
  const trashCount = liveBackupCount(backups ?? []);

  const links: {
    href: string;
    label: string;
    detail: string;
    icon: typeof LayoutGrid;
    show: boolean;
    count?: number;
  }[] = [
    {
      href: "/influencers",
      label: "บอร์ด Influ Management",
      detail: "การ์ดเคสทั้งหมด แบ่งตามขนาดผู้ติดตาม + เดินงาน 5 ขั้น",
      icon: LayoutGrid,
      show: true,
      count: active.length,
    },
    {
      href: "/influ-calendar",
      label: "ปฏิทินคิว",
      detail: "คิวเข้ารับบริการ/ถ่ายงาน รายเดือน พร้อมแพทย์ที่รับคิว",
      icon: CalendarDays,
      show: true,
    },
    {
      href: "/influ-dashboard",
      label: "Influ Dashboard",
      detail: "ภาพรวม pipeline ต้นทุน คิว 14 วัน และสัญญาใกล้หมด",
      icon: Gauge,
      show: true,
    },
    {
      href: "/influ-cost",
      label: "Influencer Cost",
      detail: "ต้นทุนค่าบริการรายเคส + รายการที่แบรนด์ support",
      icon: Wallet,
      show: true,
    },
    {
      href: "/influencers/contracts",
      label: "อายุสัญญา & Campaign",
      detail: "สัญญาเหลือกี่วัน และเรียกเข้าร่วม Sub Campaign",
      icon: FileSignature,
      show: true,
    },
    {
      href: "/influ-gallery",
      label: "โปรไฟล์ Influencer",
      detail: "การ์ดโปรไฟล์ทั้งหมด รวมข้อมูลเก่าที่นำเข้า (archive)",
      icon: IdCard,
      show: true,
    },
    {
      href: "/influencer-management/logs",
      label: "ประวัติการใช้งาน (Log)",
      detail: "ใครทำอะไรกับเคสไหน เมื่อไหร่ — ย้อนดูได้ทั้งหมด",
      icon: History,
      show: isManager,
    },
    {
      href: "/influencer-management/trash",
      label: "ถังขยะ 30 วัน",
      detail: "เคสที่ถูกลบ สำรองไว้ 30 วัน — กู้คืนได้ทั้งเคสพร้อมข้อมูลลูก",
      icon: Trash2,
      show: isManager,
      count: trashCount,
    },
  ];

  const stats = [
    { label: "เคสทั้งหมด", value: rows.length },
    { label: "กำลังดำเนินการ", value: active.length },
    { label: "รอตอบรับ", value: waiting },
    { label: "เคสที่ฉันรับผิดชอบ", value: mine.length },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Influencer System"
        description="ระบบจัดการ Influencer ของแผนก — ใช้ร่วมกันหลายทีม ทุกการเปลี่ยนแปลงถูกบันทึกไว้ใน Log"
        action={
          meta && (
            <Badge className={meta.badge}>
              <Sparkles size={12} /> สิทธิ์ของคุณ: {meta.short}
            </Badge>
          )
        }
      />

      {/* บอกให้ชัดว่าระดับนี้ทำอะไรได้ — กันคนกดแล้วงงว่าทำไมไม่มีปุ่ม */}
      {level === "view" && (
        <div className="mb-4 rounded-lg border border-stone-200 bg-white/70 px-4 py-2.5 text-sm text-stone-600 animate-fade-in">
          บัญชีนี้เป็นระดับ <span className="font-semibold">ดูเฉยๆ</span> —
          เปิดดูได้ทุกหน้า แต่จะไม่มีปุ่มเพิ่ม/แก้/ลบ
          ถ้าต้องแก้ข้อมูลให้แจ้งผู้ดูแลระบบเปิดสิทธิ์เป็น Hunter
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <p className="text-xs text-stone-400">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-800">
              {formatNumber(s.value)}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links
          .filter((l) => l.show)
          .map(({ href, label, detail, icon: Icon, count }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-3 rounded-xl border border-white/70 bg-white/70 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-800">
                    {label}
                  </span>
                  {count !== undefined && count > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-100 px-1.5 text-[11px] font-bold text-brand-700">
                      {formatNumber(count)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-stone-500">
                  {detail}
                </span>
              </span>
            </Link>
          ))}
      </div>
    </PageContainer>
  );
}
