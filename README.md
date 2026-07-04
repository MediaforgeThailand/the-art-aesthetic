# The ART Aesthetic

ระบบจัดการหลังบ้านสำหรับแผนก Aesthetic — จัดการงาน เอกสาร และแดชบอร์ดยอดขาย
พร้อมนำเข้าข้อมูลยอดขายจากไฟล์ของทีม DA (CSV / Excel)

CI: โทน rose gold/copper ตามแบรนด์ The ART (โลโก้ typography อยู่ที่ `src/components/logo.tsx` —
ถ้าต้องการใช้ไฟล์ภาพโลโก้จริง วางที่ `public/logo.png` แล้วปรับ component ได้)

## Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 — deploy บน **Vercel** |
| Backend | **Supabase** (Postgres + Auth + Storage) |
| กราฟ | Recharts |
| อ่านไฟล์ DA | SheetJS (xlsx) + PapaParse (csv) |

## ฟีเจอร์

- **แดชบอร์ด** (`/dashboard`) — KPI ยอดขาย, กราฟรายเดือน, สัดส่วนตามหมวด, เทียบสาขา, Top 5 บริการ
- **งาน** (`/tasks`) — มอบหมายงาน สถานะ ความสำคัญ กำหนดส่ง ผู้รับผิดชอบ
- **เอกสาร** (`/documents`) — อัปโหลด/ดาวน์โหลดเอกสารแยกหมวดหมู่ (เก็บใน Supabase Storage)
- **นำเข้าข้อมูล** (`/import`) — อัปโหลดไฟล์ CSV/Excel จากทีม DA, จับคู่คอลัมน์อัตโนมัติ (รองรับหัวตารางไทย/อังกฤษ, วันที่ พ.ศ./ค.ศ./Excel serial), บันทึกประวัติการนำเข้า

## เริ่มต้นใช้งาน

```bash
npm install
npm run dev        # เปิด http://localhost:3000
```

> ถ้าเครื่องยังไม่มี Node.js ใน PATH: Node ติดตั้งไว้ที่ `C:\Users\User\nodejs\node-v24.18.0-win-x64` (ถูกเพิ่มใน PATH ของ user แล้ว — เปิด terminal ใหม่ก่อนใช้)

## ตั้งค่า Supabase (ทำครั้งเดียว)

1. สร้าง/เลือกโปรเจกต์ที่ [supabase.com/dashboard](https://supabase.com/dashboard)
2. รัน SQL ใน `supabase/migrations/0001_init.sql` (SQL Editor หรือ `supabase db push`)
   — สร้างตาราง `profiles, tasks, documents, data_imports, sales_records` + RLS + storage bucket `documents`
3. (ทางเลือก) รัน `supabase/seed.sql` เพื่อใส่ข้อมูลตัวอย่างทดสอบแดชบอร์ด
   ลบข้อมูลตัวอย่างภายหลัง: `delete from sales_records where note = 'demo'; delete from tasks where description = 'demo';`
4. คัดลอกค่าจาก Project Settings → API ลง `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

5. สมัครผู้ใช้คนแรกได้จากหน้า `/login` ของแอป (ระบบสร้างแถวใน `profiles` ให้อัตโนมัติ)

## Deploy บน Vercel

1. push ขึ้น GitHub แล้ว import ที่ [vercel.com/new](https://vercel.com/new) (หรือใช้ `vercel` CLI)
2. ตั้ง Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy — เสร็จแล้ว

## โครงสร้างโปรเจกต์

```
src/
  app/
    login/               # หน้าเข้าสู่ระบบ / สมัคร
    (app)/               # ส่วนที่ต้อง login (มี sidebar)
      dashboard/         # แดชบอร์ดยอดขาย
      tasks/             # จัดการงาน
      documents/         # คลังเอกสาร
      import/            # นำเข้าข้อมูลจากทีม DA
  components/            # UI กลาง (ui.tsx, sidebar, setup-notice)
  lib/
    supabase/            # client (browser) + server
    database.types.ts    # types ตรงกับ schema
    constants.ts         # label ไทย, หมวดหมู่, สถานะ
    format.ts            # เงินบาท / วันที่ไทย / ขนาดไฟล์
  proxy.ts               # refresh session + auth guard (Next 16 proxy)
supabase/
  migrations/0001_init.sql
  seed.sql
```
