import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai, Playfair_Display } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "The ART Aesthetic",
    template: "%s | The ART Aesthetic",
  },
  description:
    "The ART Aesthetic — ระบบจัดการหลังบ้านแผนก Aesthetic: งาน เอกสาร และแดชบอร์ดยอดขาย",
  applicationName: "Aesthetic",
  appleWebApp: {
    // iOS ติดตั้งลงหน้าจอโฮมแล้วเปิดแบบเต็มจอไม่มีแถบ Safari
    capable: true,
    title: "Aesthetic",
    // "default" = iOS กันพื้นที่ status bar ให้เอง เนื้อหาไม่ไหลไปใต้ notch
    // จงใจไม่ใช้ "black-translucent" ถึงจะสวยกว่า เพราะถ้าพลาด safe-area inset ไปแม้จุดเดียว
    // แถบนั้นจะจมใต้ status bar กดไม่ได้เลย — แอปงานเอาความชัวร์ไว้ก่อน
    // (ยังคง viewportFit:"cover" ไว้ เพื่อให้ inset ซ้าย/ขวา/ล่างตอนหมุนจอทำงานถูก)
    statusBarStyle: "default",
  },
  formatDetection: {
    // กันเลขที่ไม่ใช่เบอร์ (ยอดขาย/จำนวนคน) กลายเป็นลิงก์โทรออกสีฟ้าบน iOS
    telephone: false,
  },
};

export const viewport: Viewport = {
  // viewportFit cover = ใช้พื้นที่ใต้ notch ได้ (ต้องคู่กับ env(safe-area-inset-*) ใน CSS)
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // ตั้งใจไม่ล็อก maximumScale/userScalable — ผู้ใช้ต้องซูมอ่านได้เสมอ (a11y)
  // ค่าเดียวให้ตรงกับ theme_color ใน manifest — แอปไม่มีโหมดมืด (ไม่มี utility dark: เลย)
  // ถ้าประกาศสีเข้มสำหรับ dark scheme แถบระบบจะกลายเป็นน้ำตาลเข้มคร่อม UI ครีมสว่าง
  themeColor: "#a96a58",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
