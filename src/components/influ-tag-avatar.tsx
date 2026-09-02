"use client";

import { useSignedUrl } from "@/lib/use-signed-url";

/* รูปโปรไฟล์ของตัวเลือกแท็ก influencer — ใช้ร่วมกันทั้งโมดัลติดแท็กก่อนส่งตรวจ,
   dropdown เลือก influ ในแผงงาน และหน้าจัดการแท็ก (ห้าม copy markup ไปเขียนซ้ำ)
   แพตเทิร์นเดียวกับ DoctorAvatar: signed URL ผ่าน cache กลาง useSignedUrl,
   ไม่มีรูป/ยังโหลดไม่เสร็จ = วงตัวอักษรแรก */

const SIZES = {
  sm: { circle: "h-6 w-6", text: "text-[10px]" },
  md: { circle: "h-7 w-7", text: "text-[10px]" },
  lg: { circle: "h-11 w-11", text: "text-sm" },
} as const;

export function InfluTagAvatar({
  influ,
  size = "md",
}: {
  influ: { first_name: string; nickname: string | null; photo_path: string | null };
  size?: keyof typeof SIZES;
}) {
  const { url } = useSignedUrl(influ.photo_path);
  const s = SIZES[size];
  if (influ.photo_path && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={influ.nickname || influ.first_name}
        className={`${s.circle} shrink-0 rounded-full object-cover shadow-sm`}
      />
    );
  }
  return (
    <span
      className={`${s.circle} ${s.text} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-semibold text-brand-700`}
    >
      {(influ.nickname || influ.first_name || "?").slice(0, 1)}
    </span>
  );
}
