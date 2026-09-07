# `src/influ/` — โค้ดของระบบ Influencer ที่ไม่ใช่ route

ระบบ Influencer (Influ System) ประกอบด้วย 2 โฟลเดอร์:

| โฟลเดอร์ | มีอะไร |
|---|---|
| `src/app/(influ)/` | ทุกหน้า (route) ของระบบ + component ที่วางคู่กับหน้า (colocated) — URL ไม่มี `(influ)` เพราะเป็น route group |
| `src/influ/` (ที่นี่) | ของกลางของระบบนี้ที่หน้าต่างๆ ใช้ร่วมกัน — `lib/` ค่าคงที่ / กติกาธุรกิจ / log / แจ้งเตือน, `components/` โครงหน้า (shell) กระดิ่ง ตัวกรอง ลายเซน, `public/` หน้าต่างที่ฝั่งอื่นใช้ได้ |

## กฎขอบเขต (บังคับด้วย ESLint — `npm run lint` แดงถ้าฝ่าฝืน)

1. **โค้ดนอกระบบ Influencer** (Team `(app)`, Wellness `(wellness)`, หน้าสาธารณะ, `src/components`, `src/lib`) **import จาก Influ ได้เฉพาะ `@/influ/public/*`**
   ห้าม import `@/influ/lib/*`, `@/influ/components/*`, `@/app/(influ)/*` ตรงๆ
2. **ระบบ Influencer ห้าม import โค้ดของ Team/Wellness** (`@/app/(app)/*`, `@/app/(wellness)/*`, `sidebar`, `notification-bell`, `wellness-*`)
   ของที่ใช้ร่วมกันจริงต้องอยู่ `src/lib` หรือ `src/components` (ui primitives, supabase client, สิทธิ์, format, upload)
3. ระบบ Influencer อ่าน/เขียนตารางของตัวเอง (`influ_*`, `influencers`, `doctors`) และอ่านตารางกลางได้ (`profiles`, `price_items`, `promo_packages`, `tasks` เฉพาะส่วนคอนเทนต์ที่ผูก influ)

## `public/` — สิ่งที่ฝั่ง Team พึ่งอยู่ (ทั้งหมดมีแค่นี้)

| ไฟล์ | ใครใช้ | ใช้ทำอะไร |
|---|---|---|
| `influ-tags.ts` (server) | `/tasks`, `/tag-management` | ดึงรายชื่อ influencer ที่ติดแท็กงานคอนเทนต์ได้ |
| `influ-tag-avatar.tsx` | `/tasks`, `/tag-management` | รูป influencer ในตัวเลือกแท็ก |
| `hashtag-chips.tsx` | `/tasks`, `/tag-management` | ชิปแฮชแท็กบังคับของเคส + ปุ่มคัดลอก |
| `constants.ts` | `/tasks`, `/tag-management` | ทีม product 9 ทีม + ตัวช่วยประกอบแฮชแท็ก |
| `doctor.ts` | `/tasks`, `/tag-management` | `DoctorAvatar` + `DoctorManagerPanel` (ทะเบียนหมอ) |

## แผนแยก repo (ยังไม่ทำ — รอตัดสินใจ)

เมื่อระบบ Influencer แยกไปเป็น repo ของตัวเอง:
- `src/app/(influ)/` + `src/influ/{lib,components}` ยกไปทั้งก้อน
- ของกลางที่ Influ ใช้จาก `src/lib` / `src/components` (ui, supabase, access, permissions, format, upload, use-signed-url, anchored-menu, logo, profile-settings, report-viz) คัดลอกไปเป็น core ของ repo ใหม่
- `src/influ/public/*` คือชุดที่ **ฝั่ง Team ต้องเก็บสำเนาไว้** (อ่านตาราง influ ผ่าน Supabase ตัวเดียวกัน)
- migration ของ DB มีชุดเดียว (`supabase/migrations/`) เพราะใช้ Supabase ร่วมกัน
