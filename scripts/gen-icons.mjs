/* สร้างไอคอน PWA จากดีไซน์เดียวกับ src/app/icon.svg (rose gold + ตัว A serif ครีม)
   ใช้ sharp ที่ติดมากับ Next อยู่แล้ว — ไม่ต้องลง dependency เพิ่ม
   ตัว "A" วาดเป็น path เวกเตอร์ ไม่พึ่งฟอนต์ระบบ (librsvg บนเครื่อง build อาจไม่มี Georgia) */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2];
const GRAD = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#dcab9c"/>
    <stop offset="0.55" stop-color="#c48b78"/>
    <stop offset="1" stop-color="#a3634f"/>
  </linearGradient>`;

/* ตัว A ทรง serif เขียนเป็น path บน viewBox 64x64 ให้เข้าชุดกับโลโก้
   (สามเหลี่ยมขาเรียว + คานกลาง + เชิง serif ที่ปลายขาทั้งสอง) */
const A_PATH =
  "M32 14 L41.6 45.2 L44.6 45.2 L44.6 48.4 L34.2 48.4 L34.2 45.2 L37.1 45.2 " +
  "L35.2 38.6 L28.5 38.6 L26.7 45.2 L29.6 45.2 L29.6 48.4 L19.4 48.4 L19.4 45.2 " +
  "L22.4 45.2 L32 14 Z M31.9 23.4 L29.3 33.9 L34.5 33.9 L31.9 23.4 Z";

function svg({ size, maskable }) {
  // maskable: พื้นเต็มกรอบให้ระบบครอบทรงเอง + เนื้อหาย่อลงอยู่ใน safe zone กลาง 80%
  const bg = maskable
    ? `<rect width="64" height="64" fill="url(#g)"/>`
    : `<rect width="64" height="64" rx="14" fill="url(#g)"/>`;
  const glyph = maskable
    ? `<g transform="translate(32 32) scale(0.72) translate(-32 -31.2)"><path d="${A_PATH}" fill="#f6efe4"/></g>`
    : `<path d="${A_PATH}" fill="#f6efe4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><defs>${GRAD}</defs>${bg}${glyph}</svg>`;
}

const specs = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
  ["apple-icon.png", 180, false],
];

for (const [name, size, maskable] of specs) {
  const buf = await sharp(Buffer.from(svg({ size, maskable })))
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(name, size, `${(buf.length / 1024).toFixed(1)}KB`);
}

// ไอคอนต้นทางแบบเวกเตอร์ (favicon คมทุกขนาด + ใช้ใน manifest ได้)
writeFileSync(`${OUT}/icon.svg`, svg({ size: 64, maskable: false }));
console.log("icon.svg (vector source)");
