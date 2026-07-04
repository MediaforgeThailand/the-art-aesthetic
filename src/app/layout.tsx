import type { Metadata } from "next";
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
