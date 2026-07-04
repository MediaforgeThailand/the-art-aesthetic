import type { Metadata } from "next";
import {
  BarChart3,
  Goal,
  MessageCircle,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "รายงาน",
};

const REPORTS: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  source: string;
}[] = [
  {
    href: "/dashboard",
    title: "ภาพรวมยอดขาย",
    description: "ยอดขายรวม กราฟรายเดือน สัดส่วนหมวดหมู่ เทียบสาขา และ Top บริการ",
    icon: BarChart3,
    source: "ไฟล์ยอดขายรายรายการ (ทีม DA)",
  },
  {
    href: "/reports/staff",
    title: "ผลงานพนักงานขาย / หมอ",
    description: "ยอดขายต่อคน จำนวนรายการ ค่าเฉลี่ยต่อบิล และบริการที่ทำมากที่สุด",
    icon: UserRound,
    source: "ไฟล์ยอดขายรายรายการ (คอลัมน์พนักงาน)",
  },
  {
    href: "/reports/admin",
    title: "ผลงานทีมแอดมิน",
    description: "ลูกค้าทักใหม่ อัตราปิดนัด ยอดปิดการขาย แยกตามช่องทางและรายคน",
    icon: MessageCircle,
    source: "ไฟล์สรุปแชท/จองนัดรายวัน (ทีม DA)",
  },
  {
    href: "/reports/targets",
    title: "เป้าหมาย vs ยอดจริง",
    description: "เทียบยอดขายจริงกับเป้ารายเดือน อัตราการทำได้ตามเป้า",
    icon: Goal,
    source: "ไฟล์เป้ายอดขายรายเดือน",
  },
];

export default function ReportsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="รายงาน"
        description="ศูนย์รวมรายงานของแผนก — ส่วนที่ยังเป็นข้อมูลตัวอย่างจะมีป้าย Mockup กำกับ"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r, i) => (
          <Link
            key={r.href}
            href={r.href}
            className="group animate-fade-in-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="glass h-full rounded-xl p-5 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-active:scale-[0.99]">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-100">
                  <r.icon size={22} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-stone-900 transition-colors group-hover:text-brand-800">
                    {r.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">
                    {r.description}
                  </p>
                  <p className="mt-2 text-xs text-stone-400">
                    แหล่งข้อมูล: {r.source}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-stone-400">
        ข้อมูลจริงทั้งหมดจะมาจากไฟล์ของทีม DA ผ่านระบบซิงก์อัตโนมัติ —
        ดูรายการข้อมูลที่ต้องขอในไฟล์ DATA-REQUEST.md
      </p>
    </PageContainer>
  );
}
